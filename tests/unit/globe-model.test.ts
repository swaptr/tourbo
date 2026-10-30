// Unit tests for the home globe's pure maths (no browser): node --test tests/unit/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  angularDistanceDeg, arcPoints, cellIndex, densityGrid, focusWeight, FOCUS_INNER_DEG, FOCUS_OUTER_DEG, gridFromBase64, gridToBase64,
  GRID_H, GRID_W, lonDelta, mergeMax, sampleGrid, SPEED_MAX, SPEED_MIN, speedForDensity,
} from "../../apps/web/app/lib/globe-model.ts";

test("density: peak at the fan point, falls off, wraps the date line", () => {
  const g = densityGrid([[-33.9, 151.2, 1]]);
  assert.equal(g.length, GRID_W * GRID_H);
  assert.equal(g[cellIndex(-33.9, 151.2)], 255);
  assert.ok(sampleGrid(g, -33.9, 151.2) > sampleGrid(g, -33.9, 140));
  assert.equal(sampleGrid(g, 40, -74), 0);
  const w = densityGrid([[0, 179.5, 1]]);
  assert.ok(w[cellIndex(0, -179.5)] > 100, "hill continues across ±180°");
  assert.deepEqual(Array.from(densityGrid([])).every((v) => v === 0), true);
});

test("density: heavier points make taller hills", () => {
  const g = densityGrid([[48.85, 2.35, 1], [40.4, -3.7, 0.25]]);
  assert.ok(g[cellIndex(48.85, 2.35)] > g[cellIndex(40.4, -3.7)]);
});

test("history keeps the max of every shown example", () => {
  const h = new Uint8Array(GRID_W * GRID_H);
  mergeMax(h, densityGrid([[51.5, -0.1, 1]]));
  mergeMax(h, densityGrid([[19, 72.8, 1]]));
  assert.equal(h[cellIndex(51.5, -0.1)], 255);
  assert.equal(h[cellIndex(19, 72.8)], 255);
});

test("focus falloff: sharp inside, gone outside, smooth and monotonic between", () => {
  assert.equal(focusWeight(0), 1);
  assert.equal(focusWeight(FOCUS_INNER_DEG), 1);
  assert.equal(focusWeight(FOCUS_OUTER_DEG), 0);
  assert.equal(focusWeight(120), 0);
  let prev = 1;
  for (let a = FOCUS_INNER_DEG; a <= FOCUS_OUTER_DEG; a += 2.5) {
    const w = focusWeight(a);
    assert.ok(w <= prev + 1e-9);
    prev = w;
  }
});

test("speed: fastest with no data, slowest over dense data, monotonic", () => {
  assert.equal(speedForDensity(0), SPEED_MAX);
  assert.ok(speedForDensity(1) < SPEED_MIN + (SPEED_MAX - SPEED_MIN) * 0.2);
  assert.ok(speedForDensity(1) >= SPEED_MIN);
  assert.ok(speedForDensity(0.1) > speedForDensity(0.5));
  assert.equal(speedForDensity(-1), SPEED_MAX);
});

test("geometry: shortest longitude step, distances, arcs end on the cities", () => {
  assert.equal(lonDelta(170, -170), 20);
  assert.equal(lonDelta(-170, 170), -20);
  assert.equal(lonDelta(0, 180), 180);
  assert.ok(Math.abs(angularDistanceDeg(0, 0, 0, 90) - 90) < 1e-9);
  const pts = arcPoints({ lat: -33.9, lon: 151.2 }, { lat: -34.9, lon: 138.6 });
  const len = (p: number[]) => Math.hypot(p[0], p[1], p[2]);
  assert.ok(Math.abs(len(pts[0]) - 1) < 1e-9 && Math.abs(len(pts.at(-1)!) - 1) < 1e-9);
  assert.ok(len(pts[pts.length >> 1]) > 1, "arc lifts off the surface");
});

test("grid round-trips through base64", () => {
  const g = densityGrid([[35.7, 139.7, 1]]);
  assert.deepEqual(gridFromBase64(gridToBase64(g)), g);
});

test("arcs: short hops stay low, long hops rise, capped", async () => {
  const { arcLift, ARC_LIFT_MAX, ARC_LIFT_MIN } = await import("../../apps/web/app/lib/globe-model.ts");
  assert.equal(arcLift(0), ARC_LIFT_MIN);
  assert.ok(arcLift(0.05) < arcLift(0.5));
  assert.equal(arcLift(3), ARC_LIFT_MAX);
});

test("fill ripples out from home, eases out, ends full", async () => {
  const { rippleGrow } = await import("../../apps/web/app/lib/globe-model.ts");
  assert.equal(rippleGrow(0, 0), 0);
  assert.ok(rippleGrow(0.3, 0) > rippleGrow(0.3, 0.5), "home rises first");
  assert.equal(rippleGrow(1, 1), 1);
  assert.equal(rippleGrow(1, 0), 1);
});

test("route order: given route, else the arrow line, else listed cities", async () => {
  const { routeStops } = await import("../../apps/web/app/lib/globe-model.ts");
  const c = [{ name: "Sydney", lat: -33.9, lon: 151.2 }, { name: "Melbourne", lat: -37.8, lon: 145 }, { name: "Brisbane", lat: -27.5, lon: 153 }];
  assert.deepEqual(routeStops(c, undefined, ["Brisbane → Sydney → Melbourne · 1,470 km"]).map((s) => s.name), ["Brisbane", "Sydney", "Melbourne"]);
  assert.deepEqual(routeStops(c, [c[2], c[0]]).map((s) => s.name), ["Brisbane", "Sydney"]);
  assert.deepEqual(routeStops(c).map((s) => s.name), ["Sydney", "Melbourne", "Brisbane"]);
});

test("fine window: neighbourhood points land inside, outside points don't", async () => {
  const { fineBox, windowGrid, FINE_N } = await import("../../apps/web/app/lib/globe-model.ts");
  const box = fineBox(40.7, -74);
  const g = windowGrid([[40.71, -74.0, 1], [10, 10, 1]], box);
  assert.equal(g.length, FINE_N * FINE_N);
  const y = Math.floor(((box.lat0 - 40.71) / box.latSpan) * FINE_N), x = Math.floor(((-74 - box.lon0) / box.lonSpan) * FINE_N);
  assert.equal(g[y * FINE_N + x], 255);
  assert.equal(g[0], 0);
});

test("dwell: speed falls to the minimum as the view drifts from the example", async () => {
  const { dwellSpeed, DWELL_DEG, SPEED_MIN } = await import("../../apps/web/app/lib/globe-model.ts");
  assert.equal(dwellSpeed(9, 0), 9);
  assert.equal(dwellSpeed(9, DWELL_DEG), SPEED_MIN);
});

test("regional gain lifts a small home base, capped, never dims", async () => {
  const { regionalGain, REGION_GAIN_MAX } = await import("../../apps/web/app/lib/globe-model.ts");
  const g = new Uint8Array(GRID_W * GRID_H);
  g[cellIndex(51.5, 0)] = 255;
  g[cellIndex(-33.9, 151.2)] = 50;
  const k = regionalGain(g, -33.9, 151.2, 30);
  assert.ok(k > 4 - 1e-9 && k <= REGION_GAIN_MAX);
  assert.equal(regionalGain(g, 51.5, 0, 30), 1);
  assert.equal(regionalGain(new Uint8Array(GRID_W * GRID_H), 0, 0, 30), 1);
});

test("terrain: the land mask clips fan terrain to the coast (no peaks over the sea)", async () => {
  const { bakeDensity, landPolys, rasterLand, reliefShade } = await import("../../apps/web/app/lib/globe-model.ts");
  // A square island from 0–10°E, 0–10°N; the bake box spans 20° with the island in its west half.
  const land = landPolys([[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]]);
  const box = { lat0: 10, lon0: 0, latSpan: 10, lonSpan: 20 };
  const mask = rasterLand(land, box, 64, 32);
  assert.equal(mask[16 * 64 + 10], 1, "inland is land");
  assert.equal(mask[16 * 64 + 50], 0, "east half is sea");
  // A city right on the east coast: its peak stops at the shore.
  const opts = { bbox: box, width: 64, height: 32, kernelDeg: 1, stops: [{ lat: 5, lon: 10, strength: 100 }], land };
  const h = bakeDensity([[5, 10, 1]], opts);
  assert.ok(h[16 * 64 + 28] > 100, `land side of the coast is high (${h[16 * 64 + 28]})`);
  assert.equal(h[16 * 64 + 36], 0, "no terrain out at sea");
  const open = bakeDensity([[5, 10, 1]], { ...opts, land: undefined });
  assert.ok(open[16 * 64 + 36] > 0, "without the mask the peak spills into the sea");
  // Lee side (south-east of the peak) is darker than the lit north-west flank.
  const sh = reliefShade(open, 64, 32, 6.4);
  assert.ok(sh[20 * 64 + 36] < sh[12 * 64 + 28], `lee ${sh[20 * 64 + 36]} vs lit ${sh[12 * 64 + 28]}`);
});
