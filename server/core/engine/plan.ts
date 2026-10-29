import {
  locationQuery,
  type CityPlan,
  type Plan,
  type TourParams,
} from "../shared/types.ts";
import { fanTaste, angleFacts } from "./angles.ts";
import { seedCities } from "./cities.ts";
import { openerCandidates, pickOpeners } from "./openers.ts";
import { resolveArtist } from "./resolve.ts";
import { routeTour } from "./routing.ts";
import { scoreCities, shortlist } from "./score.ts";
import { noopEmit, type Emit } from "./trace.ts";
import { findVenues } from "./venues.ts";

// Deterministic Qloo pipeline (no LLM). The agent layer wraps these steps as tools
// and adds judgment: venue fit, copy, critique.
export async function buildPlan(params: TourParams, emit: Emit = noopEmit): Promise<Plan> {
  const artist = await resolveArtist(params.artist);
  if (!artist) throw new Error(`Artist not found: ${params.artist}`);
  emit("decision", `Resolved ${artist.name}`, { id: artist.id, popularity: artist.popularity });

  const seeds = seedCities(params.region);
  const scores = await scoreCities(artist.id, seeds, emit);
  const candidates = shortlist(scores, params.shows);
  const picks = candidates.slice(0, params.shows);
  emit("decision", `Picked ${picks.map((c) => `${c.city.name} ${c.score}`).join(", ")}`);

  const home = seeds.find((c) => c.name.toLowerCase() === params.homeBase?.toLowerCase());
  const route = routeTour(picks, params.startDate, home);

  const [openers, fans, venues] = await Promise.all([
    openerCandidates(artist).then((c) => pickOpeners(c, picks, emit)),
    fanTaste(artist.id),
    Promise.all(picks.map((city) => findVenues(artist.id, city, emit))),
  ]);
  const facts = await Promise.all(picks.map((city) => angleFacts(artist.id, locationQuery(city.city), fans)));

  const stops: CityPlan[] = route.stops.map(({ city, date }) => {
    const i = picks.indexOf(city);
    return {
      city: city.city,
      score: city.score,
      date,
      hotspots: city.hotspots,
      venue: venues[i][0],
      backupVenue: venues[i][1],
      opener: openers.get(city.city.name),
      facts: facts[i],
      evidence: [],
      thinData: city.thinData,
    };
  });
  return { artist, params, stops, legs: route.legs, totalKm: route.totalKm };
}
