import { z } from "zod";

const schema = z.object({
  QLOO_API_KEY: z.string().min(1, "QLOO_API_KEY is required"),
  QLOO_BASE_URL: z.url().default("https://hackathon.api.qloo.com"),
  // Unset = local embedded Postgres in <repo>/.data/postgres (db/embedded.server.ts).
  DATABASE_URL: z.string().optional().transform((s) => s || undefined),
  // Qloo response cache: Postgres (shared, survives restarts) or in-process memory.
  // Postgres falls back to memory if the DB is unreachable.
  QLOO_CACHE: z.enum(["postgres", "memory"]).default("postgres"),
  // Cache tiers, read in order and written through (packages/core/src/cache). "none" = no cache.
  // Unset = none in production (live app and MCP always call fan data fresh; only the landing
  // bundle is pre-baked), else from QLOO_CACHE (postgres → memory,postgres; memory → memory).
  CACHE_TIERS: z
    .string()
    .optional()
    .transform((s) => {
      if (s?.trim() === "none") return [];
      const list = s?.split(",").map((t) => t.trim()).filter(Boolean);
      return list?.length ? list : undefined;
    })
    .pipe(z.array(z.enum(["memory", "file", "postgres"])).optional()),
  CACHE_MEMORY_MAX: z.coerce.number().int().positive().catch(5000),
  // File tier directory (default: <tmpdir>/tourbo-cache); read-only by default in production.
  CACHE_DIR: z.string().optional().transform((s) => s || undefined),
  CACHE_FILE_READONLY: z.enum(["true", "false", ""]).optional().transform((s) => s || undefined),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Lazy so the app boots without keys; fails on first use with a clear message.
export function getEnv(): Env {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  cached = result.data;
  return cached;
}
