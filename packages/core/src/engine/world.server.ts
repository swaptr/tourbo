import { db } from "../db/client.server.ts";
import type { Region } from "../shared/types.ts";
import { setWorld, type WorldCity } from "./cities.ts";

// Loads the GeoNames world table (scripts/seed-cities.ts) into the in-memory city index once per
// process. Safe to call often; when the table is empty or the DB is down, the seed list is used.

const CONTINENT_REGION: Record<string, Region> = {
  north_america: "na",
  europe: "eu",
  south_america: "latam",
  africa: "africa",
  asia: "asia",
  oceania: "oceania",
};
// Central America and the Caribbean sit in GeoNames' North America but price like Latin America.
const LATAM_NA = new Set(["MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "HT", "JM", "PR", "TT", "BS", "BB"]);

export function regionFor(country: string, continent: string): Region {
  if (country === "IN") return "in";
  if (continent === "north_america" && LATAM_NA.has(country)) return "latam";
  return CONTINENT_REGION[continent] ?? "asia";
}

let loading: Promise<boolean> | undefined;

export function ensureWorld(): Promise<boolean> {
  loading ??= (async () => {
    const sql = await db();
    const rows = await sql<{ name: string; country: string; country_name: string; admin1: string | null; lat: number; lon: number; population: number; continent: string; timezone: string | null }[]>`
      select c.name, c.country, k.name as country_name, c.admin1, c.lat, c.lon, c.population, c.continent, c.timezone
      from cities c join countries k on k.code = c.country order by c.population desc`;
    const world: WorldCity[] = rows.map((r) => ({
      name: r.name,
      // Qloo resolves "City, Country" (and "City, ST" in the US) better than a bare, ambiguous name.
      query: r.country === "US" && r.admin1 ? `${r.name}, ${r.admin1}` : `${r.name}, ${r.country_name}`,
      region: regionFor(r.country, r.continent),
      lat: r.lat,
      lon: r.lon,
      country: r.country,
      population: r.population,
      ...(r.timezone ? { timezone: r.timezone } : {}),
    }));
    setWorld(world);
    return world.length > 0;
  })().catch(() => {
    loading = undefined;
    return false;
  });
  return loading;
}
