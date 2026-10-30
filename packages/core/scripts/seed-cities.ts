// Usage: npm run cities:seed [-- cities15000|cities5000]
// Loads GeoNames cities (≥ 15k people by default, ~33k rows) and country info into Postgres
// (`cities`, `countries`). Data: GeoNames, CC BY 4.0 (credited in README). Downloads to /tmp at
// run time; nothing is committed. Idempotent: rows are upserted.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { closeDb, db } from "../src/db/client.server.ts";

const SET = process.argv[2] === "cities5000" ? "cities5000" : "cities15000";
const DIR = "/tmp/tourbo-geonames";
const CONTINENT: Record<string, string> = { AF: "africa", AS: "asia", EU: "europe", NA: "north_america", SA: "south_america", OC: "oceania", AN: "antarctica" };

function download(file: string) {
  const path = `${DIR}/${file}`;
  if (!existsSync(path)) {
    execFileSync("mkdir", ["-p", DIR]);
    console.error(`downloading ${file}…`);
    execFileSync("curl", ["-fsSL", "-o", path, `https://download.geonames.org/export/dump/${file}`]);
  }
  return path;
}

const zip = download(`${SET}.zip`);
execFileSync("unzip", ["-o", "-q", zip, "-d", DIR]);
const countryInfo = readFileSync(download("countryInfo.txt"), "utf8");

const countries = countryInfo
  .split("\n")
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t"))
  .map((c) => ({ code: c[0], name: c[4], continent: CONTINENT[c[8]] ?? "other", currency: c[10] || null }));
const continentOf = new Map(countries.map((c) => [c.code, c.continent]));

// geonameid, name, asciiname, alternatenames, lat, lon, fclass, fcode, country, cc2, admin1, …, population(14), …, timezone(17)
const cities = readFileSync(`${DIR}/${SET}.txt`, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"))
  .filter((c) => continentOf.has(c[8]) && continentOf.get(c[8]) !== "antarctica")
  .map((c) => ({
    id: Number(c[0]),
    name: c[1],
    ascii_name: c[2] || c[1],
    country: c[8],
    admin1: c[10] || null,
    lat: Number(c[4]),
    lon: Number(c[5]),
    population: Number(c[14]) || 0,
    timezone: c[17] || null,
    continent: continentOf.get(c[8])!,
  }));

const sql = await db();
await sql`insert into countries ${sql(countries)} on conflict (code) do update set name = excluded.name, continent = excluded.continent, currency = excluded.currency`;
for (let i = 0; i < cities.length; i += 2000) {
  const batch = cities.slice(i, i + 2000);
  await sql`
    insert into cities ${sql(batch)}
    on conflict (id) do update set name = excluded.name, ascii_name = excluded.ascii_name, population = excluded.population,
      lat = excluded.lat, lon = excluded.lon, admin1 = excluded.admin1, timezone = excluded.timezone, continent = excluded.continent`;
}
const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from cities`;
const byContinent = await sql<{ continent: string; n: number }[]>`select continent, count(*)::int as n from cities group by continent order by n desc`;
console.log(`${n} cities in Postgres (${SET}); ${byContinent.map((r) => `${r.continent} ${r.n}`).join(", ")}`);
await closeDb();
