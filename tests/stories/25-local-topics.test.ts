// Story 25: Rohan gets local topics. No-LLM part (live fan data via MCP `tourbo_ideas`): per city
// ≥ 8 topics across ≥ 4 categories from that city's own taste data, each with a ref, a number, a
// premise and a crowd-work question; topics differ by city. STORY_LLM=1: AI lines cite refs only.
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

type Idea = { idea: string; category: string; ref: string; value: number; why: string; angle: string; question?: string; written?: boolean };
type Result = { kind: string; cities: { city: string; ideas: Idea[] }[]; region: unknown[]; basisLine: string };
let r: Result;

test("Rohan: ≥ 8 local topics across ≥ 4 categories in Mumbai and in Pune, each grounded", { timeout: 300_000 }, async () => {
  r = await m.call("tourbo_ideas", { cities: ["Mumbai", "Pune"], region: "in", kind: "comedian" });
  for (const c of r.cities) {
    assert.ok(c.ideas.length >= 8, `${c.city}: ${c.ideas.length} topics`);
    assert.ok(new Set(c.ideas.map((i) => i.category)).size >= 4, `${c.city}: categories`);
    for (const i of c.ideas) {
      assert.ok(i.ref && Number.isFinite(i.value) && /fan data/.test(i.why), `${c.city}: ${i.ref} has a why? number`);
      assert.ok(normalizeRef(i.angle).includes(normalizeRef(i.ref)), "premise names the topic");
      assert.ok(i.question, "crowd-work question");
    }
    assert.equal(new Set(c.ideas.map((i) => normalizeRef(i.ref))).size, c.ideas.length, "no topic twice");
  }
  const [a, b] = r.cities.map((c) => new Set(c.ideas.map((i) => normalizeRef(i.ref))));
  const shared = [...a].filter((x) => b.has(x)).length;
  assert.ok(shared < Math.min(a.size, b.size) / 2, `topics differ by city (${shared} shared)`);
});

test("Rohan: topics come from that city's data, not the act's", { timeout: 120_000 }, async () => {
  const act = await m.call("tourbo_resolve_act", { name: "Zakir Khan", kind: "comedian" }).catch(() => ({ found: false }));
  if (!act.found) return;
  const withAct: Result = await m.call("tourbo_ideas", { cities: ["Mumbai", "Pune"], region: "in", kind: "comedian", act_id: act.id });
  const topics = (x: Result) => x.cities[0].ideas.map((i) => i.ref).sort().join("|");
  assert.equal(topics(withAct), topics(r), "location-only: the act doesn't change the topics");
});

const llm = process.env.STORY_LLM === "1" && !!process.env.ANTHROPIC_API_KEY;
test("Rohan: AI premises cite only that city's refs", { skip: !llm && "set STORY_LLM=1", timeout: 180_000 }, async () => {
  const { writeAngles } = await import("../../apps/web/server/agent/ideas.server.ts");
  const out = await writeAngles(r as any);
  for (const c of out.cities) for (const i of c.ideas as Idea[]) if (i.written) assert.ok(normalizeRef(i.angle).includes(normalizeRef(i.ref)), `${c.city}: ${i.angle}`);
});
