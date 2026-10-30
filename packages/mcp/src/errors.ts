// Every failed tool call reads as one plain sentence with what to do next (isError: true); the
// raw detail goes to stderr only (stdout is the protocol in stdio mode). Same kinds and texts as
// the web app (@tourbo/core/shared/errors.ts); only the setup hints name env vars.
import { z } from "zod";

import { QlooError } from "@tourbo/core/qloo/client.server.ts";
import { DATA_LIMIT, ERROR_TEXT, RETRYABLE, type Classified, type ErrorKind } from "@tourbo/core/shared/errors.ts";

// Thrown by tools for a mistake the caller can fix; the message is shown as is.
export class UserError extends Error {}

export const NO_KEY = "Set QLOO_API_KEY to your Qloo API key in this server's environment and restart it.";
export const NO_DB = "Projects need DATABASE_URL: set it to a Postgres connection string and restart the server.";
export const KEY_REJECTED = "The fan-data key was rejected: check QLOO_API_KEY and restart the server.";
export const UNKNOWN_ID = "No project, plan or item with that id: check the id (tourbo_project_list lists projects).";
export const DB_DOWN = "The database is unreachable. Check DATABASE_URL and that Postgres is running, then try again.";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 240);
const of = (kind: ErrorKind, message = ERROR_TEXT[kind]): Classified => ({ kind, message, retry: RETRYABLE[kind] });
const NET_DOWN = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED"]);

export function classifyToolError(error: unknown): Classified {
  const e = error as Error & { status?: number; code?: string; quotaResetSec?: number; name?: string };
  const message = e?.message ?? String(error);
  if (error instanceof UserError) return of("bad_input", oneLine(message));
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return of("bad_input", `An input isn't in the expected shape${first?.path.length ? ` at ${first.path.join(".")}` : ""}: ${oneLine(first?.message ?? "check the inputs")}.`);
  }
  if (error instanceof QlooError || typeof e?.status === "number") {
    const status = e.status ?? 0;
    if (status === 429 && typeof e.quotaResetSec === "number") return of("data_limit", `${DATA_LIMIT} It resets in about ${Math.ceil(e.quotaResetSec / 86_400)} days: use another QLOO_API_KEY or try again then.`);
    if (status === 429 || status >= 500) return of("data_busy");
    if (status === 401 || status === 403) return of("data_off", KEY_REJECTED);
  }
  if (!process.env.QLOO_API_KEY && /QLOO_API_KEY/.test(message)) return of("data_off", NO_KEY);
  if (/DATABASE_URL/.test(message)) return of("db_down", NO_DB);
  if (/^No such project|invalid input syntax for type uuid/i.test(message) || (e?.name === "PostgresError" && e.code === "22P02")) return of("not_found", UNKNOWN_ID);
  if ((e?.code && NET_DOWN.has(e.code)) || (e?.name === "PostgresError" && /^(08|53|57P)/.test(e.code ?? "")) || /connect ECONNREFUSED|database system is starting/i.test(message)) return of("db_down", DB_DOWN);
  if (e?.name === "TimeoutError" || /fetch failed|timed out|ECONNRESET/i.test(message)) return of("data_busy");
  return of("unknown");
}

// The tool-result body: plain sentence plus its kind and retry flag (the hosted agent reads the kind).
export function toolFailure(error: unknown, where: string): { error: string; kind: ErrorKind; retry: boolean } {
  const c = classifyToolError(error);
  if (c.kind !== "bad_input" && c.kind !== "not_found" && c.message !== NO_KEY && c.message !== NO_DB) console.error(`tourbo-mcp ${where} ${c.kind}:`, oneLine(error instanceof Error ? error.message : String(error)));
  return { error: c.kind === "unknown" ? `Something went wrong in ${where}. Try again in a moment, or change the inputs.` : c.message, kind: c.kind, retry: c.retry };
}

export const plainError = (error: unknown, where: string): string => toolFailure(error, where).error;
