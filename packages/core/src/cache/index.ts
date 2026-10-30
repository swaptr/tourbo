// One cache layer for everything read-mostly (Qloo responses, MCP tool results, snapshots).
// Tiers are read in order (memory → file → postgres by default, chosen by CACHE_TIERS) and written
// through; a hit in a later tier backfills the earlier ones. Stale-while-revalidate, one in-flight
// load per key, and nothing null/undefined (or thrown) is ever stored.
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getEnv } from "../env.server.ts";
import { fileBackend } from "./file.ts";
import { memoryBackend } from "./memory.ts";
import { postgresBackend } from "./postgres.ts";

export type TierName = "memory" | "file" | "postgres";
export const TIER_NAMES: TierName[] = ["memory", "file", "postgres"];

// `at` = when the value was produced (ms); `expiresAt` = hard expiry (ttl + swr), none = forever.
export type Entry = { value: unknown; at: number; expiresAt?: number; tags?: string[] };

export interface Backend {
  name: string;
  readOnly?: boolean;
  get(ns: string, key: string): Promise<Entry | undefined>;
  set(ns: string, key: string, entry: Entry): Promise<void>;
  delete(ns: string, key: string): Promise<void>;
  deleteByTag(tag: string): Promise<void>;
}

export type CacheOptions<T> = {
  ns: string;
  ttl: number; // ms fresh
  swr?: number; // ms after ttl during which the stale value is served while it refreshes
  tiers?: (TierName | Backend)[];
  tags?: string[];
  cacheable?: (value: T) => boolean;
};

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

const backends = new Map<TierName, Backend>();
export function backend(name: TierName): Backend {
  let b = backends.get(name);
  if (!b) {
    const env = getEnv();
    b =
      name === "memory"
        ? memoryBackend(env.CACHE_MEMORY_MAX)
        : name === "file"
          ? fileBackend(env.CACHE_DIR ?? join(tmpdir(), "tourbo-cache"), env.CACHE_FILE_READONLY ? env.CACHE_FILE_READONLY === "true" : env.NODE_ENV === "production")
          : postgresBackend();
    backends.set(name, b);
  }
  return b;
}

// CACHE_TIERS wins ("none" = []); production defaults to no cache (the live app and MCP always
// call fan data fresh; only the landing bundle is pre-baked); dev follows QLOO_CACHE.
export function tierNames(): TierName[] {
  const { CACHE_TIERS, QLOO_CACHE, NODE_ENV } = getEnv();
  if (CACHE_TIERS) return CACHE_TIERS;
  if (NODE_ENV === "production") return [];
  return QLOO_CACHE === "postgres" ? ["memory", "postgres"] : ["memory"];
}

const resolveTiers = (tiers?: (TierName | Backend)[]) => (tiers ?? tierNames()).map((t) => (typeof t === "string" ? backend(t) : t));

export type NsStats = { hit: number; stale: number; miss: number; coalesced: number };
const stats = new Map<string, NsStats>();
const count = (ns: string, field: keyof NsStats) => {
  const s = stats.get(ns) ?? { hit: 0, stale: 0, miss: 0, coalesced: 0 };
  s[field]++;
  stats.set(ns, s);
};
export const cacheStats = (): Record<string, NsStats> => Object.fromEntries([...stats].map(([ns, s]) => [ns, { ...s }]));
// Dev /healthz?cache reads this (apps/web/server.js can't import TS source).
(globalThis as { __tourboCacheStats?: typeof cacheStats }).__tourboCacheStats = cacheStats;
export const nsStats = (ns: string): NsStats => ({ hit: 0, stale: 0, miss: 0, coalesced: 0, ...stats.get(ns) });

// Stable key for a JSON-ish request: sorted object keys, sha256.
export function hashKey(value: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(stable(value)) ?? "undefined").digest("hex");
}

const warned = new Set<string>();
function warn(tier: Backend, op: string, error: unknown) {
  const k = `${tier.name}:${op}`;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`Cache: ${tier.name} ${op} failed (${(error as Error).message}); continuing without it`);
}
const safeGet = (tier: Backend, ns: string, key: string) =>
  tier.get(ns, key).catch((error) => {
    warn(tier, "read", error);
    return undefined;
  });
async function writeAll(tiers: Backend[], ns: string, key: string, entry: Entry) {
  await Promise.all(tiers.filter((t) => !t.readOnly).map((t) => t.set(ns, key, entry).catch((error) => warn(t, "write", error))));
}

const inflight = new Map<string, Promise<unknown>>();
const notEmpty = (v: unknown) => v !== null && v !== undefined;

function load<T>(id: string, tiers: Backend[], key: string, fn: () => Promise<T>, opts: CacheOptions<T>): Promise<T> {
  const running = inflight.get(id);
  if (running) return running as Promise<T>;
  const p = (async () => {
    const value = await fn();
    if (notEmpty(value) && (opts.cacheable?.(value) ?? true)) {
      const at = Date.now();
      const life = opts.ttl + (opts.swr ?? 0);
      await writeAll(tiers, opts.ns, key, { value, at, expiresAt: Number.isFinite(life) ? at + life : undefined, tags: opts.tags });
    }
    return value;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export async function cached<T>(key: string, fn: () => Promise<T>, opts: CacheOptions<T>): Promise<T> {
  const tiers = resolveTiers(opts.tiers);
  const id = `${opts.ns}\u0000${key}`;
  const now = Date.now();
  let stale: Entry | undefined;
  for (let i = 0; i < tiers.length; i++) {
    const entry = await safeGet(tiers[i], opts.ns, key);
    if (!entry || !notEmpty(entry.value) || (entry.expiresAt !== undefined && entry.expiresAt <= now)) continue;
    const age = now - entry.at;
    if (age < opts.ttl) {
      count(opts.ns, "hit");
      if (i > 0) void writeAll(tiers.slice(0, i), opts.ns, key, entry);
      return entry.value as T;
    }
    if (age < opts.ttl + (opts.swr ?? 0)) stale ??= entry;
  }
  if (stale) {
    count(opts.ns, "stale");
    load(id, tiers, key, fn, opts).catch((error) => console.warn(`Cache: refresh of ${opts.ns} failed (${(error as Error).message})`));
    return stale.value as T;
  }
  count(opts.ns, inflight.has(id) ? "coalesced" : "miss");
  return load(id, tiers, key, fn, opts);
}

export async function invalidate(ns: string, key: string, tiers?: (TierName | Backend)[]) {
  await Promise.all(resolveTiers(tiers).map((t) => t.delete(ns, key).catch((error) => warn(t, "delete", error))));
}
export async function invalidateTag(tag: string, tiers?: (TierName | Backend)[]) {
  await Promise.all(resolveTiers(tiers).map((t) => t.deleteByTag(tag).catch((error) => warn(t, "delete", error))));
}

// Snapshots: values kept until replaced (examples until the next export, plan views until the run
// changes). Same tiers, namespace "snapshot".
const SNAPSHOT_NS = "snapshot";
export const snapshot = {
  async get<T>(key: string, tiers?: (TierName | Backend)[]): Promise<T | undefined> {
    const list = resolveTiers(tiers);
    for (let i = 0; i < list.length; i++) {
      const entry = await safeGet(list[i], SNAPSHOT_NS, key);
      if (!entry || !notEmpty(entry.value)) continue;
      if (i > 0) void writeAll(list.slice(0, i), SNAPSHOT_NS, key, entry);
      return entry.value as T;
    }
    return undefined;
  },
  async put(key: string, value: unknown, opts: { tags?: string[]; tiers?: (TierName | Backend)[] } = {}) {
    if (!notEmpty(value)) return;
    await writeAll(resolveTiers(opts.tiers), SNAPSHOT_NS, key, { value, at: Date.now(), tags: opts.tags });
  },
};
