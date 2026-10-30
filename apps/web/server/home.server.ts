// Home page data. The landing page is static: it reads only the exported manifest
// (public/landing, written by `npm run examples:export`, git-ignored) and the browser fetches the
// hashed files. No fan-data API, agent or database calls when / is served.
// The dev* functions read Postgres directly and exist only for the dev review page and for a dev
// fallback while the export hasn't been written yet.
import { db } from "@tourbo/core/db/client.server.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { fanDensity, homeExamples, worldFanLayer } from "@tourbo/core/examples/examples.server.ts";
import type { FanDensity, HomeExample } from "@tourbo/core/examples/types.ts";
import type { LandingManifest, TownsFile, WorldFile } from "../app/lib/landing-data.ts";


const landingDir = () => (import.meta.env.PROD ? "build/client/landing" : "public/landing");

// The export's manifest from disk (re-read at most once a minute). undefined until exported.
const MANIFEST_TTL_MS = 60_000;
let manifest: { at: number; value?: LandingManifest } | undefined;
export async function landingManifest(): Promise<LandingManifest | undefined> {
  if (manifest && Date.now() - manifest.at < MANIFEST_TTL_MS) return manifest.value;
  const value = await readFile(join(process.cwd(), landingDir(), "manifest.json"), "utf8")
    .then((t) => JSON.parse(t) as LandingManifest)
    .catch(() => undefined);
  manifest = { at: Date.now(), value };
  return value;
}

// The first example in the export's play order, inlined into the prerendered HTML so the dialog
// shows it with no fetch. Read from the bundle on disk (never the database), once per examples file.
let first: { file: string; value?: HomeExample } | undefined;
export async function landingFirstExample(m: LandingManifest | undefined): Promise<HomeExample | undefined> {
  const file = m?.files.examples;
  if (!file) return undefined;
  if (first?.file === file) return first.value;
  const value = await readFile(join(process.cwd(), landingDir(), file), "utf8")
    .then((t) => (JSON.parse(t) as HomeExample[])[0])
    .catch(() => undefined);
  first = { file, value };
  return value;
}

// Dev only: the same shapes as the export, straight from Postgres.
export async function devExamples(): Promise<HomeExample[]> {
  return homeExamples();
}
// Same split as the export: cities ≥ 50k with the world file, small towns in their own file.
const devCities = async () => {
  const sql = await db();
  return sql<{ lon: number; lat: number; population: number }[]>`
    select round(lon::numeric, 1)::float8 as lon, round(lat::numeric, 1)::float8 as lat, max(population) as population from cities group by 1, 2`.catch(() => []);
};
const bucket = (p: number) => (p >= 1_000_000 ? 4 : p >= 250_000 ? 3 : p >= 50_000 ? 2 : 1);
const flat = (rows: { lon: number; lat: number; population: number }[]) => rows.flatMap((c) => [Math.round(c.lon * 10), Math.round(c.lat * 10), bucket(c.population)]);
export async function devWorld(): Promise<WorldFile> {
  const [world, cities] = await Promise.all([worldFanLayer().catch(() => undefined), devCities()]);
  return { fan: world?.fanPoints ?? [], cities: flat(cities.filter((c) => c.population >= 50_000)) };
}
export async function devTowns(): Promise<TownsFile> {
  return { cities: flat((await devCities()).filter((c) => c.population < 50_000)) };
}
export async function devActDensity(fanKey: string): Promise<FanDensity | undefined> {
  return fanDensity(fanKey);
}
