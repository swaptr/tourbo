// Story 3: Rohan, stand-up in Mumbai: comedy rooms, rupees, fellow comics.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(() => m.close());

test("Rohan: resolves as a comedian, plans around Mumbai in INR with no stadiums", async () => {
  const act = await m.call("tourbo_resolve_act", { name: "Zakir Khan", kind: "comedian" });
  assert.equal(act.found, true);
  assert.match(act.name, /^Zakir Khan/);
  const scores = await m.call("tourbo_score_cities", { act_id: act.id, region: "in", shows: 4, near: { lat: 19.07, lon: 72.88, radius_km: 900 } });
  assert.ok(scores.shortlist.length >= 2);
  const city = scores.shortlist[0];
  const detail = await m.call("tourbo_city_detail", { act_id: act.id, kind: "comedian", region: "in", city });
  for (const v of detail.venues ?? []) assert.ok(!/stadium/i.test(v.name), `${v.name} is not a stadium`);
  const c = scores.cities.find((x: { city: string }) => x.city === city);
  const money = await m.call("tourbo_show_economics", { region: "in", kind: "comedian", city, fan_index: c.fanIndex ?? 0, median_fan_index: scores.medianFanIndex });
  assert.equal(money.currency, "INR");
});
