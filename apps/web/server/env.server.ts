import { z } from "zod";

// Web-app-only settings; Qloo and DB settings live in @tourbo/core's getEnv().
const schema = z.object({
  // Outreach (Resend). Without RESEND_API_KEY, sends are simulated.
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(), // whsec_… from the webhook details page
  OUTREACH_FROM: z.string().default("Tourbo <onboarding@resend.dev>"),
  // Demo: every email goes to this inbox, never to a real venue.
  OUTREACH_INBOX: z.string().default("delivered@resend.dev"),
  // Receiving domain (e.g. <id>.resend.app); replies go to reply+<token>@ this domain.
  OUTREACH_REPLY_DOMAIN: z.string().optional(),
  // Remote MCP endpoint (/mcp): comma-separated bearer tokens. Unset = endpoint off.
  MCP_TOKENS: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((t) => t.trim()).filter(Boolean) : [])),
  // Public base URL, shown in the MCP connect instructions.
  PUBLIC_URL: z.string().optional(),
});

export type WebEnv = z.infer<typeof schema>;

let cached: WebEnv | undefined;

export function getWebEnv(): WebEnv {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  cached = result.data;
  return cached;
}
