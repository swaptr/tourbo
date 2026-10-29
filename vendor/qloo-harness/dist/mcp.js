import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QLOO_CAPABILITIES_TOOL_NAME,
  QLOO_TOOL_RESULT_SCHEMA_VERSION,
  getQlooAdapterContractManifest,
  validateQlooWorkflowResult
} from "./chunks/chunk-MCLV3P4I.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/mcp.js
import { createInterface } from "node:readline";
import { createQlooToolsFromEnvironment } from "./qloo-tools.js";
var QLOO_MCP_CONTRACT_RESOURCE_URI = "qloo://contracts/workflows";
var QLOO_MCP_HELP = `Start the canonical Qloo MCP stdio server

Usage:
  qloo mcp

The server exposes qloo_capabilities and the nine shared Qloo workflow tools.
Use qloo api mcp only when you explicitly need the legacy endpoint-shaped server.`;
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function adapterCapabilities(manifest, executableOperationIds, argumentsValue) {
  const argumentsRecord = isRecord(argumentsValue) ? argumentsValue : {};
  const knownIds = new Set(manifest.operations.map(({ id }) => id));
  const requestedValues = argumentsRecord.operation_ids;
  const requested = requestedValues === void 0 ? knownIds : new Set(Array.isArray(requestedValues) ? requestedValues.filter((value) => typeof value === "string") : []);
  if (requestedValues !== void 0 && !Array.isArray(requestedValues)) {
    throw new Error("operation_ids must be an array of canonical workflow operation IDs.");
  }
  const unknown = [...requested].filter((id) => !knownIds.has(id)).sort();
  if (unknown.length > 0) {
    throw new Error(`Unknown Qloo workflow operation IDs: ${unknown.join(", ")}`);
  }
  const supportedOperationIds = manifest.operations.map(({ id }) => id).filter((id) => executableOperationIds.has(id));
  return {
    ...manifest,
    adapter: {
      id: "qloo_harness_mcp",
      compatibility: "canonical",
      canonical_workflow_execution: supportedOperationIds.length === manifest.operations.length,
      ready: supportedOperationIds.length === manifest.operations.length,
      supported_operation_ids: supportedOperationIds,
      capabilities_tool: QLOO_CAPABILITIES_TOOL_NAME,
      contract_resource: QLOO_MCP_CONTRACT_RESOURCE_URI,
      tool_name_mapping: Object.fromEntries(manifest.operations.map(({ id, shared_tool_name }) => [id, shared_tool_name])),
      fallback: "none"
    },
    operations: manifest.operations.filter(({ id }) => requested.has(id))
  };
}
function capabilitiesOutputSchema() {
  return {
    type: "object",
    required: [
      "manifest_schema_version",
      "contract_version",
      "contract_checksum",
      "result_schema_version",
      "adapter",
      "operations"
    ],
    properties: {
      manifest_schema_version: { type: "string" },
      contract_version: { type: "string" },
      contract_checksum: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      result_schema_version: { type: "string" },
      adapter: { type: "object" },
      operations: { type: "array" }
    },
    additionalProperties: true
  };
}
function mcpToolDefinitions(manifest) {
  const contractMetadata = {
    "qloo/contractVersion": manifest.contract_version,
    "qloo/contractChecksum": manifest.contract_checksum
  };
  return [
    {
      name: QLOO_CAPABILITIES_TOOL_NAME,
      title: "Inspect Qloo MCP capabilities",
      description: "Inspect the canonical Qloo workflow contract, checksum, and this server's exact execution readiness without contacting Qloo.",
      inputSchema: {
        type: "object",
        properties: {
          operation_ids: {
            type: "array",
            items: {
              type: "string",
              enum: manifest.operations.map(({ id }) => id)
            },
            uniqueItems: true,
            maxItems: manifest.operations.length
          }
        },
        additionalProperties: false
      },
      outputSchema: capabilitiesOutputSchema(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: contractMetadata
    },
    ...manifest.operations.map((operation) => ({
      name: operation.shared_tool_name,
      title: operation.summary,
      description: operation.description,
      inputSchema: operation.input_schema,
      outputSchema: manifest.result_schema,
      annotations: {
        readOnlyHint: operation.behavior.readOnly,
        destructiveHint: operation.behavior.destructive,
        idempotentHint: operation.behavior.idempotent,
        openWorldHint: operation.behavior.openWorld
      },
      _meta: contractMetadata
    }))
  ];
}
function respond(writeOut, id, result) {
  const response = { jsonrpc: "2.0", id, result };
  writeOut(`${JSON.stringify(response)}
`);
}
function respondError(writeOut, id, code, message, data) {
  const response = {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...data === void 0 ? {} : { data } }
  };
  writeOut(`${JSON.stringify(response)}
`);
}
function toolResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    ...result.status === "error" ? { isError: true } : {}
  };
}
function canonicalMcpResult(result) {
  const execution = isRecord(result.execution) ? result.execution : {};
  const provenance = isRecord(result.provenance) ? result.provenance : void 0;
  const normalized = {
    ...result,
    execution: {
      ...execution,
      transport: "mcp",
      transport_name: "Qloo canonical MCP"
    },
    ...provenance ? { provenance: { ...provenance, transport: "mcp" } } : {}
  };
  const validation = validateQlooWorkflowResult(normalized);
  if (!validation.ok) {
    const issues = validation.issues.map(({ path, message }) => `${path}: ${message}`).join("; ");
    throw new Error(`Canonical MCP result failed the shared contract: ${issues}`);
  }
  return validation.value;
}
function unavailableResult(operation, correlationId) {
  return {
    schema_version: QLOO_TOOL_RESULT_SCHEMA_VERSION,
    operation,
    status: "error",
    summary: "Qloo workflow execution requires a configured Qloo API credential.",
    results: [],
    result_count: 0,
    error: {
      code: "QLOO_AUTH",
      layer: "qloo",
      retryable: false,
      recovery: "Run qloo setup or set QLOO_API_KEY, then restart the MCP server."
    },
    execution: {
      transport: "mcp",
      transport_name: "Qloo canonical MCP",
      correlation_id: correlationId,
      duration_ms: 0
    }
  };
}
function unexpectedFailureResult(operation, correlationId) {
  return {
    schema_version: QLOO_TOOL_RESULT_SCHEMA_VERSION,
    operation,
    status: "error",
    summary: "The Qloo MCP adapter failed before returning a workflow result.",
    results: [],
    result_count: 0,
    error: {
      code: "MCP_ADAPTER_FAILURE",
      layer: "harness",
      retryable: false,
      recovery: "Run qloo doctor --network and inspect the local redacted trace."
    },
    execution: {
      transport: "mcp",
      transport_name: "Qloo canonical MCP",
      correlation_id: correlationId,
      duration_ms: 0
    }
  };
}
function startCanonicalMcpServer(options = {}) {
  const manifest = getQlooAdapterContractManifest();
  const tools = options.tools ?? createQlooToolsFromEnvironment({ env: options.env ?? process.env });
  const executableTools = new Map(tools.filter((tool) => tool.name !== QLOO_CAPABILITIES_TOOL_NAME).map((tool) => [tool.name, tool]));
  const operationByToolName = new Map(manifest.operations.map((operation) => [operation.shared_tool_name, operation.id]));
  const executableOperationIds = new Set(manifest.operations.filter(({ shared_tool_name }) => executableTools.has(shared_tool_name)).map(({ id }) => id));
  const definitions = mcpToolDefinitions(manifest);
  const writeOut = options.writeOut ?? ((value) => process.stdout.write(value));
  const readline = createInterface({ input: options.input ?? process.stdin, terminal: false });
  readline.on("line", async (line) => {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      respondError(writeOut, null, -32700, "Parse error");
      return;
    }
    const id = request.id ?? null;
    try {
      switch (request.method) {
        case "initialize":
          respond(writeOut, id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, resources: {} },
            serverInfo: {
              name: "qloo-harness",
              version: options.serverVersion ?? "development"
            }
          });
          return;
        case "notifications/initialized":
        case "notifications/cancelled":
          return;
        case "ping":
          respond(writeOut, id, {});
          return;
        case "tools/list":
          respond(writeOut, id, { tools: definitions });
          return;
        case "resources/list":
          respond(writeOut, id, {
            resources: [{
              uri: QLOO_MCP_CONTRACT_RESOURCE_URI,
              name: "qloo_workflow_contract",
              title: "Qloo workflow contract",
              description: "Canonical Qloo workflow schemas and MCP adapter readiness.",
              mimeType: "application/json"
            }]
          });
          return;
        case "resources/read": {
          const uri = isRecord(request.params) ? request.params.uri : void 0;
          if (uri !== QLOO_MCP_CONTRACT_RESOURCE_URI) {
            respondError(writeOut, id, -32602, "Unknown Qloo MCP resource.");
            return;
          }
          const capabilities = adapterCapabilities(manifest, executableOperationIds, {});
          respond(writeOut, id, {
            contents: [{
              uri: QLOO_MCP_CONTRACT_RESOURCE_URI,
              mimeType: "application/json",
              text: JSON.stringify(capabilities)
            }]
          });
          return;
        }
        case "tools/call": {
          const toolName = isRecord(request.params) ? request.params.name : void 0;
          const argumentsValue = isRecord(request.params) ? request.params.arguments : void 0;
          if (typeof toolName !== "string") {
            respondError(writeOut, id, -32602, "tools/call requires a tool name.");
            return;
          }
          if (toolName === QLOO_CAPABILITIES_TOOL_NAME) {
            try {
              const result = adapterCapabilities(manifest, executableOperationIds, argumentsValue);
              respond(writeOut, id, toolResult(result));
            } catch (error) {
              respond(writeOut, id, {
                content: [{
                  type: "text",
                  text: error instanceof Error ? error.message : String(error)
                }],
                isError: true
              });
            }
            return;
          }
          const operation = operationByToolName.get(toolName);
          if (!operation) {
            respondError(writeOut, id, -32602, `Unknown Qloo MCP tool: ${toolName}`);
            return;
          }
          const correlationId = `mcp-${id === null ? "request" : String(id)}`;
          const tool = executableTools.get(toolName);
          if (!tool) {
            respond(writeOut, id, toolResult(unavailableResult(operation, correlationId)));
            return;
          }
          try {
            const result = await tool.execute(correlationId, isRecord(argumentsValue) ? argumentsValue : {}, void 0, void 0, {});
            if (!isRecord(result.details)) {
              throw new Error(`${toolName} returned no structured workflow result.`);
            }
            respond(writeOut, id, toolResult(canonicalMcpResult(result.details)));
          } catch {
            respond(writeOut, id, toolResult(unexpectedFailureResult(operation, correlationId)));
          }
          return;
        }
        default:
          respondError(writeOut, id, -32601, `Method not found: ${request.method}`);
      }
    } catch {
      respondError(writeOut, id, -32603, "Internal Qloo MCP adapter error.");
    }
  });
  return readline;
}
function runQlooMcp(argv, options = {}) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    (options.writeOut ?? ((value) => process.stdout.write(value)))(`${QLOO_MCP_HELP}
`);
    return 0;
  }
  if (argv.length > 0)
    return 2;
  startCanonicalMcpServer(options);
  return 0;
}
export {
  QLOO_MCP_CONTRACT_RESOURCE_URI,
  QLOO_MCP_HELP,
  runQlooMcp,
  startCanonicalMcpServer
};
