import type postgres from "postgres";

import { db } from "../db/client.server.ts";
import type { Backend, Entry } from "./index.ts";
import { memoryBackend } from "./memory.ts";

// Legacy Qloo rows (`qloo_cache`, ~900 MB, expensive to rebuild) stay where they are: the "qloo"
// namespace reads both tables and takes the newer row; new writes go to `cache` only.
const LEGACY_NS = "qloo";

type Row = { value: unknown; stored_at: Date; expires_at: Date | null; tags: string[] | null };

// Best-effort like the old Qloo cache: an unreachable DB switches this process to an in-memory
// fallback; a query the server rejected (it has a severity) only skips that one entry.
export function postgresBackend(): Backend & { down(): boolean } {
  let down = false;
  const fallback = memoryBackend();

  async function run<T>(op: (sql: postgres.Sql) => Promise<T>, onFallback: () => Promise<T>): Promise<T> {
    if (down) return onFallback();
    try {
      return await op(await db());
    } catch (error) {
      if ((error as { severity?: string }).severity) return undefined as T;
      down = true;
      console.warn(`Cache: Postgres unavailable (${(error as Error).message}); using memory`);
      return onFallback();
    }
  }

  const toEntry = (row: Row | undefined): Entry | undefined =>
    row && { value: row.value, at: row.stored_at.getTime(), expiresAt: row.expires_at?.getTime(), tags: row.tags ?? undefined };

  return {
    name: "postgres",
    down: () => down,
    get: (ns, key) =>
      run(
        async (sql) => {
          const [row] =
            ns === LEGACY_NS
              ? await sql<Row[]>`
                  select value, stored_at, expires_at, tags from cache where namespace = ${ns} and key = ${key}
                  union all
                  select response, fetched_at, null, null from qloo_cache where key = ${key}
                  order by stored_at desc limit 1
                `
              : await sql<Row[]>`select value, stored_at, expires_at, tags from cache where namespace = ${ns} and key = ${key}`;
          return toEntry(row);
        },
        () => fallback.get(ns, key),
      ),
    set: (ns, key, entry) =>
      run(
        async (sql) => {
          const expires = entry.expiresAt === undefined ? null : new Date(entry.expiresAt);
          await sql`
            insert into cache (namespace, key, value, stored_at, expires_at, tags)
            values (${ns}, ${key}, ${sql.json(entry.value as postgres.JSONValue)}, ${new Date(entry.at)}, ${expires}, ${sql.array(entry.tags ?? [])}::text[])
            on conflict (namespace, key) do update
              set value = excluded.value, stored_at = excluded.stored_at, expires_at = excluded.expires_at, tags = excluded.tags
          `;
        },
        () => fallback.set(ns, key, entry),
      ),
    delete: (ns, key) =>
      run(
        async (sql) => {
          await sql`delete from cache where namespace = ${ns} and key = ${key}`;
          if (ns === LEGACY_NS) await sql`delete from qloo_cache where key = ${key}`;
        },
        () => fallback.delete(ns, key),
      ),
    deleteByTag: (tag) =>
      run(
        async (sql) => {
          await sql`delete from cache where tags @> ${sql.array([tag])}::text[]`;
        },
        () => fallback.deleteByTag(tag),
      ),
  };
}
