import type { PerformerKind, Region } from "../shared/types.ts";

// Show economics. Qloo has no capacity, price or sales data, so every number here is an
// ESTIMATE built from: the act's own typical draw (room size or logged past shows) scaled by
// the city's relative Qloo fan demand, plus regional cost defaults. Formulas are returned
// with the result so the act can see (and override) every assumption.

export type Deal = "door_split" | "guarantee" | "versus" | "bar_deal";
export const DEALS: Deal[] = ["door_split", "guarantee", "versus", "bar_deal"];

type RegionDefaults = {
  currency: string;
  ticket: Record<PerformerKind, number>; // reference ticket price
  nutPerCap: number; // venue running cost per capacity seat, taken off the door
  perKm: number; // ground travel per km for the party
  flight: number; // per person, legs > 1200 km
  lodging: number; // per person per night
  perDiem: number; // per person per day
  openerFee: number;
  barPerHead: number; // artist share of bar spend per head on a bar deal
};

export const REGION_DEFAULTS: Record<Region, RegionDefaults> = {
  na: { currency: "USD", ticket: { musician: 25, comedian: 30 }, nutPerCap: 6, perKm: 0.6, flight: 250, lodging: 120, perDiem: 40, openerFee: 150, barPerHead: 3 },
  eu: { currency: "EUR", ticket: { musician: 22, comedian: 25 }, nutPerCap: 5, perKm: 0.5, flight: 150, lodging: 100, perDiem: 35, openerFee: 120, barPerHead: 2.5 },
  in: { currency: "INR", ticket: { musician: 999, comedian: 799 }, nutPerCap: 150, perKm: 20, flight: 6000, lodging: 3500, perDiem: 1200, openerFee: 5000, barPerHead: 120 },
};

const ELASTICITY = 1.1; // demand falls ~1.1% per 1% price rise around the reference price
const TICKET_FEES = 0.1;
const SPLIT: Record<Deal, number> = { door_split: 0.7, guarantee: 0, versus: 0.8, bar_deal: 0 };
const ROOM_DEFAULT_CAPACITY: Record<string, number> = { bar: 120, "comedy club": 200, club: 400, "music venue": 500, "hall / theatre": 1200 };
const FREE_ENTRY_BOOST = 1.4; // free-entry bar shows draw more walk-ins

export type Demand = {
  typicalDraw: number; // the act's draw in an average market
  relDemand: number; // this city's Qloo demand ÷ tour median (1 = average)
  draw: number; // estimated tickets at the reference price
  basis: string;
};

export type PastShow = { fanIndex: number; attendance: number };

// draw = typicalDraw × relDemand^0.5 — square root because heatmap footprint grows faster
// than ticket demand (Taylor Swift Chicago fanIndex 1724 vs Japanese Breakfast 588).
export function estimateDemand(opts: {
  fanIndex: number;
  medianFanIndex: number;
  roomMin: number;
  roomMax: number;
  pastShows?: PastShow[];
}): Demand {
  const rel = opts.medianFanIndex > 0 ? Math.max(opts.fanIndex, 0.1) / opts.medianFanIndex : 1;
  const usable = (opts.pastShows ?? []).filter((s) => s.fanIndex > 0 && s.attendance > 0);
  let typical = Math.sqrt(opts.roomMin * opts.roomMax);
  let basis = `typical draw = √(room ${opts.roomMin}×${opts.roomMax}) = ${Math.round(typical)} (your requested room size)`;
  if (usable.length && opts.medianFanIndex > 0) {
    // Fit typical draw so typical × (fanIndex/median)^0.5 matches the logged attendance.
    typical = usable.reduce((s, p) => s + p.attendance / Math.sqrt(p.fanIndex / opts.medianFanIndex), 0) / usable.length;
    basis = `typical draw = ${Math.round(typical)}, calibrated from ${usable.length} logged show${usable.length > 1 ? "s" : ""}`;
  }
  const draw = Math.max(10, Math.round(typical * Math.sqrt(rel)));
  return { typicalDraw: Math.round(typical), relDemand: Math.round(rel * 100) / 100, draw, basis: `${basis}; city demand ×${rel.toFixed(2)} vs tour median (Qloo heatmap Σ affinity×popularity); draw = typical × √demand` };
}

export type Scenario = {
  deal: Deal;
  price: number; // 0 for bar_deal
  capacity: number;
  guarantee?: number; // guarantee / versus
  split?: number; // artist share of net door after the house nut
  promo?: number; // promo spend for this show
  sponsor?: number; // sponsor cash for this show
};

export type Costs = { travelKm: number; flights: number; nights: number; crew: number; opener: boolean };

export type Outcome = {
  scenario: Scenario;
  tickets: number;
  sellThrough: number;
  gross: number;
  artistTake: number;
  costs: number;
  profit: number;
  venueProfit: number;
  breakEvenPrice?: number;
  costBreakdown: Record<string, number>;
};

const round = (n: number) => Math.round(n);

export function costsFor(region: Region, c: Costs, promo = 0) {
  const d = REGION_DEFAULTS[region];
  const breakdown = {
    travel: round(c.travelKm * d.perKm + c.flights * d.flight * c.crew),
    lodging: round(c.nights * d.lodging * c.crew),
    perDiem: round(d.perDiem * c.crew),
    opener: c.opener ? d.openerFee : 0,
    promo: round(promo),
  };
  return { total: Object.values(breakdown).reduce((a, b) => a + b, 0), breakdown };
}

export function evaluate(region: Region, kind: PerformerKind, demand: Demand, s: Scenario, c: Costs): Outcome {
  const d = REGION_DEFAULTS[region];
  const ref = d.ticket[kind];
  const promoLift = s.promo ? 1 + Math.min(0.35, (s.promo / Math.max(ref, 1)) / Math.max(demand.draw, 1) * 2) : 1;
  const wanted = s.deal === "bar_deal" ? demand.draw * FREE_ENTRY_BOOST : demand.draw * (s.price / ref) ** -ELASTICITY;
  const tickets = Math.max(0, Math.min(s.capacity, round(wanted * promoLift)));
  const gross = s.deal === "bar_deal" ? 0 : tickets * s.price;
  const net = gross * (1 - TICKET_FEES);
  const nut = s.capacity * d.nutPerCap;
  const split = s.split ?? SPLIT[s.deal];
  const doorShare = Math.max(0, net - nut) * split;
  const artistTake =
    s.deal === "guarantee" ? (s.guarantee ?? 0)
    : s.deal === "versus" ? Math.max(s.guarantee ?? 0, doorShare)
    : s.deal === "bar_deal" ? tickets * d.barPerHead
    : doorShare;
  const { total, breakdown } = costsFor(region, c, s.promo);
  const profit = round(artistTake + (s.sponsor ?? 0) - total);
  // Lowest ticket price at which this show breaks even for the act on a door split.
  const breakEvenPrice = s.deal === "door_split" || s.deal === "versus" ? breakEven(demand, ref, s, c, region, total - (s.sponsor ?? 0)) : undefined;
  return {
    scenario: s,
    tickets,
    sellThrough: s.capacity ? Math.round((tickets / s.capacity) * 100) / 100 : 0,
    gross: round(gross),
    artistTake: round(artistTake),
    costs: total,
    profit,
    // Bar deal: the venue keeps ~60% of bar spend (≈5× the artist's per-head share) and runs lighter.
    venueProfit: round(s.deal === "bar_deal" ? tickets * d.barPerHead * 5 * 0.6 - artistTake - nut * 0.5 : net - nut - artistTake),
    breakEvenPrice,
    costBreakdown: breakdown,
  };
}

function breakEven(demand: Demand, ref: number, s: Scenario, c: Costs, region: Region, need: number) {
  const d = REGION_DEFAULTS[region];
  for (let p = ref * 0.3; p <= ref * 4; p += ref * 0.05) {
    const tickets = Math.min(s.capacity, demand.draw * (p / ref) ** -ELASTICITY);
    const take = Math.max(0, tickets * p * (1 - TICKET_FEES) - s.capacity * d.nutPerCap) * (s.split ?? SPLIT[s.deal]);
    if (take >= need) return round(p);
  }
  return undefined;
}

export type Verdict = "headline" | "co-headline" | "support slot" | "skip";

export type Recommendation = {
  best: Outcome;
  alternatives: Outcome[];
  verdict: Verdict;
  why: string;
  currency: string;
  demand: Demand;
};

// Grid search over deal × price × room; prefers profit, then sell-through ≥ 60% (a full room
// sells merch and the next tour). The agent calls this per city and may override.
export function optimise(opts: {
  region: Region;
  kind: PerformerKind;
  demand: Demand;
  rooms: { name: string; capacity: number }[];
  costs: Costs;
  price?: number; // fixed by the act
  promo?: number;
  sponsor?: number;
  minGuarantee?: number;
}): Recommendation {
  const d = REGION_DEFAULTS[opts.region];
  const ref = d.ticket[opts.kind];
  const prices = opts.price ? [opts.price] : [0.6, 0.8, 1, 1.2, 1.5, 1.8].map((f) => round(ref * f));
  const rooms = opts.rooms.length ? opts.rooms : [{ name: "default room", capacity: ROOM_DEFAULT_CAPACITY["music venue"] }];
  const outcomes: (Outcome & { room: string })[] = [];
  for (const room of rooms) {
    for (const deal of DEALS) {
      for (const price of deal === "bar_deal" ? [0] : prices) {
        const guarantee = deal === "guarantee" || deal === "versus" ? round(Math.max(opts.minGuarantee ?? 0, demand0(opts.demand, room.capacity) * ref * 0.35)) : undefined;
        const o = evaluate(opts.region, opts.kind, opts.demand, { deal, price, capacity: room.capacity, guarantee, promo: opts.promo, sponsor: opts.sponsor }, opts.costs);
        // A venue won't sign a guarantee it expects to lose money on.
        if ((deal === "guarantee" || deal === "versus") && o.venueProfit < 0) continue;
        outcomes.push({ ...o, room: room.name });
      }
    }
  }
  const score = (o: Outcome) => o.profit + (o.sellThrough >= 0.6 ? 0 : -Math.abs(o.profit) * 0.25) ;
  outcomes.sort((a, b) => score(b) - score(a));
  const best = outcomes[0];
  const verdict: Verdict =
    best.profit >= 0 && best.sellThrough >= 0.6 ? "headline"
    : best.profit >= 0 ? "co-headline"
    : opts.demand.relDemand >= 0.5 ? "support slot"
    : "skip";
  const fmt = (n: number) => `${d.currency} ${n.toLocaleString("en-US")}`;
  const why =
    verdict === "headline" ? `${best.tickets} tickets (${Math.round(best.sellThrough * 100)}% of ${best.scenario.capacity}) on a ${best.scenario.deal.replace("_", " ")} nets ${fmt(best.profit)}.`
    : verdict === "co-headline" ? `Profitable (${fmt(best.profit)}) but only ${Math.round(best.sellThrough * 100)}% full; share the bill to fill the room.`
    : verdict === "support slot" ? `Best case loses ${fmt(-best.profit)}; demand ×${opts.demand.relDemand} is real, so open for a bigger act here instead.`
    : `Best case loses ${fmt(-best.profit)} on weak demand (×${opts.demand.relDemand}); skip or play online.`;
  const seen = new Set<string>();
  const alternatives = outcomes
    .slice(1)
    .filter((o) => {
      const key = `${o.scenario.deal}|${o.room}`;
      if (seen.has(key) || key === `${best.scenario.deal}|${(best as Outcome & { room: string }).room}`) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
  return { best, alternatives, verdict, why, currency: d.currency, demand: opts.demand };
}

const demand0 = (demand: Demand, capacity: number) => Math.min(capacity, demand.draw);

export const defaultCapacity = (roomType: string) => ROOM_DEFAULT_CAPACITY[roomType] ?? ROOM_DEFAULT_CAPACITY["music venue"];

// Travel cost inputs for one stop from the routed leg into it.
export function legCosts(km: number, crew: number, opener: boolean): Costs {
  const flights = km > 1200 ? 1 : 0;
  return { travelKm: flights ? 0 : km, flights, nights: 1, crew, opener };
}

export function median(values: number[]) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
