import { createHash } from "node:crypto";

import type postgres from "postgres";

import { db } from "../db/client.server.ts";
import { getEnv } from "../env.server.ts";

// Private server-side cache (allowed by Qloo); never export this data to the repo.
const TTL_MS = 7 * 24 * 3600 * 1000;
const MEMORY_MAX = 5000;
const memory = new Map<string, { at: number; response: unknown }>();
let usePostgres: boolean | undefined;

export function cacheKey(url: URL) {
  const sorted = new URLSearchParams([...url.searchParams].sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(`${url.pathname}?${sorted}`).digest("hex");
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  if (postgresEnabled()) {
    try {
      const sql = await db();
      const [row] = await sql<{ response: T }[]>`
        select response from qloo_cache
        where key = ${key} and fetched_at > now() - make_interval(secs => ${TTL_MS / 1000})
      `;
      return row?.response;
    } catch (error) {
      fallBack(error);
    }
  }
  const hit = memory.get(key);
  return hit && Date.now() - hit.at < TTL_MS ? (hit.response as T) : undefined;
}

export async function writeCache(key: string, url: URL, response: unknown) {
  if (postgresEnabled()) {
    try {
      const sql = await db();
      await sql`
        insert into qloo_cache (key, url, response)
        values (${key}, ${url.pathname + url.search}, ${sql.json(response as postgres.JSONValue)})
        on conflict (key) do update set response = excluded.response, fetched_at = now()
      `;
      return;
    } catch (error) {
      fallBack(error);
    }
  }
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value!);
  memory.set(key, { at: Date.now(), response });
}

function postgresEnabled() {
  usePostgres ??= getEnv().QLOO_CACHE === "postgres";
  return usePostgres;
}

// Cache is best-effort: an unreachable DB switches this process to the memory cache.
function fallBack(error: unknown) {
  if (!usePostgres) return;
  usePostgres = false;
  console.warn(`Qloo cache: Postgres unavailable (${(error as Error).message}); using memory`);
}
