// Story 24: Maya gets cover ideas. No-LLM part (live fan data via MCP `tourbo_ideas`): 2–3 cover
// ideas per city, each with a number for that city, different cities get different covers, the
// same cover isn't suggested everywhere, nothing named that isn't in the data. STORY_LLM=1 part:
// the AI writes angle lines and each kept line names one of that city's refs.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { normalizeRef } from "@tourbo/core/engine/brief.ts";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(async () => {
  await m.close();
  await closeDb();
});

type Idea = { idea: string; category: string; ref: string; value: number; why: string; angle: string };
type Result = { cities: { city: string; ideas: Idea[] }[]; region: { ref: string; best: { city: string }[]; skip: string[]; line: string }[]; basisLine: string };
let tour: Result;

test("Maya: 2–3 cover ideas per city across a Texas run, each with a fan-data number", { timeout: 300_000 }, async () => {
  const act = await m.call("tourbo_resolve_act", { name: "Japanese Breakfast" });
  tour = await m.call("tourbo_ideas", { cities: ["Austin", "Houston", "Dallas"], region: "na", kind: "musician", act_id: act.id, act_name: act.name });
  for (const c of tour.cities) {
    const covers = c.ideas.filter((i) => i.category === "cover");
    assert.ok(covers.length >= 2 && covers.length <= 3, `${c.city}: ${covers.length} covers`);
    for (const i of covers) {
      assert.ok(i.ref && Number.isFinite(i.value), `${c.city}: ${i.idea} has a number`);
      assert.match(i.why, new RegExp(c.city));
      assert.ok(i.angle && !normalizeRef(i.angle).includes(normalizeRef(i.ref)), "angle adds to the title, doesn't repeat it");
      assert.notEqual(normalizeRef(i.ref), normalizeRef(act.name), "never covers itself");
    }
  }
  const sets = tour.cities.map((c) => c.ideas.filter((i) => i.category === "cover").map((i) => i.ref).sort().join("|"));
  assert.equal(new Set(sets).size, sets.length, "cities with different tastes get different covers");
  const counts = new Map<string, number>();
  for (const c of tour.cities) for (const i of c.ideas) if (i.category === "cover") counts.set(i.ref, (counts.get(i.ref) ?? 0) + 1);
  assert.ok([...counts.values()].every((n) => n < tour.cities.length), "no cover suggested in every city");
  assert.match(tour.basisLine, /fans/);
});

test("Maya: every cover is an artist in that city's fan data", { timeout: 120_000 }, async () => {
  // Same requests as engine/ideas.ts (cached): the act's fans in the city, and the city alone.
  const { insights } = await import("@tourbo/core/qloo/api.server.ts");
  const { findCity } = await import("@tourbo/core/engine/cities.ts");
  const { locationQuery } = await import("@tourbo/core/shared/types.ts");
  const act = await m.call("tourbo_resolve_act", { name: "Japanese Breakfast" });
  for (const c of tour.cities) {
    const city0 = findCity("na", c.city);
    const q = city0 ? locationQuery(city0) : c.city;
    const [fans, city] = await Promise.all([
      insights("urn:entity:artist", { "signal.interests.entities": act.id, "signal.location.query": q, take: 25 }),
      insights("urn:entity:artist", { "signal.location.query": q, take: 25 }),
    ]);
    const names = new Set([...(fans.entities ?? []), ...(city.entities ?? [])].map((e) => normalizeRef(e.name)));
    for (const i of c.ideas.filter((x) => x.category === "cover")) assert.ok(names.has(normalizeRef(i.ref)), `${c.city}: ${i.ref} is in its fan data`);
  }
});

test("Ana, not listed: covers still come from the city alone", { timeout: 180_000 }, async () => {
  const r: Result = await m.call("tourbo_ideas", { cities: ["Brisbane, Australia"], region: "na", kind: "musician" });
  assert.ok(r.cities[0].ideas.filter((i) => i.category === "cover").length >= 2);
  assert.match(r.basisLine, /loves/);
});

const llm = process.env.STORY_LLM === "1" && !!process.env.ANTHROPIC_API_KEY;
test("Maya: AI angle lines cite only that city's refs", { skip: !llm && "set STORY_LLM=1", timeout: 180_000 }, async () => {
  const { writeAngles } = await import("../../apps/web/server/agent/ideas.server.ts");
  const out = await writeAngles({ ...(tour as any), kind: "musician", act: "Japanese Breakfast" });
  for (const c of out.cities) {
    const refs = new Set(c.ideas.map((i: Idea) => normalizeRef(i.ref)));
    for (const i of c.ideas as (Idea & { written?: boolean })[]) if (i.written) assert.ok(refs.has(normalizeRef(i.ref)) && normalizeRef(i.angle).includes(normalizeRef(i.ref)), `${c.city}: ${i.angle}`);
  }
  assert.ok(out.cities.some((c: { ideas: { written?: boolean }[] }) => c.ideas.some((i) => i.written)), "some angles were written");
});
