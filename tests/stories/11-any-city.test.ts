// Story 11: any city on the map. With the world table seeded (npm run cities:seed), a circle
// anywhere yields real candidate cities inside it, and a city brief works for any of them.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { distanceKm } from "@tourbo/core/shared/geo.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
const seeded = await ensureWorld();
before(async () => (m = await mcp()));
after(async () => {
  await m.close();
  await closeDb();
});

const AREAS = [
  { name: "Boise", lat: 43.62, lon: -116.2, radius_km: 500, act: "Khruangbin", region: "na" },
  { name: "Lucknow", lat: 26.85, lon: 80.95, radius_km: 400, act: "Arijit Singh", region: "in" },
  { name: "Porto", lat: 41.15, lon: -8.61, radius_km: 400, act: "Coldplay", region: "eu" },
  { name: "Nairobi", lat: -1.29, lon: 36.82, radius_km: 600, act: "Burna Boy", region: "africa" },
  { name: "Medellín", lat: 6.24, lon: -75.58, radius_km: 500, act: "Karol G", region: "latam" },
  { name: "Perth", lat: -31.95, lon: 115.86, radius_km: 800, act: "Tame Impala", region: "oceania" },
];

for (const a of AREAS) {
  test(`any city: a circle around ${a.name} gives real candidate cities inside it`, { skip: !seeded && "run npm run cities:seed first", timeout: 180_000 }, async () => {
    const act = await m.call("tourbo_resolve_act", { name: a.act });
    assert.equal(act.found, true, a.act);
    const r = await m.call("tourbo_score_cities", { act_id: act.id, region: "na", shows: 3, near: { lat: a.lat, lon: a.lon, radius_km: a.radius_km } });
    assert.equal(r.region, a.region);
    assert.ok(r.cities.length >= 3, `${r.cities.length} cities`);
    for (const c of r.cities) assert.ok(distanceKm(a, c) <= a.radius_km + 1, `${c.city} inside the circle`);
    assert.ok(r.cities.some((c: { heatmapCells: number }) => c.heatmapCells > 0), "fan data for at least one city");
  });
}

test("any city: a city brief works for a city that was never in the seed list", { skip: !seeded && "run npm run cities:seed first", timeout: 120_000 }, async () => {
  const act = await m.call("tourbo_resolve_act", { name: "Coldplay" });
  const brief = await m.call("tourbo_city_brief", { act_id: act.id, region: "eu", city: "Porto" });
  assert.ok(brief.cityCulture.length + brief.localSpots.length > 0);
});
