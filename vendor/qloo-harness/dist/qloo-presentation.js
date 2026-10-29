import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QLOO_WORKFLOW_CONTRACTS,
  QLOO_WORKFLOW_RESOLUTION_FIELDS,
  resolveQlooInsightsEntityType,
  resolveQlooSearchEntityType
} from "./chunks/chunk-MCLV3P4I.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/qloo-presentation.js
var OPERATION_LABELS = {
  recommend: "recommendations",
  rank: "ranking",
  describe: "entity details",
  where_popular: "geographic affinity",
  compare_audiences: "audience comparison",
  entity_tags: "entity tags",
  audience_demographics: "aggregate demographics",
  trends: "trends",
  find_tags: "tag search"
};
var SUPPORT_TEXT = {
  recommend: "Relative Qloo affinity for the interpreted taste profile; it does not establish causality or an individual preference.",
  rank: "Relative ordering of the supplied options for the interpreted signals, not a universal quality score.",
  compare_audiences: "Shared and differentiating aggregate affinities between the two supplied signal groups.",
  audience_demographics: "Aggregate audience distribution only; it must not be used to infer an individual's demographics.",
  where_popular: "Comparative geographic affinity within the requested area, not population size or visit counts.",
  trends: "Observed Qloo trend values over the requested period; later values do not imply a causal change."
};
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function safeText(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
}
function truncate(value, width) {
  const maximum = Math.max(1, Math.trunc(width));
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}\u2026`;
}
function scalarSummary(value) {
  if (typeof value === "string")
    return safeText(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => {
      const record2 = asRecord(item);
      return safeText(record2?.name ?? record2?.input ?? record2?.entityId ?? record2?.tagId ?? item);
    }).filter(Boolean).join(", ");
  }
  const record = asRecord(value);
  if (!record)
    return safeText(value);
  const preferred = record.name ?? record.input ?? record.resolved ?? record.entityId ?? record.tagId;
  if (preferred !== void 0)
    return safeText(preferred);
  return safeText(JSON.stringify(record));
}
function metricSummary(record) {
  const metrics = ["rank", "affinity", "score", "popularity", "population_rank"].flatMap((key) => typeof record[key] === "number" ? [`${key} ${record[key]}`] : []);
  return metrics.length > 0 ? ` \xB7 ${metrics.join(" \xB7 ")}` : "";
}
function readableUrnType(value) {
  const type = safeText(value).toLocaleLowerCase("en-US");
  if (!type)
    return "";
  if (type === "urn:tag")
    return "tag";
  if (type.startsWith("urn:entity:")) {
    return type.slice("urn:entity:".length).split(":").at(-1)?.replaceAll("_", " ") ?? "";
  }
  if (type.startsWith("urn:tag:")) {
    const category = type.slice("urn:tag:".length).split(":")[0]?.replaceAll("_", " ");
    return category ? `${category} tag` : "tag";
  }
  return type.split(":").at(-1)?.replaceAll("_", " ") ?? type;
}
function addressSummary(value) {
  if (typeof value === "string")
    return safeText(value);
  const record = asRecord(value);
  if (!record)
    return "";
  const formatted = safeText(record.formatted ?? record.formatted_address ?? record.display_name ?? record.name);
  if (formatted)
    return formatted;
  return [...new Set([
    record.city,
    record.locality,
    record.region,
    record.state,
    record.country
  ].map(safeText).filter(Boolean))].join(", ");
}
function compactCandidateId(value) {
  const id = safeText(value);
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id))
    return id.slice(0, 8);
  const tail = id.split(/[:/]/u).filter(Boolean).at(-1) ?? id;
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${truncate(tail, 18)}-${(hash >>> 0).toString(16).padStart(8, "0").slice(0, 4)}`;
}
function candidateBaseLabel(candidate) {
  const name = safeText(candidate.name ?? candidate.id) || "Unnamed Qloo match";
  const type = readableUrnType(candidate.type);
  const parentTypes = asArray(candidate.parent_types).map(readableUrnType).filter(Boolean);
  const scope = parentTypes.length > 0 ? `for ${[...new Set(parentTypes)].join(", ")}` : "";
  const releaseYear = typeof candidate.release_year === "number" ? `released ${candidate.release_year}` : "";
  const location = addressSummary(candidate.address);
  const description = truncate(safeText(candidate.description), 96);
  const rank = Number.isSafeInteger(candidate.rank) ? `rank ${candidate.rank}` : "";
  const score = typeof candidate.score === "number" && Number.isFinite(candidate.score) ? `match ${candidate.score}` : "";
  const discriminators = [type, scope, releaseYear, location, description, rank, score].filter(Boolean);
  return {
    label: [name, ...discriminators].join(" \xB7 "),
    hasDiscriminator: discriminators.length > 0
  };
}
function formatQlooResolutionCandidateLabels(candidates) {
  const maximumLabelLength = 180;
  const prepared = candidates.map((candidate) => {
    const base = candidateBaseLabel(candidate);
    return {
      candidate,
      ...base,
      visibleLabel: truncate(base.label, maximumLabelLength)
    };
  });
  const labelCounts = /* @__PURE__ */ new Map();
  for (const { visibleLabel } of prepared) {
    const key = visibleLabel.toLocaleLowerCase("en-US");
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }
  return prepared.map(({ candidate, hasDiscriminator, visibleLabel }) => {
    const duplicate = (labelCounts.get(visibleLabel.toLocaleLowerCase("en-US")) ?? 0) > 1;
    if (hasDiscriminator && !duplicate)
      return visibleLabel;
    const identity = `ID ${compactCandidateId(candidate.id)}`;
    return `${truncate(visibleLabel, maximumLabelLength - identity.length - 3)} \xB7 ${identity}`;
  });
}
function resultSummary(value, index) {
  const record = asRecord(value);
  if (!record)
    return `${index + 1}. ${scalarSummary(value)}`;
  const properties = asRecord(record.properties);
  const label = safeText(record.name ?? record.resolved ?? record.date ?? record.id ?? record.entity_id ?? record.tag_id ?? `Result ${index + 1}`);
  const location = safeText(properties?.address ?? record.address);
  return `${index + 1}. ${label}${metricSummary(record)}${location ? ` \xB7 ${location}` : ""}`;
}
function operationFromDetails(details) {
  const operation = details.operation;
  return typeof operation === "string" && Object.hasOwn(OPERATION_LABELS, operation) ? operation : void 0;
}
function interpretationLines(details) {
  const interpretation = asRecord(details.interpretation) ?? asRecord(details.query_intent);
  if (!interpretation)
    return [];
  return Object.entries(interpretation).filter(([, value]) => value !== void 0 && value !== null && scalarSummary(value)).slice(0, 10).map(([key, value]) => `  ${key.replaceAll("_", " ")}: ${scalarSummary(value)}`);
}
function ambiguityLines(details, maximum) {
  const resolution = asRecord(details.resolution);
  const issues = asArray(resolution?.issues).map(asRecord).filter((issue) => issue !== void 0);
  return issues.flatMap((issue) => {
    const input = safeText(issue.input);
    const candidates = asArray(issue.candidates).map(asRecord).filter((candidate) => candidate !== void 0).slice(0, maximum);
    const labels = formatQlooResolutionCandidateLabels(candidates).map((label, index) => `  ${index + 1}. ${label}`);
    return [`  ${input || "Unresolved input"}`, ...labels];
  });
}
function sourceLine(details) {
  const provenance = asRecord(details.provenance);
  const execution = asRecord(details.execution);
  const values = [
    provenance?.source,
    provenance?.endpoint,
    execution?.transport,
    provenance?.documentation
  ].map(safeText).filter(Boolean);
  return values.length > 0 ? `  ${values.join(" \xB7 ")}` : void 0;
}
function renderQlooCallLines(toolName, input, width) {
  const operation = toolName.startsWith("qloo_") ? toolName.slice("qloo_".length) : void 0;
  const label = operation && OPERATION_LABELS[operation] ? OPERATION_LABELS[operation] : toolName;
  const focus = Object.entries(input).filter(([, value]) => value !== void 0).slice(0, 4).map(([key, value]) => `${key.replaceAll("_", " ")}=${scalarSummary(value)}`).join(" \xB7 ");
  return [
    truncate(`Qloo \xB7 ${label}`, width),
    ...focus ? [truncate(`  Interpreting ${focus}`, width)] : []
  ];
}
function renderQlooResultLines(detailsValue, options = {}) {
  const details = asRecord(detailsValue) ?? {};
  const width = options.width ?? 100;
  const expanded = options.expanded ?? false;
  const operation = operationFromDetails(details);
  const status = safeText(details.status) || "unknown";
  const resultLimit = expanded ? 10 : 5;
  const results = asArray(details.results);
  const warnings = asArray(details.warnings).filter((value) => typeof value === "string");
  const lines = [
    `Qloo ${operation ? OPERATION_LABELS[operation] : "result"} \xB7 ${status}`
  ];
  const interpreted = interpretationLines(details);
  if (interpreted.length > 0)
    lines.push("Interpreted as", ...interpreted);
  if (status === "running") {
    const progress = asRecord(details.progress);
    const elapsedMs = Number(progress?.elapsed_ms);
    const elapsed = Number.isFinite(elapsedMs) && elapsedMs >= 1e3 ? ` (${Math.floor(elapsedMs / 1e3)}s elapsed)` : "";
    lines.push("Progress", `  ${safeText(details.summary) || "Resolving inputs and querying Qloo."}${elapsed}`);
  } else if (status === "needs_input") {
    lines.push("Choose a Qloo match", ...ambiguityLines(details, resultLimit));
  } else if (status === "error") {
    const error = asRecord(details.error);
    lines.push("Qloo result", `  ${safeText(details.summary) || "The workflow did not complete."}`, ...error?.recovery ? [`  Next: ${safeText(error.recovery)}`] : []);
  } else {
    lines.push(`Qloo result${results.length > 0 ? ` (${safeText(details.result_count ?? results.length)})` : ""}`);
    if (results.length === 0)
      lines.push("  No matching results were returned.");
    else
      lines.push(...results.slice(0, resultLimit).map(resultSummary));
    if (results.length > resultLimit) {
      lines.push(`  \u2026 ${results.length - resultLimit} more; use /raw next for detail`);
    }
  }
  const support = status === "running" ? void 0 : operation ? SUPPORT_TEXT[operation] : void 0;
  if (support)
    lines.push("What this supports", `  ${support}`);
  if (warnings.length > 0) {
    lines.push("Warnings", ...warnings.slice(0, expanded ? 8 : 3).map((warning) => `  ${safeText(warning)}`));
  }
  const source = sourceLine(details);
  if (source)
    lines.push("Sources", source);
  return lines.map((line) => truncate(line, width));
}
function createQlooCallComponent(toolName, input, theme) {
  return {
    render(width) {
      return renderQlooCallLines(toolName, input, width).map((line, index) => index === 0 ? theme.fg("accent", theme.bold(line)) : theme.fg("dim", line));
    },
    invalidate() {
    }
  };
}
function createQlooResultComponent(details, expanded, theme) {
  const status = safeText(asRecord(details)?.status);
  const statusColor = status === "ok" ? "success" : status === "error" ? "error" : status === "needs_input" ? "warning" : "accent";
  return {
    render(width) {
      const lines = renderQlooResultLines(details, { expanded, width });
      return lines.map((line, index) => index === 0 ? theme.fg(statusColor, theme.bold(line)) : /^(?:Interpreted as|Progress|Qloo result|Choose a Qloo match|What this supports|Warnings|Sources)$/u.test(line) ? theme.fg("muted", theme.bold(line)) : line);
    },
    invalidate() {
    }
  };
}
function paginateQlooResult(detailsValue, requestedPage, pageSize = 5) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError("Qloo result page size must be a positive integer.");
  }
  const results = asArray(detailsValue.results);
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage)));
  const start = (page - 1) * pageSize;
  return {
    ...detailsValue,
    results: results.slice(start, start + pageSize),
    page: {
      number: page,
      size: pageSize,
      total_pages: totalPages,
      total_results: results.length,
      has_previous: page > 1,
      has_next: page < totalPages
    }
  };
}
function parseQlooRawPage(argument, currentPage) {
  const value = argument.trim().toLocaleLowerCase("en-US");
  if (!value)
    return 1;
  if (value === "next")
    return currentPage + 1;
  if (value === "prev" || value === "previous")
    return Math.max(1, currentPage - 1);
  if (/^[1-9]\d*$/u.test(value))
    return Number(value);
  return void 0;
}
var resolutionFieldsByToolName = new Map(Object.keys(QLOO_WORKFLOW_CONTRACTS).map((operation) => [
  QLOO_WORKFLOW_CONTRACTS[operation].toolName,
  QLOO_WORKFLOW_RESOLUTION_FIELDS[operation]
]));
function canonicalResolutionScope(field, input) {
  if (!field.scopeField || !field.scopeKind)
    return void 0;
  const value = input[field.scopeField];
  if (typeof value !== "string" || value.trim().length === 0)
    return void 0;
  return field.scopeKind === "insights" ? resolveQlooInsightsEntityType(value) ?? safeText(value) : resolveQlooSearchEntityType(value) ?? safeText(value);
}
function fieldContainsInput(input, field, issueInput) {
  const value = input[field];
  return typeof value === "string" ? value === issueInput : Array.isArray(value) && value.some((item) => item === issueInput);
}
function resolutionInputContexts(toolName, input) {
  return (resolutionFieldsByToolName.get(toolName) ?? []).map((field) => {
    const scope = canonicalResolutionScope(field, input);
    return {
      field: field.field,
      inputKind: field.inputKind,
      ...scope ? { scope } : {},
      ...field.purpose ? { purpose: field.purpose } : {}
    };
  });
}
function resolutionCandidates(detailsValue, toolName, toolInput = {}) {
  const details = asRecord(detailsValue);
  if (details?.status !== "needs_input")
    return [];
  const resolution = asRecord(details.resolution);
  const fieldDefinitions = toolName ? resolutionFieldsByToolName.get(toolName) ?? [] : [];
  const usedFields = /* @__PURE__ */ new Map();
  return asArray(resolution?.issues).slice(0, 5).flatMap((value) => {
    const issue = asRecord(value);
    const input = safeText(issue?.input);
    const seenIds = /* @__PURE__ */ new Set();
    const candidates = asArray(issue?.candidates).map(asRecord).filter((candidate) => candidate !== void 0).filter((candidate) => {
      const id = safeText(candidate.id);
      if (!id || seenIds.has(id))
        return false;
      seenIds.add(id);
      return true;
    }).slice(0, 5);
    if (!input || candidates.length === 0)
      return [];
    const explicitField = safeText(issue?.field);
    const explicitKind = issue?.input_kind === "entity" || issue?.input_kind === "tag" ? issue.input_kind : void 0;
    const matchingFields = fieldDefinitions.filter((field) => fieldContainsInput(toolInput, field.field, input));
    const used = usedFields.get(input) ?? /* @__PURE__ */ new Set();
    const inferredField = matchingFields.find((field) => field.field === explicitField && (!explicitKind || field.inputKind === explicitKind)) ?? matchingFields.find((field) => !used.has(field.field));
    if (inferredField) {
      used.add(inferredField.field);
      usedFields.set(input, used);
    }
    const scope = safeText(issue?.scope) || (inferredField ? canonicalResolutionScope(inferredField, toolInput) : void 0);
    const purpose = issue?.purpose === "signal" || issue?.purpose === "include_filter" || issue?.purpose === "exclude_filter" ? issue.purpose : inferredField?.purpose;
    return [{
      input,
      candidates,
      ...inferredField ? { field: inferredField.field } : explicitField ? { field: explicitField } : {},
      ...inferredField ? { inputKind: inferredField.inputKind } : explicitKind ? { inputKind: explicitKind } : {},
      ...scope ? { scope } : {},
      ...purpose ? { purpose } : {}
    }];
  });
}
function applyResolutionChoices(toolName, input, choices) {
  const fields = resolutionFieldsByToolName.get(toolName);
  if (!fields || choices.length === 0)
    return void 0;
  let changed = false;
  const patched = { ...input };
  for (const fieldDefinition of fields) {
    const field = fieldDefinition.field;
    const fieldChoices = choices.filter((choice) => (!choice.field || choice.field === field) && (!choice.inputKind || choice.inputKind === fieldDefinition.inputKind));
    if (fieldChoices.length === 0)
      continue;
    const byInput = new Map(fieldChoices.map((choice) => [choice.input, choice.selectedId]));
    const value = input[field];
    if (typeof value === "string") {
      const replacement = byInput.get(value);
      if (replacement) {
        patched[field] = replacement;
        changed = true;
      }
      continue;
    }
    if (!Array.isArray(value))
      continue;
    const replaced = value.map((item) => {
      if (typeof item !== "string")
        return item;
      const replacement = byInput.get(item);
      if (!replacement)
        return item;
      changed = true;
      return replacement;
    });
    patched[field] = replaced;
  }
  return changed ? patched : void 0;
}
export {
  applyResolutionChoices,
  createQlooCallComponent,
  createQlooResultComponent,
  formatQlooResolutionCandidateLabels,
  paginateQlooResult,
  parseQlooRawPage,
  renderQlooCallLines,
  renderQlooResultLines,
  resolutionCandidates,
  resolutionInputContexts
};
