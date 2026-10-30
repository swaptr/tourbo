// The nine Qloo workflows of @qloo/qloo-harness@0.1.26 (MIT, Copyright (c) 2026 Qloo), ported to
// TypeScript + zod on top of qlooGet() (cache, retries, concurrency). Same tool names, input
// shapes and result envelope, so prompts written for `qloo mcp` work here.
import { z } from "zod";

import { qlooGet, type QlooParams } from "@tourbo/core/qloo/client.server.ts";

import { plainError } from "../errors.ts";
import { parseDemographic, resolveEntities, resolveTags, resultArray, type Issue, type Resolution } from "./resolve.ts";

export const RESULT_SCHEMA_VERSION = "1.0-preview.1";
const DEFAULT_LIMIT = 10;
const MAX_RESULTS = 20;

// Insights filter.type values (qloo-docs available-parameters-by-entity-type.md; the hackathon
// guide lists the same ten). Video games are urn:entity:video_game.
export const INSIGHTS_TYPES = ["artist", "book", "brand", "destination", "movie", "person", "place", "podcast", "tv_show", "video_game"] as const;
// Legacy types: search only, not supported in /v2/insights (get-search.md); actor, author and
// director are deprecated in favour of person.
export const SEARCH_ONLY_TYPES = ["locality", "album", "actor", "author", "director"] as const;
export const SEARCH_TYPES = [...INSIGHTS_TYPES, ...SEARCH_ONLY_TYPES] as const;
const urn = (id: string) => `urn:entity:${id}`;

const insightsType = z.enum(INSIGHTS_TYPES).describe(`Qloo Insights entity type: ${INSIGHTS_TYPES.join(", ")}.`);
const searchType = z
  .enum(SEARCH_TYPES)
  .describe(`Qloo entity type used to look the name up: ${INSIGHTS_TYPES.join(", ")}; search-only legacy types ${SEARCH_ONLY_TYPES.join(", ")} (actor, author, director are deprecated: prefer person).`);
const operator = z.enum(["union", "intersection"]).describe("Combine tag values with union (any) or intersection (all).");
const limit = z.number().int().min(1).max(MAX_RESULTS).optional().describe(`Maximum results to return (1-${MAX_RESULTS}, default ${DEFAULT_LIMIT}).`);
const entities = z.array(z.string().min(1)).min(1).max(10).describe("Named entities or Qloo entity UUIDs; use tag fields for abstract concepts.");
const tags = z.array(z.string().min(1)).min(1).max(10).describe("Genres, moods, styles, traits, or other concepts, or Qloo tag URNs; not named entities.");
const demographic = z.string().min(1).describe("Audience demographic in natural language, such as 'young women', 'men 25-34', or 'millennials'.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const WORKFLOW_INPUTS = {
  recommend: z.object({
    target_type: insightsType,
    signals: entities.optional(),
    signal_tags: tags.optional(),
    signal_tags_operator: operator.optional(),
    signal_location: z.string().min(1).optional(),
    demographic: demographic.optional(),
    filter_location: z.string().min(1).optional(),
    include_tags: tags.optional(),
    include_tags_operator: operator.optional(),
    exclude_tags: tags.optional(),
    exclude_tags_operator: operator.optional(),
    explain: z.boolean().optional(),
    limit,
  }),
  rank: z.object({
    options: entities,
    option_type: insightsType,
    signals: entities.optional(),
    signal_location: z.string().min(1).optional(),
    demographic: demographic.optional(),
    include_tags: tags.optional(),
    exclude_tags: tags.optional(),
  }),
  describe: z.object({ entity: z.string().min(1), type: searchType.optional() }),
  where_popular: z.object({
    entity: z.string().min(1),
    entity_type: searchType.optional(),
    within: z.string().min(1).describe("Required geographic area that constrains the heatmap."),
    limit,
  }),
  compare_audiences: z.object({ group_a: entities, group_b: entities, target_type: insightsType.optional(), limit }),
  entity_tags: z.object({ entities, entity_type: searchType.optional(), limit }),
  audience_demographics: z.object({ entity: z.string().min(1), entity_type: searchType.optional(), limit }),
  trends: z.object({
    entities: z.array(z.string().min(1)).min(1).max(5),
    entity_type: insightsType,
    start_date: date.describe("Inclusive start date in YYYY-MM-DD format."),
    end_date: date.describe("Inclusive end date in YYYY-MM-DD format."),
    limit,
  }),
  find_tags: z.object({ query: z.string().min(1), semantic: z.boolean().optional(), limit }),
};

export type Workflow = keyof typeof WORKFLOW_INPUTS;

export const WORKFLOW_META: Record<Workflow, { title: string; description: string; docs: string }> = {
  recommend: {
    title: "Qloo recommendations",
    description:
      "Find Qloo entities related to one combined entity, tag, location, and demographic taste profile. Signals influence affinity; filters constrain output. Pass every related signal together in one call; put named things in signals and concepts (genres, moods, styles) in signal_tags; use signal_location for audience location and filter_location to constrain result geography.",
    docs: "insights-api-deep-dive",
  },
  rank: {
    title: "Qloo rank",
    description:
      "Rank one supplied option set against one shared entity, location, demographic, and tag profile. Pass every option in one call: scores from separate calls are not comparable.",
    docs: "insights-api-deep-dive",
  },
  describe: { title: "Qloo entity", description: "Resolve one named entity or Qloo UUID and return only metadata present in Qloo.", docs: "get-entities" },
  where_popular: {
    title: "Qloo geographic affinity",
    description: "Find geographic areas (geohash cells) where one entity has strong query-relative affinity within an area. Distinct from filtering recommendations to a place.",
    docs: "heatmaps-use-case",
  },
  compare_audiences: { title: "Qloo audience comparison", description: "Compare two complete groups of entity signals in one Qloo analysis request.", docs: "analysis-compare" },
  entity_tags: { title: "Qloo entity tags", description: "Retrieve Qloo concepts (tags) that jointly characterize one or more entities.", docs: "taste-analysis" },
  audience_demographics: {
    title: "Qloo audience demographics",
    description: "Retrieve aggregate demographic distributions associated with one entity.",
    docs: "demographics-use-case",
  },
  trends: { title: "Qloo trends", description: "Retrieve Qloo time-series popularity metrics for one to five resolved entities over an ISO date range.", docs: "get-trending" },
  find_tags: { title: "Qloo tag search", description: "Search Qloo's tag ontology by natural-language concept and return stable tag URNs.", docs: "get-tags-1" },
};

// outputSchema of every qloo_* tool: the harness result envelope (loose: results vary by operation).
export const ENVELOPE_SCHEMA = z.looseObject({
  schema_version: z.string(),
  operation: z.string(),
  status: z.enum(["ok", "empty", "needs_input", "error"]),
  summary: z.string().optional(),
  interpretation: z.unknown().optional(),
  resolution: z.looseObject({ issues: z.array(z.unknown()).optional() }).optional(),
  results: z.unknown().optional(),
  series: z.unknown().optional(),
  result_count: z.number().optional(),
  warnings: z.array(z.string()).optional(),
  error: z.looseObject({ code: z.string(), layer: z.string(), retryable: z.boolean(), recovery: z.string() }).optional(),
  provenance: z.looseObject({ source: z.string(), endpoint: z.string(), documentation: z.string() }).optional(),
});

export type Envelope = {
  schema_version: string;
  operation: Workflow;
  status: "ok" | "empty" | "needs_input" | "error";
  summary?: string;
  interpretation?: unknown;
  resolution?: { issues?: Issue[] };
  results?: unknown;
  series?: unknown;
  result_count?: number;
  warnings?: string[];
  error?: { code: string; layer: string; retryable: boolean; recovery: string };
  provenance?: { source: string; endpoint: string; documentation: string; requests: { method: "GET"; path: string; query: unknown }[] };
};

type Json = Record<string, unknown>;
const record = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);

function bounded(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 5) return "[detail omitted]";
  if (Array.isArray(value)) return value.slice(0, MAX_RESULTS).map((v) => bounded(v, depth + 1));
  const r = record(value);
  return r ? Object.fromEntries(Object.entries(r).slice(0, 40).map(([k, v]) => [k, bounded(v, depth + 1)])) : undefined;
}

const PROPERTY_KEYS = ["description", "short_description", "release_year", "release_date", "content_rating", "duration", "image", "geocode", "address", "price_level", "business_rating"];

function compactEntity(value: unknown) {
  const e = record(value);
  if (!e) return undefined;
  const props = record(e.properties);
  const query = record(e.query);
  const properties = props ? Object.fromEntries(PROPERTY_KEYS.filter((k) => props[k] !== undefined).map((k) => [k, bounded(props[k])])) : undefined;
  return {
    entity_id: e.entity_id ?? e.id,
    name: e.name,
    type: e.type,
    subtype: e.subtype,
    popularity: e.popularity,
    affinity: e.affinity ?? query?.affinity,
    ...(query?.explainability !== undefined ? { explainability: bounded(query.explainability) } : {}),
    ...(properties && Object.keys(properties).length ? { properties } : {}),
  };
}

function compactTag(value: unknown) {
  const t = record(value);
  if (!t) return undefined;
  return { id: t.id ?? t.tag_id, name: t.name, type: t.type ?? t.subtype, popularity: t.popularity, affinity: t.affinity ?? record(t.query)?.affinity };
}

const provenance = (endpoint: string, docs: string, queries: QlooParams[]) => ({
  source: "Qloo API",
  endpoint,
  documentation: `https://docs.qloo.com/reference/${docs}`,
  requests: queries.slice(0, 20).map((query) => ({ method: "GET" as const, path: endpoint, query: bounded(query) })),
});

const envelope = (operation: Workflow, payload: Omit<Envelope, "schema_version" | "operation">): Envelope => ({
  schema_version: RESULT_SCHEMA_VERSION,
  operation,
  ...payload,
});

const needsInput = (operation: Workflow, summary: string, issues: Issue[] = []): Envelope =>
  envelope(operation, { status: "needs_input", summary, resolution: { issues }, results: [] });

const issuesOf = (...sets: Resolution[]) => sets.flatMap((s) => s.issues);
const warningsOf = (...sets: Resolution[]) => {
  const w = [...new Set(sets.flatMap((s) => s.warnings))];
  return w.length ? { warnings: w } : {};
};
const ids = (r: Resolution) => r.resolved.map((x) => x.id);

type Inputs = { [K in Workflow]: z.infer<(typeof WORKFLOW_INPUTS)[K]> };

const RUNNERS: { [K in Workflow]: (p: Inputs[K]) => Promise<Envelope> } = {
  async recommend(p) {
    const type = urn(p.target_type);
    const demo = p.demographic ? parseDemographic(p.demographic) : undefined;
    if (p.demographic && !demo?.gender && !demo?.age) return needsInput("recommend", `Could not map demographic "${p.demographic}" to Qloo age or gender. Use e.g. "young women" or "men 25-34".`);
    if (demo && !p.signal_location) return needsInput("recommend", "Demographic signals require signal_location so the audience geography is explicit.");
    if (!p.signals?.length && !p.signal_tags?.length && !p.signal_location && !demo) return needsInput("recommend", "Provide at least one entity, tag, location, or demographic taste signal.");
    const [ents, sTags, inc, exc] = await Promise.all([
      resolveEntities(p.signals, "signals"),
      resolveTags(p.signal_tags, "signal_tags", type),
      resolveTags(p.include_tags, "include_tags", type),
      resolveTags(p.exclude_tags, "exclude_tags", type),
    ]);
    const issues = issuesOf(ents, sTags, inc, exc);
    if (issues.length) return needsInput("recommend", "Choose or correct the unresolved Qloo inputs.", issues);
    const n = p.limit ?? DEFAULT_LIMIT;
    const query: QlooParams = { "filter.type": type, take: n };
    if (ents.resolved.length) query["signal.interests.entities"] = ids(ents);
    if (sTags.resolved.length) {
      query["signal.interests.tags"] = ids(sTags);
      query["operator.signal.interests.tags"] = p.signal_tags_operator ?? "intersection";
    }
    if (p.signal_location) query["signal.location.query"] = p.signal_location;
    if (demo?.gender) query["signal.demographics.gender"] = demo.gender;
    if (demo?.age) query["signal.demographics.age"] = demo.age;
    if (p.filter_location) query["filter.location.query"] = p.filter_location;
    if (inc.resolved.length) {
      query["filter.tags"] = ids(inc);
      query["operator.filter.tags"] = p.include_tags_operator ?? "union";
    }
    if (exc.resolved.length) {
      query["filter.exclude.tags"] = ids(exc);
      query["operator.filter.exclude.tags"] = p.exclude_tags_operator ?? "union";
    }
    if (p.explain ?? true) query["feature.explainability"] = true;
    const res = await qlooGet("/v2/insights", query);
    const results = resultArray(res, "entities").map(compactEntity).filter(Boolean).slice(0, n);
    return envelope("recommend", {
      status: results.length ? "ok" : "empty",
      interpretation: {
        target_type: type,
        signals: ents.resolved,
        signal_tags: sTags.resolved,
        signal_location: p.signal_location,
        demographic: p.demographic ? { input: p.demographic, ...demo } : undefined,
        filter_location: p.filter_location,
        include_tags: inc.resolved,
        exclude_tags: exc.resolved,
      },
      ...warningsOf(ents, sTags, inc, exc),
      results,
      result_count: results.length,
      provenance: provenance("/v2/insights", "insights-api-deep-dive", [query]),
    });
  },

  async rank(p) {
    const type = urn(p.option_type);
    const demo = p.demographic ? parseDemographic(p.demographic) : undefined;
    if (p.demographic && !demo?.gender && !demo?.age) return needsInput("rank", `Could not map demographic "${p.demographic}" to Qloo age or gender.`);
    if (demo && !p.signal_location) return needsInput("rank", "Demographic signals require signal_location so the audience geography is explicit.");
    if (!p.signals?.length && !p.signal_location && !demo) return needsInput("rank", "Ranking requires an entity, location, or demographic signal.");
    const [opts, sigs, inc, exc] = await Promise.all([
      resolveEntities(p.options, "options", type),
      resolveEntities(p.signals, "signals"),
      resolveTags(p.include_tags, "include_tags", type),
      resolveTags(p.exclude_tags, "exclude_tags", type),
    ]);
    const issues = issuesOf(opts, sigs, inc, exc);
    if (issues.length) return needsInput("rank", "Choose or correct the unresolved ranking inputs.", issues);
    const query: QlooParams = { "filter.type": type, "filter.results.entities": ids(opts), take: opts.resolved.length };
    if (sigs.resolved.length) query["signal.interests.entities"] = ids(sigs);
    if (p.signal_location) query["signal.location.query"] = p.signal_location;
    if (demo?.gender) query["signal.demographics.gender"] = demo.gender;
    if (demo?.age) query["signal.demographics.age"] = demo.age;
    if (inc.resolved.length) {
      query["filter.tags"] = ids(inc);
      query["operator.filter.tags"] = "union";
    }
    if (exc.resolved.length) {
      query["filter.exclude.tags"] = ids(exc);
      query["operator.filter.exclude.tags"] = "union";
    }
    const res = await qlooGet("/v2/insights", query);
    const results = resultArray(res, "entities").map(compactEntity).filter(Boolean).slice(0, opts.resolved.length);
    return envelope("rank", {
      status: results.length ? "ok" : "empty",
      interpretation: { option_type: type, options: opts.resolved, signals: sigs.resolved, signal_location: p.signal_location },
      ...warningsOf(opts, sigs, inc, exc),
      results,
      result_count: results.length,
      provenance: provenance("/v2/insights", "insights-api-deep-dive", [query]),
    });
  },

  async describe(p) {
    const r = await resolveEntities([p.entity], "entity", p.type && urn(p.type));
    if (r.issues.length) return needsInput("describe", "Choose the intended Qloo entity.", r.issues);
    const res = await qlooGet("/entities", { entity_ids: ids(r) });
    const detailed = resultArray(res, "entities").map(compactEntity).filter(Boolean);
    const results = detailed.length ? detailed : r.resolved.map((e) => ({ entity_id: e.id, name: e.name, type: e.type }));
    return envelope("describe", {
      status: results.length ? "ok" : "empty",
      interpretation: { entity: r.resolved[0] },
      ...warningsOf(r),
      results,
      result_count: results.length,
      provenance: provenance("/entities", "get-entities", [{ entity_ids: ids(r) }]),
    });
  },

  async where_popular(p) {
    const r = await resolveEntities([p.entity], "entity", p.entity_type && urn(p.entity_type));
    if (r.issues.length) return needsInput("where_popular", "Choose the intended Qloo entity.", r.issues);
    const n = p.limit ?? DEFAULT_LIMIT;
    const query: QlooParams = { "filter.type": "urn:heatmap", "signal.interests.entities": r.resolved[0].id, "filter.location.query": p.within, take: n };
    const res = await qlooGet("/v2/insights", query);
    const affinity = (v: unknown) => Number(record(record(v)?.query)?.affinity ?? -Infinity);
    const results = [...resultArray(res, "heatmap")].sort((a, b) => affinity(b) - affinity(a)).slice(0, n).map((v) => bounded(v));
    return envelope("where_popular", {
      status: results.length ? "ok" : "empty",
      interpretation: { entity: r.resolved[0], within: p.within },
      ...warningsOf(r),
      results,
      result_count: results.length,
      provenance: provenance("/v2/insights", "heatmaps-use-case", [query]),
    });
  },

  async compare_audiences(p) {
    const [a, b] = await Promise.all([resolveEntities(p.group_a, "group_a"), resolveEntities(p.group_b, "group_b")]);
    const issues = issuesOf(a, b);
    if (issues.length) return needsInput("compare_audiences", "Choose or correct the unresolved comparison inputs.", issues);
    const query: QlooParams = { "a.signal.interests.entities": ids(a), "b.signal.interests.entities": ids(b), take: p.limit ?? DEFAULT_LIMIT };
    if (p.target_type) query["filter.type"] = urn(p.target_type);
    const res = await qlooGet("/v2/analysis/compare", query);
    return envelope("compare_audiences", {
      status: "ok",
      interpretation: { group_a: a.resolved, group_b: b.resolved, target_type: query["filter.type"] },
      ...warningsOf(a, b),
      results: bounded(record(res)?.results),
      provenance: provenance("/v2/analysis/compare", "analysis-compare", [query]),
    });
  },

  async entity_tags(p) {
    const r = await resolveEntities(p.entities, "entities", p.entity_type && urn(p.entity_type));
    if (r.issues.length) return needsInput("entity_tags", "Choose or correct the unresolved Qloo entities.", r.issues);
    const n = p.limit ?? DEFAULT_LIMIT;
    const query: QlooParams = { "filter.type": "urn:tag", "signal.interests.entities": ids(r), take: n };
    const res = await qlooGet("/v2/insights", query);
    const results = resultArray(res, "tags").map(compactTag).filter(Boolean).slice(0, n);
    return envelope("entity_tags", {
      status: results.length ? "ok" : "empty",
      interpretation: { entities: r.resolved },
      ...warningsOf(r),
      results,
      result_count: results.length,
      provenance: provenance("/v2/insights", "taste-analysis", [query]),
    });
  },

  async audience_demographics(p) {
    const r = await resolveEntities([p.entity], "entity", p.entity_type && urn(p.entity_type));
    if (r.issues.length) return needsInput("audience_demographics", "Choose the intended Qloo entity.", r.issues);
    const n = p.limit ?? DEFAULT_LIMIT;
    const query: QlooParams = { "filter.type": "urn:demographics", "signal.interests.entities": r.resolved[0].id, take: n };
    const res = await qlooGet("/v2/insights", query);
    const results = resultArray(res, "demographics").slice(0, n).map((v) => bounded(v));
    return envelope("audience_demographics", {
      status: results.length ? "ok" : "empty",
      interpretation: { entity: r.resolved[0] },
      ...warningsOf(r),
      results,
      result_count: results.length,
      provenance: provenance("/v2/insights", "demographics-use-case", [query]),
    });
  },

  async trends(p) {
    if (p.start_date > p.end_date) return needsInput("trends", "start_date must be on or before end_date.");
    const type = urn(p.entity_type);
    const r = await resolveEntities(p.entities, "entities", type);
    if (r.issues.length) return needsInput("trends", "Choose or correct the unresolved Qloo entities.", r.issues);
    const n = p.limit ?? DEFAULT_LIMIT;
    const queries = r.resolved.map((e) => ({
      entity: e,
      query: { "filter.type": type, "filter.start_date": p.start_date, "filter.end_date": p.end_date, "signal.interests.entities": e.id, take: n } as QlooParams,
    }));
    const series = await Promise.all(
      queries.map(async ({ entity, query }) => ({
        entity,
        points: resultArray(await qlooGet("/v2/trending", query), "trending").slice(0, n).map((v) => bounded(v)),
      })),
    );
    return envelope("trends", {
      status: series.some((s) => s.points.length) ? "ok" : "empty",
      interpretation: { entity_type: type, start_date: p.start_date, end_date: p.end_date },
      ...warningsOf(r),
      series,
      result_count: series.length,
      provenance: provenance("/v2/trending", "get-trending", queries.map((q) => q.query)),
    });
  },

  async find_tags(p) {
    const n = p.limit ?? DEFAULT_LIMIT;
    const query: QlooParams = { "filter.query": p.query, "feature.semantic_search": p.semantic ?? true, take: n };
    const res = await qlooGet("/v2/tags", query);
    const results = resultArray(res, "tags").map(compactTag).filter(Boolean).slice(0, n);
    return envelope("find_tags", {
      status: results.length ? "ok" : "empty",
      interpretation: { query: p.query, semantic: p.semantic ?? true },
      results,
      result_count: results.length,
      provenance: provenance("/v2/tags", "get-tags-1", [query]),
    });
  },
};

// Qloo errors become an `error` envelope the model can read, instead of a thrown tool failure.
// Direct callers (the package export) get the same input check as MCP calls.
export async function runWorkflow<K extends Workflow>(operation: K, input: Inputs[K]): Promise<Envelope> {
  try {
    const checked = WORKFLOW_INPUTS[operation].safeParse(input ?? {});
    if (!checked.success) {
      const first = checked.error.issues[0];
      return needsInput(operation, `Check the input${first?.path.length ? ` ${first.path.join(".")}` : ""}: ${first?.message ?? "invalid"}.`);
    }
    return await RUNNERS[operation](checked.data as Inputs[K]);
  } catch (error) {
    const status = (error as { status?: number }).status;
    const retryable = status === 429 || (status !== undefined && status >= 500);
    return envelope(operation, {
      status: "error",
      summary: plainError(error, `qloo_${operation}`),
      error: {
        code: status ? `HTTP_${status}` : "QLOO_REQUEST_FAILED",
        layer: "qloo_api",
        retryable,
        recovery: retryable ? "Retry shortly." : "Check the inputs (entity names, types, tag URNs) and try again.",
      },
    });
  }
}
