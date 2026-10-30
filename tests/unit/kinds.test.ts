// Kind-of-act labels: registry defaults, act_kinds rows override, registry when the DB fails.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DISCIPLINES } from "../../packages/core/src/disciplines/index.ts";
import { labelMap, mergeKinds, registryKinds } from "../../packages/core/src/disciplines/labels.ts";
import { actKinds } from "../../packages/core/src/disciplines/labels.server.ts";
import { SCHEMA } from "../../packages/core/src/db/schema.server.ts";

test("registry: one entry per kind, registry order, sort steps of 10, all enabled", () => {
  const kinds = registryKinds();
  assert.deepEqual(kinds.map((k) => k.kind), Object.keys(DISCIPLINES));
  assert.deepEqual(kinds.map((k) => k.sort), kinds.map((_, i) => (i + 1) * 10));
  assert.ok(kinds.every((k) => k.enabled));
  assert.equal(labelMap(kinds).poet, "Poet");
  assert.equal(labelMap(kinds).visual_artist, "Painter");
});

test("merge: rows override field by field, blanks and unknown kinds ignored, sorted by sort", () => {
  const kinds = mergeKinds([
    { kind: "poet", label: "Wordsmith", sort: 5 },
    { kind: "dj", hint: "  ", enabled: false },
    { kind: "comedian", label: "", hint: "Stand-up only" },
    { kind: "nope", label: "Ghost", sort: 1 },
  ]);
  assert.equal(kinds.length, Object.keys(DISCIPLINES).length);
  assert.deepEqual(kinds[0], { kind: "poet", label: "Wordsmith", hint: DISCIPLINES.poet.hint, sort: 5, enabled: true });
  const dj = kinds.find((k) => k.kind === "dj")!;
  assert.equal(dj.hint, DISCIPLINES.dj.hint);
  assert.equal(dj.enabled, false);
  const comedian = kinds.find((k) => k.kind === "comedian")!;
  assert.equal(comedian.label, "Comedian");
  assert.equal(comedian.hint, "Stand-up only");
  assert.ok(!kinds.some((k) => (k.kind as string) === "nope"));
  assert.deepEqual(mergeKinds([]), registryKinds());
});

test("merge: equal sort keeps registry order", () => {
  const kinds = mergeKinds([{ kind: "teacher", sort: 10 }]);
  assert.deepEqual(kinds.slice(0, 2).map((k) => k.kind), ["musician", "teacher"]);
});

test("actKinds: DB rows merged; a failing DB falls back to the registry", async () => {
  const merged = await actKinds({ rows: async () => [{ kind: "musician", label: "Singer" }] });
  assert.equal(merged[0].label, "Singer");
  const failed = await actKinds({ rows: async () => Promise.reject(new Error("no db")) });
  assert.deepEqual(failed, registryKinds());
});

test("schema seeds act_kinds from the registry without overwriting edits", () => {
  assert.match(SCHEMA, /create table if not exists act_kinds/);
  assert.match(SCHEMA, /on conflict \(kind\) do nothing/);
  for (const k of registryKinds()) assert.ok(SCHEMA.includes(`('${k.kind}', '${k.label}', '${k.hint}', ${k.sort})`), k.kind);
});
