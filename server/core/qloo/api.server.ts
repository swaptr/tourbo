import { qlooGet, type QlooParams } from "./client.server.ts";
import { PARAMS_BY_TYPE, type InsightsType } from "./params.ts";

export type QlooTag = { id: string; name: string; type?: string };

export type QlooEntity = {
  name: string;
  entity_id: string;
  types?: string[];
  subtype?: string;
  popularity?: number;
  location?: { lat: number; lon: number; geohash?: string };
  properties?: Record<string, unknown>;
  tags?: QlooTag[];
  query?: { affinity?: number; distance?: number };
};

export type HeatmapCell = {
  location: { latitude: number; longitude: number; geohash: string };
  query: { affinity: number; affinity_rank: number; popularity: number };
};

type InsightsResponse = {
  results?: { entities?: QlooEntity[]; heatmap?: HeatmapCell[]; tags?: QlooTag[] };
};

export class UnsupportedParamError extends Error {
  constructor(type: string, params: string[]) {
    super(`Params not supported for ${type}: ${params.join(", ")}`);
    this.name = "UnsupportedParamError";
  }
}

export function unsupportedParams(type: InsightsType, params: QlooParams) {
  const allowed: readonly string[] = PARAMS_BY_TYPE[type];
  return Object.keys(params).filter((key) => !allowed.includes(key));
}

// `allowUnlisted` is for params the docs omit but the API may accept (verify via probe first).
export async function insights(
  type: InsightsType,
  params: QlooParams,
  { allowUnlisted = [] as string[] } = {},
) {
  const bad = unsupportedParams(type, params).filter(
    (key) => !allowUnlisted.includes(key),
  );
  if (bad.length) throw new UnsupportedParamError(type, bad);
  const res = await qlooGet<InsightsResponse>("/v2/insights", {
    ...params,
    "filter.type": type,
  });
  return res.results ?? {};
}

export async function searchEntities(
  query: string,
  params: { types?: string[]; take?: number } = {},
) {
  const res = await qlooGet<{ results?: QlooEntity[] }>("/search", {
    query,
    ...params,
  });
  return res.results ?? [];
}

export async function searchTags(
  query: string,
  params: { "filter.tag.types"?: string[]; take?: number } = {},
) {
  const res = await qlooGet<{ results?: { tags?: QlooTag[] } }>("/v2/tags", {
    "filter.query": query,
    ...params,
  });
  return res.results?.tags ?? [];
}

export async function heatmap(params: QlooParams) {
  const results = await insights("urn:heatmap", params);
  return results.heatmap ?? [];
}
