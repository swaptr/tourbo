import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QlooClientError
} from "./chunks/chunk-ESNY4EJL.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/observability.js
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { QlooWorkflowExecutionError } from "./workflow-executor.js";
var QLOO_EXECUTION_LOG_SCHEMA_VERSION = "1.0";
function errorMetadata(error) {
  const seen = /* @__PURE__ */ new Set();
  let current = error;
  for (let depth = 0; depth < 8 && current !== void 0 && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof QlooWorkflowExecutionError) {
      return { errorCode: current.code, retryable: current.retryable };
    }
    if (current instanceof QlooClientError) {
      return { errorCode: current.code, retryable: current.retryable };
    }
    current = current !== null && typeof current === "object" ? Reflect.get(current, "cause") : void 0;
  }
  return {};
}
function resultStatus(execution) {
  const status = execution.result.status;
  return typeof status === "string" ? status : void 0;
}
function resultCount(execution) {
  const count = execution.result.result_count;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : void 0;
}
function createFileExecutionObserver(options) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const append = options.append ?? ((path, content) => appendFile(path, content, "utf8"));
  const ensureDirectory = options.ensureDirectory ?? ((path) => mkdir(path, { recursive: true, mode: 448 }).then(() => void 0));
  const write = async (record) => {
    await ensureDirectory(options.logsDirectory);
    const date = record.timestamp.slice(0, 10);
    await append(join(options.logsDirectory, `workflows-${date}.jsonl`), `${JSON.stringify(record)}
`);
  };
  return {
    async onExecution(execution) {
      const timestamp = now().toISOString();
      const status = resultStatus(execution);
      const count = resultCount(execution);
      await write({
        schema_version: QLOO_EXECUTION_LOG_SCHEMA_VERSION,
        timestamp,
        event: "workflow_completed",
        operation: execution.operation,
        transport: execution.transport.kind,
        correlation_id: execution.correlationId,
        duration_ms: execution.durationMs,
        ...status ? { status } : {},
        ...count === void 0 ? {} : { result_count: count }
      });
    },
    async onFailure(failure) {
      const metadata = errorMetadata(failure.error);
      await write({
        schema_version: QLOO_EXECUTION_LOG_SCHEMA_VERSION,
        timestamp: now().toISOString(),
        event: "workflow_failed",
        operation: failure.operation,
        transport: failure.transport.kind,
        correlation_id: failure.correlationId,
        duration_ms: failure.durationMs,
        ...metadata.errorCode ? { error_code: metadata.errorCode } : {},
        ...metadata.retryable === void 0 ? {} : { retryable: metadata.retryable }
      });
    }
  };
}
export {
  QLOO_EXECUTION_LOG_SCHEMA_VERSION,
  createFileExecutionObserver
};
