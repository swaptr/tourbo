// Grounded "why" lines: evidence grades, grounding critic, template fallback, bold parts.
// node --test tests/unit/explain.test.ts. Fixtures are hand-written, not real fan-data responses.
import assert from "node:assert/strict";
import { test } from "node:test";

import { EVIDENCE, finish, grade, groundCheck, itemHash, templateLine, toParts, type ExplainItem } from "../../packages/core/src/engine/explain.ts";
import { dealItems, ideaItem, nightItems, setMoveItem, takeawayItem } from "../../packages/core/src/engine/explain-facts.ts";
import type { Plan } from "../../packages/core/src/shared/types.ts";

const night: ExplainItem = {
  id: "night:0",
  kind: "compare",
  subject: "Columbus",
  other: "Chicago",
  currency: "USD",
  evidence: "strong",
  names: ["Newport Music Hall"],
  facts: [
    { key: "fan", label: "fan strength in Columbus", value: 82, unit: "score", say: "fan strength 82 vs 41" },
    { key: "fanOther", label: "fan strength in Chicago", value: 41, unit: "score" },
    { key: "lean", label: "fans more concentrated", value: 2.06, unit: "x" },
    { key: "venue", label: "room", value: "Newport Music Hall" },
    { key: "profit", label: "estimated profit", value: 612, unit: "money", say: "earns ~$612 (estimate)" },
  ],
};

test("critic accepts a line that only uses the facts (rounding, ~, bold names)", () => {
  const ok = groundCheck("**Columbus** over **Chicago**: your fans there are 2.1× as concentrated and Newport Music Hall fits, so it earns ~$600.", night);
  assert.deepEqual(ok.problems, []);
  assert.ok(ok.ok);
  assert.ok(ok.refs.includes("lean") && ok.refs.includes("profit") && ok.refs.includes("venue"));
});

test("critic rejects invented numbers", () => {
  const bad = groundCheck("Columbus over Chicago: 3,400 fans and ~$9,000 profit.", night);
  assert.ok(!bad.ok);
  assert.ok(bad.problems.some((p) => p.includes("3400")));
  assert.ok(bad.problems.some((p) => p.includes("9000")));
});

test("critic rejects invented names, mid-sentence and at the start", () => {
  assert.ok(!groundCheck("Columbus over Chicago because Ohio State fans pack the Bluestone.", night).ok);
  assert.ok(!groundCheck("Cleveland was close, but Columbus has more fans.", night).ok);
  assert.ok(groundCheck("Your fans in Columbus outnumber Chicago two to one.", night).ok);
});

test("critic rejects vendor names and unlabelled money", () => {
  assert.ok(!groundCheck("Qloo says Columbus beats Chicago.", night).ok);
  assert.ok(groundCheck("Columbus earns $612 more than Chicago.", night).problems.some((p) => p.includes("estimate")));
  assert.ok(groundCheck("Columbus earns about $612, more than Chicago.", night).ok);
});

test("critic rejects more than two sentences", () => {
  assert.ok(!groundCheck("Columbus wins. Chicago loses. Fans agree.", night).ok);
});

test("template passes its own critic and labels money as an estimate", () => {
  const t = templateLine(night);
  assert.match(t, /^Columbus over Chicago: /);
  assert.match(t, /estimate/);
  assert.deepEqual(groundCheck(t, night).problems, []);
});

test("finish: AI line kept when grounded, template when not, nothing when evidence isn't strong", () => {
  assert.equal(finish(night, "Columbus over Chicago: twice the fans, and about $612 profit.").source, "ai");
  const fb = finish(night, "Columbus over Chicago thanks to Lollapalooza.");
  assert.equal(fb.source, "template");
  assert.equal(fb.text, templateLine(night));
  assert.equal(finish(night).source, "template");
  const some = finish({ ...night, evidence: "some", chip: { text: "a bit more fans", hedged: true } });
  assert.equal(some.text, undefined);
  assert.ok(some.chip?.hedged);
  assert.equal(finish({ ...night, evidence: "none", chip: { text: "x" } }).chip, undefined);
});

test("parts: proper nouns from the facts are bold, nothing else", () => {
  const parts = toParts("**Columbus** over Chicago: Newport Music Hall fits.", night);
  assert.deepEqual(parts, [{ b: "Columbus" }, { t: " over " }, { b: "Chicago" }, { t: ": " }, { b: "Newport Music Hall" }, { t: " fits." }]);
});

test("evidence thresholds", () => {
  assert.equal(grade({}), "none");
  assert.equal(grade({ margin: EVIDENCE.someMargin - 0.01, alternative: true }), "none");
  assert.equal(grade({ margin: 0.1, alternative: true }), "some");
  assert.equal(grade({ margin: 0.5, alternative: false }), "some");
  assert.equal(grade({ margin: 0.5, alternative: true, thin: true }), "some");
  assert.equal(grade({ margin: 0.5, alternative: true, fallback: true }), "some");
  assert.equal(grade({ margin: EVIDENCE.strongMargin, alternative: true }), "strong");
});

test("item hash is stable and changes with the facts", () => {
  assert.equal(itemHash(night), itemHash({ ...night, id: "other" }));
  assert.notEqual(itemHash(night), itemHash({ ...night, facts: night.facts.slice(1) }));
});

const plan = {
  artist: { name: "Maya", kind: "musician", basis: "act" },
  params: { region: "na" },
  stops: [
    {
      city: { name: "Columbus" },
      score: 82,
      fanIndex: 4.2,
      thinData: false,
      hotspots: [],
      evidence: [],
      venue: { id: "v", name: "Newport Music Hall", tag: "", foundBy: "" },
      facts: { fanTaste: [], cityCulture: [{ name: "Ohio State Buckeyes", type: "brand" }], localSpots: [] },
      money: { verdict: "headline", why: "", currency: "USD", deal: "door_split", price: 25, capacity: 1700, tickets: 1400, sellThrough: 0.82, gross: 35000, artistTake: 20000, costs: 8000, profit: 612, breakEvenPrice: 18, relDemand: 1, draw: 1400, basis: "", estimate: true },
    },
    { city: { name: "Dayton" }, score: 40, thinData: true, hotspots: [], evidence: [] },
  ],
  legs: [{ from: "Pittsburgh", to: "Columbus", km: 300 }],
  totalKm: 300,
  medianFanIndex: 2,
} as unknown as Plan;

test("nightItems: compare against the best skipped city; templates stay grounded", () => {
  const items = nightItems(plan, new Map([["Columbus", 82], ["Chicago", 41], ["Dayton", 40], ["Toledo", 30]]));
  const [col, day] = items;
  assert.equal(col.kind, "compare");
  assert.equal(col.other, "Chicago");
  assert.equal(col.evidence, "strong");
  assert.match(col.chip!.text, /82 vs 41 in Chicago/);
  assert.deepEqual(groundCheck(templateLine(col), col).problems, []);
  assert.notEqual(day.evidence, "strong", "thin data is never strong");
  assert.ok(!groundCheck("Columbus over Chicago: Ohio State fans and the Short North.", col).ok, "partial or invented names fail");
  assert.ok(groundCheck("Columbus over Chicago: twice the fans, about $612, and Ohio State Buckeyes fans.", col).ok);
});

test("dealItems: price over break-even is a comparison point", () => {
  const [d] = dealItems(plan);
  assert.equal(d.evidence, "strong");
  assert.deepEqual(groundCheck(templateLine(d), d).problems, []);
});

test("ideaItem: covers compare city rank vs overall; city-only basis is hedged", () => {
  const idea = { idea: "Cover Caamp", category: "cover", ref: "Caamp", type: "artist", value: 9, why: "#2 with your fans in Columbus, vs #11 with your fans overall (fan data, local lift 9).", angle: "" } as const;
  const strong = ideaItem("Columbus", { ...idea });
  assert.equal(strong.evidence, "strong");
  assert.equal(strong.chip?.text, "#2 here vs #11 overall");
  assert.deepEqual(groundCheck(templateLine(strong), strong).problems, []);
  assert.equal(ideaItem("Columbus", { ...idea }, "city").evidence, "some");
  const weak = ideaItem("Columbus", { ...idea, category: "screen", ref: "Severance", value: 0.02, why: "" });
  assert.equal(weak.evidence, "none");
});

test("setMoveItem: a move citing a city fact", () => {
  const c = {
    city: "Columbus",
    facts: [{ name: "Folk", kind: "city_style", detail: "a top style among Columbus's most-followed artists (weight 0.4)", value: 0.4 }],
    order: [{ title: "Slow River", minutes: 5, fit: 0.4, move: "nod", reason: "", refs: ["Folk"] }],
    coverIdeas: [],
    crowdWork: [],
    length: { total: 5, target: 60, verdict: "short", note: "" },
  } as never;
  const s = setMoveItem(c, 0);
  assert.equal(s.evidence, "strong");
  assert.equal(s.chip?.text, "Columbus loves Folk");
  assert.deepEqual(groundCheck(templateLine(s), s).problems, []);
});

test("takeawayItem: leader vs runner-up", () => {
  const t = takeawayItem({ id: "chart:fans", title: "Where your fans are", series: [{ label: "Columbus", value: 82 }, { label: "Chicago", value: 41 }], unit: "score", measure: "fan strength" });
  assert.equal(t.evidence, "strong");
  assert.deepEqual(groundCheck(templateLine(t), t).problems, []);
  assert.equal(takeawayItem({ id: "x", title: "Flat", series: [{ label: "A", value: 50 }, { label: "B", value: 49 }] }).evidence, "none");
});
