// Story 33: place features from open data sharpen fan-data suggestions (PLAN §18 Q18).
// Live: open data over the network (holidays, past weather, FX) through the MCP tool, no fan
// data, no LLM. Skips when offline.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { mcp } from "./_mcp.ts";

const online = await fetch("https://date.nager.at/api/v3/AvailableCountries", { signal: AbortSignal.timeout(5000) }).then((r) => r.ok).catch(() => false);
let m: Awaited<ReturnType<typeof mcp>>;
before(async () => {
  if (online) m = await mcp();
});
after(async () => m?.close());

const nextYear = new Date().getUTCFullYear() + 1;

test("Maya: a US tour over the 4th of July and Christmas gets date checks; Austin vs a richer state prices differently", { skip: !online && "offline", timeout: 60_000 }, async () => {
  const res = await m.call<{ places: any[] }>("tourbo_place_features", { cities: ["Austin", "Seattle"], region: "na", dates: [`${nextYear}-07-03`, `${nextYear}-12-24`] });
  const [austin, seattle] = res.places;
  assert.equal(austin.place.state, "TX");
  assert.ok(austin.features.holidays?.value.length, "holidays came back live");
  assert.ok(austin.features.weather, "past weather for those dates came back live");
  assert.ok(austin.surfaced.includes("dateRisk"), "a show the night before a public holiday is flagged");
  assert.ok(seattle.derived.priceNudge.factor >= austin.derived.priceNudge.factor, "higher state income → same or higher ticket");
  for (const p of res.places) for (const fact of p.facts) assert.ok(fact.refs.length && fact.text.length < 300);
});

test("Rohan: a comic in India gets religion on the avoid list and a younger crowd; nothing extra in Amsterdam", { skip: !online && "offline", timeout: 60_000 }, async () => {
  const res = await m.call<{ places: any[] }>("tourbo_place_features", { cities: ["Pune"], region: "in", kind: "comedian" });
  const pune = res.places[0];
  assert.ok(pune.derived.tone.addTopics.includes("religion"));
  assert.equal(pune.derived.youngerCrowd.skew, "younger");
  const eu = await m.call<{ places: any[] }>("tourbo_place_features", { cities: ["Amsterdam"], region: "eu", kind: "comedian" });
  const ams = eu.places[0];
  assert.ok(!ams.surfaced.includes("tone"), "free-speech country without law notes (NL repealed blasphemy in 2014): tone hidden");
});

test("Fan data outweighs place data for the crowd's age", { skip: !online && "offline", timeout: 60_000 }, async () => {
  const res = await m.call<{ places: any[] }>("tourbo_place_features", { cities: ["Berlin"], region: "eu", fan_youth: 0.3 });
  assert.equal(res.places[0].derived.youngerCrowd.skew, "younger", "young fans in an older country");
});
