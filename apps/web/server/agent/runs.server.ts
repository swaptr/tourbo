import type postgres from "postgres";

import { db } from "@tourbo/core/db/client.server.ts";
import type { Baseline, Plan, TourParams } from "@tourbo/core/shared/types.ts";

export type RunStatus = "pending" | "running" | "done" | "failed" | "interrupted";

export type Run = {
  id: string;
  artistName: string;
  params: TourParams;
  status: RunStatus;
  plan: Plan | null;
  baseline: Baseline | null;
  createdAt: Date;
};

// Runs are detached promises in this process; anything "running" that this process
// doesn't own was cut off by a restart.
const active = new Set<string>();

// ids are gen_random_uuid() (122 random bits): unguessable capability links. ownerHash is the
// sha256 of the creator's owner key (owner.server.ts); ownerFrom copies another run's (Adjust).
// profileId files the run under the act's profile (Q21 workspace); Adjust copies the parent's.
export async function createRun(params: TourParams, owner: { ownerHash?: string; ownerFrom?: string; profileId?: string } = {}): Promise<string> {
  const sql = await db();
  const [row] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status, owner_hash, profile_id)
    values (${params.artist}, ${sql.json(params as postgres.JSONValue)}, 'pending',
      coalesce(${owner.ownerHash ?? null}, (select owner_hash from runs where id = ${owner.ownerFrom ?? null}::uuid)),
      coalesce(${owner.profileId ?? null}::uuid, (select profile_id from runs where id = ${owner.ownerFrom ?? null}::uuid)))
    returning id
  `;
  return row.id;
}

export async function setRunStatus(id: string, status: RunStatus, plan?: Plan) {
  const sql = await db();
  if (status === "running") active.add(id);
  else active.delete(id);
  await sql`
    update runs
    set status = ${status},
        plan = coalesce(${plan ? sql.json(plan as postgres.JSONValue) : null}, plan),
        artist_id = coalesce(${plan?.artist.id ?? null}, artist_id)
    where id = ${id}
  `;
}

export async function getRun(id: string): Promise<Run | undefined> {
  const sql = await db();
  const [row] = await sql<
    {
      id: string;
      artist_name: string;
      params: TourParams;
      status: RunStatus;
      plan: Plan | null;
      baseline: Baseline | null;
      created_at: Date;
    }[]
  >`select id, artist_name, params, status, plan, baseline, created_at from runs where id = ${id}`;
  if (!row) return undefined;
  const status =
    (row.status === "running" || row.status === "pending") && !active.has(row.id)
      ? "interrupted"
      : row.status;
  return {
    id: row.id,
    artistName: row.artist_name,
    params: row.params,
    status,
    plan: row.plan,
    baseline: row.baseline,
    createdAt: row.created_at,
  };
}

export async function savePlan(id: string, plan: Plan) {
  const sql = await db();
  await sql`update runs set plan = ${sql.json(plan as postgres.JSONValue)} where id = ${id}`;
}

export async function setBaseline(id: string, baseline: Baseline) {
  const sql = await db();
  await sql`update runs set baseline = ${sql.json(baseline as postgres.JSONValue)} where id = ${id}`;
}

export function markActive(id: string) {
  active.add(id);
}

export const isActive = (id: string) => active.has(id);

// Finished AI outputs inside a run (run_steps), reused when a failed or interrupted run resumes.
export async function getSteps<T>(runId: string, step: string): Promise<Map<string, T>> {
  const sql = await db();
  const rows = await sql<{ key: string; output: T }[]>`select key, output from run_steps where run_id = ${runId} and step = ${step}`;
  return new Map(rows.map((r) => [r.key, r.output]));
}

export async function saveStep(runId: string, step: string, key: string, output: unknown) {
  const sql = await db();
  await sql`
    insert into run_steps (run_id, step, key, output) values (${runId}, ${step}, ${key}, ${sql.json(output as postgres.JSONValue)})
    on conflict (run_id, step, key) do update set output = excluded.output, created_at = now()`;
}
