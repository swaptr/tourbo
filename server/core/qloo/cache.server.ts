import { createHash } from "node:crypto";

import type postgres from "postgres";

import { db } from "../db/client.server.ts";

// Private server-side cache (allowed by Qloo); never export this data to the repo.
const TTL_DAYS = 7;
let warned = false;

export function cacheKey(url: URL) {
  const sorted = new URLSearchParams([...url.searchParams].sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(`${url.pathname}?${sorted}`).digest("hex");
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  try {
    const sql = await db();
    const [row] = await sql<{ response: T }[]>`
      select response from qloo_cache
      where key = ${key} and fetched_at > now() - make_interval(days => ${TTL_DAYS})
    `;
    return row?.response;
  } catch (error) {
    warnOnce(error);
    return undefined;
  }
}

export async function writeCache(key: string, url: URL, response: unknown) {
  try {
    const sql = await db();
    await sql`
      insert into qloo_cache (key, url, response)
      values (${key}, ${url.pathname + url.search}, ${sql.json(response as postgres.JSONValue)})
      on conflict (key) do update set response = excluded.response, fetched_at = now()
    `;
  } catch (error) {
    warnOnce(error);
  }
}

// Cache is best-effort: Qloo calls still work when the DB is down.
function warnOnce(error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`Qloo cache disabled: ${(error as Error).message}`);
}
