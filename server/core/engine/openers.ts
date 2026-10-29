import { heatmap, insights } from "../qloo/api.server.ts";
import {
  locationQuery,
  type Artist,
  type CityScore,
  type Opener,
} from "../shared/types.ts";
import { noopEmit, type Emit } from "./trace.ts";

const CANDIDATES = 8;

export type OpenerCandidate = Omit<Opener, "localCells">;

// Similar artists smaller than the headliner. Computed once per tour, checked per city.
export async function openerCandidates(artist: Artist): Promise<OpenerCandidate[]> {
  const { entities = [] } = await insights("urn:entity:artist", {
    "signal.interests.entities": artist.id,
    "filter.exclude.entities": artist.id,
    ...(artist.popularity ? { "filter.popularity.max": artist.popularity } : {}),
    take: 20,
  });
  return entities.slice(0, CANDIDATES).map((e) => ({
    id: e.entity_id,
    name: e.name,
    popularity: e.popularity,
    affinity: e.query?.affinity,
  }));
}

// `signal.location` barely moves artist insights (probe: 8/10 overlap), so local pull is
// measured directly from heatmaps. Raw cell counts favor the biggest act everywhere, so rank
// by lift (cells here ÷ the candidate's mean across tour cities) × log1p(cells).
export async function pickOpeners(
  candidates: OpenerCandidate[],
  cities: CityScore[],
  emit: Emit = noopEmit,
): Promise<Map<string, Opener>> {
  const cells = await Promise.all(
    candidates.map((candidate) =>
      Promise.all(
        cities.map((city) =>
          heatmap({
            "signal.interests.entities": candidate.id,
            "filter.location.query": locationQuery(city.city),
            "output.heatmap.boundary": "urn:geohash",
          })
            .then((result) => result.length)
            .catch(() => 0),
        ),
      ),
    ),
  );

  const picks = new Map<string, Opener>();
  cities.forEach((city, ci) => {
    let best: { opener: Opener; score: number } | undefined;
    candidates.forEach((candidate, ki) => {
      const here = cells[ki][ci];
      const mean = cells[ki].reduce((sum, n) => sum + n, 0) / cities.length;
      if (!here || !mean) return;
      const score = (here / mean) * Math.log1p(here);
      if (!best || score > best.score) {
        best = { opener: { ...candidate, localCells: here }, score };
      }
    });
    if (best) picks.set(city.city.name, best.opener);
    emit(
      "decision",
      best
        ? `${city.city.name}: opener ${best.opener.name} (${best.opener.localCells} local cells, lift ${(best.score / Math.log1p(best.opener.localCells)).toFixed(2)})`
        : `${city.city.name}: no opener with local presence`,
      { city: city.city.name, opener: best?.opener.name },
    );
  });
  return picks;
}
