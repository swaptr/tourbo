import { randomUUID } from "node:crypto";

import { db } from "@tourbo/core/db/client.server.ts";
import { findCity } from "@tourbo/core/engine/cities.ts";
import {
  applyEdits,
  applyPlanEdits,
  buildPool,
  diff,
  overrideFor,
  preferences,
  stopKey,
  type Diff,
  type Edit,
  type EditRecord,
  type Pool,
  type PoolRows,
  type Preference,
} from "@tourbo/core/engine/edit.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import type { PlanEdit } from "@tourbo/core/engine/proposals.ts";
import type { Plan, TraceEvent } from "@tourbo/core/shared/types.ts";

import { getRun, getSteps, savePlan, saveStep, type Run } from "./runs.server.ts";
import { traceHistory } from "./trace.server.ts";

// "Your plan, your call" (PLAN §18 Q19) on the server: the act's edits are a versioned list on the
// run (run_steps "edits"); Tourbo's own plan is kept as "base" on the first edit; runs.plan always
// holds base + edits, so every other tab (show notes, emails, tickets, insights) sees the act's
// plan. The candidate pool comes from what the run saved while planning (run_steps "pool" /
// "pool_venues") or, for older runs, from its trace. No fan-data calls.

export type EditState = { version: number; edits: EditRecord[]; dismissed: string[] };
const EMPTY: EditState = { version: 0, edits: [], dismissed: [] };

export async function editState(runId: string): Promise<EditState> {
  const steps = await getSteps<EditState>(runId, "edits").catch(() => new Map<string, EditState>());
  return steps.get("state") ?? EMPTY;
}

export async function basePlan(runId: string): Promise<Plan | undefined> {
  const steps = await getSteps<Plan>(runId, "edits_base").catch(() => new Map<string, Plan>());
  return steps.get("base");
}

export async function poolRows(runId: string): Promise<PoolRows> {
  const [pool, venues] = await Promise.all([
    getSteps<PoolRows>(runId, "pool").catch(() => new Map<string, PoolRows>()),
    getSteps<NonNullable<PoolRows["venues"]>[string]>(runId, "pool_venues").catch(() => new Map()),
  ]);
  const cities = pool.get("cities");
  return { ...cities, openers: pool.get("openers")?.openers, venues: Object.fromEntries(venues) };
}

export async function loadPool(run: Pick<Run, "id" | "plan">, events?: TraceEvent[]): Promise<Pool | undefined> {
  const base = (await basePlan(run.id)) ?? run.plan;
  if (!base) return undefined;
  await ensureWorld().catch(() => false);
  const [rows, trace] = await Promise.all([poolRows(run.id), events ? Promise.resolve(events) : traceHistory(run.id)]);
  return buildPool(base, trace, rows, (name) => findCity(base.params.region, name));
}

export type EditResult =
  | { ok: true; plan: Plan; state: EditState; diff: Diff; prefs: Preference[]; notice?: Preference; errors: string[] }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): EditResult => ({ ok: false, status, error });

// Stable night keys for artifacts made before the first edit (they were keyed by night number).
async function keyArtifacts(runId: string, base: Plan) {
  const sql = await db();
  await Promise.all(
    base.stops.map((s, i) =>
      Promise.all([
        sql`update show_prep set stop_key = ${stopKey(s)} where run_id = ${runId} and stop_index = ${i} and stop_key is null`,
        sql`update checkins set stop_key = ${stopKey(s)} where run_id = ${runId} and stop_index = ${i} and stop_key is null`,
      ]),
    ),
  );
}

// applyMany: several edits as one step (an Ask Tourbo proposal, group = its id); undoGroup takes
// exactly that group back out, wherever it is in the list. Chat and the map share this one list.
type Change =
  | { kind: "apply"; edit: Edit; source?: string } // source: who made it when not the act ("venue passed")
  | { kind: "applyMany"; edits: Edit[]; group: string }
  | { kind: "undo" }
  | { kind: "undoGroup"; group: string }
  | { kind: "reset" }
  | { kind: "dismiss"; pref: string }
  | { kind: "restorePref"; pref: string };

// One change to the act's edits; version guards against two tabs editing at once.
export async function changeEdits(runId: string, change: Change, version?: number): Promise<EditResult> {
  const run = await getRun(runId);
  if (!run?.plan) return fail(404, "This plan isn't here any more. It may have been deleted.");
  if (run.status !== "done") return fail(409, "Wait until the plan is done, then change it.");
  const state = await editState(runId);
  if (version !== undefined && version !== state.version) return fail(409, "This plan changed in another tab. Reload to see the latest, then try again.");
  let base = await basePlan(runId);
  if (!base) {
    base = run.plan;
    await saveStep(runId, "edits_base", "base", base);
    await keyArtifacts(runId, base).catch(() => {});
  }
  const pool = await loadPool({ id: runId, plan: base });
  if (!pool) return fail(404, "This plan has no nights yet.");
  const ctx = { pool };
  let edits = state.edits;
  let dismissed = state.dismissed;
  let errors: string[] = [];
  const before = run.plan;
  if (change.kind === "apply") {
    const prior = applyEdits(base, edits, ctx).plan;
    const trial = applyEdits(base, [...edits, change.edit], ctx);
    const own = trial.errors.find((e) => e.edit === change.edit);
    if (own) return fail(422, own.error);
    // An edit the act didn't make (a venue passed) is no override of Tourbo's pick: no preference.
    edits = [...edits, { ...change.edit, id: randomUUID(), when: new Date().toISOString(), ...(change.source ? { source: change.source } : { override: overrideFor(prior, trial.plan, change.edit) }) }];
  } else if (change.kind === "applyMany") {
    let prior = applyEdits(base, edits, ctx).plan;
    const added: EditRecord[] = [];
    for (const edit of change.edits) {
      const trial = applyEdits(prior, [edit], ctx);
      if (trial.errors.length) return fail(422, trial.errors[0].error);
      added.push({ ...edit, id: randomUUID(), when: new Date().toISOString(), group: change.group, override: overrideFor(prior, trial.plan, edit) });
      prior = trial.plan;
    }
    edits = [...edits, ...added];
  } else if (change.kind === "undo") {
    if (!edits.length) return fail(409, "Nothing to undo.");
    // A proposal's edits go back together.
    const group = edits.at(-1)!.group;
    edits = group ? edits.filter((e) => e.group !== group) : edits.slice(0, -1);
  } else if (change.kind === "undoGroup") {
    if (!edits.some((e) => e.group === change.group)) return fail(409, "There's nothing to undo for that suggestion.");
    edits = edits.filter((e) => e.group !== change.group);
  } else if (change.kind === "reset") {
    edits = [];
  } else if (change.kind === "dismiss") {
    dismissed = [...new Set([...dismissed, change.pref])];
  } else {
    dismissed = dismissed.filter((d) => d !== change.pref);
  }
  const result = applyEdits(base, edits, ctx);
  errors = result.errors.map((e) => e.error);
  const plan: Plan = { ...result.plan, edited: edits.length || undefined };
  const next: EditState = { version: state.version + 1, edits, dismissed };
  await saveStep(runId, "edits", "state", next);
  await savePlan(runId, plan);
  const prefsBefore = preferences(state.edits, state.dismissed);
  const prefs = preferences(edits, dismissed);
  const notice = change.kind === "apply" ? prefs.find((p) => !prefsBefore.some((q) => q.id === p.id)) : undefined;
  return { ok: true, plan, state: next, diff: diff(before, plan), prefs, notice, errors };
}

// The night index each saved artifact belongs to now. Rows keyed by night (stop_key) follow their
// night when nights move; a row whose night was changed has no index (-1) and is no longer shown.
// Rows made before any edit (no key) keep their night number.
export function nightOf(plan: Plan | null | undefined) {
  const keys = new Map((plan?.stops ?? []).map((s, i) => [stopKey(s), i]));
  return (row: { stop_index: number; stop_key?: string | null }) => (row.stop_key ? (keys.get(row.stop_key) ?? -1) : row.stop_index);
}

// Preview of shared-contract edits (engine/proposals.ts PlanEdit) on the run's plan, no write.
export async function previewPlanEdits(runId: string, plan: Plan, edits: PlanEdit[]) {
  const pool = await loadPool({ id: runId, plan });
  if (!pool) throw new Error("no plan");
  return applyPlanEdits(plan, edits, { pool });
}
