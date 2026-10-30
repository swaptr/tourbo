import { heatmap, type HeatmapCell } from "../qloo/api.server.ts";
import {
  locationQuery,
  type City,
  type CityScore,
  type Hotspot,
} from "../shared/types.ts";
import { noopEmit, type Emit } from "./trace.ts";

const THIN_CELLS = 50;
const HOTSPOTS = 3;

// Heatmap affinity is percentile-normalized per request (median 0.5), so it can't
// compare cities. Blend absolute fan footprint with over-indexing instead:
//   footprint = log1p(Σ affinity × popularity)   (how many fans, scales with city size)
//   overIndex = mean(affinity_rank)              (how strongly the city leans to the artist)
// Fan signal: one act, several (headliner + "sounds like" peers), or genre/scene tags.
export type FanSignal = string | string[] | { entities?: string[]; tags?: string[] };

export function signalParams(signal: FanSignal) {
  const s = typeof signal === "string" || Array.isArray(signal) ? { entities: [signal].flat() } : signal;
  return {
    ...(s.entities?.length ? { "signal.interests.entities": s.entities.join(",") } : {}),
    ...(s.tags?.length ? { "signal.interests.tags": s.tags.join(",") } : {}),
  };
}

export async function scoreCities(
  signal: FanSignal,
  cities: City[],
  emit: Emit = noopEmit,
): Promise<CityScore[]> {
  const measured = await Promise.all(
    cities.map(async (city) => {
      const cells = await heatmap({
        ...signalParams(signal),
        "filter.location.query": locationQuery(city),
        "output.heatmap.boundary": "urn:geohash",
      }).catch((error: Error) => {
        emit("repair", `Heatmap failed for ${city.name}: ${error.message}`);
        return [] as HeatmapCell[];
      });
      emit("qloo_call", `Heatmap ${city.name}: ${cells.length} cells`, {
        city: city.name,
        cells: cells.length,
      });
      return { city, cells, ...measure(cells) };
    }),
  );

  const footprint = normalize(measured.map((m) => m.footprint));
  const overIndex = normalize(measured.map((m) => m.overIndex));
  return measured
    .map((m, i) => ({
      city: m.city,
      score: Math.round(100 * (0.6 * footprint[i] + 0.4 * overIndex[i])),
      cells: m.cells.length,
      fanIndex: Math.round(m.weighted * 10) / 10,
      reach: Math.round(100 * footprint[i]),
      lean: Math.round(100 * overIndex[i]),
      hotspots: hotspots(m.cells),
      thinData: m.cells.length < THIN_CELLS,
    }))
    .sort((a, b) => b.score - a.score);
}

function measure(cells: HeatmapCell[]) {
  if (!cells.length) return { footprint: 0, overIndex: 0, weighted: 0 };
  const weighted = cells.reduce((sum, c) => sum + c.query.affinity * c.query.popularity, 0);
  const rank = cells.reduce((sum, c) => sum + c.query.affinity_rank, 0) / cells.length;
  return { footprint: Math.log1p(weighted), overIndex: rank, weighted };
}

// Top cells by affinity × popularity, spread out (distinct 5-char geohash prefixes).
function hotspots(cells: HeatmapCell[]): Hotspot[] {
  const picked: Hotspot[] = [];
  const sorted = [...cells].sort(
    (a, b) => b.query.affinity * b.query.popularity - a.query.affinity * a.query.popularity,
  );
  for (const cell of sorted) {
    const prefix = cell.location.geohash.slice(0, 5);
    if (picked.some((h) => h.geohash.startsWith(prefix))) continue;
    picked.push({
      geohash: cell.location.geohash,
      lat: cell.location.latitude,
      lon: cell.location.longitude,
      affinity: cell.query.affinity,
      popularity: cell.query.popularity,
    });
    if (picked.length === HOTSPOTS) break;
  }
  return picked;
}

function normalize(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => (max === min ? 0 : (v - min) / (max - min)));
}

// Keep N × 1.5 candidates so routing and the critic have room to swap; thin-data cities go last.
export function shortlist(scores: CityScore[], shows: number): CityScore[] {
  const ranked = [...scores].sort(
    (a, b) => Number(a.thinData) - Number(b.thinData) || b.score - a.score,
  );
  return ranked.slice(0, Math.ceil(shows * 1.5));
}
