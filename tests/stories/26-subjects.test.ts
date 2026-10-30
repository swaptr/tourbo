// Story 26: Mira gets painting subjects. No-LLM part (live fan data via MCP `tourbo_ideas`): ≥ 5
// subjects per city (landmarks, places, themes, artists and films the city loves), each grounded
// with a number, labelled taste-based not sales predictions, different by city.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { normalizeRef } from "@tourbo/core/engine/brief.ts";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(async () => {
  await m.close();
  await closeDb();
});

type Idea = { category: string; ref: string; value: number; why: string; angle: string };
type Result = { label: string; cities: { city: string; ideas: Idea[] }[] };

test("Mira: ≥ 5 grounded subjects per city for a gallery run, different in Berlin and Lisbon", { timeout: 300_000 }, async () => {
  const r: Result = await m.call("tourbo_ideas", { cities: ["Berlin", "Lisbon"], region: "eu", kind: "visual_artist" });
  assert.match(r.label, /not sales predictions/i);
  for (const c of r.cities) {
    assert.ok(c.ideas.length >= 5, `${c.city}: ${c.ideas.length} subjects`);
    assert.ok(c.ideas.some((i) => i.category === "landmarks" || i.category === "themes"), `${c.city}: has places or themes`);
    for (const i of c.ideas) {
      assert.ok(i.ref && Number.isFinite(i.value) && /fan data/.test(i.why), `${c.city}: ${i.ref}`);
      assert.ok(normalizeRef(i.angle).includes(normalizeRef(i.ref)));
    }
  }
  const [a, b] = r.cities.map((c) => c.ideas.map((i) => normalizeRef(i.ref)).sort().join("|"));
  assert.notEqual(a, b, "subjects differ by city");
});

test("Anyone, not listed: one city, no act, still gets ideas and a basis line", { timeout: 180_000 }, async () => {
  const r: Result & { basisLine: string } = await m.call("tourbo_ideas", { cities: ["Porto, Portugal"], region: "eu", kind: "visual_artist" });
  assert.ok(r.cities[0].ideas.length >= 5);
  assert.match(r.basisLine, /Porto/);
});
