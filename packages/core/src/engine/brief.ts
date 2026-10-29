import { insights, type QlooEntity } from "../qloo/api.server.ts";
import type { InsightsType } from "../qloo/params.ts";
import type { AngleFacts, PerformerKind, Reference } from "../shared/types.ts";
import { cityCulture, fanTaste, localSpots } from "./angles.ts";
import { dedupeArtists, isMusician } from "./openers.ts";

// City brief for show prep (set notes, banter, setlist) and sponsor asks. Every item is a Qloo
// result with its score, so drafted material can be checked against it.
export type CityBrief = {
  city: string;
  fanTaste: Reference[]; // what the act's fans love (global)
  cityCulture: Reference[]; // what this city loves: TV, brands, people, podcasts
  localArtists: Reference[]; // the city's own music scene
  localSpots: Reference[]; // places in the city weighted by the act's fans
  sponsors: Reference[]; // city brands ranked by the act's fans (sponsor / co-promo asks)
  fanTags: Reference[]; // concepts the act's fans over-index on
};

const TAKE = 8;

const refs = (entities: QlooEntity[] = [], type: string): Reference[] =>
  entities.map((e) => ({ name: e.name, type, affinity: e.query?.affinity, popularity: e.popularity }));

const ids = (v: string | string[]) => [v].flat().join(",");

// The act's fans' concepts (genres, moods, themes): useful for comedians' material.
async function fanTags(signal: string | string[]) {
  const { tags = [] } = await insights("urn:tag" as InsightsType, { "signal.interests.entities": ids(signal), take: TAKE }).catch(() => ({ tags: [] }));
  return tags.map((t) => ({ name: t.name, type: "tag", affinity: (t as { query?: { affinity?: number } }).query?.affinity }));
}

// City brands, re-ranked by how much the act's fans like them (verified: Chicago + Japanese
// Breakfast → NPR, The Onion, PAWS Chicago, Revolution Brewing).
export async function sponsorCandidates(signal: string | string[], city: string): Promise<Reference[]> {
  const { entities: local = [] } = await insights("urn:entity:brand", { "signal.location.query": city, take: 25 });
  if (!local.length) return [];
  const { entities: ranked = [] } = await insights("urn:entity:brand", {
    "signal.interests.entities": ids(signal),
    "filter.results.entities": local.map((e) => e.entity_id).join(","),
    take: local.length,
  });
  return refs(ranked.slice(0, TAKE), "brand");
}

async function localArtists(city: string, exclude: string[]) {
  const { entities = [] } = await insights("urn:entity:artist", { "signal.location.query": city, take: 25 });
  return refs(dedupeArtists(entities.filter((e) => !exclude.includes(e.entity_id) && isMusician(e))).slice(0, TAKE), "artist");
}

export async function cityBrief(opts: {
  signal: string | string[];
  city: string;
  kind?: PerformerKind;
  facts?: AngleFacts; // reuse what the plan already fetched
}): Promise<CityBrief> {
  const exclude = [opts.signal].flat();
  const [fans, culture, spots, artists, sponsors, tags] = await Promise.all([
    opts.facts?.fanTaste ?? fanTaste(opts.signal),
    opts.facts?.cityCulture ?? cityCulture(opts.city),
    opts.facts?.localSpots ?? localSpots(opts.signal, opts.city),
    localArtists(opts.city, exclude).catch(() => []),
    sponsorCandidates(opts.signal, opts.city).catch(() => []),
    fanTags(opts.signal),
  ]);
  return { city: opts.city, fanTaste: fans, cityCulture: culture, localArtists: artists, localSpots: spots, sponsors, fanTags: tags };
}

// Every name in a brief, normalised: the material critic accepts only references in here.
export function briefNames(brief: CityBrief) {
  const all = [...brief.fanTaste, ...brief.cityCulture, ...brief.localArtists, ...brief.localSpots, ...brief.sponsors, ...brief.fanTags];
  return new Set(all.map((r) => normalizeRef(r.name)));
}

export const normalizeRef = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
