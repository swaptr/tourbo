// Bake timing over every example in the static bundle (Node, same code the worker runs): node scripts/terrain-bench.ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as topo from "topojson-client";
import type { HomeExample } from "@tourbo/core/examples/types.ts";
import { decodeAct } from "@tourbo/core/examples/landing-format.ts";
import { bakeDensity, landPolys, packPoints, reliefShade, terrainSpec } from "../app/lib/globe-model.ts";
const DIR = new URL("../public/landing/", import.meta.url).pathname;
const m = JSON.parse(readFileSync(DIR + "manifest.json", "utf8"));
const examples: HomeExample[] = JSON.parse(readFileSync(DIR + m.files.examples, "utf8"));
const topology = JSON.parse(readFileSync(createRequire(import.meta.url).resolve("world-atlas/land-110m.json"), "utf8"));
const fc = topo.feature(topology, topology.objects.land) as any;
const raw: any[] = [];
for (const f of fc.features) f.geometry.type === "Polygon" ? raw.push(f.geometry.coordinates) : raw.push(...f.geometry.coordinates);
const land = landPolys(raw);
const acts = new Map<string, Float64Array>();
for (const f of Object.values(m.files.regions) as string[]) for (const [k, a] of Object.entries(JSON.parse(readFileSync(DIR + f, "utf8")).acts)) acts.set(k, packPoints(decodeAct(a as never).fanPoints));
for (const n of [256, 128]) {
  const best = examples.map(() => [Infinity, Infinity]);
  for (let rep = 0; rep < 3; rep++) examples.forEach((ex, i) => {
    const o = terrainSpec(ex, n, land).opts;
    let t = performance.now(); const h = bakeDensity(acts.get(ex.fanKey)!, o); const tb = performance.now() - t;
    t = performance.now(); reliefShade(h, n, n, 0.1 * n); const ts = performance.now() - t;
    best[i] = [Math.min(best[i][0], tb), Math.min(best[i][1], ts)];
  });
  const q = (k: number, p: number) => { const s = best.map((b) => b[k]).sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)].toFixed(1); };
  const tot = best.map((b) => b[0] + b[1]).sort((a, b) => a - b);
  console.log(`${n}: bake median ${q(0, 0.5)} p95 ${q(0, 0.95)} ms; shade median ${q(1, 0.5)} p95 ${q(1, 0.95)}; bake+shade median ${tot[tot.length >> 1].toFixed(1)} p95 ${tot[Math.floor(tot.length * 0.95)].toFixed(1)}`);
}
