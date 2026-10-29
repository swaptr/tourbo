import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/session-ledger.js
import { createHash } from "node:crypto";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { isQlooHarnessProfile } from "./profiles.js";
var QLOO_LEDGER_ENTRY_TYPE = "qloo.ledger-event";
var QLOO_LEDGER_SCHEMA_VERSION = "1.0";
var QLOO_LEDGER_MAX_RESTORED_EVENTS = 1e3;
var QLOO_LEDGER_CATEGORIES = [
  "session",
  "goal",
  "clarification",
  "decision",
  "profile",
  "approval",
  "workflow",
  "file",
  "artifact",
  "verification",
  "compaction",
  "journey",
  "plan"
];
var categorySet = new Set(QLOO_LEDGER_CATEGORIES);
var actionsByCategory = {
  session: /* @__PURE__ */ new Set(["started", "stopped", "navigated"]),
  goal: /* @__PURE__ */ new Set(["selected", "received"]),
  clarification: /* @__PURE__ */ new Set(["received"]),
  decision: /* @__PURE__ */ new Set(["resolution_selected", "resolution_forgotten", "resolution_cleared"]),
  profile: /* @__PURE__ */ new Set(["changed"]),
  approval: /* @__PURE__ */ new Set(["requested", "approved", "denied", "unavailable"]),
  workflow: /* @__PURE__ */ new Set(["completed", "failed"]),
  file: /* @__PURE__ */ new Set(["read", "changed"]),
  artifact: /* @__PURE__ */ new Set(["created"]),
  verification: /* @__PURE__ */ new Set(["completed"]),
  compaction: /* @__PURE__ */ new Set(["started", "completed"]),
  journey: /* @__PURE__ */ new Set(["started", "advanced", "paused", "resumed", "completed", "cancelled", "skipped"]),
  plan: /* @__PURE__ */ new Set(["created"])
};
var forbiddenDetailKey = /(?:api[_-]?key|authorization|credential|password|secret|prompt|content|output|result[_-]?body|request[_-]?body|command(?:_text)?|arguments?|(?:access|refresh|id|auth)[_-]?token|^token$)/iu;
var controlCharacter = /[\u0000-\u001f\u007f-\u009f]/u;
function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isBoundedText(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !controlCharacter.test(value);
}
function isLedgerDetailValue(value) {
  if (value === null || typeof value === "boolean")
    return true;
  if (typeof value === "number")
    return Number.isFinite(value);
  if (typeof value === "string")
    return value.length <= 1024 && !controlCharacter.test(value);
  return Array.isArray(value) && value.length <= 16 && value.every((item) => typeof item === "string" && item.length <= 512 && !controlCharacter.test(item));
}
function isLedgerDetails(value) {
  if (!isPlainRecord(value) || Object.keys(value).length > 24)
    return false;
  return Object.entries(value).every(([key, item]) => /^[a-z][a-z0-9_]{0,63}$/u.test(key) && !forbiddenDetailKey.test(key) && isLedgerDetailValue(item));
}
function isReferences(value) {
  if (!isPlainRecord(value))
    return false;
  const allowed = /* @__PURE__ */ new Set(["turn_index", "tool_call_id", "correlation_id"]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    return false;
  return (value.turn_index === void 0 || Number.isSafeInteger(value.turn_index) && value.turn_index >= 0) && (value.tool_call_id === void 0 || isBoundedText(value.tool_call_id, 200)) && (value.correlation_id === void 0 || isBoundedText(value.correlation_id, 200));
}
function isQlooLedgerEvent(value) {
  if (!isPlainRecord(value))
    return false;
  if (value.schema_version !== QLOO_LEDGER_SCHEMA_VERSION)
    return false;
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1)
    return false;
  if (!isBoundedText(value.recorded_at, 40) || Number.isNaN(Date.parse(value.recorded_at)))
    return false;
  if (typeof value.category !== "string" || !categorySet.has(value.category))
    return false;
  const category = value.category;
  if (typeof value.action !== "string" || !actionsByCategory[category].has(value.action))
    return false;
  if (typeof value.profile !== "string" || !isQlooHarnessProfile(value.profile))
    return false;
  if (!isBoundedText(value.summary, 320))
    return false;
  if (value.references !== void 0 && !isReferences(value.references))
    return false;
  if (value.details !== void 0 && !isLedgerDetails(value.details))
    return false;
  try {
    return Buffer.byteLength(JSON.stringify(value)) <= 8192;
  } catch {
    return false;
  }
}
function ledgerEventsFromEntries(entries) {
  const events = [];
  for (const entry of entries) {
    if (!isPlainRecord(entry) || entry.type !== "custom" || entry.customType !== QLOO_LEDGER_ENTRY_TYPE || !isQlooLedgerEvent(entry.data))
      continue;
    events.push(entry.data);
  }
  return events.slice(-QLOO_LEDGER_MAX_RESTORED_EVENTS);
}
var QlooSessionLedger = class {
  #now;
  #events = [];
  #nextSequence = 1;
  constructor(options = {}) {
    this.#now = options.now ?? (() => /* @__PURE__ */ new Date());
  }
  restore(entries) {
    this.#events = ledgerEventsFromEntries(entries);
    this.#nextSequence = this.#events.reduce((next, event) => Math.max(next, event.sequence + 1), 1);
  }
  record(sink, profile, input) {
    const event = {
      schema_version: QLOO_LEDGER_SCHEMA_VERSION,
      sequence: this.#nextSequence,
      recorded_at: this.#now().toISOString(),
      category: input.category,
      action: input.action,
      profile,
      summary: input.summary,
      ...input.references === void 0 ? {} : { references: input.references },
      ...input.details === void 0 ? {} : { details: input.details }
    };
    if (!isQlooLedgerEvent(event)) {
      throw new Error("Qloo refused to persist an invalid or sensitive ledger event.");
    }
    sink?.(QLOO_LEDGER_ENTRY_TYPE, event);
    this.#nextSequence += 1;
    this.#events.push(event);
    if (this.#events.length > QLOO_LEDGER_MAX_RESTORED_EVENTS) {
      this.#events.splice(0, this.#events.length - QLOO_LEDGER_MAX_RESTORED_EVENTS);
    }
    return event;
  }
  list(category) {
    const selected = category === void 0 ? this.#events : this.#events.filter((event) => event.category === category);
    return selected.map((event) => ({
      ...event,
      ...event.references ? { references: { ...event.references } } : {},
      ...event.details ? { details: { ...event.details } } : {}
    }));
  }
};
function fingerprintQlooLedgerText(value) {
  return {
    sha256: createHash("sha256").update(value).digest("hex"),
    size_bytes: Buffer.byteLength(value)
  };
}
function qlooLedgerFileReference(value, cwd) {
  if (typeof value !== "string" || value.trim().length === 0 || controlCharacter.test(value)) {
    return void 0;
  }
  const root = resolve(cwd);
  const absolute = resolve(root, value);
  const projectRelative = relative(root, absolute);
  const outside = projectRelative === ".." || projectRelative.startsWith(`..${sep}`) || isAbsolute(projectRelative);
  if (outside) {
    return {
      path: basename(absolute).slice(0, 240) || "outside-workspace-file",
      scope: "outside_workspace"
    };
  }
  return {
    path: (projectRelative || ".").split(sep).join("/").slice(0, 1024),
    scope: "workspace"
  };
}
function classifyQlooVerificationCommand(command) {
  if (typeof command !== "string" || command.trim().length === 0)
    return void 0;
  const normalized = command.trim().toLowerCase();
  const patterns = [
    ["test", /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|test:[\w:-]+)(?:\s|$)|(?:^|[;&|]\s*)(?:pytest|python\s+-m\s+pytest|node\s+--test|vitest|jest|mocha|cargo\s+test|go\s+test|dotnet\s+test|mvn\s+test|gradle\w*\s+test)(?:\s|$)/u],
    ["typecheck", /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|check:types)(?:\s|$)|(?:^|[;&|]\s*)(?:tsc|mypy|pyright)(?:\s|$)/u],
    ["lint", /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint(?:\s|$)|(?:^|[;&|]\s*)(?:eslint|ruff\s+check|pylint|golangci-lint)(?:\s|$)/u],
    ["smoke", /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:smoke|e2e)(?:\s|$)|(?:^|[;&|]\s*)(?:playwright\s+test)(?:\s|$)/u],
    ["build", /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|check)(?:\s|$)|(?:^|[;&|]\s*)(?:cargo\s+build|go\s+build|dotnet\s+build)(?:\s|$)/u]
  ];
  const match = patterns.find(([, pattern]) => pattern.test(normalized));
  if (!match)
    return void 0;
  return { kind: match[0], ...fingerprintQlooLedgerText(command) };
}
function formatQlooLedgerEvent(event) {
  const time = event.recorded_at.slice(11, 19);
  const references = [
    event.references?.correlation_id ? `correlation ${event.references.correlation_id}` : void 0,
    event.references?.tool_call_id ? `tool ${event.references.tool_call_id}` : void 0
  ].filter((value) => value !== void 0);
  return [
    `${event.sequence}. ${time} \xB7 ${event.category}/${event.action} \xB7 ${event.summary}`,
    references.length > 0 ? `   ${references.join(" \xB7 ")}` : void 0
  ].filter((value) => value !== void 0).join("\n");
}
export {
  QLOO_LEDGER_CATEGORIES,
  QLOO_LEDGER_ENTRY_TYPE,
  QLOO_LEDGER_MAX_RESTORED_EVENTS,
  QLOO_LEDGER_SCHEMA_VERSION,
  QlooSessionLedger,
  classifyQlooVerificationCommand,
  fingerprintQlooLedgerText,
  formatQlooLedgerEvent,
  isQlooLedgerEvent,
  qlooLedgerFileReference
};
