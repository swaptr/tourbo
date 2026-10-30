import {
  locationQuery,
  type CityPlan,
  type Plan,
  type TourParams,
} from "../shared/types.ts";
import { fanTaste, angleFacts } from "./angles.ts";
import { candidateCities, citiesNear, findCity, seedCities } from "./cities.ts";
import { openerCandidates, pickOpeners } from "./openers.ts";
import { resolvePerformer, signalIds } from "./resolve.ts";
import { routeTour } from "./routing.ts";
import { discipline } from "../disciplines/index.ts";
import { placeNotes } from "../places/hooks.server.ts";
import { scoreCities, shortlist } from "./score.ts";
import { noopEmit, type Emit } from "./trace.ts";
import { findVenues } from "./venues.ts";

// Deterministic Qloo pipeline (no LLM). The agent layer wraps these steps as tools
// and adds judgment: venue fit, copy, critique.
// The area's main city: anchors the "just my city" basis and the fallback for unknown acts.
export function planNear(params: Pick<TourParams, "area" | "homeBase" | "region">): string | undefined {
  if (params.homeBase) return params.homeBase;
  if (params.area) return locationQuery(citiesNear(params.area, 0).nearest);
  const seed = seedCities(params.region)[0];
  return seed && locationQuery(seed);
}

// What the act gave us, as resolvePerformer input: name, peers, styles or city-only.
export const performerOpts = (params: TourParams) => ({ notInQloo: params.notInQloo, styles: params.styles, basis: params.basis, near: planNear(params) });

export async function buildPlan(params: TourParams, emit: Emit = noopEmit): Promise<Plan> {
  const artist = await resolvePerformer(params.artist, params.kind, params.peers, performerOpts(params));
  if (!artist) throw new Error(`Artist not found: ${params.artist}`);
  emit("decision", `Resolved ${artist.name} (${artist.basis})`, { id: artist.id, popularity: artist.popularity, peers: artist.peers.map((p) => p.name), basis: artist.basis });
  const signal = signalIds(artist);

  // Style plans also blend the style tags' own heatmaps into the city scores.
  const tags = artist.basis === "styles" ? (artist.styles ?? []).map((t) => t.id) : [];
  const scores = await scoreCities(tags.length ? { entities: signal, tags } : signal, candidateCities(params), emit);
  const candidates = shortlist(scores, params.shows);
  const picks = candidates.slice(0, params.shows);
  emit("decision", `Picked ${picks.map((c) => `${c.city.name} ${c.score}`).join(", ")}`);

  const home = params.homeBase ? findCity(params.region, params.homeBase) : undefined;
  const route = routeTour(picks, params.startDate, home, discipline(artist.kind).stayDays);

  const [openers, fans, venues] = await Promise.all([
    openerCandidates(artist).then((c) => pickOpeners(artist, c, picks, emit)),
    fanTaste(signal),
    Promise.all(picks.map((city) => findVenues(signal, city, emit, artist.kind))),
  ]);
  // Place features (open data, no fan-data calls): price nudge, tone, date risk per night.
  const [facts, places] = await Promise.all([
    Promise.all(picks.map((city) => angleFacts(signal, locationQuery(city.city), fans))),
    Promise.all(route.stops.map(({ city, date }) => placeNotes(city.city, date ? [date] : [], { kind: artist.kind }))),
  ]);

  const stops: CityPlan[] = route.stops.map(({ city, date }, n) => {
    const i = picks.indexOf(city);
    return {
      city: city.city,
      score: city.score,
      fanIndex: city.fanIndex,
      date,
      hotspots: city.hotspots,
      venue: venues[i][0],
      backupVenue: venues[i][1],
      opener: openers.get(city.city.name),
      facts: facts[i],
      evidence: [],
      thinData: city.thinData,
      ...(places[n] ? { place: places[n] } : {}),
    };
  });
  return { artist, params, stops, legs: route.legs, totalKm: route.totalKm, basis: artist.basis };
}
