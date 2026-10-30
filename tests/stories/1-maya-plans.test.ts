// Story 1: Maya, indie singer in Chicago, wants ~5 shows within 600 km that make money.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { distanceKm } from "@tourbo/core/shared/geo.ts";
import { mcp } from "./_mcp.ts";

const CHICAGO = { lat: 41.88, lon: -87.63 };
let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(() => m.close());

test("Maya: only cities inside her circle, each with a money verdict", async () => {
  const act = await m.call("tourbo_resolve_act", { name: "Japanese Breakfast" });
  assert.equal(act.found, true);
  const scores = await m.call("tourbo_score_cities", { act_id: act.id, region: "na", shows: 5, near: { ...CHICAGO, radius_km: 600 } });
  assert.ok(scores.shortlist.length >= 5, "enough candidate cities");
  // Coordinates come back with each city (world table or seed list, whichever is loaded).
  for (const c of scores.cities) assert.ok(distanceKm(CHICAGO, c) <= 601, `${c.city} is inside 600 km`);

  for (const c of scores.cities.slice(0, 3)) {
    const money = await m.call("tourbo_show_economics", { region: "na", city: c.city, fan_index: c.fanIndex ?? 0, median_fan_index: scores.medianFanIndex, room_min: 150, room_max: 400 });
    assert.ok(["headline", "co-headline", "support slot", "skip"].includes(money.verdict));
    if (money.verdict === "headline") assert.ok(money.best.profit >= 0, `${c.city}: a headline never loses money`);
  }
});
