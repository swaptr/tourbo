import { createHash } from "node:crypto";

import { backend, DAY, tierNames } from "../cache/index.ts";

// Qloo responses on the shared cache layer (namespace "qloo"; legacy `qloo_cache` rows are read
// through by the postgres tier). Private server-side cache (allowed by Qloo); never export this
// data to the repo.
export const QLOO_NS = "qloo";
export const QLOO_TTL = 7 * DAY;

export function cacheKey(url: URL) {
  const sorted = new URLSearchParams([...url.searchParams].sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(`${url.pathname}?${sorted}`).digest("hex");
}

// Peek without fetching or counting (prewarm dry runs).
export async function readCache<T>(key: string): Promise<T | undefined> {
  const now = Date.now();
  for (const name of tierNames()) {
    const entry = await backend(name).get(QLOO_NS, key).catch(() => undefined);
    if (entry && entry.value != null && now - entry.at < QLOO_TTL) return entry.value as T;
  }
  return undefined;
}
