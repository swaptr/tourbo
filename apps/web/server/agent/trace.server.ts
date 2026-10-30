import { EventEmitter } from "node:events";

import type postgres from "postgres";

import { db } from "@tourbo/core/db/client.server.ts";
import type { Emit } from "@tourbo/core/engine/trace.ts";
import type { TraceEvent } from "@tourbo/core/shared/types.ts";

// In-process pub/sub for live SSE + Postgres for replay (Last-Event-ID, share links).
const bus = new EventEmitter();
bus.setMaxListeners(0);

// `startSeq` lets later steps (outreach) append to a finished run's trace.
export function createTrace(runId: string, startSeq = 0): Emit {
  let seq = startSeq;
  let pending = Promise.resolve();
  return (kind, message, data) => {
    const event: TraceEvent = {
      seq: ++seq,
      kind,
      message,
      data,
      at: new Date().toISOString(),
    };
    bus.emit(runId, event);
    // Writes are chained so seq order is preserved; failures don't break the run.
    pending = pending.then(() => persist(runId, event)).catch((error: Error) => {
      console.warn(`trace persist failed for ${runId}: ${error.message}`);
    });
  };
}

async function persist(runId: string, event: TraceEvent) {
  const sql = await db();
  await sql`
    insert into trace_events (run_id, seq, kind, payload, created_at)
    values (${runId}, ${event.seq}, ${event.kind},
      ${sql.json({ message: event.message, data: event.data ?? null } as postgres.JSONValue)},
      ${event.at})
    on conflict (run_id, seq) do nothing
  `;
}

export { traceHistory } from "@tourbo/core/runs/steps.server.ts";

export async function appendTrace(runId: string): Promise<Emit> {
  const sql = await db();
  const [row] = await sql<{ seq: number | null }[]>`select max(seq) as seq from trace_events where run_id = ${runId}`;
  return createTrace(runId, row?.seq ?? 0);
}

export function subscribe(runId: string, listener: (event: TraceEvent) => void) {
  bus.on(runId, listener);
  return () => bus.off(runId, listener);
}
