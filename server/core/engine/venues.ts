import { insights, type QlooEntity } from "../qloo/api.server.ts";
import type { CityScore, Venue } from "../shared/types.ts";
import { noopEmit, type Emit } from "./trace.ts";

export const VENUE_TAGS = [
  "urn:tag:category:place:live_music_venue",
  "urn:tag:category:place:concert_hall",
  "urn:tag:category:place:night_club",
  "urn:tag:category:place:bar",
];

const RADII_M = [1500, 3000, 6000];
const WANT = 5;

type Step = { label: string; params: Record<string, string | number> };

// Repair chain (PLAN §9): widen around the top hotspot, then geohash area, then whole city.
// The first music tag is tried at every step before falling back to the next tag.
function steps(city: CityScore): Step[] {
  const hotspot = city.hotspots[0];
  const near: Step[] = hotspot
    ? [
        ...RADII_M.map((radius) => ({
          label: `hotspot ${radius}m`,
          params: {
            "filter.location": `POINT(${hotspot.lon} ${hotspot.lat})`,
            "filter.location.radius": radius,
          },
        })),
        {
          label: "hotspot area",
          params: { "filter.location.geohash": hotspot.geohash.slice(0, 4) },
        },
      ]
    : [];
  return [...near, { label: "city", params: { "filter.location.query": city.city.name } }];
}

export async function findVenues(
  artistId: string,
  city: CityScore,
  emit: Emit = noopEmit,
): Promise<Venue[]> {
  const found = new Map<string, Venue>();
  for (const tag of VENUE_TAGS) {
    for (const step of steps(city)) {
      const { entities = [] } = await insights("urn:entity:place", {
        ...step.params,
        "filter.tags": tag,
        "signal.interests.entities": artistId,
        take: 10,
      });
      const open = entities.filter((e) => e.properties?.is_closed !== true);
      emit("qloo_call", `${city.city.name}: ${open.length} venues (${short(tag)}, ${step.label})`, {
        city: city.city.name,
        tag,
        step: step.label,
        results: open.length,
      });
      for (const entity of open) {
        if (!found.has(entity.entity_id)) found.set(entity.entity_id, toVenue(entity, tag, step.label));
      }
      if (found.size >= WANT) return [...found.values()];
      emit("repair", `${city.city.name}: only ${found.size} venues, widening search`, {
        city: city.city.name,
        after: step.label,
      });
    }
  }
  return [...found.values()];
}

function toVenue(entity: QlooEntity, tag: string, foundBy: string): Venue {
  const props = entity.properties ?? {};
  const str = (key: string) => (typeof props[key] === "string" ? (props[key] as string) : undefined);
  return {
    id: entity.entity_id,
    name: entity.name,
    address: str("address"),
    lat: entity.location?.lat,
    lon: entity.location?.lon,
    popularity: entity.popularity,
    affinity: entity.query?.affinity,
    tag,
    neighborhood: str("neighborhood"),
    website: str("website"),
    description: str("description") ?? str("short_description"),
    foundBy,
  };
}

const short = (tag: string) => tag.split(":").at(-1) ?? tag;
