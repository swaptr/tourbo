import { db } from "@tourbo/core/db/client.server.ts";
import { Plan } from "@tourbo/core/shared/types.ts";

import { UserError } from "../errors.ts";

const UUID = /^[0-9a-f-]{36}$/i;

// A saved tour plan by run id (the id in /plan/<id>), read-only. Plans are made on the website
// or by the hosted agent; tourbo_plan_tour results are not saved.
export async function runPlan(runId: string): Promise<{ plan: Plan; status: string }> {
  if (!UUID.test(runId)) throw new UserError("That plan id isn't valid: use the id from /plan/<id>.");
  const sql = await db();
  const [row] = await sql<{ status: string; plan: unknown }[]>`select status, plan from runs where id = ${runId}`;
  if (!row) throw new UserError("No plan with that id: it may have been deleted.");
  if (!row.plan) throw new UserError(`That plan has no nights yet (status: ${row.status}); try again when it's done.`);
  return { plan: Plan.parse(row.plan), status: row.status };
}
