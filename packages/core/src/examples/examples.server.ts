import { db } from "../db/client.server.ts";
import type { CityDot, FanDensity, HomeExample } from "./types.ts";

export type { CityDot, FanDensity, HomeExample } from "./types.ts";

// Home examples, read from Postgres (built by scripts/prewarm-examples.ts). [] until prewarmed.
export async function homeExamples(): Promise<HomeExample[]> {
  const sql = await db();
  const rows = await sql<{ example: HomeExample }[]>`select example from home_examples order by id`;
  return rows.map((r) => r.example);
}

// The always-on base layer: all acts' density summed on a 1° grid (fan_key "_world").
export const worldFanLayer = () => fanDensity("_world");

// One act's worldwide fan density (shared by all its examples).
export async function fanDensity(fanKey: string): Promise<FanDensity | undefined> {
  const sql = await db();
  const [row] = await sql<{ density: FanDensity }[]>`select density from home_fan_density where fan_key = ${fanKey}`;
  return row?.density;
}

let dots: Promise<CityDot[]> | undefined;

// Every seeded city as a rounded [lon, lat] dot for the world map (deduped at 0.1°). [] until seeded.
export function cityDots(): Promise<CityDot[]> {
  dots ??= (async () => {
    const sql = await db();
    const rows = await sql<{ lon: number; lat: number }[]>`
      select distinct round(lon::numeric, 1)::float8 as lon, round(lat::numeric, 1)::float8 as lat from cities`;
    return rows.map((r) => [r.lon, r.lat] as CityDot);
  })().catch((error) => {
    dots = undefined;
    throw error;
  });
  return dots;
}
