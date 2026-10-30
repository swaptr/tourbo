// Usage: npm run examples:fanmap [-- <act-key-filter>]
// Renders worldwide fan density (home_fan_density) as a flat equirectangular map, with world
// city dots for land, to check coverage gaps. No filter = every act overlaid (max weight per
// point). Writes /tmp/tourbo-fanmap-<key|all>.svg.
import { writeFileSync } from "node:fs";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import type { FanDensity } from "@tourbo/core/examples/types.ts";

const W = 1440;
const H = 720;
const x = (lon: number) => ((lon + 180) / 360) * W;
const y = (lat: number) => ((90 - lat) / 180) * H;
const RAMP = ["#F3D27A", "#EE9A45", "#D8572F", "#9E3324"];
const color = (w: number) => RAMP[Math.min(RAMP.length - 1, Math.floor(w * RAMP.length))];

const sql = await db();
const filter = process.argv[2] ?? "";
const rows = await sql<{ fan_key: string; density: FanDensity }[]>`select fan_key, density from home_fan_density where fan_key like ${`%${filter}%`} order by fan_key`;
const land = await sql<{ lat: number; lon: number }[]>`select distinct round(lat::numeric, 0)::float as lat, round(lon::numeric, 0)::float as lon from cities`;
const merged = new Map<string, [number, number, number]>();
const countries = new Map<string, boolean>(); // code → thin everywhere
for (const { density } of rows) {
  for (const [lat, lon, w] of density.fanPoints) {
    const k = `${lat},${lon}`;
    if ((merged.get(k)?.[2] ?? -1) < w) merged.set(k, [lat, lon, w]);
  }
  for (const [code, c] of Object.entries(density.coverage)) countries.set(code, (countries.get(code) ?? true) && c.thin);
}
const dots = land.map((p) => `<circle cx="${x(p.lon).toFixed(1)}" cy="${y(p.lat).toFixed(1)}" r="1.6" fill="#E4D5BC"/>`).join("");
const fans = [...merged.values()]
  .sort((a, b) => a[2] - b[2])
  .map(([lat, lon, w]) => `<circle cx="${x(lon).toFixed(1)}" cy="${y(lat).toFixed(1)}" r="${(1.2 + w * 2.5).toFixed(1)}" fill="${color(w)}" fill-opacity="${(0.25 + w * 0.75).toFixed(2)}"/>`)
  .join("");
const thin = [...countries].filter(([, t]) => t).map(([c]) => c);
const label = `${rows.length} acts · ${merged.size} points · ${countries.size} countries · ${thin.length} thin everywhere`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#5E8A90"/>${dots}${fans}<text x="12" y="${H - 12}" font-family="sans-serif" font-size="14" fill="#F4EFE6">${label}</text></svg>`;
const path = `/tmp/tourbo-fanmap-${filter || "all"}.svg`;
writeFileSync(path, svg);
console.log(`${path} · ${label}`);
await closeDb();
