import { Plan } from "@tourbo/core/shared/types.ts";

import { UserError } from "../errors.ts";

// JSON from other agents (and Qloo) uses null where our schemas use optional fields.
const dropNulls = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(dropNulls) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)])) : v;

// tourbo_plan_tour returns compact money per stop ({verdict, why, currency, best}); widen it to
// the stored ShowMoney shape so both kinds of plan parse.
type Json = Record<string, any>;
function widenMoney(plan: unknown): unknown {
  const p = dropNulls(plan) as Json;
  if (!p || !Array.isArray(p.stops)) return p;
  return {
    ...p,
    stops: p.stops.map((s: Json) => {
      const m = s?.money as Json | undefined;
      if (!m?.best || m.deal) return s;
      const b = m.best as Json;
      const sc = (b.scenario ?? {}) as Json;
      return { ...s, money: { verdict: m.verdict, why: m.why, currency: m.currency, deal: sc.deal, price: sc.price, capacity: sc.capacity, tickets: b.tickets, sellThrough: b.sellThrough, gross: b.gross, artistTake: b.artistTake, costs: b.costs, profit: b.profit, relDemand: 1, draw: b.tickets, basis: "" } };
    }),
  };
}

// A Plan passed in by the caller (tourbo_plan_tour output or a saved plan's JSON).
export function planInput(plan: unknown): Plan {
  const parsed = Plan.safeParse(widenMoney(plan));
  if (!parsed.success) throw new UserError("That plan isn't in the expected shape: pass the plan JSON from tourbo_plan_tour as is, or use run_id.");
  return parsed.data;
}
