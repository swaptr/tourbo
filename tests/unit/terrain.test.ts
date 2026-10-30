// Terrain bake in the browser (Q7): edge cases, determinism, the landing point format, and the
// worker's flat-points / sliced paths matching the plain bake byte for byte.
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeAct, encodeAct } from "../../packages/core/src/examples/landing-format.ts";
import type { FanDensity, FanPoint } from "../../packages/core/src/examples/types.ts";
import { bakeDensity, bakeSteps, landPolys, packPoints, reliefShade, terrainSpec, type TerrainExample } from "../../apps/web/app/lib/globe-model.ts";

// A crude land: two blocks either side of the antimeridian, one in the Arctic, one around Lagos.
const sq = (w: number, s: number, e: number, n: number) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const land = landPolys([sq(170, -50, 180, -10), sq(-180, -50, -170, -10), sq(-170, 55, -140, 72), sq(-10, 0, 20, 15)]);

const city = (name: string, lat: number, lon: number, fanStrength = 80) => ({ name, lat, lon, fanStrength });
const ex = (cities: ReturnType<typeof city>[], extra: Partial<TerrainExample> = {}): TerrainExample => ({
  cities,
  route: cities.map(({ name, lat, lon }) => ({ name, lat, lon })),
  decision: { lines: [] },
  home: cities[0] ?? { lat: 0, lon: 0 },
  ...extra,
});
const cloud = (lat: number, lon: number, n = 400): FanPoint[] =>
  Array.from({ length: n }, (_, i) => [Math.round((lat + Math.sin(i * 1.7) * 3) * 100) / 100, Math.round((lon + Math.cos(i * 2.3) * 3) * 100) / 100, Math.round(((i % 50) / 50) * 100) / 100]);

const CASES: [string, TerrainExample, FanPoint[]][] = [
  ["Fiji / NZ across the antimeridian", ex([city("Suva", -18.1, 178.4), city("Auckland", -36.85, 174.76), city("Nuku'alofa", -21.1, -175.2)]), cloud(-25, 179)],
  ["Alaska (high latitude, crosses −180)", ex([city("Anchorage", 61.2, -149.9), city("Nome", 64.5, -165.4), city("Attu", 52.9, 173.2)]), cloud(62, -160)],
  ["polar box", ex([city("Longyearbyen", 78.2, 15.6), city("Alert", 82.5, -62.3)]), cloud(80, 0)],
  ["single city", ex([city("Lagos", 6.5, 3.4)]), cloud(6.5, 3.4)],
  ["no cities (home only)", ex([], { home: { lat: 10, lon: 10 } }), cloud(10, 10)],
  ["no points", ex([city("Lagos", 6.5, 3.4), city("Accra", 5.6, -0.2)]), []],
  ["thin points (zero weights)", ex([city("Lagos", 6.5, 3.4)]), cloud(6.5, 3.4).map((p) => [p[0], p[1], 0] as FanPoint)],
  ["all sea", ex([city("Mid-Pacific", 0, -150)]), cloud(0, -150)],
];

for (const [name, e, pts] of CASES)
  test(`terrain: ${name} bakes finite, in range, at 256 and 128`, () => {
    for (const n of [256, 128]) {
      const { box, opts } = terrainSpec(e, n, land);
      assert.ok([box.lat0, box.lon0, box.latSpan, box.lonSpan].every(Number.isFinite), `finite box ${JSON.stringify(box)}`);
      const h = bakeDensity(pts, opts);
      assert.equal(h.length, n * n);
      const sh = reliefShade(h, n, n, 0.1 * n);
      assert.equal(sh.length, n * n);
      assert.ok(sh.every((v) => v >= 0 && v <= 255), "shade in range");
    }
  });

test("terrain: no data and all sea give a flat map; land-clipped peaks stay on land", () => {
  const sea = CASES.find((c) => c[0] === "all sea")!;
  assert.equal(Math.max(...bakeDensity(sea[2], terrainSpec(sea[1], 128, land).opts)), 0, "all sea → flat");
  const lagos = ex([city("Lagos", 6.5, 3.4)]);
  const h = bakeDensity(cloud(6.5, 3.4), terrainSpec(lagos, 128, land).opts);
  assert.ok(Math.max(...h) > 200, "a peak at the city");
});

test("terrain: the same input gives byte-identical output (and the scratch buffers don't leak between bakes)", () => {
  const [, e, pts] = CASES[0];
  const o = terrainSpec(e, 256, land).opts;
  const a = bakeDensity(pts, o);
  bakeDensity(cloud(60, 10), terrainSpec(CASES[1][1], 256, land).opts); // a different bake in between
  const b = bakeDensity(pts, o);
  assert.ok(Buffer.from(b).equals(Buffer.from(a)), "byte-identical heights");
  assert.ok(Buffer.from(reliefShade(a, 256, 256, 25.6)).equals(Buffer.from(reliefShade(b, 256, 256, 25.6))), "byte-identical shading");
});

test("terrain: flat Float64 points (worker) and the sliced bake (fallback) match the tuple bake", () => {
  const [, e, pts] = CASES[3];
  const o = terrainSpec(e, 256, land).opts;
  const ref = bakeDensity(pts, o);
  assert.ok(Buffer.from(bakeDensity(packPoints(pts), o)).equals(Buffer.from(ref)), "flat points = tuples");
  const it = bakeSteps(pts, o);
  let r = it.next(), slices = 0;
  while (!r.done) (r = it.next()), slices++;
  assert.ok(Buffer.from(r.value.h8).equals(Buffer.from(ref)), "sliced bake = plain bake");
  assert.ok(slices >= 4, `yields between phases (${slices})`);
});

test("terrain: relief shading darkens the lee (south-east) side of a peak, never the lit side, and is finite", () => {
  const n = 64, hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) hgt[y * n + x] = 255 * Math.max(0, 1 - Math.hypot(x - 24, y - 24) / 14);
  const sh = reliefShade(hgt, n, n, 40);
  assert.ok(sh[40 * n + 40] < sh[10 * n + 10], `lee ${sh[40 * n + 40]} vs lit ${sh[10 * n + 10]}`);
  assert.equal(sh[2 * n + 2], 255, "flat ground far up-sun is fully lit");
  assert.ok(sh.every((v) => v >= 0 && v <= 255));
});

test("landing format: encode → JSON → decode gives back the export's rounded points, thin flags and order", () => {
  const d: FanDensity = { fanPoints: [[51.5074, -0.1278, 0.9], [48.8566, 2.3522, 1], [40.4168, -3.7038, 0.004], [52.52, 13.405, 0.5]], coverage: { GB: { cells: 3, thin: false }, ES: { cells: 1, thin: true } } };
  const enc = JSON.parse(JSON.stringify(encodeAct(d, (p) => p[1] < -3, 3)));
  assert.deepEqual(enc.w.slice(1).every((x: number) => x >= 0), true, "weight drops are ≥ 0");
  const back = decodeAct(enc);
  assert.deepEqual(back.fanPoints, [[48.86, 2.35, 1], [51.51, -0.13, 0.9], [52.52, 13.41, 0.5]], "strongest 3, 0.01 steps, k/100 exact");
  const thin = decodeAct(JSON.parse(JSON.stringify(encodeAct(d, (p) => p[1] < -3))));
  assert.deepEqual(thin.fanPoints[3], [40.42, -3.7, 0, 1], "thin point keeps its flag");
  assert.deepEqual(back.coverage, d.coverage);
});
