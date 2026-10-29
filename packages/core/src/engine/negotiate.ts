import type { PerformerKind, Region } from "../shared/types.ts";
import { REGION_DEFAULTS, evaluate, type Deal, type Demand, type Scenario } from "./economics.ts";

// Venue offer → accept / counter / walk away, against the act's own limits and the planned
// show. Deterministic so the negotiation never rests on the model's arithmetic.

export type Offer = { deal: Deal; price?: number; capacity?: number; guarantee?: number; split?: number };
export type Limits = { minGuarantee?: number; minDoorSplit?: number };
export type Assessment = {
  decision: "accept" | "counter" | "walk_away";
  offered: { take: number; profit: number; tickets: number; venueNet: number };
  planned: { profit: number; deal: string };
  counter?: Offer & { take: number; profit: number };
  reasons: string[];
  currency: string;
  estimate: true;
};

const NO_COSTS = { travelKm: 0, flights: 0, nights: 0, crew: 1, opener: false };

export function assessOffer(opts: {
  region: Region;
  kind: PerformerKind;
  draw: number; // estimated tickets at the reference price (ShowMoney.draw)
  capacity: number; // planned room capacity, used when the offer doesn't say
  price: number; // planned ticket price, used when the offer doesn't say
  costs: number; // the act's costs for this show (ShowMoney.costs)
  plannedProfit: number;
  plannedDeal: string;
  offer: Offer;
  limits?: Limits;
}): Assessment {
  const d = REGION_DEFAULTS[opts.region];
  const demand: Demand = { typicalDraw: opts.draw, relDemand: 1, draw: opts.draw, basis: "" };
  const s: Scenario = {
    deal: opts.offer.deal,
    price: opts.offer.deal === "bar_deal" ? 0 : (opts.offer.price ?? opts.price),
    capacity: opts.offer.capacity ?? opts.capacity,
    guarantee: opts.offer.guarantee,
    split: opts.offer.split,
  };
  const run = (sc: Scenario) => {
    const o = evaluate(opts.region, opts.kind, demand, sc, NO_COSTS);
    // Door net after fees and the house nut: the most a venue can pay without losing money.
    const venueNet = Math.round(Math.max(0, o.gross * 0.9 - sc.capacity * d.nutPerCap));
    return { take: o.artistTake, profit: Math.round(o.artistTake - opts.costs), tickets: o.tickets, venueNet };
  };
  const offered = run(s);
  const reasons: string[] = [];
  const target = Math.max(0, Math.round(opts.plannedProfit * 0.85));
  const lim = opts.limits ?? {};

  const guaranteed = s.deal === "guarantee" || s.deal === "versus" ? (s.guarantee ?? 0) : 0;
  const breaksGuarantee = lim.minGuarantee !== undefined && (s.deal === "guarantee" || s.deal === "versus") && guaranteed < lim.minGuarantee;
  const breaksSplit = lim.minDoorSplit !== undefined && (s.deal === "door_split" || s.deal === "versus") && (s.split ?? 0.7) < lim.minDoorSplit;
  if (breaksGuarantee) reasons.push(`guarantee ${guaranteed} is under your walk-away ${lim.minGuarantee}`);
  if (breaksSplit) reasons.push(`door split ${Math.round((s.split ?? 0.7) * 100)}% is under your minimum ${Math.round(lim.minDoorSplit! * 100)}%`);
  if (offered.profit < target) reasons.push(`expected profit ${offered.profit} vs ${target} needed (85% of the planned ${opts.plannedProfit})`);

  const base = { offered, planned: { profit: opts.plannedProfit, deal: opts.plannedDeal }, currency: d.currency, estimate: true as const };
  if (!reasons.length) return { ...base, decision: "accept", reasons: [`meets your limits; expected profit ${offered.profit}`] };

  // Counter: a versus deal at the venue's split (or 70%) with the guarantee that hits the target,
  // capped at what the room can pay from the door.
  const needTake = Math.max(opts.costs + target, lim.minGuarantee ?? 0);
  const split = Math.max(s.split ?? 0.7, lim.minDoorSplit ?? 0);
  // Leave the room ~15% of its door net, or no venue signs.
  const guarantee = Math.round(Math.min(needTake, offered.venueNet * 0.85) / 10) * 10;
  const counterScenario: Scenario = { ...s, deal: s.deal === "bar_deal" ? "door_split" : "versus", price: s.price || opts.price, guarantee, split };
  const counter = run(counterScenario);
  if (counter.profit < 0 || guarantee < (lim.minGuarantee ?? 0)) {
    reasons.push(`even 85% of what the door can pay (${Math.round(offered.venueNet * 0.85)}) leaves a loss or misses your walk-away; offer a support slot or skip`);
    return { ...base, decision: "walk_away", reasons };
  }
  return {
    ...base,
    decision: "counter",
    counter: { deal: counterScenario.deal, price: counterScenario.price, capacity: counterScenario.capacity, guarantee, split, take: counter.take, profit: counter.profit },
    reasons,
  };
}
