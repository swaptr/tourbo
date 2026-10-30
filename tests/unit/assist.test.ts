// AI assists (PLAN Q21): the rules half. Parsers, tags, titles, row-insight facts, set ordering
// and the fallback (critic) paths. No AI calls: AI output is hand-written here.
// node --test tests/unit/assist.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSetDraft,
  energyOf,
  groundParsed,
  nodsFor,
  parseLibrary,
  parseLine,
  rowInsight,
  seasonOf,
  setEvidence,
  suggestProfile,
  tagsFromWords,
  titleCheck,
  titleFor,
  type LibraryItem,
} from "../../packages/core/src/assist/assist.ts";
import { groundCheck } from "../../packages/core/src/engine/explain.ts";
import type { Idea } from "../../packages/core/src/engine/ideas-rank.ts";
import type { CityPlan, Plan } from "../../packages/core/src/shared/types.ts";

// ---------- library_parse ----------

test("parse: setlist lines with durations, separators, covers and headers", () => {
  const text = [
    "Setlist:",
    "1. Be Sweet – 3:45 – opener",
    "2. Paprika | 4 min",
    "- Hey Jude (Beatles cover)",
    "• Dreams (by Fleetwood Mac)",
    "99 Problems",
    "Posing in Bondage, slow, 5",
    "Hello, Goodbye",
    "Encore",
    "Diving Woman",
    "",
    "we usually close with the long one and then hang out at the merch table for a while",
  ].join("\n");
  const r = parseLibrary(text, "musician");
  const by = Object.fromEntries(r.items.map((i) => [i.title, i]));
  assert.deepEqual(Object.keys(by), ["Be Sweet", "Paprika", "Hey Jude", "Dreams", "99 Problems", "Posing in Bondage", "Hello, Goodbye", "Diving Woman"]);
  assert.equal(by["Be Sweet"].lengthMin, 3.8);
  assert.deepEqual(by["Be Sweet"].tags, ["opener"]);
  assert.equal(by["Paprika"].lengthMin, 4);
  assert.equal(by["Hey Jude"].origin, "cover");
  assert.equal(by["Hey Jude"].by, "Beatles");
  assert.equal(by["Dreams"].by, "Fleetwood Mac");
  assert.equal(by["99 Problems"].origin, "original"); // a leading number without "." is part of the title
  assert.equal(by["Posing in Bondage"].lengthMin, 5);
  assert.deepEqual(by["Posing in Bondage"].tags, ["slow"]);
  assert.ok(by["Diving Woman"].tags.includes("encore"));
  assert.ok(r.items.every((i) => i.type === "song" && i.from === "rules"));
  assert.equal(r.gaps.length, 1); // the prose line goes to the AI (or stays unread)
});

test("parse: kind sets the default type; prefixes override; a dash name is a hedged guess", () => {
  assert.equal((parseLine("Airline food", "comedian") as { type: string }).type, "bit");
  assert.equal((parseLine("talk: Why cities sing", "musician") as { type: string; title: string }).title, "Why cities sing");
  const g = parseLine("Landslide - Stevie Nicks", "musician") as { origin: string; by?: string; guess?: string[] };
  assert.equal(g.origin, "cover");
  assert.equal(g.by, "Stevie Nicks");
  assert.deepEqual(g.guess, ["origin"]);
  // Comics don't read "Title – Name" as a cover.
  assert.equal((parseLine("Dating apps - Tinder", "comedian") as { origin: string }).origin, "original");
});

test("parse critic: AI items must be in the text; lengths only when stated", () => {
  const line = "we open with Be Sweet (about 4 minutes) then Paprika";
  const out = groundParsed(
    [
      { title: "Be Sweet", lengthMin: 4, origin: "original", type: "song" },
      { title: "Paprika", lengthMin: 3, origin: "original", type: "song" }, // 3 isn't in the line
      { title: "Kokomo", origin: "cover", type: "song" }, // not in the text: dropped
    ],
    line,
    "musician",
    7,
  );
  assert.deepEqual(out.map((i) => i.title), ["Be Sweet", "Paprika"]);
  assert.equal(out[0].lengthMin, 4);
  assert.equal(out[1].lengthMin, undefined);
  assert.deepEqual(out[1].guess, ["length"]);
  assert.ok(out.every((i) => i.from === "ai" && i.line === 7));
});

// ---------- library_tags ----------

test("tags: moods, energy and topics from words; flat tags for the library", () => {
  const t = tagsFromWords({ title: "Dance All Night", notes: "party banger" });
  assert.ok(t.mood.includes("upbeat"));
  assert.equal(t.energy, "high");
  assert.ok(t.tags.includes("high energy"));
  const slow = tagsFromWords({ title: "Lullaby for my Mom" });
  assert.equal(slow.energy, "low");
  assert.ok(slow.topics.includes("family"));
  assert.equal(tagsFromWords({ title: "Xyzzy" }).from, "none");
  assert.equal(energyOf(["high energy"]), "high");
  assert.equal(energyOf(["slow"]), "low");
  assert.equal(energyOf([]), undefined);
});

// ---------- title ----------

test("title: shared state, region, two cities, one-off events", () => {
  const tx = titleFor({ mode: "tour", cities: [{ name: "Austin", admin1: "TX", country: "US" }, { name: "Dallas", admin1: "TX", country: "US" }, { name: "Houston", admin1: "TX", country: "US" }], startDate: "2027-04-02", region: "na" });
  assert.equal(tx.title, "Texas spring run");
  const mw = titleFor({ cities: [{ name: "Chicago", admin1: "IL", country: "US" }, { name: "Milwaukee", admin1: "WI", country: "US" }, { name: "Columbus", admin1: "OH", country: "US" }], startDate: "2026-10-10", region: "na" });
  assert.equal(mw.title, "Midwest fall run");
  const eu = titleFor({ cities: [{ name: "London", country: "GB", countryName: "United Kingdom" }, { name: "Paris", country: "FR", countryName: "France" }, { name: "Berlin", country: "DE", countryName: "Germany" }], startDate: "2027-01-25", region: "eu" });
  assert.equal(eu.title, "Europe winter tour 2027");
  const two = titleFor({ cities: [{ name: "Pune" }, { name: "Mumbai" }], startDate: "2026-12-28" });
  assert.equal(two.title, "Pune to Mumbai, winter 2026");
  assert.equal(titleFor({ kind: "comedian", mode: "event", cities: [{ name: "Austin" }], startDate: "2027-03-06" }).title, "Spring comedy night in Austin");
  assert.equal(titleFor({ kind: "visual_artist", cities: [{ name: "Chicago" }] }).title, "Gallery show in Chicago");
  assert.equal(seasonOf("2027-07-01", "oceania"), "winter");
  assert.equal(seasonOf("2027-10-01", "eu"), "autumn");
});

test("title critic: AI alternatives may only use the facts' names and plain words", () => {
  const t = titleFor({ cities: [{ name: "Austin", admin1: "TX", country: "US" }, { name: "Dallas", admin1: "TX", country: "US" }, { name: "Houston", admin1: "TX", country: "US" }], startDate: "2027-04-02", region: "na" });
  assert.ok(titleCheck("Texas Spring Nights", t));
  assert.ok(titleCheck("Austin to Houston, Spring 2027", t));
  assert.ok(!titleCheck("Live at Stubb's", t)); // a venue not in the facts
  assert.ok(!titleCheck("Texas Spring Run 2031", t)); // a year not in the facts
  assert.ok(!titleCheck("A very long Texas spring tour title here", t)); // over 6 words
});

// ---------- row_insight ----------

const stop = (name: string, score: number, fanIndex?: number, profit?: number): CityPlan =>
  ({
    city: { name, region: "na", lat: 0, lon: 0 },
    score,
    fanIndex,
    hotspots: [],
    evidence: [],
    thinData: false,
    ...(profit !== undefined ? { money: { profit, currency: "USD", tickets: 200, capacity: 300 } } : {}),
  }) as unknown as CityPlan;
const plan = (stops: CityPlan[], median?: number) => ({ stops, medianFanIndex: median, artist: { id: "a", name: "Act", kind: "musician", peers: [], tags: [] } }) as unknown as Plan;

test("row insight: over-index of the top city, then the weakest night or a loss", () => {
  const r = rowInsight(plan([stop("Austin", 70, 3.1), stop("Chicago", 92, 1.2), stop("Tulsa", 41, 0.9)], 1), "run1")!;
  assert.equal(r.line, "Austin is your fan hotspot; Chicago has your biggest fan base.");
  assert.ok(r.evidence.every((e) => e.source === "fan data"));
  const lose = rowInsight(plan([stop("Austin", 90, 1, 5000), stop("Tulsa", 41, 1, -1200)], 1), "run2")!;
  assert.equal(lose.line, "Austin has your biggest fan base; Tulsa may lose money.");
  const soft = rowInsight(plan([stop("Austin", 90), stop("Tulsa", 41)]), "run3")!;
  assert.equal(soft.line, "Austin has your biggest fan base; Tulsa has the fewest fans.");
  assert.equal(rowInsight(plan([])), undefined);
});

test("row insight: one-night shows; the critic keeps only lines grounded in the facts", () => {
  const one = rowInsight(plan([stop("Austin", 78, 2.2, 2400)], 1), "ev")!;
  assert.equal(one.line, "Austin is a fan hotspot; should turn a profit.");
  const r = rowInsight(plan([stop("Austin", 70, 3.1), stop("Chicago", 92, 1.2), stop("Tulsa", 41, 0.9)], 1), "run1")!;
  assert.ok(groundCheck("Austin fans over-index 3.1×, Chicago strongest at 92.", r.item).ok);
  assert.ok(!groundCheck("Austin fans over-index 4×.", r.item).ok); // a number not in the facts
  assert.ok(!groundCheck("Denver is your strongest night.", r.item).ok); // a city not in the facts
});

// ---------- build_set ----------

const lib: LibraryItem[] = [
  { id: "m1", title: "Be Sweet", origin: "original", lengthMin: 4, tags: ["opener"] },
  { id: "m2", title: "Paprika", origin: "original", lengthMin: 4, tags: ["high energy"] },
  { id: "m3", title: "Posing in Bondage", origin: "original", lengthMin: 5, tags: ["slow"] },
  { id: "m4", title: "Dreams", origin: "cover", lengthMin: 4 },
  { id: "m5", title: "Diving Woman", origin: "original", lengthMin: 6, tags: ["closer"] },
  { id: "m6", title: "Boyish", origin: "original", lengthMin: 4 },
  { id: "m7", title: "Cover: Caamp", origin: "local_idea", lengthMin: 4, source: { ref: "Caamp", city: "Columbus", category: "cover" } },
];
const idea = (ref: string, rank: number): Idea => ({ idea: `Play ${ref}`, category: "cover", ref, type: "artist", value: 0.4, why: `#2 with your fans in Columbus, vs #11 with your fans overall.`, angle: "", rank });

test("build set: originals lead, opener first, closer last, local nods inside, never first or last", () => {
  const nods = nodsFor({ city: "Columbus", kind: "musician", library: lib, ideas: [idea("Caamp", 1), idea("Twenty One Pilots", 2)] });
  assert.equal(nods[0].materialId, "m7"); // the kept local idea comes first
  assert.equal(nods[0].chip, "#2 here vs #11 overall"); // fan-data chip from the saved idea
  const d = buildSetDraft({ items: lib, kind: "musician", city: "Columbus", slot: "headline", nods });
  const titles = d.order.map((e) => e.title);
  assert.equal(titles[0], "Be Sweet");
  assert.equal(titles.at(-1), "Diving Woman");
  assert.equal(d.order[0].role, "open");
  assert.equal(d.order.at(-1)!.role, "close");
  const nodAt = d.order.map((e, i) => (e.role === "nod" ? i : -1)).filter((i) => i >= 0);
  assert.ok(nodAt.length >= 1 && nodAt.length <= 2);
  assert.ok(nodAt.every((i) => i > 0 && i < d.order.length - 1));
  // Every own item made it (60-min slot), the cover after at least one original.
  for (const t of ["Paprika", "Posing in Bondage", "Dreams", "Boyish"]) assert.ok(titles.includes(t), t);
  assert.ok(titles.indexOf("Dreams") > 1);
  assert.ok(d.order.every((e) => e.reason));
  const ev = setEvidence(d, "musician");
  assert.ok(ev.some((e) => e.source === "fan data"));
});

test("build set: slot length caps the set; no nods when the budget says none", () => {
  const many: LibraryItem[] = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, title: `Song ${i}`, origin: "original", lengthMin: 4 }));
  const support = buildSetDraft({ items: many, kind: "musician", city: "Austin", slot: "support", nods: [{ ref: "A", title: "Cover: A", chip: "x", detail: "y" }] });
  assert.equal(support.target, 30);
  assert.ok(support.minutes <= 34, String(support.minutes));
  const comedy = buildSetDraft({ items: many, kind: "comedian", city: "Austin", slot: "open_mic", nods: [{ ref: "A", title: "A", chip: "x", detail: "y" }] });
  assert.ok(comedy.order.every((e) => e.role !== "nod")); // a 5-min open mic has no room for local touches
  const empty = buildSetDraft({ items: [], kind: "musician", city: "Austin" });
  assert.equal(empty.order.length, 0);
  assert.match(empty.note, /library/);
});

test("nods: falls back to the saved plan's own facts when no ideas are saved", () => {
  const s = { localArtists: [{ name: "Caamp", type: "artist" }], facts: { fanTaste: [], localSpots: [], cityCulture: [{ name: "Ohio State Buckeyes", type: "brand" }] } };
  const music = nodsFor({ city: "Columbus", kind: "musician", library: [], stop: s });
  assert.deepEqual(music.map((n) => n.ref), ["Caamp", "Ohio State Buckeyes"]);
  assert.ok(music.every((n) => n.hedged));
  const comic = nodsFor({ city: "Columbus", kind: "comedian", library: [], stop: s });
  assert.deepEqual(comic.map((n) => n.ref), ["Ohio State Buckeyes"]); // no covers for comics
});

// ---------- profile_suggest ----------

test("profile suggest: kinds from saved plans and styles; home from plans, then fan data (hedged)", () => {
  const a = suggestProfile({ genres: ["Stand-up comedy", "Indie pop"], savedKinds: ["comedian"], savedHomes: [{ name: "Chicago", lat: 41.8, lon: -87.6, count: 2 }] });
  assert.deepEqual(a.draft.kinds, ["comedian", "musician"]);
  assert.equal(a.draft.home?.name, "Chicago");
  assert.equal(a.draft.homeFrom, "your plans");
  const b = suggestProfile({ genres: ["Techno"], strongest: { name: "Berlin", lat: 52.5, lon: 13.4, score: 88 } });
  assert.deepEqual(b.draft.kinds, ["dj"]);
  assert.equal(b.draft.homeFrom, "fan data");
  assert.ok(b.evidence.find((e) => e.source === "fan data" && e.hedged));
  assert.deepEqual(suggestProfile({}).draft, { kinds: [] });
});
