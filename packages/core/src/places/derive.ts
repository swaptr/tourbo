import { gdpUsd } from "./snapshot.ts";
import type { DateRisk, Derived, DerivedKey, Holiday, PlaceFact, PriceNudge, RawFeatures, SpendHeadroom, Tone, YoungerCrowd } from "./types.ts";

// Derived place features. Each is a small, explainable formula over raw features (and fan data
// where we have it); each one returns undefined when its inputs are missing. Pure; unit-tested in
// tests/unit/places.test.ts.

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;
const step = (n: number, s = 0.05) => Math.round(n / s) * s;

// Each region's reference ticket prices (engine/economics.ts REGION_DEFAULTS) were set for a
// typical market; this is the country they are pinned to.
export const REGION_ANCHOR: Record<string, string> = { na: "US", eu: "DE", in: "IN", latam: "MX", africa: "ZA", asia: "JP", oceania: "AU" };

// ── Price nudge ────────────────────────────────────────────────────────────────────────────────
// factor = clamp(countryRatio^0.3 × stateRatio^0.5, 0.75, 1.25), to the nearest 0.05
//   countryRatio = nominal GDP per person here ÷ the region anchor's (tickets are paid in nominal money)
//   stateRatio   = US state median household income ÷ US median (US only)
// Exponents < 1: touring ticket prices move far less than income across markets (acts keep a
// floor; venues price for the act). Bounded so fan demand, not income, still drives the price.
// elasticity = clamp(1.1 × ratio^-0.2, 0.9, 1.5): poorer markets are more price-sensitive
// (1.1 = the engine's default elasticity).
export function priceNudge(f: RawFeatures, region?: string, country?: string): PriceNudge | undefined {
  const anchor = region ? REGION_ANCHOR[region] : undefined;
  const here = f.gdpUsdPc?.value;
  const base = anchor ? gdpUsd(anchor) : undefined;
  const stateRatio = f.incomeVsNation?.value;
  if ((!here || !base) && !stateRatio) return undefined;
  const countryRatio = here && base && anchor !== country?.toUpperCase() ? here / base : 1;
  const ratio = countryRatio * (stateRatio ?? 1);
  const factor = r2(step(clamp(countryRatio ** 0.3 * (stateRatio ?? 1) ** 0.5, 0.75, 1.25)));
  return { factor, elasticity: r2(clamp(1.1 * ratio ** -0.2, 0.9, 1.5)), incomeRatio: r2(ratio), anchor };
}

// ── Younger crowd ──────────────────────────────────────────────────────────────────────────────
// place = clamp((35 − median age) / 8, −1, 1)       (35 ≈ midpoint of touring markets: US 38, IN 28)
// fan   = clamp(youth / 0.3, −1, 1)                 (youth = fan-data under-30 minus 45+, context/audience.ts)
// score = 0.7·fan + 0.3·place with fan data, else place alone (fan data is the hero)
// skew: younger ≥ 0.35, older ≤ −0.35; place-only needs |score| ≥ 0.75 to count.
export function youngerCrowd(f: RawFeatures, fanYouth?: number): YoungerCrowd | undefined {
  const age = f.medianAge?.value;
  if (age === undefined && fanYouth === undefined) return undefined;
  const place = age === undefined ? 0 : clamp((35 - age) / 8, -1, 1);
  const fromFanData = fanYouth !== undefined;
  const score = r2(fromFanData ? 0.7 * clamp(fanYouth / 0.3, -1, 1) + 0.3 * place : place);
  const cut = fromFanData ? 0.35 : 0.75;
  return { score, skew: score >= cut ? "younger" : score <= -cut ? "older" : "even", fromFanData };
}

// ── Tone ───────────────────────────────────────────────────────────────────────────────────────
// points = law (religious-offence law note +1, blasphemy death penalty +2)
//        + free expression (V-Dem < 0.3 → +2, < 0.6 → +1)
//        + split room (US state 2024 margin within 5 points → +0.5: half the room disagrees on politics)
//        + fan-data taste (city leans cleaner +0.5, edgier −0.5)
// strict ≥ 2, careful ≥ 1, else standard. Election lean is aggregate and only ever used as
// "politics splits this room", never to aim material at a side.
export function tone(f: RawFeatures, edge?: { lean: "edgier" | "cleaner" | "neutral" }): Tone | undefined {
  if (!f.freeExpression && !f.religiousLaw && !f.blasphemyDeathPenalty && !f.electionMargin && !edge) return undefined;
  const law = f.blasphemyDeathPenalty?.value ? 2 : f.religiousLaw?.value.length ? 1 : 0;
  const fe = f.freeExpression?.value;
  const speech = fe === undefined ? 0 : fe < 0.3 ? 2 : fe < 0.6 ? 1 : 0;
  const split = f.electionMargin && Math.abs(f.electionMargin.value) < 5 ? 0.5 : 0;
  const taste = edge?.lean === "cleaner" ? 0.5 : edge?.lean === "edgier" ? -0.5 : 0;
  const points = law + speech + split + taste;
  const strictness = points >= 2 ? "strict" : points >= 1 ? "careful" : "standard";
  const add = new Set<Tone["addTopics"][number]>();
  const advice: string[] = [];
  if (law) add.add("religion");
  if (speech >= 1) add.add("politics");
  if (strictness === "strict") ["religion", "politics", "head_of_state"].forEach((t) => add.add(t as Tone["addTopics"][number]));
  if (speech) advice.push("Speech is less free here: keep politics and leaders out of the set.");
  if (law) advice.push("Religious-offence laws apply here: leave faith out of jokes.");
  if (split) advice.push("This room splits close to 50/50 on politics: political bits lose half the crowd.");
  if (strictness === "strict") advice.push("Open clean and stay there unless the room tells you otherwise.");
  return { points: r2(points), strictness, addTopics: [...add], advice };
}

// ── Date risk ──────────────────────────────────────────────────────────────────────────────────
// flags: a public holiday on a show date or the day before (+1 each date, max 1), hot (mean daily
// max ≥ 35 °C), freezing (mean daily min ≤ −10 °C), wet (≥ 8 mm rain a day) for those dates in past
// years. level: 0 low, 1 medium, ≥ 2 high.
export function dateRisk(f: RawFeatures, dates: string[]): DateRisk | undefined {
  if (!dates.length || (!f.holidays && !f.weather)) return undefined;
  const hit: Holiday[] = [];
  const near = new Set(dates.flatMap((d) => [d, shift(d, 1)])); // the date, or a show the night before a holiday
  for (const h of f.holidays?.value ?? []) if (near.has(h.date)) hit.push(h);
  const reasons: string[] = [];
  if (hit.length) reasons.push(`Public holiday${hit.length > 1 ? "s" : ""} on or right after a show date: ${[...new Set(hit.map((h) => h.name))].join(", ")}.`);
  const w = f.weather?.value;
  if (w && w.meanMaxC >= 35) reasons.push(`Usually very hot then (about ${Math.round(w.meanMaxC)} °C).`);
  if (w && w.meanMinC <= -10) reasons.push(`Usually freezing then (about ${Math.round(w.meanMinC)} °C at night).`);
  if (w && w.rainMmPerDay >= 8) reasons.push(`Usually very wet then (about ${Math.round(w.rainMmPerDay)} mm of rain a day).`);
  return { level: reasons.length >= 2 ? "high" : reasons.length ? "medium" : "low", reasons, holidays: hit };
}
const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10);

// ── Spend headroom ─────────────────────────────────────────────────────────────────────────────
// share    = (ticket + merch per head, US$) ÷ monthly spending money per person (US$)
//   monthly per person = US state median household income ÷ 12 ÷ 2.5 people per household (US),
//                        else GDP per person (US$) × 0.6 household share ÷ 12
// relative = share ÷ the same share in the region's anchor market at the reference ticket
//            (reference prices were set for the anchor, so 1 = "as affordable as intended")
// tight: relative > 1.5 and share > 2 %; roomy: relative < 0.67 and share < 2 %; else ok.
// Country averages understate city crowds, so this only ever nudges merch/tiers, never the verdict.
export const monthlySpend = (f: RawFeatures) => (f.householdIncome ? f.householdIncome.value / 12 / 2.5 : f.gdpUsdPc ? (f.gdpUsdPc.value * 0.6) / 12 : undefined);
export function spendHeadroom(f: RawFeatures, spend?: { ticket: number; merch?: number; usdPerUnit: number }, anchor?: { monthlyUsd: number; spendUsd: number }): SpendHeadroom | undefined {
  if (!spend || !(spend.ticket > 0)) return undefined;
  const monthly = monthlySpend(f);
  if (!monthly) return undefined;
  const spendUsd = r2((spend.ticket + (spend.merch ?? 0)) * spend.usdPerUnit);
  const share = r2((spendUsd / monthly) * 100);
  const relative = anchor ? r2(spendUsd / monthly / (anchor.spendUsd / anchor.monthlyUsd)) : 1;
  const level = relative > 1.5 && share > 2 ? "tight" : relative < 0.67 && share < 2 ? "roomy" : "ok";
  return { share, relative, level, spendUsd, monthlyIncomeUsd: Math.round(monthly) };
}

const TOPIC_WORD: Record<Tone["addTopics"][number], string> = { religion: "religion", politics: "politics", head_of_state: "leaders" };

// ── Combination rule ───────────────────────────────────────────────────────────────────────────
// A derived feature surfaces only when it changes a suggestion; the returned line says what.
export function changes(d: Derived): Partial<Record<DerivedKey, string>> {
  const out: Partial<Record<DerivedKey, string>> = {};
  const p = d.priceNudge;
  if (p && Math.abs(p.factor - 1) >= 0.05) out.priceNudge = p.factor < 1 ? `Price about ${Math.round((1 - p.factor) * 100)}% below the usual ticket: money is tighter here.` : `Price about ${Math.round((p.factor - 1) * 100)}% above the usual ticket: people here can spend more.`;
  const y = d.youngerCrowd;
  if (y && y.skew !== "even") out.youngerCrowd = y.skew === "younger" ? "Younger crowd: lean to more recent songs and references." : "Older crowd: classics land better than this year's hits.";
  const t = d.tone;
  if (t && t.strictness !== "standard" && t.addTopics.length) out.tone = `Keep ${t.addTopics.map((x) => TOPIC_WORD[x]).join(", ")} out of the material here.`;
  const r = d.dateRisk;
  if (r && r.level !== "low") out.dateRisk = `Check the date: ${r.reasons.join(" ")}`;
  const s = d.spendHeadroom;
  if (s && s.level !== "ok") out.spendHeadroom = s.level === "tight" ? "Keep merch cheap or bundle it with the ticket: a night out is a big spend here." : "Room for a premium ticket or merch bundle: a night out is a small spend here.";
  return out;
}

// Facts for the explanation service: one claim each, refs = feature ids the claim rests on.
export function placeFacts(name: string, f: RawFeatures, d: Derived, surfaced: Partial<Record<DerivedKey, string>>): PlaceFact[] {
  const facts: PlaceFact[] = [];
  const add = (id: string, text: string, refs: string[], source: string, strong: boolean) => facts.push({ id: `place.${id}`, text, refs: refs.map((r) => `place.${r}`), strength: strong ? "strong" : "weak", source });
  if (d.priceNudge && surfaced.priceNudge) add("priceNudge", `${name}: spending money is ${d.priceNudge.incomeRatio}× the region's reference market, so tickets ×${d.priceNudge.factor}.`, ["gdpUsdPc", "incomeVsNation"].filter((k) => k in f), [f.gdpUsdPc?.source, f.householdIncome?.source].filter(Boolean).join(", "), true);
  if (d.youngerCrowd && surfaced.youngerCrowd) add("youngerCrowd", `${name}: ${d.youngerCrowd.skew} crowd${f.medianAge ? ` (median age ${f.medianAge.value})` : ""}${d.youngerCrowd.fromFanData ? ", confirmed by fan data" : ""}.`, ["medianAge"].filter((k) => k in f), f.medianAge?.source ?? "fan data", d.youngerCrowd.fromFanData);
  if (d.tone && surfaced.tone) add("tone", `${name}: ${d.tone.advice.join(" ")}`, ["freeExpression", "religiousLaw", "blasphemyDeathPenalty", "electionMargin"].filter((k) => k in f), ["freeExpression", "religiousLaw", "electionMargin"].map((k) => (f as Record<string, { source: string } | undefined>)[k]?.source).filter(Boolean).join(", "), d.tone.strictness === "strict");
  if (d.dateRisk && surfaced.dateRisk) add("dateRisk", `${name}: ${d.dateRisk.reasons.join(" ")}`, ["holidays", "weather"].filter((k) => k in f), [f.holidays?.source, f.weather?.source].filter(Boolean).join(", "), d.dateRisk.level === "high");
  if (d.spendHeadroom && surfaced.spendHeadroom) add("spendHeadroom", `${name}: a ticket plus merch is ${d.spendHeadroom.share}% of a month's spending money (${d.spendHeadroom.relative}× the reference market).`, ["householdIncome", "gdpUsdPc"].filter((k) => k in f), f.householdIncome?.source ?? f.gdpUsdPc?.source ?? "", false);
  return facts;
}
