import { randomUUID } from "node:crypto";

import { findCity } from "@tourbo/core/engine/cities.ts";
import { cityMetrics } from "@tourbo/core/engine/compare.ts";
import type { Recommendation } from "@tourbo/core/engine/economics.ts";
import { diffPlans, parseLevers, retotal, type Levers } from "@tourbo/core/engine/levers.ts";
import { alternativesFrom, detectPrompts, type Alternative } from "@tourbo/core/engine/prompts.ts";
import { applyLocalEdits, constraintLine, EditError, LOCAL_OPS, type Constraint, type PlanEdit, type Preference, type Proposal } from "@tourbo/core/engine/proposals.ts";
import { haversineKm } from "@tourbo/core/engine/routing.ts";
import type { CityPlan, Hotspot, Plan } from "@tourbo/core/shared/types.ts";

import { connectMcp, type McpSession } from "../mcp.server.ts";
import { changeEdits, previewPlanEdits } from "@tourbo/core/runs/edits.server.ts";
import { getRun, getSteps, savePlan, saveStep } from "./runs.server.ts";
import { toMoney } from "./tools.ts";
import { traceHistory } from "./trace.server.ts";

// Proposals, levers, preferences and Tourbo's questions for one run (PLAN §18 Q20). Stored in
// run_steps: "proposal" (key = id), "plan_before" (key = proposal id, for Undo), "levers" /
// "constraints" / "prefs" (key "current"). Writes happen only behind the owner key (api.chat.ts).
//
// Edits: previewEdits uses the plan editor's engine (engine/edit.ts, PLAN Q19); Apply / Undo go
// through edits.server.ts changeEdits, the same versioned edit list the map and "Change" use.

const STEP = { proposal: "proposal", before: "plan_before", levers: "levers", constraints: "constraints", prefs: "prefs" } as const;
const CURRENT = "current";

async function one<T>(runId: string, step: string, key = CURRENT): Promise<T | undefined> {
  return (await getSteps<T>(runId, step).catch(() => new Map<string, T>())).get(key);
}

// ---------- Alternatives (other cities this run scored; from its trace, no fan-data calls) ----------

export async function alternativesFor(runId: string, plan: Plan): Promise<Alternative[]> {
  const { scores } = cityMetrics(await traceHistory(runId).catch(() => []));
  return alternativesFrom(scores, plan, (name) => {
    const c = findCity(plan.params.region, name);
    return c ? { lat: c.lat, lon: c.lon } : undefined;
  });
}

// Preview a list of edits on a plan with the plan editor's engine (engine/edit.ts applyPlanEdits):
// every op, swap_city / add_night included, runs on the run's own candidates (the cities and rooms
// it already checked), so no fan-data calls. Throws EditError (one plain sentence) when it can't.
export async function previewEdits(runId: string, plan: Plan, edits: PlanEdit[]) {
  const r = await previewPlanEdits(runId, plan, edits).catch((error: Error) => {
    throw new EditError(error instanceof EditError ? error.message : "That change didn't work on this plan. Reload and try again.");
  });
  if (r.errors.length) throw new EditError(r.errors[0]);
  return { plan: r.plan, diff: diffPlans(plan, r.plan), changes: r.changes, edits: r.edits };
}

// ---------- Proposals ----------

export async function proposeEdits(runId: string, title: string, edits: PlanEdit[]): Promise<Proposal> {
  const run = await getRun(runId);
  if (!run?.plan) throw new EditError("The plan isn't ready yet.");
  const r = await previewEdits(runId, run.plan, edits);
  if (!r.changes.length) throw new EditError("That wouldn't change anything in the plan.");
  const p: Proposal = { id: randomUUID(), title: title.slice(0, 140), kind: "edit", edits, diff: r.diff, changes: r.changes, status: "pending", createdAt: new Date().toISOString() };
  await saveStep(runId, STEP.proposal, p.id, p);
  return p;
}

export async function proposeConstraints(runId: string, title: string, constraints: Constraint[]): Promise<Proposal> {
  if (!constraints.length) throw new EditError("There's nothing to save.");
  const p: Proposal = { id: randomUUID(), title: title.slice(0, 140), kind: "constraint", constraints, changes: constraints.map(constraintLine), status: "pending", createdAt: new Date().toISOString() };
  await saveStep(runId, STEP.proposal, p.id, p);
  return p;
}

export async function getProposal(runId: string, id: string) {
  return one<Proposal>(runId, STEP.proposal, id);
}

export async function listProposals(runId: string): Promise<Proposal[]> {
  const all = await getSteps<Proposal>(runId, STEP.proposal).catch(() => new Map<string, Proposal>());
  return [...all.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Apply re-runs the preview on the plan as it is now (it may have changed since the card was made).
export async function applyProposal(runId: string, id: string): Promise<{ proposal: Proposal; plan?: Plan }> {
  const p = await getProposal(runId, id);
  if (!p) throw new EditError("That suggestion isn't here any more. Ask again.");
  if (p.status === "applied") return { proposal: p };
  if (p.kind === "constraint") {
    const cur = (await one<{ items: Constraint[] }>(runId, STEP.constraints))?.items ?? [];
    await saveStep(runId, STEP.constraints, CURRENT, { items: [...cur, ...(p.constraints ?? [])].slice(-40) });
    const done = { ...p, status: "applied" as const };
    await saveStep(runId, STEP.proposal, id, done);
    return { proposal: done };
  }
  const run = await getRun(runId);
  if (!run?.plan) throw new EditError("The plan isn't ready yet.");
  if (run.status !== "done") throw new EditError("Wait until the plan is done, then apply it.");
  // One write path with the map and "Change" (edits.server.ts): the proposal's edits join the act's
  // edit list as one group, so Undo (here or on the plan) takes them back together.
  const r = await previewEdits(runId, run.plan, p.edits ?? []);
  const saved = await changeEdits(runId, { kind: "applyMany", edits: r.edits, group: id });
  if (!saved.ok) throw new EditError(saved.error);
  const done: Proposal = { ...p, status: "applied", diff: diffPlans(run.plan, saved.plan), changes: r.changes };
  await saveStep(runId, STEP.proposal, id, done);
  return { proposal: done, plan: saved.plan };
}

export async function discardProposal(runId: string, id: string): Promise<Proposal> {
  const p = await getProposal(runId, id);
  if (!p) throw new EditError("That suggestion isn't here any more.");
  const done = { ...p, status: "discarded" as const };
  await saveStep(runId, STEP.proposal, id, done);
  return done;
}

export async function undoProposal(runId: string, id: string): Promise<{ proposal: Proposal; plan?: Plan }> {
  const p = await getProposal(runId, id);
  if (!p || p.status !== "applied") throw new EditError("There's nothing to undo for that suggestion.");
  if (p.kind === "constraint") {
    const cur = (await one<{ items: Constraint[] }>(runId, STEP.constraints))?.items ?? [];
    const drop = new Set((p.constraints ?? []).map((c) => JSON.stringify(c)));
    await saveStep(runId, STEP.constraints, CURRENT, { items: cur.filter((c) => !drop.has(JSON.stringify(c))) });
    const undone = { ...p, status: "undone" as const };
    await saveStep(runId, STEP.proposal, id, undone);
    return { proposal: undone };
  }
  const saved = await changeEdits(runId, { kind: "undoGroup", group: id });
  if (!saved.ok) {
    // Applied before the shared edit list (a saved copy of the plan): put that copy back.
    const before = await one<Plan>(runId, STEP.before, id);
    if (!before) throw new EditError(saved.error);
    await savePlan(runId, before);
  }
  const undone = { ...p, status: "undone" as const };
  await saveStep(runId, STEP.proposal, id, undone);
  return { proposal: undone, plan: saved.ok ? saved.plan : undefined };
}

// ---------- Levers, constraints, preferences ----------

export const getLevers = async (runId: string): Promise<Levers> => parseLevers(await one<Levers>(runId, STEP.levers));
export const saveLevers = (runId: string, levers: Levers) => saveStep(runId, STEP.levers, CURRENT, parseLevers(levers));
export const getConstraints = async (runId: string) => (await one<{ items: Constraint[] }>(runId, STEP.constraints))?.items ?? [];

type Prefs = { items: (Preference & { promptId?: string; option?: string })[] };
export const getPrefs = async (runId: string) => (await one<Prefs>(runId, STEP.prefs))?.items ?? [];

export async function recordAnswer(runId: string, promptId: string, option: string, prefer: Preference) {
  const items = (await getPrefs(runId)).filter((p) => p.promptId !== promptId);
  items.push({ ...prefer, promptId, option, at: new Date().toISOString() });
  await saveStep(runId, STEP.prefs, CURRENT, { items: items.slice(-100) } satisfies Prefs);
}

// Open questions for the plan as saved (answered ones left out).
export async function promptsFor(runId: string, plan: Plan) {
  const [alternatives, prefs] = await Promise.all([alternativesFor(runId, plan), getPrefs(runId)]);
  return detectPrompts(plan, { alternatives, answered: prefs.map((p) => p.promptId).filter((x): x is string => !!x) });
}
