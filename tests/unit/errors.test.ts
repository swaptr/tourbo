// One error model: every failure maps to a kind, one plain sentence and a retry flag.
import assert from "node:assert/strict";
import { test } from "node:test";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { QlooError } from "../../packages/core/src/qloo/client.server.ts";
import { EditError } from "../../packages/core/src/engine/proposals.ts";
import { AI_LIMIT, DATA_LIMIT, ERROR_KINDS, ERROR_TEXT, limitKindOf, RETRYABLE } from "../../packages/core/src/shared/errors.ts";
import { apiError, classifyError, friendlyError, isAiLimit, PlainError } from "../../apps/web/server/agent/errors.ts";
import { classifyToolError, plainError, UserError } from "../../packages/mcp/src/errors.ts";

const VENDOR = /qloo|claude|anthropic|postgres|docker|stack|TypeError|undefined/i;
const quiet = <T>(fn: () => T): T => {
  const warn = console.warn;
  const err = console.error;
  console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = err;
  }
};
const kind = (e: unknown) => quiet(() => classifyError(e)).kind;
const headers = new Headers();
const pg = (code: string) => Object.assign(new Error("pg"), { name: "PostgresError", code });

test("typed errors map to their kind", () => {
  assert.equal(kind(new QlooError(429, "/search", {}, 86_400 * 3)), "data_limit");
  assert.equal(kind(new QlooError(429, "/search", {})), "data_busy");
  assert.equal(kind(new QlooError(503, "/search", {})), "data_busy");
  assert.equal(kind(new QlooError(401, "/search", {})), "data_off");
  assert.equal(kind(new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "x" } }, "rate limited", headers)), "ai_limit");
  assert.equal(kind(new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the API" } }, undefined, headers)), "ai_limit");
  assert.equal(kind(new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", headers)), "ai_off");
  assert.equal(kind(new Anthropic.InternalServerError(529, {}, "Overloaded", headers)), "ai_busy");
  assert.equal(kind(new Anthropic.APIConnectionError({ message: "Connection error." })), "ai_busy");
  assert.equal(kind(pg("08006")), "db_down");
  assert.equal(kind(pg("57P03")), "db_down");
  assert.equal(kind(pg("22P02")), "not_found");
  assert.equal(kind(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5434"), { code: "ECONNREFUSED" })), "db_down");
  assert.equal(kind(new PlainError("Paste at least one song.")), "bad_input");
  assert.equal(kind(new PlainError("Gone.", "not_found")), "not_found");
  assert.equal(kind(new EditError("That night is already gone.")), "bad_input");
  assert.equal(kind(z.string().safeParse(1).error), "bad_input");
  assert.equal(kind(Object.assign(new Error("tourbo_score_cities: whatever"), { kind: "data_limit" })), "data_limit");
  assert.equal(kind(new Error("wrapped", { cause: new QlooError(429, "/x", {}, 100) })), "data_limit");
  assert.equal(kind(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })), "data_busy");
});

test("plain-text fallbacks map to their kind", () => {
  assert.equal(kind(new Error("Qloo 429 on /v2/insights: monthly quota used up, resets in 3 days")), "data_limit");
  assert.equal(kind(new Error("tourbo_plan_tour: Data provider limit reached. It resets in about 3 days")), "data_limit");
  assert.equal(kind(new Error("Your credit balance is too low")), "ai_limit");
  assert.equal(kind(new Error("Could not resolve authentication method. Expected the apiKey")), "ai_off");
  assert.equal(kind(new Error("QLOO_API_KEY is not set")), "data_off");
  assert.equal(kind(new Error("Qloo 503 after 3 retries")), "data_busy");
  assert.equal(kind(new Error("fetch failed")), "data_busy");
  assert.equal(kind(new Error("Artist not found: zzz")), "not_found");
  assert.equal(kind(new Error("No such project 123")), "not_found");
  assert.equal(kind(new Error("connect ECONNREFUSED 127.0.0.1:5433")), "db_down");
  assert.equal(kind(new Error(ERROR_TEXT.forbidden)), "forbidden");
  assert.equal(kind(new Error("TypeError: undefined is not a function")), "unknown");
  assert.equal(kind("a string"), "unknown");
  assert.equal(kind(undefined), "unknown");
});

test("exact texts and retry flags", () => {
  assert.equal(friendlyError(new QlooError(429, "/x", {}, 10)), "Data provider limit reached.");
  assert.equal(quiet(() => friendlyError(new Anthropic.RateLimitError(429, {}, "x", headers))), "AI provider limit reached.");
  assert.equal(friendlyError(pg("08006")), "The database is unreachable. Restart the app and try again.");
  assert.equal(quiet(() => isAiLimit(new Error("rate_limit_error"))), true);
  assert.equal(quiet(() => isAiLimit(new QlooError(429, "/x", {}, 10))), false);
  for (const k of ["data_limit", "ai_limit", "ai_off", "data_off", "not_found", "bad_input", "forbidden"] as const) assert.equal(RETRYABLE[k], false, k);
  for (const k of ["data_busy", "ai_busy", "db_down", "unknown"] as const) assert.equal(RETRYABLE[k], true, k);
  assert.deepEqual(quiet(() => apiError(new QlooError(429, "/x", {}, 10), "test")), { error: DATA_LIMIT, retry: false });
  assert.deepEqual(quiet(() => apiError(new Error("boom"), "test", "That didn't delete. Try again in a moment.")), { error: "That didn't delete. Try again in a moment.", retry: true });
  assert.equal(limitKindOf(AI_LIMIT), "ai_limit");
  assert.equal(limitKindOf(`${DATA_LIMIT.slice(0, -1)}. It resets in about 3 days`), "data_limit");
  assert.equal(limitKindOf("Fan data is busy right now."), undefined);
});

test("no vendor names, raw text or stacks in any user sentence", () => {
  for (const k of ERROR_KINDS) assert.doesNotMatch(ERROR_TEXT[k], VENDOR, k);
  const raws = ["Qloo 503", "Anthropic 500 internal", "TypeError: x is undefined\n    at foo (/app/x.ts:1:1)", "postgres://u:p@h/db refused", "refusal", "max_tokens"];
  for (const m of raws) {
    const c = quiet(() => classifyError(new Error(m)));
    assert.doesNotMatch(c.message, VENDOR, m);
    assert.ok(!c.message.includes("\n") && c.message.length < 200, m);
  }
});

test("server log: one line, secrets masked", () => {
  const lines: string[] = [];
  const warn = console.warn;
  console.warn = (s: string) => void lines.push(s);
  try {
    apiError(new Error("bad key sk-ant-api03-SECRET123 at\n postgres://tourbo:pw@localhost/db"), "test");
  } finally {
    console.warn = warn;
  }
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes("\n"));
  assert.doesNotMatch(lines[0], /SECRET123|:pw@/);
});

test("MCP uses the same kinds and texts", () => {
  const mcp = (e: unknown) => quiet(() => classifyToolError(e));
  assert.equal(mcp(new QlooError(429, "/x", {}, 86_400 * 3)).kind, "data_limit");
  assert.ok(mcp(new QlooError(429, "/x", {}, 86_400 * 3)).message.startsWith(DATA_LIMIT));
  assert.equal(mcp(new QlooError(429, "/x", {})).message, ERROR_TEXT.data_busy);
  assert.equal(mcp(new QlooError(503, "/x", {})).kind, "data_busy");
  assert.equal(mcp(new UserError("Pass a city.")).message, "Pass a city.");
  assert.equal(mcp(pg("08006")).kind, "db_down");
  assert.equal(mcp(new Error("boom")).retry, true);
  assert.match(quiet(() => plainError(new Error("boom"), "tourbo_route")), /tourbo_route/);
});
