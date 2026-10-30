// What a home example card shows, precomputed once per example: every string already formatted,
// bars as 0–1 fractions, fixed slot counts, so a card swap is only text and value changes.
// Pure builder (unit-tested in tests/unit/example-view.test.ts) plus an idle-time prewarm cache.
import type { HomeExample } from "@tourbo/core/examples/types.ts";
import { DISCIPLINES } from "@tourbo/core/disciplines/index.ts";
import { soldShare } from "@tourbo/core/engine/pace.ts";
import { runOf } from "@tourbo/core/examples/check.ts";

export const FACT_SLOTS = 3;
export const ROUTE_SLOTS = 8;
export const LINE_SLOTS = 4;
export const COMPARE_LABELS = ["Fan strength", "Fan pull for its size", "Room fit", "Night profit", "Travel from home", "Local taste"] as const;

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
  why: WhyView | null; // explains this example's own headline, one shape per kind of decision
  details: Readonly<{ lines: readonly string[]; route: readonly { n: string; name: string; date: string; profit: string; loses: boolean }[]; total?: string; losing?: string }>;
}>;

export type LedgerRow = { label: string; value: string; bar?: number; strong?: boolean };
export type WhyView = Readonly<
  | { kind: "compare"; line: string; reason?: string; chosen: string; skipped: string; rows: readonly CompareRow[]; note: string }
  // offer: the deal math behind "counter" / "walk away"
  | { kind: "deal"; title: string; rows: readonly LedgerRow[]; note: string }
  // show notes: the fan facts the lines are built on
  | { kind: "fans"; title: string; city: string; strength: number; rank?: string; lines: readonly string[]; note: string }
  // rehearsal: the rehearsed line, then what each local listener said about it
  | { kind: "personas"; title: string; line?: string; rows: readonly { who: string; loved: boolean; verb: string; quote: string }[]; note: string }
  // ticket pace / room: counts against the room
  | { kind: "ledger"; title: string; rows: readonly LedgerRow[]; lines: readonly string[]; note: string }
>;

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

// Machine-shaped decision lines (raw numbers, no units) stay off the card.
const RAW_LINE = /^expected profit \d+ vs \d+ needed/i;
// Booking words read as agent talk: "Best deal: versus at $45" → what the deal actually is.
const plainLine = (l: string) =>
  l
    .replace(/^Best deal: versus at (\S+)$/, "Best deal: a guarantee or a share of the door, whichever pays more, with $1 tickets")
    .replace(/^Best deal: exhibition at (\S+)$/, "Best deal: $1 entry tickets");
const cleanLines = (ex: HomeExample) => ex.decision.lines.filter((l) => !RAW_LINE.test(l)).map(plainLine);

// Up to 3 facts, all about the headline's decision. A route example's facts are the tour's money
// and its weakest night; every other kind (pace, offer, room, notes, rehearsal) uses its own lines.
export function facts(ex: HomeExample): string[] {
  if (ex.feature === "rehearsal") {
    const ps = personas(ex);
    const loved = ps.filter((p) => p.loved).length;
    const out = [
      ps.length ? `${ps.length} simulated local listener${ps.length > 1 ? "s" : ""} reacted: ${loved} loved it${ps.length - loved ? `, ${ps.length - loved} winced` : ""}.` : undefined,
      ex.localTaste && ex.localTaste.city === ex.room?.city ? ex.localTaste.line : undefined,
    ].filter((f): f is string => !!f);
    return out.length ? out : cleanLines(ex).slice(0, FACT_SLOTS);
  }
  if (ex.feature !== "route") return cleanLines(ex).slice(0, FACT_SLOTS);
  const out = [
    ex.tourProfit && `${ex.tourProfit.nights} nights, ${money(ex.tourProfit.amount, ex.tourProfit.currency)} estimated profit.`,
    !ex.tourProfit && ex.profit && `Best night: ${money(ex.profit.amount, ex.profit.currency)} estimated profit in ${ex.profit.city}.`,
    (ex.losingNight && (ex.losingNight.loses ? `Losing night: ${ex.losingNight.line}` : ex.losingNight.line)) ??
      (ex.compare && ex.compare.skipped.profit < 0 && `${ex.compare.skipped.name} would lose ${money(-ex.compare.skipped.profit, ex.compare.currency)} a night.`),
    ex.localTaste?.line,
  ].filter((f): f is string => !!f);
  for (const l of cleanLines(ex)) if (out.length < 2 && !out.includes(l)) out.push(l);
  return out.slice(0, FACT_SLOTS);
}

export function buildExampleView(ex: HomeExample): ExampleView {
  // The city-vs-city table explains a route pick only; on other kinds it would be a second decision.
  const c = ex.feature === "route" ? ex.compare : undefined;
  const shown = facts(ex);
  const compare = c
    ? {
        kind: "compare" as const,
        line: c.line.replace(/(\d+(?:\.\d+)?)× the fan pull/g, (m, n: string) => (Number(n) > 10 ? "over 10× the fan pull" : m)),
        reason: c.reason,
        chosen: c.chosen.name,
        skipped: c.skipped.name,
        rows: [
          { label: "Fan strength", chosen: `${Math.round(c.chosen.fanStrength)}`, skipped: `${Math.round(c.skipped.fanStrength)}`, chosenBar: frac(c.chosen.fanStrength), skippedBar: frac(c.skipped.fanStrength), chosenBetter: c.chosen.fanStrength > c.skipped.fanStrength },
          { label: "Fan pull for its size", chosen: leanText(c.chosen.lean), skipped: leanText(c.skipped.lean), chosenBetter: c.chosen.lean > c.skipped.lean },
          { label: "Room fit", chosen: c.chosen.roomFit.replace(/ for .*$/, ""), skipped: c.skipped.roomFit.replace(/ for .*$/, ""), chosenBetter: false },
          { label: "Night profit", chosen: money(c.chosen.profit, c.currency), skipped: money(c.skipped.profit, c.currency), chosenBetter: c.chosen.profit > c.skipped.profit },
          { label: "Travel from home", chosen: `${int.format(Math.round(c.chosen.travelKm))} km`, skipped: `${int.format(Math.round(c.skipped.travelKm))} km`, chosenBetter: c.chosen.travelKm < c.skipped.travelKm },
          { label: "Local taste", chosen: c.chosen.localTaste ?? "–", skipped: c.skipped.localTaste ?? "–", chosenBetter: false },
        ].filter((r) => r.label !== "Local taste" || r.chosen !== "–" || r.skipped !== "–"), // no row of dashes
        note: noteOf(ex),
      }
    : null;
  // A route card without a comparison is explained by its own nights and money.
  const routeWhy: WhyView | null =
    ex.feature === "route" && !compare && ex.route?.length
      ? { kind: "ledger", title: "The route and its money", rows: ex.route.slice(0, ROUTE_SLOTS).map((r) => ({ label: `${r.name}${r.date ? `, ${day(r.date)}` : ""}`, value: money(r.profit, ex.tourProfit?.currency ?? "USD") })), lines: ex.tourProfit ? [`${ex.tourProfit.nights} nights, ${money(ex.tourProfit.amount, ex.tourProfit.currency)} estimated profit.`] : [], note: noteOf(ex) }
      : null;
  const why: WhyView | null = ex.feature === "route" ? (compare ?? routeWhy) : otherWhy(ex);
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
    // "home" is the city the example tour was planned around (a seed), not the act's hometown.
    byline: `${ex.act.name}, ${kind.toLowerCase()} · around ${ex.home.city}`,
    headline: headlineOf(ex),
    facts: Object.freeze(shown),
    why: why && Object.freeze(why),
    details: Object.freeze({
      lines: Object.freeze(cleanLines(ex).filter((l) => !shown.includes(l) && l !== c?.line).slice(0, LINE_SLOTS)),
      route: Object.freeze((ex.route ?? []).slice(0, ROUTE_SLOTS).map((r, n) => ({ n: `${n + 1}`, name: r.name, date: r.date ? day(r.date) : "", profit: money(r.profit, currency), loses: r.profit < 0 }))),
      total: ex.tourProfit ? `${ex.tourProfit.nights} nights, ${money(ex.tourProfit.amount, ex.tourProfit.currency)} estimated profit` : undefined,
      losing: ex.feature === "route" ? undefined : ex.losingNight?.line, // a route card already shows it as a fact
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

// "×" lean, capped: a near-empty city makes the ratio read as broken (436.0×).
function leanText(lean: number) {
  if (!(lean > 0.05)) return "—";
  return lean > 10 ? ">10×" : `${lean.toFixed(1)}×`;
}

// Booking shorthand reads as agent talk on the showcase: "Counter: $9,000 vs 70% of the door" →
// "Ask for $9,000 or 70% of ticket sales, whichever pays more".
function plainHeadline(h: string) {
  return h.replace(/^Counter:\s*(.+?)\s+vs\s+(\d+)% of the door$/, "Ask for $1 or $2% of ticket sales, whichever pays more");
}

const noteOf = (ex: HomeExample) => `Fan data · checked ${checkedFmt.format(new Date(ex.checkedAt))} · every number is an estimate`;
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
const part = (n: number, of: number) => (of > 0 ? Math.max(0.03, Math.min(1, n / of)) : undefined);

// Rehearsal lines: "The scene regular winced at line 2: “…”". Only line 1 of the rehearsed set is
// stored (quoted in the headline). With reactions to line 1, the card quotes it and shows only
// those; otherwise it quotes no line and shows each reaction on its own words, never "line 2"
// (a line the card can't show).
function allPersonas(ex: HomeExample) {
  return ex.decision.lines.flatMap((l) => {
    const m = l.match(/^The (.+?) (loved|liked|winced at|shrugged at|didn't buy) line (\d+): “(.+)”$/);
    return m ? [{ who: m[1].replace(/^./, (c) => c.toUpperCase()), loved: m[2] === "loved" || m[2] === "liked", verb: m[2] === "winced at" || m[2] === "shrugged at" ? m[2].replace(" at", "") : m[2], line: Number(m[3]), quote: m[4] }] : [];
  });
}
function personas(ex: HomeExample) {
  const all = allPersonas(ex);
  const first = all.filter((p) => p.line === 1);
  return (first.length ? first : all).map(({ line: _, ...p }) => p);
}
// The stored line 1 is cut at 70 characters ("…"): show only its complete sentences, or nothing.
export function completeLine(headline: string): string | undefined {
  const q = headline.match(/: “(.+)”$/)?.[1];
  if (!q) return undefined;
  if (!q.endsWith("…")) return q;
  const cut = q.slice(0, -1).match(/^(.*[.!?])\s/)?.[1] ?? (/[.!?]$/.test(q.slice(0, -1)) ? q.slice(0, -1) : undefined);
  return cut && cut.length >= 12 ? cut : undefined;
}
const rehearsedLine = (ex: HomeExample) => (allPersonas(ex).some((p) => p.line === 1) ? completeLine(ex.decision.headline) : undefined);
function headlineOf(ex: HomeExample) {
  if (ex.feature === "rehearsal") {
    const city = ex.decision.headline.match(/^Rehearsal in (.+?):/)?.[1] ?? ex.room?.city ?? "";
    const line = rehearsedLine(ex);
    return line ? `Rehearsal in ${city}: “${line}”` : `Rehearsal in ${city}: how local listeners took the opening line`;
  }
  return plainHeadline(ex.decision.headline);
}

// "why?" for every kind but route, built only from the example's own data; null when the lines
// don't carry what the shape needs (the card then shows no "why?").
function otherWhy(ex: HomeExample): WhyView | null {
  const L = ex.decision.lines;
  const note = noteOf(ex);
  if (ex.feature === "offer") {
    const offer = L.map((l) => l.match(/^(.+?) offered (.+?) flat$/)).find(Boolean);
    const nets = L.map((l) => l.match(/^(?:With merch and sales on top of the fee, t|T)hat nets ~?(\S+); the plan (?:for this room )?expects ~?(\S+)$/)).find(Boolean);
    if (!offer || !nets) return null;
    const plan = num(nets[2]);
    const rows: LedgerRow[] = [
      { label: `${offer[1]} offers`, value: `${offer[2]} flat` },
      { label: /^With merch/.test(L.find((l) => l.includes("nets")) ?? "") ? "You'd net, with merch" : "You'd net", value: `~${nets[1]}`, bar: part(num(nets[1]), plan) },
      { label: "Plan for this room", value: `~${nets[2]}`, bar: 1 },
    ];
    const counter = ex.decision.headline.match(/^Counter:\s*(.+?)\s+vs\s+(\d+)% of the door$/);
    const cNets = L.map((l) => l.match(/^The counter nets ~?(\S+)/)).find(Boolean);
    const floor = L.map((l) => l.match(/^expected profit (\d+) vs (\d+) needed \((\d+)% of the planned (\d+)\)/)).find(Boolean);
    if (counter) rows.push({ label: "Ask for", value: `${counter[1]} or ${counter[2]}% of ticket sales`, strong: true });
    if (cNets) rows.push({ label: "That nets", value: `~${cNets[1]}`, bar: part(num(cNets[1]), plan), strong: true });
    if (floor) {
      const cur = ex.profit?.currency ?? "USD";
      rows.push({ label: "Lowest worth taking", value: `~${money(Number(floor[2]), cur)} net (${floor[3]}% of the plan)`, bar: part(Number(floor[2]), plan), strong: true });
    }
    return { kind: "deal", title: counter ? "Why ask for more" : "Why walk away", rows, note };
  }
  if (ex.feature === "prep") {
    const cityName = ex.decision.headline.match(/^Show notes for (.+)$/)?.[1] ?? ex.room?.city ?? ex.cities[0]?.name;
    const c = ex.cities.find((x) => x.name === cityName) ?? ex.cities[0];
    if (!c || !cityName) return null;
    const lines = [ex.localTaste?.city === cityName && ex.localTaste.line, ex.surprise?.city === cityName && ex.surprise.line, ex.room?.city === cityName && `The room: ${ex.room.name}${ex.room.capacity ? `, ~${int.format(ex.room.capacity)} capacity` : ""}.`].filter((l): l is string => !!l);
    const rank = c.why?.rank && c.why.of ? `#${c.why.rank} of ${c.why.of} cities near ${ex.home.city}` : undefined;
    return { kind: "fans", title: "What the notes are built on", city: cityName, strength: Math.round(c.fanStrength), rank, lines, note };
  }
  if (ex.feature === "rehearsal") {
    const rows = personas(ex);
    const line = rehearsedLine(ex);
    // A rehearsal, not a prediction (story 12): the reactions are simulated, built on fan data.
    return rows.length ? { kind: "personas", title: "Simulated listeners", line, rows, note: `Simulated reactions (built from this city's fan data) · checked ${checkedFmt.format(new Date(ex.checkedAt))}` } : null;
  }
  if (ex.feature === "pace") {
    const h = ex.decision.headline.match(/(\d[\d,]*) of (\d[\d,]*) sold with (\d+) days to go/);
    const p = L[0]?.match(/On pace for ~?(\d[\d,]*) of (\d[\d,]*) planned/);
    if (!h) return null;
    const planned = num(h[2]);
    // The same rule of thumb the pace check uses: half of a small show's tickets sell in the last 10 days.
    const byNow = Math.max(1, Math.round(planned * soldShare(Number(h[3]))));
    const rows: LedgerRow[] = [
      { label: "Sold so far", value: `${h[1]} of ${h[2]}`, bar: part(num(h[1]), planned), strong: true },
      { label: "Expected by now", value: `~${int.format(byNow)}`, bar: part(byNow, planned) },
      ...(p ? [{ label: "On pace for", value: `~${p[1]} by the show`, bar: part(num(p[1]), planned) }] : []),
      { label: "Days to go", value: h[3] },
    ];
    // A run (an exhibition's days, a multi-night run) holds the room's capacity once per day or show.
    const run = ex.room?.capacity && planned > ex.room.capacity ? runOf(ex.act.kind) : undefined;
    const room = ex.room && ex.room.capacity ? [`The room: ${ex.room.name}, ~${int.format(ex.room.capacity)} ${run?.unit ? `${run.unit === "days" ? "at a time" : "a show"}, ~${int.format(ex.room.capacity * run.n)} over ${run.n} ${run.unit}` : "capacity"}.`] : [];
    const status = ex.decision.headline.match(/: (ahead|behind|on track|on pace),/)?.[1];
    return { kind: "ledger", title: status ? `Why it's ${status}` : "Sold against the plan", rows, lines: [...cleanLines(ex).slice(1), ...room], note };
  }
  if (ex.feature === "venue") {
    // "Right size for ~1,400 expected (theatre, ~1,600 seats)" or, for a run,
    // "Right size for ~5,600 visitors over 14 days (museum, ~400 at a time)".
    const m = L[0]?.match(/^Right size for ~?(\d[\d,]*) (expected|visitors over \d+ days|tickets over \d+ shows) \((.+?), ~?(\d[\d,]*) (seats|at a time|a show)\)$/);
    const c = ex.cities.find((x) => x.name === ex.room?.city) ?? ex.cities[0];
    if (!m) return null;
    const run = m[2].match(/over (\d+)/);
    const seats = num(m[4]) * (run ? Number(run[1]) : 1), expected = num(m[1]);
    const rows: LedgerRow[] = [
      ...(ex.room ? [{ label: "Room", value: ex.room.name }] : []),
      { label: run ? "Room holds" : "Seats", value: run ? `~${m[4]} ${m[5]} (${m[3]}), ~${int.format(seats)} ${m[2].replace(/^\S+ /, "")}` : `~${m[4]} (${m[3]})`, bar: part(seats, Math.max(seats, expected)) },
      { label: "Expected", value: `~${m[1]}${run ? ` ${m[2].split(" ")[0]}` : ""}`, bar: part(expected, Math.max(seats, expected)), strong: true },
      ...(c ? [{ label: `Fans in ${c.name}`, value: `${Math.round(c.fanStrength)} of 100` }] : []),
    ];
    return { kind: "ledger", title: "Why this room", rows, lines: cleanLines(ex).slice(1), note };
  }
  return null;
}
