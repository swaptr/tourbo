import { db } from "../db/client.server.ts";
import { syncTourNights } from "../events/events.server.ts";
import { findKept, materialKey, MaterialFields, migrateSavedSet, normalizeSet, sameCity, type Material, type SavedSetLike, type Source } from "./material.ts";

// Material + event sets in Postgres (PLAN Q21). Material belongs to an act profile and carries
// the profile's owner hash; writes are owner-checked by the caller (against the profile for
// material, against the event for its set). No fan-data calls here.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = {
  id: string;
  profile_id: string;
  kind: string | null;
  title: string;
  type: string;
  length_min: number | null;
  notes: string | null;
  tags: string[];
  origin: string;
  source: unknown;
  details: unknown;
  created_at: Date;
  updated_at: Date;
};
const COLS = "id, profile_id, kind, title, type, length_min, notes, tags, origin, source, details, created_at, updated_at";

// jsonb written as a JSON string (a `$n::jsonb` param given a string is encoded twice): read either.
const unwrap = (v: unknown) => {
  if (typeof v !== "string") return v ?? undefined;
  try {
    return JSON.parse(v) ?? undefined;
  } catch {
    return undefined;
  }
};

const toMaterial = (r: Row): Material => {
  const parsed = MaterialFields.safeParse({
    title: r.title,
    type: r.type,
    kind: r.kind ?? undefined,
    lengthMin: r.length_min ?? undefined,
    notes: r.notes ?? undefined,
    tags: r.tags ?? [],
    origin: r.origin,
    source: unwrap(r.source),
    details: unwrap(r.details),
  });
  const f: MaterialFields = parsed.success ? parsed.data : { title: r.title || "Untitled", type: "other", tags: [], origin: "original" };
  return { ...f, id: r.id, profileId: r.profile_id, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() };
};
const params = (f: MaterialFields) => [f.kind ?? null, f.title, f.type, f.lengthMin ?? null, f.notes || null, f.tags, f.origin, f.source ? JSON.stringify(f.source) : null, f.details && Object.keys(f.details).length ? JSON.stringify(f.details) : null];

export async function listMaterial(profileId: string): Promise<Material[]> {
  if (!UUID.test(profileId)) return [];
  const sql = await db();
  // `uses`: how many shows' sets it's in (the library shows "in 3 sets").
  const rows = await sql.unsafe<(Row & { uses: number })[]>(
    `select ${COLS}, (select count(distinct event_id)::int from event_set s where s.material_id = material.id) as uses from material where profile_id = $1 order by created_at limit 2000`,
    [profileId],
  );
  return rows.map((r) => ({ ...toMaterial(r), uses: r.uses }));
}

export async function getMaterial(id: string): Promise<Material | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const [row] = await sql.unsafe<Row[]>(`select ${COLS} from material where id = $1`, [id]);
  return row && toMaterial(row);
}

// The owner hash is copied from the profile, so the profile's key opens its material.
export async function createMaterial(profileId: string, f: MaterialFields): Promise<Material | undefined> {
  if (!UUID.test(profileId)) return undefined;
  const sql = await db();
  const [row] = await sql.unsafe<Row[]>(
    `insert into material (profile_id, owner_hash, kind, title, type, length_min, notes, tags, origin, source, details)
     select id, owner_hash, $2, $3, $4, $5, $6, $7::text[], $8, $9::text::jsonb, $10::text::jsonb from profiles where id = $1
     returning ${COLS}`,
    [profileId, ...params(f)] as never[],
  );
  return row && toMaterial(row);
}

export async function updateMaterial(id: string, f: MaterialFields): Promise<Material | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const [row] = await sql.unsafe<Row[]>(
    `update material set kind = $2, title = $3, type = $4, length_min = $5, notes = $6, tags = $7::text[], origin = $8, source = $9::text::jsonb, details = $10::text::jsonb, updated_at = now()
     where id = $1 returning ${COLS}`,
    [id, ...params(f)] as never[],
  );
  return row && toMaterial(row);
}

// Also takes it out of every event's set (cascade), closing the gaps in their order.
export async function deleteMaterial(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const sql = await db();
  await sql.begin(async (tx) => {
    const events = await tx<{ event_id: string }[]>`select distinct event_id from event_set where material_id = ${id}`;
    await tx`delete from material where id = ${id}`;
    for (const { event_id } of events) {
      const ids = await tx<{ material_id: string }[]>`select material_id from event_set where event_id = ${event_id} order by position`;
      await tx`delete from event_set where event_id = ${event_id}`;
      for (const [i, r] of ids.entries()) await tx`insert into event_set (event_id, position, material_id) values (${event_id}, ${i}, ${r.material_id})`;
    }
  });
}

// "Keep" on a Tourbo idea: one library item per idea + city, however often it's kept.
export async function keepIdea(profileId: string, f: MaterialFields & { source: Source }): Promise<{ material: Material; existed: boolean } | undefined> {
  const found = findKept(await listMaterial(profileId), f.source);
  if (found) return { material: found, existed: true };
  const material = await createMaterial(profileId, f);
  return material && { material, existed: false };
}

export const profileOfMaterial = async (id: string) => (await getMaterial(id))?.profileId;

// ---------- Event sets ----------

export async function getEventSet(eventId: string): Promise<Material[]> {
  if (!UUID.test(eventId)) return [];
  const sql = await db();
  const rows = await sql.unsafe<Row[]>(
    `select ${COLS.split(", ").map((c) => `m.${c}`).join(", ")} from event_set s join material m on m.id = s.material_id where s.event_id = $1 order by s.position`,
    [eventId],
  );
  return rows.map(toMaterial);
}

// Replace the set with these material ids, in order. Unknown ids are dropped.
export async function saveEventSet(eventId: string, ids: string[]): Promise<Material[]> {
  if (!UUID.test(eventId)) return [];
  const clean = normalizeSet(ids).filter((i) => UUID.test(i));
  const sql = await db();
  await sql.begin(async (tx) => {
    const known = new Set((clean.length ? await tx<{ id: string }[]>`select id from material where id = any(${clean}::uuid[])` : []).map((r) => r.id));
    const keep = clean.filter((i) => known.has(i));
    await tx`delete from event_set where event_id = ${eventId}`;
    if (keep.length) await tx`insert into event_set ${tx(keep.map((material_id, position) => ({ event_id: eventId, position, material_id })))}`;
  });
  return getEventSet(eventId);
}

export async function eventHasSet(eventId: string): Promise<boolean> {
  const sql = await db();
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from event_set where event_id = ${eventId}`;
  return (row?.n ?? 0) > 0;
}

// ---------- Migration: a tour's saved built set → material + its nights' sets ----------

// Idempotent: material is matched by (origin, title, city) before creating; a night that already
// has a set keeps it. A tour without a profile gets one with the tour's owner hash (same key).
export async function migrateRunSet(runId: string): Promise<{ created: number; nights: number } | undefined> {
  if (!UUID.test(runId)) return undefined;
  const sql = await db();
  const [run] = await sql<{ owner_hash: string | null; profile_id: string | null; artist_name: string; kind: string | null; saved: SavedSetLike }[]>`
    select r.owner_hash, r.profile_id, r.artist_name, r.params->>'kind' as kind, s.output as saved
    from runs r join run_steps s on s.run_id = r.id and s.step = 'set_last' and s.key = 'last'
    where r.id = ${runId} and r.status = 'done'`;
  if (!run?.saved) return undefined;
  await syncTourNights(runId);
  let profileId = run.profile_id;
  if (!profileId) {
    const [p] = await sql<{ id: string }[]>`
      insert into profiles (owner_hash, name, kinds) values (${run.owner_hash ?? ""}, ${run.artist_name}, ${sql.json(run.kind ? [run.kind] : [])}) returning id`;
    profileId = p.id;
    await sql`update runs set profile_id = ${profileId} where id = ${runId}`;
  }
  const m = migrateSavedSet(run.saved, run.kind ?? undefined);
  const byKey = new Map((await listMaterial(profileId)).map((x) => [materialKey(x), x.id]));
  let created = 0;
  for (const item of m.items) {
    if (byKey.has(item.key)) continue;
    const { key, ...fields } = item;
    const made = await createMaterial(profileId, fields);
    if (made) {
      byKey.set(key, made.id);
      created++;
    }
  }
  const events = await sql<{ id: string; city: { name: string } }[]>`select id, city from events where tour_id = ${runId}`;
  let nights = 0;
  for (const e of events) {
    const c = m.cities.find((x) => sameCity(x.city, e.city.name));
    if (!c || (await eventHasSet(e.id))) continue;
    await saveEventSet(e.id, c.keys.flatMap((k) => byKey.get(k) ?? []));
    nights++;
  }
  return { created, nights };
}

export async function runsWithSavedSets(): Promise<string[]> {
  const sql = await db();
  return (await sql<{ run_id: string }[]>`select distinct s.run_id from run_steps s join runs r on r.id = s.run_id where s.step = 'set_last' and r.status = 'done'`).map((r) => r.run_id);
}
