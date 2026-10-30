// "Ideas for this place" ranking + grounding, no network. node --test tests/unit/ideas-rank.test.ts
// Fixtures are hand-written stand-ins, not real fan-data responses.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assignCovers,
  cityCoverCandidates,
  contrast,
  coverCandidates,
  coverIdea,
  groundLines,
  grouped,
  capIdeas,
  hintMode,
  rankIdeas,
  regionView,
  topicIdeas,
  type Ent,
} from "../../packages/core/src/engine/ideas-rank.ts";

const ents = (...names: string[]): Ent[] => names.map((name, i) => ({ name, entity_id: name.toLowerCase(), popularity: 0.95, query: { affinity: 1 - i / 20 } }));

const overall = ents("Act Itself", "Band A", "Band B", "Band C", "Band D", "Band E", "Band F", "Band G", "Band H", "Band I", "Big Rock", "Band J");

test("covers: lift vs the act's fans overall, the act itself never suggested", () => {
  const fansHere = ents("Act Itself", "Big Rock", "Band A", "Band B");
  const cands = coverCandidates({ fansHere, overall, cityTop: ents("Big Rock", "Local Hero"), exclude: ["Act Itself"] });
  assert.equal(cands[0].ref, "Big Rock", "rank 2 here vs 11 overall, and the city loves it");
  assert.ok(!cands.some((c) => c.ref === "Act Itself"));
  assert.ok(cands.every((c) => c.score > 0));
  const idea = coverIdea("Brisbane", cands[0], "indie folk");
  assert.match(idea.why, /#\d+ with your fans in Brisbane, vs #11/);
  assert.match(idea.angle, /indie folk style/);
  assert.ok(idea.names?.includes("Big Rock"));
  assert.equal(idea.category, "cover");
});

test("covers: well-known acts first when there are enough", () => {
  const fansHere: Ent[] = [
    { name: "Obscure", popularity: 0.2 },
    { name: "Famous 1", popularity: 0.9 },
    { name: "Famous 2", popularity: 0.95 },
    { name: "Famous 3", popularity: 0.99 },
  ];
  const c = coverCandidates({ fansHere, overall: [], cityTop: [] });
  assert.ok(!c.some((x) => x.ref === "Obscure"));
});

test("covers across a region: one cover goes where it scores best, not everywhere", () => {
  const shared = (score: number, rank: number) => ({ ref: "Big Rock", key: "big rock", cityRank: rank, score });
  const own = (ref: string, score: number) => ({ ref, key: ref.toLowerCase(), cityRank: 3, score });
  const cands = new Map([
    ["Brisbane", [shared(0.9, 1), own("Bris Two", 0.5), own("Bris Three", 0.4)]],
    ["Perth", [shared(0.8, 1), own("Perth Two", 0.5), own("Perth Three", 0.3)]],
    ["Sydney", [shared(0.2, 5), own("Syd Two", 0.6), own("Syd Three", 0.5)]],
    ["Melbourne", [shared(0.1, 9), own("Mel Two", 0.6), own("Mel Three", 0.5)]],
  ]);
  const picks = assignCovers(cands, 2);
  const has = (city: string) => picks.get(city)!.some((c) => c.ref === "Big Rock");
  assert.ok(has("Brisbane") && has("Perth"));
  assert.ok(!has("Sydney") && !has("Melbourne"));
  for (const list of picks.values()) assert.equal(list.length, 2);
});

test("unknown act: city's own artists, contrasted with the other cities", () => {
  const byCity = new Map([
    ["Austin", ents("Everywhere Star", "Texas Twang", "Austin Indie")],
    ["Chicago", ents("Everywhere Star", "Windy Blues", "Chicago House")],
  ]);
  const c = cityCoverCandidates(byCity);
  assert.notEqual(c.get("Austin")![0].ref, "Everywhere Star", "a name every city loves isn't local");
  assert.equal(c.get("Austin")![0].ref, "Texas Twang");
});

test("contrast: single city ranks by its own list", () => {
  const r = contrast(new Map([["Pune", ents("One", "Two")]]));
  assert.deepEqual(r.get("Pune")!.map((x) => x.e.name), ["One", "Two"]);
  assert.equal(r.get("Pune")![0].elsewhere, undefined);
});

const talk = (kind: string) =>
  topicIdeas({
    kind,
    quota: { screen: 2, brands: 1, food_places: 1, people: 1 },
    buckets: [
      { bucket: { category: "screen", type: "tv_show", label: "TV shows" }, byCity: new Map([["Mumbai", ents("Show M1", "Show Both", "Show M2")], ["Pune", ents("Show Both", "Show P1", "Show P2")]]) },
      { bucket: { category: "brands", type: "brand", label: "brands" }, byCity: new Map([["Mumbai", ents("Brand M")], ["Pune", ents("Brand P")]]) },
      { bucket: { category: "food_places", type: "place", label: "restaurants" }, byCity: new Map([["Mumbai", ents("Cafe M")], ["Pune", ents("Cafe P")]]) },
      { bucket: { category: "people", type: "person", label: "people" }, byCity: new Map([["Mumbai", ents("Show M1", "Star M")], ["Pune", ents("Star P")]]) },
    ],
  });

test("topics: per category quotas, differ by city, every idea has a ref and a number, no name twice", () => {
  const out = talk("comedian");
  const m = out.get("Mumbai")!;
  const p = out.get("Pune")!;
  assert.equal(m.filter((i) => i.category === "screen").length, 2);
  assert.ok(m.every((i) => i.ref && Number.isFinite(i.value) && /fan data/.test(i.why)));
  assert.equal(new Set(m.map((i) => i.ref)).size, m.length);
  assert.ok(m.some((i) => i.ref === "Star M"), "duplicate name skipped, next one taken");
  assert.notDeepEqual(m.map((i) => i.ref).sort(), p.map((i) => i.ref).sort());
  assert.ok(m.every((i) => i.question && i.angle.startsWith("Premise")), "comics: premise + crowd-work question");
  assert.equal(grouped(m)[0].category, "screen");
});

test("hint modes by kind, including new disciplines", () => {
  assert.equal(hintMode("comedian"), "premise");
  assert.equal(hintMode("visual_artist"), "subject");
  assert.equal(hintMode("photographer"), "subject");
  assert.equal(hintMode("speaker"), "example");
  assert.match(talk("visual_artist").get("Pune")![0].angle, /Show|Brand|Cafe|Star/);
});

test("region view: names where an idea ranks and where it doesn't", () => {
  const cities = [
    { city: "Brisbane", ideas: [coverIdea("Brisbane", { ref: "Big Rock", key: "big rock", cityRank: 1, score: 0.9 })] },
    { city: "Perth", ideas: [coverIdea("Perth", { ref: "Big Rock", key: "big rock", cityRank: 2, score: 0.7 })] },
    { city: "Sydney", ideas: [coverIdea("Sydney", { ref: "Harbour Pop", key: "harbour pop", cityRank: 1, score: 0.6 })] },
  ];
  const r = regionView(cities, new Map());
  assert.equal(r[0].line, "Play Big Rock in Brisbane and Perth, not Sydney.");
  assert.deepEqual(cities[0].ideas[0].cities, ["Perth"]);
  assert.deepEqual(regionView([cities[0]], new Map()), [], "one city: no region view");
});

test("critic: drops lines whose ref isn't in the city's ideas or isn't used", () => {
  const ideas = talk("comedian").get("Mumbai")!;
  const { kept, dropped } = groundLines(ideas, [
    { ref: "Show M1", angle: "Show M1 but set on a local train." },
    { ref: "Made Up Show", angle: "Made Up Show is huge here." },
    { ref: "Brand M", angle: "A bit about loyalty." },
  ]);
  assert.deepEqual([...kept.keys()], ["show m1"]);
  assert.equal(dropped.length, 2);
});

test("budget: rank mixes categories, every idea is local, cap keeps the best few", () => {
  const ranked = rankIdeas(talk("comedian").get("Mumbai")!, ["screen", "brands", "food_places", "people"]);
  assert.deepEqual(ranked.slice(0, 4).map((i) => i.category), ["screen", "brands", "food_places", "people"]);
  assert.ok(ranked.every((i, n) => i.rank === n + 1 && i.local === true));
  assert.equal(capIdeas(ranked, 2).length, 2);
  assert.equal(capIdeas(ranked).length, ranked.length);
  assert.equal(hintMode("theatre"), "premise");
});

test("display: names become bold parts from structured fields; region line is short", async () => {
  const { segments } = await import("../../packages/core/src/engine/ideas-rank.ts");
  assert.deepEqual(segments("Play Caamp in Columbus.", ["Caamp", "Columbus"]), [{ t: "Play " }, { b: "Caamp" }, { t: " in " }, { b: "Columbus" }, { t: "." }]);
  const c = coverIdea("Chicago", { ref: "Solange", key: "solange", cityRank: 2, overallRank: 30, score: 0.9 }, "Dream Pop");
  assert.ok(!c.angle.includes("Solange"), "angle doesn't repeat the title");
  assert.match(c.angle, /dream pop style/);
  assert.ok(c.names?.includes("dream pop"), "the style is bolded as written");
  const r = regionView(
    [
      { city: "A", ideas: [coverIdea("A", { ref: "X", key: "x", cityRank: 1, score: 0.9 })] },
      { city: "B", ideas: [] },
    ],
    new Map(),
  );
  assert.equal(r[0].short, "Play X in A.");
  assert.match(r[0].detail, /Ranks lower in B/);
});

// ---------- Performance context (PLAN §18 Q15) ----------

test("context: budget caps local ideas per slot, the rest stay as ranked spares", async () => {
  const { localIdeas } = await import("../../packages/core/src/engine/ideas-rank.ts");
  const { performanceContext } = await import("../../packages/core/src/context/index.ts");
  const ideas = talk("comedian").get("Mumbai")!;
  const head = performanceContext({ kind: "comedian", slot: "headline", place: "Mumbai" });
  const mic = performanceContext({ kind: "comedian", slot: "open_mic", place: "Mumbai" });
  const lots = performanceContext({ kind: "comedian", slot: "hour", flavour: "lots", place: "Mumbai" });
  const a = localIdeas(ideas, { max: head.budget.max });
  assert.ok(a.use.length <= head.budget.max && a.use.length > 0);
  assert.equal(a.use.length + a.spare.length, ideas.length);
  assert.deepEqual(a.use.map((i) => i.rank), a.use.map((_, n) => n + 1), "use = best ranks");
  assert.equal(localIdeas(ideas, { max: mic.budget.max }).use.length, 0, "an open mic carries no local touches");
  assert.ok(localIdeas(ideas, { max: lots.budget.max }).use.length > a.use.length, "longer slot + more flavour = more");
  assert.equal(localIdeas(ideas).use.length, ideas.length, "no context: every idea");
});

test("context: topics that hit the avoid list are dropped, covers are not", async () => {
  const { localIdeas } = await import("../../packages/core/src/engine/ideas-rank.ts");
  const { avoidList } = await import("../../packages/core/src/context/index.ts");
  const mk = (ref: string, category: "screen" | "cover", value: number) => ({ idea: ref, category, ref, type: "tv_show", value, why: "fan data", angle: ref });
  const ideas = [mk("Election Night Live", "screen", 0.9), mk("Muslim Matchmaker", "screen", 0.8), mk("Bake Off", "screen", 0.7), mk("Sex Pistols", "cover", 0.6)];
  const r = localIdeas(ideas, { avoid: avoidList("comedian", "Mumbai", ["edgy"]) });
  assert.deepEqual(r.use.map((i) => i.ref).sort(), ["Bake Off", "Sex Pistols"]);
  assert.deepEqual(r.avoided.sort(), ["Election Night Live", "Muslim Matchmaker"]);
  const political = localIdeas(ideas, { avoid: avoidList("comedian", "London", ["political"]) });
  assert.ok(political.use.some((i) => i.ref === "Election Night Live"), "political act keeps politics");
  assert.ok(!political.use.some((i) => i.ref === "Muslim Matchmaker"), "never-punch-down holds");
});

test("context: a younger room lifts recent covers, an older room older ones; no years = no change", async () => {
  const { skewCovers } = await import("../../packages/core/src/engine/ideas-rank.ts");
  const c = (ref: string, score: number, year?: number) => ({ ref, key: ref.toLowerCase(), cityRank: 1, score, year });
  const list = [c("Old Band", 0.6, 1975), c("New Band", 0.55, 2020), c("Mid Band", 0.5, 2000)];
  assert.equal(skewCovers(list, "younger")[0].ref, "New Band");
  assert.equal(skewCovers(list, "older")[0].ref, "Old Band");
  assert.deepEqual(skewCovers(list, "even"), list);
  const noYears = list.map(({ year: _y, ...x }) => x);
  assert.deepEqual(skewCovers(noYears, "younger"), noYears);
  const fans = [
    { name: "Classic", popularity: 0.9, properties: { start_year: 1970 } },
    { name: "Fresh", popularity: 0.9, properties: { start_year: 2021 } },
    { name: "Mid", popularity: 0.9, properties: { start_year: 1995 } },
  ];
  const young = coverCandidates({ fansHere: fans, overall: [], cityTop: [], skew: "younger" });
  const old = coverCandidates({ fansHere: fans, overall: [], cityTop: [], skew: "older" });
  assert.equal(young[0].ref, "Fresh");
  assert.equal(old[0].ref, "Classic");
  const byCity = cityCoverCandidates(new Map([["A", fans], ["B", fans]]), [], new Map([["A", "younger" as const], ["B", "older" as const]]));
  assert.ok(byCity.get("A")![0].year! > byCity.get("B")![0].year!, "per-city skew");
});

// ---------- Tour-wide fit from one fan-data map per idea (synthetic cells, never real responses) ----------

test("region fit: synthetic heatmap cells → per-city fit 0–1, best city ring, weak here, not in data", async () => {
  const { cityBoxes, heatFit, withHeatFit } = await import("../../packages/core/src/engine/ideas-rank.ts");
  const { ideaGrid } = await import("../../apps/web/app/lib/analytics.ts");
  const geo = [
    { name: "Hot", lat: 40, lon: -75 },
    { name: "Mid", lat: 42, lon: -80 },
    { name: "Cold", lat: 44, lon: -85 },
    { name: "Far", lat: 30, lon: -95 }, // no cells come back near it
  ];
  const cell = (c: { lat: number; lon: number }, dLat: number, affinity: number, affinity_rank: number, popularity: number) => ({ location: { latitude: c.lat + dLat, longitude: c.lon }, query: { affinity, affinity_rank, popularity } });
  const cells = [
    cell(geo[0], 0.01, 0.95, 0.95, 0.9), cell(geo[0], -0.02, 0.9, 0.9, 0.8), cell(geo[0], 0.03, 0.85, 0.85, 0.7),
    cell(geo[1], 0.01, 0.6, 0.6, 0.5), cell(geo[1], -0.01, 0.5, 0.5, 0.4),
    cell(geo[2], 0.01, 0.1, 0.1, 0.2),
    cell({ lat: 0, lon: 0 }, 0, 1, 1, 1), // outside every box: ignored
  ];
  const fit = heatFit(cells, geo);
  assert.equal(fit.get("Hot"), 1, "most fans and strongest lean → 1");
  assert.equal(fit.get("Cold"), 0, "the city came back with low density → 0 (weak here)");
  const mid = fit.get("Mid")!;
  assert.ok(mid > 0 && mid < 1);
  assert.ok(!fit.has("Far"), "no cells → not in its data");
  assert.equal(heatFit(cells.slice(0, 3), geo).get("Hot"), 1, "one city with cells still fits");
  assert.equal(heatFit([], geo).size, 0);

  const wkt = cityBoxes(geo.slice(0, 2), 30);
  assert.match(wkt, /^MULTIPOLYGON\(\(\(-75\.\d+ 39\.\d+, /, "WKT longitude first");
  assert.equal(wkt.match(/\(\(/g)!.length, 2, "one box per city");

  const cities = geo.map((g) => ({ city: g.name, ideas: [] }));
  const row = { ref: "Band X", idea: "Cover Band X", category: "cover" as const, best: [{ city: "Mid", value: 0.8 }], skip: ["Hot", "Cold", "Far"], line: "", short: "Play Band X in Mid.", detail: "Local score: Mid 0.8 (fan data).", names: ["Band X"], fit: [{ city: "Mid", value: 0.8 }] };
  const other = { ...row, ref: "Band Y", fit: [{ city: "Hot", value: 0.4 }] };
  const [filled, kept] = withHeatFit([row, other], new Map([["band x", fit]]), geo.map((g) => g.name));
  assert.deepEqual(filled.fit!.map((f) => f.city), ["Hot", "Mid", "Cold"], "every city the map has, in tour order");
  assert.equal(filled.fitFrom, "map");
  assert.match(filled.detail, /lean most to Hot, least to Cold/);
  assert.equal(kept, other, "no map for this idea: list numbers stay");
  const grid = ideaGrid({ cities, region: [filled, kept] });
  assert.deepEqual(grid.rows[0].cells, [1, mid, 0, undefined], "Far stays 'not in data', Mid's list number replaced");
  assert.equal(grid.rows[0].best, 0, "best-city ring on Hot");
});

test("story 25: crowd-work kinds plan ≥ 8 topics per city; the budget shows a few and keeps the rest as spares", async () => {
  const { DISCIPLINES } = await import("../../packages/core/src/disciplines/index.ts");
  const { ideaPlan } = await import("../../packages/core/src/engine/ideas.ts");
  const { localIdeas } = await import("../../packages/core/src/engine/ideas-rank.ts");
  for (const [kind, d] of Object.entries(DISCIPLINES)) {
    if (!d.crowdWork) continue;
    assert.ok(ideaPlan(kind).reduce((n, s) => n + s.take, 0) >= 8, `${kind}: fewer than 8 topics planned`);
  }
  const m = talk("comedian").get("Mumbai")!;
  const r = localIdeas(m, { max: 2 });
  assert.equal(r.use.length, 2);
  assert.equal(r.use.length + r.spare.length, m.length, "every idea past the budget comes back as a spare");
});
