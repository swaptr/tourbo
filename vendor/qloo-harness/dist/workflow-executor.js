import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QlooClientError
} from "./chunks/chunk-ESNY4EJL.js";
import {
  QLOO_TOOL_RESULT_SCHEMA_VERSION,
  createQlooQueryIntent,
  validateQlooWorkflowInput,
  validateQlooWorkflowResult
} from "./chunks/chunk-MCLV3P4I.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/workflow-executor.js
import { QlooResolutionProviderError } from "./resolution-provider.js";
var QlooWorkflowExecutionError = class extends Error {
  operation;
  transport;
  code;
  layer;
  retryable;
  expected;
  recovery;
  correlationId;
  durationMs;
  constructor(operation, transport, message, cause, metadata = {}) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "QlooWorkflowExecutionError";
    this.operation = operation;
    this.transport = transport;
    this.code = metadata.code ?? "HARNESS_INTERNAL";
    this.layer = metadata.layer ?? "harness";
    this.retryable = metadata.retryable ?? false;
    this.expected = metadata.expected ?? false;
    this.recovery = metadata.recovery ?? "Run qloo doctor and inspect the local workflow trace before retrying.";
    if (metadata.correlationId)
      this.correlationId = metadata.correlationId;
    if (metadata.durationMs !== void 0)
      this.durationMs = metadata.durationMs;
  }
};
function qlooClientErrorInChain(error) {
  const seen = /* @__PURE__ */ new Set();
  let current = error;
  for (let depth = 0; depth < 8 && current !== void 0 && !seen.has(current); depth += 1) {
    if (current instanceof QlooClientError)
      return current;
    seen.add(current);
    current = current !== null && typeof current === "object" ? Reflect.get(current, "cause") : void 0;
  }
  return void 0;
}
function resolutionProviderErrorInChain(error) {
  const seen = /* @__PURE__ */ new Set();
  let current = error;
  for (let depth = 0; depth < 8 && current !== void 0 && !seen.has(current); depth += 1) {
    if (current instanceof QlooResolutionProviderError)
      return current;
    seen.add(current);
    current = current !== null && typeof current === "object" ? Reflect.get(current, "cause") : void 0;
  }
  return void 0;
}
function classifyExecutionFailure(error) {
  const resolverError = resolutionProviderErrorInChain(error);
  if (resolverError) {
    if (resolverError.code === "RESOLVER_ABORTED") {
      return {
        code: "CANCELLED",
        layer: "resolver",
        retryable: false,
        expected: true,
        recovery: resolverError.recovery
      };
    }
    const code = resolverError.code === "RESOLVER_AUTH" ? "RESOLVER_AUTH" : resolverError.code === "RESOLVER_CONNECT" ? "RESOLVER_CONNECT" : resolverError.code === "RESOLVER_TIMEOUT" ? "RESOLVER_TIMEOUT" : resolverError.code === "RESOLVER_UPSTREAM" ? "RESOLVER_UPSTREAM" : "RESOLVER_CONTRACT";
    return {
      code,
      layer: "resolver",
      retryable: resolverError.retryable,
      expected: true,
      recovery: resolverError.recovery
    };
  }
  const clientError = qlooClientErrorInChain(error);
  if (clientError) {
    if (clientError.code === "QLOO_ABORTED") {
      return {
        code: "CANCELLED",
        layer: "qloo",
        retryable: false,
        expected: true,
        recovery: "Retry only if the Qloo request was cancelled unintentionally."
      };
    }
    if (clientError.code === "QLOO_DNS_ERROR") {
      return {
        code: "QLOO_DNS",
        layer: "qloo",
        retryable: true,
        expected: true,
        recovery: "Run qloo doctor --network and verify the VPN-provided DNS route."
      };
    }
    if (clientError.code === "QLOO_TIMEOUT") {
      return {
        code: "QLOO_TIMEOUT",
        layer: "qloo",
        retryable: true,
        expected: true,
        recovery: "Run qloo doctor --network; retry after confirming VPN routing and service reachability."
      };
    }
    if (clientError.code === "QLOO_TLS_ERROR") {
      return {
        code: "QLOO_TLS",
        layer: "qloo",
        retryable: false,
        expected: true,
        recovery: "Run qloo doctor --network and correct the local trust or proxy configuration before retrying."
      };
    }
    if (clientError.code === "QLOO_HTTP_ERROR") {
      const status = clientError.status;
      if (status === 401 || status === 403) {
        return {
          code: "QLOO_AUTH",
          layer: "qloo",
          retryable: false,
          expected: true,
          recovery: "Run qloo doctor and configure a valid Qloo API credential before retrying."
        };
      }
      if (status === 429) {
        return {
          code: "QLOO_RATE_LIMIT",
          layer: "qloo",
          retryable: true,
          expected: true,
          recovery: "Wait for the Qloo rate-limit window, then retry the same interpreted request once."
        };
      }
      return status !== void 0 && status >= 500 ? {
        code: "QLOO_UPSTREAM",
        layer: "qloo",
        retryable: true,
        expected: true,
        recovery: "Retry once after the Qloo service recovers; use qloo doctor --network if it persists."
      } : {
        code: "QLOO_CONTRACT",
        layer: "qloo",
        retryable: false,
        expected: true,
        recovery: "Inspect qloo_capabilities and the linked Qloo documentation before changing the request."
      };
    }
    if (clientError.code === "QLOO_CONFIGURATION_ERROR" || clientError.code === "QLOO_RESPONSE_ERROR" || clientError.code === "QLOO_RESPONSE_TOO_LARGE") {
      return {
        code: "QLOO_CONTRACT",
        layer: "qloo",
        retryable: false,
        expected: true,
        recovery: "Inspect qloo_capabilities, endpoint trust, and the current Qloo contract before retrying."
      };
    }
    return {
      code: "QLOO_CONNECT",
      layer: "qloo",
      retryable: clientError.retryable,
      expected: true,
      recovery: "Run qloo doctor --network and verify VPN, proxy, routing, and firewall configuration."
    };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      code: "CANCELLED",
      layer: "transport",
      retryable: false,
      expected: true,
      recovery: "Retry only if the operation was cancelled unintentionally."
    };
  }
  return {
    code: "HARNESS_INTERNAL",
    layer: "harness",
    retryable: false,
    expected: false,
    recovery: "Run qloo doctor and inspect the local workflow trace before retrying."
  };
}
var correlationCounter = 0;
function defaultCorrelationId() {
  correlationCounter = (correlationCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `qloo-${Date.now().toString(36)}-${correlationCounter.toString(36)}`;
}
function normalizeResult(operation, input, value, transport, correlationId, durationMs) {
  const provenance = value.provenance !== null && typeof value.provenance === "object" && !Array.isArray(value.provenance) ? value.provenance : void 0;
  return {
    ...value,
    schema_version: QLOO_TOOL_RESULT_SCHEMA_VERSION,
    operation,
    query_intent: createQlooQueryIntent(operation, input),
    ...provenance ? { provenance: { ...provenance, transport: transport.kind } } : {},
    execution: {
      transport: transport.kind,
      transport_name: transport.name,
      correlation_id: correlationId,
      duration_ms: durationMs
    }
  };
}
function createDelegatingQlooWorkflowExecutor(options) {
  const now = options.now ?? Date.now;
  const createCorrelationId = options.createCorrelationId ?? defaultCorrelationId;
  return {
    transport: options.transport,
    ...options.resolution ? { resolution: options.resolution } : {},
    async execute(operation, input, context = {}) {
      const correlationId = context.correlationId?.trim() || createCorrelationId();
      const startedAt = now();
      const validation = validateQlooWorkflowInput(operation, input);
      if (!validation.ok) {
        const issueSummary = validation.issues.map(({ path, message }) => `${path}: ${message}`).join("; ");
        const wrapped = new QlooWorkflowExecutionError(operation, options.transport, `Invalid ${operation} input: ${issueSummary}`, void 0, {
          code: "TOOL_INPUT",
          layer: "tool_input",
          expected: true,
          recovery: "Correct the reported tool arguments and submit the operation once more.",
          correlationId,
          durationMs: Math.max(0, Math.round(now() - startedAt))
        });
        await Promise.resolve(options.observer?.onFailure?.({
          operation,
          transport: options.transport,
          correlationId,
          durationMs: wrapped.durationMs ?? 0,
          error: wrapped
        })).catch(() => void 0);
        throw wrapped;
      }
      try {
        const value = await options.invoke(operation, validation.value, {
          ...context,
          correlationId
        });
        const durationMs = Math.max(0, Math.round(now() - startedAt));
        const result = normalizeResult(operation, validation.value, value, options.transport, correlationId, durationMs);
        const resultValidation = validateQlooWorkflowResult(result);
        if (!resultValidation.ok) {
          const issueSummary = resultValidation.issues.map(({ path, message }) => `${path}: ${message}`).join("; ");
          throw new Error(`Executor produced an invalid ${operation} result: ${issueSummary}`);
        }
        const execution = {
          operation,
          transport: options.transport,
          correlationId,
          durationMs,
          result
        };
        await Promise.resolve(options.observer?.onExecution?.(execution)).catch(() => void 0);
        return execution;
      } catch (error) {
        const durationMs = Math.max(0, Math.round(now() - startedAt));
        const message = error instanceof Error ? error.message : String(error);
        const classification = error instanceof QlooWorkflowExecutionError ? {
          code: error.code,
          layer: error.layer,
          retryable: error.retryable,
          expected: error.expected,
          recovery: error.recovery
        } : classifyExecutionFailure(error);
        const wrapped = new QlooWorkflowExecutionError(operation, options.transport, `${options.transport.name} could not execute qloo_${operation}: ${message}`, error, { ...classification, correlationId, durationMs });
        await Promise.resolve(options.observer?.onFailure?.({
          operation,
          transport: options.transport,
          correlationId,
          durationMs,
          error: wrapped
        })).catch(() => void 0);
        throw wrapped;
      }
    }
  };
}
function createCliQlooWorkflowExecutor(invoke) {
  return createDelegatingQlooWorkflowExecutor({
    transport: { kind: "cli", name: "embedded Qloo CLI" },
    invoke
  });
}
function createMcpQlooWorkflowExecutor(invoke, name = "Qloo MCP server") {
  return createDelegatingQlooWorkflowExecutor({
    transport: { kind: "mcp", name, remote: true },
    invoke
  });
}
export {
  QlooWorkflowExecutionError,
  createCliQlooWorkflowExecutor,
  createDelegatingQlooWorkflowExecutor,
  createMcpQlooWorkflowExecutor
};
