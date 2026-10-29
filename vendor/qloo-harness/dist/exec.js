import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QLOO_WORKFLOW_OPERATION_IDS,
  isQlooWorkflowOperationId
} from "./chunks/chunk-MCLV3P4I.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/exec.js
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createDirectQlooWorkflowExecutorFromEnvironment } from "./qloo-tools.js";
import { QlooWorkflowExecutionError } from "./workflow-executor.js";
var QLOO_EXEC_EVENT_SCHEMA_VERSION = "1.0";
var QLOO_EXEC_MAX_INPUT_BYTES = 1048576;
var QLOO_EXEC_HELP = `Execute one validated Qloo workflow without a model or TUI

Usage:
  qloo exec <operation> --input '<json>'
  qloo exec <operation> --input-file <path>
  printf '<json>' | qloo exec <operation>
  qloo exec <operation> --input '<json>' --jsonl

Operations:
  ${QLOO_WORKFLOW_OPERATION_IDS.join(", ")}

Output:
  The default is one normalized JSON result on stdout.
  --jsonl emits versioned started and completed/failed events.

The execution transport is the direct Qloo API. No CLI or MCP fallback occurs.`;
var QlooExecUsageError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "QlooExecUsageError";
  }
};
function optionValue(argv, index, name) {
  const argument = argv[index];
  if (argument === name) {
    const value = argv[index + 1];
    if (value === void 0)
      throw new QlooExecUsageError(`${name} requires a value`);
    return { value, consumed: 2 };
  }
  const prefix = `${name}=`;
  return argument?.startsWith(prefix) ? { value: argument.slice(prefix.length), consumed: 1 } : void 0;
}
function parseExecArguments(argv) {
  const operation = argv[0];
  if (!operation || !isQlooWorkflowOperationId(operation)) {
    throw new QlooExecUsageError(operation ? `unknown workflow operation "${operation}"` : "a workflow operation is required");
  }
  let inlineInput;
  let inputFile;
  let jsonl = false;
  for (let index = 1; index < argv.length; ) {
    const argument = argv[index];
    const inputOption = optionValue(argv, index, "--input");
    if (inputOption) {
      if (inlineInput !== void 0)
        throw new QlooExecUsageError("--input may only be specified once");
      inlineInput = inputOption.value;
      index += inputOption.consumed;
      continue;
    }
    const fileOption = optionValue(argv, index, "--input-file");
    if (fileOption) {
      if (inputFile !== void 0)
        throw new QlooExecUsageError("--input-file may only be specified once");
      inputFile = fileOption.value;
      index += fileOption.consumed;
      continue;
    }
    if (argument === "--jsonl") {
      if (jsonl)
        throw new QlooExecUsageError("--jsonl may only be specified once");
      jsonl = true;
      index += 1;
      continue;
    }
    throw new QlooExecUsageError(`unknown option "${argument ?? ""}"`);
  }
  if (inlineInput !== void 0 && inputFile !== void 0) {
    throw new QlooExecUsageError("choose exactly one of --input or --input-file");
  }
  return {
    operation,
    ...inlineInput === void 0 ? {} : { inlineInput },
    ...inputFile === void 0 ? {} : { inputFile },
    jsonl
  };
}
async function readBoundedInputFile(path, maximumBytes) {
  const metadata = await stat(path);
  if (!metadata.isFile())
    throw new QlooExecUsageError(`input path is not a regular file: ${path}`);
  if (metadata.size > maximumBytes) {
    throw new QlooExecUsageError(`input exceeds the ${maximumBytes}-byte limit`);
  }
  const value = await readFile(path, "utf8");
  if (Buffer.byteLength(value) > maximumBytes) {
    throw new QlooExecUsageError(`input exceeds the ${maximumBytes}-byte limit`);
  }
  return value;
}
async function readBoundedStdin(stream, maximumBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
    };
    const onData = (chunk) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += value.length;
      if (size > maximumBytes) {
        cleanup();
        stream.pause();
        reject(new QlooExecUsageError(`input exceeds the ${maximumBytes}-byte limit`));
        return;
      }
      chunks.push(value);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}
function parseInputObject(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new QlooExecUsageError("workflow input must be valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new QlooExecUsageError("workflow input must be one JSON object");
  }
  return parsed;
}
function failureExitCode(error) {
  if (error.code === "TOOL_INPUT")
    return 2;
  if (error.code === "QLOO_AUTH")
    return 4;
  if (error.code === "CANCELLED")
    return 130;
  return 1;
}
function writeJsonLine(writeOut, value) {
  writeOut(`${JSON.stringify(value)}
`);
}
function failedEvent(operation, correlationId, sequence, error) {
  return {
    schema_version: QLOO_EXEC_EVENT_SCHEMA_VERSION,
    event: "failed",
    sequence,
    operation,
    correlation_id: correlationId,
    error: {
      code: error.code,
      layer: error.layer,
      retryable: error.retryable,
      recovery: error.recovery
    }
  };
}
async function runQlooExec(argv, options = {}) {
  const writeOut = options.writeOut ?? ((text) => process.stdout.write(text));
  const writeError = options.writeError ?? ((text) => process.stderr.write(text));
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    writeOut(`${QLOO_EXEC_HELP}
`);
    return 0;
  }
  let parsed;
  try {
    parsed = parseExecArguments(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`qloo exec: ${message}

${QLOO_EXEC_HELP}
`);
    return 2;
  }
  const maximumInputBytes = options.maximumInputBytes ?? QLOO_EXEC_MAX_INPUT_BYTES;
  let serializedInput;
  try {
    if (parsed.inlineInput !== void 0)
      serializedInput = parsed.inlineInput;
    else if (parsed.inputFile !== void 0) {
      serializedInput = await (options.readInputFile ?? readBoundedInputFile)(parsed.inputFile, maximumInputBytes);
    } else {
      if (options.stdinIsTTY ?? process.stdin.isTTY === true) {
        throw new QlooExecUsageError("provide --input, --input-file, or pipe one JSON object on stdin");
      }
      serializedInput = await readBoundedStdin(options.stdin ?? process.stdin, maximumInputBytes);
    }
    if (Buffer.byteLength(serializedInput) > maximumInputBytes) {
      throw new QlooExecUsageError(`input exceeds the ${maximumInputBytes}-byte limit`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`qloo exec: unable to read workflow input: ${message}
`);
    return 2;
  }
  let input;
  try {
    input = parseInputObject(serializedInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`qloo exec: ${message}
`);
    return 2;
  }
  const correlationId = (options.createCorrelationId ?? (() => `exec-${randomUUID()}`))();
  const executor = (options.createExecutor ?? (() => createDirectQlooWorkflowExecutorFromEnvironment({
    ...options.env ? { env: options.env } : {}
  })))();
  if (!executor) {
    const failure = failedEvent(parsed.operation, correlationId, 1, {
      code: "QLOO_AUTH",
      layer: "qloo",
      retryable: false,
      recovery: "Set QLOO_API_KEY or run qloo config set api-key, then retry the same operation."
    });
    if (parsed.jsonl)
      writeJsonLine(writeOut, failure);
    else
      writeJsonLine(writeOut, { error: failure.error, operation: failure.operation, correlation_id: correlationId });
    return 4;
  }
  if (parsed.jsonl) {
    writeJsonLine(writeOut, {
      schema_version: QLOO_EXEC_EVENT_SCHEMA_VERSION,
      event: "started",
      sequence: 1,
      operation: parsed.operation,
      correlation_id: correlationId,
      transport: "direct"
    });
  }
  try {
    const execution = await executor.execute(parsed.operation, input, {
      correlationId,
      ...options.signal ? { signal: options.signal } : {}
    });
    if (parsed.jsonl) {
      writeJsonLine(writeOut, {
        schema_version: QLOO_EXEC_EVENT_SCHEMA_VERSION,
        event: "completed",
        sequence: 2,
        operation: parsed.operation,
        correlation_id: execution.correlationId,
        duration_ms: execution.durationMs,
        result: execution.result
      });
    } else {
      writeJsonLine(writeOut, execution.result);
    }
    return 0;
  } catch (error) {
    const wrapped = error instanceof QlooWorkflowExecutionError ? error : new QlooWorkflowExecutionError(parsed.operation, executor.transport, "Qloo exec failed inside the harness.", error, { correlationId });
    const failure = failedEvent(parsed.operation, correlationId, parsed.jsonl ? 2 : 1, wrapped);
    writeJsonLine(writeOut, parsed.jsonl ? failure : { error: failure.error, operation: failure.operation, correlation_id: correlationId });
    return failureExitCode(wrapped);
  }
}
export {
  QLOO_EXEC_EVENT_SCHEMA_VERSION,
  QLOO_EXEC_HELP,
  QLOO_EXEC_MAX_INPUT_BYTES,
  runQlooExec
};
