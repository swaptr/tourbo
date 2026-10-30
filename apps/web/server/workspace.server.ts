import { db } from "@tourbo/core/db/client.server.ts";
import { listEvents, syncTourNights } from "@tourbo/core/events/events.server.ts";
import type { TourEvent } from "@tourbo/core/events/event.ts";
import type { Plan, TourParams } from "@tourbo/core/shared/types.ts";

import type { WorkRow } from "../app/lib/workspace";
import { TEST_TITLE } from "@tourbo/core/projects/projects.server.ts";
import { isActive } from "./agent/runs.server.ts";
import { checkOwner, UUID } from "./owner.server.ts";

// The workspace list (PLAN Q21): one row per tour, event or project this browser knows (ids from
// its "tourbo:work" index) plus the runs filed under its profile when it holds the profile's key.
// Never lists anything else (no enumeration). Status / archive rules live in app/lib/workspace.ts.

type RunRow = { id: string; artist_name: string; params: TourParams; status: string; plan: Plan | null; archived: boolean | null; created_at: Date; project_id: string | null; owner_hash: string | null };

export function runRow(r: RunRow): WorkRow {
  const stops = (r.plan?.stops ?? []).filter((s) => s.money?.verdict !== "skip");
  const dates = stops.map((s) => s.date).filter((d): d is string => !!d).sort();
  const status = (r.status === "running" || r.status === "pending") && !isActive(r.id) ? "interrupted" : r.status;
  return {
    type: "tour",
    id: r.id,
    title: r.plan?.artist.name ?? r.artist_name,
    kind: r.params.kind,
    region: r.params.region,
    homeBase: r.params.homeBase,
    status,
    firstDate: dates[0] ?? r.params.startDate,
    lastDate: dates.at(-1) ?? r.params.startDate,
    nights: r.plan ? stops.length : r.params.shows,
    profit: r.plan?.money?.profit,
    currency: r.plan?.money?.currency ?? stops.find((s) => s.money)?.money?.currency,
    cities: stops.map((s) => s.city.name),
    fans: r.plan ? stops.map((s) => Math.round(s.score)) : undefined,
    tonight: (() => {
      const t = stops.find((s) => s.date === new Date().toISOString().slice(0, 10));
      return t ? { city: t.city.name, venue: t.venue?.name } : undefined;
    })(),
    archived: r.archived,
    createdAt: r.created_at.toISOString(),
    projectId: r.project_id ?? undefined,
    owned: r.owner_hash !== null,
  };
}

export function eventRow(e: TourEvent): WorkRow {
  return {
    type: "event",
    id: e.id,
    title: e.title,
    kind: e.kind,
    status: "saved",
    firstDate: e.startDate,
    lastDate: e.endDate ?? e.startDate,
    nights: 1,
    profit: e.venue?.profit,
    currency: e.venue?.currency,
    cities: [e.city.name],
    homeBase: e.city.name,
    venue: e.venue?.name,
    tourId: e.tourId,
    runId: e.runId,
    archived: e.archived,
    createdAt: e.createdAt,
    owned: true,
  };
}

export async function workspaceRows(input: { runs: string[]; projects: string[]; events: string[]; profile?: { id: string; key?: string | null } }): Promise<WorkRow[]> {
  const sql = await db();
  const runIds = [...new Set(input.runs.filter((id) => UUID.test(id)))].slice(0, 300);
  const projectIds = [...new Set(input.projects.filter((id) => UUID.test(id)))].slice(0, 200);
  const profileId = input.profile && UUID.test(input.profile.id) && (await checkOwner("profile", input.profile.id, input.profile.key, true)) === "ok" ? input.profile.id : null;
  const [runs, projects] = await Promise.all([
    runIds.length || profileId
      ? sql<RunRow[]>`
          select id, artist_name, params, status, plan, archived, created_at, project_id, owner_hash from runs
          where id = any(${runIds}::uuid[]) or (${profileId}::uuid is not null and profile_id = ${profileId}::uuid)
          order by created_at desc limit 300`
      : [],
    projectIds.length
      ? sql<{ id: string; title: string; artist: string | null; kind: string | null; archived: boolean | null; created_at: Date; items: number; first: string | null; last: string | null }[]>`
          select p.id, p.title, p.artist, p.kind, p.archived, p.created_at,
            (select count(*)::int from project_items i where i.project_id = p.id) as items,
            (select min(s->>'date') from runs r, jsonb_array_elements(r.plan->'stops') s where r.project_id = p.id) as first,
            (select max(s->>'date') from runs r, jsonb_array_elements(r.plan->'stops') s where r.project_id = p.id) as last
          from projects p where p.id = any(${projectIds}::uuid[])`
      : [],
  ]);
  // Tour nights are events too: keep them in step with each finished tour, then list them.
  const done = runs.filter((r) => r.status === "done" && r.params.mode !== "event").map((r) => r.id);
  for (const id of done) await syncTourNights(id).catch(() => {});
  const events = await listEvents(input.events, profileId, done);
  const titles = new Map(runs.map((r) => [r.id, r.plan?.artist.name ?? r.artist_name]));
  // An event's helper plan (suggested rooms) lives inside the event, not as its own row.
  const helpers = new Set(events.map((e) => e.runId).filter(Boolean));
  // A tour night's fan strength: its stop's score in the tour's plan.
  const plans = new Map(runs.map((r) => [r.id, r.plan]));
  const nightFans = (e: TourEvent) => {
    const stop = e.tourId ? plans.get(e.tourId)?.stops.find((s) => s.city.name === e.city.name && (!e.startDate || s.date === e.startDate)) : undefined;
    return stop ? [Math.round(stop.score)] : undefined;
  };
  // Story-test fixtures stay in the DB but never show (same rule as projects.server.ts).
  const test = new RegExp(TEST_TITLE.replace("\\M", "\\b"), "i");
  return [
    ...runs.filter((r) => !helpers.has(r.id) && r.params.mode !== "event").map(runRow),
    ...events.map((e) => ({ ...eventRow(e), tourTitle: e.tourId ? titles.get(e.tourId) : undefined, fans: nightFans(e) })),
    ...projects.map(
      (p): WorkRow => ({
        type: "project",
        id: p.id,
        title: p.title,
        kind: (p.kind ?? undefined) as WorkRow["kind"],
        status: "saved",
        firstDate: p.first ?? undefined,
        lastDate: p.last ?? undefined,
        nights: 0,
        cities: [],
        notes: p.items,
        archived: p.archived,
        createdAt: p.created_at.toISOString(),
        owned: true,
      }),
    ),
  ].filter((r) => !test.test(r.title));
}

export async function setArchived(kind: "run" | "project" | "event", id: string, archived: boolean | null) {
  const sql = await db();
  if (kind === "run") await sql`update runs set archived = ${archived} where id = ${id}`;
  else if (kind === "project") await sql`update projects set archived = ${archived} where id = ${id}`;
  else await sql`update events set archived = ${archived} where id = ${id}`;
}
