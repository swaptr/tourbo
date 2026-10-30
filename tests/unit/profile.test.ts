import assert from "node:assert/strict";
import { test } from "node:test";

import { REQUIRED, WHY, canDo, isComplete, mainKind, missingFor, readProfile } from "../../packages/core/src/profiles/profile.ts";

const home = { name: "Chicago", lat: 41.88, lon: -87.63 };

test("required fields per action: tour = name + home, event / ideas = name; kind never gates", () => {
  assert.deepEqual(REQUIRED.tour, ["name", "home"]);
  assert.deepEqual(REQUIRED.event, ["name"]);
  assert.deepEqual(REQUIRED.ideas, ["name"]);
  for (const a of ["tour", "event", "ideas"] as const) assert.ok(!REQUIRED[a].includes("kind"));
});

test("skipped onboarding (empty profile) is missing exactly what each action needs", () => {
  assert.deepEqual(missingFor(undefined, "tour"), ["name", "home"]);
  assert.deepEqual(missingFor({}, "event"), ["name"]);
  assert.deepEqual(missingFor(null), ["kind", "name", "home"]);
});

test("a listed name counts; an unlisted one needs a way in", () => {
  assert.ok(canDo({ name: "Maya", listed: true }, "event"));
  assert.ok(!canDo({ name: "M" }, "event"), "one letter isn't a name");
  assert.ok(!canDo({ name: "Ana", listed: false }, "event"));
  assert.ok(!canDo({ name: "Ana", listed: false, basis: "peers", peers: [] }, "event"));
  assert.ok(canDo({ name: "Ana", listed: false, basis: "peers", peers: [{ id: "x", name: "X" }] }, "event"));
  assert.ok(canDo({ name: "Ana", listed: false, basis: "city" }, "ideas"));
});

test("tour needs a usable home base", () => {
  assert.deepEqual(missingFor({ name: "Maya" }, "tour"), ["home"]);
  assert.deepEqual(missingFor({ name: "Maya", home: { name: "", lat: 1, lon: 1 } }, "tour"), ["home"]);
  assert.ok(canDo({ name: "Maya", home }, "tour"));
});

test("complete profile is never asked again", () => {
  const p = { name: "Maya", kinds: ["musician" as const], home, listed: true };
  assert.ok(isComplete(p));
  for (const a of ["tour", "event", "ideas"] as const) assert.deepEqual(missingFor(p, a), []);
});

test("every missing field of an action has one plain why-line", () => {
  for (const a of ["tour", "event", "ideas"] as const) for (const f of REQUIRED[a]) assert.match(WHY[a][f] ?? "", /^Tourbo needs /);
});

test("multi-talented: kinds keep order, first is main; old single kind migrates to kinds[0]", () => {
  const multi = readProfile({ name: "Rohan", kinds: ["comedian", "musician"] });
  assert.deepEqual(multi?.kinds, ["comedian", "musician"]);
  assert.equal(mainKind(multi), "comedian");
  const old = readProfile({ name: "Maya", kind: "musician", id: "abc" });
  assert.deepEqual(old?.kinds, ["musician"]);
  assert.equal(old?.id, "abc");
  assert.deepEqual(readProfile({})?.kinds, []);
  assert.equal(readProfile({ kinds: ["not-a-kind"] }), undefined);
});

test("profile: the loose reader (this browser's copy) matches the schema reader on stored shapes", async () => {
  const { readProfileLoose } = await import("../../packages/core/src/profiles/rules.ts");
  for (const raw of [
    { kind: "comedian", name: " Ali ", home: { name: "Seattle", lat: 47.6, lon: -122.3 }, id: "p1" },
    { kinds: ["musician"], listed: false, basis: "peers", peers: [{ id: "a", name: "A" }], styles: [] },
    {},
  ])
    assert.deepEqual(readProfileLoose(raw), readProfile(raw));
  assert.equal(readProfileLoose(null), undefined);
});
