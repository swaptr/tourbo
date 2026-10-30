// Test-side access to plans in the suite's throwaway DB (same tables the app uses).
import { createRun, getRun, savePlan, saveStep, setRunStatus } from "../../../apps/web/server/agent/runs.server.ts";
import { newOwnerKey } from "../../../apps/web/server/owner.server.ts";
import { TourParams, type PerformerKind } from "@tourbo/core/shared/types.ts";

import { LLM } from "./harness.ts";
import { standInPlan, standInPool } from "./planner.ts";

export { getRun };

export async function waitSettled(id: string, ms = LLM ? 600_000 : 90_000) {
  const end = Date.now() + ms;
  for (;;) {
    const run = await getRun(id);
    if (run && run.status !== "pending" && run.status !== "running") return run;
    if (Date.now() > end) throw new Error(`Plan ${id} still ${run?.status} after ${ms / 1000}s`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

// No AI: the run failed at the agent step; finish it with the deterministic stand-in.
export async function finishWithStandIn(id: string) {
  const run = await waitSettled(id);
  if (run.status === "done" && run.plan) return run;
  const plan = await standInPlan(run.params);
  await saveStep(id, "pool", "cities", await standInPool(plan));
  await savePlan(id, plan);
  await setRunStatus(id, "done", plan);
  return (await getRun(id))!;
}

export const chicago = { lat: 41.88, lon: -87.63, radiusKm: 600 };

// A finished plan straight in the DB (for scenarios that start after "Plan"). Returns the owner key
// the creating browser would hold.
export async function seedPlan(kind: PerformerKind, artist = "Test Act 3", extra: Partial<Record<string, unknown>> = {}) {
  const params = TourParams.parse({
    artist,
    kind,
    peers: "",
    region: "na",
    homeBase: "Chicago",
    area: chicago,
    startDate: "2027-03-01",
    shows: 4,
    roomMin: 200,
    roomMax: 800,
    money: {},
    jobs: "",
    ...extra,
  });
  const owner = newOwnerKey();
  const id = await createRun(params, { ownerHash: owner.hash });
  const plan = await standInPlan(params);
  await saveStep(id, "pool", "cities", await standInPool(plan));
  await savePlan(id, plan);
  await setRunStatus(id, "done", plan);
  return { id, ownerKey: owner.key, title: `${artist} tour` };
}

// A run the server lost mid-way (restart): no plan, status "interrupted".
export async function seedInterrupted(kind: PerformerKind, artist = "Test Act 3") {
  const owner = newOwnerKey();
  const params = TourParams.parse({ artist, kind, peers: "", region: "na", homeBase: "Chicago", area: chicago, startDate: "2027-03-01", shows: 3, roomMin: 200, roomMax: 800, money: {}, jobs: "" });
  const id = await createRun(params, { ownerHash: owner.hash });
  await setRunStatus(id, "interrupted");
  return { id, ownerKey: owner.key, title: `${artist} tour` };
}
