import type postgres from "postgres";

import { db } from "../db/client.server.ts";
import type { Baseline, Plan, TourParams } from "../shared/types.ts";

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

export async function createRun(params: TourParams): Promise<string> {
  const sql = await db();
  const [row] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status)
    values (${params.artist}, ${sql.json(params as postgres.JSONValue)}, 'pending')
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

export async function setBaseline(id: string, baseline: Baseline) {
  const sql = await db();
  await sql`update runs set baseline = ${sql.json(baseline as postgres.JSONValue)} where id = ${id}`;
}

export function markActive(id: string) {
  active.add(id);
}
