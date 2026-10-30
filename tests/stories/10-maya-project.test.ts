// Story 10: Maya keeps notes and to-dos on her tour. Her own Claude (MCP) keeps the tour's
// notebook (tourbo_project_*): saves a to-do and a setlist idea and reads it back as markdown she
// can paste into Notion. Projects are retired on the website (PLAN Q21): the notes live on the
// tour (/api/tours/:id/notes), and an old /projects link lands on the tour.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db, closeDb } from "@tourbo/core/db/client.server.ts";
import { appUp, BASE, mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(async () => {
  await m.close();
  await closeDb();
});

let id: string;

test("Maya: her Claude creates a project and saves notes to it", async () => {
  const p = await m.call("tourbo_project_create", { title: "Story test spring tour", artist: "Maya", kind: "musician" });
  id = p.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  await m.call("tourbo_project_add", { project_id: id, kind: "todo", text: "Send tech rider", city: "Chicago" });
  await m.call("tourbo_project_add", { project_id: id, kind: "setlist", text: "Open with the slow one; cover a local act" });
});

test("Maya: reading it back gives clean markdown with a checkbox to-do", async () => {
  const r = await m.call("tourbo_project_get", { project_id: id });
  assert.equal(r.found, true);
  assert.equal(r.project.items.length, 2);
  assert.match(r.markdown, /^# Story test spring tour/);
  assert.match(r.markdown, /- \[ \] \*\*Chicago:\*\* Send tech rider/);
});

test("Maya: a to-do ticks done, and deleting one item leaves the rest", async () => {
  const before = (await m.call("tourbo_project_get", { project_id: id })).project.items;
  const todo = before.find((i: { kind: string }) => i.kind === "todo");
  await m.call("tourbo_project_update", { project_id: id, item_id: todo.id, action: "mark_done" });
  const extra = (await m.call("tourbo_project_add", { project_id: id, kind: "note", text: "Throwaway" })).item;
  await m.call("tourbo_project_update", { project_id: id, item_id: extra.id, action: "delete" });
  const r = await m.call("tourbo_project_get", { project_id: id });
  assert.equal(r.project.items.length, 2);
  assert.equal(r.project.items.find((i: { id: string }) => i.id === todo.id).done, true);
  assert.match(r.markdown, /- \[x\] \*\*Chicago:\*\* Send tech rider/);
});

let attachedRun: { id: string; project_id: string | null } | undefined;
test("Maya: a tour plan attaches and shows its cities and show-notes link", async () => {
  const sql = await db();
  [attachedRun] = await sql<{ id: string; project_id: string | null }[]>`select id, project_id from runs where plan is not null order by created_at desc limit 1`;
  if (!attachedRun) return; // fresh database: no plan to attach yet (story 8 makes one)
  await m.call("tourbo_project_add", { project_id: id, run_id: attachedRun.id });
  const r = await m.call("tourbo_project_get", { project_id: id });
  const attached = r.project.runs.find((x: { id: string }) => x.id === attachedRun!.id);
  assert.ok(attached, "run attached");
  assert.ok(attached.cities.length >= 1);
  assert.ok(r.markdown.includes(`/plan/${attachedRun.id}`));
});

test("Maya: an old project link lands on her tour", { skip: !(await appUp()) && "app not running" }, async () => {
  const res = await fetch(`${BASE}/projects/${id}`, { redirect: "manual" });
  assert.equal(res.status, 301);
  const to = new URL(res.headers.get("location") ?? "", BASE).pathname;
  assert.equal(to, attachedRun ? `/plan/${attachedRun.id}` : "/work");
});

test("Maya: the tour's notes read back on the website, test notebooks stay hidden", { skip: !(await appUp()) && "app not running" }, async () => {
  if (!attachedRun) return;
  const res = await fetch(`${BASE}/api/tours/${attachedRun.id}/notes`);
  assert.equal(res.status, 200);
  const { items } = (await res.json()) as { items: { text: string }[] };
  assert.ok(Array.isArray(items));
  assert.ok(!items.some((i) => /Send tech rider/.test(i.text)), "a story-test notebook never shows on a real tour");
});

test("Maya: the real tour gets its own notebook back", async () => {
  if (!attachedRun) return;
  const sql = await db();
  await sql`update runs set project_id = ${attachedRun.project_id} where id = ${attachedRun.id}`;
});

test("Maya: a bad project id gets a plain hint, not a crash", async () => {
  const r = await m.call("tourbo_project_get", { project_id: "nope" });
  assert.equal(r.found, false);
  await assert.rejects(m.call("tourbo_project_add", { project_id: "00000000-0000-0000-0000-000000000000", kind: "note", text: "x" }), /No project, plan or item with that id/);
});
