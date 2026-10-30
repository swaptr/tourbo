// "Tourbo asks" detection (PLAN §18 Q20): close cities, thin margins, deal choices, thin data.
import assert from "node:assert/strict";
import { test } from "node:test";

import { repriceStop, retotal } from "../../packages/core/src/engine/levers.ts";
import { alternativesFrom, detectPrompts } from "../../packages/core/src/engine/prompts.ts";
import { applyLocalEdits } from "../../packages/core/src/engine/proposals.ts";
import { fixturePlan } from "./_plan-fixture.ts";

const ALT = { city: "Cincinnati", score: 60, lat: 39.1, lon: -84.51 };

test("two cities with similar fans: ask, with the distance difference", () => {
  const [p] = detectPrompts(fixturePlan(), { alternatives: [ALT] });
  assert.equal(p.kind, "close_city");
  assert.equal(p.question, "Detroit or Cincinnati?");
  assert.match(p.detail, /Similar fans \(fan score 61 vs 60\); Detroit is [\d,]+ km shorter\./);
  assert.deepEqual(p.options.map((o) => o.id), ["keep", "swap"]);
  assert.deepEqual(p.options[1].edit, [{ op: "swap_city", night: 1, city: "Cincinnati" }]);
  assert.equal(p.options[0].prefer.key, "city");
});

test("no question when the other city is clearly weaker, thin, or already in the plan", () => {
  const plan = fixturePlan();
  const kinds = (alts: Parameters<typeof detectPrompts>[1]["alternatives"]) => detectPrompts(plan, { alternatives: alts, max: 9 }).map((p) => p.kind);
  assert.ok(!kinds([{ ...ALT, score: 40 }]).includes("close_city"));
  assert.ok(!kinds([{ ...ALT, thinData: true }]).includes("close_city"));
  assert.ok(!kinds([{ ...ALT, city: "Chicago", score: 90 }]).includes("close_city"));
});

test("a night that barely breaks even gets keep / smaller room / drop", () => {
  const plan = fixturePlan();
  const s = plan.stops[2];
  // Raise costs until Pittsburgh makes ~2% of its gross.
  const thin = repriceStop(s, "na", "musician", { extraCost: s.money!.profit - Math.round(s.money!.gross * 0.02) });
  const p = detectPrompts(retotal(plan, [plan.stops[0], plan.stops[1], thin]), { max: 9 }).find((x) => x.kind === "break_even")!;
  assert.equal(p.question, "Keep Pittsburgh?");
  assert.match(p.detail, /barely breaks even: about \$[\d,]+ profit on [\d,]+ tickets \(estimate\)\./);
  assert.deepEqual(p.options.map((o) => o.id).at(-1), "drop");
  assert.deepEqual(p.options.at(-1)!.edit, [{ op: "drop_night", night: 2 }]);
});

test("profitable but half-empty: share the bill or headline a smaller room", () => {
  const p = detectPrompts(fixturePlan()).find((x) => x.kind === "deal")!;
  assert.equal(p.city, "Detroit");
  assert.deepEqual(p.options.map((o) => o.id), ["share", "smaller"]);
  const cap = (p.options[1].edit![0] as { capacity: number }).capacity;
  assert.ok(cap < 600 && cap >= 30);
  // Applying the smaller room fills it better.
  const after = applyLocalEdits(fixturePlan(), p.options[1].edit!).plan.stops[1].money!;
  assert.ok(after.sellThrough > 0.85);
});

test("thin data asks keep or drop", () => {
  const plan = fixturePlan();
  plan.stops[0] = { ...plan.stops[0], thinData: true };
  const p = detectPrompts(plan, { max: 9 }).find((x) => x.kind === "thin_data")!;
  assert.equal(p.city, "Chicago");
  assert.match(p.detail, /little fan data/);
});

test("at most 2, one per night, close cities first, answered ones gone", () => {
  const plan = fixturePlan();
  plan.stops[0] = { ...plan.stops[0], thinData: true };
  const shown = detectPrompts(plan, { alternatives: [ALT] });
  assert.equal(shown.length, 2);
  assert.equal(shown[0].kind, "close_city");
  assert.equal(new Set(shown.map((p) => p.night)).size, 2);
  const next = detectPrompts(plan, { alternatives: [ALT], answered: [shown[0].id] });
  assert.ok(!next.some((p) => p.id === shown[0].id));
  // Detroit still has its deal question once the city one is answered.
  assert.ok(next.some((p) => p.kind === "deal" && p.city === "Detroit"));
});

test("no questions on a clean plan; skipped nights never ask", () => {
  const plan = fixturePlan();
  const dropped = applyLocalEdits(plan, [{ op: "drop_night", night: 1 }]).plan;
  assert.deepEqual(detectPrompts(dropped, { alternatives: [ALT] }), []);
});

test("alternatives come from the trace scores minus the plan's cities", () => {
  const alts = alternativesFrom({ Chicago: 90, Columbus: 60, Toledo: 41 }, fixturePlan(), (n) => (n === "Columbus" ? { lat: 1, lon: 2 } : undefined));
  assert.deepEqual(alts.map((a) => a.city), ["Columbus", "Toledo"]);
  assert.equal(alts[0].lat, 1);
});

test("no question when the other city is far out of the way", () => {
  const far = { city: "Denver", score: 60, lat: 39.74, lon: -104.99 };
  assert.ok(!detectPrompts(fixturePlan(), { alternatives: [far], max: 9 }).some((p) => p.kind === "close_city"));
});
