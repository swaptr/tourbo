import { discipline, ROOM_CAPACITY } from "../disciplines/index.ts";
import type { PerformerKind, Region } from "../shared/types.ts";

// Show economics. Qloo has no capacity, price or sales data, so every number here is an
// ESTIMATE built from: the act's own typical draw (room size or logged past shows) scaled by
// the city's relative Qloo fan demand, plus regional cost defaults. Formulas are returned
// with the result so the act can see (and override) every assumption.

export type Deal = "door_split" | "guarantee" | "versus" | "bar_deal" | "exhibition" | "commission" | "workshop" | "tips" | "supper_club";
export const DEALS: Deal[] = ["door_split", "guarantee", "versus", "bar_deal"];
// exhibition: visitors over the whole stay pay entry (often 0), split 50/50 with the space; the act
// earns mostly from sales per visitor (perHeadSales, already net of the space's commission).
// commission: a flat fee (mural, live painting) with no draw model.
// workshop: per-seat fee × seats (class size × sessions), the space keeps 30%, minus materials.
// tips: no ticket; people who stop put tips in the hat (tipsPerHead) and buy merch.
// supper_club: ticketed dinner; the space keeps 15% as hire, the act pays food per guest (perHeadCost).
const EXHIBITION_ENTRY_SHARE = 0.5;

type RegionDefaults = {
  currency: string;
  ticket: { musician: number; comedian: number }; // reference ticket price; other disciplines scale musician by ticketFactor
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
  // Rough regional defaults for world cities (USD unless the region has one dominant currency).
  latam: { currency: "USD", ticket: { musician: 18, comedian: 15 }, nutPerCap: 3, perKm: 0.4, flight: 180, lodging: 60, perDiem: 25, openerFee: 80, barPerHead: 1.5 },
  africa: { currency: "USD", ticket: { musician: 15, comedian: 12 }, nutPerCap: 2.5, perKm: 0.4, flight: 220, lodging: 60, perDiem: 25, openerFee: 70, barPerHead: 1.2 },
  asia: { currency: "USD", ticket: { musician: 35, comedian: 30 }, nutPerCap: 6, perKm: 0.5, flight: 160, lodging: 90, perDiem: 35, openerFee: 150, barPerHead: 3 },
  oceania: { currency: "AUD", ticket: { musician: 45, comedian: 40 }, nutPerCap: 9, perKm: 0.8, flight: 250, lodging: 160, perDiem: 60, openerFee: 250, barPerHead: 4 },
};

const ELASTICITY = 1.1; // demand falls ~1.1% per 1% price rise around the reference price
// Place features (places/, PLAN §18 Q18) may nudge the reference ticket for local incomes and the
// elasticity for price sensitivity; both bounded so fan demand, not income, still drives the price.
export type PriceAdjust = { priceFactor?: number; elasticity?: number };
const PRICE_FACTOR_MIN = 0.75;
const PRICE_FACTOR_MAX = 1.25;
const clampN = (n: number | undefined, lo: number, hi: number, dflt: number) => (n === undefined || !Number.isFinite(n) ? dflt : Math.min(hi, Math.max(lo, n)));
export const boundFactor = (f?: number) => clampN(f, PRICE_FACTOR_MIN, PRICE_FACTOR_MAX, 1);
const boundElasticity = (e?: number) => clampN(e, 0.9, 1.5, ELASTICITY);
// The local reference ticket: the region's reference × the place's price factor.
export const localRefPrice = (region: Region, kind: PerformerKind, adj: PriceAdjust = {}) => refPrice(region, kind) * boundFactor(adj.priceFactor);
const TICKET_FEES = 0.1;
const SPLIT: Record<Deal, number> = { door_split: 0.7, guarantee: 0, versus: 0.8, bar_deal: 0, exhibition: EXHIBITION_ENTRY_SHARE, commission: 0, workshop: 0.7, tips: 0, supper_club: 0.85 };
const ROOM_DEFAULT_CAPACITY: Record<string, number> = { ...ROOM_CAPACITY, bar: 120, "comedy club": 200, club: 400, "music venue": 500, "hall / theatre": 1200 };

export function refPrice(region: Region, kind: PerformerKind) {
  const t = REGION_DEFAULTS[region].ticket;
  return kind === "musician" || kind === "comedian" ? t[kind] : round(t.musician * discipline(kind).ticketFactor);
}
const FREE_ENTRY_BOOST = 1.4; // free-entry bar shows draw more walk-ins
// Workshop seat price: the discipline's fee × the region's musician reference ticket.
export const workshopPrice = (region: Region, kind: PerformerKind) => round(refPrice(region, "musician") * (discipline(kind).workshop?.fee ?? 1));
// Performances per stop (a run, seatings, pitches); demand over a run grows with √shows.
const showsAt = (kind: PerformerKind) => Math.max(1, discipline(kind).shows ?? 1);
// Lodging and per diem run for every day of a multi-day stop.
const stayCosts = (kind: PerformerKind, c: Costs): Costs => ({ ...c, nights: Math.max(c.nights, discipline(kind).stayDays > 1 ? discipline(kind).stayDays : c.nights) });

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

export function evaluate(region: Region, kind: PerformerKind, demand: Demand, s: Scenario, c: Costs, adj: PriceAdjust = {}): Outcome {
  const d = REGION_DEFAULTS[region];
  const ref = localRefPrice(region, kind, adj);
  const ELASTICITY = boundElasticity(adj.elasticity);
  if (s.deal === "exhibition" || s.deal === "commission") return evaluateStay(region, kind, demand, s, c, ref, ELASTICITY);
  if (s.deal === "workshop") return evaluateWorkshop(region, kind, demand, s, c, adj);
  const prof = discipline(kind);
  const shows = showsAt(kind);
  const free = s.deal === "bar_deal" || s.deal === "tips";
  const promoLift = s.promo ? 1 + Math.min(0.35, (s.promo / Math.max(ref, 1)) / Math.max(demand.draw, 1) * 2) : 1;
  const wanted = free ? demand.draw * FREE_ENTRY_BOOST : demand.draw * (s.price / ref) ** -ELASTICITY;
  const seats = s.capacity * shows;
  const tickets = Math.max(0, Math.min(seats, round(wanted * Math.sqrt(shows) * promoLift)));
  const gross = free ? 0 : tickets * s.price;
  const net = gross * (1 - TICKET_FEES);
  // Street pitches have no house costs; a supper club pays the space through its 15% share.
  const nut = s.deal === "tips" || s.deal === "supper_club" ? 0 : seats * d.nutPerCap;
  const split = s.split ?? SPLIT[s.deal];
  const doorShare = Math.max(0, net - nut) * split;
  const artistTake =
    s.deal === "guarantee" ? (s.guarantee ?? 0)
    : s.deal === "versus" ? Math.max(s.guarantee ?? 0, doorShare)
    : s.deal === "bar_deal" ? tickets * d.barPerHead
    : s.deal === "tips" ? tickets * ref * (prof.tipsPerHead ?? 0)
    : doorShare;
  // Food the act buys per guest (supper club); guest-chef fees (guarantee) leave food to the venue.
  const ownCost = s.deal === "supper_club" ? tickets * ref * (prof.perHeadCost ?? 0) : 0;
  // Merch, books, prints or workshop seats per attendee (0 for music and comedy).
  const sales = tickets * ref * prof.perHeadSales;
  const { total, breakdown } = costsFor(region, stayCosts(kind, c), s.promo);
  const profit = round(artistTake - ownCost + sales + (s.sponsor ?? 0) - total);
  // Lowest ticket price at which this show breaks even for the act on a door split.
  const breakEvenPrice = s.deal === "door_split" || s.deal === "versus" ? breakEven(demand, ref, s, shows, region, total - (s.sponsor ?? 0), ELASTICITY) : undefined;
  return {
    scenario: s,
    tickets,
    sellThrough: seats ? Math.round((tickets / seats) * 100) / 100 : 0,
    gross: round(gross),
    artistTake: round(artistTake - ownCost + sales),
    costs: total,
    profit,
    // Bar deal: the venue keeps ~60% of bar spend (≈5× the artist's per-head share) and runs lighter.
    venueProfit: round(
      s.deal === "bar_deal" ? tickets * d.barPerHead * 5 * 0.6 - artistTake - nut * 0.5
      : s.deal === "tips" ? 0
      : s.deal === "supper_club" ? net * (1 - split)
      : net - nut - artistTake,
    ),
    breakEvenPrice,
    costBreakdown: breakdown,
  };
}

// Classes: seats = class size (capped by the room) × sessions; the act's draw × takeUp wants a
// seat at the workshop price; the space keeps 30%, materials come off the act's share.
function evaluateWorkshop(region: Region, kind: PerformerKind, demand: Demand, s: Scenario, c: Costs, adj: PriceAdjust = {}): Outcome {
  const prof = discipline(kind);
  const ELASTICITY = boundElasticity(adj.elasticity);
  const w = prof.workshop ?? { fee: 1, classSize: 15, sessions: 1, takeUp: 0.1 };
  const wref = Math.max(1, workshopPrice(region, kind) * boundFactor(adj.priceFactor));
  const seats = Math.min(s.capacity, w.classSize) * w.sessions;
  const promoLift = s.promo ? 1 + Math.min(0.35, (s.promo / wref) / Math.max(demand.draw, 1) * 2) : 1;
  const wanted = demand.draw * w.takeUp * Math.sqrt(w.sessions) * (Math.max(s.price, 1) / wref) ** -ELASTICITY;
  const tickets = Math.max(0, Math.min(seats, round(wanted * promoLift)));
  const gross = tickets * s.price;
  const net = gross * (1 - TICKET_FEES);
  const split = s.split ?? SPLIT.workshop;
  const materials = tickets * refPrice(region, "musician") * (w.materials ?? 0);
  const sales = tickets * refPrice(region, kind) * prof.perHeadSales;
  const take = net * split - materials + sales;
  const { total, breakdown } = costsFor(region, stayCosts(kind, c), s.promo);
  return {
    scenario: s,
    tickets,
    sellThrough: seats ? Math.round((tickets / seats) * 100) / 100 : 0,
    gross: round(gross),
    artistTake: round(take),
    costs: total,
    profit: round(take + (s.sponsor ?? 0) - total),
    venueProfit: round(net * (1 - split)),
    costBreakdown: breakdown,
  };
}

// Multi-day stays: visitors accumulate over the stay (√days, a show's word of mouth fades), the
// space holds capacity × days, lodging and per diem run for every day.
function evaluateStay(region: Region, kind: PerformerKind, demand: Demand, s: Scenario, c: Costs, ref: number, ELASTICITY: number): Outcome {
  const d = REGION_DEFAULTS[region];
  const prof = discipline(kind);
  const days = Math.max(1, prof.stayDays);
  // A commission takes ~3 days on site, not the whole stay; its fee follows the region's music price, not entry.
  const { total, breakdown } = costsFor(region, { ...c, nights: Math.max(c.nights, s.deal === "commission" ? 3 : days) }, s.promo);
  if (s.deal === "commission") {
    const fee = round(refPrice(region, "musician") * (prof.commission ?? 0));
    return {
      scenario: { ...s, price: 0, guarantee: fee },
      tickets: 0,
      sellThrough: 1, // booked work; no draw involved
      gross: 0,
      artistTake: fee,
      costs: total,
      profit: round(fee + (s.sponsor ?? 0) - total),
      venueProfit: 0,
      costBreakdown: breakdown,
    };
  }
  const promoLift = s.promo ? 1 + Math.min(0.35, (s.promo / Math.max(ref, 1)) / Math.max(demand.draw, 1) * 2) : 1;
  const perDay = s.price > 0 ? demand.draw * (s.price / ref) ** -ELASTICITY : demand.draw * FREE_ENTRY_BOOST;
  const visitors = Math.max(0, Math.min(s.capacity * days, round(perDay * Math.sqrt(days) * promoLift)));
  const gross = visitors * s.price;
  const entry = gross * (1 - TICKET_FEES) * EXHIBITION_ENTRY_SHARE;
  const sales = visitors * ref * prof.perHeadSales;
  return {
    scenario: s,
    tickets: visitors,
    sellThrough: Math.round((visitors / Math.max(1, s.capacity * days)) * 100) / 100, // share of the space's visitor capacity over the stay
    gross: round(gross),
    artistTake: round(entry + sales),
    costs: total,
    profit: round(entry + sales + (s.sponsor ?? 0) - total),
    venueProfit: round(gross * (1 - TICKET_FEES) - entry + sales * 0.7), // the space's commission on sales
    costBreakdown: breakdown,
  };
}

function breakEven(demand: Demand, ref: number, s: Scenario, shows: number, region: Region, need: number, ELASTICITY: number) {
  const d = REGION_DEFAULTS[region];
  for (let p = ref * 0.3; p <= ref * 4; p += ref * 0.05) {
    const tickets = Math.min(s.capacity * shows, demand.draw * Math.sqrt(shows) * (p / ref) ** -ELASTICITY);
    const take = Math.max(0, tickets * p * (1 - TICKET_FEES) - s.capacity * shows * d.nutPerCap) * (s.split ?? SPLIT[s.deal]);
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
  // Set when place features moved the reference ticket or the price sensitivity (explainable).
  priceNudge?: PriceNudgeNote;
};

export type PriceNudgeNote = { factor: number; elasticity?: number; note: string };
// "price nudged −10% for local incomes" (one plain line for "why?").
export function priceNudgeNote(adj: PriceAdjust): PriceNudgeNote | undefined {
  const factor = boundFactor(adj.priceFactor);
  const elasticity = adj.elasticity === undefined ? undefined : Math.round(boundElasticity(adj.elasticity) * 100) / 100;
  if (Math.abs(factor - 1) < 0.005 && elasticity === undefined) return undefined;
  const pct = Math.round(Math.abs(factor - 1) * 100);
  const note =
    factor < 0.995 ? `price nudged −${pct}% for local incomes`
    : factor > 1.005 ? `price nudged +${pct}% for local spending power`
    : "price kept at the usual ticket; local price sensitivity applied";
  return { factor: Math.round(factor * 100) / 100, elasticity, note };
}

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
  priceFactor?: number; // place features: multiply the reference ticket (bounded 0.75–1.25, default 1)
  elasticity?: number; // place features: local price sensitivity (bounded 0.9–1.5, default 1.1)
}): Recommendation {
  const d = REGION_DEFAULTS[opts.region];
  const adj: PriceAdjust = { priceFactor: opts.priceFactor, elasticity: opts.elasticity };
  const ref = localRefPrice(opts.region, opts.kind, adj);
  const prices = opts.price ? [opts.price] : [0.6, 0.8, 1, 1.2, 1.5, 1.8].map((f) => round(ref * f));
  const wref = workshopPrice(opts.region, opts.kind) * boundFactor(opts.priceFactor);
  const shows = showsAt(opts.kind);
  const rooms = opts.rooms.length ? opts.rooms : [{ name: "default room", capacity: ROOM_DEFAULT_CAPACITY["music venue"] }];
  const outcomes: (Outcome & { room: string })[] = [];
  for (const room of rooms) {
    for (const deal of discipline(opts.kind).deals ?? DEALS) {
      if (deal === "commission" && room !== rooms[0]) continue; // one fee per city, not per room
      const dealPrices =
        deal === "bar_deal" || deal === "commission" || deal === "tips" ? [0]
        : deal === "exhibition" ? [0, round(ref * 0.5), ref]
        : deal === "workshop" ? [0.7, 1, 1.3].map((f) => round(wref * f))
        : prices;
      for (const price of dealPrices) {
        const guarantee = deal === "guarantee" || deal === "versus" ? round(Math.max(opts.minGuarantee ?? 0, demand0(opts.demand, room.capacity, shows) * ref * 0.35)) : undefined;
        const o = evaluate(opts.region, opts.kind, opts.demand, { deal, price, capacity: room.capacity, guarantee, promo: opts.promo, sponsor: opts.sponsor }, opts.costs, adj);
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
    best.profit >= 0 && (best.sellThrough >= 0.6 || ["exhibition", "commission", "tips"].includes(best.scenario.deal)) ? "headline"
    : best.profit >= 0 ? "co-headline"
    : opts.demand.relDemand >= 0.5 ? "support slot"
    : "skip";
  const fmt = (n: number) => `${d.currency} ${n.toLocaleString("en-US")}`;
  const days = discipline(opts.kind).stayDays;
  const why =
    best.scenario.deal === "commission" ? `A commissioned piece (mural or live painting) pays ${fmt(best.artistTake)} flat and nets ${fmt(best.profit)} after 3 days' costs.`
    : best.scenario.deal === "exhibition" && best.profit >= 0 ? `~${best.tickets} visitors over ${days} days (${best.scenario.price ? `${fmt(best.scenario.price)} entry` : "free entry"}); sales per visitor net ${fmt(best.profit)}.`
    : best.scenario.deal === "tips" && best.profit >= 0 ? `~${best.tickets} people stop over ${shows} pitches; tips and merch net ${fmt(best.profit)}.`
    : best.scenario.deal === "workshop" && best.profit >= 0 ? `${best.tickets} class seats at ${fmt(best.scenario.price)} (${Math.round(best.sellThrough * 100)}% full) net ${fmt(best.profit)}.`
    : best.scenario.deal === "supper_club" && best.profit >= 0 ? `${best.tickets} covers at ${fmt(best.scenario.price)} over ${shows} seating${shows > 1 ? "s" : ""}, after food, net ${fmt(best.profit)}.`
    : verdict === "headline" ? `${best.tickets} tickets (${Math.round(best.sellThrough * 100)}% of ${best.scenario.capacity}${shows > 1 ? ` × ${shows} shows` : ""}) on a ${best.scenario.deal.replace("_", " ")} nets ${fmt(best.profit)}.`
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
  const priceNudge = priceNudgeNote(adj);
  return { best, alternatives, verdict, why, currency: d.currency, demand: opts.demand, ...(priceNudge ? { priceNudge } : {}) };
}

const demand0 = (demand: Demand, capacity: number, shows = 1) => Math.min(capacity * shows, demand.draw * Math.sqrt(shows));

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
