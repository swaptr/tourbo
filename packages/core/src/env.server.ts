import { z } from "zod";

const schema = z.object({
  QLOO_API_KEY: z.string().min(1, "QLOO_API_KEY is required"),
  QLOO_BASE_URL: z.url().default("https://hackathon.api.qloo.com"),
  // Local dev default matches the compose.yaml Postgres (see CLAUDE.md).
  DATABASE_URL: z
    .string()
    .default("postgres://tourbo:tourbo@localhost:5433/tourbo"),
  // Qloo response cache: Postgres (shared, survives restarts) or in-process memory.
  // Postgres falls back to memory if the DB is unreachable.
  QLOO_CACHE: z.enum(["postgres", "memory"]).default("postgres"),
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
