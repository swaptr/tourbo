import { db } from "../db/client.server.ts";
import { ProfileFields, type Profile } from "./profile.ts";

// Act profiles in Postgres (PLAN Q21). The browser keeps the id + owner key; the server keeps the
// key's sha256 only. Reads need the id (a capability link); writes are checked by the caller.

const UUID = /^[0-9a-f-]{36}$/i;
type Row = { id: string; name: string | null; kinds: unknown; listed: boolean; basis: string | null; peers: unknown; styles: unknown; home: unknown; updated_at: Date };

const toProfile = (r: Row): Profile => {
  const parsed = ProfileFields.safeParse({ name: r.name ?? undefined, kinds: r.kinds, listed: r.listed, basis: r.basis ?? undefined, peers: r.peers, styles: r.styles, home: r.home ?? undefined });
  return { ...(parsed.success ? parsed.data : { listed: true, kinds: [], peers: [], styles: [] }), id: r.id, updatedAt: r.updated_at.toISOString() };
};

export async function createProfile(fields: ProfileFields, ownerHash: string): Promise<Profile> {
  const sql = await db();
  const [row] = await sql<Row[]>`
    insert into profiles (owner_hash, name, kinds, listed, basis, peers, styles, home)
    values (${ownerHash}, ${fields.name ?? null}, ${sql.json(fields.kinds)}, ${fields.listed}, ${fields.basis ?? null}, ${sql.json(fields.peers)}, ${sql.json(fields.styles)}, ${fields.home ? sql.json(fields.home) : null})
    returning id, name, kinds, listed, basis, peers, styles, home, updated_at`;
  return toProfile(row);
}

export async function getProfile(id: string): Promise<Profile | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const [row] = await sql<Row[]>`select id, name, kinds, listed, basis, peers, styles, home, updated_at from profiles where id = ${id}`;
  return row && toProfile(row);
}

export async function updateProfile(id: string, fields: ProfileFields): Promise<Profile | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const [row] = await sql<Row[]>`
    update profiles set name = ${fields.name ?? null}, kinds = ${sql.json(fields.kinds)}, listed = ${fields.listed}, basis = ${fields.basis ?? null},
      peers = ${sql.json(fields.peers)}, styles = ${sql.json(fields.styles)}, home = ${fields.home ? sql.json(fields.home) : null}, updated_at = now()
    where id = ${id}
    returning id, name, kinds, listed, basis, peers, styles, home, updated_at`;
  return row && toProfile(row);
}

export async function deleteProfile(id: string) {
  if (!UUID.test(id)) return;
  const sql = await db();
  await sql`delete from profiles where id = ${id}`;
}
