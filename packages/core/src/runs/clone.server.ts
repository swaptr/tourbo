import { db } from "../db/client.server.ts";
import type { Plan } from "../shared/types.ts";

// Test helper: copy the newest finished, unedited run with saved candidates (plan, trace,
// pool rows) under a new id, so edit tests never touch a real run. undefined when none exists.
export async function cloneDoneRun(label: string, minStops = 4): Promise<{ id: string; plan: Plan } | undefined> {
  const sql = await db();
  const [src] = await sql<{ id: string; plan: Plan; params: unknown }[]>`
    select r.id, r.plan, r.params from runs r
    where r.status = 'done' and jsonb_array_length(r.plan->'stops') >= ${minStops}
      and exists (select 1 from run_steps s where s.run_id = r.id and s.step = 'pool')
      and not exists (select 1 from run_steps s where s.run_id = r.id and s.step = 'edits')
    order by r.created_at desc limit 1`;
  if (!src) return undefined;
  const [row] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status, plan) values (${label}, ${sql.json(src.params as never)}, 'done', ${sql.json(src.plan as never)}) returning id`;
  await sql`insert into trace_events (run_id, seq, kind, payload, created_at) select ${row.id}, seq, kind, payload, created_at from trace_events where run_id = ${src.id}`;
  await sql`insert into run_steps (run_id, step, key, output) select ${row.id}, step, key, output from run_steps where run_id = ${src.id} and step in ('pool', 'pool_venues')`;
  return { id: row.id, plan: src.plan };
}

export async function deleteRun(id: string) {
  const sql = await db();
  await sql`delete from runs where id = ${id}`;
}
