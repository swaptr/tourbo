import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { findCity } from "@tourbo/core/engine/cities.ts";
import type { Recommendation } from "@tourbo/core/engine/economics.ts";
import type { Emit } from "@tourbo/core/engine/trace.ts";
import { placeNotes, priceAdjust, staticPlace, toPlaceNotes } from "@tourbo/core/places/hooks.server.ts";
import {
  type Access,
  type AngleFacts,
  type Artist,
  type City,
  type CityPlan,
  type Hotspot,
  type Leg,
  type Opener,
  type Plan,
  type Reference,
  type ShowMoney,
  type TourParams,
  type Venue,
} from "@tourbo/core/shared/types.ts";

import type { McpSession } from "../mcp.server.ts";
import { planCityWithWorker, type WorkerResult } from "./worker.ts";
import { friendlyError, logError } from "./errors.ts";

const MAX_CRITIQUES = 2;

// All Qloo data and calculations come from the Tourbo MCP server (in-process client); this
// layer holds the run state and the judgment (worker picks, deals, verdicts, critique).
type ScoreRow = { city: string; score: number; heatmapCells: number; fanIndex?: number; thinData: boolean; hotspots: Hotspot[] };
type DetailVenue = { id: string; name: string; roomType: string; defaultCapacityEstimate: number; neighborhood?: string; address?: string; lat?: number; lon?: number; affinity?: number; popularity?: number; foundBy: string; description?: string };
type Brief = { fanTaste: Reference[]; cityCulture: Reference[]; localArtists: Reference[]; localSpots: Reference[]; sponsors: Reference[] };

export type RunContext = {
  params: TourParams;
  emit: Emit;
  mcp: McpSession;
  pastShows: { fanIndex: number; attendance: number }[];
  artist?: Artist & { unknown?: boolean };
  scores?: Map<string, ScoreRow>;
  shortlist?: string[];
  medianFanIndex?: number;
  openers?: Promise<Record<string, Opener>>;
  cities: Map<string, CityPlan>;
  legs?: Leg[];
  totalKm?: number;
  dates?: Map<string, string>;
  critiques: number;
  promoDone?: boolean;
  plan?: Plan;
  // Per-city worker picks already made for this run (resume reuses them instead of re-asking).
  workers?: { get(city: string): WorkerResult | undefined; put(city: string, result: WorkerResult): void };
  // Keeps what the run found (scored cities, room candidates, openers) so the act can swap nights
  // later without new fan-data calls (PLAN Q19, run_steps "pool" / "pool_venues").
  keep?: (step: "pool" | "pool_venues", key: string, value: unknown) => void;
};

export function createContext(params: TourParams, emit: Emit, mcp: McpSession, pastShows: RunContext["pastShows"] = []): RunContext {
  return { params, emit, mcp, pastShows, cities: new Map(), critiques: 0 };
}

const cityOf = (region: TourParams["region"], name: string): City | undefined => findCity(region, name);

const num = (n?: number | null) => (typeof n === "number" ? n : undefined);
const toVenue = (v: DetailVenue): Venue => ({
  id: v.id,
  name: v.name,
  address: v.address ?? undefined,
  lat: num(v.lat),
  lon: num(v.lon),
  popularity: num(v.popularity),
  affinity: num(v.affinity),
  tag: `urn:tag:category:place:${v.roomType.replace(/ \/ .*/, "").replace(/ /g, "_")}`,
  neighborhood: v.neighborhood ?? undefined,
  description: v.description ?? undefined,
  foundBy: v.foundBy,
});

export function toMoney(rec: Recommendation & { best: Recommendation["best"] & { room?: string } }, reason?: string): ShowMoney {
  const b = rec.best;
  return {
    verdict: rec.verdict,
    why: rec.why,
    currency: rec.currency,
    deal: b.scenario.deal,
    price: b.scenario.price,
    capacity: b.scenario.capacity,
    room: b.room,
    guarantee: b.scenario.guarantee,
    tickets: b.tickets,
    sellThrough: b.sellThrough,
    gross: b.gross,
    artistTake: b.artistTake,
    costs: b.costs,
    profit: b.profit,
    breakEvenPrice: b.breakEvenPrice,
    promo: b.scenario.promo,
    sponsor: b.scenario.sponsor,
    relDemand: rec.demand.relDemand,
    draw: rec.demand.draw,
    basis: rec.demand.basis,
    reason,
    ...(rec.priceNudge ? { priceNudge: rec.priceNudge } : {}),
    estimate: true,
  };
}

const fmtMoney = (m: ShowMoney) =>
  `${m.verdict}: ${m.deal.replace("_", " ")} at ${m.currency} ${m.price}, ${m.tickets}/${m.capacity} tickets, profit ${m.currency} ${m.profit}`;

export function createTools(ctx: RunContext) {
  const { emit, params } = ctx;
  const money = params.money ?? {};
  const kind = params.kind ?? "musician";
  const traced = <T>(name: string, input: unknown, fn: () => Promise<T>) => {
    emit("tool_call", name, { input });
    return fn();
  };
  const actArgs = () => ({ act_id: ctx.artist!.id, peer_ids: ctx.artist!.peers.map((p) => p.id), kind, region: params.region });

  // One economics call per stop; overrides let the agent explore alternatives.
  const economics = (stop: CityPlan, opts: { rooms?: { name: string; capacity: number }[]; price?: number; travelKm?: number; promo?: number; sponsor?: number } = {}) => {
    const rooms =
      opts.rooms ??
      [stop.venue, stop.backupVenue]
        .filter((v): v is Venue => !!v)
        .map((v, i) => ({ name: v.name, capacity: i === 0 && stop.capacity ? Math.round((stop.capacity.min + stop.capacity.max) / 2) : estimateCapacity(v) }));
    // Place features (open data): a surfaced price nudge moves the reference ticket for this city.
    const adj = priceAdjust(stop.place);
    return ctx.mcp.call<Recommendation & { best: Recommendation["best"] & { room?: string } }>("tourbo_show_economics", {
      region: params.region,
      kind,
      city: stop.city.name,
      fan_index: stop.fanIndex ?? 0,
      median_fan_index: Math.max(ctx.medianFanIndex ?? 1, 0.1),
      room_min: params.roomMin,
      room_max: params.roomMax,
      rooms,
      travel_km: opts.travelKm ?? legInto(stop.city.name),
      crew: money.crew ?? 3,
      opener: !!stop.opener,
      ticket_price: opts.price ?? money.ticketPrice,
      promo: opts.promo ?? stop.promo?.spend ?? 0,
      sponsor: opts.sponsor ?? 0,
      min_guarantee: money.minGuarantee,
      past_shows: ctx.pastShows,
      ...(adj.priceFactor !== undefined ? { price_factor: adj.priceFactor, elasticity: adj.elasticity } : {}),
    });
  };
  const legInto = (city: string) => ctx.legs?.find((l) => l.to === city)?.km ?? 0;

  const resolve_act = betaZodTool({
    name: "resolve_act",
    description: "Look up the act (musician or comedian) in Qloo, with any \"sounds like\" peers blended into the fan signal. Call first.",
    inputSchema: z.object({}),
    run: (input) =>
      traced("resolve_act", input, async () => {
        const a = await ctx.mcp.call<{ found: boolean; unknown?: boolean; id: string; name: string; kind: Artist["kind"]; popularity?: number; genres: string[]; peers: { id: string; name: string }[]; hint?: string }>(
          "tourbo_resolve_act",
          { name: params.artist, kind, peers: params.peers ?? [], not_in_qloo: params.notInQloo ?? false },
        );
        if (!a.found) return a.hint ?? `No act found for "${params.artist}".`;
        ctx.artist = { id: a.id, name: a.name, kind: a.kind, popularity: a.popularity, tags: a.genres.map((g) => ({ id: g, name: g })), peers: a.peers, unknown: a.unknown };
        emit("decision", `Resolved ${a.name}${a.unknown ? " (not in Qloo; planning from peers)" : ""}${a.peers.length ? `, blended with ${a.peers.map((p) => p.name).join(", ")}` : ""}`, { id: a.id, peers: a.peers });
        return JSON.stringify({ name: a.name, kind: a.kind, popularity: a.popularity, genres: a.genres, peers: a.peers.map((p) => p.name), unknownAct: a.unknown });
      }),
  });

  const score_cities = betaZodTool({
    name: "score_cities",
    description:
      "Score every seed city in the tour region from Qloo fan heatmaps (0–100: fan footprint + over-indexing). Returns a shortlist of shows × 1.5 cities; thin = under 50 heatmap cells.",
    inputSchema: z.object({}),
    run: (input) =>
      traced("score_cities", input, async () => {
        if (!ctx.artist) return "Call resolve_act first.";
        const res = await ctx.mcp.call<{ medianFanIndex: number; shortlist: string[]; cities: ScoreRow[] }>("tourbo_score_cities", {
          ...actArgs(),
          shows: params.shows,
          detail: true, // hotspots for every city: the map shows the whole pool
          ...(params.area && { near: { lat: params.area.lat, lon: params.area.lon, radius_km: params.area.radiusKm } }),
        });
        ctx.scores = new Map(res.cities.map((c) => [c.city, c]));
        ctx.shortlist = res.shortlist;
        ctx.medianFanIndex = res.medianFanIndex;
        ctx.keep?.("pool", "cities", { medianFanIndex: res.medianFanIndex, cities: res.cities });
        emit("decision", `Shortlist: ${res.shortlist.map((c) => `${c} ${ctx.scores!.get(c)?.score}`).join(", ")}`, {
          scores: Object.fromEntries(res.cities.map((c) => [c.city, c.score])),
        });
        ctx.openers = ctx.mcp
          .call<{ openers: Record<string, Opener> }>("tourbo_openers", { ...actArgs(), cities: res.shortlist })
          .then((r) => {
            ctx.keep?.("pool", "openers", { openers: r.openers });
            return r.openers;
          })
          .catch((error: Error) => {
            logError("openers", error);
            emit("repair", `Openers failed: ${friendlyError(error)}`);
            return {};
          });
        return JSON.stringify(res.shortlist.map((c) => {
          const s = ctx.scores!.get(c)!;
          return { city: c, score: s.score, heatmapCells: s.heatmapCells, relDemand: Math.round(((s.fanIndex ?? 0) / Math.max(res.medianFanIndex, 0.1)) * 100) / 100, thin: s.thinData };
        }));
      }),
  });

  const plan_city = betaZodTool({
    name: "plan_city",
    description:
      "Plan one shortlisted city: venues near the top fan hotspot (search widens when thin), local opener, city brief (culture, scene, sponsors), a worker's venue + backup pick with capacity estimate and promo angle, and a show-economics estimate (deal, price, profit, verdict). Call for several cities in parallel.",
    inputSchema: z.object({ city: z.string() }),
    run: (input) =>
      traced("plan_city", input, async () => {
        const row = ctx.scores?.get(ctx.shortlist?.find((c) => c.toLowerCase() === input.city.toLowerCase()) ?? "");
        const city = row && cityOf(params.region, row.city);
        if (!ctx.artist || !row || !city) return `"${input.city}" is not on the shortlist. Call score_cities first and use its city names.`;
        const artist = ctx.artist;
        const [detail, brief, openers] = await Promise.all([
          ctx.mcp.call<{ venues: DetailVenue[]; fanIndex?: number }>("tourbo_city_detail", { ...actArgs(), city: row.city, detail: true }),
          ctx.mcp.call<Brief>("tourbo_city_brief", { ...actArgs(), city: row.city }),
          ctx.openers!,
        ]);
        const venues = detail.venues.map(toVenue);
        ctx.keep?.("pool_venues", row.city, detail.venues);
        const facts: AngleFacts = { fanTaste: brief.fanTaste, cityCulture: brief.cityCulture, localSpots: brief.localSpots };
        const opener = openers[row.city];
        const reused = ctx.workers?.get(row.city);
        if (reused) emit("decision", `${row.city}: reusing the venue pick from before`, { city: row.city, reused: true });
        const worker =
          reused ??
          (await planCityWithWorker(
            { artist, city: row.city, roomMin: params.roomMin, roomMax: params.roomMax, heatmapCells: row.heatmapCells, venues, facts, opener, sponsors: brief.sponsors, localArtists: brief.localArtists },
            emit,
          ));
        if (!reused && worker.fit) ctx.workers?.put(row.city, worker);
        const plan: CityPlan = {
          city,
          score: row.score,
          fanIndex: row.fanIndex,
          hotspots: row.hotspots,
          venue: worker.venue,
          backupVenue: worker.backupVenue,
          opener,
          facts,
          angle: worker.angle,
          capacity: worker.capacity,
          fit: worker.fit,
          evidence: worker.evidence,
          thinData: row.thinData,
          sponsors: brief.sponsors,
          localArtists: brief.localArtists,
        };
        const place = await staticPlace(city, { kind });
        if (place) plan.place = toPlaceNotes(place);
        const rec = await economics(plan).catch((error: Error) => {
          logError("economics", error);
          emit("repair", `${row.city}: economics failed (${friendlyError(error)})`);
          return undefined;
        });
        if (rec) plan.money = toMoney(rec);
        ctx.cities.set(row.city, plan);
        if (plan.money) emit("decision", `${row.city}: ${fmtMoney(plan.money)} (estimate)`, { city: row.city, verdict: plan.money.verdict, profit: plan.money.profit });
        return JSON.stringify({
          city: row.city,
          venue: worker.venue?.name,
          backup: worker.backupVenue?.name,
          capacityEstimate: worker.capacity && `${worker.capacity.min}–${worker.capacity.max}`,
          opener: opener && `${opener.name} (${opener.source === "local" ? "local favourite" : "similar act"}, ${opener.localCells} local cells)`,
          angle: worker.angle,
          money: plan.money && { verdict: plan.money.verdict, deal: plan.money.deal, price: plan.money.price, tickets: plan.money.tickets, capacity: plan.money.capacity, profit: plan.money.profit, currency: plan.money.currency, why: plan.money.why, priceNudge: plan.money.priceNudge?.note },
          place: plan.place && Object.values(plan.place.changes).length ? Object.values(plan.place.changes) : undefined,
          sponsors: brief.sponsors.slice(0, 3).map((s) => s.name),
          thin: row.thinData,
        });
      }),
  });

  const evaluate_show = betaZodTool({
    name: "evaluate_show",
    description:
      "Explore money alternatives for a planned city without changing the plan: a different room capacity, a fixed ticket price, or sponsor cash. Returns the best deal plus alternatives (all estimates). Use it to rescue loss-making stops before dropping them.",
    inputSchema: z.object({
      city: z.string(),
      capacity: z.number().int().positive().optional().describe("try a room of this size instead"),
      ticket_price: z.number().positive().optional(),
      sponsor: z.number().nonnegative().optional(),
    }),
    run: (input) =>
      traced("evaluate_show", input, async () => {
        const stop = ctx.cities.get(input.city);
        if (!stop) return `Plan ${input.city} first.`;
        const rec = await economics(stop, {
          rooms: input.capacity ? [{ name: `room of ${input.capacity}`, capacity: input.capacity }] : undefined,
          price: input.ticket_price,
          sponsor: input.sponsor,
        });
        const brief = (o: Recommendation["best"] & { room?: string }) => ({ deal: o.scenario.deal, price: o.scenario.price, room: o.room, capacity: o.scenario.capacity, tickets: o.tickets, profit: o.profit, sellThrough: o.sellThrough });
        return JSON.stringify({ verdict: rec.verdict, why: rec.why, currency: rec.currency, best: brief(rec.best), alternatives: rec.alternatives.map(brief) });
      }),
  });

  const set_show = betaZodTool({
    name: "set_show",
    description:
      "Commit a money decision for a planned city: keep it as headline, downgrade to co-headline or support slot, or skip it (then route without it). Optionally fix a room capacity or ticket price. Record why.",
    inputSchema: z.object({
      city: z.string(),
      verdict: z.enum(["headline", "co-headline", "support slot", "skip"]),
      capacity: z.number().int().positive().optional(),
      ticket_price: z.number().positive().optional(),
      reason: z.string(),
    }),
    run: (input) =>
      traced("set_show", input, async () => {
        const stop = ctx.cities.get(input.city);
        if (!stop) return `Plan ${input.city} first.`;
        const rec = await economics(stop, {
          rooms: input.capacity ? [{ name: stop.venue?.name ?? "room", capacity: input.capacity }] : undefined,
          price: input.ticket_price,
        });
        stop.money = { ...toMoney(rec, input.reason), verdict: input.verdict };
        emit("decision", `${input.city}: set to ${input.verdict} (${input.reason})`, { city: input.city, verdict: input.verdict });
        return JSON.stringify({ city: input.city, verdict: input.verdict, profit: stop.money.profit, currency: stop.money.currency });
      }),
  });

  const route_tour = betaZodTool({
    name: "route_tour",
    description:
      "Order the chosen planned cities into a tour (nearest neighbour + 2-opt from the home base) and assign dates; then re-costs every show with its real travel leg and reports the tour P&L. Pass exactly `shows` city names that have been planned (leave out skipped cities).",
    inputSchema: z.object({ cities: z.array(z.string()) }),
    run: (input) =>
      traced("route_tour", input, async () => {
        const missing = input.cities.filter((c) => !ctx.cities.has(c));
        if (missing.length) return `Plan these cities first: ${missing.join(", ")}.`;
        const home = params.homeBase && cityOf(params.region, params.homeBase) ? params.homeBase : undefined;
        const route = await ctx.mcp.call<{ stops: { date: string; city: string }[]; legs: Leg[]; totalKm: number }>("tourbo_route", {
          region: params.region,
          cities: input.cities,
          start_date: params.startDate,
          kind,
          ...(home ? { home_base: home } : {}),
        });
        ctx.legs = route.legs;
        ctx.totalKm = route.totalKm;
        ctx.dates = new Map(route.stops.map((s) => [s.city, s.date]));
        // Place features on the show dates (holidays, usual weather; short timeouts, never throws).
        await Promise.all(
          route.stops.map(async ({ city, date }) => {
            const stop = ctx.cities.get(city)!;
            const notes = await placeNotes(stop.city, [date], { kind });
            if (notes) stop.place = notes;
          }),
        );
        // Re-cost with real legs, keeping the agent's verdicts and fixed choices.
        await Promise.all(
          route.stops.map(async ({ city }) => {
            const stop = ctx.cities.get(city)!;
            const prev = stop.money;
            const rec = await economics(stop, prev ? { rooms: [{ name: prev.room ?? stop.venue?.name ?? "room", capacity: prev.capacity }], price: money.ticketPrice ?? (prev.reason ? prev.price : undefined) } : {});
            stop.money = { ...toMoney(rec, prev?.reason), verdict: prev?.reason ? prev.verdict : rec.verdict };
          }),
        );
        const pnl = tourPnl(route.stops.map((s) => ctx.cities.get(s.city)!));
        emit("decision", `Routed ${route.stops.length} stops, ${route.totalKm} km; tour profit ${pnl.currency} ${pnl.profit} (estimate)`, { ...pnl });
        return JSON.stringify({
          stops: route.stops.map((s) => {
            const m = ctx.cities.get(s.city)!.money;
            return `${s.date} ${s.city}${m ? ` — ${m.verdict}, profit ${m.currency} ${m.profit}` : ""}`;
          }),
          legs: route.legs.map((l) => `${l.from} → ${l.to} ${l.km} km`),
          totalKm: route.totalKm,
          tourProfit: `${pnl.currency} ${pnl.profit}`,
        });
      }),
  });

  const plan_promo = betaZodTool({
    name: "plan_promo",
    description: `Split the tour promo budget (${money.promoBudget ? `${money.promoBudget} set by the act` : "none set; pass one"}) across routed stops by expected unsold seats × demand, target the fan-hotspot neighbourhoods, and re-cost each show with its spend.`,
    inputSchema: z.object({ budget: z.number().positive().optional() }),
    run: (input) =>
      traced("plan_promo", input, async () => {
        const budget = input.budget ?? money.promoBudget;
        if (!budget) return "No promo budget set; skip this step.";
        if (!ctx.dates) return "Route the tour first.";
        const stops = [...ctx.dates.keys()].map((c) => ctx.cities.get(c)!);
        const res = await ctx.mcp.call<{ allocations: { city: string; spend: number; targets: { geohash: string; lat: number; lon: number; radiusKm: number }[]; why: string }[] }>("tourbo_promo_plan", {
          budget,
          stops: stops.map((s) => ({ city: s.city.name, capacity: s.money?.capacity ?? 300, tickets: s.money?.tickets ?? 0, relDemand: s.money?.relDemand ?? 1, hotspots: s.hotspots })),
        });
        await Promise.all(
          res.allocations.map(async (a) => {
            const stop = ctx.cities.get(a.city)!;
            stop.promo = { spend: a.spend, targets: a.targets, why: a.why };
            const prev = stop.money;
            if (!prev) return;
            const rec = await economics(stop, { rooms: [{ name: prev.room ?? "room", capacity: prev.capacity }], promo: a.spend });
            stop.money = { ...toMoney(rec, prev.reason), verdict: prev.reason ? prev.verdict : rec.verdict };
          }),
        );
        ctx.promoDone = true;
        emit("decision", `Promo: ${res.allocations.map((a) => `${a.city} ${a.spend}`).join(", ")}`, { allocations: res.allocations.map((a) => ({ city: a.city, spend: a.spend })) });
        return JSON.stringify(res.allocations.map((a) => ({ city: a.city, spend: a.spend, why: a.why, profitAfter: ctx.cities.get(a.city)?.money?.profit })));
      }),
  });

  const critique_plan = betaZodTool({
    name: "critique_plan",
    description: `Check the routed plan: venues and backups present, Qloo evidence grounded, thin-data cities, capacity fit, money (loss-making headline shows, skipped cities still routed), long legs. Call before finalize_plan; at most ${MAX_CRITIQUES} times.`,
    inputSchema: z.object({}),
    run: (input) =>
      traced("critique_plan", input, async () => {
        if (ctx.critiques >= MAX_CRITIQUES) return "Critique budget used. Finalize with the best plan you have.";
        if (!ctx.artist || !ctx.dates) return "Route the tour first.";
        ctx.critiques++;
        const { issues } = await ctx.mcp.call<{ issues: { city?: string; kind: string; detail: string }[] }>("tourbo_critique_plan", { plan: assemble(ctx, "draft") });
        emit("critic", issues.length ? `${issues.length} issues` : "No issues", { issues });
        return issues.length ? JSON.stringify(issues) : "No issues. Finalize.";
      }),
  });

  const finalize_plan = betaZodTool({
    name: "finalize_plan",
    description: "Save the routed plan as the final tour. Call once, last.",
    inputSchema: z.object({ summary: z.string().describe("two or three sentences for the user, incl. the money picture") }),
    run: (input) =>
      traced("finalize_plan", input, async () => {
        if (!ctx.artist || !ctx.dates) return "Route the tour first.";
        // Venue access (OpenStreetMap) for the chosen rooms; best-effort, never blocks.
        await Promise.all(
          [...ctx.dates.keys()].map(async (c) => {
            const stop = ctx.cities.get(c)!;
            if (stop.venue?.lat === undefined || stop.venue.lon === undefined) return;
            stop.access = await ctx.mcp
              .call<Access>("tourbo_venue_access", { lat: stop.venue.lat, lon: stop.venue.lon, name: stop.venue.name })
              .catch(() => undefined);
          }),
        );
        ctx.plan = assemble(ctx, input.summary);
        emit("decision", input.summary);
        return "Saved.";
      }),
  });

  return [resolve_act, score_cities, plan_city, evaluate_show, set_show, route_tour, plan_promo, critique_plan, finalize_plan];
}

// Rough capacity for a backup room by type (the worker only estimates the chosen one).
function estimateCapacity(v: Venue) {
  if (v.tag.includes("bar")) return 120;
  if (v.tag.includes("comedy")) return 200;
  if (v.tag.includes("night_club")) return 400;
  if (v.tag.includes("concert_hall") || v.tag.includes("hall")) return 1200;
  return 500;
}

export function tourPnl(stops: CityPlan[]) {
  const played = stops.filter((s) => s.money && s.money.verdict !== "skip");
  const sum = (k: "gross" | "artistTake" | "costs" | "profit") => played.reduce((a, s) => a + (s.money?.[k] ?? 0), 0);
  return { currency: played[0]?.money?.currency ?? "", gross: sum("gross"), artistTake: sum("artistTake"), costs: sum("costs"), profit: sum("profit") };
}

function assemble(ctx: RunContext, summary: string): Plan {
  const order = [...(ctx.dates?.keys() ?? [])];
  const stops = order.map((c) => ({ ...ctx.cities.get(c)!, date: ctx.dates!.get(c) }));
  const pnl = tourPnl(stops);
  return {
    artist: ctx.artist!,
    params: ctx.params,
    stops,
    legs: ctx.legs ?? [],
    totalKm: ctx.totalKm ?? 0,
    summary,
    money: { ...pnl, promoBudget: ctx.params.money?.promoBudget },
    medianFanIndex: ctx.medianFanIndex,
  };
}

