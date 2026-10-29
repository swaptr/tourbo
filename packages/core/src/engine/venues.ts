import { insights, type QlooEntity } from "../qloo/api.server.ts";
import {
  locationQuery,
  type CityScore,
  type Venue,
} from "../shared/types.ts";
import { signalParams, type FanSignal } from "./score.ts";
import { noopEmit, type Emit } from "./trace.ts";
import type { PerformerKind } from "../shared/types.ts";

export const VENUE_TAGS = [
  "urn:tag:category:place:live_music_venue",
  "urn:tag:category:place:concert_hall",
  "urn:tag:category:place:night_club",
  "urn:tag:category:place:bar",
];

// Comedy rooms: the comedy_club category tag works (Chicago 8+, Mumbai thin, probe 2026-10-29);
// bars and theatres-with-bars cover the rest of the stand-up circuit.
export const COMEDY_TAGS = [
  "urn:tag:category:place:comedy_club",
  "urn:tag:genre:place:comedy_club",
  "urn:tag:category:place:bar",
  "urn:tag:category:place:concert_hall",
];

export const venueTags = (kind: PerformerKind = "musician") => (kind === "comedian" ? COMEDY_TAGS : VENUE_TAGS);

// Room type shown to the act and used by the economics model.
export function roomType(tag: string) {
  if (tag.includes("comedy_club")) return "comedy club";
  if (tag.endsWith(":bar")) return "bar";
  if (tag.endsWith(":night_club")) return "club";
  if (tag.endsWith(":concert_hall")) return "hall / theatre";
  return "music venue";
}

const RADII_M = [1500, 3000, 6000];
const WANT = 12; // the worker rejects many (festivals, arenas, restaurants), so over-collect

type Step = { label: string; params: Record<string, string | number> };

// Repair chain (PLAN §9): widen around the top hotspot, then geohash area, then whole city.
// Each step collects from every venue tag before widening.
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
  return [...near, { label: "city", params: { "filter.location.query": locationQuery(city.city) } }];
}

export async function findVenues(
  signal: FanSignal,
  city: CityScore,
  emit: Emit = noopEmit,
  kind: PerformerKind = "musician",
): Promise<Venue[]> {
  const found = new Map<string, Venue>();
  const tags = venueTags(kind);
  for (const step of steps(city)) {
    const results = await Promise.all(
      tags.map((tag) =>
        insights("urn:entity:place", {
          ...step.params,
          "filter.tags": tag,
          ...signalParams(signal),
          take: 10,
        }).catch((error: Error) => {
          emit("repair", `${city.city.name}: venue search failed (${short(tag)}): ${error.message.slice(0, 80)}`);
          return { entities: [] };
        }),
      ),
    );
    results.forEach(({ entities = [] }, i) => {
      const tag = tags[i];
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
    });
    if (found.size >= WANT) return [...found.values()];
    emit("repair", `${city.city.name}: only ${found.size} venues, widening search`, {
      city: city.city.name,
      after: step.label,
    });
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
