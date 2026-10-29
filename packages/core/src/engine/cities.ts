import { distanceKm } from "../shared/geo.ts";
import { City, type Area, type Region } from "../shared/types.ts";
import raw from "./data/cities.json" with { type: "json" };

const CITIES = City.array().parse(raw);

export function seedCities(region: Region): City[] {
  return CITIES.filter((city) => city.region === region);
}

// Seed cities inside the area (same region as the nearest one), topped up with the next
// nearest when fewer than `min` fall inside, so a small circle still yields a tour.
export function citiesNear(area: Area, min = 0): { region: Region; nearest: City & { km: number }; cities: (City & { km: number })[]; inside: number } {
  const all = CITIES.map((c) => ({ ...c, km: Math.round(distanceKm(area, c)) })).sort((a, b) => a.km - b.km);
  const nearest = all[0]!;
  const same = all.filter((c) => c.region === nearest.region);
  const inside = same.filter((c) => c.km <= area.radiusKm);
  return { region: nearest.region, nearest, cities: inside.length >= min ? inside : same.slice(0, min), inside: inside.length };
}

export function candidateCities(opts: { region: Region; area?: Area; shows: number }): City[] {
  return opts.area ? citiesNear(opts.area, Math.ceil(opts.shows * 1.5)).cities : seedCities(opts.region);
}

export const allSeedCities = () => CITIES;
