// Place features (PLAN §18 Q18): every derived feature on fixtures, no network.
// node --test tests/unit/places.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { changes, dateRisk, priceNudge, spendHeadroom, tone, youngerCrowd } from "../../packages/core/src/places/derive.ts";
import { placeFeatures, resolvePlace } from "../../packages/core/src/places/index.server.ts";
import { weatherWindows } from "../../packages/core/src/places/live.server.ts";
import { staticFeatures, usState } from "../../packages/core/src/places/snapshot.ts";
import type { Feature, RawFeatures } from "../../packages/core/src/places/types.ts";

const feat = <T>(value: T, scope: Feature["scope"] = "country"): Feature<T> => ({ value, unit: "", source: "fixture", year: 2025, confidence: "high", scope });

test("snapshots: countries, V-Dem, US states load with sane values", () => {
  const us = staticFeatures("US", "TX").features;
  assert.ok(us.gdpUsdPc!.value > 50_000 && us.medianAge!.value > 30);
  assert.ok(us.householdIncome!.value > 40_000 && us.incomeVsNation!.value > 0.5);
  assert.equal(typeof us.electionMargin!.value, "number");
  const pk = staticFeatures("PK").features;
  assert.equal(pk.blasphemyDeathPenalty?.value, true);
  assert.ok(pk.freeExpression!.value < 0.8);
  assert.deepEqual(staticFeatures("ZZ").missing, ["country indicators", "free expression index"]);
  assert.equal(usState("Richmond, Virginia"), "VA");
  assert.equal(usState("Austin, TX"), "TX");
});

test("price nudge: lower income → lower price, bounded 0.75–1.25, step 0.05", () => {
  const poor = priceNudge({ gdpUsdPc: feat(8_000) }, "asia", "TH")!;
  const rich = priceNudge({ gdpUsdPc: feat(90_000) }, "asia", "SG")!;
  assert.ok(poor.factor < 1 && poor.factor >= 0.75);
  assert.ok(rich.factor > 1 && rich.factor <= 1.25);
  assert.ok(poor.elasticity > rich.elasticity, "poorer markets more price-sensitive");
  // The anchor itself: no nudge.
  assert.equal(priceNudge({ gdpUsdPc: feat(90_000) }, "na", "US")!.factor, 1);
  // US state below the national median: within-country nudge.
  const state = priceNudge({ gdpUsdPc: feat(90_000), incomeVsNation: feat(0.75, "region") }, "na", "US")!;
  assert.equal(state.factor, 0.85); // 0.75^0.5 = 0.866 → 0.85
  assert.ok(Number.isInteger(Math.round(poor.factor * 100) / 5));
  assert.equal(priceNudge({}, "na", "US"), undefined);
});

test("younger crowd: fan data leads, median age seasons", () => {
  assert.equal(youngerCrowd({ medianAge: feat(31) })!.skew, "even", "place alone needs a strong signal: (35-31)/8 = 0.5 < 0.75");
  assert.equal(youngerCrowd({ medianAge: feat(26) })!.skew, "younger"); // (35-26)/8 = 1.1 → 1
  assert.equal(youngerCrowd({ medianAge: feat(45) })!.skew, "older");
  const fanYoung = youngerCrowd({ medianAge: feat(45) }, 0.3)!; // 0.7·1 + 0.3·(−1) = 0.4
  assert.equal(fanYoung.skew, "younger", "young fans beat an old country");
  assert.ok(fanYoung.fromFanData);
  assert.equal(youngerCrowd({ medianAge: feat(38) }, 0)!.skew, "even");
  assert.equal(youngerCrowd({}), undefined);
});

test("tone: law notes, speech index, split room and taste combine into strictness", () => {
  const free = tone({ freeExpression: feat(0.9) })!;
  assert.equal(free.strictness, "standard");
  assert.deepEqual(free.addTopics, []);
  const law = tone({ freeExpression: feat(0.9), religiousLaw: feat(["BNS 299"]) })!;
  assert.equal(law.strictness, "careful");
  assert.deepEqual(law.addTopics, ["religion"]);
  const strict = tone({ freeExpression: feat(0.45), religiousLaw: feat(["BNS 299"]) })!;
  assert.equal(strict.strictness, "strict");
  assert.deepEqual([...strict.addTopics].sort(), ["head_of_state", "politics", "religion"]);
  const death = tone({ freeExpression: feat(0.9), blasphemyDeathPenalty: feat(true) })!;
  assert.equal(death.strictness, "strict");
  // Fan-data taste moves it: an edgier city softens a borderline case, a cleaner one tightens it.
  assert.equal(tone({ freeExpression: feat(0.5) }, { lean: "edgier" })!.strictness, "standard");
  assert.equal(tone({ freeExpression: feat(0.5) }, { lean: "cleaner" })!.strictness, "careful");
  // Split room is advice-only (0.5 points): no topics added on its own.
  const split = tone({ freeExpression: feat(0.9), electionMargin: feat(-1.5, "region") })!;
  assert.equal(split.strictness, "standard");
  assert.ok(split.advice.some((a) => /50\/50/.test(a)));
});

test("date risk: holiday on/after a show date, extreme weather", () => {
  const f: RawFeatures = { holidays: feat([{ date: "2026-12-25", name: "Christmas Day", national: true }]), weather: feat({ meanMaxC: 12, meanMinC: 3, rainMmPerDay: 2, years: [2025] }, "city") };
  assert.equal(dateRisk(f, ["2026-12-24"])!.level, "medium", "the night before a holiday");
  assert.equal(dateRisk(f, ["2026-12-10"])!.level, "low");
  const hot = { ...f, weather: feat({ meanMaxC: 38, meanMinC: 26, rainMmPerDay: 9, years: [2025] }, "city") };
  assert.equal(dateRisk(hot, ["2026-12-25"])!.level, "high");
  assert.equal(dateRisk(f, []), undefined);
});

test("spend headroom: relative to the anchor market", () => {
  const anchor = { monthlyUsd: 3000, spendUsd: 30 }; // 1% in the reference market
  assert.equal(spendHeadroom({ gdpUsdPc: feat(8_000) }, { ticket: 30, usdPerUnit: 1 }, anchor)!.level, "tight"); // 400/mo → 7.5%
  assert.equal(spendHeadroom({ gdpUsdPc: feat(60_000) }, { ticket: 30, usdPerUnit: 1 }, anchor)!.level, "ok"); // 3000/mo → 1%
  assert.equal(spendHeadroom({ gdpUsdPc: feat(150_000) }, { ticket: 30, usdPerUnit: 1 }, anchor)!.level, "roomy");
  const us = spendHeadroom({ householdIncome: feat(75_000, "region") }, { ticket: 25, merch: 15, usdPerUnit: 1 })!;
  assert.equal(us.monthlyIncomeUsd, 2500);
  assert.equal(us.share, 1.6);
});

test("combination rule: nothing surfaces when it changes nothing", () => {
  assert.deepEqual(changes({ priceNudge: { factor: 1, elasticity: 1.1, incomeRatio: 1 }, youngerCrowd: { score: 0.1, skew: "even", fromFanData: true }, tone: { points: 0, strictness: "standard", addTopics: [], advice: [] }, dateRisk: { level: "low", reasons: [], holidays: [] }, spendHeadroom: { share: 1, relative: 1, level: "ok", spendUsd: 30, monthlyIncomeUsd: 3000 } }), {});
  const c = changes({ priceNudge: { factor: 0.8, elasticity: 1.3, incomeRatio: 0.4 }, tone: { points: 2, strictness: "strict", addTopics: ["religion", "head_of_state"], advice: [] } });
  assert.match(c.priceNudge!, /20% below/);
  assert.match(c.tone!, /religion, leaders/);
});

test("weather windows: same dates in past complete years, capped at 14 days", () => {
  const w = weatherWindows(["2027-03-01", "2027-03-30"], new Date("2026-10-30"));
  assert.deepEqual(w.map((x) => x.year), [2026, 2025, 2024]);
  assert.ok(w.every((x) => x.end.slice(5) === "03-14" && x.start.slice(5) === "03-01"));
  assert.ok(w.every((x) => Date.parse(x.end) < Date.parse("2026-10-23")));
});

// Fixture fetcher: canned holiday, weather and FX responses keyed by host.
const fixtures = (url: string): Promise<unknown> => {
  if (url.includes("date.nager.at")) return Promise.resolve([{ date: "2027-07-04", name: "Independence Day", global: true, counties: null, types: ["Public"] }, { date: "2027-03-02", name: "Texas Independence Day", global: false, counties: ["US-TX"], types: ["Public"] }]);
  if (url.includes("archive-api.open-meteo.com")) return Promise.resolve({ daily: { temperature_2m_max: [36, 37], temperature_2m_min: [24, 25], precipitation_sum: [0, 1] } });
  if (url.includes("frankfurter")) return Promise.resolve([{ rate: 0.9 }]);
  return Promise.reject(new Error("offline"));
};
const offline = () => Promise.reject(new Error("offline"));

test("placeFeatures: chains features, surfaces only what changes something, facts carry refs", async () => {
  const today = new Date("2026-10-30");
  const austin = await placeFeatures({ name: "Austin", lat: 30.27, lon: -97.74, region: "na", country: "US", query: "Austin, TX" }, ["2027-07-03"], { fetch: fixtures, today });
  assert.equal(austin.place.state, "TX");
  assert.equal(austin.derived.dateRisk?.level, "high", "night before the 4th + heat");
  assert.ok(austin.surfaced.includes("dateRisk"));
  assert.ok(!austin.surfaced.includes("tone"), "free-speech country, no law notes: tone stays hidden");
  for (const fact of austin.facts) assert.ok(fact.refs.length && fact.refs.every((r) => r.startsWith("place.")));

  const bangkok = await placeFeatures({ name: "Bangkok", lat: 13.75, lon: 100.5, region: "asia", country: "TH" }, [], { fetch: offline, today });
  assert.ok(bangkok.derived.priceNudge!.factor < 1, "lower income than the asia anchor → lower price");
  assert.ok(bangkok.surfaced.includes("priceNudge"));
  assert.ok(bangkok.derived.spendHeadroom, "offline FX falls back to the snapshot");

  const pune = await placeFeatures({ name: "Pune", lat: 18.52, lon: 73.86, region: "in", query: "Pune, India" }, ["2027-05-10"], { fetch: offline, kind: "comedian", today });
  assert.equal(pune.place.country, "IN");
  assert.ok(pune.derived.tone!.addTopics.includes("religion"), "law notes raise the avoid list");
  assert.deepEqual(pune.missing, ["public holidays", "seasonal weather"]);
});

test("resolvePlace: country from the query when not given", () => {
  assert.equal(resolvePlace({ name: "Kuala Lumpur", lat: 3.14, lon: 101.69, query: "Kuala Lumpur" }).country, "MY");
});
