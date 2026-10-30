// Tune levers + local plan edits (PLAN §18 Q20): deterministic recompute on a hand-written plan.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LEVERS, applyLevers, diffPlans, leverContext, parseLevers, repriceStop, retotal } from "../../packages/core/src/engine/levers.ts";
import { applyLocalEdits, constraintLine, needsServer, previewLocal } from "../../packages/core/src/engine/proposals.ts";
import { fixturePlan } from "./_plan-fixture.ts";

test("default levers leave the plan untouched", () => {
  const plan = fixturePlan();
  const { plan: same, diff } = applyLevers(plan, DEFAULT_LEVERS);
  assert.deepEqual(same.stops, plan.stops);
  assert.equal(diff.profit, 0);
  assert.equal(diff.nightsChanged, 0);
  assert.deepEqual(diff.lines, []);
});

test("parseLevers tolerates junk and clamps the drive limit", () => {
  assert.deepEqual(parseLevers(null), DEFAULT_LEVERS);
  const l = parseLevers({ risk: "wild", flavour: "lots", feeFloor: "250", maxDriveKm: 20 });
  assert.equal(l.risk, "balanced");
  assert.equal(l.flavour, "lots");
  assert.equal(l.feeFloor, 250);
  assert.equal(l.maxDriveKm, 100);
});

test("safe shrinks rooms that wouldn't fill, never grows them; bold grows them", () => {
  const plan = fixturePlan();
  const safe = applyLevers(plan, { risk: "safe" }).plan;
  const bold = applyLevers(plan, { risk: "bold" }).plan;
  plan.stops.forEach((s, i) => {
    assert.ok(safe.stops[i].money!.capacity <= s.money!.capacity, `${s.city.name} safe`);
    if (s.money!.verdict !== "skip") assert.ok(bold.stops[i].money!.capacity > s.money!.capacity, `${s.city.name} bold`);
  });
  // The weak night (Detroit) sold well under 90%: Safe gives it a smaller, fuller room.
  const d = safe.stops.findIndex((s) => s.city.name === "Detroit");
  assert.ok(safe.stops[d].money!.capacity < plan.stops[d].money!.capacity);
  assert.ok(safe.stops[d].money!.sellThrough > plan.stops[d].money!.sellThrough);
});

test("the inline diff matches the totals", () => {
  const plan = fixturePlan();
  const { plan: tuned, diff } = applyLevers(plan, { risk: "safe" });
  assert.equal(diff.profit, Math.round(tuned.money!.profit - plan.money!.profit));
  assert.ok(diff.nightsChanged >= 1);
  assert.ok(diff.lines.some((l) => /night|profit/.test(l)));
});

test("a profit floor drops the nights below it and says why", () => {
  const plan = fixturePlan();
  const floor = Math.max(...plan.stops.map((s) => s.money!.profit)) - 1;
  const { plan: tuned, diff } = applyLevers(plan, { feeFloor: floor });
  const kept = tuned.stops.filter((s) => s.money!.verdict !== "skip");
  assert.equal(kept.length, 1);
  assert.ok(diff.dropped >= 2);
  assert.match(tuned.stops.find((s) => s.money!.verdict === "skip")!.money!.reason!, /floor/);
  assert.equal(tuned.money!.profit, kept[0].money!.profit);
});

test("a shorter drive limit moves later dates and adds lodging", () => {
  const plan = fixturePlan();
  const { plan: tuned, diff } = applyLevers(plan, { maxDriveKm: 250 });
  assert.ok(diff.datesMoved >= 1);
  assert.ok(tuned.stops[2].date! > plan.stops[2].date!);
  assert.ok(tuned.money!.costs > plan.money!.costs);
  assert.equal(tuned.stops[0].date, plan.stops[0].date, "the first night never moves");
});

test("leverContext maps to the context module's keys", () => {
  assert.deepEqual(leverContext({ edge: "cleaner" }, "comedian").boundaries, ["clean"]);
  assert.ok(leverContext({ edge: "edgier" }, "comedian").boundaries.includes("edgy"));
  assert.equal(leverContext({ era: "recent" }, "musician").skew, "younger");
  assert.equal(leverContext({ era: "classic" }, "musician").skew, "older");
  assert.equal(leverContext({}, "musician").skew, undefined);
  assert.equal(leverContext({ flavour: "lots" }, "musician").flavour, "lots");
});

test("repriceStop keeps planned costs and recomputes the door", () => {
  const plan = fixturePlan();
  const s = plan.stops[0];
  const up = repriceStop(s, "na", "musician", { price: s.money!.price * 2 });
  assert.equal(up.money!.costs, s.money!.costs);
  assert.ok(up.money!.tickets < s.money!.tickets, "higher price sells fewer tickets");
  assert.equal(retotal(plan).money!.profit, plan.money!.profit);
});

test("local edits: drop, restore, room, backup venue; server-only ops are flagged", () => {
  const plan = fixturePlan();
  const dropped = previewLocal(plan, [{ op: "drop_night", night: 1 }]);
  assert.equal(dropped.plan.stops[1].money!.verdict, "skip");
  assert.equal(dropped.diff.dropped, 1);
  assert.equal(dropped.diff.profit, -plan.stops[1].money!.profit);
  assert.deepEqual(dropped.changes, ["Detroit: dropped"]);
  const back = applyLocalEdits(dropped.plan, [{ op: "restore_night", night: 1 }]);
  assert.notEqual(back.plan.stops[1].money!.verdict, "skip");
  const swapped = applyLocalEdits(plan, [{ op: "swap_venue", night: 0, venue: "backup" }]);
  assert.equal(swapped.plan.stops[0].venue!.name, "Backup Hall");
  assert.throws(() => applyLocalEdits(plan, [{ op: "swap_venue", night: 1, venue: "backup" }]), /no backup venue/);
  assert.equal(needsServer([{ op: "add_night", city: "Austin" }]), true);
  assert.equal(needsServer([{ op: "set_room", night: 0, capacity: 300 }]), false);
  assert.equal(diffPlans(plan, plan).lines.length, 0);
});

test("constraint lines read plainly", () => {
  assert.equal(constraintLine({ kind: "era", from: 1990, to: 1999 }), "Covers and references from the 90s");
  assert.equal(constraintLine({ kind: "avoid", topic: "politics", city: "Bengaluru" }), "Keep politics out in Bengaluru");
});

test("a surfaced local price nudge survives a lever reprice", () => {
  const plan = fixturePlan();
  const s = { ...plan.stops[1], place: { surfaced: ["priceNudge"], changes: { priceNudge: "Lower local incomes: price nudged down." }, facts: [], priceNudge: { factor: 0.8, elasticity: 1.3, incomeRatio: 0.7 } } };
  const nudged = repriceStop(s, "na", "musician", { capacity: 300 });
  assert.equal(nudged.money!.priceNudge?.factor, 0.8);
  const plain = repriceStop(plan.stops[1], "na", "musician", { capacity: 300 });
  assert.equal(plain.money!.priceNudge, undefined);
  assert.notEqual(nudged.money!.tickets, plain.money!.tickets, "the nudge changes demand at this price");
  const hidden = repriceStop({ ...s, place: { ...s.place, surfaced: [] } }, "na", "musician", { capacity: 300 });
  assert.equal(hidden.money!.priceNudge, undefined, "only surfaced nudges count");
});
