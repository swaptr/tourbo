import { db } from "../db/client.server.ts";
import { stopKey } from "../engine/edit.ts";
import type { Plan, TourParams } from "../shared/types.ts";
import { EventFields, type TourEvent } from "./event.ts";

// One-off events in Postgres (PLAN Q21). Ids are capability links; writes are owner-checked by
// the caller (apps/web/server/owner.server.ts). No fan-data calls here.

const UUID = /^[0-9a-f-]{36}$/i;
type Row = {
  id: string;
  title: string;
  artist: string;
  kind: string;
  city: unknown;
  start_date: string | null;
  end_date: string | null;
  venue: unknown;
  classes: unknown;
  run_id: string | null;
  tour_id: string | null;
  stop_key: string | null;
  archived: boolean | null;
  owner_hash: string;
  created_at: Date;
  updated_at: Date;
};
const COLS = "id, title, artist, kind, city, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, venue, classes, run_id, tour_id, stop_key, archived, owner_hash, created_at, updated_at";

const classesJson = (f: EventFields) => (f.classes && (f.classes.sessions || f.classes.seats) ? JSON.stringify(f.classes) : null);

const toEvent = (r: Row): TourEvent => {
  const f = EventFields.parse({ title: r.title, artist: r.artist, kind: r.kind, city: r.city, startDate: r.start_date ?? undefined, endDate: r.end_date ?? undefined, venue: r.venue ?? undefined, classes: r.classes ?? undefined });
  return { ...f, id: r.id, runId: r.run_id ?? undefined, tourId: r.tour_id ?? undefined, stopKey: r.stop_key ?? undefined, archived: r.archived, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() };
};

export async function createEvent(fields: EventFields, owner: { ownerHash: string; profileId?: string }): Promise<TourEvent> {
  const sql = await db();
  const [row] = await sql.unsafe<Row[]>(
    `insert into events (owner_hash, profile_id, title, artist, kind, city, start_date, end_date, venue, classes)
     select $1, (select id from profiles where id = $2::uuid), $3, $4, $5, $6::text::jsonb, $7::date, $8::date, $9::text::jsonb, $10::text::jsonb
     returning ${COLS}`,
    [owner.ownerHash, owner.profileId ?? null, fields.title, fields.artist, fields.kind, JSON.stringify(fields.city), fields.startDate ?? null, fields.endDate ?? null, fields.venue ? JSON.stringify(fields.venue) : null, classesJson(fields)],
  );
  return toEvent(row);
}

export async function getEvent(id: string): Promise<(TourEvent & { owned: boolean }) | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const [row] = await sql.unsafe<Row[]>(`select ${COLS} from events where id = $1`, [id]);
  return row && { ...toEvent(row), owned: !!row.owner_hash };
}

export async function updateEvent(id: string, fields: EventFields): Promise<TourEvent | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const [row] = await sql.unsafe<Row[]>(
    `update events set title = $2, artist = $3, kind = $4, city = $5::text::jsonb, start_date = $6::date, end_date = $7::date, venue = $8::text::jsonb, classes = $9::text::jsonb, updated_at = now()
     where id = $1 returning ${COLS}`,
    [id, fields.title, fields.artist, fields.kind, JSON.stringify(fields.city), fields.startDate ?? null, fields.endDate ?? null, fields.venue ? JSON.stringify(fields.venue) : null, classesJson(fields)],
  );
  return row && toEvent(row);
}

export async function linkEventRun(id: string, runId: string) {
  if (!UUID.test(id) || !UUID.test(runId)) return;
  const sql = await db();
  await sql`update events set run_id = ${runId}, updated_at = now() where id = ${id}`;
}

// Events this browser knows: by id, filed under its profile, or nights of tours it knows.
export async function listEvents(ids: string[], profileId: string | null, tourIds: string[] = []): Promise<TourEvent[]> {
  const ok = ids.filter((i) => UUID.test(i)).slice(0, 300);
  const tours = tourIds.filter((i) => UUID.test(i)).slice(0, 300);
  if (!ok.length && !profileId && !tours.length) return [];
  const sql = await db();
  const rows = await sql.unsafe<Row[]>(
    `select ${COLS} from events where id = any($1::uuid[]) or ($2::uuid is not null and profile_id = $2::uuid) or tour_id = any($3::uuid[]) order by start_date nulls last, created_at desc limit 600`,
    [ok, profileId, tours],
  );
  return rows.map(toEvent);
}

// A tour's nights as events (Q21): one row per played night, keyed by the night's stable key, so
// an event's set and notes survive edits to other nights. Nights dropped from the plan go.
// Idempotent; called for finished tours when the workspace or an event page loads them.
export async function syncTourNights(runId: string): Promise<void> {
  if (!UUID.test(runId)) return;
  const sql = await db();
  const [run] = await sql<{ params: TourParams; plan: Plan | null; owner_hash: string | null; profile_id: string | null; artist_name: string }[]>`
    select params, plan, owner_hash, profile_id, artist_name from runs where id = ${runId} and status = 'done'`;
  if (!run?.plan) return;
  const nights = run.plan.stops.filter((s) => s.money?.verdict !== "skip");
  const keys = nights.map(stopKey);
  const artist = run.plan.artist.name ?? run.artist_name;
  for (const s of nights) {
    const venue = s.venue ? { name: s.venue.name, address: s.venue.address, source: "tourbo", venueId: s.venue.id, profit: s.money?.profit, currency: s.money?.currency } : undefined;
    await sql.unsafe(
      `insert into events (owner_hash, profile_id, title, artist, kind, city, start_date, end_date, venue, tour_id, stop_key)
       values ($1, $2::uuid, $3, $4, $5, $6::text::jsonb, $7::date, $7::date, $8::text::jsonb, $9::uuid, $10)
       on conflict (tour_id, stop_key) do update set title = excluded.title, kind = excluded.kind, city = excluded.city,
         start_date = excluded.start_date, end_date = excluded.end_date, venue = excluded.venue, updated_at = now()
       where (events.start_date, events.venue, events.kind) is distinct from (excluded.start_date, excluded.venue, excluded.kind)`,
      [run.owner_hash ?? "", run.profile_id, `${artist} in ${s.city.name}`, artist, run.params.kind, JSON.stringify({ name: s.city.name, lat: s.city.lat, lon: s.city.lon }), s.date ?? null, venue ? JSON.stringify(venue) : null, runId, stopKey(s)],
    );
  }
  await sql.unsafe(`delete from events where tour_id = $1::uuid and not (stop_key = any($2::text[]))`, [runId, keys]);
}
