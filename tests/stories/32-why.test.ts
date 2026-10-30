// Story 32: on an existing plan, Maya sees why each night beat the next-best city in one plain
// sentence that only uses the plan's own numbers and names; a revisit costs nothing.
// No-LLM part: facts + templates for every night and deal pass the grounding critic.
// STORY_LLM=1 part: one batched AI call writes the lines; every line passes the critic; the second
// call is served from the saved results (no new tokens).
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { closeDb, db } from "../../packages/core/src/db/client.server.ts";
import { cityMetrics } from "../../packages/core/src/engine/compare.ts";
import { groundCheck, templateLine } from "../../packages/core/src/engine/explain.ts";
import { dealItems, nightItems } from "../../packages/core/src/engine/explain-facts.ts";
import type { Plan, TraceEvent } from "../../packages/core/src/shared/types.ts";

after(() => closeDb());

async function latestPlan(): Promise<{ id: string; plan: Plan; scores: Map<string, number> } | undefined> {
  const sql = await db();
  const [row] = await sql<{ id: string; plan: Plan }[]>`select id, plan from runs where status = 'done' and plan is not null order by created_at desc limit 1`;
  if (!row) return undefined;
  const events = await sql<{ seq: number; kind: string; payload: TraceEvent }[]>`select seq, kind, payload from trace_events where run_id = ${row.id} order by seq`;
  return { id: row.id, plan: row.plan, scores: cityMetrics(events.map((e) => e.payload)).scores };
}

test("every night and deal of an existing plan has grounded facts and a grounded template", async (t) => {
  const run = await latestPlan().catch(() => undefined);
  if (!run) return t.skip("no finished plan in the database");
  const items = [...nightItems(run.plan, run.scores), ...dealItems(run.plan)];
  assert.equal(items.filter((i) => i.id.startsWith("night:")).length, run.plan.stops.length);
  for (const i of items) {
    if (i.evidence !== "none") assert.ok(i.chip, `${i.id} has a fact chip`);
    const check = groundCheck(templateLine(i), i);
    assert.deepEqual(check.problems, [], `${i.id}: ${templateLine(i)}`);
  }
});

const llm = process.env.STORY_LLM === "1" && !!process.env.ANTHROPIC_API_KEY;

test("STORY_LLM: one batch writes grounded lines; the revisit is free", { skip: !llm && "set STORY_LLM=1", timeout: 180_000 }, async (t) => {
  const run = await latestPlan();
  if (!run) return t.skip("no finished plan in the database");
  const { explainMany, itemsForRun } = await import("../../apps/web/server/agent/explain.server.ts");
  const { usageSummary } = await import("../../apps/web/server/agent/usage.ts");
  const ids = [...run.plan.stops.map((_, i) => `night:${i}`), ...run.plan.stops.map((_, i) => `deal:${i}`)];
  const items = await itemsForRun(run.id, ids);
  const sql = await db();
  await sql`delete from run_steps where run_id = ${run.id} and step = 'explain'`;
  const calls = () => usageSummary().reduce((n, u) => n + u.calls, 0);

  const before = calls();
  const first = await explainMany(items, { runId: run.id });
  const strong = items.filter((i) => i.evidence === "strong");
  assert.ok(calls() - before <= Math.ceil(strong.length / 25) * 2, "one call per batch (plus at most one retry)");
  for (const e of first) {
    const item = items.find((i) => i.id === e.id)!;
    if (item.evidence !== "strong") {
      assert.equal(e.text, undefined, `${e.id}: no sentence without strong evidence`);
      continue;
    }
    assert.ok(e.text && e.parts?.length, `${e.id} has a line`);
    assert.ok(groundCheck(e.text!, item).ok, `${e.id}: ${e.text}`);
    assert.doesNotMatch(e.text!, /qloo|claude|anthropic/i);
  }
  if (strong.length) assert.ok(first.some((e) => e.source === "ai"), "the AI wrote at least one line that passed");

  const mid = calls();
  const again = await explainMany(items, { runId: run.id });
  assert.equal(calls(), mid, "revisit is served from saved results");
  assert.deepEqual(again.map((e) => e.text), first.map((e) => e.text));
});
