import { clientIp, limiter } from "@tourbo/mcp/http.ts";

import { activeCount } from "./agent/runs.server.ts";

// Spend limits for anonymous visitors (no accounts): in-memory, per process. The client IP is the
// right-most X-Forwarded-For entry (Render is one trusted proxy hop; server.js trust proxy 1).
export const ipOf = (request: Request) => clientIp(request.headers.get("x-forwarded-for")) || "local";

const HOUR = 3_600_000;
// Generous on purpose (AI spend is capped on the account): they stop scripts, not people. Several
// people behind one office or VPN IP still fit.
const RUNS = { perIpPerHour: 20, concurrent: 20 };
const runsPerIp = limiter({ calls: RUNS.perIpPerHour, windowMs: HOUR });

// Before starting or resuming a plan (an AI run): the refusal sentence, or undefined to go ahead.
export function runLimit(request: Request): string | undefined {
  if (activeCount() >= RUNS.concurrent) return "Tourbo is busy planning other tours right now. Try again in a few minutes.";
  const wait = runsPerIp([`ip:${ipOf(request)}`], 1);
  if (wait) {
    const minutes = Math.max(1, Math.ceil(wait / 60_000));
    return `You've started a lot of plans this hour. Open one from your work, or try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return undefined;
}

// AI writing for page-built items (/api/explain) and drafts (/api/assist): per IP per hour. Over the
// limit the caller falls back to Tourbo's plain wording (no AI call).
const aiPerIp = limiter({ calls: 600, windowMs: HOUR });
export const aiAllowed = (request: Request) => aiPerIp([`ip:${ipOf(request)}`], 1) === 0;
