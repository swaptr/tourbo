import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { QlooError, qlooQuotaResetAt } from "@tourbo/core/qloo/client.server.ts";
import { EditError } from "@tourbo/core/engine/proposals.ts";
import { AI_LIMIT, DATA_LIMIT, ERROR_TEXT, isErrorKind, limitKindOf, RETRYABLE, type Classified, type ErrorKind } from "@tourbo/core/shared/errors.ts";

export { AI_LIMIT, DATA_LIMIT, type Classified, type ErrorKind };

// Thrown with a message that is already one plain sentence for the user (a fixable request).
export class PlainError extends Error {
  readonly kind: ErrorKind;
  constructor(message: string, kind: ErrorKind = "bad_input") {
    super(message);
    this.kind = kind;
  }
}

const ACT_NOT_FOUND = "We couldn't find that act in the fan data. Add one to three acts you sound like and try again.";
const AI_DECLINED = "The AI assistant declined this request. Try a different act or settings.";
const TRUNCATED = "The planner stopped before finishing. Try again.";

// Postgres SQLSTATE classes: 08 connection, 53 resources, 57P admin/crash shutdown. 22P02 = bad uuid.
const PG_DOWN = /^(08|53|57P)/;
const NET_DOWN = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED"]);

type Loose = { name?: string; message?: string; status?: number; code?: string; kind?: unknown; quotaResetSec?: number; cause?: unknown };

const of = (kind: ErrorKind, message = ERROR_TEXT[kind]): Classified => ({ kind, message, retry: RETRYABLE[kind] });

// When a provider limit was last seen (AI only; the data limit is read from the client's quota state).
let aiLimitAt = 0;
const AI_LIMIT_STICKY_MS = 10 * 60_000;

// Typed checks first (our own errors, the fan-data client, the AI SDK, Postgres), regex on the
// message only as a fallback for errors that arrive as plain text (MCP tool results, wrapped errors).
export function classifyError(error: unknown): Classified {
  const c = classify(error);
  if (c.kind === "ai_limit") aiLimitAt = Date.now();
  return c;
}

function classify(error: unknown, depth = 0): Classified {
  if (error instanceof PlainError) return { kind: error.kind, message: error.message, retry: RETRYABLE[error.kind] };
  if (error instanceof EditError) return { kind: "bad_input", message: error.message, retry: false };
  if (error instanceof z.ZodError) return of("bad_input");

  if (error instanceof QlooError) {
    if (error.quotaResetSec !== undefined) return of("data_limit");
    if (error.status === 429 || error.status >= 500) return of("data_busy");
    if (error.status === 401 || error.status === 403) return of("data_off");
    return of("unknown");
  }

  if (error instanceof Anthropic.APIError) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return of("ai_off");
    if (error instanceof Anthropic.RateLimitError || error.type === "rate_limit_error" || error.type === "billing_error") return of("ai_limit");
    if (error.type === "overloaded_error" || error.type === "timeout_error") return of("ai_busy");
    if (/credit balance|spend limit|usage limit/i.test(error.message)) return of("ai_limit");
    if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError || (error.status ?? 0) >= 500) return of("ai_busy");
    return of("unknown");
  }
  if (error instanceof Anthropic.AnthropicError && /api[_ ]?key|authentication/i.test(error.message)) return of("ai_off");

  const e = (error ?? {}) as Loose;
  // Already classified upstream (the MCP tool result carries its kind).
  if (isErrorKind(e.kind)) {
    const m = String(e.message ?? "");
    return e.kind === "bad_input" || e.kind === "not_found" ? of(e.kind, m.replace(/^tourbo_\w+: /, "") || ERROR_TEXT[e.kind]) : of(e.kind);
  }
  if (e.name === "PostgresError" && typeof e.code === "string") {
    if (PG_DOWN.test(e.code)) return of("db_down");
    if (e.code === "22P02") return of("not_found");
  }
  if (typeof e.code === "string" && NET_DOWN.has(e.code)) return of("db_down");
  if (e.name === "TimeoutError" || e.name === "AbortError") return of("data_busy");

  // A wrapped error: classify its cause once before falling back to the text.
  if (depth < 2 && e.cause && typeof e.cause === "object") {
    const inner = classify(e.cause, depth + 1);
    if (inner.kind !== "unknown") return inner;
  }
  return fromText(error instanceof Error ? error.message : typeof e.message === "string" ? e.message : String(error));
}

function fromText(m: string): Classified {
  const limit = limitKindOf(m.replace(/^tourbo_\w+: /, ""));
  if (limit) return of(limit);
  if (/monthly quota used up/i.test(m)) return of("data_limit");
  if (/credit balance|spend limit|usage limit|rate_limit_error/i.test(m)) return of("ai_limit");
  if (/QLOO_API_KEY/.test(m)) return of("data_off");
  if (/\bQloo 40[13]\b/i.test(m)) return of("data_off");
  if (/ANTHROPIC_API_KEY|could not resolve authentication|invalid x-api-key|\b401\b/i.test(m)) return of("ai_off");
  if (/artist not found|not in qloo|no .* named/i.test(m)) return of("not_found", ACT_NOT_FOUND);
  if (/^No such (project|plan|run)|invalid input syntax for type uuid/i.test(m)) return of("not_found");
  if (/ECONNREFUSED|database system is (starting|shutting)|DATABASE_URL|postgres/i.test(m)) return of("db_down");
  if (/Only the browser that made this/.test(m)) return of("forbidden");
  if (/qloo|fan data|\b429\b|\b5\d\d\b|timeout|timed out|fetch failed|ECONNRESET|overloaded/i.test(m)) return of("data_busy");
  if (/declined|refusal/i.test(m)) return of("unknown", AI_DECLINED);
  if (/without finalizing|truncated|max_tokens/i.test(m)) return of("unknown", TRUNCATED);
  return of("unknown");
}

// One line in the server log: where, kind, and the raw message (keys/tokens masked), never a stack.
const SECRET = /(sk-ant-[\w-]+|x-api-key[=:]\s*\S+|api[_-]?key[=:]\s*\S+|Bearer\s+\S+|postgres(?:ql)?:\/\/[^\s@]+@)/gi;
export function logError(where: string, error: unknown, kind: ErrorKind = classify(error).kind): void {
  if (kind === "bad_input" || kind === "not_found" || kind === "forbidden") return;
  const raw = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).replace(/\s+/g, " ").replace(SECRET, "[redacted]").slice(0, 300);
  console.warn(`[${where}] ${kind}: ${raw}`);
}

// The shape every API route and action returns on failure. `fallback` replaces the generic
// sentence for an unknown error with one that names the action ("That didn't delete. …").
export function apiError(error: unknown, where: string, fallback?: string): { error: string; retry: boolean } {
  const c = classifyError(error);
  logError(where, error, c.kind);
  return { error: c.kind === "unknown" && fallback && c.message === ERROR_TEXT.unknown ? fallback : c.message, retry: c.retry };
}

// Thin wrappers kept for callers.
export const friendlyError = (error: unknown): string => classifyError(error).message;
export const isAiLimit = (error: unknown): boolean => classifyError(error).kind === "ai_limit";

// Provider limits currently in force (for the one page-level notice).
export function activeLimits(): { data: boolean; ai: boolean } {
  return { data: qlooQuotaResetAt() !== undefined, ai: Date.now() - aiLimitAt < AI_LIMIT_STICKY_MS };
}
