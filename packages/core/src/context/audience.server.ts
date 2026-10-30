import { qlooGet, type QlooParams } from "../qloo/client.server.ts";
import { audienceProfile, demoBlocks, type AudienceProfile, type DemoBlock } from "./audience.ts";

// Fetch demographics blocks (qloo-docs demographics-use-case.md): GET /v2/insights with
// filter.type=urn:demographics and signal.interests.entities (comma-separated ids) and/or
// signal.interests.tags. One block per signal entity/tag. `urn:demographics` is not in
// params.ts PARAMS_BY_TYPE (it is not an entity type), so this goes straight through qlooGet.
// Not probed yet (fan-data quota exhausted 2026-10-30): request shape from the docs only.
export async function demographics(opts: { entities?: string[]; tags?: string[] }): Promise<DemoBlock[]> {
  const entities = (opts.entities ?? []).filter(Boolean).slice(0, 10);
  const tags = (opts.tags ?? []).filter(Boolean).slice(0, 5);
  if (!entities.length && !tags.length) return [];
  const params: QlooParams = { "filter.type": "urn:demographics" };
  if (entities.length) params["signal.interests.entities"] = entities.join(",");
  if (tags.length) params["signal.interests.tags"] = tags.join(",");
  return demoBlocks(await qlooGet("/v2/insights", params));
}

// Act side: the act (+ peers) and/or style tags. City side: ids of the city's own most-followed
// entities (from a location-only insights call the caller already made). Never throws: no data =
// an "even" profile with no age signal.
export async function fetchAudienceProfile(opts: { actIds?: string[]; actTags?: string[]; cityEntityIds?: string[]; cityName?: string }): Promise<AudienceProfile> {
  const [act, city] = await Promise.all([
    opts.actIds?.length || opts.actTags?.length ? demographics({ entities: opts.actIds, tags: opts.actTags }).catch(() => undefined) : undefined,
    opts.cityEntityIds?.length ? demographics({ entities: opts.cityEntityIds.slice(0, 10) }).catch(() => undefined) : undefined,
  ]);
  return audienceProfile({ act, city, cityName: opts.cityName });
}
