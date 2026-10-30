import { db } from "../db/client.server.ts";

// A project is one tour or show: a thin notebook (notes, to-dos, setlist or bit drafts, saved
// city briefs) that plan runs attach to. Deliberately tour-specific; general notes belong in
// the act's own tools (Notion, Asana), so `projectMarkdown` keeps exports copy-pasteable.

import { ItemKind, type Project, type ProjectDetail, type ProjectItem } from "./types.ts";

export { ItemKind };
export type { Project, ProjectDetail, ProjectItem, ProjectRun } from "./types.ts";

const UUID = /^[0-9a-f-]{36}$/i;

type ProjectRow = { id: string; title: string; artist: string | null; kind: string | null; created_at: Date };
const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  title: r.title,
  artist: r.artist ?? undefined,
  kind: r.kind ?? undefined,
  createdAt: r.created_at.toISOString(),
});

// ownerHash: sha256 of the creator's owner key (website); MCP-made projects have none.
export async function createProject(input: { title: string; artist?: string; kind?: string; ownerHash?: string }): Promise<Project> {
  const sql = await db();
  const [row] = await sql<ProjectRow[]>`
    insert into projects (title, artist, kind, owner_hash) values (${input.title.trim()}, ${input.artist?.trim() || null}, ${input.kind ?? null}, ${input.ownerHash ?? null})
    returning id, title, artist, kind, created_at`;
  return toProject(row);
}

// Story-test fixtures ("Story test spring tour", "… Fakeband") stay in the database but never show
// in lists or on a plan's header; a direct /projects/:id link still opens them.
export const TEST_TITLE = "^story test\\M|fakeband";

export async function listProjects(limit = 30): Promise<(Project & { items: number; runs: number })[]> {
  const sql = await db();
  const rows = await sql<(ProjectRow & { items: number; runs: number })[]>`
    select p.id, p.title, p.artist, p.kind, p.created_at,
      (select count(*)::int from project_items i where i.project_id = p.id) as items,
      (select count(*)::int from runs r where r.project_id = p.id) as runs
    from projects p where p.title !~* ${TEST_TITLE} order by p.created_at desc limit ${limit}`;
  return rows.map((r) => ({ ...toProject(r), items: r.items, runs: r.runs }));
}

export async function getProject(id: string): Promise<ProjectDetail | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const [row] = await sql<ProjectRow[]>`select id, title, artist, kind, created_at from projects where id = ${id}`;
  if (!row) return undefined;
  const [items, runs] = await Promise.all([
    sql<{ id: string; kind: ItemKind; city: string | null; text: string; done: boolean; created_at: Date }[]>`
      select id, kind, city, text, done, created_at from project_items where project_id = ${id} order by created_at`,
    sql<{ id: string; artist_name: string; status: string; created_at: Date; cities: string[] | null }[]>`
      select id, artist_name, status, created_at,
        (select array_agg(s->'city'->>'name') from jsonb_array_elements(plan->'stops') s) as cities
      from runs where project_id = ${id} order by created_at desc`,
  ]);
  return {
    ...toProject(row),
    items: items.map((i) => ({ id: i.id, kind: i.kind, city: i.city ?? undefined, text: i.text, done: i.done, createdAt: i.created_at.toISOString() })),
    runs: runs.map((r) => ({ id: r.id, artistName: r.artist_name, status: r.status, createdAt: r.created_at.toISOString(), stops: r.cities?.length ?? 0, cities: r.cities ?? [] })),
  };
}

export async function addItem(projectId: string, item: { kind: ItemKind; text: string; city?: string }): Promise<ProjectItem> {
  if (!UUID.test(projectId)) throw new Error("No such project");
  const sql = await db();
  const [row] = await sql<{ id: string; created_at: Date }[]>`
    insert into project_items (project_id, kind, city, text)
    select ${projectId}, ${item.kind}, ${item.city?.trim() || null}, ${item.text.trim()}
    where exists (select 1 from projects where id = ${projectId})
    returning id, created_at`;
  if (!row) throw new Error("No such project");
  return { id: row.id, kind: item.kind, city: item.city?.trim() || undefined, text: item.text.trim(), done: false, createdAt: row.created_at.toISOString() };
}

export async function setItemDone(projectId: string, itemId: string, done: boolean) {
  if (!UUID.test(projectId) || !UUID.test(itemId)) return;
  const sql = await db();
  await sql`update project_items set done = ${done} where id = ${itemId} and project_id = ${projectId}`;
}

export async function deleteItem(projectId: string, itemId: string) {
  if (!UUID.test(projectId) || !UUID.test(itemId)) return;
  const sql = await db();
  await sql`delete from project_items where id = ${itemId} and project_id = ${projectId}`;
}

export async function attachRun(projectId: string, runId: string) {
  if (!UUID.test(projectId) || !UUID.test(runId)) throw new Error("No such project or plan");
  const sql = await db();
  const res = await sql`update runs set project_id = ${projectId} where id = ${runId} and exists (select 1 from projects where id = ${projectId})`;
  if (!res.count) throw new Error("No such project or plan");
}

const HEADINGS: Record<ItemKind, string> = { todo: "To-dos", setlist: "Setlist and material drafts", brief: "City briefs", note: "Notes" };

// Clean markdown for a user's own Claude to read or paste into Notion / Asana.
export function projectMarkdown(p: ProjectDetail, baseUrl = "") {
  const lines = [`# ${p.title}`];
  if (p.artist) lines.push(`Act: ${p.artist}${p.kind ? ` (${p.kind.replace("_", " ")})` : ""}`);
  if (p.runs.length) {
    lines.push("", "## Tour plans");
    for (const r of p.runs) lines.push(`- ${r.createdAt.slice(0, 10)}: ${r.cities.join(" → ") || r.status} (${baseUrl}/plan/${r.id})`);
  }
  for (const kind of ItemKind.options) {
    const items = p.items.filter((i) => i.kind === kind);
    if (!items.length) continue;
    lines.push("", `## ${HEADINGS[kind]}`);
    for (const i of items) {
      const city = i.city ? `**${i.city}:** ` : "";
      lines.push(kind === "todo" ? `- [${i.done ? "x" : " "}] ${city}${i.text}` : `- ${city}${i.text.replace(/\n/g, "\n  ")}`);
    }
  }
  return lines.join("\n");
}

export async function projectOfRun(runId: string): Promise<Project | undefined> {
  if (!UUID.test(runId)) return undefined;
  const sql = await db();
  const [row] = await sql<ProjectRow[]>`
    select p.id, p.title, p.artist, p.kind, p.created_at from runs r join projects p on p.id = r.project_id where r.id = ${runId} and p.title !~* ${TEST_TITLE}`;
  return row && toProject(row);
}
