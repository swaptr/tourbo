// Story 30 (PLAN Q16): "your work" without accounts. Whoever makes a plan or project holds its
// owner key; edits and deletes need it (one plain 403 sentence otherwise), nothing lists other
// visitors' work, and a failed run resumes in place without redoing finished AI steps.
// Uses copies of existing plans in the database (no fan-data or AI calls). Needs `npm run dev`.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { createProject } from "@tourbo/core/projects/projects.server.ts";
import { getSteps, saveStep } from "../../apps/web/server/agent/runs.server.ts";
import { appUp, BASE } from "./_mcp.ts";
import { browser, chromiumPath } from "./_browser.ts";

const newKey = () => {
  const key = randomBytes(24).toString("base64url");
  return { key, hash: createHash("sha256").update(key).digest("hex") };
};
const PLAIN = /^[^\n]{10,200}$/;

let up = false;
let source: { plan: unknown; baseline: unknown; params: Record<string, unknown> } | undefined;
const made: string[] = [];
const madeProjects: string[] = [];

// A finished plan copied under a new id, with this test's owner key.
async function copyRun(status: string, hash: string | null, jobs: string[] = []) {
  const sql = await db();
  const [row] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status, plan, baseline, owner_hash)
    values ('Story 30 act', ${sql.json({ ...source!.params, jobs } as never)}, ${status}, ${sql.json(source!.plan as never)}, ${sql.json(source!.baseline as never)}, ${hash})
    returning id`;
  made.push(row.id);
  return row.id;
}

before(async () => {
  up = await appUp();
  const sql = await db();
  [source] = await sql<NonNullable<typeof source>[]>`select plan, baseline, params from runs where status = 'done' and plan is not null and baseline is not null order by created_at desc limit 1`;
});
after(async () => {
  const sql = await db();
  // Tour notes made here live in a notebook attached to the copied run: drop those too.
  if (made.length) madeProjects.push(...(await sql<{ p: string }[]>`select project_id as p from runs where id = any(${made}::uuid[]) and project_id is not null`).map((r) => r.p));
  if (made.length) await sql`delete from runs where id = any(${made}::uuid[])`;
  if (madeProjects.length) await sql`delete from projects where id = any(${madeProjects}::uuid[])`;
  await closeDb();
});

test("Your work: plan and project ids are long random capability ids", async () => {
  const sql = await db();
  const [{ d }] = await sql<{ d: string }[]>`select column_default as d from information_schema.columns where table_name = 'runs' and column_name = 'id'`;
  assert.match(d, /gen_random_uuid/);
  const [{ p }] = await sql<{ p: string }[]>`select column_default as p from information_schema.columns where table_name = 'projects' and column_name = 'id'`;
  assert.match(p, /gen_random_uuid/);
});

test("Your work: deleting a plan needs its owner key; without it, one plain sentence", async (t) => {
  if (!up || !source) return t.skip("needs the app running and one finished plan");
  const { key, hash } = newKey();
  const id = await copyRun("done", hash);
  for (const headers of [{}, { "X-Owner-Key": newKey().key }]) {
    const res = await fetch(`${BASE}/api/runs/${id}`, { method: "DELETE", headers });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, PLAIN);
  }
  // A plan made before owner keys can't be deleted from the website either.
  const legacy = await copyRun("done", null);
  assert.equal((await fetch(`${BASE}/api/runs/${legacy}`, { method: "DELETE", headers: { "X-Owner-Key": key } })).status, 403);
  const ok = await fetch(`${BASE}/api/runs/${id}`, { method: "DELETE", headers: { "X-Owner-Key": key } });
  assert.equal(ok.status, 200);
  const sql = await db();
  assert.equal((await sql`select 1 from runs where id = ${id}`).length, 0, "gone on the server");
  assert.equal((await fetch(`${BASE}/plan/${id}`)).status, 404);
});

test("Your work: editing a plan or project needs the key; share links stay read-only", async (t) => {
  if (!up || !source) return t.skip("needs the app running and one finished plan");
  const { key, hash } = newKey();
  const id = await copyRun("failed", hash);
  const form = () => new URLSearchParams({ intent: "drop", stop: "0" });
  const refused = await fetch(`${BASE}/plan/${id}`, { method: "POST", body: form(), redirect: "manual" });
  assert.equal(refused.status, 403);
  assert.match(await refused.text(), /Only the browser that made this can change or delete it/);
  assert.equal((await fetch(`${BASE}/plan/${id}`)).status, 200, "the share link still opens");
  const allowed = await fetch(`${BASE}/plan/${id}`, { method: "POST", body: form(), headers: { "X-Owner-Key": key }, redirect: "manual" });
  assert.notEqual(allowed.status, 403);

  // A tour's notes (projects are retired, PLAN Q21): strangers read, only the owner writes.
  const notes = `${BASE}/api/tours/${id}/notes`;
  const note = () => JSON.stringify({ text: "from a stranger", kind: "note" });
  const json = { "content-type": "application/json" };
  const stranger = await fetch(notes, { method: "POST", body: note(), headers: json });
  assert.equal(stranger.status, 403);
  assert.match((await stranger.json()).error, PLAIN);
  const mine = await fetch(notes, { method: "POST", body: JSON.stringify({ text: "Story 30 owner to-do", kind: "todo" }), headers: { ...json, "X-Owner-Key": key } });
  assert.equal(mine.status, 200);
  const { item } = await mine.json();
  assert.equal((await fetch(`${notes}?item=${item.id}`, { method: "DELETE" })).status, 403);
  assert.ok((await (await fetch(notes)).json()).items.some((i: { text: string }) => i.text === "Story 30 owner to-do"), "anyone with the link reads");
  assert.equal((await fetch(`${notes}?item=${item.id}`, { method: "DELETE", headers: { "X-Owner-Key": key } })).status, 200);

  // Projects made by an assistant still delete only with their key.
  const owner = newKey();
  const p = await createProject({ title: "Story 30 project", ownerHash: owner.hash });
  madeProjects.push(p.id);
  assert.equal((await fetch(`${BASE}/api/projects/${p.id}`, { method: "DELETE" })).status, 403);
  assert.equal((await fetch(`${BASE}/api/projects/${p.id}`, { method: "DELETE", headers: { "X-Owner-Key": owner.key } })).status, 200);
});

test("Your work: no page or endpoint lists other visitors' work", async (t) => {
  if (!up) return t.skip("needs the app running");
  const sql = await db();
  const runs = (await sql<{ id: string }[]>`select id from runs order by created_at desc limit 20`).map((r) => r.id);
  const projects = (await sql<{ id: string }[]>`select id from projects order by created_at desc limit 20`).map((r) => r.id);
  for (const path of ["/", "/work", "/projects", "/help", "/explore"]) {
    const html = await (await fetch(`${BASE}${path}`)).text();
    for (const id of [...runs, ...projects]) assert.ok(!html.includes(id), `${path} leaks ${id}`);
  }
  // Status lookups answer only for ids the browser already has.
  const res = await (await fetch(`${BASE}/api/work`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [] }) })).json();
  assert.deepEqual(res, { runs: [], projects: [] });
});

test("Your work: the plan page doesn't list everyone's projects", async (t) => {
  if (!up || !source) return t.skip("needs the app running");
  const p = await createProject({ title: "Story 30 private project", ownerHash: newKey().hash });
  madeProjects.push(p.id);
  const id = await copyRun("done", newKey().hash);
  assert.ok(!(await (await fetch(`${BASE}/plan/${id}`)).text()).includes(p.id));
});

test("Your work: a stopped run resumes in place and reuses what finished", async (t) => {
  if (!up || !source) return t.skip("needs the app running and one finished plan");
  const { key, hash } = newKey();
  // The plan and its show notes were written before the run stopped: resume must not redo them.
  const id = await copyRun("failed", hash, ["prep"]);
  const sql = await db();
  const stops = (source.plan as { stops: { money?: { verdict?: string } }[] }).stops.map((s, i) => ({ s, i })).filter(({ s }) => s.money?.verdict !== "skip");
  for (const { i } of stops) await sql`insert into show_prep (run_id, stop_index, prep, updated_at) values (${id}, ${i}, ${sql.json({ city: "kept", steps: [] } as never)}, '2020-06-01T12:00:00Z')`;
  assert.equal((await fetch(`${BASE}/api/runs/${id}/resume`, { method: "POST" })).status, 403, "needs the key");
  const res = await fetch(`${BASE}/api/runs/${id}/resume`, { method: "POST", headers: { "X-Owner-Key": key } });
  assert.equal(res.status, 200);
  let status = "";
  for (let n = 0; n < 40 && status !== "done"; n++) {
    await new Promise((r) => setTimeout(r, 250));
    [{ status }] = await sql<{ status: string }[]>`select status from runs where id = ${id}`;
  }
  assert.equal(status, "done");
  const [{ same }] = await sql<{ same: boolean }[]>`select plan = ${sql.json(source.plan as never)}::jsonb as same from runs where id = ${id}`;
  assert.ok(same, "plan reused, not rewritten");
  const preps = await sql<{ updated_at: Date }[]>`select updated_at from show_prep where run_id = ${id}`;
  assert.equal(preps.length, stops.length);
  assert.ok(preps.every((p) => p.updated_at.getUTCFullYear() === 2020), "show notes reused, not regenerated");
  const trace = await sql<{ payload: { message: string } }[]>`select payload from trace_events where run_id = ${id} order by seq`;
  assert.ok(trace.some((e) => /^Resuming/.test(e.payload.message)));

  // Per-city venue picks made before a stop are stored and read back for the resumed agent.
  await saveStep(id, "worker", "Chicago", { fit: "kept", evidence: [], excluded: [] });
  assert.equal((await getSteps<{ fit: string }>(id, "worker")).get("Chicago")?.fit, "kept");
});

test("Your work: the owner jots tour notes in the browser; a stranger only reads them", async (t) => {
  if (!up || !source || !chromiumPath) return t.skip("needs the app running, one finished plan and Chromium");
  const owner = newKey();
  const id = await copyRun("done", owner.hash);
  const b = await browser();
  try {
    const page = await b.newPage();
    await page.goto(`${BASE}/help`);
    await page.evaluate(
      ([id, ownerKey]) => localStorage.setItem("tourbo:work", JSON.stringify([{ id, kind: "plan", title: "Story 30 act tour", status: "done", updatedAt: new Date().toISOString(), ownerKey }])),
      [id, owner.key],
    );
    await page.goto(`${BASE}/plan/${id}/prep`, { waitUntil: "networkidle" });
    const box = page.getByTestId("tour-notes");
    await box.getByRole("checkbox", { name: "To-do" }).check();
    await box.getByRole("textbox", { name: "New to-do" }).fill("Story 30 owner to-do");
    await box.getByRole("button", { name: "Add" }).click();
    await box.getByText("Story 30 owner to-do").waitFor({ timeout: 15_000 });

    const other = await b.newContext();
    const view = await other.newPage();
    await view.goto(`${BASE}/plan/${id}/prep`, { waitUntil: "networkidle" });
    const theirs = view.getByTestId("tour-notes");
    await theirs.getByText("Story 30 owner to-do").waitFor({ timeout: 15_000 });
    assert.equal(await theirs.getByRole("button", { name: "Add" }).count(), 0, "read only for strangers");
    await other.close();
  } finally {
    await b.close();
  }
});
