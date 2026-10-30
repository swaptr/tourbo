import { distanceKm } from "../shared/geo.ts";
import { City, type Area, type Region } from "../shared/types.ts";
import raw from "./data/cities.json" with { type: "json" };

// Two sources: the hand-checked seed list (97 cities, na/eu/in) and, once loaded, the world
// table (GeoNames cities15000 in Postgres, ~34k cities; world.server.ts calls setWorld).
// Everything here stays synchronous; without the world table it falls back to the seeds.
const SEEDS = City.array().parse(raw);
let WORLD: WorldCity[] = [];

export type WorldCity = City & { country: string; population: number };

export function setWorld(cities: WorldCity[]) {
  // Seed entries carry verified Qloo queries ("New York City", "Richmond, Virginia"): keep them.
  const seedQuery = new Map(SEEDS.filter((s) => s.query).map((s) => [s.name.toLowerCase(), s]));
  WORLD = cities.map((c) => {
    const seed = seedQuery.get(c.name.toLowerCase());
    return seed && distanceKm(seed, c) < 40 ? { ...c, query: seed.query } : c;
  });
}
export const worldLoaded = () => WORLD.length > 0;

export function seedCities(region: Region): City[] {
  const seeds = SEEDS.filter((city) => city.region === region);
  if (seeds.length || !WORLD.length) return seeds;
  // Regions without a seed list: the region's 20 largest world cities (one Qloo call each).
  return dedupeMetros(WORLD.filter((c) => c.region === region)).slice(0, 20);
}

// Suburbs and boroughs within 25 km of a bigger city collapse into it (list sorted big → small).
const METRO_KM = 25;
function dedupeMetros<T extends City>(sorted: T[]): T[] {
  const kept: T[] = [];
  for (const c of sorted) if (!kept.some((k) => distanceKm(k, c) < METRO_KM)) kept.push(c);
  return kept;
}

// A city by name: the seed list first, then the most populous world city with that name.
export function findCity(region: Region, name: string): City | undefined {
  const n = name.trim().toLowerCase();
  const plain = n.replace(/,.*$/, "");
  return (
    SEEDS.find((c) => c.region === region && c.name.toLowerCase() === n) ??
    WORLD.find((c) => c.region === region && (c.name.toLowerCase() === plain || locationName(c) === n)) ??
    WORLD.find((c) => c.name.toLowerCase() === plain)
  );
}
const locationName = (c: City) => (c.query ?? c.name).toLowerCase();

// Candidate cities inside the area: the largest cities in the circle (same region as the
// nearest), suburbs merged, capped at `cap` so scoring stays one Qloo call per city. Topped up
// with the next nearest when fewer than `min` fall inside, so a small circle still yields a tour.
export function citiesNear(area: Area, min = 0, cap = 25): { region: Region; nearest: City & { km: number }; cities: (City & { km: number })[]; inside: number } {
  const pool: City[] = WORLD.length ? WORLD : SEEDS;
  const all = pool.map((c) => ({ ...c, km: Math.round(distanceKm(area, c)) })).sort((a, b) => a.km - b.km);
  const nearest = all[0]!;
  const same = all.filter((c) => c.region === nearest.region);
  const insideAll = same.filter((c) => c.km <= area.radiusKm);
  const pop = (c: City) => ("population" in c ? Number(c.population) : 0);
  const bySize = WORLD.length ? [...insideAll].sort((a, b) => pop(b) - pop(a)) : insideAll;
  const inside = dedupeMetros(bySize).slice(0, cap);
  return { region: nearest.region, nearest, cities: inside.length >= min ? inside : dedupeMetros(same).slice(0, min), inside: inside.length };
}

export function candidateCities(opts: { region: Region; area?: Area; shows: number }): City[] {
  return opts.area ? citiesNear(opts.area, Math.ceil(opts.shows * 1.5), Math.max(12, Math.min(25, opts.shows * 3))).cities : seedCities(opts.region);
}

export const allSeedCities = () => SEEDS;

// Largest world cities (for maps); seeds when the world table isn't loaded.
export const topCities = (n: number): City[] => (WORLD.length ? WORLD.slice(0, n) : SEEDS);
