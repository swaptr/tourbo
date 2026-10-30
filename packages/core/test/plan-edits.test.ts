// Unit test for the plan-edit store (@tourbo/core/runs/edits.server.ts, used by the web app and
// tourbo_plan_edit): drop a night, undo, apply two edits as one step, version guard, reset.
// Runs on a copy of a finished run in the active DB (no fan-data or AI calls); skips without one.
// Usage: npm run test -w @tourbo/core
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { closeDb } from "../src/db/client.server.ts";
import { DROPPED, stopKey } from "../src/engine/edit.ts";
import { cloneDoneRun, deleteRun } from "../src/runs/clone.server.ts";
import { basePlan, changeEdits, editState, loadPool } from "../src/runs/edits.server.ts";
import { runPlanRow } from "../src/runs/steps.server.ts";
import type { Plan } from "../src/shared/types.ts";

let run: { id: string; plan: Plan } | undefined;
before(async () => {
  run = await cloneDoneRun("plan-edits unit test");
});
after(async () => {
  if (run) await deleteRun(run.id);
  await closeDb();
});

const ok = <T extends { ok: boolean }>(r: T) => {
  assert.ok(r.ok, `edit failed: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

test("edits: drop, undo, grouped apply, version guard, reset", async (t) => {
  if (!run) return t.skip("no finished run with saved candidates in this DB");
  const { id, plan } = run;
  const played = plan.stops.filter((s) => s.money?.verdict !== "skip");
  const night = stopKey(played[1] ?? played[0]);

  assert.equal((await editState(id)).version, 0);
  assert.ok((await loadPool({ id, plan }))?.cities.length, "pool from the run's saved candidates");

  const dropped = ok(await changeEdits(id, { kind: "apply", edit: { op: "dropNight", night } }, 0));
  assert.equal(dropped.state.version, 1);
  assert.equal(dropped.plan.edited, 1);
  assert.equal(dropped.plan.stops.find((s) => stopKey(s) === night)?.money?.reason, DROPPED);
  assert.ok(dropped.diff.removed.includes(night));
  assert.deepEqual((await basePlan(id))?.stops.map(stopKey), plan.stops.map(stopKey), "Tourbo's plan kept as base");
  assert.equal((await runPlanRow(id))?.plan?.edited, 1, "runs.plan holds base + edits");

  const stale = await changeEdits(id, { kind: "reset" }, 0);
  assert.ok(!stale.ok && stale.status === 409, "stale version is refused");

  const undone = ok(await changeEdits(id, { kind: "undo" }));
  assert.equal(undone.state.edits.length, 0);
  assert.equal(undone.plan.money?.profit, plan.money?.profit, "undo restores the money");

  const bad = await changeEdits(id, { kind: "apply", edit: { op: "dropNight", night: "nowhere~x" } });
  assert.ok(!bad.ok && bad.status === 422 && /^[^\n]{10,240}$/.test(bad.error), "bad night is one plain sentence");

  const many = ok(await changeEdits(id, { kind: "applyMany", group: "g1", edits: [{ op: "dropNight", night }, { op: "restoreNight", night }] }));
  assert.equal(many.state.edits.length, 2);
  const undoGroup = ok(await changeEdits(id, { kind: "undo" }));
  assert.equal(undoGroup.state.edits.length, 0, "a group undoes together");

  ok(await changeEdits(id, { kind: "apply", edit: { op: "dropNight", night } }));
  const reset = ok(await changeEdits(id, { kind: "reset" }));
  assert.equal(reset.state.edits.length, 0);
  assert.equal(reset.plan.edited, undefined);
  assert.equal(reset.plan.totalKm, plan.totalKm);
});
