import { z } from "zod";

const schema = z.object({
  QLOO_API_KEY: z.string().min(1, "QLOO_API_KEY is required"),
  QLOO_BASE_URL: z.url().default("https://hackathon.api.qloo.com"),
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
