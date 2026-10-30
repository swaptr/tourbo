// Story 34 (PLAN §18 Q19): "your plan, your call". On a finished plan the act swaps night 3 for
// another city Tourbo checked: the money, route and totals recompute, the other nights keep their
// saved show notes, Undo / Reset bring Tourbo's plan back, and only the owner key may edit.
// Uses a copy of an existing finished run (its trace and saved candidates); no fan-data or AI calls.
// Needs `npm run dev`.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { stopKey, type Pool } from "@tourbo/core/engine/edit.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { getPreps } from "../../apps/web/server/agent/prep.server.ts";
import { editState } from "@tourbo/core/runs/edits.server.ts";
import { applyProposal, proposeEdits, undoProposal } from "../../apps/web/server/agent/proposals.server.ts";
import { appUp, BASE } from "./_mcp.ts";

const PLAIN = /^[^\n]{10,200}$/;
let up = false;
let id: string | undefined;
let key = "";
let plan: Plan | undefined;

// A finished plan with 4+ nights copied under a new id with this test's owner key, plus its trace,
// saved candidates and one fake show note per night (keyed by night number, as before Q19).
before(async () => {
  up = await appUp();
  const sql = await db();
  const [src] = await sql<{ id: string; plan: Plan; params: unknown }[]>`
    select r.id, r.plan, r.params from runs r
    where r.status = 'done' and jsonb_array_length(r.plan->'stops') >= 4
      and exists (select 1 from run_steps s where s.run_id = r.id and s.step = 'pool')
      and not exists (select 1 from run_steps s where s.run_id = r.id and s.step = 'edits')
    order by r.created_at desc limit 1`;
  if (!src) return;
  key = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(key).digest("hex");
  const [row] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status, plan, owner_hash)
    values ('Story 34 act', ${sql.json(src.params as never)}, 'done', ${sql.json(src.plan as never)}, ${hash}) returning id`;
  id = row.id;
  plan = src.plan;
  await sql`insert into trace_events (run_id, seq, kind, payload, created_at) select ${id}, seq, kind, payload, created_at from trace_events where run_id = ${src.id}`;
  await sql`insert into run_steps (run_id, step, key, output) select ${id}, step, key, output from run_steps where run_id = ${src.id} and step in ('pool', 'pool_venues')`;
  for (const [i, s] of src.plan.stops.entries())
    await sql`insert into show_prep (run_id, stop_index, prep) values (${id}, ${i}, ${sql.json({ city: s.city.name, marker: `notes-${i}` } as never)})`;
});
after(async () => {
  const sql = await db();
  if (id) await sql`delete from runs where id = ${id}`;
  await closeDb();
});

const post = (body: unknown, owner = true) =>
  fetch(`${BASE}/plan/${id}/edits`, { method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { "X-Owner-Key": key } : {}) }, body: JSON.stringify(body) });

test("Edit plan: the run's own candidates come back without new fan-data calls", async (t) => {
  if (!up || !id) return t.skip("needs the app running and a finished plan with saved candidates");
  const res = await fetch(`${BASE}/plan/${id}/edits`);
  assert.equal(res.status, 200);
  const { pool, version } = (await res.json()) as { pool: Pool; version: number };
  assert.equal(version, 0);
  assert.ok(pool.cities.length > plan!.stops.length, "other cities Tourbo checked are there");
  assert.ok(pool.cities.some((c) => c.venues.length > 2), "room candidates beyond the pick and backup");
});

test("Edit plan: only the owner key may edit; one plain sentence otherwise", async (t) => {
  if (!up || !id) return t.skip("needs the app running and a finished plan with saved candidates");
  const night = stopKey(plan!.stops[2]);
  const refused = await post({ action: "apply", edit: { op: "dropNight", night } }, false);
  assert.equal(refused.status, 403);
  assert.match(await refused.text(), /Only the browser that made this can change or delete it/);
  const wrong = await fetch(`${BASE}/plan/${id}/edits`, { method: "POST", headers: { "Content-Type": "application/json", "X-Owner-Key": "not-the-key" }, body: JSON.stringify({ action: "reset" }) });
  assert.equal(wrong.status, 403);
});

test("Edit plan: swap night 3 → totals change, other nights' notes untouched, undo and reset", async (t) => {
  if (!up || !id) return t.skip("needs the app running and a finished plan with saved candidates");
  const { pool } = (await (await fetch(`${BASE}/plan/${id}/edits`)).json()) as { pool: Pool };
  const taken = new Set(plan!.stops.map((s) => s.city.name));
  const alt = pool.cities.find((c) => !taken.has(c.name) && c.venues.length)!;
  assert.ok(alt, "an alternative city with rooms");
  const before = await getPreps(id!);
  assert.equal(Object.keys(before).length, plan!.stops.length);

  const res = await post({ action: "apply", edit: { op: "swapCity", night: stopKey(plan!.stops[2]), city: alt.name }, version: 0 });
  assert.equal(res.status, 200);
  const out = (await res.json()) as { plan: Plan; version: number; diff: { totals: { profit: number; km: number }; changed: string[]; removed: string[] } };
  assert.equal(out.version, 1);
  assert.equal(out.plan.stops[2].city.name, alt.name);
  assert.equal(out.plan.stops[2].yours?.suggested?.city, plan!.stops[2].city.name);
  assert.notEqual(out.plan.money!.profit, plan!.money!.profit, "tour total changed");
  assert.equal(out.plan.money!.profit, out.plan.stops.filter((s) => s.money?.verdict !== "skip").reduce((a, s) => a + s.money!.profit, 0));
  assert.notEqual(out.plan.totalKm, plan!.totalKm, "route changed");
  assert.equal(out.diff.removed.length, 1);
  assert.deepEqual(out.plan.stops[0].money, plan!.stops[0].money, "night 1 keeps its numbers");

  // The page shows the edited plan; other nights keep their notes, night 3's are gone.
  const page = await fetch(`${BASE}/plan/${id}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(alt.name));
  const after = await getPreps(id!);
  for (const i of [0, 1, 3]) assert.deepEqual(after[i], before[i], `night ${i + 1} notes untouched`);
  assert.equal(after[2], undefined, "night 3's notes are invalidated");

  const stale = await post({ action: "undo", version: 0 });
  assert.equal(stale.status, 409);
  assert.match(((await stale.json()) as { error: string }).error, PLAIN);

  const undone = (await (await post({ action: "undo", version: 1 })).json()) as { plan: Plan };
  assert.equal(undone.plan.stops[2].city.name, plan!.stops[2].city.name);
  assert.equal(undone.plan.money!.profit, plan!.money!.profit);
  assert.deepEqual((await getPreps(id!))[2], before[2], "undo brings night 3's notes back");

  await post({ action: "apply", edit: { op: "dropNight", night: stopKey(plan!.stops[1]) } });
  const reset = (await (await post({ action: "reset" })).json()) as { plan: Plan; edits: unknown[] };
  assert.equal(reset.edits.length, 0);
  assert.deepEqual(reset.plan.stops.map(stopKey), plan!.stops.map(stopKey));
  assert.equal(reset.plan.money!.profit, plan!.money!.profit);
});

test("Edit plan: a change that can't apply says so in one sentence", async (t) => {
  if (!up || !id) return t.skip("needs the app running and a finished plan with saved candidates");
  const res = await post({ action: "apply", edit: { op: "swapCity", night: stopKey(plan!.stops[0]), city: plan!.stops[1].city.name } });
  assert.equal(res.status, 422);
  assert.match(((await res.json()) as { error: string }).error, PLAIN);
});

test("Edit plan: an Ask Tourbo proposal and the map share one edit list and one Undo", async (t) => {
  if (!up || !id) return t.skip("needs the app running and a finished plan with saved candidates");
  const p = await proposeEdits(id!, "Drop night 2 and move night 4 earlier", [{ op: "drop_night", night: 1 }, { op: "reorder", night: 3, to: 2 }]);
  assert.equal(p.changes.length, 2);
  const applied = await applyProposal(id!, p.id);
  assert.equal(applied.plan!.stops[1].money?.verdict, "skip");
  const state = await editState(id!);
  assert.deepEqual(state.edits.map((e) => e.group), [p.id, p.id]);
  // The plan page's Undo takes the whole proposal back.
  const undone = (await (await post({ action: "undo", version: state.version })).json()) as { plan: Plan; edits: unknown[] };
  assert.equal(undone.edits.length, 0);
  assert.equal(undone.plan.money!.profit, plan!.money!.profit);
  // Applying again, then undoing from the chat card, uses the same list.
  const p2 = await proposeEdits(id!, "Drop night 2", [{ op: "drop_night", night: 1 }]);
  await applyProposal(id!, p2.id);
  await undoProposal(id!, p2.id);
  assert.equal((await editState(id!)).edits.length, 0);
});
