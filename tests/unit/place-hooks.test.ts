// Place features wired into the engine (PLAN §18 Q18): economics price factor, avoid-list tone,
// set age skew fallback, why-line facts, plan night notes. No network.
// node --test tests/unit/place-hooks.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { avoidList, performanceContext } from "../../packages/core/src/context/index.ts";
import { estimateDemand, evaluate, legCosts, optimise, refPrice } from "../../packages/core/src/engine/economics.ts";
import { dealItems, nightItems, placeFacts } from "../../packages/core/src/engine/explain-facts.ts";
import { arrangeCity, rankCoverIdeas } from "../../packages/core/src/engine/set.ts";
import { priceAdjust, staticPlace, toPlaceNotes } from "../../packages/core/src/places/hooks.server.ts";
import type { QlooEntity } from "../../packages/core/src/qloo/api.server.ts";
import { CityPlan, type PlaceNotes } from "../../packages/core/src/shared/types.ts";
import { fixturePlan } from "./_plan-fixture.ts";

const demand = estimateDemand({ fanIndex: 100, medianFanIndex: 100, roomMin: 200, roomMax: 800 });
const rooms = [{ name: "Room", capacity: 400 }];
const costs = legCosts(300, 3, false);

test("price factor: applied to the reference ticket, bounded 0.75–1.25, explained", () => {
  const ref = refPrice("na", "musician");
  const base = optimise({ region: "na", kind: "musician", demand, rooms, costs });
  assert.equal(base.priceNudge, undefined, "no factor: no nudge, old shape");
  const low = optimise({ region: "na", kind: "musician", demand, rooms, costs, priceFactor: 0.9 });
  assert.ok(low.best.scenario.price <= base.best.scenario.price, `${low.best.scenario.price} ≤ ${base.best.scenario.price}`);
  assert.equal(low.priceNudge?.factor, 0.9);
  assert.equal(low.priceNudge?.note, "price nudged −10% for local incomes");
  const ticketed = [low.best, ...low.alternatives].filter((o) => o.scenario.deal === "door_split").map((o) => o.scenario.price);
  assert.ok(ticketed.every((p) => [0.6, 0.8, 1, 1.2, 1.5, 1.8].some((f) => p === Math.round(ref * 0.9 * f))), `grid at 0.9× ref: ${ticketed}`);
  // Bounded: 0.5 acts as 0.75, 3 as 1.25.
  assert.equal(optimise({ region: "na", kind: "musician", demand, rooms, costs, priceFactor: 0.5 }).priceNudge?.factor, 0.75);
  assert.equal(optimise({ region: "na", kind: "musician", demand, rooms, costs, priceFactor: 3 }).priceNudge?.factor, 1.25);
  // evaluate: the same ticket in a lower-income place sells fewer seats (draw is at the local reference).
  const s = { deal: "door_split" as const, price: ref, capacity: 2000 };
  assert.ok(evaluate("na", "musician", demand, s, costs, { priceFactor: 0.8 }).tickets < evaluate("na", "musician", demand, s, costs).tickets);
  // Elasticity from the place: more price-sensitive → fewer tickets above the reference.
  const hi = { ...s, price: ref * 1.5 };
  assert.ok(evaluate("na", "musician", demand, hi, costs, { elasticity: 1.5 }).tickets < evaluate("na", "musician", demand, hi, costs).tickets);
  assert.deepEqual(evaluate("na", "musician", demand, s, costs, {}), evaluate("na", "musician", demand, s, costs), "default adj = old behaviour");
});

test("priceAdjust applies only a surfaced nudge; staticPlace makes no network call", async () => {
  const notes = (factor: number, surfaced: string[]): PlaceNotes => ({ surfaced, changes: {}, facts: [], priceNudge: { factor, elasticity: 1.3, incomeRatio: 0.3 } });
  assert.deepEqual(priceAdjust(notes(0.85, ["priceNudge"])), { priceFactor: 0.85, elasticity: 1.3 });
  assert.deepEqual(priceAdjust(notes(1, [])), {});
  assert.deepEqual(priceAdjust(undefined), {});
  const t0 = Date.now();
  const bangkok = await staticPlace({ name: "Bangkok", lat: 13.75, lon: 100.5, region: "asia", country: "TH" }, { kind: "musician" });
  assert.ok(Date.now() - t0 < 1500, "offline, fast");
  assert.ok(bangkok?.derived.priceNudge && bangkok.derived.priceNudge.factor < 1, "lower income than the region anchor (JP)");
  const n = toPlaceNotes(bangkok!);
  assert.ok(CityPlan.shape.place.safeParse(n).success, "fits the plan schema");
  assert.ok(priceAdjust(n).priceFactor! < 1);
});

test("tone adds avoid topics and advice; standard tone changes nothing", () => {
  const plain = avoidList("comedian", { country: "US", name: "Austin" }, ["edgy", "political"]);
  assert.ok(!plain.rules.some((r) => r.topic === "religion"));
  const tone = { points: 2, strictness: "strict" as const, addTopics: ["religion", "politics", "head_of_state"] as ("religion" | "politics" | "head_of_state")[], advice: ["Open clean and stay there unless the room tells you otherwise."] };
  const careful = avoidList("comedian", { country: "US", name: "Austin" }, ["edgy", "political"], undefined, tone);
  for (const t of ["religion", "politics", "head_of_state"]) assert.ok(careful.rules.some((r) => r.topic === t && r.scope === "region"), t);
  assert.ok(careful.advice.includes(tone.advice[0]));
  const std = avoidList("comedian", { country: "US", name: "Austin" }, ["edgy", "political"], undefined, { ...tone, strictness: "standard" });
  assert.deepEqual(std.rules.map((r) => r.topic), plain.rules.map((r) => r.topic));
  // performanceContext passes it through.
  const ctx = performanceContext({ kind: "comedian", place: { country: "US", name: "Austin" }, boundaries: ["edgy", "political"], tone });
  assert.ok(ctx.avoid.rules.some((r) => r.topic === "head_of_state"));
});

const artist = (name: string, year: number): QlooEntity => ({ name, entity_id: name, properties: { start_year: year }, tags: [{ tag_id: "urn:tag:genre:music:rock", name: "Rock" }] });
const FANS = [artist("Fleetwood Mac", 1967), artist("Eagles", 1971), artist("Olivia Rodrigo", 2020), artist("Boygenius", 2018), artist("Queen", 1970)];

test("younger place skew reranks covers only when the fan-data skew is even", () => {
  const top = (o: Partial<Parameters<typeof rankCoverIdeas>[0]>) => rankCoverIdeas({ city: "Austin", fans: FANS, overall: [], cityEntities: FANS, take: 2, ...o }).map((i) => i.artist);
  const even = top({});
  const young = top({ placeSkew: "younger" });
  assert.notDeepEqual(young, even, "place skew moves recent acts up");
  assert.ok(young.includes("Olivia Rodrigo"));
  assert.deepEqual(top({ skew: "older", placeSkew: "younger" }), top({ skew: "older" }), "fan data wins when it has a skew");
  // arrangeCity takes the place hint too.
  const set = (hints?: Parameters<typeof arrangeCity>[0]["placeHints"]) =>
    arrangeCity({ city: "Austin", kind: "musician", slot: "headline", items: [{ title: "A" }, { title: "B" }], defaultStyles: ["Rock"], taste: { entities: FANS, fans: FANS }, placeHints: hints }).coverIdeas.map((c) => c.artist);
  assert.notDeepEqual(set({ youngerCrowd: { score: 0.8, skew: "younger", fromFanData: false } }), set());
});

test("why-line facts: only surfaced place features, after fan data; old plans unchanged", () => {
  const plan = fixturePlan();
  const before = { nights: nightItems(plan), deals: dealItems(plan) };
  const s0 = plan.stops[0];
  s0.place = {
    surfaced: ["priceNudge", "dateRisk"],
    changes: { priceNudge: "Price about 10% below the usual ticket: money is tighter here.", dateRisk: "Check the date: Public holiday on or right after a show date: Veterans Day." },
    facts: [{ id: "place.dateRisk", text: "Chicago: Public holiday on or right after a show date: Veterans Day.", refs: ["place.holidays"], strength: "weak", source: "Nager.Date" }],
    priceNudge: { factor: 0.9, elasticity: 1.2, incomeRatio: 0.8 },
    youngerCrowd: { score: 0.1, skew: "even", fromFanData: false }, // not surfaced
    dateRisk: { level: "medium", reasons: ["Public holiday on or right after a show date: Veterans Day."], holidays: [{ date: "2026-11-11", name: "Veterans Day", national: true }] },
  };
  const night = nightItems(plan)[0];
  const keys = night.facts.map((f) => f.key);
  assert.ok(keys.includes("place.dateRisk") && !keys.includes("place.youngerCrowd"));
  assert.ok(keys.indexOf("place.dateRisk") > keys.indexOf("fan"), "fan data first");
  assert.match(night.facts.find((f) => f.key === "place.dateRisk")!.say!, /public holiday.*Veterans Day/);
  const deal = dealItems(plan)[0];
  assert.match(deal.facts.find((f) => f.key === "place.priceNudge")!.say!, /−10%.*incomes/);
  assert.deepEqual(placeFacts({ place: { ...s0.place, surfaced: [] } }), []);
  // Other nights (no place) keep their exact facts.
  assert.deepEqual(nightItems(plan).slice(1), before.nights.slice(1));
  assert.deepEqual(dealItems(plan).slice(1), before.deals.slice(1));
  // Old plan JSON (no place / priceNudge) still parses.
  assert.ok(CityPlan.safeParse(JSON.parse(JSON.stringify(plan.stops[1]))).success);
});
