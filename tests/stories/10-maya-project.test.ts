// Story 10: Maya keeps her tour in one place. Her own Claude (MCP) makes a project, saves a
// to-do and a setlist idea, and reads it back as markdown she can paste into Notion. The
// website shows the same project.
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
  await m.call("tourbo_project_update", { project_id: id, item_id: todo.id, done: true });
  const extra = (await m.call("tourbo_project_add", { project_id: id, kind: "note", text: "Throwaway" })).item;
  await m.call("tourbo_project_update", { project_id: id, item_id: extra.id, delete: true });
  const r = await m.call("tourbo_project_get", { project_id: id });
  assert.equal(r.project.items.length, 2);
  assert.equal(r.project.items.find((i: { id: string }) => i.id === todo.id).done, true);
  assert.match(r.markdown, /- \[x\] \*\*Chicago:\*\* Send tech rider/);
});

test("Maya: a tour plan attaches and shows its cities and show-notes link", async () => {
  const sql = await db();
  const [run] = await sql<{ id: string }[]>`select id from runs where plan is not null order by created_at desc limit 1`;
  if (!run) return; // fresh database: no plan to attach yet (story 8 makes one)
  await m.call("tourbo_project_add", { project_id: id, run_id: run.id });
  const r = await m.call("tourbo_project_get", { project_id: id });
  const attached = r.project.runs.find((x: { id: string }) => x.id === run.id);
  assert.ok(attached, "run attached");
  assert.ok(attached.cities.length >= 1);
  assert.ok(r.markdown.includes(`/plan/${run.id}`));
});

test("Maya: a bad project id gets a plain hint, not a crash", async () => {
  const r = await m.call("tourbo_project_get", { project_id: "nope" });
  assert.equal(r.found, false);
  await assert.rejects(m.call("tourbo_project_add", { project_id: "00000000-0000-0000-0000-000000000000", kind: "note", text: "x" }), /No such project/);
});

test("Maya: the website shows the same project", { skip: !(await appUp()) && "app not running" }, async () => {
  const html = await fetch(`${BASE}/projects/${id}`).then((r) => r.text());
  assert.match(html, /Story test spring tour/);
  assert.match(html, /Send tech rider/);
});
