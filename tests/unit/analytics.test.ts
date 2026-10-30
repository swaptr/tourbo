// Insights transforms (apps/web/app/lib/analytics.ts), no network. node --test tests/unit/analytics.test.ts
// Fixtures are hand-written stand-ins.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ageBars, audienceOf, fansByCity, funnel, headline, heat, ideaGrid, legs, mapTakeaway, moneyByNight, pace, takings } from "../../apps/web/app/lib/analytics.ts";

const city = (name: string, lat = 40, lon = -80) => ({ name, region: "na" as const, lat, lon });
const stop = (name: string, score: number, profit?: number, extra: Record<string, unknown> = {}) =>
  ({
    city: city(name),
    score,
    hotspots: [],
    evidence: [],
    thinData: false,
    money:
      profit === undefined
        ? undefined
        : { verdict: "headline", why: "", currency: "USD", deal: "door_split", price: 20, capacity: 300, tickets: 200, sellThrough: 0.66, gross: 4000, artistTake: 2000 + Math.max(0, profit), costs: 2000 - Math.min(0, profit), profit, relDemand: 1, draw: 200, basis: "", estimate: true },
    ...extra,
  }) as any;

const plan = {
  stops: [stop("Chicago", 95, 1300, { date: "2026-12-28" }), stop("Columbus", 38, -200, { date: "2026-12-29" }), stop("Madison", 51, 400, { date: "2027-01-01" })],
  legs: [
    { from: "Chicago", to: "Columbus", km: 444 },
    { from: "Columbus", to: "Madison", km: 700 },
  ],
  totalKm: 1144,
};

test("fans: ranked high to low, takeaway names the leader and the ratio", () => {
  const f = fansByCity(plan);
  assert.deepEqual(f.bars.map((b) => b.city), ["Chicago", "Madison", "Columbus"]);
  assert.match(f.takeaway, /^Chicago has the most fans, about 2\.5× Columbus\.$/);
  assert.equal(fansByCity({ stops: [] }).takeaway, "");
});

test("money: tour order, losing nights named, total over played nights only", () => {
  const m = moneyByNight(plan);
  assert.deepEqual(m.bars.map((b) => b.city), ["Chicago", "Columbus", "Madison"]);
  assert.equal(m.total, 1500);
  assert.equal(m.losing, 1);
  assert.match(m.takeaway, /2 nights make money; Columbus loses money\./);
  const dropped = { stops: plan.stops.map((s: any) => (s.city.name === "Columbus" ? { ...s, money: { ...s.money, verdict: "skip" } } : s)) };
  assert.equal(moneyByNight(dropped).total, 1700, "dropped night left out of the total");
  assert.match(moneyByNight(dropped).takeaway, /^Every night makes money; Chicago/);
  assert.equal(moneyByNight({ stops: [stop("X", 10)] }).bars.length, 0, "no estimate: no bars");
});

test("takings: costs share of what you take, and the loss case", () => {
  const t = takings(plan)!;
  assert.equal(t.take, 3300 + 2000 + 2400);
  assert.equal(t.costs, 2000 + 2200 + 2000);
  assert.match(t.takeaway, /^Costs eat 81% of what you take; you keep \$1,500\.$/);
  const loss = takings({ stops: [stop("A", 10, -500)] })!;
  assert.ok(loss.share > 1);
  assert.match(loss.takeaway, /you pay \$500 more than you earn/);
  assert.equal(takings({ stops: [stop("A", 10)] }), undefined);
});

test("legs: longest hop flagged, days from the show dates, long-day count", () => {
  const l = legs(plan);
  assert.deepEqual(l.bars.map((b) => [b.km, b.days, b.longest]), [[444, 1, false], [700, 3, true]]);
  assert.match(l.takeaway, /^1,144 km in all; the longest hop is Columbus → Madison \(700 km, 3 days\)\.$/);
  const tight = legs({ ...plan, legs: [{ from: "Chicago", to: "Columbus", km: 900 }] });
  assert.match(tight.takeaway, /1 hop is a long day\./);
});

test("pace: plan curve ends at the expected tickets; status from the last check-in", () => {
  const p = pace(plan, [
    { stopIndex: 0, sold: 20, at: "2026-11-28T20:00:00" },
    { stopIndex: 0, sold: 40, at: "2026-12-18T20:00:00" },
  ]);
  assert.equal(p.shows.length, 1);
  const s = p.shows[0];
  assert.equal(s.curve.at(-1)!.days, 0);
  assert.equal(s.curve.at(-1)!.tickets, 200);
  assert.deepEqual(s.sold.map((x) => x.days), [30, 10]);
  assert.equal(s.expectedNow, 100, "10 days out = half the tickets");
  assert.equal(s.status, "well behind");
  assert.match(p.takeaway, /^Chicago is behind the plan/);
  assert.equal(pace(plan, []).shows.length, 0);
});

test("funnel: each stage counts venues that got at least that far", () => {
  const f = funnel([
    { status: "drafted", city: "A" },
    { status: "sent", city: "B" },
    { status: "passed", city: "C" },
    { status: "confirmed", city: "D" },
  ]);
  assert.deepEqual(f.stages.map((s) => s.count), [4, 3, 2, 1]);
  assert.equal(f.passed, 1);
  assert.equal(f.takeaway, "1 of 4 venues confirmed, 1 said no; 1 email isn't sent yet.");
  assert.equal(funnel([]).takeaway, "");
});

test("idea grid: every city's number per idea, best city per row, scale for shading", () => {
  const g = ideaGrid({
    cities: [
      { city: "A", ideas: [{ ref: "X", value: 0.9 } as any] },
      { city: "B", ideas: [] },
      { city: "C", ideas: [] },
    ],
    region: [{ ref: "X", idea: "Cover X", category: "cover", best: [{ city: "A", value: 0.9 }], skip: ["B", "C"], fit: [{ city: "A", value: 0.9 }, { city: "B", value: 0.3 }], line: "", short: "Play X in A.", detail: "", names: [] }],
  });
  assert.deepEqual(g.rows[0].cells, [0.9, 0.3, undefined]);
  assert.equal(g.rows[0].best, 0);
  assert.equal(g.takeaway, "Play X in A.");
  assert.equal(heat(0.3, g.lo, g.hi), 0);
  assert.equal(heat(0.9, g.lo, g.hi), 1);
});

test("audience: age bars in age order, gender line; absent profile = undefined", () => {
  const side = { age: { "24_and_younger": 0.3, "25_to_29": 0.2, "30_to_34": 0, "35_to_44": -0.1, "45_to_54": -0.2, "55_and_older": -0.3 }, gender: { male: -0.1, female: 0.1 }, youth: 0.5, skew: "younger", top: "24_and_younger", blocks: 3 } as any;
  const a = ageBars(side);
  assert.deepEqual(a.bars.map((b) => b.label), ["under 25", "25–29", "30–34", "35–44", "45–54", "55+"]);
  assert.equal(a.takeaway, "Most over-represented: under 25; more women than usual.");
  assert.equal(audienceOf({}), undefined);
  assert.ok(audienceOf({ audience: { act: side, skew: "younger", ages: [], why: [] } }));
});

test("headline + map line", () => {
  assert.deepEqual(headline(plan), { nights: 3, profit: 1500, tickets: 600, currency: "USD", km: 1144 });
  assert.equal(mapTakeaway(plan), "Chicago has the most fans and makes the most money; Columbus loses money.");
});
