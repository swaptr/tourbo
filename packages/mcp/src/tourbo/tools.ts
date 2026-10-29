// Tourbo domain tools: deterministic, Qloo-grounded, stateless (every call carries its inputs;
// the Qloo cache makes repeats cheap). No inference happens here; the caller's model decides.
import { z } from "zod";

import { critique } from "@tourbo/core/critic/critic.ts";
import { cityBrief } from "@tourbo/core/engine/brief.ts";
import { citiesNear, seedCities } from "@tourbo/core/engine/cities.ts";
import { defaultCapacity, estimateDemand, legCosts, median, optimise, REGION_DEFAULTS } from "@tourbo/core/engine/economics.ts";
import { ALL_REGIONS, findMarkets, resolveMarketSignal } from "@tourbo/core/engine/markets.ts";
import { openerCandidates, pickOpeners } from "@tourbo/core/engine/openers.ts";
import { buildPlan } from "@tourbo/core/engine/plan.ts";
import { assessOffer } from "@tourbo/core/engine/negotiate.ts";
import { ticketPace } from "@tourbo/core/engine/pace.ts";
import { allocatePromo } from "@tourbo/core/engine/promo.ts";
import { artistById, resolvePerformer, signalIds } from "@tourbo/core/engine/resolve.ts";
import { routeTour } from "@tourbo/core/engine/routing.ts";
import { scoreCities, shortlist } from "@tourbo/core/engine/score.ts";
import type { Emit } from "@tourbo/core/engine/trace.ts";
import { findVenues, roomType } from "@tourbo/core/engine/venues.ts";
import { accessFor } from "@tourbo/core/engine/access.ts";
import { actsForVenue } from "@tourbo/core/engine/reverse.ts";
import { locationQuery, Plan, Region, REGION_NAMES, type Artist, type City, type CityScore } from "@tourbo/core/shared/types.ts";

const kind = z.enum(["musician", "comedian"]).default("musician").describe("musician (Qloo artist) or comedian (Qloo person)");
const region = Region.describe(`Tour region: ${Region.options.map((r) => `${r} = ${REGION_NAMES[r]}`).join(", ")}`);
const actId = z.string().describe("Qloo entity id of the act, from tourbo_resolve_act");
const peerIds = z.array(z.string()).max(5).default([]).describe('Qloo ids of "sounds like" acts blended into the fan signal');
const cityName = z.string().describe("City name from the region's seed list (see tourbo_score_cities)");

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  readOnly?: boolean;
  run: (input: any, emit: Emit) => Promise<unknown>;
};

// JSON from other agents (and Qloo) uses null where our schemas use optional fields.
const dropNulls = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(dropNulls) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)])) : v;

const r1 = (n?: number) => (n === undefined ? undefined : Math.round(n * 100) / 100);

function findCity(regionId: Region, name: string): City {
  const cities = seedCities(regionId);
  const city = cities.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.query?.toLowerCase() === name.toLowerCase());
  if (!city) throw new Error(`Unknown city "${name}" in ${REGION_NAMES[regionId]}. Choose one of: ${cities.map((c) => c.name).join(", ")}`);
  return city;
}

async function act(id: string, peers: string[], k: Artist["kind"]): Promise<Artist> {
  const artist = await artistById(id, k);
  if (!artist) throw new Error(`No Qloo entity ${id}; call tourbo_resolve_act first.`);
  return { ...artist, kind: k, peers: peers.map((p) => ({ id: p, name: p })) };
}

const compactScore = (c: CityScore) => ({
  city: c.city.name,
  score: c.score,
  heatmapCells: c.cells,
  fanIndex: c.fanIndex,
  thinData: c.thinData,
  hotspots: c.hotspots.map((h) => ({ geohash: h.geohash, lat: h.lat, lon: h.lon, affinity: r1(h.affinity), popularity: r1(h.popularity) })),
});

export const TOURBO_TOOLS: ToolDef[] = [
  {
    name: "tourbo_resolve_act",
    title: "Resolve an act",
    description:
      "Look up a musician or comedian in Qloo and return its id, popularity and genres. Pass `peers` (comparable acts) for unknown or niche acts: their fans are blended into the signal. Call first.",
    input: z.object({
      name: z.string(),
      kind,
      peers: z.array(z.string()).max(5).default([]).describe("Comparable acts (\"sounds like\")"),
      not_in_qloo: z.boolean().default(false).describe("The act says the Qloo entity with this name isn't them: plan from peers only"),
    }),
    run: async ({ name, kind: k, peers, not_in_qloo }) => {
      const a = await resolvePerformer(name, k, peers, not_in_qloo);
      if (!a) return { found: false, hint: `No ${k} named "${name}" in Qloo. Retry with comparable acts in peers.` };
      return { found: true, unknown: a.unknown, id: a.id, name: a.name, kind: a.kind, popularity: r1(a.popularity), genres: a.tags.map((t) => t.name), peers: a.peers };
    },
  },
  {
    name: "tourbo_score_cities",
    title: "Score tour markets",
    description:
      "Score every seed city in a region (or near a point) from Qloo fan heatmaps (0–100 = 0.6 × fan footprint + 0.4 × over-indexing, relative to this set). Returns all cities with fan hotspots (geohash cells), fanIndex (relative demand for tourbo_show_economics) and a shortlist of shows × 1.5. Thin data = under 50 heatmap cells.",
    input: z.object({
      act_id: actId,
      peer_ids: peerIds,
      region,
      shows: z.number().int().min(1).max(20).default(6),
      near: z
        .object({ lat: z.number(), lon: z.number(), radius_km: z.number().min(50).max(5000) })
        .optional()
        .describe("Only score cities within radius_km of this point (topped up with the nearest if too few)"),
    }),
    run: async ({ act_id, peer_ids, region: rg, shows, near }, emit) => {
      const cities = near ? citiesNear({ lat: near.lat, lon: near.lon, radiusKm: near.radius_km }, Math.ceil(shows * 1.5)).cities : seedCities(rg);
      const scores = await scoreCities([act_id, ...peer_ids], cities, emit);
      const short = shortlist(scores, shows);
      return { region: rg, medianFanIndex: median(scores.map((s) => s.fanIndex ?? 0)), shortlist: short.map((c) => c.city.name), cities: scores.map(compactScore) };
    },
  },
  {
    name: "tourbo_find_markets",
    title: "Find markets where acts like you win",
    description:
      "Rank cities across regions by the fans of comparable acts and/or a genre or scene tag (e.g. acts=['Nusrat Fateh Ali Khan'] or genres=['qawwali']). Use for new or foreign acts deciding where to tour. Scores are relative within this call.",
    input: z.object({
      acts: z.array(z.string()).max(5).default([]),
      genres: z.array(z.string()).max(3).default([]).describe("Genre/scene names or urn:tag ids"),
      regions: z.array(Region).default([...ALL_REGIONS]),
      kind,
      limit: z.number().int().min(3).max(40).default(12),
    }),
    run: async ({ acts, genres, regions, kind: k, limit }, emit) => {
      const signal = await resolveMarketSignal({ acts, genres, kind: k });
      if (!signal.acts.length && !signal.tags.length) return { found: false, hint: "None of the acts or genres resolved in Qloo." };
      const markets = await findMarkets(signal, regions, emit);
      return {
        signal,
        markets: markets.slice(0, limit).map((m) => ({ ...compactScore(m), region: m.region, hotspots: undefined })),
        note: "Score = fan footprint + over-indexing of this signal, normalised across the cities in this call.",
      };
    },
  },
  {
    name: "tourbo_city_detail",
    title: "Venues, opener and local facts for one city",
    description:
      "For one city: venue candidates near the top fan hotspot (search widens 1.5 → 3 → 6 km → area → city when thin; each candidate has Qloo affinity, popularity, room type and how it was found), a local opener (a local favourite sharing the audience, else the similar act with the most local heatmap presence), and angle facts (fan taste, city culture, local spots).",
    input: z.object({ act_id: actId, peer_ids: peerIds, kind, region, city: cityName }),
    run: async ({ act_id, peer_ids, kind: k, region: rg, city }, emit) => {
      const artist = await act(act_id, peer_ids, k);
      const [score] = await scoreCities(signalIds(artist), [findCity(rg, city)], emit);
      const [venues, openers] = await Promise.all([
        findVenues(signalIds(artist), score, emit, k),
        // Openers are optional: some Qloo entities heatmap fine but reject similar-entity insights.
        openerCandidates(artist)
          .then((c) => pickOpeners(artist, c, [score], emit))
          .catch((error: Error) => {
            emit("repair", `Openers unavailable for ${score.city.name}: ${error.message.slice(0, 120)}`);
            return new Map() as Awaited<ReturnType<typeof pickOpeners>>;
          }),
      ]);
      return {
        city: score.city.name,
        heatmapCells: score.cells,
        fanIndex: score.fanIndex,
        thinData: score.thinData,
        hotspots: compactScore(score).hotspots,
        venues: venues.map((v) => ({
          id: v.id,
          name: v.name,
          roomType: roomType(v.tag),
          defaultCapacityEstimate: defaultCapacity(roomType(v.tag)),
          neighborhood: v.neighborhood,
          address: v.address,
          lat: v.lat,
          lon: v.lon,
          affinity: r1(v.affinity),
          popularity: r1(v.popularity),
          foundBy: v.foundBy,
          description: v.description?.slice(0, 200),
        })),
        opener: openers.get(score.city.name),
      };
    },
  },
  {
    name: "tourbo_openers",
    title: "Openers for a set of tour cities",
    description:
      "Pick an opener per city for the given tour cities: a local favourite that shares the headliner's audience wins; otherwise the similar, smaller act with the most local pull (heatmap cells here ÷ mean across these cities × log cells). Pass the whole shortlist so local pull is comparable.",
    input: z.object({ act_id: actId, peer_ids: peerIds, kind, region, cities: z.array(cityName).min(1).max(20) }),
    run: async ({ act_id, peer_ids, kind: k, region: rg, cities }, emit) => {
      const artist = await act(act_id, peer_ids, k);
      const scores = cities.map((name: string) => ({ city: findCity(rg, name), score: 0, cells: 0, hotspots: [], thinData: false }));
      const picks = await openerCandidates(artist).then((c) => pickOpeners(artist, c, scores, emit));
      return { openers: Object.fromEntries(picks) };
    },
  },
  {
    name: "tourbo_city_brief",
    title: "City brief for show prep",
    description:
      "Grounded material for set notes, banter, setlists and sponsor asks in one city: what the act's fans love, what the city loves (TV, brands, people, podcasts), the city's own music scene, local spots the fans like, city brands ranked by the fans (sponsor candidates) and concepts the fans over-index on. Every item carries its Qloo affinity/popularity; cite them, don't invent others. Qloo has no news: current local topics need a web search.",
    input: z.object({ act_id: actId, peer_ids: peerIds, kind, region, city: cityName }),
    run: async ({ act_id, peer_ids, kind: k, region: rg, city }) => {
      const c = findCity(rg, city);
      return cityBrief({ signal: [act_id, ...peer_ids], city: locationQuery(c), kind: k });
    },
  },
  {
    name: "tourbo_route",
    title: "Route a tour",
    description:
      "Order cities into a tour (nearest neighbour + 2-opt from the home base) and assign dates (≤500 km per drive day, flights over 1200 km, a day off every 4 shows). Returns stops with dates, legs in km and total km.",
    input: z.object({ region, cities: z.array(cityName).min(1).max(20), start_date: z.iso.date(), home_base: cityName.optional() }),
    run: async ({ region: rg, cities, start_date, home_base }) => {
      const picks = cities.map((name: string) => ({ city: findCity(rg, name), score: 0, cells: 0, hotspots: [], thinData: false }));
      const route = routeTour(picks, start_date, home_base ? findCity(rg, home_base) : undefined);
      return { stops: route.stops.map((s) => ({ date: s.date, city: s.city.city.name })), legs: route.legs, totalKm: route.totalKm };
    },
  },
  {
    name: "tourbo_show_economics",
    title: "Show economics (estimate)",
    description:
      "Estimate one show's money and pick the best deal: grid over deal (door split, guarantee, versus, free-entry bar deal) × ticket price × room. Draw = the act's typical draw (from room size, or calibrated from logged past shows) × √(city fanIndex ÷ tour median fanIndex). Returns tickets, sell-through, artist take, costs, profit, break-even price, a verdict (headline / co-headline / support slot / skip) and the formula used. All money is an ESTIMATE in the region's currency; Qloo has no capacity, price or sales data.",
    input: z.object({
      region,
      kind,
      city: z.string(),
      fan_index: z.number().nonnegative().describe("fanIndex of this city from tourbo_score_cities / tourbo_city_detail"),
      median_fan_index: z.number().positive().describe("medianFanIndex from tourbo_score_cities"),
      room_min: z.number().int().positive().default(200),
      room_max: z.number().int().positive().default(800),
      rooms: z.array(z.object({ name: z.string(), capacity: z.number().int().positive() })).max(6).default([]).describe("Candidate rooms with (estimated) capacity"),
      travel_km: z.number().nonnegative().default(0).describe("Leg into this city"),
      crew: z.number().int().min(1).max(20).default(3),
      opener: z.boolean().default(true),
      ticket_price: z.number().positive().optional().describe("Fix the price; omit to optimise"),
      promo: z.number().nonnegative().default(0),
      sponsor: z.number().nonnegative().default(0),
      min_guarantee: z.number().nonnegative().optional(),
      past_shows: z.array(z.object({ fanIndex: z.number(), attendance: z.number() })).default([]).describe("Logged shows of this act for calibration"),
    }),
    run: async (p) => {
      const demand = estimateDemand({ fanIndex: p.fan_index, medianFanIndex: p.median_fan_index, roomMin: p.room_min, roomMax: p.room_max, pastShows: p.past_shows });
      const rec = optimise({
        region: p.region,
        kind: p.kind,
        demand,
        rooms: p.rooms,
        costs: legCosts(p.travel_km, p.crew, p.opener),
        price: p.ticket_price,
        promo: p.promo,
        sponsor: p.sponsor,
        minGuarantee: p.min_guarantee,
      });
      return { city: p.city, ...rec, estimate: true, assumptions: { ...REGION_DEFAULTS[p.region as Region], elasticity: 1.1, ticketFees: 0.1 } };
    },
  },
  {
    name: "tourbo_assess_offer",
    title: "Assess a venue offer (negotiation)",
    description:
      "Given a venue's offer (deal, ticket price, capacity, guarantee, door split) and the planned show from tourbo_show_economics, decide accept / counter / walk_away against the act's walk-away limits, and compute a counter (versus deal with the guarantee that reaches 85% of planned profit, capped at what the room's door can pay). Deterministic; money is an ESTIMATE.",
    input: z.object({
      region,
      kind,
      draw: z.number().positive().describe("Estimated tickets at the reference price (draw from tourbo_show_economics)"),
      capacity: z.number().int().positive().describe("Planned room capacity"),
      price: z.number().positive().describe("Planned ticket price"),
      costs: z.number().nonnegative().describe("The act's costs for this show"),
      planned_profit: z.number(),
      planned_deal: z.string().default("door_split"),
      offer: z.object({
        deal: z.enum(["door_split", "guarantee", "versus", "bar_deal"]),
        price: z.number().positive().optional(),
        capacity: z.number().int().positive().optional(),
        guarantee: z.number().nonnegative().optional(),
        split: z.number().min(0).max(1).optional().describe("Artist share of net door, 0–1"),
      }),
      min_guarantee: z.number().nonnegative().optional(),
      min_door_split: z.number().min(0).max(1).optional(),
    }),
    run: async (p) =>
      assessOffer({
        region: p.region,
        kind: p.kind,
        draw: p.draw,
        capacity: p.capacity,
        price: p.price,
        costs: p.costs,
        plannedProfit: p.planned_profit,
        plannedDeal: p.planned_deal,
        offer: p.offer,
        limits: { minGuarantee: p.min_guarantee, minDoorSplit: p.min_door_split },
      }),
  },
  {
    name: "tourbo_ticket_pace",
    title: "Ticket pace check",
    description:
      "After booking: compare tickets sold so far with where a small show should be this many days out, project show-night sales and suggest actions (shift promo, lean on the opener, smaller room, raise price). Deterministic rule of thumb; say so.",
    input: z.object({
      expected_tickets: z.number().positive(),
      capacity: z.number().int().positive(),
      sold: z.number().int().nonnegative(),
      days_to_show: z.number().int().nonnegative(),
      promo_left: z.number().nonnegative().optional(),
      has_smaller_room: z.boolean().default(false),
      currency: z.string().optional(),
    }),
    run: async (p) =>
      ticketPace({
        expectedTickets: p.expected_tickets,
        capacity: p.capacity,
        sold: p.sold,
        daysToShow: p.days_to_show,
        promoLeft: p.promo_left,
        hasSmallerRoom: p.has_smaller_room,
        currency: p.currency,
      }),
  },
  {
    name: "tourbo_promo_plan",
    title: "Split a promo budget",
    description: "Split a tour promo budget across stops by expected unsold seats × demand, with geo-ad targets (fan hotspot cells, 1.5 km radius) per city.",
    input: z.object({
      budget: z.number().positive(),
      stops: z.array(
        z.object({
          city: z.string(),
          capacity: z.number().int().positive(),
          tickets: z.number().int().nonnegative(),
          relDemand: z.number().nonnegative(),
          hotspots: z.array(z.object({ geohash: z.string(), lat: z.number(), lon: z.number(), affinity: z.number().default(0), popularity: z.number().default(0) })).default([]),
        }),
      ),
    }),
    run: async ({ budget, stops }) => ({ allocations: allocatePromo(budget, stops) }),
  },
  {
    name: "tourbo_critique_plan",
    title: "Critique a plan",
    description:
      "Deterministic checks on a full plan (the Plan JSON from tourbo_plan_tour): venue + backup present, Qloo evidence grounded, thin-data cities, capacity fit, legs over 1500 km.",
    input: z.object({ plan: z.unknown() }),
    run: async ({ plan }) => {
      const p = Plan.parse(dropNulls(plan));
      const route = { stops: p.stops.map((s) => ({ city: { city: s.city, score: s.score, cells: 0, hotspots: s.hotspots, thinData: s.thinData }, date: s.date ?? "" })), legs: p.legs, totalKm: p.totalKm };
      return { issues: critique(p.stops, route, p.params) };
    },
  },
  {
    name: "tourbo_venue_access",
    title: "Venue access (transit, stations, airport)",
    description:
      "How easy a venue is to reach: public-transport stops within 800 m, nearest rail/metro station and airport with distances, and parking nearby (OpenStreetMap). Use to choose between similar rooms and to estimate the act's travel.",
    input: z.object({ lat: z.number(), lon: z.number(), name: z.string().optional() }),
    run: async ({ lat, lon, name }) => ({ venue: name, ...(await accessFor(lat, lon)) }),
  },
  {
    name: "tourbo_acts_for_venue",
    title: "Acts for a venue (promoter mode)",
    description:
      "Reverse mode for venues, bars and promoters: given a room and its city, which musicians (or comedians) does this room's crowd like, smaller than headliners, with local heatmap presence.",
    input: z.object({ venue: z.string(), city: z.string(), kind, limit: z.number().int().min(3).max(20).default(10) }),
    run: async ({ venue, city, kind: k, limit }, emit) => actsForVenue({ venue, city, kind: k, limit }, emit),
  },
  {
    name: "tourbo_plan_tour",
    title: "Plan a whole tour (deterministic)",
    description:
      "One call: resolve the act, score the region, pick the top cities, route them, and find venues (+ backup), openers and local facts per stop, plus a show-economics estimate per stop. Deterministic (no LLM): your model should then review venues, write copy and decide. Takes 10–40 s.",
    input: z.object({
      artist: z.string(),
      kind,
      peers: z.array(z.string()).max(5).default([]),
      region,
      shows: z.number().int().min(2).max(12).default(6),
      start_date: z.iso.date(),
      home_base: z.string().optional(),
      room_min: z.number().int().positive().default(200),
      room_max: z.number().int().positive().default(800),
    }),
    run: async (p, emit) => {
      const plan = await buildPlan(
        { artist: p.artist, kind: p.kind, peers: p.peers, region: p.region, shows: p.shows, startDate: p.start_date, homeBase: p.home_base, roomMin: p.room_min, roomMax: p.room_max, money: {}, jobs: [], notInQloo: false },
        emit,
      );
      const med = median(plan.stops.map((s) => s.fanIndex ?? 0));
      return {
        ...plan,
        stops: plan.stops.map((s, i) => {
          const demand = estimateDemand({ fanIndex: s.fanIndex ?? 0, medianFanIndex: med, roomMin: p.room_min, roomMax: p.room_max });
          const rooms = [s.venue, s.backupVenue].filter((v) => !!v).map((v) => ({ name: v!.name, capacity: defaultCapacity(roomType(v!.tag)) }));
          const money = optimise({ region: p.region, kind: p.kind, demand, rooms, costs: legCosts(plan.legs[i - 1]?.km ?? 0, 3, !!s.opener) });
          return { ...s, money: { verdict: money.verdict, why: money.why, currency: money.currency, best: money.best } };
        }),
      };
    },
  },
];
