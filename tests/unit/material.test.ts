// Material + event sets (PLAN Q21): set-from-material helpers, kept-idea dedupe, migration mapping.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addToSet,
  defaultType,
  filterLibrary,
  findKept,
  keptIdeaFields,
  MaterialFields,
  migrateSavedSet,
  minutesLabel,
  moveInSet,
  readLength,
  removeFromSet,
  resolveSet,
  setMinutes,
  sortLibrary,
  untimed,
  type Material,
} from "../../packages/core/src/material/material.ts";

let n = 0;
const item = (title: string, extra: Partial<Material> = {}): Material => ({
  ...MaterialFields.parse({ title, type: "song", lengthMin: 4 }),
  id: `m${++n}`,
  profileId: "p1",
  createdAt: "",
  updatedAt: "",
  ...extra,
});
const songs = ["Harbour Lights", "Paper Moon", "Slow Train", "Glass House", "Northbound"].map((t) => item(t));

test("a set keeps its order, moves one place at a time, ignores out-of-range moves", () => {
  let ids: string[] = [];
  for (const s of songs) ids = addToSet(ids, s.id);
  assert.deepEqual(resolveSet(ids, songs).map((m) => m.title), songs.map((s) => s.title));
  ids = moveInSet(ids, 4, -1);
  assert.equal(resolveSet(ids, songs)[3].title, "Northbound");
  assert.deepEqual(moveInSet(ids, 0, -1), ids);
  assert.deepEqual(moveInSet(ids, ids.length - 1, 1), ids);
  ids = removeFromSet(ids, songs[0].id);
  assert.equal(ids.length, 4);
  assert.equal(setMinutes(resolveSet(ids, songs)), 16);
});

test("the same item can't go in one set twice; unknown ids drop out", () => {
  const ids = addToSet(addToSet([songs[0].id], songs[0].id), "gone");
  assert.deepEqual(resolveSet(ids, songs).map((m) => m.id), [songs[0].id]);
});

test("material is reused across events: two sets share items, removing from one leaves the other", () => {
  const first = songs.map((s) => s.id);
  const second = [songs[2].id, songs[0].id, songs[4].id];
  const afterRemove = removeFromSet(first, songs[0].id);
  assert.deepEqual(resolveSet(second, songs).map((m) => m.title), ["Slow Train", "Harbour Lights", "Northbound"]);
  assert.ok(!afterRemove.includes(songs[0].id));
  assert.ok(second.includes(songs[0].id));
});

test("library: originals first, then covers, then local ideas; filters by text, type, origin", () => {
  const lib = [item("Zed", { origin: "local_idea" }), item("Bee", { origin: "cover" }), item("Alpha"), item("Mid", { type: "bit", tags: ["crowd"] })];
  assert.deepEqual(sortLibrary(lib).map((m) => m.title), ["Alpha", "Mid", "Bee", "Zed"]);
  assert.deepEqual(filterLibrary(lib, { type: "bit" }).map((m) => m.title), ["Mid"]);
  assert.deepEqual(filterLibrary(lib, { q: "crow" }).map((m) => m.title), ["Mid"]);
  assert.deepEqual(filterLibrary(lib, { origin: "cover" }).map((m) => m.title), ["Bee"]);
});

test("kept ideas: one library item per idea + city, whatever the spelling", () => {
  const f = keptIdeaFields({ idea: "Open with a Bulls nod", ref: "Chicago Bulls", category: "brands" }, "Chicago, IL", "comedian");
  assert.equal(f.origin, "local_idea");
  assert.equal(f.type, "bit");
  const lib = [item(f.title, { ...f })];
  assert.ok(findKept(lib, { ref: "chicago bulls", city: "Chicago" }));
  assert.equal(findKept(lib, { ref: "Chicago Bulls", city: "Detroit" }), undefined);
  assert.equal(keptIdeaFields({ ref: "Wilco", category: "cover" }, "Chicago", "comedian").type, "song");
});

test("form helpers: lengths and labels", () => {
  assert.equal(readLength(""), undefined);
  assert.equal(readLength("3:30"), 3.5);
  assert.equal(readLength("4 min"), 4);
  assert.equal(readLength("four"), "bad");
  assert.equal(minutesLabel(3.5), "3½ min");
  assert.equal(minutesLabel(75), "1 h 15 min");
  assert.equal(untimed([{ lengthMin: undefined }, { lengthMin: 2 }]), 1);
  assert.equal(defaultType("comedian"), "bit");
  assert.equal(defaultType("visual_artist"), "piece");
  assert.equal(MaterialFields.safeParse({ title: " " }).error?.issues[0].message, "Give it a title.");
});

test("migration: a saved built set → originals, covers, local ideas, and each city's order", () => {
  const saved = {
    inputs: { text: "Harbour Lights, 4\nPaper Moon, 5\nUnused Song | 3" },
    build: {
      result: {
        kind: "musician",
        cities: [
          { city: "Chicago", order: [
            { item: 0, title: "Harbour Lights", minutes: 4, move: "open" },
            { title: "Cover: Wilco", minutes: 4, move: "nod", refs: ["Wilco"] },
            { item: 1, title: "Paper Moon", minutes: 5, move: "close" },
          ] },
          { city: "Detroit, MI", order: [
            { item: 1, title: "Paper Moon", minutes: 5, move: "open" },
            { title: "Local tag: Pistons", minutes: 2, move: "nod", refs: ["Pistons"] },
          ] },
        ],
      },
    },
  };
  const m = migrateSavedSet(saved);
  const origins = Object.fromEntries(m.items.map((i) => [i.title, i.origin]));
  assert.deepEqual(origins, { "Harbour Lights": "original", "Cover: Wilco": "cover", "Paper Moon": "original", "Local tag: Pistons": "local_idea", "Unused Song": "original" });
  assert.equal(m.items.find((i) => i.title === "Unused Song")?.lengthMin, 3);
  assert.equal(m.items.find((i) => i.title === "Local tag: Pistons")?.source?.ref, "Pistons");
  // Paper Moon is one item, used by both cities.
  const paper = m.items.find((i) => i.title === "Paper Moon")!.key;
  assert.equal(m.cities[0].keys.length, 3);
  assert.equal(m.cities[0].keys[2], paper);
  assert.equal(m.cities[1].keys[0], paper);
  // Running it twice gives the same keys (the DB step matches on them: idempotent).
  assert.deepEqual(migrateSavedSet(saved).items.map((i) => i.key), m.items.map((i) => i.key));
});

test("paste a list: one per line, numbering stripped, a trailing length read", async () => {
  const { readPasted } = await import("@tourbo/core/material/material.ts");
  assert.deepEqual(readPasted("1. Harbour Lights 4:30\n- Paper Moon - 3\n\nSlow Train\n"), [
    { title: "Harbour Lights", lengthMin: 4.5 },
    { title: "Paper Moon", lengthMin: 3 },
    { title: "Slow Train" },
  ]);
});
