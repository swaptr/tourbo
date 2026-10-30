import type postgres from "postgres";

import { db } from "../db/client.server.ts";
import type { Plan, TraceEvent } from "../shared/types.ts";

// Run storage shared by the web app and the MCP server: saved plan, finished step outputs
// (run_steps) and the stored trace. Runs themselves are created by the web app.

export async function savePlan(id: string, plan: Plan) {
  const sql = await db();
  await sql`update runs set plan = ${sql.json(plan as postgres.JSONValue)} where id = ${id}`;
}

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

export async function traceHistory(runId: string, afterSeq = 0): Promise<TraceEvent[]> {
  const sql = await db();
  const rows = await sql<
    { seq: number; kind: TraceEvent["kind"]; payload: { message: string; data: Record<string, unknown> | null }; created_at: Date }[]
  >`
    select seq, kind, payload, created_at from trace_events
    where run_id = ${runId} and seq > ${afterSeq}
    order by seq
  `;
  return rows.map((row) => ({
    seq: row.seq,
    kind: row.kind,
    message: row.payload.message,
    data: row.payload.data ?? undefined,
    at: row.created_at.toISOString(),
  }));
}

// The stored status and plan (no in-process "interrupted" mapping: callers that only act on
// "done" runs don't need it).
export async function runPlanRow(id: string): Promise<{ id: string; status: string; plan: Plan | null } | undefined> {
  const sql = await db();
  const [row] = await sql<{ id: string; status: string; plan: Plan | null }[]>`select id, status, plan from runs where id = ${id}`;
  return row;
}
