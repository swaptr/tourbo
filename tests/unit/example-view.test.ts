// Unit tests for the precomputed example card view (no browser): node --test tests/unit/
import assert from "node:assert/strict";
import { test } from "node:test";

import type { HomeExample } from "../../packages/core/src/examples/types.ts";
import { buildExampleView, COMPARE_LABELS, FACT_SLOTS, ROUTE_SLOTS, viewOf } from "../../apps/web/app/lib/example-view.ts";

const city = (name: string, fanStrength: number, profit: number, travelKm: number) => ({ name, fanStrength, lean: 1.4, tickets: 1200, roomFit: "theatre, ~1,600 seats", profit, travelKm });
const base: HomeExample = {
  id: "act-sydney-route",
  feature: "route",
  decision: { headline: "5 nights, A$212k estimated profit", lines: ["Skip Perth: the flight eats the night.", "Brisbane over Gold Coast."] },
  act: { name: "Some Act", kind: "musician" },
  home: { city: "Sydney", country: "AU", continent: "oceania", lat: -33.9, lon: 151.2 },
  cities: [],
  medianFanStrength: 40,
  route: Array.from({ length: 10 }, (_, k) => ({ name: `City ${k}`, lat: 0, lon: 0, date: "2026-11-0" + ((k % 9) + 1), profit: k === 3 ? -500 : 1000 * k })),
  tourProfit: { amount: 212000, currency: "AUD", nights: 5 },
  losingNight: { city: "Perth", amount: 3000, currency: "AUD", loses: true, line: "Perth loses A$3,000." },
  compare: { line: "Brisbane over Gold Coast: more fans.", currency: "AUD", chosen: city("Brisbane", 88, 9000, 730), skipped: city("Gold Coast", 41.6, -1200, 680) },
  fanKey: "some-act",
  checkedAt: "2026-10-30T00:00:00Z",
};

test("view: every string pre-formatted, fixed slot counts, bars as fractions", () => {
  const v = buildExampleView(base);
  assert.equal(v.id, base.id);
  assert.equal(v.feature, "Route and money");
  assert.match(v.byline, /^Some Act, .+ from Sydney$/);
  assert.ok(v.facts.length >= 2 && v.facts.length <= FACT_SLOTS);
  assert.match(v.facts[0], /^5 nights, A\$212,000 estimated profit\.$/);
  assert.match(v.facts[1], /^Losing night: Perth/);
  assert.deepEqual(v.why?.rows.map((r) => r.label), [...COMPARE_LABELS]);
  const fan = v.why!.rows[0];
  assert.equal(fan.chosen, "88");
  assert.equal(fan.skipped, "42");
  assert.equal(fan.chosenBar, 0.88);
  assert.ok(fan.chosenBetter);
  assert.equal(v.why!.rows[3].skipped, "-A$1,200");
  assert.equal(v.why!.rows[4].chosenBetter, false, "shorter travel wins");
  assert.equal(v.details.route.length, ROUTE_SLOTS, "route capped to the fixed slots");
  assert.ok(v.details.route[3].loses);
  assert.match(v.details.route[0].date, /^\w{3}, \w{3} \d+$|^\w{3}, \d+ \w{3}$/);
});

test("view: immutable, cached per example, no vendor or internal words", () => {
  const v = viewOf(base)!;
  assert.equal(viewOf(base), v, "built once");
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.facts) && Object.isFrozen(v.details));
  assert.doesNotMatch(JSON.stringify(v), /Qloo|Claude|Anthropic|fanIndex|heatmap/i);
});

test("view: thin examples still fill the card (no compare, no route)", () => {
  const v = buildExampleView({ ...base, compare: undefined, route: undefined, tourProfit: undefined, losingNight: undefined, profit: { amount: 5000, currency: "EUR", city: "Lyon" } });
  assert.equal(v.why, null);
  assert.equal(v.details.route.length, 0);
  assert.equal(v.facts[0], "Best night: €5,000 estimated profit in Lyon.");
  assert.ok(v.facts.length >= 2, "decision lines top it up to two facts");
});
