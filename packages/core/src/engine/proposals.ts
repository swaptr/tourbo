import type { CityPlan, Plan } from "../shared/types.ts";
import { diffPlans, isTicketed, repriceStop, retotal, type PlanDiff } from "./levers.ts";

// Proposals (PLAN §18 Q20): what Ask Tourbo and Tourbo's questions suggest. Nothing here changes a
// saved plan; a proposal is shown as a card (what changes + deltas) and only the owner's Apply
// commits it. Client-safe.
//
// PlanEdit is the edit contract shared with the plan editor (PLAN Q19): engine/edit.ts
// applyPlanEdits applies every op on the run's own candidates (no fan-data calls) and is the one
// write path (apps/web/server/agent/edits.server.ts). applyLocalEdits here stays for quick
// client-side previews of the ops that need no candidates.

export type PlanEdit =
  | { op: "drop_night"; night: number }
  | { op: "restore_night"; night: number }
  | { op: "set_price"; night?: number; price: number } // night omitted = every ticketed night
  | { op: "set_room"; night: number; capacity: number }
  | { op: "swap_venue"; night: number; venue: "backup" | (string & {}) } // "backup" or a room id from the run's candidates
  | { op: "set_date"; night: number; date: string }
  | { op: "swap_city"; night: number; city: string; venueId?: string }
  | { op: "add_night"; city: string; after?: number }
  | { op: "reorder"; night: number; to: number };

export const LOCAL_OPS = new Set<PlanEdit["op"]>(["drop_night", "restore_night", "set_price", "set_room", "swap_venue", "set_date"]);
export const needsServer = (edits: PlanEdit[]) => edits.some((e) => !LOCAL_OPS.has(e.op));

// Structured preferences for ideas, sets and show notes ("more 90s covers", "no politics in Bengaluru").
export type Constraint =
  | { kind: "era"; from?: number; to?: number; city?: string } // covers / references from these years
  | { kind: "avoid"; topic: string; city?: string } // a topic to keep out (context TOPICS key or plain words)
  | { kind: "more"; what: string; city?: string } // more of an idea category or theme
  | { kind: "less"; what: string; city?: string };

// Answers to Tourbo's questions and other soft preferences (feed the Q19 feedback loop).
export type Preference = { key: string; value: string; city?: string; at?: string };

export type ProposalStatus = "pending" | "applied" | "discarded" | "undone";
export type Proposal = {
  id: string;
  title: string; // "Drop Detroit and use a smaller room in Columbus"
  kind: "edit" | "constraint";
  edits?: PlanEdit[];
  constraints?: Constraint[];
  diff?: PlanDiff; // money / km / tickets deltas against the plan it was made for
  changes: string[]; // one line per changed night: "Columbus: room 800 → 450"
  status: ProposalStatus;
  createdAt: string;
};

export class EditError extends Error {} // message is one plain sentence

const night = (plan: Plan, i: number): CityPlan => {
  const s = plan.stops[i];
  if (!s) throw new EditError(`There's no night ${i + 1} in this plan.`);
  return s;
};

const label = (s: CityPlan) => s.city.name;

// Applies the ops that need no fan data, in order. Throws EditError for anything it can't do.
export function applyLocalEdits(plan: Plan, edits: PlanEdit[]): { plan: Plan; changes: string[] } {
  const region = plan.params.region;
  const kind = plan.artist.kind;
  let stops = [...plan.stops];
  const changes: string[] = [];
  const cur = () => ({ ...plan, stops });
  for (const e of edits) {
    if (e.op === "drop_night") {
      const s = night(cur(), e.night);
      if (!s.money) throw new EditError(`${label(s)} has no money estimate to drop.`);
      if (s.money.verdict === "skip") continue;
      stops[e.night] = { ...s, money: { ...s.money, verdict: "skip", reason: "You dropped this night." } };
      changes.push(`${label(s)}: dropped`);
    } else if (e.op === "restore_night") {
      const s = night(cur(), e.night);
      if (!s.money || s.money.verdict !== "skip") continue;
      const back = repriceStop({ ...s, money: { ...s.money, verdict: "headline" } }, region, kind, { reason: "You put this night back." });
      stops[e.night] = back;
      changes.push(`${label(s)}: back in the tour`);
    } else if (e.op === "set_price") {
      if (!(e.price > 0)) throw new EditError("A ticket price has to be more than zero.");
      const targets = e.night === undefined ? stops.map((_, i) => i) : [e.night];
      for (const i of targets) {
        const s = night(cur(), i);
        if (!isTicketed(s.money) || s.money!.verdict === "skip" || s.money!.price === e.price) continue;
        stops[i] = repriceStop(s, region, kind, { price: e.price, reason: "Your ticket price." });
        changes.push(`${label(s)}: ticket ${s.money!.price} → ${e.price}`);
      }
    } else if (e.op === "set_room") {
      const s = night(cur(), e.night);
      if (!s.money) throw new EditError(`${label(s)} has no money estimate to change.`);
      if (!(e.capacity >= 10)) throw new EditError("A room needs at least 10 seats.");
      stops[e.night] = repriceStop(s, region, kind, { capacity: e.capacity, reason: "Your room size." });
      changes.push(`${label(s)}: room ${s.money.capacity} → ${Math.round(e.capacity)}`);
    } else if (e.op === "swap_venue") {
      const s = night(cur(), e.night);
      if (e.venue !== "backup" && e.venue !== s.backupVenue?.id) throw new EditError("That room needs the plan editor (engine/edit.ts).");
      if (!s.backupVenue) throw new EditError(`${label(s)} has no backup venue to swap to.`);
      stops[e.night] = { ...s, venue: s.backupVenue, backupVenue: s.venue };
      changes.push(`${label(s)}: ${s.venue?.name ?? "venue"} → ${s.backupVenue.name}`);
    } else if (e.op === "set_date") {
      const s = night(cur(), e.night);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new EditError("Dates look like 2026-11-14.");
      if (s.date === e.date) continue;
      stops[e.night] = { ...s, date: e.date };
      changes.push(`${label(s)}: ${s.date ?? "no date"} → ${e.date}`);
    } else {
      throw new EditError("That change needs fresh fan numbers for the new city.");
    }
    stops = [...stops];
  }
  return { plan: retotal(plan, stops), changes };
}

export function previewLocal(plan: Plan, edits: PlanEdit[]): { plan: Plan; diff: PlanDiff; changes: string[] } {
  const r = applyLocalEdits(plan, edits);
  return { ...r, diff: diffPlans(plan, r.plan) };
}

// Plain one-liner for a constraint card.
export function constraintLine(c: Constraint): string {
  const where = c.city ? ` in ${c.city}` : "";
  if (c.kind === "era") {
    const span = c.from && c.to ? (c.to - c.from === 9 && c.from % 10 === 0 ? `the ${String(c.from).slice(2)}s` : `${c.from}–${c.to}`) : c.from ? `after ${c.from}` : c.to ? `before ${c.to}` : "any year";
    return `Covers and references from ${span}${where}`;
  }
  if (c.kind === "avoid") return `Keep ${c.topic} out${where}`;
  if (c.kind === "more") return `More ${c.what}${where}`;
  return `Less ${c.what}${where}`;
}
