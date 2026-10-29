import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/artifact-tool.js
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, parse } from "node:path";
import { Type } from "typebox";
var QLOO_CREATE_ARTIFACT_TOOL_NAME = "qloo_create_artifact";
var QLOO_ARTIFACT_SCHEMA_VERSION = "1.0";
var QLOO_ARTIFACT_MAX_BYTES = 1024 * 1024;
var QLOO_ARTIFACT_MEDIA_TYPES = [
  "text/html",
  "image/svg+xml",
  "text/csv",
  "application/json",
  "text/markdown"
];
var artifactParameters = Type.Object({
  filename: Type.String({
    minLength: 3,
    maxLength: 120,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$"
  }),
  media_type: Type.Union([
    Type.Literal("text/html"),
    Type.Literal("image/svg+xml"),
    Type.Literal("text/csv"),
    Type.Literal("application/json"),
    Type.Literal("text/markdown")
  ]),
  content: Type.String({ minLength: 1, maxLength: QLOO_ARTIFACT_MAX_BYTES }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  source_correlation_ids: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 16 }))
}, { additionalProperties: false });
var expectedExtensions = {
  "text/html": ".html",
  "image/svg+xml": ".svg",
  "text/csv": ".csv",
  "application/json": ".json",
  "text/markdown": ".md"
};
function validateFilename(filename, mediaType) {
  if (filename !== basename(filename) || filename.includes("\\") || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/u.test(filename)) {
    throw new Error("Artifact filename must be a simple 3-120 character name without directories.");
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(parse(filename).name)) {
    throw new Error("Artifact filename is reserved by a supported operating system.");
  }
  const expected = expectedExtensions[mediaType];
  if (extname(filename).toLowerCase() !== expected) {
    throw new Error(`Artifact media type ${mediaType} requires a ${expected} filename.`);
  }
}
function clipLine(value, width) {
  const maximum = Math.max(1, Math.trunc(width));
  const characters = [...value];
  if (characters.length <= maximum)
    return value;
  if (maximum === 1)
    return "\u2026";
  return `${characters.slice(0, maximum - 1).join("")}\u2026`;
}
function networkScanText(content) {
  return content.replaceAll("http://www.w3.org/2000/svg", "").replaceAll("https://www.w3.org/2000/svg", "").replaceAll("http://www.w3.org/1999/xlink", "").replaceAll("https://www.w3.org/1999/xlink", "");
}
function rejectExternalActivity(content, format) {
  const scan = networkScanText(content);
  if (/(?:https?|wss?|file):\/\//iu.test(scan) || /(?:src|href|action|poster)\s*=\s*["']?\s*\/\//iu.test(scan)) {
    throw new Error(`${format} artifacts must be self-contained and cannot reference external URLs.`);
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|navigator\s*\.\s*sendBeacon/iu.test(scan)) {
    throw new Error(`${format} artifacts cannot make network requests.`);
  }
}
function hardenHtml(content) {
  if (!/<html(?:\s|>)/iu.test(content) || !/<head(?:\s|>)/iu.test(content)) {
    throw new Error("HTML artifacts must be complete documents with html and head elements.");
  }
  if (/<\s*(?:iframe|object|embed|base|form)\b/iu.test(content)) {
    throw new Error("HTML artifacts cannot contain iframe, object, embed, base, or form elements.");
  }
  if (/<script\b[^>]*\bsrc\s*=/iu.test(content)) {
    throw new Error("HTML artifacts may use inline scripts but cannot load external scripts.");
  }
  rejectExternalActivity(content, "HTML");
  const policy = [
    "default-src 'none'",
    "img-src data: blob:",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
    "font-src data:",
    "connect-src 'none'",
    "media-src data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "navigate-to 'none'"
  ].join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return content.replace(/<head([^>]*)>/iu, `<head$1>
${meta}`);
}
function validateSvg(content) {
  if (!/<svg(?:\s|>)/iu.test(content)) {
    throw new Error("SVG artifacts must contain an svg root element.");
  }
  if (/<\s*(?:script|foreignObject|iframe|object|embed)\b/iu.test(content)) {
    throw new Error("SVG artifacts must be passive and cannot contain scripts or embedded documents.");
  }
  if (/\son[a-z]+\s*=/iu.test(content)) {
    throw new Error("SVG artifacts cannot contain event-handler attributes.");
  }
  if (/url\(\s*["']?(?!#)/iu.test(content)) {
    throw new Error("SVG artifacts may reference only in-document fragment URLs.");
  }
  rejectExternalActivity(content, "SVG");
  return content;
}
function validateCsv(content) {
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const validateCell = () => {
    const value = cell.replace(/^\uFEFF/u, "").trimStart();
    if (/^[=+@]/u.test(value) || /^-/u.test(value) && !/^-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/iu.test(value.trimEnd())) {
      throw new Error("CSV artifact contains a spreadsheet-formula cell.");
    }
    cell = "";
    closedQuote = false;
  };
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (closedQuote && character !== "," && character !== "\n" && character !== "\r") {
      if (character === " " || character === "	")
        continue;
      throw new Error("CSV artifact contains text after a closing quote.");
    }
    if (character === '"') {
      if (cell.length > 0)
        throw new Error("CSV artifact contains an unexpected quote.");
      quoted = true;
    } else if (character === "," || character === "\n") {
      validateCell();
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (quoted)
    throw new Error("CSV artifact contains an unterminated quoted cell.");
  validateCell();
  return content;
}
function validateMarkdown(content) {
  if (/<\s*(?:script|iframe|object|embed|form|link|style)\b|\son[a-z]+\s*=/iu.test(content)) {
    throw new Error("Markdown artifacts cannot contain active embedded HTML.");
  }
  if (/!\[[^\]]*\]\(\s*(?:https?:|\/\/|file:)/iu.test(content) || /<(?:img|video|audio|source)\b[^>]*\b(?:src|poster)\s*=\s*["']?\s*(?:https?:|\/\/|file:)/iu.test(content)) {
    throw new Error("Markdown artifacts cannot load external media.");
  }
  return content;
}
function validateAndHardenContent(content, mediaType) {
  if (/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) {
    throw new Error("Artifact content contains an unsafe control character.");
  }
  switch (mediaType) {
    case "text/html":
      return hardenHtml(content);
    case "image/svg+xml":
      return validateSvg(content);
    case "application/json":
      try {
        JSON.parse(content);
      } catch {
        throw new Error("JSON artifact content must be valid JSON.");
      }
      return content;
    case "text/csv":
      return validateCsv(content);
    case "text/markdown":
      return validateMarkdown(content);
  }
}
function sessionDirectoryName(sessionId) {
  const label = sessionId.replace(/[^A-Za-z0-9._-]+/gu, "-").slice(0, 48) || "session";
  const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
  return `${label}-${digest}`;
}
async function requirePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 448 });
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Qloo artifact storage is not a regular private directory.");
  }
  if (process.platform !== "win32")
    await chmod(path, 448);
}
async function writeWithoutOverwrite(directory, requestedFilename, content) {
  const parsed = parse(requestedFilename);
  for (let counter = 1; counter <= 100; counter += 1) {
    const filename = counter === 1 ? requestedFilename : `${parsed.name}-${counter}${parsed.ext}`;
    const path = join(directory, filename);
    try {
      await writeFile(path, content, { encoding: "utf8", flag: "wx", mode: 384 });
      return { filename, path };
    } catch (error) {
      if (error.code !== "EEXIST")
        throw error;
    }
  }
  throw new Error(`Qloo could not allocate a unique artifact name for ${requestedFilename}.`);
}
function isQlooArtifactDetails(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const record = value;
  return record.schema_version === QLOO_ARTIFACT_SCHEMA_VERSION && record.status === "created" && typeof record.filename === "string" && record.filename.length <= 120 && (record.title === void 0 || typeof record.title === "string" && record.title.length <= 200) && typeof record.media_type === "string" && QLOO_ARTIFACT_MEDIA_TYPES.includes(record.media_type) && typeof record.path === "string" && record.path.length <= 4096 && typeof record.relative_path === "string" && record.relative_path.length <= 256 && Number.isSafeInteger(record.size_bytes) && record.size_bytes > 0 && record.size_bytes <= QLOO_ARTIFACT_MAX_BYTES && typeof record.sha256 === "string" && /^[a-f0-9]{64}$/u.test(record.sha256) && typeof record.active_content === "boolean" && Array.isArray(record.source_correlation_ids) && record.source_correlation_ids.length <= 16 && record.source_correlation_ids.every((id) => typeof id === "string" && id.length <= 200);
}
function createQlooArtifactTool(options) {
  return {
    name: QLOO_CREATE_ARTIFACT_TOOL_NAME,
    label: "Create Qloo artifact",
    description: "Save a self-contained HTML, passive SVG, CSV, JSON, or Markdown artifact under Qloo's private per-session storage. Use this instead of printing a complete file in chat. It never writes to the project workspace.",
    promptSnippet: "Create a private self-contained file from Qloo results",
    promptGuidelines: [
      "Use qloo_create_artifact when the user asks for a file or when an active Qloo Journey reaches its artifact milestone.",
      "Do not print the full file after it is saved; return its exact path and a short explanation.",
      "Artifacts must be self-contained. HTML may use inline CSS and JavaScript but no network requests; SVG must be passive."
    ],
    parameters: artifactParameters,
    executionMode: "sequential",
    renderShell: "self",
    renderCall(params, theme) {
      const filename = typeof params.filename === "string" ? params.filename : "artifact";
      const mediaType = typeof params.media_type === "string" ? params.media_type : "pending format";
      const size = typeof params.content === "string" ? Buffer.byteLength(params.content) : 0;
      return {
        render(width) {
          return [
            theme.fg("accent", theme.bold(clipLine(`Qloo artifact \xB7 ${filename}`, width))),
            theme.fg("text", clipLine(`  ${mediaType} \xB7 ${size} bytes \xB7 content hidden`, width))
          ];
        },
        invalidate() {
        }
      };
    },
    renderResult(result, _renderOptions, theme) {
      const details = result.details;
      const valid = isQlooArtifactDetails(details);
      return {
        render(width) {
          if (!valid)
            return [theme.fg("error", clipLine("Qloo artifact \xB7 creation failed", width))];
          return [
            theme.fg("success", theme.bold(clipLine(`Created ${details.filename}`, width))),
            theme.fg("text", clipLine(`  ${details.path}`, width)),
            ...details.active_content ? [theme.fg("warning", clipLine("  Active local HTML \xB7 review before opening", width))] : []
          ];
        },
        invalidate() {
        }
      };
    },
    async execute(_toolCallId, params, signal, _onUpdate, context) {
      signal?.throwIfAborted();
      validateFilename(params.filename, params.media_type);
      if (params.title && params.title.length > 200) {
        throw new Error("Artifact title exceeds the 200-character limit.");
      }
      if (params.title && /[\u0000-\u001f\u007f-\u009f]/u.test(params.title)) {
        throw new Error("Artifact title contains an unsafe control character.");
      }
      if (params.source_correlation_ids && (params.source_correlation_ids.length > 16 || params.source_correlation_ids.some((id) => id.length > 200 || /[\u0000-\u001f\u007f-\u009f]/u.test(id)))) {
        throw new Error("Artifact provenance exceeds its limits or contains an unsafe control character.");
      }
      const hardenedContent = validateAndHardenContent(params.content, params.media_type);
      const sizeBytes = Buffer.byteLength(hardenedContent);
      if (sizeBytes > QLOO_ARTIFACT_MAX_BYTES) {
        throw new Error(`Artifact content exceeds the ${QLOO_ARTIFACT_MAX_BYTES}-byte limit.`);
      }
      const sessionName = sessionDirectoryName(context.sessionManager.getSessionId());
      await requirePrivateDirectory(options.artifactsDir);
      const directory = join(options.artifactsDir, sessionName);
      await requirePrivateDirectory(directory);
      signal?.throwIfAborted();
      const stored = await writeWithoutOverwrite(directory, params.filename, hardenedContent);
      const details = {
        schema_version: QLOO_ARTIFACT_SCHEMA_VERSION,
        status: "created",
        filename: stored.filename,
        ...params.title ? { title: params.title } : {},
        media_type: params.media_type,
        path: stored.path,
        relative_path: join(sessionName, stored.filename),
        size_bytes: sizeBytes,
        sha256: createHash("sha256").update(hardenedContent).digest("hex"),
        active_content: params.media_type === "text/html",
        source_correlation_ids: [...params.source_correlation_ids ?? []]
      };
      return {
        content: [{
          type: "text",
          text: [
            `Created ${details.filename} (${details.media_type}, ${details.size_bytes} bytes).`,
            `Saved privately: ${details.path}`,
            details.active_content ? "This HTML file contains active local content; review it before opening. External references and common network APIs were rejected, and a restrictive content-security policy was injected." : "The file is self-contained and did not modify the project workspace."
          ].join("\n")
        }],
        details
      };
    }
  };
}
export {
  QLOO_ARTIFACT_MAX_BYTES,
  QLOO_ARTIFACT_MEDIA_TYPES,
  QLOO_ARTIFACT_SCHEMA_VERSION,
  QLOO_CREATE_ARTIFACT_TOOL_NAME,
  createQlooArtifactTool,
  isQlooArtifactDetails
};
