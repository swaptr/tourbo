// Story 29: performance context. Local ideas season the act's own set (never more than the
// originality budget), the slot changes how many, the room's age skew tilts cover ideas, and a
// comic gets an avoid list per place that the critic enforces. No network: hand-written fixtures
// (never real responses); the live demographics part waits for fan-data quota.
import assert from "node:assert/strict";
import { test } from "node:test";

import { audienceParams, audienceProfile, avoidList, checkAgainstAvoid, localBudget, slotFor, slotsFor, type DemoBlock } from "@tourbo/core/context/index.ts";
import { DISCIPLINES } from "@tourbo/core/disciplines/index.ts";
import { arrangeCity, groundMoves, parseSetLines, rankCoverIdeas } from "@tourbo/core/engine/set.ts";
import { PARAMS_BY_TYPE, type InsightsType } from "@tourbo/core/qloo/params.ts";
import type { QlooEntity } from "@tourbo/core/qloo/api.server.ts";

const artist = (name: string, genres: string[], props: Record<string, unknown> = {}): QlooEntity => ({
  name,
  entity_id: name,
  properties: props,
  tags: genres.map((g) => ({ tag_id: `urn:tag:genre:music:${g.toLowerCase().replace(/\W+/g, "_")}`, name: g })),
});
const person = (name: string, tags: string[] = []): QlooEntity => ({ name, entity_id: name, tags: tags.map((t) => ({ tag_id: `urn:tag:genre:person:${t}`, name: t })) });

const SONGS = parseSetLines(["Golden Hour, opener, Indie Pop", "Slow River, slow, Folk", "Neon Nights, banger, Electronic", "Back Porch, Country", "Paper Planes, Hip Hop", "Velvet, R&B", "Long Drive, Rock", "Echoes, Rock", "Static, Indie Pop", "Midnight, Folk", "Highway, Rock", "Goodbye Song, closer, Singer-Songwriter"].join("\n"));
const CITY = [artist("Dolly Parton", ["Country", "Folk"]), artist("Jack White", ["Rock", "Blues"]), artist("Paramore", ["Rock", "Pop Punk"]), artist("Lizzo", ["Pop", "R&B"]), artist("Chance the Rapper", ["Hip Hop"])];
const local = (o: { move: string }[]) => o.filter((e) => e.move === "nod" || e.move === "crowd").length;
const arrange = (slot: string, flavour: "touch" | "some" | "lots" = "touch", kind: "musician" | "comedian" = "musician", extra: Partial<Parameters<typeof arrangeCity>[0]> = {}) =>
  arrangeCity({ city: "Austin", kind, slot, items: SONGS, defaultStyles: [], taste: { entities: CITY }, flavour, ...extra });

test("every discipline has slots; headline and support always resolve; unknown kinds fall back", () => {
  for (const kind of Object.keys(DISCIPLINES)) {
    assert.ok(slotsFor(kind).length >= 3, `${kind} has slots`);
    assert.ok(slotFor(kind, "headline").key, `${kind} headline resolves`);
    assert.ok(slotFor(kind, "support").key, `${kind} support resolves`);
  }
  assert.equal(slotFor("kazoo_orchestra", "headline").label, "your own show");
  assert.equal(slotFor("musician", "support").size, 30);
  assert.equal(slotFor("comedian", "headline").size, 45);
});

test("budget math: a touch ≈ 1 per 25 min and ≤ 15%; support 0–1; short spots 0; more flavour, more touches", () => {
  const b = (kind: string, slot: string, f: "touch" | "some" | "lots" = "touch") => localBudget(slotFor(kind, slot), f, 4).max;
  assert.equal(b("musician", "headline"), 2, "60-min headline: two touches");
  assert.equal(b("musician", "support"), 1, "30-min support: one");
  assert.equal(b("comedian", "open_mic"), 0, "open mic: all yours");
  assert.ok(b("musician", "headline", "some") > b("musician", "headline"));
  assert.ok(b("musician", "headline", "lots") > b("musician", "headline", "some"));
  assert.ok(b("musician", "support", "lots") <= 3, "support stays capped");
  assert.equal(localBudget(slotFor("musician", "co_bill")).mode, "shared");
  assert.equal(localBudget(slotFor("visual_artist", "headline")).max, 2, "15-piece solo show: two local subjects");
  for (const kind of Object.keys(DISCIPLINES))
    for (const s of slotsFor(kind)) {
      const t = localBudget(s, "touch");
      if (s.unit === "minutes") assert.ok((t.max * 2) <= Math.max(s.size * 0.15, 2) + 0.01 || t.max <= 1, `${kind}/${s.key}: a touch stays ≤ 15%`);
    }
});

test("the set never carries more local items than the budget; changing the slot changes the count", () => {
  for (const f of ["touch", "some", "lots"] as const)
    for (const slot of ["headline", "support", "co_bill", "festival"]) {
      const set = arrange(slot, f);
      assert.ok(local(set.order) <= set.local.budget.max, `${slot}/${f}: ${local(set.order)} ≤ ${set.local.budget.max}`);
      assert.equal(set.local.used, local(set.order));
      assert.equal(set.order.filter((e) => e.item !== undefined).length, SONGS.length, "the act's own songs all stay");
    }
  // Fans fixture so covers exist (city rank beats overall rank).
  const fans = [artist("AC/DC", ["Hard Rock"]), artist("ZZ Top", ["Blues Rock"]), artist("Willie Nelson", ["Country"]), artist("Spoon", ["Indie Rock"])];
  const overall = [artist("Spoon", ["Indie Rock"]), artist("Phoebe Bridgers", ["Indie"]), artist("AC/DC", ["Hard Rock"]), artist("Willie Nelson", ["Country"]), artist("ZZ Top", ["Blues Rock"])];
  const head = arrange("headline", "some", "musician", { taste: { entities: CITY, fans }, overall, targetMinutes: 60 });
  const supp = arrange("support", "some", "musician", { taste: { entities: CITY, fans }, overall, targetMinutes: 25 });
  assert.ok(local(head.order) > local(supp.order), `headline 60 (${local(head.order)}) > support 25 (${local(supp.order)})`);
  assert.match(supp.length.note, /25-min support slot/);
});

test("a younger room gets more recent cover ideas than an older one (years from fixtures)", () => {
  const fans = [artist("Fleetwood Mac", ["Rock"], { start_year: 1967 }), artist("Eagles", ["Rock"], { start_year: 1971 }), artist("Olivia Rodrigo", ["Pop"], { start_year: 2020 }), artist("Boygenius", ["Indie"], { start_year: 2018 }), artist("Queen", ["Rock"], { start_year: 1970 })];
  const year = (n: string) => Number(fans.find((f) => f.name === n)!.properties!.start_year);
  const meanYear = (skew: "younger" | "older") => {
    const ideas = rankCoverIdeas({ city: "Austin", fans, overall: [], cityEntities: fans, skew, take: 2 });
    return ideas.reduce((n, i) => n + year(i.artist), 0) / ideas.length;
  };
  assert.ok(meanYear("younger") > meanYear("older"), `${meanYear("younger")} > ${meanYear("older")}`);

  const young: DemoBlock[] = [{ entity_id: "a", query: { age: { "24_and_younger": 0.4, "25_to_29": 0.3, "30_to_34": 0.1, "35_to_44": -0.1, "45_to_54": -0.3, "55_and_older": -0.4 }, gender: { male: -0.1, female: 0.1 } } }];
  const old: DemoBlock[] = [{ entity_id: "b", query: { age: { "24_and_younger": -0.4, "25_to_29": -0.2, "30_to_34": 0, "35_to_44": 0.1, "45_to_54": 0.3, "55_and_older": 0.5 }, gender: { male: 0.2, female: -0.2 } } }];
  const pYoung = audienceProfile({ city: young, cityName: "Austin" });
  const pOld = audienceProfile({ city: old, cityName: "Tucson" });
  assert.equal(pYoung.skew, "younger");
  assert.equal(pOld.skew, "older");
  assert.equal(pYoung.ages[0], "24_and_younger");
  assert.ok(pYoung.why[0].includes("fan data"), "numbers are labelled fan data");
  // Request shapes stay inside the documented params for each type.
  for (const type of ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:person", "urn:entity:podcast"] as InsightsType[]) {
    const p = audienceParams(pYoung, type, 2026);
    for (const k of Object.keys(p)) assert.ok((PARAMS_BY_TYPE[type] as readonly string[]).includes(k), `${k} is documented for ${type}`);
  }
  assert.equal(audienceParams(pYoung, "urn:entity:artist")["signal.demographics.age"], "24_and_younger,25_to_29,30_to_34");
  assert.equal(audienceParams(pYoung, "urn:entity:movie", 2026)["filter.release_year.min"], 2016);
  assert.equal(audienceParams(pOld, "urn:entity:tv_show", 2026)["filter.release_year.max"], 2011);
  assert.equal(audienceParams(pYoung, "urn:entity:artist")["filter.release_year.min"], undefined, "artists have no release year filter");
});

test("a comic in Mumbai gets religion on the avoid list, with sources, and the critic drops a line that hits it", () => {
  const list = avoidList("comedian", { name: "Mumbai", query: "Mumbai, India", region: "in" }, ["edgy"]);
  assert.equal(list.country, "IN");
  const religion = list.rules.find((r) => r.topic === "religion");
  assert.ok(religion?.source?.url.startsWith("https://"), "religion rule cites a source");
  assert.ok(list.rules.some((r) => r.topic === "faith_groups" && r.scope === "universal"), "never-punch-down applies everywhere");
  assert.ok(checkAgainstAvoid("Riff on the temple queue outside Siddhivinayak", list).some((h) => h.topic === "religion"));
  assert.equal(checkAgainstAvoid("Ask who has the longest local train commute", list).length, 0);
  assert.match(list.disclaimer, /not legal advice/);

  // Same comic in Dublin: no religion law note; universal rules still there.
  const dublin = avoidList("comedian", { name: "Dublin", query: "Dublin, Ireland" }, ["edgy"]);
  assert.ok(!dublin.rules.some((r) => r.topic === "religion"));
  assert.ok(dublin.rules.some((r) => r.topic === "faith_groups"));
  // Boundaries: clean bans swearing, dark allows death, political unlocks politics (not where the law bites).
  assert.ok(avoidList("speaker", "US", ["clean"]).rules.some((r) => r.topic === "profanity"));
  assert.ok(!avoidList("comedian", "US", ["dark", "political"]).rules.some((r) => r.topic === "death" || r.topic === "politics"));
  assert.ok(avoidList("comedian", "TR", ["political"]).rules.some((r) => r.topic === "head_of_state"), "Türkiye: head of state stays on the list");
  // Grounded names don't trip it: a band called Queen in Bangkok.
  assert.equal(checkAgainstAvoid("Close with a Queen cover", avoidList("musician", "TH"), ["Queen"]).length, 0);

  // Set critic: a written reason that hits the list is dropped.
  const set = arrangeCity({ city: "Mumbai", kind: "comedian", slot: "headline", items: parseSetLines("Airport security, opener\nMy landlord\nDating apps, closer"), defaultStyles: [], taste: { entities: [person("Zakir Khan", ["stand_up"])] }, culture: [{ name: "Mumbai Indians" }, { name: "Vada Pav" }, { name: "Ganesh Chaturthi" }], place: { query: "Mumbai, India", region: "in" }, boundaries: ["edgy"] });
  assert.ok(!set.crowdWork.includes("Ganesh Chaturthi"), "crowd-work topics skip avoid-list hits");
  const { kept, avoided } = groundMoves(
    [
      { pos: 1, reason: "Mumbai Indians fans will love this, then a temple joke", refs: ["Mumbai Indians"] },
      { pos: 1, reason: "Ask who backs Mumbai Indians this season", refs: ["Mumbai Indians"] },
    ],
    set,
  );
  assert.equal(kept.length, 1);
  assert.equal(avoided, 1);
});

test("taste signal: a city whose top comics are tagged dark comedy leans edgier", () => {
  const set = arrangeCity({ city: "Austin", kind: "comedian", slot: "headline", items: parseSetLines("A\nB\nC"), defaultStyles: [], taste: { entities: [person("A", ["dark_comedy", "Dark Comedy"]), person("B", ["Dark Humor"]), person("C", ["Satire"])] }, boundaries: ["edgy"] });
  assert.ok(set.avoid.advice.some((a) => /leans darker/.test(a)));
});
