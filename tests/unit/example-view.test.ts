// Unit tests for the precomputed example card view (no browser): node --test tests/unit/
import assert from "node:assert/strict";
import { test } from "node:test";

import type { HomeExample } from "../../packages/core/src/examples/types.ts";
import { buildExampleView, COMPARE_LABELS, FACT_SLOTS, ROUTE_SLOTS, viewOf } from "../../apps/web/app/lib/example-view.ts";

const city = (name: string, fanStrength: number, profit: number, travelKm: number) => ({ name, fanStrength, lean: 1.4, tickets: 1200, roomFit: "theatre, ~1,600 seats", profit, travelKm });
const base: HomeExample = {
  id: "act-sydney-route",
  feature: "route",
  decision: { headline: "5 nights, A$212k estimated profit", lines: ["Skip Perth: the flight eats the night.", "Brisbane over Gold Coast."] },
  act: { name: "Some Act", kind: "musician" },
  home: { city: "Sydney", country: "AU", continent: "oceania", lat: -33.9, lon: 151.2 },
  cities: [],
  medianFanStrength: 40,
  route: Array.from({ length: 10 }, (_, k) => ({ name: `City ${k}`, lat: 0, lon: 0, date: "2026-11-0" + ((k % 9) + 1), profit: k === 3 ? -500 : 1000 * k })),
  tourProfit: { amount: 212000, currency: "AUD", nights: 5 },
  losingNight: { city: "Perth", amount: 3000, currency: "AUD", loses: true, line: "Perth loses A$3,000." },
  compare: { line: "Brisbane over Gold Coast: more fans.", currency: "AUD", chosen: city("Brisbane", 88, 9000, 730), skipped: city("Gold Coast", 41.6, -1200, 680) },
  fanKey: "some-act",
  checkedAt: "2026-10-30T00:00:00Z",
};

test("view: every string pre-formatted, fixed slot counts, bars as fractions", () => {
  const v = buildExampleView(base);
  assert.equal(v.id, base.id);
  assert.equal(v.feature, "Route and money");
  assert.match(v.byline, /^Some Act, .+ · around Sydney$/);
  assert.ok(v.facts.length >= 2 && v.facts.length <= FACT_SLOTS);
  assert.match(v.facts[0], /^5 nights, A\$212,000 estimated profit\.$/);
  assert.match(v.facts[1], /^Losing night: Perth/);
  assert.deepEqual(v.why?.rows.map((r) => r.label), COMPARE_LABELS.filter((l) => l !== "Local taste"), "no all-dash row");
  const fan = v.why!.rows[0];
  assert.equal(fan.chosen, "88");
  assert.equal(fan.skipped, "42");
  assert.equal(fan.chosenBar, 0.88);
  assert.ok(fan.chosenBetter);
  assert.equal(v.why!.rows[3].skipped, "-A$1,200");
  assert.equal(v.why!.rows[4].chosenBetter, false, "shorter travel wins");
  assert.equal(v.details.route.length, ROUTE_SLOTS, "route capped to the fixed slots");
  assert.ok(v.details.route[3].loses);
  assert.match(v.details.route[0].date, /^\w{3}, \w{3} \d+$|^\w{3}, \d+ \w{3}$/);
});

test("view: immutable, cached per example, no vendor or internal words", () => {
  const v = viewOf(base)!;
  assert.equal(viewOf(base), v, "built once");
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.facts) && Object.isFrozen(v.details));
  assert.doesNotMatch(JSON.stringify(v), /Qloo|Claude|Anthropic|fanIndex|heatmap/i);
});

test("view: thin examples still fill the card (no compare, no route)", () => {
  const v = buildExampleView({ ...base, compare: undefined, route: undefined, tourProfit: undefined, losingNight: undefined, profit: { amount: 5000, currency: "EUR", city: "Lyon" } });
  assert.equal(v.why, null);
  assert.equal(v.details.route.length, 0);
  assert.equal(v.facts[0], "Best night: €5,000 estimated profit in Lyon.");
  assert.ok(v.facts.length >= 2, "decision lines top it up to two facts");
});

test("view: a non-route card stays on its own decision (its lines, no city-vs-city table)", () => {
  const v = buildExampleView({ ...base, feature: "offer", decision: { headline: "Walk away politely", lines: ["The Broad offered $11,800 flat", "That nets ~$5,790; the plan expects ~$19,040", "expected profit 5790 vs 16184 needed (85% of the planned 19040)"] } });
  assert.deepEqual(v.facts, ["The Broad offered $11,800 flat", "That nets ~$5,790; the plan expects ~$19,040"]);
  assert.equal(v.why?.kind, "deal", "an offer card explains the deal, not a city pick");
  assert.deepEqual(v.why?.kind === "deal" && v.why.rows.map((r) => r.label), ["The Broad offers", "You'd net", "Plan for this room", "Lowest worth taking"]);
  assert.equal(v.details.lines.length, 0, "no fact repeated in the details");
});

test("view: each kind's why? comes from its own data (counter math, listeners, pace, room)", () => {
  const counter = buildExampleView({ ...base, feature: "offer", decision: { headline: "Counter: $11,880 vs 70% of the door", lines: ["Regent Theater offered $6,200 flat", "That nets ~$5,230; the plan expects ~$12,830", "The counter nets ~$11,105 and still leaves the room its margin"] } });
  assert.equal(counter.headline, "Ask for $11,880 or 70% of ticket sales, whichever pays more");
  assert.ok(counter.why?.kind === "deal" && counter.why.rows.some((r) => r.label === "That nets" && r.value === "~$11,105"));
  const reh = buildExampleView({ ...base, feature: "rehearsal", decision: { headline: "Rehearsal in Boston: “Doors open early. Get there before the first set st…”", lines: ["The scene regular loved line 1: “Yes.”", "The superfan winced at line 1: “No.”", "The local loved line 2: “Maybe.”"] } });
  assert.equal(reh.headline, "Rehearsal in Boston: “Doors open early.”", "only the complete sentence of a cut line");
  assert.equal(reh.facts[0], "2 simulated local listeners reacted: 1 loved it, 1 winced.");
  assert.ok(reh.why?.kind === "personas" && reh.why.line === "Doors open early.", "the why? quotes the line they heard");
  assert.ok(reh.why?.kind === "personas" && reh.why.rows.length === 2 && reh.why.rows[1].who === "Superfan" && reh.why.rows[1].verb === "winced", "only reactions to the quoted line");
  const pace = buildExampleView({ ...base, feature: "pace", decision: { headline: "Seattle: ahead, 93 of 120 sold with 27 days to go", lines: ["On pace for ~120 of 120 planned", "Likely sell-out."] } });
  assert.ok(pace.why?.kind === "ledger" && pace.why.rows[0].value === "93 of 120" && pace.why.rows[0].bar === 93 / 120);
  assert.ok(pace.why?.kind === "ledger" && pace.why.rows[1].label === "Expected by now" && pace.why.rows[1].value === "~32", "120 × 1/(1+27/10)");
  assert.equal(pace.why?.kind === "ledger" && pace.why.title, "Why it's ahead");
});

test("check: a run's total is never shown against one day's room, and every number agrees", async () => {
  const { exampleProblem, reconcileExample } = await import("../../packages/core/src/examples/check.ts");
  const route = [{ name: "Washington", lat: 0, lon: 0, date: "2027-01-28", profit: 80273 }, { name: "Philadelphia", lat: 0, lon: 0, date: "2027-01-29", profit: 80351 }, { name: "New York City", lat: 0, lon: 0, date: "2027-01-30", profit: 80392 }];
  const kaws: HomeExample = { ...base, feature: "venue", act: { name: "KAWS", kind: "visual_artist" }, room: { city: "Philadelphia", name: "ICA", type: "museum", capacity: 400 }, route, tourProfit: { amount: 241016, currency: "USD", nights: 3 }, compare: undefined, losingNight: undefined,
    decision: { headline: "KAWS in Philadelphia: book ICA (~400 seats) over Penn Museum", lines: ["Right size for ~5,600 expected (museum, ~400 seats)", "Best deal: exhibition at $10"] } };
  assert.match(exampleProblem(kaws) ?? "", /hides a 14-days run|expected/);
  const fixed = reconcileExample(kaws);
  assert.equal(exampleProblem(fixed), undefined);
  assert.equal(fixed.decision.lines[0], "Right size for ~5,600 visitors over 14 days (museum, ~400 at a time)");
  const pace = reconcileExample({ ...kaws, feature: "pace", decision: { headline: "Philadelphia: ahead, 2,616 of 5,600 sold with 28 days to go", lines: ["On pace for ~400 of 5,600 planned"] } });
  assert.equal(pace.decision.lines[0], "On pace for ~5,600 of 5,600 planned");
  const pick = { ...base, route: route.map((r) => ({ ...r })), tourProfit: { amount: 241016, currency: "USD", nights: 3 }, losingNight: undefined,
    decision: { headline: "Act from DC: pick Philadelphia over Baltimore, ~$1,000 more per night", lines: ["Philadelphia over Baltimore: 3.8× the fan pull for its size; ~$1,000 more per night."] },
    compare: { line: "Philadelphia over Baltimore: 3.8× the fan pull for its size; ~$1,000 more per night.", currency: "USD", chosen: { ...city("Philadelphia", 90, 81000, 200), lean: 1.84 }, skipped: { ...city("Baltimore", 40, 80000, 60), lean: 0.48 } } };
  assert.ok(exampleProblem(pick), "table and route disagree, × not from the rows");
  const p2 = reconcileExample(pick);
  assert.equal(exampleProblem(p2), undefined);
  assert.equal(p2.compare!.chosen.profit, 80351);
  assert.match(p2.compare!.line, /3\.6× the fan pull for its size; ~\$351 more per night/);
});
