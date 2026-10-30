import pLimit from "p-limit";

import { cached, nsStats } from "../cache/index.ts";
import { getEnv } from "../env.server.ts";
import { cacheKey, QLOO_NS, QLOO_TTL } from "./cache.server.ts";

export type QlooParams = Record<
  string,
  string | number | boolean | (string | number)[] | undefined
>;

export class QlooError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: unknown;

  constructor(status: number, path: string, body: unknown) {
    super(`Qloo ${status} on ${path}: ${describe(body)}`);
    this.name = "QlooError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 15_000;
const limit = pLimit(8);

let callCount = 0;
let errorCount = 0;
export const qlooCallCount = () => callCount;
// Failed requests (after retries). Callers caching derived results skip caching if this moved.
export const qlooErrorCount = () => errorCount;
// Requests answered without calling Qloo (fresh or stale cache, or joined an identical in-flight call).
export const qlooCacheHits = () => {
  const s = nsStats(QLOO_NS);
  return s.hit + s.stale + s.coalesced;
};

// Qloo is GET-only with query-string params; arrays become comma-separated lists.
// Cached 7 days (namespace "qloo"); errors throw and null bodies are returned but never stored.
export async function qlooGet<T = unknown>(
  path: string,
  params: QlooParams = {},
): Promise<T> {
  const url = new URL(path, getEnv().QLOO_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return cached(cacheKey(url), () =>
      limit(() => request<T>(url)).catch((error) => {
        errorCount++;
        throw error;
      }), { ns: QLOO_NS, ttl: QLOO_TTL });
}

async function request<T>(url: URL): Promise<T> {
  const { QLOO_API_KEY } = getEnv();
  for (let attempt = 0; ; attempt++) {
    callCount++;
    const res = await fetch(url, {
      headers: { "X-Api-Key": QLOO_API_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) return body as T;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new QlooError(res.status, url.pathname, body);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, delay));
  }
}

// Errors arrive as {code, reason, message}, {error: {...}} or {errors: [{message, path}]}.
function describe(body: unknown): string {
  if (!body || typeof body !== "object") return "no details";
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.errors)) {
    return record.errors
      .map((e: { message?: string; path?: string }) => `${e.path ?? ""}: ${e.message ?? ""}`)
      .join("; ");
  }
  const err = (record.error && typeof record.error === "object" ? record.error : record) as Record<string, unknown>;
  return [err.reason, err.message].filter(Boolean).join(" - ") || JSON.stringify(body);
}
