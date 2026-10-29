import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);

// packages/qloo-tool-schema/dist/upstream.lock.json
var upstream_lock_default = {
  lockVersion: 1,
  source: {
    documentationUrl: "https://docs.qloo.com",
    registryUrl: "https://dash.readme.com/api/v1/api-registry/4svkj1svmrti5tfx",
    registryId: "4svkj1svmrti5tfx",
    retrievedAt: "2026-08-20",
    apiTitle: "Qloo API",
    apiVersion: "2.0",
    openapiVersion: "3.1.0",
    sha256: "da8d4b830f2a646815d25afcaa653f81f1ad939707e2e2560d2d0b9f103076f1"
  },
  expectations: {
    productionServer: "https://api.qloo.com",
    authentication: {
      scheme: "ApiKey",
      type: "apiKey",
      location: "header",
      header: "X-Api-Key"
    },
    getPaths: [
      "/",
      "/entities",
      "/search",
      "/v2/analysis/compare",
      "/v2/audiences",
      "/v2/audiences/types",
      "/v2/insights",
      "/v2/tags",
      "/v2/tags/types",
      "/v2/trending"
    ]
  },
  documentedExceptions: [
    {
      value: "urn:demographics",
      scope: "/v2/insights filter.type",
      status: "documented-but-not-enumerated",
      documentationUrl: "https://docs.qloo.com/reference/demographics-use-case",
      treatment: "Preserve as an explicit documentation exception; do not synthesize an endpoint payload schema from it."
    },
    {
      value: "urn:tag",
      scope: "/v2/insights filter.type",
      status: "documented-but-not-enumerated",
      documentationUrl: "https://docs.qloo.com/reference/taste-analysis",
      treatment: "The pinned specification mentions this value in diversify.by documentation but omits it from the filter.type enum; preserve the discrepancy for review."
    }
  ]
};

// packages/qloo-tool-schema/dist/src/catalog.js
var QLOO_TOOL_CATALOG_VERSION = "1.0.0";
var QLOO_TOOL_RESULT_SCHEMA_VERSION = "1.0-preview.1";
var QLOO_WORKFLOW_OPERATION_IDS = [
  "recommend",
  "rank",
  "describe",
  "where_popular",
  "compare_audiences",
  "entity_tags",
  "audience_demographics",
  "trends",
  "find_tags"
];
var QLOO_CAPABILITIES_TOOL_NAME = "qloo_capabilities";
var QLOO_INSIGHTS_ENTITY_TYPES = [
  { id: "artist", urn: "urn:entity:artist" },
  { id: "book", urn: "urn:entity:book" },
  { id: "brand", urn: "urn:entity:brand" },
  { id: "movie", urn: "urn:entity:movie" },
  { id: "person", urn: "urn:entity:person" },
  { id: "place", urn: "urn:entity:place" },
  { id: "podcast", urn: "urn:entity:podcast" },
  { id: "tv_show", urn: "urn:entity:tv_show" },
  { id: "videogame", urn: "urn:entity:videogame" }
];
var QLOO_SEARCH_ENTITY_TYPES = [
  ...QLOO_INSIGHTS_ENTITY_TYPES,
  { id: "locality", urn: "urn:entity:locality" },
  { id: "actor", urn: "urn:entity:actor" },
  { id: "album", urn: "urn:entity:album" },
  { id: "author", urn: "urn:entity:author" },
  { id: "director", urn: "urn:entity:director" }
];
function buildEntityTypeAliases(entityTypes) {
  const aliases = /* @__PURE__ */ new Map();
  const urnById = new Map(entityTypes.map(({ id, urn }) => [id, urn]));
  for (const entityType of entityTypes) {
    aliases.set(entityType.id, entityType.urn);
    aliases.set(entityType.urn, entityType.urn);
    aliases.set(`${entityType.id}s`, entityType.urn);
  }
  const addAlias = (alias, id) => {
    const urn = urnById.get(id);
    if (urn)
      aliases.set(alias, urn);
  };
  addAlias("people", "person");
  addAlias("localities", "locality");
  addAlias("tv", "tv_show");
  addAlias("show", "tv_show");
  addAlias("shows", "tv_show");
  addAlias("tv show", "tv_show");
  addAlias("tv shows", "tv_show");
  addAlias("game", "videogame");
  addAlias("games", "videogame");
  addAlias("video game", "videogame");
  addAlias("video games", "videogame");
  return aliases;
}
var insightsEntityTypeByAlias = buildEntityTypeAliases(QLOO_INSIGHTS_ENTITY_TYPES);
var searchEntityTypeByAlias = buildEntityTypeAliases(QLOO_SEARCH_ENTITY_TYPES);
function resolveQlooInsightsEntityType(value) {
  return insightsEntityTypeByAlias.get(value.trim().toLowerCase());
}
function resolveQlooSearchEntityType(value) {
  return searchEntityTypeByAlias.get(value.trim().toLowerCase());
}
var operationSummaries = {
  recommend: "Find entities for a taste profile, audience, or collection of signals.",
  rank: "Rank a supplied set of options for signals, location, or audience.",
  describe: "Resolve and describe one Qloo entity.",
  where_popular: "Find geographic areas where an entity has comparatively strong affinity.",
  compare_audiences: "Contrast two signal groups and identify shared or differentiating affinities.",
  entity_tags: "Retrieve concepts and tags that characterize entities.",
  audience_demographics: "Retrieve aggregate audience segments associated with an entity.",
  trends: "Retrieve interest or trend information over a time range.",
  find_tags: "Search the Qloo tag ontology by natural-language concept."
};
var QLOO_WORKFLOW_OPERATIONS = Object.freeze(QLOO_WORKFLOW_OPERATION_IDS.map((id) => Object.freeze({
  id,
  toolName: `qloo_${id}`,
  summary: operationSummaries[id],
  since: QLOO_TOOL_CATALOG_VERSION
})));
var upstreamLock = upstream_lock_default;
var upstreamGetPaths = Object.freeze([
  ...upstreamLock.expectations.getPaths
]);
var documentedExceptions = Object.freeze(upstreamLock.documentedExceptions.map((exception) => Object.freeze({ ...exception })));
var QLOO_CAPABILITIES_TOOL = Object.freeze({
  name: QLOO_CAPABILITIES_TOOL_NAME,
  description: "Return the versioned Qloo workflow catalog and pinned upstream API contract metadata without making a network request.",
  inputSchema: Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: Object.freeze({
      operation_ids: Object.freeze({
        type: "array",
        description: "Optional canonical operation IDs to include. Omit for the complete catalog.",
        uniqueItems: true,
        items: Object.freeze({
          type: "string",
          enum: QLOO_WORKFLOW_OPERATION_IDS
        })
      })
    })
  })
});
var operationIds = new Set(QLOO_WORKFLOW_OPERATION_IDS);
function isQlooWorkflowOperationId(value) {
  return operationIds.has(value);
}
function getQlooCapabilities(input = {}) {
  const selected = input.operation_ids ? new Set(input.operation_ids) : void 0;
  return {
    contract_version: QLOO_TOOL_CATALOG_VERSION,
    introspection_tool: QLOO_CAPABILITIES_TOOL_NAME,
    operations: selected ? QLOO_WORKFLOW_OPERATIONS.filter(({ id }) => selected.has(id)) : QLOO_WORKFLOW_OPERATIONS,
    upstream: {
      documentation_url: upstreamLock.source.documentationUrl,
      api_version: upstreamLock.source.apiVersion,
      openapi_version: upstreamLock.source.openapiVersion,
      production_server: upstreamLock.expectations.productionServer,
      lock_sha256: upstreamLock.source.sha256,
      get_paths: upstreamGetPaths,
      documented_exceptions: documentedExceptions
    }
  };
}

// packages/qloo-tool-schema/dist/src/workflow-contracts.js
import { createHash } from "node:crypto";
import { Type } from "typebox";
import { Value } from "typebox/value";
var QLOO_TOOL_DEFAULT_LIMIT = 10;
var QLOO_TOOL_MAX_RESULTS = 20;
var QLOO_TAG_BOOLEAN_OPERATORS = ["union", "intersection"];
var insightsEntityTypeIds = QLOO_INSIGHTS_ENTITY_TYPES.map(({ id }) => id);
var searchEntityTypeIds = QLOO_SEARCH_ENTITY_TYPES.map(({ id }) => id);
var QLOO_INSIGHTS_ENTITY_TYPE_SCHEMA = Type.String({
  enum: insightsEntityTypeIds,
  description: `Qloo Insights entity type: ${insightsEntityTypeIds.join(", ")}.`
});
var QLOO_SEARCH_ENTITY_TYPE_SCHEMA = Type.String({
  enum: searchEntityTypeIds,
  description: `Qloo search entity type: ${searchEntityTypeIds.join(", ")}.`
});
var QLOO_TAG_BOOLEAN_OPERATOR_SCHEMA = Type.String({
  enum: QLOO_TAG_BOOLEAN_OPERATORS,
  description: "Combine tag values with union (any) or intersection (all)."
});
var QLOO_LIMIT_SCHEMA = Type.Optional(Type.Integer({
  minimum: 1,
  maximum: QLOO_TOOL_MAX_RESULTS,
  default: QLOO_TOOL_DEFAULT_LIMIT,
  description: `Maximum results to return (1-${QLOO_TOOL_MAX_RESULTS}).`
}));
var QLOO_ENTITY_INPUTS_SCHEMA = Type.Array(Type.String({ minLength: 1 }), {
  minItems: 1,
  maxItems: 10,
  description: "Named entities or Qloo entity UUIDs; use tag fields for abstract concepts."
});
var QLOO_TAG_INPUTS_SCHEMA = Type.Array(Type.String({ minLength: 1 }), {
  minItems: 1,
  maxItems: 10,
  description: "Genres, moods, styles, traits, or other concepts, or Qloo tag URNs; not named entities."
});
var QLOO_DEMOGRAPHIC_SCHEMA = Type.String({
  minLength: 1,
  description: "Audience demographic in natural language, such as 'young women', 'men 25-34', or 'millennials'. It is converted to documented Qloo demographic signals.",
  examples: ["young women", "men 25-34", "millennials"]
});
var QLOO_REQUEST_PREVIEW_SCHEMA = Type.Object({
  method: Type.Literal("GET"),
  path: Type.String({ minLength: 1 }),
  query: Type.Unknown()
}, { additionalProperties: false });
var QLOO_RESULT_ENVELOPE_SCHEMA = Type.Object({
  schema_version: Type.Literal(QLOO_TOOL_RESULT_SCHEMA_VERSION),
  operation: Type.String(),
  status: Type.Union([
    Type.Literal("ok"),
    Type.Literal("empty"),
    Type.Literal("needs_input"),
    Type.Literal("partial"),
    Type.Literal("degraded"),
    Type.Literal("error")
  ]),
  summary: Type.Optional(Type.String()),
  interpretation: Type.Optional(Type.Unknown()),
  results: Type.Optional(Type.Unknown()),
  result_count: Type.Optional(Type.Integer({ minimum: 0 })),
  warnings: Type.Optional(Type.Array(Type.String())),
  query_intent: Type.Optional(Type.Unknown()),
  error: Type.Optional(Type.Object({
    code: Type.String(),
    layer: Type.String(),
    retryable: Type.Boolean(),
    recovery: Type.String()
  }, { additionalProperties: false })),
  execution: Type.Object({
    transport: Type.String({ enum: ["direct", "cli", "mcp"] }),
    transport_name: Type.String(),
    correlation_id: Type.String(),
    duration_ms: Type.Number({ minimum: 0 })
  }, { additionalProperties: false }),
  provenance: Type.Optional(Type.Object({
    source: Type.String(),
    endpoint: Type.String(),
    documentation: Type.String(),
    transport: Type.Optional(Type.String()),
    requests: Type.Optional(Type.Array(QLOO_REQUEST_PREVIEW_SCHEMA, {
      maxItems: 20
    }))
  }, { additionalProperties: false }))
}, { additionalProperties: true });
var QLOO_WORKFLOW_INPUT_SCHEMAS = {
  recommend: Type.Object({
    target_type: QLOO_INSIGHTS_ENTITY_TYPE_SCHEMA,
    signals: Type.Optional(QLOO_ENTITY_INPUTS_SCHEMA),
    signal_tags: Type.Optional(QLOO_TAG_INPUTS_SCHEMA),
    signal_tags_operator: Type.Optional(QLOO_TAG_BOOLEAN_OPERATOR_SCHEMA),
    signal_location: Type.Optional(Type.String({ minLength: 1 })),
    demographic: Type.Optional(QLOO_DEMOGRAPHIC_SCHEMA),
    filter_location: Type.Optional(Type.String({ minLength: 1 })),
    include_tags: Type.Optional(QLOO_TAG_INPUTS_SCHEMA),
    include_tags_operator: Type.Optional(QLOO_TAG_BOOLEAN_OPERATOR_SCHEMA),
    exclude_tags: Type.Optional(QLOO_TAG_INPUTS_SCHEMA),
    exclude_tags_operator: Type.Optional(QLOO_TAG_BOOLEAN_OPERATOR_SCHEMA),
    explain: Type.Optional(Type.Boolean({ default: true })),
    limit: QLOO_LIMIT_SCHEMA
  }, { additionalProperties: false }),
  rank: Type.Object({
    options: QLOO_ENTITY_INPUTS_SCHEMA,
    option_type: QLOO_INSIGHTS_ENTITY_TYPE_SCHEMA,
    signals: Type.Optional(QLOO_ENTITY_INPUTS_SCHEMA),
    signal_location: Type.Optional(Type.String({ minLength: 1 })),
    demographic: Type.Optional(QLOO_DEMOGRAPHIC_SCHEMA),
    include_tags: Type.Optional(QLOO_TAG_INPUTS_SCHEMA),
    exclude_tags: Type.Optional(QLOO_TAG_INPUTS_SCHEMA)
  }, { additionalProperties: false }),
  describe: Type.Object({
    entity: Type.String({ minLength: 1 }),
    type: Type.Optional(QLOO_SEARCH_ENTITY_TYPE_SCHEMA)
  }, { additionalProperties: false }),
  where_popular: Type.Object({
    entity: Type.String({ minLength: 1 }),
    entity_type: Type.Optional(QLOO_SEARCH_ENTITY_TYPE_SCHEMA),
    within: Type.String({
      minLength: 1,
      description: "Required geographic area that constrains the heatmap."
    }),
    limit: QLOO_LIMIT_SCHEMA
  }, { additionalProperties: false }),
  compare_audiences: Type.Object({
    group_a: QLOO_ENTITY_INPUTS_SCHEMA,
    group_b: QLOO_ENTITY_INPUTS_SCHEMA,
    target_type: Type.Optional(QLOO_INSIGHTS_ENTITY_TYPE_SCHEMA),
    limit: QLOO_LIMIT_SCHEMA
  }, { additionalProperties: false }),
  entity_tags: Type.Object({
    entities: QLOO_ENTITY_INPUTS_SCHEMA,
    entity_type: Type.Optional(QLOO_SEARCH_ENTITY_TYPE_SCHEMA),
    limit: QLOO_LIMIT_SCHEMA
  }, { additionalProperties: false }),
  audience_demographics: Type.Object({
    entity: Type.String({ minLength: 1 }),
    entity_type: Type.Optional(QLOO_SEARCH_ENTITY_TYPE_SCHEMA),
    limit: QLOO_LIMIT_SCHEMA
  }, { additionalProperties: false }),
  trends: Type.Object({
    entities: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 5 }),
    entity_type: QLOO_INSIGHTS_ENTITY_TYPE_SCHEMA,
    start_date: Type.String({
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "Inclusive start date in YYYY-MM-DD format."
    }),
    end_date: Type.String({
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "Inclusive end date in YYYY-MM-DD format."
    }),
    limit: QLOO_LIMIT_SCHEMA
  }, { additionalProperties: false }),
  find_tags: Type.Object({
    query: Type.String({ minLength: 1 }),
    semantic: Type.Optional(Type.Boolean({ default: true })),
    limit: QLOO_LIMIT_SCHEMA
  }, { additionalProperties: false })
};
var QLOO_WORKFLOW_RESOLUTION_FIELDS = {
  recommend: [
    { field: "signals", inputKind: "entity" },
    {
      field: "signal_tags",
      inputKind: "tag",
      scopeField: "target_type",
      scopeKind: "insights",
      purpose: "signal"
    },
    {
      field: "include_tags",
      inputKind: "tag",
      scopeField: "target_type",
      scopeKind: "insights",
      purpose: "include_filter"
    },
    {
      field: "exclude_tags",
      inputKind: "tag",
      scopeField: "target_type",
      scopeKind: "insights",
      purpose: "exclude_filter"
    }
  ],
  rank: [
    {
      field: "options",
      inputKind: "entity",
      scopeField: "option_type",
      scopeKind: "insights"
    },
    { field: "signals", inputKind: "entity" },
    {
      field: "include_tags",
      inputKind: "tag",
      scopeField: "option_type",
      scopeKind: "insights",
      purpose: "include_filter"
    },
    {
      field: "exclude_tags",
      inputKind: "tag",
      scopeField: "option_type",
      scopeKind: "insights",
      purpose: "exclude_filter"
    }
  ],
  describe: [
    { field: "entity", inputKind: "entity", scopeField: "type", scopeKind: "search" }
  ],
  where_popular: [
    {
      field: "entity",
      inputKind: "entity",
      scopeField: "entity_type",
      scopeKind: "search"
    }
  ],
  compare_audiences: [
    { field: "group_a", inputKind: "entity" },
    { field: "group_b", inputKind: "entity" }
  ],
  entity_tags: [
    {
      field: "entities",
      inputKind: "entity",
      scopeField: "entity_type",
      scopeKind: "search"
    }
  ],
  audience_demographics: [
    {
      field: "entity",
      inputKind: "entity",
      scopeField: "entity_type",
      scopeKind: "search"
    }
  ],
  trends: [
    {
      field: "entities",
      inputKind: "entity",
      scopeField: "entity_type",
      scopeKind: "insights"
    }
  ],
  find_tags: []
};
var sharedWorkflowBehavior = Object.freeze({
  readOnly: true,
  idempotent: true,
  mutating: false,
  destructive: false,
  openWorld: true,
  concurrency: "safe_for_independent_inputs",
  requiredCredential: "qloo_api",
  defaultResultBudget: QLOO_TOOL_DEFAULT_LIMIT,
  maximumResultBudget: QLOO_TOOL_MAX_RESULTS,
  safeRetryClasses: Object.freeze(["dns", "connect", "timeout", "rate_limit", "upstream_5xx"]),
  supportedTransports: Object.freeze(["direct", "mcp"])
});
var mediumLatencyOperations = /* @__PURE__ */ new Set([
  "recommend",
  "rank",
  "compare_audiences",
  "entity_tags",
  "audience_demographics",
  "trends"
]);
var QLOO_WORKFLOW_BEHAVIORS = Object.freeze(Object.fromEntries(Object.keys(QLOO_WORKFLOW_INPUT_SCHEMAS).map((operation) => [
  operation,
  Object.freeze({
    ...sharedWorkflowBehavior,
    expectedLatency: mediumLatencyOperations.has(operation) ? "medium" : "low"
  })
])));
var QLOO_WORKFLOW_METADATA = {
  recommend: {
    toolName: "qloo_recommend",
    label: "Qloo recommendations",
    description: "Find Qloo entities related to one combined entity, tag, location, and demographic taste profile. Signals influence affinity; filters constrain output.",
    promptSnippet: "Recommend entities from a combined Qloo taste profile",
    promptGuidelines: [
      "Pass every related taste and audience signal together in one qloo_recommend call.",
      "Put named things in signals; put genres, moods, styles, traits, and concepts such as quiet luxury in signal_tags; reuse returned Qloo UUIDs and tag URNs.",
      "Use signal_location for audience location and filter_location to constrain result geography.",
      "Include demographic and location in the same call when both describe the audience."
    ],
    documentation: ["https://docs.qloo.com/reference/insights-api-deep-dive"]
  },
  rank: {
    toolName: "qloo_rank",
    label: "Qloo rank",
    description: "Rank one supplied option set against one shared entity, location, demographic, and tag profile. Scores from separate calls are not comparable.",
    promptSnippet: "Rank a caller-supplied shortlist with Qloo",
    promptGuidelines: [
      "Pass every option in one qloo_rank call so scores remain comparable.",
      "Put named things in entity fields and concepts in tag fields; reuse returned Qloo UUIDs and tag URNs."
    ],
    documentation: ["https://docs.qloo.com/reference/insights-api-deep-dive"]
  },
  describe: {
    toolName: "qloo_describe",
    label: "Qloo entity",
    description: "Resolve one named entity or Qloo UUID and return only metadata present in Qloo.",
    promptSnippet: "Resolve and describe one Qloo entity",
    documentation: ["https://docs.qloo.com/reference/get-search", "https://docs.qloo.com/reference/get-entities"]
  },
  where_popular: {
    toolName: "qloo_where_popular",
    label: "Qloo geographic affinity",
    description: "Find geographic areas where one entity has strong query-relative affinity. This is distinct from filtering recommendations to a place.",
    promptSnippet: "Find where an entity is comparatively popular",
    documentation: ["https://docs.qloo.com/reference/heatmaps-use-case"]
  },
  compare_audiences: {
    toolName: "qloo_compare_audiences",
    label: "Qloo audience comparison",
    description: "Compare two complete groups of entity signals in one Qloo analysis request.",
    promptSnippet: "Compare two Qloo taste-signal groups",
    documentation: ["https://docs.qloo.com/reference/analysis-compare"]
  },
  entity_tags: {
    toolName: "qloo_entity_tags",
    label: "Qloo entity tags",
    description: "Retrieve Qloo concepts that jointly characterize one or more entities using the documented urn:tag Insights workflow.",
    promptSnippet: "Find concepts that characterize Qloo entities",
    documentation: ["https://docs.qloo.com/reference/taste-analysis"]
  },
  audience_demographics: {
    toolName: "qloo_audience_demographics",
    label: "Qloo audience demographics",
    description: "Retrieve aggregate demographic distributions associated with one entity through the documented urn:demographics Insights workflow.",
    promptSnippet: "Inspect aggregate demographics associated with a Qloo entity",
    documentation: ["https://docs.qloo.com/reference/demographics-use-case"]
  },
  trends: {
    toolName: "qloo_trends",
    label: "Qloo trends",
    description: "Retrieve Qloo time-series popularity metrics for one to five resolved entities over an ISO date range.",
    promptSnippet: "Track Qloo entity popularity metrics over time",
    documentation: ["https://docs.qloo.com/reference/get-trending"]
  },
  find_tags: {
    toolName: "qloo_find_tags",
    label: "Qloo tag search",
    description: "Search Qloo's tag ontology by natural-language concept and return stable tag URNs.",
    promptSnippet: "Search the Qloo tag ontology",
    documentation: ["https://docs.qloo.com/reference/get-tags-1"]
  }
};
var QLOO_WORKFLOW_CONTRACTS = Object.freeze(Object.fromEntries(Object.entries(QLOO_WORKFLOW_METADATA).map(([id, metadata]) => [
  id,
  Object.freeze({
    id,
    ...metadata,
    behavior: QLOO_WORKFLOW_BEHAVIORS[id],
    inputSchema: QLOO_WORKFLOW_INPUT_SCHEMAS[id],
    resultSchema: QLOO_RESULT_ENVELOPE_SCHEMA
  })
])));
var QLOO_ADAPTER_CONTRACT_MANIFEST_SCHEMA_VERSION = "1.1";
function getQlooExecutableCapabilities(input = {}) {
  const capabilities = getQlooCapabilities(input);
  return {
    ...capabilities,
    result_schema_version: QLOO_TOOL_RESULT_SCHEMA_VERSION,
    operations: capabilities.operations.map((operation) => {
      const contract = QLOO_WORKFLOW_CONTRACTS[operation.id];
      return {
        ...operation,
        input_schema: contract.inputSchema,
        result_schema: contract.resultSchema,
        documentation: contract.documentation,
        behavior: contract.behavior
      };
    })
  };
}
function getQlooAdapterContractManifest() {
  const capabilities = getQlooExecutableCapabilities();
  const contract = {
    manifest_schema_version: QLOO_ADAPTER_CONTRACT_MANIFEST_SCHEMA_VERSION,
    contract_version: capabilities.contract_version,
    capabilities_tool: QLOO_CAPABILITIES_TOOL_NAME,
    result_schema_version: capabilities.result_schema_version,
    result_schema: QLOO_RESULT_ENVELOPE_SCHEMA,
    operations: capabilities.operations.map((operation) => {
      const contract2 = QLOO_WORKFLOW_CONTRACTS[operation.id];
      return {
        id: operation.id,
        shared_tool_name: operation.toolName,
        summary: operation.summary,
        description: contract2.description,
        input_schema: contract2.inputSchema,
        behavior: contract2.behavior,
        documentation: contract2.documentation
      };
    }),
    upstream: capabilities.upstream
  };
  return {
    ...contract,
    contract_checksum: `sha256:${createHash("sha256").update(JSON.stringify(contract)).digest("hex")}`
  };
}
var QLOO_QUERY_INTENT_VERSION = "1.0-preview.1";
function createQlooQueryIntent(operation, input) {
  const base = {
    schema_version: QLOO_QUERY_INTENT_VERSION,
    source_contract_version: QLOO_TOOL_CATALOG_VERSION,
    operation,
    job: operation,
    signals: {},
    filters: {},
    operators: {},
    output: {},
    assumptions: [],
    unresolved: []
  };
  switch (operation) {
    case "recommend": {
      const value = input;
      return {
        ...base,
        target: { type: value.target_type },
        signals: {
          ...value.signals ? { entities: value.signals } : {},
          ...value.signal_tags ? { tags: value.signal_tags } : {},
          ...value.signal_location ? { location: value.signal_location } : {},
          ...value.demographic ? { demographic: value.demographic } : {}
        },
        filters: {
          ...value.include_tags ? { includeTags: value.include_tags } : {},
          ...value.exclude_tags ? { excludeTags: value.exclude_tags } : {},
          ...value.filter_location ? { location: value.filter_location } : {}
        },
        operators: {
          ...value.signal_tags ? { signalTags: value.signal_tags_operator ?? "intersection" } : {},
          ...value.include_tags ? { includeTags: value.include_tags_operator ?? "union" } : {},
          ...value.exclude_tags ? { excludeTags: value.exclude_tags_operator ?? "union" } : {}
        },
        output: { limit: value.limit ?? QLOO_TOOL_DEFAULT_LIMIT, explain: value.explain ?? true },
        assumptions: [
          ...value.limit === void 0 ? [`limit=${QLOO_TOOL_DEFAULT_LIMIT}`] : [],
          ...value.explain === void 0 ? ["explain=true"] : []
        ]
      };
    }
    case "rank": {
      const value = input;
      return {
        ...base,
        target: { type: value.option_type },
        signals: {
          ...value.signals ? { entities: value.signals } : {},
          ...value.signal_location ? { location: value.signal_location } : {},
          ...value.demographic ? { demographic: value.demographic } : {}
        },
        filters: {
          candidateEntities: value.options,
          ...value.include_tags ? { includeTags: value.include_tags } : {},
          ...value.exclude_tags ? { excludeTags: value.exclude_tags } : {}
        },
        operators: {
          ...value.include_tags ? { includeTags: "union" } : {},
          ...value.exclude_tags ? { excludeTags: "union" } : {}
        },
        output: { limit: value.options.length },
        assumptions: []
      };
    }
    case "describe": {
      const value = input;
      return { ...base, target: { ...value.type ? { type: value.type } : {}, entities: [value.entity] } };
    }
    case "where_popular": {
      const value = input;
      return {
        ...base,
        target: { ...value.entity_type ? { type: value.entity_type } : {}, entities: [value.entity] },
        filters: { location: value.within },
        output: { limit: value.limit ?? QLOO_TOOL_DEFAULT_LIMIT },
        assumptions: value.limit === void 0 ? [`limit=${QLOO_TOOL_DEFAULT_LIMIT}`] : []
      };
    }
    case "compare_audiences": {
      const value = input;
      return {
        ...base,
        ...value.target_type ? { target: { type: value.target_type } } : {},
        signals: { groups: [value.group_a, value.group_b] },
        output: { limit: value.limit ?? QLOO_TOOL_DEFAULT_LIMIT },
        assumptions: value.limit === void 0 ? [`limit=${QLOO_TOOL_DEFAULT_LIMIT}`] : []
      };
    }
    case "entity_tags": {
      const value = input;
      return {
        ...base,
        ...value.entity_type ? { target: { type: value.entity_type } } : {},
        signals: { entities: value.entities },
        output: { limit: value.limit ?? QLOO_TOOL_DEFAULT_LIMIT },
        assumptions: value.limit === void 0 ? [`limit=${QLOO_TOOL_DEFAULT_LIMIT}`] : []
      };
    }
    case "audience_demographics": {
      const value = input;
      return {
        ...base,
        target: value.entity_type ? { type: value.entity_type, entities: [value.entity] } : { entities: [value.entity] },
        output: { limit: value.limit ?? QLOO_TOOL_DEFAULT_LIMIT },
        assumptions: value.limit === void 0 ? [`limit=${QLOO_TOOL_DEFAULT_LIMIT}`] : []
      };
    }
    case "trends": {
      const value = input;
      return {
        ...base,
        target: { type: value.entity_type, entities: value.entities },
        filters: { startDate: value.start_date, endDate: value.end_date },
        output: { limit: value.limit ?? QLOO_TOOL_DEFAULT_LIMIT },
        assumptions: value.limit === void 0 ? [`limit=${QLOO_TOOL_DEFAULT_LIMIT}`] : []
      };
    }
    case "find_tags": {
      const value = input;
      return {
        ...base,
        target: { concept: value.query },
        output: { limit: value.limit ?? QLOO_TOOL_DEFAULT_LIMIT },
        assumptions: [
          ...value.semantic === void 0 ? ["semantic=true"] : [],
          ...value.limit === void 0 ? [`limit=${QLOO_TOOL_DEFAULT_LIMIT}`] : []
        ]
      };
    }
  }
}
function validationIssues(schema, value) {
  return [...Value.Errors(schema, value)].slice(0, 20).map((issue) => ({
    path: issue.keyword === "additionalProperties" && "additionalProperties" in issue.params && Array.isArray(issue.params.additionalProperties) && typeof issue.params.additionalProperties[0] === "string" ? `${issue.instancePath}/${issue.params.additionalProperties[0]}` : issue.instancePath || "/",
    message: issue.message
  }));
}
function validateQlooWorkflowInput(operation, value) {
  const schema = QLOO_WORKFLOW_INPUT_SCHEMAS[operation];
  if (Value.Check(schema, value)) {
    return { ok: true, value };
  }
  return {
    ok: false,
    issues: validationIssues(schema, value)
  };
}
function validateQlooWorkflowResult(value) {
  if (Value.Check(QLOO_RESULT_ENVELOPE_SCHEMA, value)) {
    return { ok: true, value };
  }
  return { ok: false, issues: validationIssues(QLOO_RESULT_ENVELOPE_SCHEMA, value) };
}
function ageBucketsForRange(low, high) {
  const ranges = [
    [0, 24, "24_and_younger"],
    [25, 29, "25_to_29"],
    [30, 34, "30_to_34"],
    [35, 44, "35_to_44"],
    [45, 54, "45_to_54"],
    [55, 120, "55_and_older"]
  ];
  const matches = ranges.filter(([bucketLow, bucketHigh]) => low <= bucketHigh && high >= bucketLow).map(([, , name]) => name);
  return matches.join(",");
}
function parseQlooDemographic(value) {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const result = {};
  if (/\b(women|woman|female|ladies)\b/u.test(normalized))
    result.gender = "female";
  else if (/\b(men|man|male|guys)\b/u.test(normalized))
    result.gender = "male";
  const explicitRange = normalized.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/u);
  if (explicitRange) {
    const low = Number(explicitRange[1]);
    const high = Number(explicitRange[2]);
    if (low <= high)
      result.age = ageBucketsForRange(low, high);
  } else if (/\b(teenagers?|teens?|gen[\s-]?z)\b/u.test(normalized)) {
    result.age = "24_and_younger";
  } else if (/\byoung\b/u.test(normalized)) {
    result.age = "24_and_younger,25_to_29";
  } else if (/\bmillennials?\b/u.test(normalized)) {
    result.age = "30_to_34,35_to_44";
  } else if (/\b(seniors?|elderly|retirees?)\b/u.test(normalized)) {
    result.age = "55_and_older";
  } else if (/\bmiddle[\s-]?aged?\b/u.test(normalized)) {
    result.age = "35_to_44,45_to_54";
  } else {
    const over = normalized.match(/\b(?:over|older than|above)\s*(\d{1,2})\b/u);
    const under = normalized.match(/\b(?:under|younger than|below)\s*(\d{1,2})\b/u);
    if (over)
      result.age = ageBucketsForRange(Number(over[1]), 120);
    else if (under)
      result.age = ageBucketsForRange(0, Number(under[1]));
  }
  return result;
}

// packages/qloo-tool-schema/dist/src/resolution-contracts.js
import { Type as Type2 } from "typebox";
var QLOO_RESOLUTION_CONTRACT_VERSION = "1.0-preview.1";
var QLOO_RESOLUTION_PROVIDER_DESCRIPTOR_SCHEMA = Type2.Object({
  contract_version: Type2.Literal(QLOO_RESOLUTION_CONTRACT_VERSION),
  provider_id: Type2.String({ minLength: 1 }),
  name: Type2.String({ minLength: 1 }),
  entity_strategy: Type2.String({ minLength: 1 }),
  tag_strategy: Type2.String({ minLength: 1 }),
  remote: Type2.Boolean(),
  uses_model: Type2.Boolean(),
  fallback: Type2.Literal("none")
}, { additionalProperties: false });
var QLOO_RESOLUTION_CANDIDATE_SCHEMA = Type2.Object({
  id: Type2.String({ minLength: 1 }),
  name: Type2.String({ minLength: 1 }),
  type: Type2.Optional(Type2.String({ minLength: 1 })),
  rank: Type2.Optional(Type2.Integer({ minimum: 1 })),
  score: Type2.Optional(Type2.Number()),
  popularity: Type2.Optional(Type2.Number()),
  parent_types: Type2.Optional(Type2.Array(Type2.String({ minLength: 1 }), {
    maxItems: 20,
    uniqueItems: true
  })),
  description: Type2.Optional(Type2.String({ minLength: 1, maxLength: 500 })),
  release_year: Type2.Optional(Type2.Integer()),
  address: Type2.Optional(Type2.Unknown())
}, { additionalProperties: false });
var QLOO_RESOLUTION_PROVENANCE_SCHEMA = Type2.Object({
  contract_version: Type2.Literal(QLOO_RESOLUTION_CONTRACT_VERSION),
  provider_id: Type2.String({ minLength: 1 }),
  provider_name: Type2.String({ minLength: 1 }),
  endpoint: Type2.String({ minLength: 1 }),
  strategy: Type2.String({ minLength: 1 }),
  remote: Type2.Boolean(),
  uses_model: Type2.Boolean(),
  provider_version: Type2.Optional(Type2.String({ minLength: 1 })),
  cache_status: Type2.Optional(Type2.String({ minLength: 1 }))
}, { additionalProperties: false });
var QLOO_RESOLUTION_OUTCOME_COMMON_SCHEMA = {
  input: Type2.String({ minLength: 1 }),
  provenance: QLOO_RESOLUTION_PROVENANCE_SCHEMA,
  warnings: Type2.Optional(Type2.Array(Type2.String()))
};
var QLOO_RESOLUTION_OUTCOME_SCHEMA = Type2.Union([
  Type2.Object({
    ...QLOO_RESOLUTION_OUTCOME_COMMON_SCHEMA,
    status: Type2.Literal("resolved"),
    match: Type2.Union([
      Type2.Literal("identifier"),
      Type2.Literal("exact"),
      Type2.Literal("semantic")
    ]),
    selected: QLOO_RESOLUTION_CANDIDATE_SCHEMA,
    alternatives: Type2.Optional(Type2.Array(QLOO_RESOLUTION_CANDIDATE_SCHEMA))
  }, { additionalProperties: false }),
  Type2.Object({
    ...QLOO_RESOLUTION_OUTCOME_COMMON_SCHEMA,
    status: Type2.Literal("ambiguous"),
    candidates: Type2.Array(QLOO_RESOLUTION_CANDIDATE_SCHEMA)
  }, { additionalProperties: false }),
  Type2.Object({
    ...QLOO_RESOLUTION_OUTCOME_COMMON_SCHEMA,
    status: Type2.Literal("not_found"),
    candidates: Type2.Optional(Type2.Array(QLOO_RESOLUTION_CANDIDATE_SCHEMA))
  }, { additionalProperties: false })
]);

export {
  QLOO_TOOL_RESULT_SCHEMA_VERSION,
  QLOO_WORKFLOW_OPERATION_IDS,
  QLOO_CAPABILITIES_TOOL_NAME,
  QLOO_INSIGHTS_ENTITY_TYPES,
  QLOO_SEARCH_ENTITY_TYPES,
  resolveQlooInsightsEntityType,
  resolveQlooSearchEntityType,
  isQlooWorkflowOperationId,
  QLOO_TOOL_DEFAULT_LIMIT,
  QLOO_TOOL_MAX_RESULTS,
  QLOO_WORKFLOW_RESOLUTION_FIELDS,
  QLOO_WORKFLOW_CONTRACTS,
  QLOO_ADAPTER_CONTRACT_MANIFEST_SCHEMA_VERSION,
  getQlooExecutableCapabilities,
  getQlooAdapterContractManifest,
  createQlooQueryIntent,
  validateQlooWorkflowInput,
  validateQlooWorkflowResult,
  parseQlooDemographic,
  QLOO_RESOLUTION_CONTRACT_VERSION
};
