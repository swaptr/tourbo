// What a home example card shows, precomputed once per example: every string already formatted,
// bars as 0–1 fractions, fixed slot counts, so a card swap is only text and value changes.
// Pure builder (unit-tested in tests/unit/example-view.test.ts) plus an idle-time prewarm cache.
import type { HomeExample } from "@tourbo/core/examples/types.ts";
import { DISCIPLINES } from "@tourbo/core/disciplines/index.ts";

export const FACT_SLOTS = 3;
export const ROUTE_SLOTS = 8;
export const LINE_SLOTS = 4;
export const COMPARE_LABELS = ["Fan strength", "Leans to the act", "Room fit", "Night profit", "Travel from home", "Local taste"] as const;

export type CompareRow = { label: string; chosen: string; skipped: string; chosenBar?: number; skippedBar?: number; chosenBetter: boolean };
export type ExampleView = Readonly<{
  id: string;
  act: string;
  kind: string; // "Singer / band"
  city: string; // home city
  continent: string; // "Europe"
  fan: number; // 0–100, the picked city's fan strength (list bar)
  hay: string; // lowercase act + city + kind, for the list filter
  feature: string; // "Offer check"
  byline: string; // "Arctic Monkeys, singer / band from Manchester"
  headline: string;
  facts: readonly string[]; // 1–3
  why: Readonly<{ line: string; reason?: string; chosen: string; skipped: string; rows: readonly CompareRow[]; note: string }> | null;
  details: Readonly<{ lines: readonly string[]; route: readonly { n: string; name: string; date: string; profit: string; loses: boolean }[]; total?: string; losing?: string }>;
}>;

export const FEATURE_LABEL: Record<HomeExample["feature"], string> = {
  route: "Route and money",
  offer: "Offer check",
  prep: "Show notes",
  rehearsal: "Rehearsal",
  pace: "Ticket pace",
  venue: "Room fit",
};

export const CONTINENT_LABEL: Record<HomeExample["home"]["continent"], string> = {
  africa: "Africa",
  asia: "Asia",
  europe: "Europe",
  north_america: "North America",
  south_america: "South America",
  oceania: "Oceania",
};

const kindLabel = (kind: string) => (DISCIPLINES as Record<string, { label: string }>)[kind]?.label ?? kind;
const int = new Intl.NumberFormat("en");
const moneyFmt = new Map<string, Intl.NumberFormat>();
export const money = (n: number, currency: string) => {
  let f = moneyFmt.get(currency);
  if (!f) moneyFmt.set(currency, (f = new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 })));
  return f.format(n);
};
const dayFmt = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const checkedFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const day = (iso: string) => dayFmt.format(new Date(iso));
const frac = (v: number) => Math.max(0.03, Math.min(1, v / 100));

// 2–3 facts under the headline: tour profit, the losing night, one local-taste line.
export function facts(ex: HomeExample): string[] {
  const out = [
    ex.tourProfit && `${ex.tourProfit.nights} nights, ${money(ex.tourProfit.amount, ex.tourProfit.currency)} estimated profit.`,
    !ex.tourProfit && ex.profit && `Best night: ${money(ex.profit.amount, ex.profit.currency)} estimated profit in ${ex.profit.city}.`,
    (ex.losingNight && `${ex.losingNight.loses ? "Losing night" : "Weakest night"}: ${ex.losingNight.line}`) ??
      (ex.compare && ex.compare.skipped.profit < 0 && `${ex.compare.skipped.name} would lose ${money(-ex.compare.skipped.profit, ex.compare.currency)} a night.`),
    ex.localTaste?.line,
  ].filter((f): f is string => !!f);
  for (const l of ex.decision.lines) if (out.length < 2 && !out.includes(l)) out.push(l);
  return out.slice(0, FACT_SLOTS);
}

export function buildExampleView(ex: HomeExample): ExampleView {
  const c = ex.compare;
  const why = c
    ? {
        line: c.line,
        reason: c.reason,
        chosen: c.chosen.name,
        skipped: c.skipped.name,
        rows: [
          { label: "Fan strength", chosen: `${Math.round(c.chosen.fanStrength)}`, skipped: `${Math.round(c.skipped.fanStrength)}`, chosenBar: frac(c.chosen.fanStrength), skippedBar: frac(c.skipped.fanStrength), chosenBetter: c.chosen.fanStrength > c.skipped.fanStrength },
          { label: "Leans to the act", chosen: `${c.chosen.lean.toFixed(1)}×`, skipped: `${c.skipped.lean.toFixed(1)}×`, chosenBetter: c.chosen.lean > c.skipped.lean },
          { label: "Room fit", chosen: c.chosen.roomFit, skipped: c.skipped.roomFit, chosenBetter: false },
          { label: "Night profit", chosen: money(c.chosen.profit, c.currency), skipped: money(c.skipped.profit, c.currency), chosenBetter: c.chosen.profit > c.skipped.profit },
          { label: "Travel from home", chosen: `${int.format(Math.round(c.chosen.travelKm))} km`, skipped: `${int.format(Math.round(c.skipped.travelKm))} km`, chosenBetter: c.chosen.travelKm < c.skipped.travelKm },
          { label: "Local taste", chosen: c.chosen.localTaste ?? "–", skipped: c.skipped.localTaste ?? "–", chosenBetter: false },
        ],
        note: `Fan data · checked ${checkedFmt.format(new Date(ex.checkedAt))} · every number is an estimate`,
      }
    : null;
  const currency = ex.tourProfit?.currency ?? ex.profit?.currency ?? c?.currency ?? "USD";
  const kind = kindLabel(ex.act.kind);
  return Object.freeze({
    id: ex.id,
    act: ex.act.name,
    kind,
    city: ex.home.city,
    continent: CONTINENT_LABEL[ex.home.continent] ?? ex.home.continent,
    fan: Math.round(ex.compare?.chosen.fanStrength ?? ex.medianFanStrength ?? 0),
    hay: `${ex.act.name} ${ex.home.city} ${kind}`.toLowerCase(),
    feature: FEATURE_LABEL[ex.feature] ?? "",
    byline: `${ex.act.name}, ${kind.toLowerCase()} from ${ex.home.city}`,
    headline: ex.decision.headline,
    facts: Object.freeze(facts(ex)),
    why: why && Object.freeze(why),
    details: Object.freeze({
      lines: Object.freeze(ex.decision.lines.slice(0, LINE_SLOTS)),
      route: Object.freeze((ex.route ?? []).slice(0, ROUTE_SLOTS).map((r, n) => ({ n: `${n + 1}`, name: r.name, date: r.date ? day(r.date) : "", profit: money(r.profit, currency), loses: r.profit < 0 }))),
      total: ex.tourProfit ? `${ex.tourProfit.nights} nights, ${money(ex.tourProfit.amount, ex.tourProfit.currency)} estimated profit` : undefined,
      losing: ex.losingNight?.line,
    }),
  });
}

// Cache: one view per example object, built lazily or ahead of time in idle slices.
const cache = new WeakMap<HomeExample, ExampleView>();
export function viewOf(ex: HomeExample | undefined): ExampleView | undefined {
  if (!ex) return undefined;
  let v = cache.get(ex);
  if (!v) cache.set(ex, (v = buildExampleView(ex)));
  return v;
}
// Build every view in idle time (a few ms per slice) so a hover swap never builds one.
export function prewarmViews(examples: HomeExample[]): () => void {
  let k = 0, handle = 0;
  const idle = typeof requestIdleCallback === "function" ? requestIdleCallback : (fn: IdleRequestCallback) => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 4 } as IdleDeadline), 1) as unknown as number;
  const cancel = typeof cancelIdleCallback === "function" ? cancelIdleCallback : clearTimeout;
  const run = (d: IdleDeadline) => {
    while (k < examples.length && d.timeRemaining() > 1) viewOf(examples[k++]);
    if (k < examples.length) handle = idle(run);
  };
  handle = idle(run);
  return () => cancel(handle);
}
