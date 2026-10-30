// Usage: npm run examples:export [-- --still <png>]
// Writes the landing page's static bundle to apps/web/public/landing/ (committed): content-hashed
// JSON files plus manifest.json. Data only: the browser bakes the globe's terrain itself. The
// landing page reads only these files, never Qloo, the agent or the DB. Refuses to write unless
// the stored examples clear the minimum (≥ 100 complete examples, ≥ 6 continents, ≥ 3 acts per discipline) and prints what's missing. Fan points per continent are
// in our compact format (LandingRegionFile in @tourbo/core/examples/types.ts), thin-data countries
// flagged. The fan-vs-guess contrast comes from stored runs, no AI calls.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { DISCIPLINES } from "@tourbo/core/disciplines/index.ts";
import type { Continent, FanDensity, HomeExample } from "@tourbo/core/examples/types.ts";
import { encodeAct, encodeRegion } from "@tourbo/core/examples/landing-format.ts";
import type { Baseline, Plan } from "@tourbo/core/shared/types.ts";
import { exampleProblem } from "@tourbo/core/examples/check.ts";
import { distanceKm } from "@tourbo/core/shared/geo.ts";

const OUT = new URL("../public/landing/", import.meta.url).pathname;
const MIN_EXAMPLES = 100;
const MIN_CONTINENTS = 6;
const MIN_PER_DISCIPLINE = 3;
const MIN_DENSITY_POINTS = 1000;
const LANDING_POINTS = 1500; // per act at landing level of detail (strongest points kept); full detail stays in Postgres
const FIRST_FETCH_GZ = 300 * 1024;

const sql = await db();
const examples = (await sql<{ example: HomeExample }[]>`select example from home_examples order by id`).map((r) => r.example);
const densities = new Map((await sql<{ fan_key: string; density: FanDensity }[]>`select fan_key, density from home_fan_density`).map((r) => [r.fan_key, r.density]));
const cities = await sql<{ lon: number; lat: number; population: number; country: string }[]>`select lon, lat, population, country from cities order by population desc`;
const runs = await sql<{ id: string; plan: Plan; baseline: Baseline }[]>`
  select id, plan, baseline from runs
  where status = 'done' and baseline is not null and plan is not null and jsonb_array_length(plan->'stops') >= 3
  order by created_at desc limit 50`;
await closeDb();

// "Fan data vs an AI's guess" from stored runs (no new AI calls): the run whose two plans differ most.
type ContrastRow = { city: string; side: "fan" | "guess" | "both"; line: string };
const bare = (city: string) => city.replace(/,.*$/, "").trim().toLowerCase();
function contrastOf(run: (typeof runs)[number]): { act: string; runId: string; rows: ContrastRow[] } {
  const guess = new Map(run.baseline.stops.map((s) => [bare(s.city), s]));
  const fan = new Map(run.plan.stops.map((s) => [bare(s.city.name), s]));
  const rows: ContrastRow[] = [];
  for (const [key, s] of fan) {
    const g = guess.get(key);
    if (!g) {
      const bits = [`fan strength ${s.score} of 100`, s.venue && `a room near the fans (${s.venue.name})`, s.opener && `a local opener (${s.opener.name})`].filter(Boolean);
      rows.push({ city: s.city.name, side: "fan", line: `Fan data found it: ${bits.join(", ")}.` });
    } else if (s.venue && g.venue && bare(g.venue) !== bare(s.venue.name)) {
      rows.push({ city: s.city.name, side: "both", line: `Both picked it. Fan data chose ${s.venue.name}, near where the fans live; the guess was ${g.venue}.` });
    }
  }
  for (const [key, g] of guess) if (!fan.has(key)) rows.push({ city: g.city.replace(/,.*$/, ""), side: "guess", line: g.why });
  return { act: run.plan.artist.name, runId: run.id, rows: rows.slice(0, 6) };
}
const contrast = runs.map(contrastOf).sort((a, b) => b.rows.filter((r) => r.side !== "both").length - a.rows.filter((r) => r.side !== "both").length)[0];

// Point → country via the nearest big city in the same 1° cell (or a neighbour), to flag points in
// thin-data countries ([lat, lon, w, 1]) so the globe can draw them lighter.
const cellCountry = new Map<string, string>();
for (const c of cities) {
  const k = `${Math.round(c.lat)},${Math.round(c.lon)}`;
  if (!cellCountry.has(k)) cellCountry.set(k, c.country);
}
function countryAt(lat: number, lon: number) {
  const la = Math.round(lat), lo = Math.round(lon);
  for (const [dy, dx] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const c = cellCountry.get(`${la + dy},${lo + dx}`);
    if (c) return c;
  }
  return undefined;
}

// Completeness: every field the landing page shows, plus the act's map data.
function missing(ex: HomeExample): string[] {
  const d = densities.get(ex.fanKey);
  return [
    !ex.decision?.headline && "headline",
    !(ex.route?.length && ex.route.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))) && "route",
    !ex.compare && "compare",
    !ex.tourProfit && "tourProfit",
    !ex.losingNight && "losingNight",
    !(d && d.fanPoints.length >= MIN_DENSITY_POINTS) && "density",
    !(d && Object.keys(d.coverage).length) && "coverage",
    exampleProblem(ex) && "words-match-numbers",
  ].filter((x): x is string => !!x);
}

const gaps = new Map<string, number>();
const complete = examples.filter((ex) => {
  const m = missing(ex);
  for (const f of m) gaps.set(f, (gaps.get(f) ?? 0) + 1);
  return !m.length;
});
const continents = new Set(complete.map((e) => e.home.continent));
const actsByKind = new Map<string, Set<string>>();
for (const e of complete) actsByKind.set(e.act.kind, (actsByKind.get(e.act.kind) ?? new Set()).add(e.fanKey));
const thinKinds = Object.keys(DISCIPLINES).filter((k) => (actsByKind.get(k)?.size ?? 0) < MIN_PER_DISCIPLINE);

console.log(`${examples.length} examples, ${complete.length} complete, ${new Set(complete.map((e) => e.fanKey)).size} acts, ${densities.size} densities, ${continents.size} continents`);
console.log(`per discipline: ${Object.keys(DISCIPLINES).map((k) => `${k} ${actsByKind.get(k)?.size ?? 0}`).join(", ")}`);
if (gaps.size) console.log(`missing fields: ${[...gaps].map(([f, n]) => `${f} ×${n}`).join(", ")}`);
// Content-hashed files; the manifest is the only un-hashed name.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const sizes: Record<string, number> = {};
function write(name: string, data: unknown) {
  const body = JSON.stringify(data);
  const file = `${name}.${createHash("sha256").update(body).digest("hex").slice(0, 10)}.json`;
  writeFileSync(OUT + file, body);
  sizes[file] = gzipSync(body).length;
  return file;
}
// Landing level of detail: the act's strongest LANDING_POINTS points, 0.01° / 0.01 weight steps.
const lod = (d: FanDensity) => encodeAct(d, (p) => !!d.coverage[countryAt(p[0], p[1]) ?? ""]?.thin, LANDING_POINTS);

// World layer (first fetch): the "_world" fan wave + the bigger city lights as a flat int array
// [lon×10, lat×10, size bucket 2–4, …]. The ~25k small towns (bucket 1) are a second, lazy file.
const bucket = (p: number) => (p >= 1_000_000 ? 4 : p >= 250_000 ? 3 : p >= 50_000 ? 2 : 1);
const packCities = (list: { lon: number; lat: number; population: number }[]) => list.flatMap((c) => [Math.round(c.lon * 10), Math.round(c.lat * 10), bucket(c.population)]);
const world = write("world", {
  fan: (densities.get("_world")?.fanPoints ?? []).map((p) => [Math.round(p[0]), Math.round(p[1]), p[2]]),
  cities: packCities(cities.filter((c) => bucket(c.population) >= 2)),
});
const towns = write("towns", { cities: packCities(cities.filter((c) => bucket(c.population) === 1)) });
const failures = [
  complete.length < MIN_EXAMPLES && `${complete.length} complete examples (need ${MIN_EXAMPLES})`,
  continents.size < MIN_CONTINENTS && `${continents.size} continents (need ${MIN_CONTINENTS})`,
  thinKinds.length && `under ${MIN_PER_DISCIPLINE} acts: ${thinKinds.join(", ")}`,
].filter(Boolean);
// Gate failed: still ship the always-on layers so the landing shows "warming up" over a full
// globe (world fan wave + city lights), never a blank page. Exit non-zero so CI notices.
if (failures.length && !process.argv.includes("--ignore-gate")) {
  writeFileSync(OUT + "manifest.json", JSON.stringify({ version: new Date().toISOString(), status: "warming", files: { world, towns } }, null, 2));
  console.error(`examples not exported (world layer only): ${failures.join("; ")}`);
  process.exit(1);
}
if (failures.length) console.warn(`--ignore-gate: exporting anyway (${failures.join("; ")}); not for production`);

// Play order: one geographic path through every example, so the camera hops to a neighbour (US →
// US → Canada …) instead of across the world. Hop cost = great-circle km, ×1.3 when it steps west
// (against the globe's eastward spin, so the path mostly runs with the rotation). Built greedily
// from the far west with the same act kept ≥ ACT_GAP steps apart, then shortened by 2-opt passes
// that keep that gap. The client starts at a random point and walks it (wrapping); the camera
// always takes the short way (≤ 180°), so a near neighbour is never a whole turn away.
const ACT_GAP = 20;
const WEST_PENALTY = 1.3;
const focusOf = (e: HomeExample) => e.route?.[0] ?? e.cities[0] ?? e.home;
const lonStep = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
const hop = (a: HomeExample, b: HomeExample) => {
  const p = focusOf(a), q = focusOf(b);
  return distanceKm(p, q) * (lonStep(p.lon, q.lon) < 0 ? WEST_PENALTY : 1);
};
// One continent at a time, in a fixed loop that keeps the jumps between them short (Americas →
// Europe → Africa → Asia → Oceania, wrapping back across the Pacific). Each continent is entered at
// the example nearest to where the last one ended, so the long hops are only these few boundaries.
const CONTINENT_LOOP: Continent[] = ["north_america", "south_america", "europe", "africa", "asia", "oceania"];

function nearestPath(list: HomeExample[], start: { lat: number; lon: number }, gap: number): HomeExample[] {
  const left = [...list];
  let path: HomeExample[] = [];
  let from = start;
  while (left.length) {
    const recent = new Set(path.slice(-gap).map((e) => e.fanKey));
    const pool = left.filter((e) => !recent.has(e.fanKey));
    const cost = (e: HomeExample) => distanceKm(from, focusOf(e)) * (lonStep(from.lon, focusOf(e).lon) < 0 ? WEST_PENALTY : 1);
    const next = (pool.length ? pool : left).reduce((b, e) => (cost(e) < cost(b) ? e : b));
    path.push(next);
    left.splice(left.indexOf(next), 1);
    from = focusOf(next);
  }
  // 2-opt within the continent; the first stop stays (it's the entry nearest the last continent).
  const okGap = (p: HomeExample[], i: number, j: number) => {
    for (let k = Math.max(0, i - gap); k <= Math.min(p.length - 1, j + gap); k++)
      for (let m = k + 1; m <= Math.min(p.length - 1, k + gap); m++) if (((k >= i && k <= j) || (m >= i && m <= j)) && p[k].fanKey === p[m].fanKey) return false;
    return true;
  };
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    for (let i = 0; i < path.length - 2; i++)
      for (let j = i + 2; j < path.length - 1; j++) {
        const next = [...path.slice(0, i + 1), ...path.slice(i + 1, j + 1).reverse(), ...path.slice(j + 1)];
        let before = 0, after = 0;
        for (let k = i; k <= j; k++) (before += hop(path[k], path[k + 1])), (after += hop(next[k], next[k + 1]));
        if (after >= before - 1 || !okGap(next, i + 1, j)) continue;
        path = next;
        improved = true;
      }
  }
  return path;
}

function playOrder(list: HomeExample[]): HomeExample[] {
  const out: HomeExample[] = [];
  let at = { lat: 49, lon: -125 }; // start on the Pacific coast of North America
  for (const c of CONTINENT_LOOP) {
    const part = list.filter((e) => e.home.continent === c);
    if (!part.length) continue;
    // Same act ≥ ACT_GAP apart, or as far apart as the continent's act count allows.
    const gap = Math.max(1, Math.min(ACT_GAP, new Set(part.map((e) => e.fanKey)).size - 1));
    const path = nearestPath(part, at, gap);
    out.push(...path);
    at = focusOf(path[path.length - 1]);
  }
  return out;
}
const ordered = playOrder(complete);
const hops = ordered.slice(1).map((e, k) => distanceKm(focusOf(ordered[k]), focusOf(e)));
const sortedHops = [...hops].sort((a, b) => a - b);
console.log(`play order: median hop ${Math.round(sortedHops[Math.floor(hops.length / 2)] ?? 0).toLocaleString("en-US")} km, ${hops.filter((h) => h > 4000).length} hops over 4,000 km, ${hops.filter((h) => h > 6000).length} over 6,000 km (${hops.map((h, k) => (h > 6000 ? k + 1 : -1)).filter((k) => k >= 0).join(", ")})`);
const exampleFile = write("examples", ordered.map((e) => ({ ...e, fanPoints: undefined, coverage: undefined })));

// Fan points split by the example's home continent, so the globe fetches one region at a time.
// One entry per act (shared by its examples); each example's terrain is baked in the browser from
// these points and the example's own route, cities and skipped city.
const regions: Partial<Record<Continent, string>> = {};
for (const c of continents) {
  const keys = new Set(complete.filter((e) => e.home.continent === c).map((e) => e.fanKey));
  regions[c] = write(`density-${c}`, encodeRegion(Object.fromEntries([...keys].map((k) => [k, lod(densities.get(k)!)]))));
}

let still: string | undefined;
const stillArg = process.argv.indexOf("--still");
if (stillArg > 0 && existsSync(process.argv[stillArg + 1])) {
  still = "globe-still.png";
  copyFileSync(process.argv[stillArg + 1], OUT + still);
}

const manifest = {
  version: new Date().toISOString(),
  counts: { examples: complete.length, acts: new Set(complete.map((e) => e.fanKey)).size, continents: continents.size },
  status: failures.length ? "incomplete" : "ready",
  files: { examples: exampleFile, world, towns, regions, still, contrast: contrast?.rows.length ? write("contrast", contrast) : undefined },
};
writeFileSync(OUT + "manifest.json", JSON.stringify(manifest, null, 2));
const firstFetch = sizes[exampleFile] + sizes[world];
console.log(readdirSync(OUT).map((f) => `${f}${sizes[f] ? ` ${Math.round(sizes[f] / 1024)} KB gz` : ""}`).join("\n"));
console.log(`first fetch (examples + world): ${Math.round(firstFetch / 1024)} KB gz${firstFetch > FIRST_FETCH_GZ ? ` — over the ${FIRST_FETCH_GZ / 1024} KB budget` : ""}`);
