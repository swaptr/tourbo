import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QlooClient,
  resolveQlooClientConfiguration
} from "./chunks/chunk-ESNY4EJL.js";
import {
  QLOO_ADAPTER_CONTRACT_MANIFEST_SCHEMA_VERSION,
  QLOO_CAPABILITIES_TOOL_NAME,
  QLOO_INSIGHTS_ENTITY_TYPES,
  QLOO_SEARCH_ENTITY_TYPES,
  QLOO_TOOL_DEFAULT_LIMIT,
  QLOO_TOOL_MAX_RESULTS,
  QLOO_TOOL_RESULT_SCHEMA_VERSION,
  QLOO_WORKFLOW_CONTRACTS,
  QLOO_WORKFLOW_OPERATION_IDS,
  createQlooQueryIntent,
  getQlooExecutableCapabilities,
  isQlooWorkflowOperationId,
  parseQlooDemographic,
  resolveQlooInsightsEntityType,
  resolveQlooSearchEntityType
} from "./chunks/chunk-MCLV3P4I.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/qloo-tools.js
import { Type } from "typebox";
import { createDelegatingQlooWorkflowExecutor, QlooWorkflowExecutionError } from "./workflow-executor.js";
import { createFileExecutionObserver } from "./observability.js";
import { resolveQlooPaths } from "./paths.js";
import { createQlooCallComponent, createQlooResultComponent } from "./qloo-presentation.js";
import { createPublicQlooResolutionProvider, createQlooResolutionProviderFromEnvironment } from "./resolution-provider.js";
function defineTool(tool) {
  return tool;
}
var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
var DEFAULT_LIMIT = QLOO_TOOL_DEFAULT_LIMIT;
var MAX_TOOL_RESULTS = QLOO_TOOL_MAX_RESULTS;
var QLOO_WORKFLOW_PROGRESS_INTERVAL_MS = 5e3;
var QLOO_WORKFLOW_TOOL_NAME_SET = new Set(Object.values(QLOO_WORKFLOW_CONTRACTS).map(({ toolName }) => toolName));
function isQlooWorkflowToolName(value) {
  return QLOO_WORKFLOW_TOOL_NAME_SET.has(value);
}
var insightsEntityTypeIds = QLOO_INSIGHTS_ENTITY_TYPES.map(({ id }) => id);
var searchEntityTypeIds = QLOO_SEARCH_ENTITY_TYPES.map(({ id }) => id);
var runtimeInfoByTool = /* @__PURE__ */ new WeakMap();
function associateRuntimeInfo(tools, executor) {
  const info = executor ? {
    transport: executor.transport.kind,
    transportName: executor.transport.name,
    remote: executor.transport.remote ?? false,
    fallback: "none",
    ...executor.resolution ? { resolution: executor.resolution } : {}
  } : {
    transport: "none",
    transportName: "Qloo API unavailable",
    remote: false,
    fallback: "none"
  };
  for (const tool of tools)
    runtimeInfoByTool.set(tool, info);
  return [...tools];
}
function getQlooToolRuntimeInfo(tools) {
  for (const tool of tools) {
    const info = runtimeInfoByTool.get(tool);
    if (info)
      return info;
  }
  return void 0;
}
function requestOptions(signal, correlationId) {
  return {
    ...signal ? { signal } : {},
    correlationId
  };
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function resultValue(response, key) {
  const results = response.results;
  if (Array.isArray(results))
    return results;
  return asRecord(results)?.[key] ?? results ?? [];
}
function resultArray(response, key) {
  return asArray(resultValue(response, key));
}
function scalar(record, ...keys) {
  for (const key of keys) {
    if (record[key] !== void 0 && record[key] !== null)
      return record[key];
  }
  return void 0;
}
function boundedValue(value, depth = 0) {
  if (typeof value === "string")
    return value.length > 2e3 ? `${value.slice(0, 2e3)}\u2026` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (depth >= 5)
    return "[detail omitted]";
  if (Array.isArray(value))
    return value.slice(0, MAX_TOOL_RESULTS).map((item) => boundedValue(item, depth + 1));
  const record = asRecord(value);
  if (!record)
    return void 0;
  return Object.fromEntries(Object.entries(record).slice(0, 40).map(([key, item]) => [key, boundedValue(item, depth + 1)]));
}
function compactEntity(value) {
  const entity = asRecord(value);
  if (!entity)
    return void 0;
  const properties = asRecord(entity.properties);
  const query = asRecord(entity.query);
  const explainability = boundedValue(query?.explainability);
  const compactProperties = properties ? Object.fromEntries([
    "description",
    "short_description",
    "release_year",
    "release_date",
    "content_rating",
    "duration",
    "image",
    "geocode",
    "address",
    "price_level",
    "business_rating"
  ].flatMap((key) => properties[key] === void 0 ? [] : [[key, boundedValue(properties[key])]])) : void 0;
  return {
    entity_id: scalar(entity, "entity_id", "id"),
    name: entity.name,
    type: entity.type,
    subtype: entity.subtype,
    popularity: entity.popularity,
    affinity: scalar(entity, "affinity") ?? query?.affinity,
    ...explainability !== void 0 ? { explainability } : {},
    ...compactProperties && Object.keys(compactProperties).length > 0 ? { properties: compactProperties } : {}
  };
}
function compactTag(value) {
  const tag = asRecord(value);
  if (!tag)
    return void 0;
  const query = asRecord(tag.query);
  return {
    id: scalar(tag, "id", "tag_id"),
    name: tag.name,
    type: scalar(tag, "type", "subtype"),
    popularity: tag.popularity,
    affinity: tag.affinity ?? query?.affinity
  };
}
function isCalendarDate(value) {
  if (!DATE_PATTERN.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === void 0 || month === void 0 || day === void 0)
    return false;
  if (month < 1 || month > 12 || day < 1)
    return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}
function heatmapAffinity(value) {
  const query = asRecord(asRecord(value)?.query);
  return typeof query?.affinity === "number" ? query.affinity : Number.NEGATIVE_INFINITY;
}
function interpretedEntity(entity) {
  return {
    input: entity.input,
    entityId: entity.entityId,
    name: entity.name,
    ...entity.type ? { type: entity.type } : {},
    match: entity.match,
    ...entity.score !== void 0 ? { score: entity.score } : {}
  };
}
function interpretedEntities(entities) {
  return entities.map(interpretedEntity);
}
async function resolveEntities(provider, inputs, type, signal, correlationId, field) {
  const { outcomes } = await provider.resolveEntities({
    inputs,
    ...type ? { type } : {}
  }, {
    ...signal ? { signal } : {},
    correlationId
  });
  return {
    resolved: outcomes.flatMap((outcome) => outcome.status === "resolved" ? [{
      input: outcome.input,
      entityId: outcome.selected.id,
      name: outcome.selected.name,
      ...outcome.selected.type ? { type: outcome.selected.type } : {},
      match: outcome.match,
      ...outcome.selected.score !== void 0 ? { score: outcome.selected.score } : {},
      provenance: outcome.provenance
    }] : []),
    issues: outcomes.flatMap((outcome) => outcome.status === "resolved" ? [] : [{
      input: outcome.input,
      kind: outcome.status,
      input_kind: "entity",
      field,
      ...type ? { scope: type } : {},
      ...outcome.candidates ? {
        candidates: outcome.candidates.map((candidate) => ({ ...candidate }))
      } : {},
      provenance: outcome.provenance,
      ...outcome.warnings ? { warnings: outcome.warnings } : {}
    }]),
    outcomes
  };
}
function interpretedTags(tags) {
  return tags.map((tag) => ({
    input: tag.input,
    tagId: tag.tagId,
    name: tag.name,
    match: tag.match,
    ...tag.score !== void 0 ? { score: tag.score } : {}
  }));
}
async function resolveTags(provider, inputs, targetType, purpose, signal, correlationId, field) {
  const { outcomes } = await provider.resolveTags({
    inputs,
    ...targetType ? { targetType } : {},
    purpose
  }, {
    ...signal ? { signal } : {},
    correlationId
  });
  return {
    resolved: outcomes.flatMap((outcome) => outcome.status === "resolved" ? [{
      input: outcome.input,
      tagId: outcome.selected.id,
      name: outcome.selected.name,
      match: outcome.match,
      ...outcome.selected.score !== void 0 ? { score: outcome.selected.score } : {},
      ...outcome.alternatives ? {
        alternatives: outcome.alternatives.map((candidate) => ({ ...candidate }))
      } : {},
      provenance: outcome.provenance,
      ...outcome.warnings ? { warnings: outcome.warnings } : {}
    }] : []),
    issues: outcomes.flatMap((outcome) => outcome.status === "resolved" ? [] : [{
      input: outcome.input,
      kind: outcome.status,
      input_kind: "tag",
      field,
      ...targetType ? { scope: targetType } : {},
      purpose,
      ...outcome.candidates ? {
        candidates: outcome.candidates.map((candidate) => ({ ...candidate }))
      } : {},
      provenance: outcome.provenance,
      ...outcome.warnings ? { warnings: outcome.warnings } : {}
    }]),
    outcomes
  };
}
function resolutionWarnings(...sets) {
  return [...new Set(sets.flatMap(({ outcomes }) => outcomes.flatMap(({ warnings }) => warnings ?? [])))];
}
function resolutionReport(provider, ...sets) {
  const warnings = resolutionWarnings(...sets);
  return {
    contract_version: provider.descriptor.contract_version,
    provider: provider.descriptor,
    outcomes: sets.flatMap(({ outcomes }) => outcomes),
    ...warnings.length > 0 ? { warnings } : {}
  };
}
function resolutionOutput(provider, ...sets) {
  const warnings = resolutionWarnings(...sets);
  return {
    resolution: resolutionReport(provider, ...sets),
    ...warnings.length > 0 ? { warnings } : {}
  };
}
function resolveInsightsType(value) {
  const resolved = resolveQlooInsightsEntityType(value);
  if (!resolved) {
    throw new Error(`Unsupported Qloo Insights type "${value}". Choose: ${insightsEntityTypeIds.join(", ")}.`);
  }
  return resolved;
}
function resolveSearchType(value) {
  const resolved = resolveQlooSearchEntityType(value);
  if (!resolved) {
    throw new Error(`Unsupported Qloo search type "${value}". Choose: ${searchEntityTypeIds.join(", ")}.`);
  }
  return resolved;
}
function requireClient(client) {
  if (!client) {
    throw new Error("Live Qloo tools require Qloo authentication. Run `qloo setup` for guided configuration.");
  }
  return client;
}
function requireResolutionProvider(provider) {
  if (!provider) {
    throw new Error("Live Qloo tools require an explicit resolution provider.");
  }
  return provider;
}
function output(operation, payload) {
  const result = {
    schema_version: QLOO_TOOL_RESULT_SCHEMA_VERSION,
    operation,
    ...payload
  };
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    details: result
  };
}
function needsInput(operation, issues, message) {
  return output(operation, {
    status: "needs_input",
    summary: message,
    resolution: { issues },
    results: []
  });
}
function provenance(endpoint, docs, queries) {
  return {
    source: "Qloo API",
    endpoint,
    documentation: `https://docs.qloo.com/reference/${docs}`,
    requests: queries.slice(0, 20).map((query) => ({
      method: "GET",
      path: endpoint,
      query: boundedValue(query)
    }))
  };
}
function makeCapabilitiesTool(executor) {
  return defineTool({
    name: QLOO_CAPABILITIES_TOOL_NAME,
    label: "Qloo capabilities",
    description: "Inspect the local, versioned Qloo workflow catalog and pinned API source. Makes no network request.",
    promptSnippet: "Inspect supported Qloo workflows and authoritative contract metadata",
    parameters: Type.Object({
      operation_ids: Type.Optional(Type.Array(Type.String({
        enum: QLOO_WORKFLOW_OPERATION_IDS
      }), { uniqueItems: true }))
    }, { additionalProperties: false }),
    async execute(_toolCallId, params) {
      const operationIds = params.operation_ids?.filter(isQlooWorkflowOperationId);
      return output("capabilities", {
        manifest_schema_version: QLOO_ADAPTER_CONTRACT_MANIFEST_SCHEMA_VERSION,
        ...getQlooExecutableCapabilities(operationIds === void 0 ? {} : { operation_ids: operationIds }),
        adapter: {
          id: "qloo_harness",
          compatibility: "native",
          canonical_workflow_execution: Boolean(executor),
          supported_operation_ids: executor ? QLOO_WORKFLOW_OPERATION_IDS : [],
          capabilities_tool: QLOO_CAPABILITIES_TOOL_NAME
        },
        execution_policy: executor ? {
          active_transport: executor.transport.kind,
          transport_name: executor.transport.name,
          remote: executor.transport.remote ?? false,
          fallback: "none",
          ...executor.resolution ? { resolution: executor.resolution } : {}
        } : {
          active_transport: "none",
          fallback: "none",
          reason: "Qloo API authentication is unavailable."
        }
      });
    }
  });
}
function makeRecommendTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.recommend;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    promptGuidelines: [...contract.promptGuidelines],
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      const targetType = resolveInsightsType(params.target_type);
      const demographic = params.demographic ? parseQlooDemographic(params.demographic) : void 0;
      if (params.demographic && !demographic?.gender && !demographic?.age) {
        return needsInput("recommend", [], `Could not map demographic "${params.demographic}" to Qloo age or gender signals. Use a phrase such as "young women" or "men 25-34".`);
      }
      if (demographic && !params.signal_location) {
        return needsInput("recommend", [], "Demographic Qloo signals require signal_location so the audience geography is explicit.");
      }
      if ((params.signals?.length ?? 0) === 0 && (params.signal_tags?.length ?? 0) === 0 && !params.signal_location && !demographic) {
        return needsInput("recommend", [], "Provide at least one entity, tag, location, or demographic taste signal.");
      }
      const [entities, signalTags, includeTags, excludeTags] = await Promise.all([
        resolveEntities(resolutionProvider, params.signals ?? [], void 0, signal, toolCallId, "signals"),
        resolveTags(resolutionProvider, params.signal_tags ?? [], targetType, "signal", signal, toolCallId, "signal_tags"),
        resolveTags(resolutionProvider, params.include_tags ?? [], targetType, "include_filter", signal, toolCallId, "include_tags"),
        resolveTags(resolutionProvider, params.exclude_tags ?? [], targetType, "exclude_filter", signal, toolCallId, "exclude_tags")
      ]);
      const issues = [...entities.issues, ...signalTags.issues, ...includeTags.issues, ...excludeTags.issues];
      if (issues.length > 0)
        return needsInput("recommend", issues, "Choose or correct the unresolved Qloo inputs.");
      const query = {
        "filter.type": targetType,
        take: params.limit ?? DEFAULT_LIMIT
      };
      if (entities.resolved.length > 0)
        query["signal.interests.entities"] = entities.resolved.map(({ entityId }) => entityId);
      if (signalTags.resolved.length > 0) {
        query["signal.interests.tags"] = signalTags.resolved.map(({ tagId }) => tagId);
        query["operator.signal.interests.tags"] = params.signal_tags_operator ?? "intersection";
      }
      if (params.signal_location)
        query["signal.location.query"] = params.signal_location;
      if (demographic?.gender)
        query["signal.demographics.gender"] = demographic.gender;
      if (demographic?.age)
        query["signal.demographics.age"] = demographic.age;
      if (params.filter_location)
        query["filter.location.query"] = params.filter_location;
      if (includeTags.resolved.length > 0) {
        query["filter.tags"] = includeTags.resolved.map(({ tagId }) => tagId);
        query["operator.filter.tags"] = params.include_tags_operator ?? "union";
      }
      if (excludeTags.resolved.length > 0) {
        query["filter.exclude.tags"] = excludeTags.resolved.map(({ tagId }) => tagId);
        query["operator.filter.exclude.tags"] = params.exclude_tags_operator ?? "union";
      }
      if (params.explain ?? true)
        query["feature.explainability"] = true;
      const response = await client.insights(query, requestOptions(signal, toolCallId));
      const results = resultArray(response, "entities").map(compactEntity).filter((entity) => entity !== void 0).slice(0, params.limit ?? DEFAULT_LIMIT);
      const explainability = boundedValue(asRecord(response.query)?.explainability);
      return output("recommend", {
        status: "ok",
        interpretation: {
          target_type: targetType,
          signals: interpretedEntities(entities.resolved),
          signal_tags: interpretedTags(signalTags.resolved),
          signal_tags_operator: signalTags.resolved.length > 0 ? params.signal_tags_operator ?? "intersection" : void 0,
          signal_location: params.signal_location,
          demographic: params.demographic ? { input: params.demographic, ...demographic } : void 0,
          filter_location: params.filter_location,
          include_tags: interpretedTags(includeTags.resolved),
          include_tags_operator: includeTags.resolved.length > 0 ? params.include_tags_operator ?? "union" : void 0,
          exclude_tags: interpretedTags(excludeTags.resolved),
          exclude_tags_operator: excludeTags.resolved.length > 0 ? params.exclude_tags_operator ?? "union" : void 0
        },
        ...resolutionOutput(resolutionProvider, entities, signalTags, includeTags, excludeTags),
        results,
        result_count: results.length,
        ...explainability !== void 0 ? { explainability } : {},
        provenance: provenance("/v2/insights", "insights-api-deep-dive", [query])
      });
    }
  });
}
function makeRankTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.rank;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    promptGuidelines: [...contract.promptGuidelines],
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      const targetType = resolveInsightsType(params.option_type);
      const demographic = params.demographic ? parseQlooDemographic(params.demographic) : void 0;
      if (params.demographic && !demographic?.gender && !demographic?.age) {
        return needsInput("rank", [], `Could not map demographic "${params.demographic}" to Qloo age or gender signals.`);
      }
      if (demographic && !params.signal_location) {
        return needsInput("rank", [], "Demographic Qloo signals require signal_location so the audience geography is explicit.");
      }
      if ((params.signals?.length ?? 0) === 0 && !params.signal_location && !demographic) {
        return needsInput("rank", [], "Ranking requires an entity, location, or demographic signal.");
      }
      const [options, signals, includeTags, excludeTags] = await Promise.all([
        resolveEntities(resolutionProvider, params.options, targetType, signal, toolCallId, "options"),
        resolveEntities(resolutionProvider, params.signals ?? [], void 0, signal, toolCallId, "signals"),
        resolveTags(resolutionProvider, params.include_tags ?? [], targetType, "include_filter", signal, toolCallId, "include_tags"),
        resolveTags(resolutionProvider, params.exclude_tags ?? [], targetType, "exclude_filter", signal, toolCallId, "exclude_tags")
      ]);
      const issues = [...options.issues, ...signals.issues, ...includeTags.issues, ...excludeTags.issues];
      if (issues.length > 0)
        return needsInput("rank", issues, "Choose or correct the unresolved ranking inputs.");
      const query = {
        "filter.type": targetType,
        "filter.results.entities": options.resolved.map(({ entityId }) => entityId),
        take: options.resolved.length
      };
      if (signals.resolved.length > 0)
        query["signal.interests.entities"] = signals.resolved.map(({ entityId }) => entityId);
      if (params.signal_location)
        query["signal.location.query"] = params.signal_location;
      if (demographic?.gender)
        query["signal.demographics.gender"] = demographic.gender;
      if (demographic?.age)
        query["signal.demographics.age"] = demographic.age;
      if (includeTags.resolved.length > 0) {
        query["filter.tags"] = includeTags.resolved.map(({ tagId }) => tagId);
        query["operator.filter.tags"] = "union";
      }
      if (excludeTags.resolved.length > 0) {
        query["filter.exclude.tags"] = excludeTags.resolved.map(({ tagId }) => tagId);
        query["operator.filter.exclude.tags"] = "union";
      }
      const response = await client.insights(query, requestOptions(signal, toolCallId));
      const results = resultArray(response, "entities").map(compactEntity).filter((entity) => entity !== void 0).slice(0, options.resolved.length);
      return output("rank", {
        status: "ok",
        interpretation: {
          option_type: targetType,
          options: interpretedEntities(options.resolved),
          signals: interpretedEntities(signals.resolved),
          signal_location: params.signal_location,
          demographic: params.demographic ? { input: params.demographic, ...demographic } : void 0,
          include_tags: interpretedTags(includeTags.resolved),
          exclude_tags: interpretedTags(excludeTags.resolved)
        },
        ...resolutionOutput(resolutionProvider, options, signals, includeTags, excludeTags),
        results,
        result_count: results.length,
        provenance: provenance("/v2/insights", "insights-api-deep-dive", [query])
      });
    }
  });
}
function makeDescribeTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.describe;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      const type = params.type ? resolveSearchType(params.type) : void 0;
      const resolution = await resolveEntities(resolutionProvider, [params.entity], type, signal, toolCallId, "entity");
      if (resolution.issues.length > 0)
        return needsInput("describe", resolution.issues, "Choose the intended Qloo entity.");
      const needsDetailHydration = resolution.resolved.some(({ match }) => match !== "identifier");
      const detailedResults = needsDetailHydration ? resultArray(await client.entities(resolution.resolved.map(({ entityId }) => entityId), requestOptions(signal, toolCallId)), "entities").map(compactEntity).filter((entity) => entity !== void 0) : [];
      const results = detailedResults.length > 0 ? detailedResults : resolution.resolved.map((entity) => ({
        entity_id: entity.entityId,
        name: entity.name,
        type: entity.type
      }));
      return output("describe", {
        status: results.length > 0 ? "ok" : "empty",
        interpretation: {
          entity: resolution.resolved[0] ? interpretedEntity(resolution.resolved[0]) : void 0
        },
        ...resolutionOutput(resolutionProvider, resolution),
        results,
        result_count: results.length,
        provenance: provenance("/entities", "get-entities", [{
          entity_ids: resolution.resolved.map(({ entityId }) => entityId)
        }])
      });
    }
  });
}
function makeWherePopularTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.where_popular;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      const type = params.entity_type ? resolveSearchType(params.entity_type) : void 0;
      const resolution = await resolveEntities(resolutionProvider, [params.entity], type, signal, toolCallId, "entity");
      if (resolution.issues.length > 0)
        return needsInput("where_popular", resolution.issues, "Choose the intended Qloo entity.");
      const entity = resolution.resolved[0];
      if (!entity)
        return needsInput("where_popular", [], "Provide an entity.");
      const limit = params.limit ?? DEFAULT_LIMIT;
      const query = {
        "filter.type": "urn:heatmap",
        "signal.interests.entities": entity.entityId,
        "filter.location.query": params.within,
        take: limit
      };
      const response = await client.insights(query, requestOptions(signal, toolCallId));
      const results = [...resultArray(response, "heatmap")].sort((left, right) => heatmapAffinity(right) - heatmapAffinity(left)).slice(0, limit).map((point) => boundedValue(point));
      return output("where_popular", {
        status: results.length > 0 ? "ok" : "empty",
        interpretation: { entity: interpretedEntity(entity), within: params.within },
        ...resolutionOutput(resolutionProvider, resolution),
        results,
        result_count: results.length,
        provenance: provenance("/v2/insights", "heatmaps-use-case", [query])
      });
    }
  });
}
function makeCompareAudiencesTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.compare_audiences;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      const [groupA, groupB] = await Promise.all([
        resolveEntities(resolutionProvider, params.group_a, void 0, signal, toolCallId, "group_a"),
        resolveEntities(resolutionProvider, params.group_b, void 0, signal, toolCallId, "group_b")
      ]);
      const issues = [...groupA.issues, ...groupB.issues];
      if (issues.length > 0)
        return needsInput("compare_audiences", issues, "Choose or correct the unresolved comparison inputs.");
      const query = {
        "a.signal.interests.entities": groupA.resolved.map(({ entityId }) => entityId),
        "b.signal.interests.entities": groupB.resolved.map(({ entityId }) => entityId),
        take: params.limit ?? DEFAULT_LIMIT
      };
      if (params.target_type)
        query["filter.type"] = resolveInsightsType(params.target_type);
      const response = await client.compare(query, requestOptions(signal, toolCallId));
      return output("compare_audiences", {
        status: "ok",
        interpretation: {
          group_a: interpretedEntities(groupA.resolved),
          group_b: interpretedEntities(groupB.resolved),
          target_type: query["filter.type"]
        },
        ...resolutionOutput(resolutionProvider, groupA, groupB),
        results: boundedValue(response.results),
        provenance: provenance("/v2/analysis/compare", "analysis-compare", [query])
      });
    }
  });
}
function makeEntityTagsTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.entity_tags;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      const type = params.entity_type ? resolveSearchType(params.entity_type) : void 0;
      const resolution = await resolveEntities(resolutionProvider, params.entities, type, signal, toolCallId, "entities");
      if (resolution.issues.length > 0)
        return needsInput("entity_tags", resolution.issues, "Choose or correct the unresolved Qloo entities.");
      const query = {
        "filter.type": "urn:tag",
        "signal.interests.entities": resolution.resolved.map(({ entityId }) => entityId),
        take: params.limit ?? DEFAULT_LIMIT
      };
      const response = await client.insights(query, requestOptions(signal, toolCallId));
      const results = resultArray(response, "tags").map(compactTag).filter((tag) => tag !== void 0).slice(0, params.limit ?? DEFAULT_LIMIT);
      return output("entity_tags", {
        status: "ok",
        interpretation: { entities: interpretedEntities(resolution.resolved) },
        ...resolutionOutput(resolutionProvider, resolution),
        results,
        result_count: results.length,
        provenance: provenance("/v2/insights", "taste-analysis", [query])
      });
    }
  });
}
function makeAudienceDemographicsTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.audience_demographics;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      const type = params.entity_type ? resolveSearchType(params.entity_type) : void 0;
      const resolution = await resolveEntities(resolutionProvider, [params.entity], type, signal, toolCallId, "entity");
      if (resolution.issues.length > 0)
        return needsInput("audience_demographics", resolution.issues, "Choose the intended Qloo entity.");
      const entity = resolution.resolved[0];
      if (!entity)
        return needsInput("audience_demographics", [], "Provide an entity.");
      const query = {
        "filter.type": "urn:demographics",
        "signal.interests.entities": entity.entityId,
        take: params.limit ?? DEFAULT_LIMIT
      };
      const response = await client.insights(query, requestOptions(signal, toolCallId));
      const results = resultArray(response, "demographics").slice(0, params.limit ?? DEFAULT_LIMIT).map((item) => boundedValue(item));
      return output("audience_demographics", {
        status: "ok",
        interpretation: { entity: interpretedEntity(entity) },
        ...resolutionOutput(resolutionProvider, resolution),
        results,
        result_count: results.length,
        provenance: provenance("/v2/insights", "demographics-use-case", [query])
      });
    }
  });
}
function makeTrendsTool(clientOption, resolutionProviderOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.trends;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const resolutionProvider = requireResolutionProvider(resolutionProviderOption);
      if (!isCalendarDate(params.start_date) || !isCalendarDate(params.end_date) || params.start_date > params.end_date) {
        throw new Error("Trend dates must be valid YYYY-MM-DD values with start_date on or before end_date.");
      }
      const type = resolveInsightsType(params.entity_type);
      const resolution = await resolveEntities(resolutionProvider, params.entities, type, signal, toolCallId, "entities");
      if (resolution.issues.length > 0)
        return needsInput("trends", resolution.issues, "Choose or correct the unresolved Qloo entities.");
      const requests = resolution.resolved.map((entity) => ({
        entity,
        query: {
          "filter.type": type,
          "filter.start_date": params.start_date,
          "filter.end_date": params.end_date,
          "signal.interests.entities": entity.entityId,
          take: params.limit ?? DEFAULT_LIMIT
        }
      }));
      const series = await Promise.all(requests.map(async ({ entity, query }) => {
        const response = await client.trending(query, requestOptions(signal, toolCallId));
        const points = resultArray(response, "trending").slice(0, params.limit ?? DEFAULT_LIMIT).map((point) => boundedValue(point));
        return { entity: interpretedEntity(entity), points };
      }));
      return output("trends", {
        status: "ok",
        interpretation: { entity_type: type, start_date: params.start_date, end_date: params.end_date },
        ...resolutionOutput(resolutionProvider, resolution),
        series,
        result_count: series.length,
        provenance: provenance("/v2/trending", "get-trending", requests.map(({ query }) => query))
      });
    }
  });
}
function makeFindTagsTool(clientOption) {
  const contract = QLOO_WORKFLOW_CONTRACTS.find_tags;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    parameters: contract.inputSchema,
    async execute(toolCallId, params, signal) {
      const client = requireClient(clientOption);
      const query = {
        "filter.query": params.query,
        "feature.semantic_search": params.semantic ?? true,
        take: params.limit ?? DEFAULT_LIMIT
      };
      const response = await client.tags(query, requestOptions(signal, toolCallId));
      const results = resultArray(response, "tags").map(compactTag).filter((tag) => tag !== void 0).slice(0, params.limit ?? DEFAULT_LIMIT);
      return output("find_tags", {
        status: "ok",
        interpretation: { query: params.query, semantic: params.semantic ?? true },
        results,
        result_count: results.length,
        provenance: provenance("/v2/tags", "get-tags", [query])
      });
    }
  });
}
function createDirectOperationTools(client, resolutionProvider) {
  return [
    makeRecommendTool(client, resolutionProvider),
    makeRankTool(client, resolutionProvider),
    makeDescribeTool(client, resolutionProvider),
    makeWherePopularTool(client, resolutionProvider),
    makeCompareAudiencesTool(client, resolutionProvider),
    makeEntityTagsTool(client, resolutionProvider),
    makeAudienceDemographicsTool(client, resolutionProvider),
    makeTrendsTool(client, resolutionProvider),
    makeFindTagsTool(client)
  ];
}
function createDirectQlooWorkflowExecutor(client, observer, resolutionProvider = createPublicQlooResolutionProvider(client)) {
  const tools = new Map(createDirectOperationTools(client, resolutionProvider).map((tool) => [tool.name, tool]));
  return createDelegatingQlooWorkflowExecutor({
    transport: { kind: "direct", name: "Qloo API" },
    resolution: resolutionProvider.descriptor,
    ...observer ? { observer } : {},
    async invoke(operation, input, context) {
      const toolName = `qloo_${operation}`;
      const tool = tools.get(toolName);
      if (!tool)
        throw new Error(`Direct Qloo executor does not implement ${toolName}.`);
      const result = await tool.execute(context.correlationId ?? `direct-${operation}`, input, context.signal, void 0, {});
      const details = result.details;
      if (details === null || typeof details !== "object" || Array.isArray(details)) {
        throw new Error(`${toolName} returned an invalid result envelope.`);
      }
      return details;
    }
  });
}
function makeExecutorTool(operation, executor) {
  const contract = QLOO_WORKFLOW_CONTRACTS[operation];
  const promptGuidelines = "promptGuidelines" in contract && Array.isArray(contract.promptGuidelines) ? contract.promptGuidelines : void 0;
  return defineTool({
    name: contract.toolName,
    label: contract.label,
    description: contract.description,
    promptSnippet: contract.promptSnippet,
    // A workflow can pause for a user resolution choice in `tool_result`.
    // Pi's parallel finalizers would otherwise open competing modal dialogs.
    executionMode: "sequential",
    ...promptGuidelines ? { promptGuidelines: [...promptGuidelines] } : {},
    parameters: contract.inputSchema,
    renderShell: "self",
    renderCall: (params, theme) => createQlooCallComponent(contract.toolName, params, theme),
    renderResult: (result, renderOptions, theme) => createQlooResultComponent(result.details, renderOptions.expanded, theme),
    async execute(toolCallId, params, signal, onUpdate) {
      const startedAt = Date.now();
      const emitProgress = () => {
        if (!onUpdate)
          return;
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        const progress = output(operation, {
          status: "running",
          summary: "Resolving inputs and querying Qloo.",
          query_intent: createQlooQueryIntent(operation, params),
          progress: {
            phase: "resolving_and_querying",
            elapsed_ms: elapsedMs
          },
          results: []
        });
        onUpdate(progress);
      };
      emitProgress();
      const progressTimer = onUpdate ? setInterval(emitProgress, QLOO_WORKFLOW_PROGRESS_INTERVAL_MS) : void 0;
      progressTimer?.unref();
      try {
        const execution = await executor.execute(operation, params, {
          ...signal ? { signal } : {},
          correlationId: toolCallId
        });
        return {
          content: [{ type: "text", text: JSON.stringify(execution.result) }],
          details: execution.result
        };
      } catch (error) {
        if (!(error instanceof QlooWorkflowExecutionError) || !error.expected)
          throw error;
        return output(operation, {
          status: "error",
          summary: error.message,
          query_intent: createQlooQueryIntent(operation, params),
          error: {
            code: error.code,
            layer: error.layer,
            retryable: error.retryable,
            recovery: error.recovery
          },
          results: [],
          execution: {
            transport: error.transport.kind,
            transport_name: error.transport.name,
            correlation_id: error.correlationId ?? toolCallId,
            duration_ms: error.durationMs ?? 0
          }
        });
      } finally {
        if (progressTimer)
          clearInterval(progressTimer);
      }
    }
  });
}
function createQlooTools(options = {}) {
  if (options.client && options.executor) {
    throw new Error("Choose either a Qloo client or a workflow executor, not both.");
  }
  if (options.executor && options.resolutionProvider) {
    throw new Error("A custom workflow executor must own its resolution provider.");
  }
  const executor = options.executor ?? (options.client ? createDirectQlooWorkflowExecutor(options.client, options.executionObserver, options.resolutionProvider ?? createPublicQlooResolutionProvider(options.client)) : void 0);
  if (!executor)
    return associateRuntimeInfo([makeCapabilitiesTool()]);
  return associateRuntimeInfo([
    makeCapabilitiesTool(executor),
    ...QLOO_WORKFLOW_OPERATION_IDS.map((operation) => makeExecutorTool(operation, executor))
  ], executor);
}
function createDirectQlooWorkflowExecutorFromEnvironment(options = {}) {
  const env = options.env ?? process.env;
  const resolved = resolveQlooClientConfiguration({
    env,
    ...options.configPath ? { configPath: options.configPath } : {},
    ...options.readConfigFile ? { readFile: options.readConfigFile } : {}
  });
  if (!resolved.apiKey)
    return void 0;
  const executionObserver = options.executionObserver ?? createFileExecutionObserver({
    logsDirectory: resolveQlooPaths({ env }).logsDir
  });
  const client = new QlooClient({
    apiKey: resolved.apiKey,
    ...resolved.baseUrl ? { baseUrl: resolved.baseUrl } : {},
    allowCustomBaseUrl: resolved.baseUrlTrusted
  });
  const resolutionProvider = options.resolutionProvider ?? createQlooResolutionProviderFromEnvironment({
    client,
    env,
    fileConfig: resolved.fileConfig
  });
  return createDirectQlooWorkflowExecutor(client, executionObserver, resolutionProvider);
}
function createQlooToolsFromEnvironment(options = {}) {
  if (options.executor) {
    if (options.client)
      throw new Error("Choose either a Qloo client or a workflow executor, not both.");
    if (options.resolutionProvider)
      throw new Error("A custom workflow executor must own its resolution provider.");
    return createQlooTools({ executor: options.executor });
  }
  if (options.client) {
    return createQlooTools({
      client: options.client,
      ...options.executionObserver ? { executionObserver: options.executionObserver } : {},
      ...options.resolutionProvider ? { resolutionProvider: options.resolutionProvider } : {}
    });
  }
  const executor = createDirectQlooWorkflowExecutorFromEnvironment(options);
  return executor ? createQlooTools({ executor }) : createQlooTools();
}
export {
  createDirectQlooWorkflowExecutor,
  createDirectQlooWorkflowExecutorFromEnvironment,
  createQlooTools,
  createQlooToolsFromEnvironment,
  getQlooToolRuntimeInfo,
  isQlooWorkflowToolName
};
