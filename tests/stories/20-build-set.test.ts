// Story 20: Maya pastes her 8 songs and gets a running order per city, each move backed by what
// that city's fans over-index on, a cover idea, a length check and one weak spot.
// Fixture part: pure ordering logic, no network. Live part: tourbo_build_set over MCP (live fan
// data, no LLM). STORY_LLM=1 part: the AI's written reasons all cite that city's facts.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { QlooEntity } from "@tourbo/core/qloo/api.server.ts";
import { normalizeRef } from "@tourbo/core/engine/brief.ts";
import { arrangeCity, groundMoves, parseSetLines, rankCoverIdeas, type SetResult } from "@tourbo/core/engine/set.ts";
import { mcp } from "./_mcp.ts";

const SONGS = `1. Golden Hour, opener, 4, Indie Pop
Slow River, slow, 5, Folk
Neon Nights, banger, Electronic
Back Porch, Country
Paper Planes, Hip Hop
Velvet, R&B, 4
Long Drive, Rock
Goodbye Song, closer, 6, Singer-Songwriter`;

const artist = (name: string, genres: string[], id = name): QlooEntity => ({
  name,
  entity_id: id,
  tags: genres.map((g) => ({ tag_id: `urn:tag:genre:music:${g.toLowerCase().replace(/\W+/g, "_")}`, name: g })),
});
const HIPHOP_CITY = [artist("Chance the Rapper", ["Hip Hop", "Rap"]), artist("Jamila Woods", ["R&B", "Soul"]), artist("Vic Mensa", ["Hip - Hop"]), artist("Lizzo", ["Pop", "R & B"])];
const COUNTRY_CITY = [artist("Dolly Parton", ["Country", "Folk"]), artist("Kacey Musgraves", ["Country Pop", "Folk"]), artist("Jack White", ["Rock", "Blues"]), artist("Paramore", ["Rock", "Pop Punk"])];

const items = parseSetLines(SONGS);
const arrange = (city: string, entities: QlooEntity[], slot: "headline" | "support" = "headline") =>
  arrangeCity({ city, kind: "musician", slot, items, defaultStyles: [], taste: { entities } });
const titles = (o: { item?: number }[]) => o.filter((e) => e.item !== undefined).map((e) => e.item);

test("Maya pastes 8 songs: each line is read with its tag, length and style", () => {
  assert.equal(items.length, 8);
  assert.deepEqual(items[0], { title: "Golden Hour", tag: "opener", minutes: 4, styles: ["Indie Pop"] });
  assert.equal(items[7].tag, "closer");
  assert.deepEqual(items[5], { title: "Velvet", minutes: 4, styles: ["R&B"] });
});

test("every song appears exactly once, opener first and closer last, in every city", () => {
  for (const set of [arrange("Chicago", HIPHOP_CITY), arrange("Nashville", COUNTRY_CITY)]) {
    const order = titles(set.order);
    assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(set.order[0].item, 0, "tagged opener opens");
    assert.equal(set.order.at(-1)!.item, 7, "tagged closer closes");
    assert.ok(set.weakSpot, "one weak spot flagged");
    for (const e of set.order) {
      assert.ok(e.refs.length > 0, `${e.title} cites a fact`);
      for (const r of e.refs) assert.ok(set.facts.some((f) => normalizeRef(f.name) === normalizeRef(r)), `${r} is a ${set.city} fact`);
    }
  }
});

test("the order differs when the cities' taste differs", () => {
  assert.notDeepEqual(titles(arrange("Chicago", HIPHOP_CITY).order), titles(arrange("Nashville", COUNTRY_CITY).order));
});

test("the length check fires when the set runs over the slot", () => {
  const headline = arrange("Chicago", HIPHOP_CITY, "headline");
  assert.equal(headline.length.verdict, "short"); // ~37 min vs 60
  const support = arrange("Chicago", HIPHOP_CITY, "support");
  assert.equal(support.length.verdict, "over");
  assert.match(support.length.note, /over the 30-min support slot/);
});

test("cover ideas prefer acts the fans rank higher in this city than overall, with the number", () => {
  const overall = ["A", "B", "C", "D", "E", "F"].map((n) => artist(n, ["Rock"]));
  const fans = [overall[0], overall[5], overall[1], artist("Local Hero", ["Rock"])];
  const ideas = rankCoverIdeas({ city: "Austin", fans, overall, exclude: ["A"] });
  assert.deepEqual(ideas.map((i) => i.artist), ["F", "Local Hero", "B"]);
  assert.match(ideas[0].why, /#2 with your fans in Austin vs #6/);
  const fallback = rankCoverIdeas({ city: "Austin", cityEntities: COUNTRY_CITY, styles: ["Rock"] });
  assert.equal(fallback[0].artist, "Jack White", "unknown act: the city's own artist closest to the style");
});

test("a written reason that cites something outside the city's facts is dropped", () => {
  const set = arrange("Chicago", HIPHOP_CITY);
  const { kept, dropped } = groundMoves(
    [
      { pos: 0, reason: "Chance the Rapper fans love a bright start", refs: ["Chance the Rapper"] },
      { pos: 1, reason: "Big at the Metro", refs: ["Metro"] },
      { pos: 2, reason: "No refs at all", refs: [] },
    ],
    set,
  );
  assert.equal(kept.length, 1);
  assert.equal(dropped, 2);
});

// Live: same promises through the MCP tool, with real fan data.
let m: Awaited<ReturnType<typeof mcp>> | undefined;
let live: SetResult | undefined;
let skipLive: string | false = false;
before(async () => {
  m = await mcp();
});
after(async () => {
  await m?.close();
});

test("live: tourbo_build_set returns all 8 once per city, a cover idea and a length check", { timeout: 180_000 }, async (t) => {
  let act: { id: string };
  try {
    act = await m!.call("tourbo_resolve_act", { name: "Japanese Breakfast" });
  } catch (error) {
    skipLive = `fan data unavailable: ${(error as Error).message.slice(0, 80)}`;
    return t.skip(skipLive);
  }
  live = await m!.call<SetResult>("tourbo_build_set", { text: SONGS, cities: ["Chicago", "Nashville"], region: "na", slot: "support", act_id: act.id });
  assert.equal(live.cities.length, 2);
  for (const c of live.cities) {
    assert.deepEqual(titles(c.order).sort(), [0, 1, 2, 3, 4, 5, 6, 7], `${c.city}: every song once`);
    assert.equal(c.length.verdict, "over", `${c.city}: 37+ min is over a 30-min support slot`);
    assert.ok(c.coverIdeas.length > 0, `${c.city}: a cover idea`);
    assert.ok(c.weakSpot, `${c.city}: a weak spot`);
    for (const e of c.order) for (const r of e.refs) assert.ok(c.facts.some((f) => normalizeRef(f.name) === normalizeRef(r)), `${c.city}: ${r}`);
  }
  const [a, b] = live.cities;
  const facts = (c: typeof a) => c.facts.filter((f) => f.kind === "style").map((f) => f.value).join();
  if (facts(a) !== facts(b)) assert.notDeepEqual(titles(a.order), titles(b.order), "different city facts, different order");
});

const llm = process.env.STORY_LLM === "1" && !!process.env.ANTHROPIC_API_KEY;

test("STORY_LLM: every written reason cites a name from that city's facts", { skip: !llm && "set STORY_LLM=1", timeout: 180_000 }, async (t) => {
  if (!live) return t.skip(skipLive || "live part did not run");
  const { writeReasons } = await import("../../apps/web/server/agent/set.server.ts");
  const { writing } = await writeReasons(live);
  assert.ok(writing.some((w) => w && Object.keys(w.moves).length > 0), "some reasons were written");
  live.cities.forEach((c, i) => {
    const known = new Set(c.facts.map((f) => normalizeRef(f.name)));
    for (const mv of Object.values(writing[i]?.moves ?? {})) {
      assert.ok(mv.refs.length > 0);
      for (const r of mv.refs) assert.ok(known.has(normalizeRef(r)), `${c.city}: ${r}`);
    }
  });
});

