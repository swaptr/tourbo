import { insights, type QlooEntity } from "../qloo/api.server.ts";
import type { InsightsType } from "../qloo/params.ts";
import type { AngleFacts, Reference } from "../shared/types.ts";

type Ids = string | string[];
const ids = (v: Ids) => [v].flat().join(",");

const FAN_TYPES: InsightsType[] = [
  "urn:entity:tv_show",
  "urn:entity:podcast",
  "urn:entity:brand",
  "urn:entity:movie",
];
const CITY_TYPES: InsightsType[] = [
  "urn:entity:tv_show",
  "urn:entity:podcast",
  "urn:entity:brand",
  "urn:entity:person",
];
const SPOT_TAGS = ["urn:tag:category:place:restaurant", "urn:tag:category:place:bar"];
const TAKE = 5;

// Combining artist + city signals barely changes results (Chicago ≈ Austin, verified
// 2026-10-29), so the angle mixes three sources instead.
export async function fanTaste(artistId: Ids): Promise<Reference[]> {
  const lists = await Promise.all(
    FAN_TYPES.map((type) =>
      insights(type, { "signal.interests.entities": ids(artistId), take: TAKE }).then(
        (r) => refs(r.entities, type),
      ),
    ),
  );
  return lists.flat();
}

export async function cityCulture(city: string): Promise<Reference[]> {
  const lists = await Promise.all(
    CITY_TYPES.map((type) =>
      insights(
        type,
        { "signal.location.query": city, take: TAKE },
        { allowUnlisted: ["signal.location.query"] },
      ).then((r) => refs(r.entities, type)),
    ),
  );
  return lists.flat();
}

export async function localSpots(artistId: Ids, city: string): Promise<Reference[]> {
  const lists = await Promise.all(
    SPOT_TAGS.map((tag) =>
      insights("urn:entity:place", {
        "filter.location.query": city,
        "filter.tags": tag,
        "signal.interests.entities": ids(artistId),
        take: TAKE,
      }).then((r) => refs(r.entities, "urn:entity:place")),
    ),
  );
  return dedupe(lists.flat());
}

export async function angleFacts(
  artistId: Ids,
  city: string,
  fans: Reference[],
): Promise<AngleFacts> {
  const [culture, spots] = await Promise.all([cityCulture(city), localSpots(artistId, city)]);
  return { fanTaste: fans, cityCulture: culture, localSpots: spots };
}

function refs(entities: QlooEntity[] = [], type: string): Reference[] {
  return entities.map((e) => ({
    name: e.name,
    type: type.split(":").at(-1) ?? type,
    affinity: e.query?.affinity,
    popularity: e.popularity,
  }));
}

function dedupe(items: Reference[]) {
  return [...new Map(items.map((item) => [item.name, item])).values()];
}
