import { discipline, spaceLabel } from "../disciplines/index.ts";
import type { City, CityPlan, Hotspot, Leg, Opener, Plan, Region, ShowMoney, TraceEvent, Venue } from "../shared/types.ts";
import { defaultCapacity, legCosts, optimise, type Demand, type Recommendation } from "./economics.ts";
import type { PlanEdit } from "./proposals.ts";
import { haversineKm } from "./routing.ts";

// "Your plan, your call" (PLAN §18 Q19). Pure and client-safe: the act's edits (swap a city or a
// room, move a date, drop / add / reorder nights, tune levers) are replayed on top of Tourbo's plan
// with the same money and routing models, using only what the run already found (its candidate
// pool: scored cities in the circle and their room candidates). No fan-data calls, no AI.

// ---------- Candidate pool (what the run already found) ----------

export type PoolVenue = {
  id: string;
  name: string;
  roomType: string;
  capacity: number; // estimate
  lat?: number;
  lon?: number;
  neighborhood?: string;
  address?: string;
  affinity?: number;
  popularity?: number;
  foundBy?: string;
};

export type PoolCity = {
  name: string;
  lat: number;
  lon: number;
  region?: Region;
  query?: string;
  score: number; // 0–100 fan strength, same scale as the plan's stops
  cells?: number;
  fanIndex: number;
  fanIndexEstimated?: boolean; // only the heatmap cell count was kept; fanIndex scaled from it
  thinData: boolean;
  hotspots: Hotspot[];
  venues: PoolVenue[];
  opener?: Opener;
};

export type Pool = { medianFanIndex: number; cities: PoolCity[]; source: "run" | "trace" };

const norm = (s: string) => s.toLowerCase().split(",")[0].normalize("NFKD").replace(/[^a-z0-9]/g, "");
const r0 = Math.round;

// Stable night identity: city + room. Show notes, venue emails and check-ins are keyed by it, so an
// edit only invalidates the nights it changes.
export const stopKey = (s: Pick<CityPlan, "city" | "venue">) => `${norm(s.city.name)}~${s.venue?.id ?? ""}`;
export const sameCity = (a: string, b: string) => norm(a) === norm(b);

export const roomTypeOf = (v: Pick<Venue, "tag">) => spaceLabel(v.tag);
const tagOf = (roomType: string) => `urn:tag:category:place:${roomType.replace(/ \/ .*/, "").replace(/ /g, "_")}`;
export const toVenue = (v: PoolVenue): Venue => ({
  id: v.id,
  name: v.name,
  address: v.address,
  lat: v.lat,
  lon: v.lon,
  popularity: v.popularity,
  affinity: v.affinity,
  tag: tagOf(v.roomType),
  neighborhood: v.neighborhood,
  foundBy: v.foundBy ?? "run",
});
const capacityOf = (stop: CityPlan, v: Venue) =>
  stop.venue?.id === v.id && stop.capacity ? r0((stop.capacity.min + stop.capacity.max) / 2) : stop.money && stop.venue?.id === v.id ? stop.money.capacity : defaultCapacity(roomTypeOf(v));
const fromVenue = (stop: CityPlan, v: Venue): PoolVenue => ({
  id: v.id,
  name: v.name,
  roomType: roomTypeOf(v),
  capacity: capacityOf(stop, v),
  lat: v.lat,
  lon: v.lon,
  neighborhood: v.neighborhood,
  address: v.address,
  affinity: v.affinity,
  popularity: v.popularity,
  foundBy: v.foundBy,
});

// Raw rows a run saves while it plans (score_cities + city_detail outputs), merged with the plan.
export type PoolRows = {
  medianFanIndex?: number;
  cities?: { city: string; lat?: number; lon?: number; score: number; heatmapCells?: number; fanIndex?: number; thinData?: boolean; hotspots?: Hotspot[] }[];
  venues?: Record<string, { id: string; name: string; roomType: string; defaultCapacityEstimate?: number; lat?: number; lon?: number; neighborhood?: string; address?: string; affinity?: number; popularity?: number; foundBy?: string }[]>;
  openers?: Record<string, Opener>;
};

// Builds the pool from saved rows when the run kept them, else from the trace alone (scores and
// heatmap cell counts per city; rooms only for the planned nights). `locate` finds a city's
// coordinates by name (engine/cities.ts findCity), injected so this file stays client-safe.
export function buildPool(plan: Plan, events: TraceEvent[], rows: PoolRows = {}, locate: (name: string) => City | undefined = () => undefined): Pool {
  const scores = new Map<string, number>();
  const cells = new Map<string, number>();
  const fan = new Map<string, number>();
  const openers = new Map<string, Opener>();
  let median = rows.medianFanIndex || plan.medianFanIndex;
  for (const e of events) {
    const d = e.data;
    if (!d) continue;
    if (d.scores && typeof d.scores === "object") for (const [c, v] of Object.entries(d.scores)) scores.set(c, Number(v));
    if (e.kind === "qloo_call" && typeof d.city === "string" && typeof d.cells === "number") cells.set(d.city, d.cells);
    const input = d.input as Record<string, unknown> | undefined;
    if (input && typeof input.city === "string" && typeof input.fan_index === "number") {
      fan.set(input.city, input.fan_index);
      if (typeof input.median_fan_index === "number") median ??= input.median_fan_index;
    }
    if (e.kind === "decision" && typeof d.city === "string" && typeof d.opener === "string")
      openers.set(d.city, { id: `trace:${norm(d.opener)}`, name: d.opener, localCells: Number(/(\d+) local cells/.exec(e.message)?.[1] ?? 0), source: d.source === "local" ? "local" : "similar" });
  }
  // Rows from a degraded scoring call (no heatmap) carry zeros; the trace's numbers win then.
  for (const r of (rows.cities ?? []).filter((r) => (r.heatmapCells ?? 1) > 0 || (r.fanIndex ?? 1) > 0)) {
    scores.set(r.city, r.score);
    if (r.heatmapCells !== undefined) cells.set(r.city, r.heatmapCells);
    if (r.fanIndex !== undefined) fan.set(r.city, r.fanIndex);
  }
  for (const s of plan.stops) if (s.fanIndex !== undefined) fan.set(s.city.name, s.fanIndex);
  for (const [c, o] of Object.entries(rows.openers ?? {})) openers.set(c, o);
  // fanIndex per heatmap cell, from cities that have both (median ratio), for cities that only kept cells.
  const ratios = [...fan].map(([c, f]) => (cells.get(c) ? f / cells.get(c)! : NaN)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const perCell = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 0.3;
  const names = new Set([...scores.keys(), ...plan.stops.map((s) => s.city.name)]);
  const cities: PoolCity[] = [];
  for (const name of names) {
    const stop = plan.stops.find((s) => sameCity(s.city.name, name));
    const row = rows.cities?.find((r) => sameCity(r.city, name));
    const at = stop?.city ?? (row?.lat !== undefined && row.lon !== undefined ? { ...locate(name), name, lat: row.lat, lon: row.lon } : locate(name));
    if (!at || at.lat === undefined) continue;
    const fanIndex = fan.get(name) ?? (cells.has(name) ? Math.round(cells.get(name)! * perCell * 10) / 10 : undefined);
    if (fanIndex === undefined) continue;
    const venues = new Map<string, PoolVenue>();
    for (const s of plan.stops.filter((x) => sameCity(x.city.name, name)))
      for (const v of [s.venue, s.backupVenue]) if (v) venues.set(v.id, fromVenue(s, v));
    const saved = Object.entries(rows.venues ?? {}).find(([c]) => sameCity(c, name))?.[1] ?? [];
    for (const v of saved)
      if (!venues.has(v.id))
        venues.set(v.id, { id: v.id, name: v.name, roomType: v.roomType, capacity: v.defaultCapacityEstimate ?? defaultCapacity(v.roomType), lat: v.lat ?? undefined, lon: v.lon ?? undefined, neighborhood: v.neighborhood ?? undefined, address: v.address ?? undefined, affinity: v.affinity ?? undefined, popularity: v.popularity ?? undefined, foundBy: v.foundBy });
    cities.push({
      name: stop?.city.name ?? name,
      lat: at.lat,
      lon: at.lon,
      region: (at as City).region,
      query: (at as City).query,
      score: stop?.score ?? scores.get(name) ?? 0,
      cells: cells.get(name),
      fanIndex,
      fanIndexEstimated: !fan.has(name) || undefined,
      thinData: stop?.thinData ?? row?.thinData ?? (cells.get(name) ?? 99) < 50,
      hotspots: stop?.hotspots ?? row?.hotspots ?? [],
      venues: [...venues.values()],
      opener: stop?.opener ?? openers.get(name),
    });
  }
  return { medianFanIndex: median || 1, cities: cities.sort((a, b) => b.score - a.score), source: rows.cities?.length ? "run" : "trace" };
}

// ---------- Edits ----------

// Levers change every night's money at once (the conversation layer's "Tune").
export type Levers = { ticketPrice?: number | null; roomMin?: number; roomMax?: number; crew?: number; minGuarantee?: number | null };

export type Edit =
  | { op: "swapCity"; night: string; city: string; venueId?: string }
  | { op: "swapVenue"; night: string; venueId: string }
  | { op: "setDate"; night: string; date: string }
  | { op: "dropNight"; night: string }
  | { op: "restoreNight"; night: string }
  | { op: "addNight"; city: string; venueId?: string; at?: number }
  | { op: "reorder"; night: string; to: number }
  | { op: "setPrice"; night?: string; price: number } // night omitted = every ticketed night
  | { op: "setRoom"; night: string; capacity: number }
  | { op: "setLevers"; levers: Levers };

// What the act chose instead of Tourbo's suggestion (feedback loop).
export type Override = {
  kind: "city" | "venue" | "drop" | "add" | "date" | "order" | "levers";
  night?: number; // 1-based, at the time of the edit
  suggested?: { city: string; venue?: string; roomType?: string; capacity?: number; fanIndex?: number };
  chosen?: { city: string; venue?: string; roomType?: string; capacity?: number; fanIndex?: number };
  deltas: Diff["totals"];
};
// group: edits applied together (one Ask Tourbo proposal) undo together.
// source: set when the edit came from outside the act's own hands (e.g. "venue passed" in outreach).
export type EditRecord = Edit & { id: string; when: string; override?: Override; group?: string; source?: string };

export type Diff = {
  totals: { profit: number; gross: number; costs: number; km: number; fans: number /* ratio of summed fanIndex, after ÷ before */ };
  changed: string[]; // stop keys new or changed in `after`
  removed: string[]; // stop keys gone from `after`
  nights: { key: string; index: number; profit: number; km: number }[]; // per night in `after` that differs
};

export type EditContext = { pool: Pool };
export type ApplyResult = { plan: Plan; errors: { edit: Edit; error: string }[] };

const played = (s: CityPlan) => s.money?.verdict !== "skip";
const TICKETED = new Set(["door_split", "versus", "guarantee", "workshop", "supper_club", "exhibition"]);
const DAY = 86_400_000;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const travelDays = (km: number) => (km > 1200 ? 1 : Math.max(1, Math.ceil(km / 500)));

// The act's typical draw, recovered from the plan's own money (draw = typical × √relDemand), so
// recomputed nights match the planner's numbers (incl. a draw calibrated from logged shows).
function typicalDraw(plan: Plan, levers: Levers) {
  if (levers.roomMin || levers.roomMax) return Math.sqrt((levers.roomMin ?? plan.params.roomMin) * (levers.roomMax ?? plan.params.roomMax));
  const m = plan.stops.map((s) => s.money).find((m) => m && m.relDemand > 0 && m.draw > 10);
  return m ? m.draw / Math.sqrt(m.relDemand) : Math.sqrt(plan.params.roomMin * plan.params.roomMax);
}

function demandFor(plan: Plan, pool: Pool, fanIndex: number, levers: Levers): Demand {
  const typical = typicalDraw(plan, levers);
  const median = Math.max(pool.medianFanIndex || plan.medianFanIndex || 1, 0.1);
  const rel = Math.max(fanIndex, 0.1) / median;
  const draw = Math.max(10, r0(typical * Math.sqrt(rel)));
  return { typicalDraw: r0(typical), relDemand: Math.round(rel * 100) / 100, draw, basis: `typical draw ${r0(typical)}; city demand ×${rel.toFixed(2)} vs tour median (fan data); draw = typical × √demand` };
}

// Same rule as places/hooks.server.ts priceAdjust (kept here so this file stays client-safe): the
// local price nudge applies only when it surfaces for the night's place.
const priceAdjust = (notes?: CityPlan["place"]) =>
  notes?.priceNudge && notes.surfaced.includes("priceNudge") ? { priceFactor: notes.priceNudge.factor, elasticity: notes.priceNudge.elasticity } : {};

export function moneyOf(rec: Recommendation & { best: Recommendation["best"] & { room?: string } }, reason?: string): ShowMoney {
  const b = rec.best;
  return {
    ...(rec.priceNudge ? { priceNudge: rec.priceNudge } : {}),
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
    estimate: true,
  };
}

// One night's money from scratch (a changed city/room) or on its fixed room (a changed leg/lever).
function costNight(plan: Plan, pool: Pool, stop: CityPlan, kmIn: number, levers: Levers, fresh: boolean, fix: { price?: number; capacity?: number; reason?: string } = {}): ShowMoney {
  const prev = stop.money;
  const room0 = stop.venue ? { name: stop.venue.name, capacity: fresh || !prev ? capacityOf(stop, stop.venue) : prev.capacity } : prev && !fresh ? { name: prev.room ?? "room", capacity: prev.capacity } : undefined;
  const room = fix.capacity ? { name: room0?.name ?? "room", capacity: fix.capacity } : room0;
  const fixedPrice = fix.price ?? (levers.ticketPrice === null ? undefined : (levers.ticketPrice ?? plan.params.money?.ticketPrice ?? (!fresh && prev?.reason && prev.reason !== DROPPED ? prev.price : undefined)));
  const rec = optimise({
    region: plan.params.region,
    kind: plan.artist.kind,
    demand: demandFor(plan, pool, stop.fanIndex ?? 0, levers),
    rooms: room ? [room] : [],
    costs: legCosts(kmIn, levers.crew ?? plan.params.money?.crew ?? 3, !!stop.opener),
    price: fixedPrice,
    promo: stop.promo?.spend ?? 0,
    minGuarantee: levers.minGuarantee === null ? undefined : (levers.minGuarantee ?? plan.params.money?.minGuarantee),
    ...priceAdjust(stop.place),
  });
  const money = moneyOf({ ...rec, best: { ...rec.best, room: room?.name } }, fix.reason ?? (fresh ? undefined : prev?.reason));
  if (fix.reason) return money;
  // The planner's own call on a night (support slot, co-headline) stands unless the night changed.
  return !fresh && prev?.reason && prev.reason !== DROPPED ? { ...money, verdict: prev.verdict } : money;
}

export const DROPPED = "You dropped this night.";

// Legs, dates and money after any change. Nights keep their order; dates follow the first night
// (or a date the act pinned) with Tourbo's travel rules; a night's money is recomputed only when
// its city, room, inbound leg or the levers changed, so untouched nights keep the planner's numbers.
function settle(before: Plan, plan: Plan, pool: Pool, dirty: Set<CityPlan>, pinned: Map<CityPlan, string>, levers: Levers, leversChanged: boolean): Plan {
  const stay = discipline(plan.artist.kind).stayDays;
  const legs: Leg[] = [];
  let prev: CityPlan | undefined;
  let date: string | undefined;
  let n = 0;
  const kmBefore = new Map<string, number>();
  {
    let p: CityPlan | undefined;
    for (const s of before.stops.filter(played)) {
      kmBefore.set(stopKey(s), p ? r0(haversineKm(p.city, s.city)) : 0);
      p = s;
    }
  }
  const stops = plan.stops.map((s) => {
    if (!played(s)) return s;
    const km = prev ? r0(haversineKm(prev.city, s.city)) : 0;
    if (prev) legs.push({ from: prev.city.name, to: s.city.name, km });
    const minDate = !prev ? (s.date ?? plan.params.startDate) : addDays(date!, stay > 1 ? stay - 1 + travelDays(km) : travelDays(km) + (n % 4 === 0 ? 1 : 0));
    const pin = pinned.get(s);
    const next: CityPlan = { ...s, date: pin ?? minDate };
    const fresh = dirty.has(s);
    const legMoved = (kmBefore.get(stopKey(s)) ?? -1) !== km;
    if (fresh || legMoved || leversChanged || !s.money) next.money = costNight(plan, pool, next, km, levers, fresh);
    prev = next;
    date = next.date;
    n++;
    return next;
  });
  const pnl = tourTotals(stops);
  return { ...plan, stops, legs, totalKm: legs.reduce((a, l) => a + l.km, 0), money: { ...pnl, promoBudget: plan.money?.promoBudget } };
}

export function tourTotals(stops: CityPlan[]) {
  const p = stops.filter((s) => s.money && played(s));
  const sum = (k: "gross" | "artistTake" | "costs" | "profit") => p.reduce((a, s) => a + (s.money?.[k] ?? 0), 0);
  return { currency: p[0]?.money?.currency ?? stops.find((s) => s.money)?.money?.currency ?? "", gross: sum("gross"), artistTake: sum("artistTake"), costs: sum("costs"), profit: sum("profit") };
}

const findNight = (plan: Plan, key: string) => plan.stops.findIndex((s) => stopKey(s) === key);

// Best room for a city from its candidates: inside the act's room range, then fan fit.
export function bestVenue(city: PoolCity, roomMin: number, roomMax: number, exclude?: string): PoolVenue | undefined {
  const fits = (v: PoolVenue) => (v.capacity >= roomMin * 0.8 && v.capacity <= roomMax * 1.2 ? 1 : 0);
  return [...city.venues].filter((v) => v.id !== exclude).sort((a, b) => fits(b) - fits(a) || (b.affinity ?? 0) - (a.affinity ?? 0))[0];
}

// Rooms the run found in other checked cities close to this one (a city with no rooms of its own
// can still be played in a room nearby). Nearest first.
export const NEARBY_KM = 60;
export function nearbyVenues(pool: Pool, city: Pick<City, "name" | "lat" | "lon">, km = NEARBY_KM): { venue: PoolVenue; city: string; km: number }[] {
  const out: { venue: PoolVenue; city: string; km: number }[] = [];
  for (const c of pool.cities) {
    if (sameCity(c.name, city.name)) continue;
    const d = haversineKm(city as City, c as unknown as City);
    if (d > km) continue;
    for (const v of c.venues) out.push({ venue: v, city: c.name, km: Math.round(v.lat !== undefined && v.lon !== undefined ? haversineKm(city as City, { lat: v.lat, lon: v.lon } as City) : d) });
  }
  return out.sort((a, b) => a.km - b.km);
}

function stopFromPool(c: PoolCity, venue?: PoolVenue): CityPlan {
  const v = venue && toVenue(venue);
  return {
    city: { name: c.name, lat: c.lat, lon: c.lon, region: c.region ?? "na", ...(c.query ? { query: c.query } : {}) },
    score: c.score,
    fanIndex: c.fanIndex,
    hotspots: c.hotspots,
    venue: v,
    backupVenue: undefined,
    opener: c.opener,
    capacity: venue ? { min: venue.capacity, max: venue.capacity, estimate: true } : undefined,
    evidence: [],
    thinData: c.thinData,
  };
}

const mark = (s: CityPlan, what: NonNullable<CityPlan["yours"]>["changed"][number], original?: CityPlan): CityPlan => ({
  ...s,
  yours: {
    changed: [...new Set([...(s.yours?.changed ?? []), what])],
    suggested: s.yours?.suggested ?? (original ? { city: original.city.name, venue: original.venue?.name, profit: original.money?.profit } : undefined),
  },
});

// Replays edits on Tourbo's plan. Edits that no longer apply (their night is gone) are skipped and
// reported, never thrown, so one stale edit can't break the page.
export function applyEdits(base: Plan, edits: Edit[], ctx: EditContext): ApplyResult {
  let plan: Plan = base;
  const errors: ApplyResult["errors"] = [];
  let levers: Levers = {};
  const pinned = new Map<string, string>(); // stop key → date
  for (const edit of edits) {
    const r = applyOne(plan, edit, ctx, levers, pinned);
    if ("error" in r) errors.push({ edit, error: r.error });
    else {
      plan = r.plan;
      levers = r.levers;
    }
  }
  return { plan: { ...plan, edited: edits.length || undefined }, errors };
}

export function applyEdit(plan: Plan, edit: Edit, ctx: EditContext, levers: Levers = {}): ApplyResult {
  const r = applyOne(plan, edit, ctx, levers, new Map());
  return "error" in r ? { plan, errors: [{ edit, error: r.error }] } : { plan: r.plan, errors: [] };
}

function applyOne(plan: Plan, edit: Edit, { pool }: EditContext, levers: Levers, pinnedKeys: Map<string, string>): { plan: Plan; levers: Levers } | { error: string } {
  const stops = [...plan.stops];
  const dirty = new Set<CityPlan>();
  let nextLevers = levers;
  let leversChanged = false;
  const at = "night" in edit && edit.night !== undefined ? findNight(plan, edit.night) : -1;
  if ("night" in edit && edit.night !== undefined && at < 0) return { error: "That night isn't in the plan any more." };
  const cityOf = (name: string) => pool.cities.find((c) => sameCity(c.name, name));
  switch (edit.op) {
    case "swapCity": {
      const c = cityOf(edit.city);
      if (!c) return { error: `${edit.city} wasn't among the cities Tourbo checked.` };
      if (plan.stops.some((s, i) => i !== at && played(s) && sameCity(s.city.name, c.name))) return { error: `${c.name} is already on the tour.` };
      const v = edit.venueId ? c.venues.find((x) => x.id === edit.venueId) : bestVenue(c, levers.roomMin ?? plan.params.roomMin, levers.roomMax ?? plan.params.roomMax);
      const old = stops[at];
      const next = mark({ ...stopFromPool(c, v), date: old.date, yours: old.yours }, "city", old);
      const backup = v && bestVenue(c, plan.params.roomMin, plan.params.roomMax, v.id);
      if (backup) next.backupVenue = toVenue(backup);
      stops[at] = next;
      dirty.add(next);
      break;
    }
    case "swapVenue": {
      const old = stops[at];
      const c = cityOf(old.city.name);
      const v =
        c?.venues.find((x) => x.id === edit.venueId) ??
        (old.backupVenue?.id === edit.venueId ? fromVenue(old, old.backupVenue) : undefined) ??
        nearbyVenues(pool, old.city).find((x) => x.venue.id === edit.venueId)?.venue;
      if (!v) return { error: "That room wasn't among the rooms Tourbo found here." };
      const next = mark({ ...old, venue: toVenue(v), backupVenue: old.venue, capacity: { min: v.capacity, max: v.capacity, estimate: true }, fit: undefined, angle: undefined, access: undefined, evidence: [] }, "venue", old);
      stops[at] = next;
      dirty.add(next);
      break;
    }
    case "setDate": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.date)) return { error: "Pick a date." };
      const next = mark({ ...stops[at], date: edit.date }, "date", stops[at]);
      stops[at] = next;
      pinnedKeys.set(stopKey(next), edit.date);
      break;
    }
    case "dropNight": {
      const old = stops[at];
      if (!old.money || !played(old)) return { error: "That night is already dropped." };
      stops[at] = { ...old, money: { ...old.money, verdict: "skip", reason: DROPPED } };
      break;
    }
    case "restoreNight": {
      const old = stops[at];
      if (played(old)) return { error: "That night is already on." };
      const next = { ...old, money: undefined };
      stops[at] = next;
      dirty.add(next);
      break;
    }
    case "addNight": {
      const c = cityOf(edit.city);
      if (!c) return { error: `${edit.city} wasn't among the cities Tourbo checked.` };
      if (plan.stops.some((s) => played(s) && sameCity(s.city.name, c.name))) return { error: `${c.name} is already on the tour.` };
      if (plan.stops.filter(played).length >= 20) return { error: "A tour can have at most 20 nights." };
      const v = edit.venueId ? c.venues.find((x) => x.id === edit.venueId) : bestVenue(c, plan.params.roomMin, plan.params.roomMax);
      const next = mark(stopFromPool(c, v), "added");
      // Default slot: where it adds the fewest km.
      const pos = edit.at ?? cheapestSlot(stops, next);
      const prior = stops.slice(0, pos).filter(played).at(-1);
      next.date = prior?.date;
      stops.splice(Math.max(0, Math.min(pos, stops.length)), 0, next);
      dirty.add(next);
      break;
    }
    case "reorder": {
      const to = Math.max(0, Math.min(edit.to, stops.length - 1));
      if (to === at) return { plan, levers };
      const [s] = stops.splice(at, 1);
      const moved = mark(s, "order", s);
      stops.splice(to, 0, moved);
      // Dates follow the new order from the tour's first date (pinned dates stay).
      const head = stops.findIndex(played);
      if (head >= 0 && !pinnedKeys.has(stopKey(stops[head]))) stops[head] = { ...stops[head], date: plan.stops.find(played)?.date ?? plan.params.startDate };
      break;
    }
    case "setPrice":
    case "setRoom": {
      if (edit.op === "setPrice" && !(edit.price > 0)) return { error: "A ticket price has to be more than zero." };
      if (edit.op === "setRoom" && !(edit.capacity >= 10)) return { error: "A room needs at least 10 seats." };
      const targets = edit.night === undefined ? stops.map((_, i) => i) : [at];
      let changed = 0;
      for (const i of targets) {
        const s = stops[i];
        if (!s.money || !played(s) || (edit.op === "setPrice" && (!TICKETED.has(s.money.deal) || s.money.price === edit.price))) continue;
        const prior = stops.slice(0, i).filter(played).at(-1);
        const km = prior ? r0(haversineKm(prior.city, s.city)) : 0;
        const fix = edit.op === "setPrice" ? { price: edit.price, capacity: s.money.capacity, reason: "Your ticket price." } : { capacity: edit.capacity, price: s.money.reason ? s.money.price : undefined, reason: "Your room size." };
        stops[i] = mark({ ...s, money: costNight(plan, pool, s, km, levers, false, fix) }, edit.op === "setPrice" ? "price" : "room", s);
        changed++;
      }
      if (!changed) return { error: edit.op === "setPrice" ? "No ticketed night to change." : "That night has no money estimate to change." };
      break;
    }
    case "setLevers": {
      nextLevers = { ...levers, ...edit.levers };
      leversChanged = true;
      break;
    }
  }
  const pinned = new Map<CityPlan, string>();
  for (const s of stops) {
    const d = pinnedKeys.get(stopKey(s));
    if (d) pinned.set(s, d);
  }
  return { plan: settle(plan, { ...plan, stops }, pool, dirty, pinned, nextLevers, leversChanged), levers: nextLevers };
}

function cheapestSlot(stops: CityPlan[], add: CityPlan) {
  let best = stops.length;
  let cost = Infinity;
  for (let i = 0; i <= stops.length; i++) {
    const a = stops.slice(0, i).filter(played).at(-1);
    const b = stops.slice(i).find(played);
    const extra = (a ? haversineKm(a.city, add.city) : 0) + (b ? haversineKm(add.city, b.city) : 0) - (a && b ? haversineKm(a.city, b.city) : 0);
    if (extra < cost - 1e-6) {
      cost = extra;
      best = i;
    }
  }
  return best;
}

// ---------- Deltas ----------

const fanSum = (p: Plan) => p.stops.filter(played).reduce((a, s) => a + (s.fanIndex ?? 0), 0);

export function diff(before: Plan, after: Plan): Diff {
  const keysBefore = new Map(before.stops.filter(played).map((s) => [stopKey(s), s]));
  const keysAfter = new Set(after.stops.filter(played).map(stopKey));
  const fb = fanSum(before);
  const legIn = (p: Plan) => {
    const m = new Map<string, number>();
    let prev: CityPlan | undefined;
    for (const s of p.stops.filter(played)) {
      m.set(stopKey(s), prev ? r0(haversineKm(prev.city, s.city)) : 0);
      prev = s;
    }
    return m;
  };
  const kmB = legIn(before);
  const kmA = legIn(after);
  const nights: Diff["nights"] = [];
  after.stops.forEach((s, index) => {
    if (!played(s)) return;
    const k = stopKey(s);
    const old = keysBefore.get(k);
    const profit = (s.money?.profit ?? 0) - (old?.money?.profit ?? 0);
    const km = (kmA.get(k) ?? 0) - (kmB.get(k) ?? 0);
    if (!old || profit !== 0 || km !== 0 || old.date !== s.date) nights.push({ key: k, index, profit, km });
  });
  return {
    totals: {
      profit: (after.money?.profit ?? 0) - (before.money?.profit ?? 0),
      gross: (after.money?.gross ?? 0) - (before.money?.gross ?? 0),
      costs: (after.money?.costs ?? 0) - (before.money?.costs ?? 0),
      km: after.totalKm - before.totalKm,
      fans: fb > 0 ? Math.round((fanSum(after) / fb) * 100) / 100 : 1,
    },
    changed: [...keysAfter].filter((k) => !keysBefore.has(k)),
    removed: [...keysBefore.keys()].filter((k) => !keysAfter.has(k)),
    nights,
  };
}

// ---------- Alternatives per night (with deltas vs the current pick) ----------

export type CityOption = { city: PoolCity; venue?: PoolVenue; profit: number; km: number; fans: number; nightProfit: number; tourProfit: number; known: boolean };
export type VenueOption = { venue: PoolVenue; current: boolean; profit: number; capacity: number; hotspotKm?: number; nightProfit: number };

// Fan strength vs the current pick, two significant digits (0.054 → 0.054, 1.234 → 1.2).
const fansRatio = (a: number, b?: number) => Number((Math.max(a, 0.01) / Math.max(b ?? 0.1, 0.1)).toPrecision(2));

// Other checked cities for one night: each one tried in that slot, deltas vs the current plan.
export function cityOptions(plan: Plan, night: string, ctx: EditContext, prefs: Preference[] = []): CityOption[] {
  const at = findNight(plan, night);
  if (at < 0) return [];
  const current = plan.stops[at];
  const taken = new Set(plan.stops.filter(played).map((s) => norm(s.city.name)));
  return rankWithPrefs(
    ctx.pool.cities
      .filter((c) => !taken.has(norm(c.name)))
      .map((c) => {
        const r = applyEdit(plan, { op: "swapCity", night, city: c.name }, ctx);
        const s = r.plan.stops[at];
        const d = diff(plan, r.plan);
        return { city: c, venue: c.venues.find((v) => v.id === s.venue?.id), profit: d.totals.profit, km: d.totals.km, fans: fansRatio(c.fanIndex, current.fanIndex), nightProfit: s.money?.profit ?? 0, tourProfit: r.plan.money?.profit ?? 0, known: c.venues.length > 0 };
      }),
    prefs,
  );
}

const hotspotKm = (v: PoolVenue, hotspots: Hotspot[]) =>
  v.lat === undefined || v.lon === undefined || !hotspots.length ? undefined : Math.round(Math.min(...hotspots.map((h) => haversineKm({ lat: v.lat!, lon: v.lon! } as City, { lat: h.lat, lon: h.lon } as City))) * 10) / 10;

export function venueOptions(plan: Plan, night: string, ctx: EditContext): VenueOption[] {
  const at = findNight(plan, night);
  if (at < 0) return [];
  const stop = plan.stops[at];
  const city = ctx.pool.cities.find((c) => sameCity(c.name, stop.city.name));
  const list = new Map<string, PoolVenue>();
  if (stop.venue) list.set(stop.venue.id, fromVenue(stop, stop.venue));
  if (stop.backupVenue) list.set(stop.backupVenue.id, fromVenue(stop, stop.backupVenue));
  for (const v of city?.venues ?? []) if (!list.has(v.id)) list.set(v.id, v);
  return [...list.values()].map((v) => {
    if (v.id === stop.venue?.id) return { venue: v, current: true, profit: 0, capacity: stop.money?.capacity ?? v.capacity, hotspotKm: hotspotKm(v, stop.hotspots), nightProfit: stop.money?.profit ?? 0 };
    const r = applyEdit(plan, { op: "swapVenue", night, venueId: v.id }, { pool: ctx.pool.cities.some((c) => sameCity(c.name, stop.city.name)) ? ctx.pool : { ...ctx.pool, cities: [...ctx.pool.cities, { name: stop.city.name, lat: stop.city.lat, lon: stop.city.lon, score: stop.score, fanIndex: stop.fanIndex ?? 0, thinData: stop.thinData, hotspots: stop.hotspots, venues: [...list.values()] }] } });
    const s = r.plan.stops[at];
    return { venue: v, current: false, profit: (r.plan.money?.profit ?? 0) - (plan.money?.profit ?? 0), capacity: s.money?.capacity ?? v.capacity, hotspotKm: hotspotKm(v, stop.hotspots), nightProfit: s.money?.profit ?? 0 };
  });
}

// ---------- Feedback loop: soft preferences from the act's overrides ----------

export type Preference = { id: "smaller_rooms" | "bigger_rooms" | "shorter_drives" | "stronger_fans" | `room:${string}`; text: string; count: number };

export function overrideFor(before: Plan, after: Plan, edit: Edit): Override | undefined {
  const d = diff(before, after).totals;
  const pick = (p: Plan, key: string) => p.stops[findNight(p, key)];
  const side = (s?: CityPlan) => s && { city: s.city.name, venue: s.venue?.name, roomType: s.venue ? roomTypeOf(s.venue) : undefined, capacity: s.money?.capacity, fanIndex: s.fanIndex };
  const idx = "night" in edit && edit.night !== undefined ? findNight(before, edit.night) : -1;
  const night = idx >= 0 ? idx + 1 : undefined;
  switch (edit.op) {
    case "swapCity":
    case "swapVenue":
      return { kind: edit.op === "swapCity" ? "city" : "venue", night, suggested: side(pick(before, edit.night)), chosen: side(after.stops[idx]), deltas: d };
    case "dropNight":
      return { kind: "drop", night, suggested: side(pick(before, edit.night)), deltas: d };
    case "addNight":
      return { kind: "add", chosen: side(after.stops.find((s) => sameCity(s.city.name, edit.city))), deltas: d };
    case "setDate":
      return { kind: "date", night, deltas: d };
    case "reorder":
      return { kind: "order", night, deltas: d };
    case "setLevers":
      return { kind: "levers", deltas: d };
    default:
      return undefined;
  }
}

// Two or more overrides pointing the same way become a soft preference (shown, undoable).
export function preferences(edits: EditRecord[], dismissed: string[] = []): Preference[] {
  const o = edits.map((e) => e.override).filter((x): x is Override => !!x);
  const swaps = o.filter((x) => (x.kind === "venue" || x.kind === "city") && x.suggested && x.chosen);
  const out: Preference[] = [];
  const add = (id: Preference["id"], text: string, count: number) => count >= 2 && !dismissed.includes(id) && out.push({ id, text, count });
  // Room size and type only from room picks (a city swap's room is Tourbo's pick, not the act's).
  const rooms = swaps.filter((x) => x.kind === "venue");
  const cap = (x: Override) => (x.chosen?.capacity ?? 0) - (x.suggested?.capacity ?? 0);
  add("smaller_rooms", "you prefer smaller rooms", rooms.filter((x) => cap(x) < -20).length);
  add("bigger_rooms", "you prefer bigger rooms", rooms.filter((x) => cap(x) > 20).length);
  add("shorter_drives", "you'd rather drive less", o.filter((x) => x.deltas.km < -50).length);
  add("stronger_fans", "you go where the fans are strongest", swaps.filter((x) => (x.chosen?.fanIndex ?? 0) > (x.suggested?.fanIndex ?? 0) * 1.1).length);
  const types = new Map<string, number>();
  for (const x of rooms) if (x.chosen?.roomType && x.chosen.roomType !== x.suggested?.roomType) types.set(x.chosen.roomType, (types.get(x.chosen.roomType) ?? 0) + 1);
  for (const [t, n] of types) add(`room:${t}`, `you like ${t === "bar" ? "bars" : t === "club" ? "clubs" : `${t}s`.replace("hall / theatres", "halls and theatres")}`, n);
  return out;
}

// Light weights: options matching a preference float up a little, never past a much better one.
export function rankWithPrefs<T extends { profit: number; km: number; fans: number; venue?: PoolVenue }>(list: T[], prefs: Preference[]): T[] {
  const has = (id: string) => prefs.some((p) => p.id === id);
  const bonus = (o: T) =>
    (has("shorter_drives") ? -o.km * 2 : 0) +
    (has("stronger_fans") ? (o.fans - 1) * 500 : 0) +
    (o.venue && prefs.some((p) => p.id === `room:${o.venue!.roomType}`) ? 300 : 0) +
    (o.venue && has("smaller_rooms") ? -o.venue.capacity : 0) +
    (o.venue && has("bigger_rooms") ? o.venue.capacity : 0);
  return [...list].sort((a, b) => b.profit + bonus(b) - (a.profit + bonus(a)));
}

// Adjust / next plan: room range nudged by the noticed preference (transparent, the form shows it).
export function preferredRooms(prefs: Preference[], roomMin: number, roomMax: number) {
  if (prefs.some((p) => p.id === "smaller_rooms")) return { roomMin: Math.max(1, r0(roomMin * 0.8)), roomMax: Math.max(r0(roomMin * 0.8) + 1, r0(roomMax * 0.8)) };
  if (prefs.some((p) => p.id === "bigger_rooms")) return { roomMin: r0(roomMin * 1.2), roomMax: r0(roomMax * 1.2) };
  return { roomMin, roomMax };
}

// Days between two nights, for "1 travel day" style hints.
export const gapDays = (a?: string, b?: string) => (a && b ? daysBetween(a, b) : undefined);

// Legs, dates and every night's money from scratch on the plan's current rooms (fixtures, previews).
export const settlePlan = (plan: Plan, { pool }: EditContext, levers: Levers = {}): Plan => settle(plan, plan, pool, new Set(), new Map(), levers, true);

// ---------- The shared contract (engine/proposals.ts PlanEdit, 0-based nights) ----------

// One PlanEdit (as Ask Tourbo, Tourbo's questions or the map make it) → this file's edit, with the
// night resolved to its stable key on the plan it applies to.
export function toEdit(plan: Plan, e: PlanEdit): Edit | { error: string } {
  const key = (i: number) => (plan.stops[i] ? stopKey(plan.stops[i]) : undefined);
  const missing = (i: number) => ({ error: `There's no night ${i + 1} in this plan.` });
  switch (e.op) {
    case "drop_night":
    case "restore_night":
      return key(e.night) ? { op: e.op === "drop_night" ? "dropNight" : "restoreNight", night: key(e.night)! } : missing(e.night);
    case "set_date":
      return key(e.night) ? { op: "setDate", night: key(e.night)!, date: e.date } : missing(e.night);
    case "set_room":
      return key(e.night) ? { op: "setRoom", night: key(e.night)!, capacity: e.capacity } : missing(e.night);
    case "set_price":
      if (e.night === undefined) return { op: "setPrice", price: e.price };
      return key(e.night) ? { op: "setPrice", night: key(e.night)!, price: e.price } : missing(e.night);
    case "swap_venue": {
      const s = plan.stops[e.night];
      if (!s) return missing(e.night);
      const id = e.venue === "backup" ? s.backupVenue?.id : e.venue;
      return id ? { op: "swapVenue", night: stopKey(s), venueId: id } : { error: `${s.city.name} has no backup venue to swap to.` };
    }
    case "swap_city":
      return key(e.night) ? { op: "swapCity", night: key(e.night)!, city: e.city, ...(e.venueId ? { venueId: e.venueId } : {}) } : missing(e.night);
    case "add_night":
      return { op: "addNight", city: e.city, ...(e.after !== undefined ? { at: e.after + 1 } : {}) };
    case "reorder":
      return key(e.night) ? { op: "reorder", night: key(e.night)!, to: e.to } : missing(e.night);
  }
}

// One line per change, for proposal cards and the change list ("Night 3: Milwaukee → Detroit").
export function describe(before: Plan, after: Plan, edit: Edit): string {
  const i = "night" in edit && edit.night ? findNight(before, edit.night) : -1;
  const s = i >= 0 ? before.stops[i] : undefined;
  const n = `Night ${i + 1}`;
  switch (edit.op) {
    case "swapCity":
      return `${n}: ${s?.city.name} → ${after.stops[i]?.city.name ?? edit.city}`;
    case "swapVenue":
      return `${s?.city.name}: ${s?.venue?.name ?? "room"} → ${after.stops[i]?.venue?.name ?? "another room"}`;
    case "setDate":
      return `${s?.city.name}: ${s?.date ?? "no date"} → ${edit.date}`;
    case "dropNight":
      return `${s?.city.name}: dropped`;
    case "restoreNight":
      return `${s?.city.name}: back in the tour`;
    case "addNight": {
      const at = after.stops.findIndex((x) => sameCity(x.city.name, edit.city));
      return `New night ${at + 1}: ${edit.city}${after.stops[at]?.date ? ` on ${after.stops[at].date}` : ""}`;
    }
    case "reorder":
      return `${s?.city.name}: moved to night ${Math.min(edit.to, before.stops.length - 1) + 1}`;
    case "setPrice":
      return s ? `${s.city.name}: ticket ${s.money?.price} → ${edit.price}` : `Every ticketed night: ticket → ${edit.price}`;
    case "setRoom":
      return `${s?.city.name}: room ${s?.money?.capacity} → ${edit.capacity}`;
    case "setLevers":
      return "Tuned the money settings";
  }
}

// applyEdits for the shared contract: PlanEdits in order on `plan`, each on the result of the last.
export function applyPlanEdits(plan: Plan, edits: PlanEdit[], ctx: EditContext): { plan: Plan; changes: string[]; edits: Edit[]; errors: string[] } {
  let cur = plan;
  const changes: string[] = [];
  const out: Edit[] = [];
  const errors: string[] = [];
  for (const e of edits) {
    const edit = toEdit(cur, e);
    if ("error" in edit) {
      errors.push(edit.error);
      continue;
    }
    const r = applyEdit(cur, edit, ctx);
    if (r.errors.length) {
      errors.push(r.errors[0].error);
      continue;
    }
    changes.push(describe(cur, r.plan, edit));
    out.push(edit);
    cur = r.plan;
  }
  return { plan: cur, changes, edits: out, errors };
}
