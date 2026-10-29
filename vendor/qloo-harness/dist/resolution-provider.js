import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QLOO_RESOLUTION_CONTRACT_VERSION
} from "./chunks/chunk-MCLV3P4I.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/resolution-provider.js
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var TAG_URN_PREFIX = "urn:tag:";
var DEFAULT_RESOLVER_TIMEOUT_MS = 15e3;
var DEFAULT_MAX_RESOLVER_RESPONSE_BYTES = 1 * 1024 * 1024;
var DEFAULT_RESOLVER_HEALTH_TIMEOUT_MS = 5e3;
var DEFAULT_MAX_RESOLVER_HEALTH_RESPONSE_BYTES = 64 * 1024;
var DEFAULT_MINIMUM_SEMANTIC_SCORE = 0.7;
var DEFAULT_MINIMUM_SEMANTIC_SCORE_MARGIN = 0.05;
var DEFAULT_RESOLUTION_CACHE_TTL_MS = 15 * 60 * 1e3;
var DEFAULT_RESOLUTION_CACHE_MAX_ENTRIES = 256;
var TASTE_RESOLVER_HEALTH_UPSTREAMS = [
  "gemma",
  "postgres",
  "qloo_search",
  "redis"
];
var QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE = "QLOO_RESOLUTION_PROVIDER";
var TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE = "TASTE_RESOLVER_URL";
var TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE = "TASTE_RESOLVER_API_KEY";
var QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE = "QLOO_TRUSTED_TASTE_RESOLVER_URL";
var QLOO_TASTE_RESOLVER_TAG_ENDPOINT_ENVIRONMENT_VARIABLE = "QLOO_TASTE_RESOLVER_TAG_ENDPOINT";
var QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE = "QLOO_TASTE_RESOLVER_MIN_SCORE";
var QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE = "QLOO_TASTE_RESOLVER_MIN_MARGIN";
var QlooResolutionProviderError = class extends Error {
  code;
  retryable;
  recovery;
  status;
  constructor(code, message, options) {
    super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
    this.name = "QlooResolutionProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.recovery = options.recovery;
    if (options.status !== void 0)
      this.status = options.status;
  }
};
function nonEmptyString(value) {
  if (typeof value !== "string")
    return void 0;
  const trimmed = value.trim();
  return trimmed || void 0;
}
function parseUnitInterval(value, name, defaultValue) {
  if (value === void 0 || value === null || value === "")
    return defaultValue;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", `${name} must be a number from 0 through 1.`, { recovery: `Set ${name} to a decimal from 0 through 1.` });
  }
  return parsed;
}
function parseTasteResolverTagEndpoint(value) {
  const endpoint = nonEmptyString(value) ?? "legacy";
  if (endpoint === "legacy" || endpoint === "structured")
    return endpoint;
  throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", `${QLOO_TASTE_RESOLVER_TAG_ENDPOINT_ENVIRONMENT_VARIABLE} must be legacy or structured.`, {
    recovery: `Use legacy for POST /v1/resolve or structured for POST /v1/tags/resolve.`
  });
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function resultArray(response, key) {
  if (Array.isArray(response.results))
    return response.results;
  return asArray(asRecord(response.results)?.[key] ?? response.results ?? []);
}
function scalar(record, ...keys) {
  for (const key of keys) {
    if (record[key] !== void 0 && record[key] !== null)
      return record[key];
  }
  return void 0;
}
function normalizeName(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}
var ENTITY_CONTEXT_STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with"
]);
function contextTokens(value) {
  return [...new Set(value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length >= 2 && !ENTITY_CONTEXT_STOP_WORDS.has(token)) ?? [])];
}
function candidateContextText(candidate) {
  const address = typeof candidate.address === "string" ? candidate.address : candidate.address === void 0 ? "" : JSON.stringify(candidate.address);
  return [candidate.name, candidate.type, candidate.description, address].filter((value) => typeof value === "string").join(" ");
}
function contextualEntityMatch(input, candidates) {
  if (candidates.length < 2)
    return { candidates };
  const inputTokens = contextTokens(input);
  if (inputTokens.length < 2)
    return { candidates };
  const ranked = candidates.map((candidate) => {
    const searchable = new Set(contextTokens(candidateContextText(candidate)));
    return {
      candidate,
      matched: inputTokens.filter((token) => searchable.has(token)).length
    };
  });
  const maximum = Math.max(...ranked.map(({ matched }) => matched));
  const strongest = ranked.filter(({ matched }) => matched === maximum);
  const decisive = maximum === inputTokens.length && strongest.length === 1 && ranked.some(({ matched }) => matched < maximum);
  if (decisive && strongest[0]) {
    return {
      candidates: [strongest[0].candidate],
      selected: strongest[0].candidate,
      alternatives: candidates.filter(({ id }) => id !== strongest[0]?.candidate.id).slice(0, 4),
      warning: "Qloo selected the only candidate matching every supplied name and location term; reuse its Qloo ID to override future name resolution."
    };
  }
  if (maximum === inputTokens.length && strongest.length < candidates.length) {
    return {
      candidates: strongest.map(({ candidate }) => candidate),
      warning: "Qloo candidate choices were narrowed using the supplied name and location terms."
    };
  }
  return { candidates };
}
function requestOptions(context) {
  return {
    ...context.signal ? { signal: context.signal } : {},
    correlationId: context.correlationId
  };
}
function entityType(record) {
  const directType = scalar(record, "subtype", "type");
  if (typeof directType === "string" && directType)
    return directType;
  const types = asArray(record.types).filter((type) => typeof type === "string" && type.length > 0);
  return types.find((type) => type.startsWith("urn:entity:")) ?? types[0];
}
function entityReleaseYear(properties) {
  const value = properties?.release_year;
  if (typeof value === "number" && Number.isInteger(value))
    return value;
  if (typeof value === "string" && /^\d{4}$/u.test(value))
    return Number(value);
  const releaseDate = properties?.release_date;
  if (typeof releaseDate !== "string")
    return void 0;
  const year = /^(\d{4})(?:-|$)/u.exec(releaseDate)?.[1];
  return year ? Number(year) : void 0;
}
function entityCandidate(value) {
  const record = asRecord(value);
  if (!record)
    return void 0;
  const id = scalar(record, "entity_id", "id");
  const name = record.name;
  if (typeof id !== "string" || !id || typeof name !== "string" || !name)
    return void 0;
  const properties = asRecord(record.properties);
  const type = entityType(record);
  const description = nonEmptyString(scalar(record, "short_description", "description") ?? scalar(properties ?? {}, "short_description", "description"));
  const releaseYear = entityReleaseYear(properties);
  const address = record.address ?? properties?.address;
  return {
    id,
    name,
    ...type ? { type } : {},
    ...typeof record.popularity === "number" ? { popularity: record.popularity } : {},
    ...description ? { description: description.slice(0, 500) } : {},
    ...releaseYear !== void 0 ? { release_year: releaseYear } : {},
    ...address !== void 0 ? { address } : {}
  };
}
function tagCandidate(value, rank) {
  const record = asRecord(value);
  if (!record)
    return void 0;
  const id = scalar(record, "id", "tag_id");
  const name = record.name;
  if (typeof id !== "string" || !id || typeof name !== "string" || !name)
    return void 0;
  const type = scalar(record, "type", "subtype");
  const query = asRecord(record.query);
  const score = typeof record.score === "number" ? record.score : typeof record.affinity === "number" ? record.affinity : typeof query?.affinity === "number" ? query.affinity : void 0;
  const parentTypes = [...new Set(asArray(record.parents).map(asRecord).map((parent) => parent ? scalar(parent, "type") : void 0).filter((type2) => typeof type2 === "string" && type2.length > 0))].slice(0, 20);
  return {
    id,
    name,
    ...typeof type === "string" && type ? { type } : {},
    ...rank !== void 0 ? { rank } : {},
    ...score !== void 0 ? { score } : {},
    ...typeof record.popularity === "number" ? { popularity: record.popularity } : {},
    ...parentTypes.length > 0 ? { parent_types: parentTypes } : {}
  };
}
function provenance(descriptor, endpoint, strategy, extras = {}) {
  return {
    contract_version: QLOO_RESOLUTION_CONTRACT_VERSION,
    provider_id: descriptor.provider_id,
    provider_name: descriptor.name,
    endpoint,
    strategy,
    remote: descriptor.remote,
    uses_model: descriptor.uses_model,
    ...extras.providerVersion ? { provider_version: extras.providerVersion } : {},
    ...extras.cacheStatus ? { cache_status: extras.cacheStatus } : {}
  };
}
function resolved(input, selected, match, source, options = {}) {
  return {
    input,
    status: "resolved",
    match,
    selected,
    provenance: source,
    ...options.alternatives && options.alternatives.length > 0 ? { alternatives: [...options.alternatives] } : {},
    ...options.warnings && options.warnings.length > 0 ? { warnings: [...options.warnings] } : {}
  };
}
function createNativeQlooResolutionProvider(client, options = {}) {
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_RESOLUTION_CACHE_TTL_MS;
  const cacheMaxEntries = options.cacheMaxEntries ?? DEFAULT_RESOLUTION_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 1) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Native Qloo resolution cache TTL must be a positive integer.", { recovery: "Configure a positive cache TTL in milliseconds." });
  }
  if (!Number.isSafeInteger(cacheMaxEntries) || cacheMaxEntries < 0) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Native Qloo resolution cache capacity must be a non-negative integer.", { recovery: "Configure zero to disable caching or a positive entry limit." });
  }
  const descriptor = {
    contract_version: QLOO_RESOLUTION_CONTRACT_VERSION,
    provider_id: "qloo_api",
    name: "Qloo native resolution",
    entity_strategy: "exact_name_context_or_choice",
    tag_strategy: "target_scoped_semantic_search_exact_name_or_choice",
    remote: true,
    uses_model: false,
    fallback: "none"
  };
  const cache = /* @__PURE__ */ new Map();
  const cacheKey = (kind, input, scope) => JSON.stringify([
    QLOO_RESOLUTION_CONTRACT_VERSION,
    descriptor.provider_id,
    descriptor.entity_strategy,
    descriptor.tag_strategy,
    kind,
    scope ?? "",
    normalizeName(input)
  ]);
  const cachedOutcome = (kind, input, scope) => {
    if (cacheMaxEntries === 0)
      return void 0;
    const key = cacheKey(kind, input, scope);
    const entry = cache.get(key);
    if (!entry)
      return void 0;
    if (entry.expiresAt <= now()) {
      cache.delete(key);
      return void 0;
    }
    cache.delete(key);
    cache.set(key, entry);
    return {
      ...structuredClone(entry.outcome),
      input,
      provenance: {
        ...entry.outcome.provenance,
        cache_status: "memory_hit"
      }
    };
  };
  const rememberOutcome = (kind, input, scope, outcome) => {
    if (cacheMaxEntries === 0)
      return outcome;
    const key = cacheKey(kind, input, scope);
    cache.delete(key);
    cache.set(key, {
      expiresAt: now() + cacheTtlMs,
      outcome: structuredClone(outcome)
    });
    while (cache.size > cacheMaxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === void 0)
        break;
      cache.delete(oldest);
    }
    return outcome;
  };
  const resolveEntity = async (input, type, context) => {
    if (UUID_PATTERN.test(input)) {
      const source2 = provenance(descriptor, "/entities", "identifier_lookup");
      const response2 = await client.entities([input], requestOptions(context));
      const candidates2 = resultArray(response2, "entities").map(entityCandidate).filter((candidate) => candidate !== void 0);
      const exact2 = candidates2.filter(({ id }) => id.toLocaleLowerCase("en-US") === input.toLocaleLowerCase("en-US"));
      if (exact2.length === 1 && exact2[0])
        return resolved(input, exact2[0], "identifier", source2);
      if (exact2.length > 1)
        return { input, status: "ambiguous", candidates: exact2.slice(0, 5), provenance: source2 };
      return { input, status: "not_found", provenance: source2 };
    }
    const source = provenance(descriptor, "/search", "exact_name_context_or_choice");
    const response = await client.searchEntities({
      query: input,
      ...type ? { types: type } : {},
      take: 5
    }, requestOptions(context));
    const candidates = resultArray(response, "entities").map(entityCandidate).filter((candidate) => candidate !== void 0);
    if (candidates.length === 0)
      return { input, status: "not_found", provenance: source };
    const exact = candidates.filter(({ name }) => normalizeName(name) === normalizeName(input));
    if (exact.length === 1 && exact[0]) {
      const alternatives = candidates.filter(({ id }) => id !== exact[0]?.id).slice(0, 4);
      return resolved(input, exact[0], "exact", source, { alternatives });
    }
    const contextual = contextualEntityMatch(input, candidates);
    if (contextual.selected) {
      return resolved(input, contextual.selected, "semantic", source, {
        ...contextual.alternatives ? { alternatives: contextual.alternatives } : {},
        ...contextual.warning ? { warnings: [contextual.warning] } : {}
      });
    }
    return {
      input,
      status: "ambiguous",
      candidates: (exact.length > 0 ? exact : contextual.candidates).slice(0, 5),
      provenance: source,
      ...contextual.warning ? { warnings: [contextual.warning] } : {}
    };
  };
  const resolveTag = async (input, targetType, context) => {
    if (input.startsWith(TAG_URN_PREFIX)) {
      return resolved(input, { id: input, name: input }, "identifier", provenance(descriptor, "local:tag-urn", "supplied_identifier"));
    }
    const source = provenance(descriptor, "/v2/tags", targetType ? "semantic_search_local_parent_scope_exact_name_or_choice" : "semantic_search_exact_name_or_choice");
    const response = await client.tags({
      "filter.query": input,
      "feature.semantic_search": true,
      take: 20
    }, requestOptions(context));
    const rankedCandidates = resultArray(response, "tags").map((value, index) => tagCandidate(value, index + 1)).filter((candidate) => candidate !== void 0);
    const candidatesWithParentMetadata = rankedCandidates.filter(({ parent_types: parentTypes }) => parentTypes !== void 0 && parentTypes.length > 0);
    const candidates = targetType && candidatesWithParentMetadata.length > 0 ? rankedCandidates.filter(({ parent_types: parentTypes }) => parentTypes?.includes(targetType)) : rankedCandidates;
    const scopeWarnings = targetType && candidatesWithParentMetadata.length === 0 && rankedCandidates.length > 0 ? [
      `Qloo tag candidates did not include parent-type metadata, so the bounded choices could not be scoped to ${targetType}.`
    ] : [];
    if (targetType && candidatesWithParentMetadata.length > 0 && candidates.length === 0) {
      return {
        input,
        status: "not_found",
        provenance: source,
        warnings: [
          `No candidate in the first ${rankedCandidates.length} Qloo semantic tag results supports ${targetType}.`
        ]
      };
    }
    if (candidates.length === 0)
      return { input, status: "not_found", provenance: source };
    const exact = candidates.filter(({ name }) => normalizeName(name) === normalizeName(input));
    if (exact.length === 1 && exact[0]) {
      const alternatives = candidates.filter(({ id }) => id !== exact[0]?.id).slice(0, 4);
      return resolved(input, exact[0], "exact", source, {
        alternatives,
        warnings: scopeWarnings
      });
    }
    return {
      input,
      status: "ambiguous",
      candidates: (exact.length > 0 ? exact : candidates).slice(0, 5),
      provenance: source,
      warnings: [
        ...scopeWarnings,
        ...exact.length === 0 ? [
          "Qloo semantic search returned ranked candidates without a calibrated relevance score; choose one before the workflow continues."
        ] : []
      ]
    };
  };
  return {
    descriptor,
    async resolveEntities(request, context) {
      return {
        outcomes: await Promise.all(request.inputs.map((input) => cachedOutcome("entity", input, request.type) ?? resolveEntity(input, request.type, context).then((outcome) => rememberOutcome("entity", input, request.type, outcome))))
      };
    },
    async resolveTags(request, context) {
      return {
        outcomes: await Promise.all(request.inputs.map((input) => input.startsWith(TAG_URN_PREFIX) ? resolveTag(input, request.targetType, context) : cachedOutcome("tag", input, request.targetType) ?? resolveTag(input, request.targetType, context).then((outcome) => rememberOutcome("tag", input, request.targetType, outcome))))
      };
    }
  };
}
function createPublicQlooResolutionProvider(client, options = {}) {
  return createNativeQlooResolutionProvider(client, options);
}
function normalizeResolverBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver URL is invalid.", {
      cause,
      recovery: "Set TASTE_RESOLVER_URL to an absolute HTTPS URL or a loopback HTTP URL."
    });
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver URL must use HTTPS unless it is a loopback development endpoint.", {
      recovery: "Use HTTPS or run the resolver on localhost for local development."
    });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver URL cannot contain credentials, query parameters, or a fragment.", {
      recovery: "Move resolver authentication to TASTE_RESOLVER_API_KEY and use a clean base URL."
    });
  }
  url.pathname = url.pathname.replace(/\/+$/u, "") + "/";
  return url;
}
function resolverUrlsMatch(left, right) {
  try {
    return normalizeResolverBaseUrl(left).toString() === normalizeResolverBaseUrl(right).toString();
  } catch {
    return false;
  }
}
function requireTrustedResolverBaseUrl(baseUrl, trustedBaseUrl) {
  const normalized = normalizeResolverBaseUrl(baseUrl);
  const isLoopback = normalized.hostname === "localhost" || normalized.hostname === "127.0.0.1" || normalized.hostname === "[::1]";
  if (!isLoopback && (!trustedBaseUrl || !resolverUrlsMatch(baseUrl, trustedBaseUrl))) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Remote taste-resolver URL is not explicitly trusted.", {
      recovery: `Set ${QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE} to the exact resolver base URL.`
    });
  }
  return normalized;
}
function inspectQlooResolutionProviderConfiguration(options = {}) {
  const env = options.env ?? process.env;
  const selection = nonEmptyString(env[QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE]) ?? "native";
  if (selection === "native" || selection === "public") {
    return {
      selection,
      valid: true,
      providerId: "qloo_api",
      endpoint: "/search and /v2/tags",
      trusted: true,
      authenticated: false,
      usesModel: false,
      message: selection === "public" ? "Native, server-free Qloo resolution is active through the legacy public alias; semantic tag candidates are target-scoped and material ambiguity requires a choice." : "Native, server-free Qloo resolution is active; semantic tag candidates are target-scoped and material ambiguity requires a choice."
    };
  }
  if (selection !== "taste-resolver") {
    return {
      selection,
      valid: false,
      trusted: false,
      authenticated: false,
      usesModel: false,
      message: `Unsupported Qloo resolution provider "${selection}".`,
      recovery: `Set ${QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE} to native or taste-resolver. The value public remains a compatibility alias.`
    };
  }
  const configuredBaseUrl = nonEmptyString(env[TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE]) ?? nonEmptyString(options.fileConfig?.taste_resolver_url);
  if (!configuredBaseUrl) {
    return {
      selection,
      valid: false,
      providerId: "taste_resolver_assisted",
      trusted: false,
      authenticated: Boolean(nonEmptyString(env[TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE])),
      usesModel: true,
      message: "Taste-resolver assistance is selected but no resolver URL is configured.",
      recovery: `Set ${TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE} and ${QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE}.`
    };
  }
  const trustedBaseUrl = nonEmptyString(env[QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE]);
  try {
    const endpoint = requireTrustedResolverBaseUrl(configuredBaseUrl, trustedBaseUrl);
    const tagEndpoint = parseTasteResolverTagEndpoint(env[QLOO_TASTE_RESOLVER_TAG_ENDPOINT_ENVIRONMENT_VARIABLE]);
    const minimumSemanticScore = parseUnitInterval(env[QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE], QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE, DEFAULT_MINIMUM_SEMANTIC_SCORE);
    const minimumSemanticScoreMargin = parseUnitInterval(env[QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE], QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE, DEFAULT_MINIMUM_SEMANTIC_SCORE_MARGIN);
    return {
      selection,
      valid: true,
      providerId: "taste_resolver_assisted",
      endpoint: endpoint.toString().replace(/\/$/u, ""),
      trusted: true,
      authenticated: Boolean(nonEmptyString(env[TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE])),
      usesModel: true,
      tagEndpoint,
      minimumSemanticScore,
      minimumSemanticScoreMargin,
      message: `Taste-resolver semantic tag assistance is explicitly selected in ${tagEndpoint} mode with score \u2265 ${minimumSemanticScore} and margin \u2265 ${minimumSemanticScoreMargin}; entity resolution remains on the Qloo API and no fallback is enabled.`
    };
  } catch (error) {
    const providerError = error instanceof QlooResolutionProviderError ? error : void 0;
    return {
      selection,
      valid: false,
      providerId: "taste_resolver_assisted",
      trusted: false,
      authenticated: Boolean(nonEmptyString(env[TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE])),
      usesModel: true,
      message: providerError?.message ?? "Taste-resolver configuration is invalid.",
      recovery: providerError?.recovery ?? "Correct the taste-resolver endpoint configuration."
    };
  }
}
async function readBoundedResponse(response, maximumBytes) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maximumBytes) {
    await response.body?.cancel();
    throw new QlooResolutionProviderError("RESOLVER_CONTRACT", "Taste-resolver response exceeded the configured size limit.", {
      recovery: "Inspect the resolver deployment and return only bounded resolution metadata."
    });
  }
  if (!response.body)
    return {};
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done)
      break;
    if (!value)
      continue;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new QlooResolutionProviderError("RESOLVER_CONTRACT", "Taste-resolver response exceeded the configured size limit.", {
        recovery: "Inspect the resolver deployment and return only bounded resolution metadata."
      });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text.trim())
    return {};
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new QlooResolutionProviderError("RESOLVER_CONTRACT", "Taste-resolver returned invalid JSON.", {
      cause,
      recovery: "Verify that the configured endpoint implements the taste-resolver v1 contract."
    });
  }
}
function resolverHealthFailure(kind, message, startedAt, options = {}) {
  return {
    ok: false,
    kind,
    message,
    durationMs: Math.max(0, Date.now() - startedAt),
    retryable: options.retryable ?? false,
    ...options.status === void 0 ? {} : { status: options.status }
  };
}
async function probeTasteResolverHealth(options) {
  const startedAt = Date.now();
  let baseUrl;
  try {
    baseUrl = requireTrustedResolverBaseUrl(options.baseUrl, options.trustedBaseUrl);
  } catch {
    return resolverHealthFailure("resolver-contract", "Taste-resolver health cannot be checked until its endpoint is valid and explicitly trusted.", startedAt);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_RESOLVER_HEALTH_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESOLVER_HEALTH_RESPONSE_BYTES;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    return resolverHealthFailure("resolver-contract", "Taste-resolver health limits must be positive integers.", startedAt);
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Taste-resolver health check timed out."));
  }, timeoutMs);
  timeout.unref?.();
  const onAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted)
    onAbort();
  else
    options.signal?.addEventListener("abort", onAbort, { once: true });
  const cleanup = () => {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  };
  try {
    const response = await (options.fetch ?? globalThis.fetch)(new URL("v1/health", baseUrl), {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal
    });
    const body = await readBoundedResponse(response, maxResponseBytes);
    if (!response.ok) {
      return resolverHealthFailure("resolver-http", `Taste-resolver health returned HTTP ${response.status}.`, startedAt, { retryable: response.status === 429 || response.status >= 500, status: response.status });
    }
    const record = asRecord(body);
    const status = nonEmptyString(record?.status);
    const upstreams = asRecord(record?.upstreams);
    if (status !== "ok" && status !== "degraded" || !upstreams || TASTE_RESOLVER_HEALTH_UPSTREAMS.some((name) => !nonEmptyString(upstreams[name]))) {
      return resolverHealthFailure("resolver-contract", "Taste-resolver health response does not match the v1 contract.", startedAt);
    }
    const unavailable = TASTE_RESOLVER_HEALTH_UPSTREAMS.filter((name) => upstreams[name] !== "ok");
    if (status === "degraded" || unavailable.length > 0) {
      return resolverHealthFailure("resolver-degraded", unavailable.length > 0 ? `Taste-resolver is degraded; unavailable upstreams: ${unavailable.join(", ")}.` : "Taste-resolver is degraded.", startedAt, { retryable: true });
    }
    return {
      ok: true,
      kind: "resolver-healthy",
      message: "Taste-resolver and its declared upstreams are healthy.",
      durationMs: Math.max(0, Date.now() - startedAt),
      retryable: false
    };
  } catch (error) {
    if (timedOut) {
      return resolverHealthFailure("resolver-timeout", "Taste-resolver health check timed out.", startedAt, { retryable: true });
    }
    if (error instanceof QlooResolutionProviderError) {
      return resolverHealthFailure("resolver-contract", error.message, startedAt);
    }
    return resolverHealthFailure("resolver-connect", options.signal?.aborted ? "Taste-resolver health check was cancelled." : "Taste-resolver health endpoint is not reachable.", startedAt, { retryable: !options.signal?.aborted });
  } finally {
    cleanup();
  }
}
function createTasteResolverAssistedResolutionProvider(options) {
  const baseUrl = requireTrustedResolverBaseUrl(options.baseUrl, options.trustedBaseUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RESOLVER_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESOLVER_RESPONSE_BYTES;
  const tagEndpoint = parseTasteResolverTagEndpoint(options.tagEndpoint);
  const minimumSemanticScore = parseUnitInterval(options.minimumSemanticScore, "minimumSemanticScore", DEFAULT_MINIMUM_SEMANTIC_SCORE);
  const minimumSemanticScoreMargin = parseUnitInterval(options.minimumSemanticScoreMargin, "minimumSemanticScoreMargin", DEFAULT_MINIMUM_SEMANTIC_SCORE_MARGIN);
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_RESOLUTION_CACHE_TTL_MS;
  const cacheMaxEntries = options.cacheMaxEntries ?? DEFAULT_RESOLUTION_CACHE_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver timeout must be a positive integer.", { recovery: "Configure a positive resolver timeout in milliseconds." });
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver response limit must be a positive integer.", { recovery: "Configure a positive resolver response-size limit." });
  }
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 1) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver cache TTL must be a positive integer.", { recovery: "Configure a positive cache TTL in milliseconds." });
  }
  if (!Number.isSafeInteger(cacheMaxEntries) || cacheMaxEntries < 0) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver cache capacity must be a non-negative integer.", { recovery: "Configure zero to disable caching or a positive entry limit." });
  }
  const descriptor = {
    contract_version: QLOO_RESOLUTION_CONTRACT_VERSION,
    provider_id: "taste_resolver_assisted",
    name: "Qloo taste-resolver assistance",
    entity_strategy: "qloo_api_exact_name_or_choice",
    tag_strategy: tagEndpoint === "structured" ? "taste_resolver_structured_tag_rerank_confidence_gated" : "taste_resolver_semantic_rerank_confidence_gated",
    remote: true,
    uses_model: true,
    fallback: "none"
  };
  const cache = /* @__PURE__ */ new Map();
  const cacheKey = (input, targetType) => JSON.stringify([
    QLOO_RESOLUTION_CONTRACT_VERSION,
    descriptor.provider_id,
    tagEndpoint,
    targetType ?? "",
    normalizeName(input)
  ]);
  const cachedOutcome = (input, targetType) => {
    if (cacheMaxEntries === 0)
      return void 0;
    const key = cacheKey(input, targetType);
    const entry = cache.get(key);
    if (!entry)
      return void 0;
    if (entry.expiresAt <= now()) {
      cache.delete(key);
      return void 0;
    }
    cache.delete(key);
    cache.set(key, entry);
    return {
      ...structuredClone(entry.outcome),
      input,
      provenance: {
        ...entry.outcome.provenance,
        cache_status: "memory_hit"
      }
    };
  };
  const rememberOutcome = (input, targetType, outcome) => {
    if (cacheMaxEntries === 0)
      return outcome;
    const key = cacheKey(input, targetType);
    cache.delete(key);
    cache.set(key, { expiresAt: now() + cacheTtlMs, outcome: structuredClone(outcome) });
    while (cache.size > cacheMaxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === void 0)
        break;
      cache.delete(oldest);
    }
    return outcome;
  };
  const resolveSemanticTag = async (input, targetType, context) => {
    if (input.length > 1e3) {
      throw new QlooResolutionProviderError("RESOLVER_CONTRACT", "Taste-resolver inputs cannot exceed 1000 characters.", { recovery: "Shorten the tag concept and retry the same structured workflow." });
    }
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Taste-resolver request timed out."));
    }, timeoutMs);
    timeout.unref?.();
    const onAbort = () => controller.abort(context.signal?.reason);
    if (context.signal?.aborted)
      onAbort();
    else
      context.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", onAbort);
    };
    let response;
    try {
      response = await fetchImplementation(new URL(tagEndpoint === "structured" ? "v1/tags/resolve" : "v1/resolve", baseUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Correlation-Id": context.correlationId,
          ...options.apiKey ? { "X-Api-Key": options.apiKey } : {}
        },
        body: JSON.stringify(tagEndpoint === "structured" ? {
          inputs: [input],
          ...targetType ? { filter_type: targetType } : {},
          take: 5
        } : {
          input,
          ...targetType ? { filter_type: targetType } : {},
          options: { take: 5, explain: true }
        }),
        redirect: "error",
        signal: controller.signal
      });
    } catch (cause) {
      cleanup();
      if (context.signal?.aborted) {
        throw new QlooResolutionProviderError("RESOLVER_ABORTED", "Taste-resolver request was cancelled.", {
          cause,
          recovery: "Retry only if the workflow was cancelled unintentionally."
        });
      }
      if (timedOut) {
        throw new QlooResolutionProviderError("RESOLVER_TIMEOUT", "Taste-resolver request timed out.", {
          cause,
          retryable: true,
          recovery: "Check resolver health and retry the same interpreted request once."
        });
      }
      throw new QlooResolutionProviderError("RESOLVER_CONNECT", "Taste-resolver is not reachable.", {
        cause,
        retryable: true,
        recovery: "Verify TASTE_RESOLVER_URL, VPN routing, and resolver health before retrying."
      });
    }
    let body;
    try {
      body = await readBoundedResponse(response, maxResponseBytes);
    } catch (cause) {
      if (cause instanceof QlooResolutionProviderError)
        throw cause;
      if (context.signal?.aborted) {
        throw new QlooResolutionProviderError("RESOLVER_ABORTED", "Taste-resolver request was cancelled.", {
          cause,
          recovery: "Retry only if the workflow was cancelled unintentionally."
        });
      }
      if (timedOut) {
        throw new QlooResolutionProviderError("RESOLVER_TIMEOUT", "Taste-resolver response timed out.", {
          cause,
          retryable: true,
          recovery: "Check resolver health and retry the same interpreted request once."
        });
      }
      throw new QlooResolutionProviderError("RESOLVER_CONNECT", "Taste-resolver response could not be read completely.", {
        cause,
        retryable: true,
        recovery: "Check resolver health and retry the same interpreted request once."
      });
    } finally {
      cleanup();
    }
    if (!response.ok) {
      const status = response.status;
      const code = status === 401 || status === 403 ? "RESOLVER_AUTH" : status >= 500 || status === 429 ? "RESOLVER_UPSTREAM" : "RESOLVER_CONTRACT";
      throw new QlooResolutionProviderError(code, `Taste-resolver returned HTTP ${status}.`, {
        status,
        retryable: status >= 500 || status === 429,
        recovery: status === 401 || status === 403 ? "Configure a valid TASTE_RESOLVER_API_KEY before retrying." : status >= 500 || status === 429 ? "Check resolver health and retry the same interpreted request once." : `Verify that the hosted resolver implements the ${tagEndpoint === "structured" ? "v1 tags/resolve" : "v1 resolve"} contract.`
      });
    }
    const record = asRecord(body);
    const resolution = asRecord(record?.resolution);
    const groups = asArray(tagEndpoint === "structured" ? record?.tags : resolution?.tags).map(asRecord).filter((group) => group !== void 0);
    const matchingGroup = groups.find((group) => {
      const groupInput = group.input;
      return typeof groupInput === "string" && normalizeName(groupInput) === normalizeName(input);
    }) ?? groups[0];
    const candidates = asArray(matchingGroup?.tags).map((value) => tagCandidate(value)).filter((candidate) => candidate !== void 0).sort((left, right) => (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY)).slice(0, 5);
    const cacheStatus = nonEmptyString(record?.cache_status);
    const providerVersion = nonEmptyString(record?.contract_version ?? record?.version);
    const source = provenance(descriptor, tagEndpoint === "structured" ? "/v1/tags/resolve" : "/v1/resolve", tagEndpoint === "structured" ? "structured_semantic_embedding_taxonomy_rerank" : "semantic_embedding_taxonomy_rerank", {
      ...cacheStatus ? { cacheStatus } : {},
      ...providerVersion ? { providerVersion } : {}
    });
    const responseWarnings = asArray(record?.warnings).filter((warning) => typeof warning === "string").slice(0, 10);
    if (candidates.length === 0) {
      return {
        input,
        status: "not_found",
        provenance: source,
        ...responseWarnings.length > 0 ? { warnings: responseWarnings } : {}
      };
    }
    const exact = candidates.filter(({ name }) => normalizeName(name) === normalizeName(input));
    if (exact.length > 1) {
      return {
        input,
        status: "ambiguous",
        candidates: exact,
        provenance: source,
        ...responseWarnings.length > 0 ? { warnings: responseWarnings } : {}
      };
    }
    const selected = exact[0] ?? candidates[0];
    if (!selected) {
      return { input, status: "not_found", provenance: source };
    }
    const alternatives = candidates.filter(({ id }) => id !== selected.id).slice(0, 4);
    if (exact.length === 0) {
      const runnerUp = alternatives[0];
      const score = selected.score;
      const margin = score !== void 0 && runnerUp?.score !== void 0 ? score - runnerUp.score : runnerUp === void 0 ? Number.POSITIVE_INFINITY : void 0;
      const confidenceWarnings = [
        ...score === void 0 || score < 0 || score > 1 ? ["The top semantic candidate did not provide a valid normalized score."] : score < minimumSemanticScore ? [`The top semantic score ${score.toFixed(3)} is below the required ${minimumSemanticScore.toFixed(3)}.`] : [],
        ...margin === void 0 ? ["The resolver did not provide enough score information to distinguish the top candidates."] : margin < minimumSemanticScoreMargin ? [`The top semantic candidates are separated by ${margin.toFixed(3)}, below the required ${minimumSemanticScoreMargin.toFixed(3)}.`] : []
      ];
      if (confidenceWarnings.length > 0) {
        return {
          input,
          status: "ambiguous",
          candidates,
          provenance: source,
          warnings: [...responseWarnings, ...confidenceWarnings]
        };
      }
    }
    const semanticWarning = exact.length === 0 ? `Taste-resolver selected "${selected.name}" as the top semantic match for "${input}"; alternatives remain available in resolution provenance.` : void 0;
    const warnings = [...responseWarnings, ...semanticWarning ? [semanticWarning] : []];
    return resolved(input, selected, exact.length === 1 ? "exact" : "semantic", source, {
      alternatives,
      warnings
    });
  };
  return {
    descriptor,
    resolveEntities: (request, context) => options.entityProvider.resolveEntities(request, context),
    async resolveTags(request, context) {
      const outcomes = await Promise.all(request.inputs.map((input) => input.startsWith(TAG_URN_PREFIX) ? options.entityProvider.resolveTags({ ...request, inputs: [input] }, context).then((batch) => batch.outcomes[0] ?? {
        input,
        status: "not_found",
        provenance: provenance(descriptor, "local:tag-urn", "supplied_identifier")
      }) : cachedOutcome(input, request.targetType) ?? resolveSemanticTag(input, request.targetType, context).then((outcome) => rememberOutcome(input, request.targetType, outcome))));
      return { outcomes };
    }
  };
}
function createQlooResolutionProviderFromEnvironment(options) {
  const env = options.env ?? process.env;
  const selection = nonEmptyString(env[QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE]) ?? "native";
  const nativeProvider = createNativeQlooResolutionProvider(options.client);
  if (selection === "native" || selection === "public")
    return nativeProvider;
  if (selection !== "taste-resolver") {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", `Unsupported Qloo resolution provider "${selection}".`, {
      recovery: `Set ${QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE} to native or taste-resolver. The value public remains a compatibility alias.`
    });
  }
  const baseUrl = nonEmptyString(env[TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE]) ?? nonEmptyString(options.fileConfig?.taste_resolver_url);
  if (!baseUrl) {
    throw new QlooResolutionProviderError("RESOLVER_CONFIGURATION", "Taste-resolver assistance was selected but no resolver URL is configured.", {
      recovery: `Set ${TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE} and ${QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE}, or select the native provider.`
    });
  }
  const trustedBaseUrl = nonEmptyString(env[QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE]);
  const apiKey = nonEmptyString(env[TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE]);
  const tagEndpoint = parseTasteResolverTagEndpoint(env[QLOO_TASTE_RESOLVER_TAG_ENDPOINT_ENVIRONMENT_VARIABLE]);
  const minimumSemanticScore = parseUnitInterval(env[QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE], QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE, DEFAULT_MINIMUM_SEMANTIC_SCORE);
  const minimumSemanticScoreMargin = parseUnitInterval(env[QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE], QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE, DEFAULT_MINIMUM_SEMANTIC_SCORE_MARGIN);
  return createTasteResolverAssistedResolutionProvider({
    baseUrl,
    ...trustedBaseUrl ? { trustedBaseUrl } : {},
    ...apiKey ? { apiKey } : {},
    tagEndpoint,
    minimumSemanticScore,
    minimumSemanticScoreMargin,
    entityProvider: nativeProvider,
    ...options.fetch ? { fetch: options.fetch } : {}
  });
}
export {
  QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE,
  QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE,
  QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE,
  QLOO_TASTE_RESOLVER_TAG_ENDPOINT_ENVIRONMENT_VARIABLE,
  QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE,
  QlooResolutionProviderError,
  TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE,
  TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE,
  createNativeQlooResolutionProvider,
  createPublicQlooResolutionProvider,
  createQlooResolutionProviderFromEnvironment,
  createTasteResolverAssistedResolutionProvider,
  inspectQlooResolutionProviderConfiguration,
  probeTasteResolverHealth
};
