import type { CityPlan, Plan } from "../shared/types.ts";
import { money } from "./explain.ts";
import { isTicketed, wanted } from "./levers.ts";
import type { PlanEdit, Preference } from "./proposals.ts";
import { haversineKm } from "./routing.ts";

// "Tourbo asks" (PLAN §18 Q20): when the data is close or ambiguous, ask one 1-tap question instead
// of deciding silently. Pure detection over the saved plan (+ the run's other candidate cities from
// its trace); no AI, no fan-data calls. Answers record a Preference (Q19 feedback loop) and may carry
// an edit that goes through the owner's Apply. At most 2 visible at a time. Client-safe.

export type PromptKind = "close_city" | "break_even" | "deal" | "thin_data";
export type PromptOption = { id: string; label: string; edit?: PlanEdit[]; prefer: Preference };
export type DecisionPrompt = {
  id: string; // stable: kind + city (+ other city), so an answer hides it for good
  kind: PromptKind;
  night: number;
  city: string;
  question: string; // short, one line: "Columbus or Detroit?"
  detail: string; // one plain sentence with the numbers
  options: PromptOption[];
};

// A city the run scored but didn't pick (from its trace).
export type Alternative = { city: string; score: number; lat?: number; lon?: number; thinData?: boolean };

export const PROMPT_LIMITS = {
  closeScore: 3, // fan scores (0–100) within 3 points = "similar fans"
  breakEven: 0.08, // profit under 8% of the night's gross (or costs) = "barely breaks even"
  minKm: 40, // a detour difference under this isn't worth mentioning
  clearKm: 300, // the other city is this much further out of the way: no real choice, don't ask
  max: 2,
} as const;

const played = (s: CityPlan) => !!s.money && s.money.verdict !== "skip";
const km = (n: number) => `${Math.round(n).toLocaleString("en-US")} km`;

// Detour of visiting `c` at night i: in from the night before + out to the night after.
function detour(plan: Plan, i: number, c: { lat: number; lon: number }): number | undefined {
  const prev = plan.stops.slice(0, i).reverse().find(played)?.city;
  const next = plan.stops.slice(i + 1).find(played)?.city;
  if (!prev && !next) return undefined;
  const at = { name: "", region: plan.params.region, lat: c.lat, lon: c.lon };
  return (prev ? haversineKm(prev, at) : 0) + (next ? haversineKm(at, next) : 0);
}

function closeCity(plan: Plan, alts: Alternative[]): DecisionPrompt[] {
  const out: DecisionPrompt[] = [];
  const inPlan = new Set(plan.stops.map((s) => s.city.name.toLowerCase()));
  plan.stops.forEach((s, i) => {
    if (!played(s)) return;
    const rival = alts
      .filter((a) => !inPlan.has(a.city.toLowerCase()) && !a.thinData && Math.abs(a.score - s.score) <= PROMPT_LIMITS.closeScore)
      .sort((a, b) => Math.abs(a.score - s.score) - Math.abs(b.score - s.score))[0];
    if (!rival) return;
    const here = detour(plan, i, s.city);
    const there = rival.lat !== undefined && rival.lon !== undefined ? detour(plan, i, { lat: rival.lat, lon: rival.lon }) : undefined;
    const gap = here !== undefined && there !== undefined ? Math.round(there - here) : undefined;
    if (gap !== undefined && gap > PROMPT_LIMITS.clearKm) return;
    const shorter = gap !== undefined && Math.abs(gap) >= PROMPT_LIMITS.minKm ? (gap > 0 ? `${s.city.name} is ${km(gap)} shorter` : `${rival.city} is ${km(-gap)} shorter`) : undefined;
    out.push({
      id: `close_city:${s.city.name}:${rival.city}`,
      kind: "close_city",
      night: i,
      city: s.city.name,
      question: `${s.city.name} or ${rival.city}?`,
      detail: `Similar fans (fan score ${Math.round(s.score)} vs ${Math.round(rival.score)})${shorter ? `; ${shorter}` : ""}.`,
      options: [
        { id: "keep", label: `Keep ${s.city.name}`, prefer: { key: "city", value: `${s.city.name} over ${rival.city}`, city: s.city.name } },
        { id: "swap", label: `Play ${rival.city}`, edit: [{ op: "swap_city", night: i, city: rival.city }], prefer: { key: "city", value: `${rival.city} over ${s.city.name}`, city: rival.city } },
      ],
    });
  });
  return out;
}

function breakEven(plan: Plan): DecisionPrompt[] {
  const out: DecisionPrompt[] = [];
  const region = plan.params.region;
  plan.stops.forEach((s, i) => {
    const m = s.money;
    if (!m || !played(s) || m.profit < 0) return;
    if (m.profit > PROMPT_LIMITS.breakEven * Math.max(m.gross, m.costs, 1)) return;
    const w = wanted(s, region, plan.artist.kind);
    const smaller = isTicketed(m) && w && w / 0.9 < m.capacity ? Math.max(30, Math.round(w / 0.9)) : undefined;
    out.push({
      id: `break_even:${s.city.name}`,
      kind: "break_even",
      night: i,
      city: s.city.name,
      question: `Keep ${s.city.name}?`,
      detail: `It barely breaks even: about ${money(m.profit, m.currency)} profit on ${m.tickets.toLocaleString("en-US")} tickets (estimate).`,
      options: [
        { id: "keep", label: "Keep it", prefer: { key: "thin_margin", value: "keep", city: s.city.name } },
        ...(smaller ? [{ id: "smaller", label: `Smaller room (${smaller})`, edit: [{ op: "set_room" as const, night: i, capacity: smaller }], prefer: { key: "room", value: "smaller", city: s.city.name } }] : []),
        { id: "drop", label: "Drop it", edit: [{ op: "drop_night", night: i }], prefer: { key: "thin_margin", value: "drop", city: s.city.name } },
      ],
    });
  });
  return out;
}

function deal(plan: Plan): DecisionPrompt[] {
  const out: DecisionPrompt[] = [];
  plan.stops.forEach((s, i) => {
    const m = s.money;
    if (!m || m.verdict !== "co-headline") return;
    const w = wanted(s, plan.params.region, plan.artist.kind);
    const smaller = isTicketed(m) && w && w / 0.9 < m.capacity ? Math.max(30, Math.round(w / 0.9)) : undefined;
    out.push({
      id: `deal:${s.city.name}`,
      kind: "deal",
      night: i,
      city: s.city.name,
      question: `Share the bill in ${s.city.name}?`,
      detail: `It makes money (about ${money(m.profit, m.currency)}) but only ${Math.round(m.sellThrough * 100)}% of ${m.capacity.toLocaleString("en-US")} seats sell.`,
      options: [
        { id: "share", label: "Share the bill", prefer: { key: "deal", value: "co-headline", city: s.city.name } },
        ...(smaller ? [{ id: "smaller", label: `Headline a ${smaller}-cap room`, edit: [{ op: "set_room" as const, night: i, capacity: smaller }], prefer: { key: "room", value: "smaller", city: s.city.name } }] : []),
      ],
    });
  });
  return out;
}

function thinData(plan: Plan): DecisionPrompt[] {
  return plan.stops.flatMap((s, i) =>
    s.thinData && played(s)
      ? [{
          id: `thin_data:${s.city.name}`,
          kind: "thin_data" as const,
          night: i,
          city: s.city.name,
          question: `Keep ${s.city.name}?`,
          detail: `There's little fan data for ${s.city.name}, so its numbers are a rougher guess.`,
          options: [
            { id: "keep", label: "Keep it", prefer: { key: "thin_data", value: "keep", city: s.city.name } },
            { id: "drop", label: "Drop it", edit: [{ op: "drop_night" as const, night: i }], prefer: { key: "thin_data", value: "drop", city: s.city.name } },
          ],
        }]
      : [],
  );
}

const ORDER: PromptKind[] = ["close_city", "break_even", "deal", "thin_data"];

// Every open question, most useful first; `answered` ids are left out; at most `max` (default 2),
// never two about the same night.
export function detectPrompts(plan: Plan, opts: { alternatives?: Alternative[]; answered?: Iterable<string>; max?: number } = {}): DecisionPrompt[] {
  const answered = new Set(opts.answered ?? []);
  const all = [...closeCity(plan, opts.alternatives ?? []), ...breakEven(plan), ...deal(plan), ...thinData(plan)]
    .filter((p) => !answered.has(p.id))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.night - b.night);
  const seen = new Set<number>();
  const out: DecisionPrompt[] = [];
  for (const p of all) {
    if (seen.has(p.night)) continue;
    seen.add(p.night);
    out.push(p);
    if (out.length >= (opts.max ?? PROMPT_LIMITS.max)) break;
  }
  return out;
}

// Candidate cities the run scored (trace "scores" data) that aren't in the plan, with coordinates
// when the caller can look them up (cities.ts findCity).
export function alternativesFrom(scores: Map<string, number> | Record<string, number>, plan: Plan, locate?: (name: string) => { lat: number; lon: number } | undefined): Alternative[] {
  const inPlan = new Set(plan.stops.map((s) => s.city.name.toLowerCase()));
  const entries = scores instanceof Map ? [...scores] : Object.entries(scores);
  return entries
    .filter(([c]) => !inPlan.has(c.toLowerCase()))
    .map(([city, score]) => ({ city, score: Number(score), ...(locate?.(city) ?? {}) }))
    .filter((a) => Number.isFinite(a.score))
    .sort((a, b) => b.score - a.score);
}
