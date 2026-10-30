// Context module units (PLAN Q15): demographics parsing, region lookup, sources, prompt text.
// Hand-written fixtures only.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DISCIPLINES } from "../../packages/core/src/disciplines/index.ts";
import { REGIONS, SLOTS, SLOT_SOURCES, audienceSide, contextPrompt, countryOf, demoBlocks, eraRerank, parseBoundaries, performanceContext, slotsFor } from "../../packages/core/src/context/index.ts";

test("demoBlocks reads the documented response shape and tolerates junk", () => {
  const res = { success: true, results: { demographics: [{ entity_id: "x", query: { age: { "24_and_younger": 0.2, "55_and_older": -0.3 }, gender: { male: 0.1, female: -0.1 } } }, null, { entity_id: "y" }] } };
  const blocks = demoBlocks(res);
  assert.equal(blocks.length, 1);
  const side = audienceSide(blocks)!;
  assert.equal(side.skew, "younger");
  assert.equal(side.age["30_to_34"], 0, "missing buckets count as 0");
  assert.equal(audienceSide([]), undefined);
});

test("countryOf: ISO code, country names in queries, seed cities, region fallback", () => {
  assert.equal(countryOf({ country: "de" }), "DE");
  assert.equal(countryOf({ query: "Pune, India" }), "IN");
  assert.equal(countryOf({ name: "Kuala Lumpur" }), "MY");
  assert.equal(countryOf({ query: "Austin, Texas", region: "na" }), "US");
  assert.equal(countryOf({ query: "Toronto", region: "na" }), "CA");
  assert.equal(countryOf({ query: "São Paulo, Brazil" }), "BR");
  assert.equal(countryOf({ query: "Somewhere", region: "africa" }), undefined);
});

test("every region note and slot source is an https link", () => {
  for (const r of REGIONS) for (const n of r.notes) assert.match(n.source.url, /^https:\/\//, `${r.code}: ${n.text}`);
  for (const [k, list] of Object.entries(SLOT_SOURCES)) for (const s of list) assert.match(s.url, /^https:\/\//, k);
  const keys = new Set(Object.keys(SLOT_SOURCES));
  for (const kind of [...Object.keys(DISCIPLINES), "unknown"]) for (const s of slotsFor(kind)) for (const k of s.src ?? []) assert.ok(keys.has(k), `${kind}/${s.key}: source ${k}`);
  // Every discipline has its own slots (not the fallback), each with at least one cited source.
  for (const kind of Object.keys(DISCIPLINES)) {
    assert.ok(SLOTS[kind], `${kind} has explicit slots`);
    assert.ok(slotsFor(kind).some((s) => (s.src ?? []).some((k) => SLOT_SOURCES[k]?.length)), `${kind} cites a source`);
  }
});

test("boundaries: clean is exclusive; defaults per kind", () => {
  assert.deepEqual(parseBoundaries("clean,dark"), ["dark"]);
  assert.deepEqual(parseBoundaries("", "comedian"), ["edgy"]);
  assert.deepEqual(parseBoundaries(undefined, "speaker"), ["clean"]);
});

test("eraRerank keeps items without years in place and does nothing for an even room", () => {
  const list = [{ n: "a" }, { n: "b", properties: { release_year: 2020 } }, { n: "c", properties: { release_year: 1980 } }];
  assert.deepEqual(eraRerank(list, "even"), list);
  assert.deepEqual(eraRerank([{ n: "a" }, { n: "b" }], "younger").map((x) => x.n), ["a", "b"]);
});

test("contextPrompt states the slot, the budget and the avoid rules", () => {
  const p = contextPrompt(performanceContext({ kind: "comedian", slot: "support", place: "Mumbai, India" }));
  assert.match(p, /opener/);
  assert.match(p, /at most 1 local touch/);
  assert.match(p, /religion/);
});
