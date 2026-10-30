// "Your plan, your call" (PLAN Q19): edits replayed on Tourbo's plan recompute money, route and
// totals deterministically from the run's own candidates; undo/reset; stable night ids.
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEdits, applyPlanEdits, buildPool, cityOptions, diff, nearbyVenues, overrideFor, preferences, rankWithPrefs, settlePlan, stopKey, venueOptions, type EditRecord, type Pool } from "../../packages/core/src/engine/edit.ts";
import { TourParams, type CityPlan, type Plan, type TraceEvent } from "../../packages/core/src/shared/types.ts";
import { nightItems } from "../../packages/core/src/engine/explain-facts.ts";

const C = {
  Chicago: [41.88, -87.63, 100, 588],
  Milwaukee: [43.04, -87.91, 38, 74],
  Madison: [43.07, -89.4, 50, 54],
  Minneapolis: [44.98, -93.27, 60, 149],
  Columbus: [39.96, -83.0, 37, 84],
  Detroit: [42.33, -83.05, 27, 81],
} as const;
type Name = keyof typeof C;
const city = (n: Name) => ({ name: n, region: "na" as const, lat: C[n][0], lon: C[n][1] });
const venue = (n: Name, i: number, tag = "live_music_venue") => ({ id: `${n}-v${i}`, name: `${n} Room ${i}`, tag: `urn:tag:category:place:${tag}`, lat: C[n][0] + 0.01 * i, lon: C[n][1], affinity: 0.9 - i * 0.1, foundBy: "hotspot 1500m" });
const stop = (n: Name): CityPlan => ({
  city: city(n),
  score: C[n][2],
  fanIndex: C[n][3],
  hotspots: [{ geohash: "x", lat: C[n][0], lon: C[n][1], affinity: 1, popularity: 1 }],
  venue: venue(n, 1),
  backupVenue: venue(n, 2, "bar"),
  capacity: { min: 400, max: 500, estimate: true },
  evidence: [],
  thinData: false,
});
const params = TourParams.parse({ artist: "Test Act", startDate: "2027-03-01", shows: 4, roomMin: 200, roomMax: 800 });
const events: TraceEvent[] = [
  { seq: 1, kind: "decision", message: "Shortlist", data: { scores: Object.fromEntries(Object.entries(C).map(([n, v]) => [n, v[2]])) }, at: "2026-10-30T00:00:00.000Z" },
  ...(["Madison", "Detroit"] as Name[]).map((n, i) => ({ seq: 2 + i, kind: "qloo_call" as const, message: `Heatmap ${n}`, data: { city: n, cells: Math.round(C[n][3] / 0.33) }, at: "2026-10-30T00:00:00.000Z" })),
];
const raw: Plan = { artist: { id: "a", name: "Test Act", kind: "musician", peers: [], tags: [] }, params, stops: (["Chicago", "Milwaukee", "Minneapolis", "Columbus"] as Name[]).map(stop), legs: [], totalKm: 0, medianFanIndex: 80 };
const locate = (n: string) => (n in C ? city(n as Name) : undefined);
const pool0: Pool = buildPool(raw, events, { venues: { Madison: [{ id: "Madison-v1", name: "Madison Hall", roomType: "music venue", defaultCapacityEstimate: 500, lat: 43.07, lon: -89.4 }, { id: "Madison-v2", name: "Madison Bar", roomType: "bar", defaultCapacityEstimate: 120 }] } }, locate);
const ctx = { pool: pool0 };
const base = settlePlan(raw, ctx);
const key = (i: number, p = base) => stopKey(p.stops[i]);

test("base plan: routed dates, legs and totals from the stops", () => {
  assert.equal(base.stops.length, 4);
  assert.equal(base.legs.length, 3);
  assert.ok(base.totalKm > 0);
  assert.equal(base.money!.profit, base.stops.reduce((a, s) => a + s.money!.profit, 0));
  assert.equal(base.stops[0].date, "2027-03-01");
  assert.ok(base.stops.every((s, i) => i === 0 || s.date! > base.stops[i - 1].date!));
});

test("pool: scored cities from the trace, fanIndex scaled from cells when only cells were kept", () => {
  const detroit = pool0.cities.find((c) => c.name === "Detroit")!;
  assert.ok(detroit.fanIndexEstimated);
  assert.ok(Math.abs(detroit.fanIndex - 81) < 15);
  assert.equal(pool0.cities.find((c) => c.name === "Madison")!.venues.length, 2);
  assert.equal(pool0.cities.find((c) => c.name === "Chicago")!.venues.length, 2); // venue + backup from the plan
});

test("swap city: that night's money, the route and totals change; untouched nights keep theirs", () => {
  const { plan, errors } = applyEdits(base, [{ op: "swapCity", night: key(2), city: "Madison" }], ctx);
  assert.deepEqual(errors, []);
  const s = plan.stops[2];
  assert.equal(s.city.name, "Madison");
  assert.equal(s.venue?.name, "Madison Hall");
  assert.equal(s.yours?.suggested?.city, "Minneapolis");
  assert.ok(s.yours?.changed.includes("city"));
  assert.notEqual(plan.totalKm, base.totalKm);
  assert.equal(plan.money!.profit, plan.stops.reduce((a, x) => a + x.money!.profit, 0));
  assert.notEqual(plan.money!.profit, base.money!.profit);
  assert.deepEqual(plan.stops[0].money, base.stops[0].money); // first night: same city, room and leg
  assert.equal(plan.stops[0].date, base.stops[0].date);
  const d = diff(base, plan);
  assert.equal(d.totals.profit, plan.money!.profit - base.money!.profit);
  assert.deepEqual(d.changed, [stopKey(s)]);
  assert.deepEqual(d.removed, [key(2)]);
});

test("swap venue: capacity and money follow the new room", () => {
  const { plan } = applyEdits(base, [{ op: "swapVenue", night: key(1), venueId: "Milwaukee-v2" }], ctx);
  assert.equal(plan.stops[1].venue?.id, "Milwaukee-v2");
  assert.equal(plan.stops[1].money?.capacity, 120); // a bar's default room
  assert.equal(plan.stops[1].backupVenue?.id, "Milwaukee-v1");
  assert.notEqual(plan.stops[1].money?.profit, base.stops[1].money?.profit);
  assert.equal(plan.totalKm, base.totalKm);
  assert.deepEqual(plan.stops[3].money, base.stops[3].money);
});

test("drop, restore, add and reorder keep totals consistent", () => {
  const dropped = applyEdits(base, [{ op: "dropNight", night: key(3) }], ctx).plan;
  assert.equal(dropped.stops[3].money?.verdict, "skip");
  assert.equal(dropped.money!.profit, base.money!.profit - base.stops[3].money!.profit);
  assert.equal(dropped.legs.length, 2);
  const restored = applyEdits(base, [{ op: "dropNight", night: key(3) }, { op: "restoreNight", night: key(3) }], ctx).plan;
  assert.equal(restored.money!.profit, base.money!.profit);
  const added = applyEdits(base, [{ op: "addNight", city: "Detroit" }], ctx).plan;
  assert.equal(added.stops.length, 5);
  assert.ok(added.stops.some((s) => s.city.name === "Detroit" && s.money));
  const moved = applyEdits(base, [{ op: "reorder", night: key(3), to: 1 }], ctx).plan;
  assert.equal(moved.stops[1].city.name, "Columbus");
  assert.equal(moved.stops[0].date, base.stops[0].date);
  assert.ok(moved.stops.every((s, i) => i === 0 || s.date! > moved.stops[i - 1].date!));
});

test("set date pins a night; later nights follow it", () => {
  const { plan } = applyEdits(base, [{ op: "setDate", night: key(1), date: "2027-03-10" }], ctx);
  assert.equal(plan.stops[1].date, "2027-03-10");
  assert.ok(plan.stops[2].date! > "2027-03-10");
});

test("undo and reset: replaying fewer edits gives the earlier plan back", () => {
  const edits = [{ op: "swapCity" as const, night: key(2), city: "Madison" }, { op: "swapVenue" as const, night: key(1), venueId: "Milwaukee-v2" }];
  const two = applyEdits(base, edits, ctx).plan;
  const undone = applyEdits(base, edits.slice(0, 1), ctx).plan;
  assert.notDeepEqual(two.money, undone.money);
  assert.deepEqual(undone.money, applyEdits(base, [edits[0]], ctx).plan.money);
  const reset = applyEdits(base, [], ctx).plan;
  assert.deepEqual(reset.money, base.money);
  assert.deepEqual(reset.stops.map(stopKey), base.stops.map(stopKey));
});

test("stale edits are reported, not thrown", () => {
  const { plan, errors } = applyEdits(base, [{ op: "swapVenue", night: "nowhere~x", venueId: "y" }, { op: "swapCity", night: key(0), city: "Milwaukee" }], ctx);
  assert.equal(errors.length, 2);
  assert.deepEqual(plan.money, base.money);
});

test("stable ids: a night's key is city + room and survives moves", () => {
  assert.equal(key(0), "chicago~Chicago-v1");
  const moved = applyEdits(base, [{ op: "reorder", night: key(0), to: 3 }], ctx).plan;
  assert.equal(stopKey(moved.stops[3]), key(0));
  const swapped = applyEdits(base, [{ op: "swapVenue", night: key(0), venueId: "Chicago-v2" }], ctx).plan;
  assert.equal(stopKey(swapped.stops[0]), "chicago~Chicago-v2");
});

test("alternatives: deltas match applying the swap", () => {
  const opts = cityOptions(base, key(2), ctx);
  assert.ok(opts.length >= 2 && opts.every((o) => !base.stops.some((s) => s.city.name === o.city.name)));
  const m = opts.find((o) => o.city.name === "Madison")!;
  assert.equal(m.profit, applyEdits(base, [{ op: "swapCity", night: key(2), city: "Madison" }], ctx).plan.money!.profit - base.money!.profit);
  const rooms = venueOptions(base, key(1), ctx);
  assert.equal(rooms.filter((r) => r.current).length, 1);
  assert.ok(rooms.some((r) => r.venue.id === "Milwaukee-v2" && r.profit !== 0));
});

test("feedback: two smaller-room picks become a soft preference", () => {
  const e1 = { op: "swapVenue" as const, night: key(1), venueId: "Milwaukee-v2" };
  const p1 = applyEdits(base, [e1], ctx).plan;
  const e2 = { op: "swapVenue" as const, night: key(3), venueId: "Columbus-v2" };
  const p2 = applyEdits(base, [e1, e2], ctx).plan;
  const recs: EditRecord[] = [
    { ...e1, id: "1", when: "", override: overrideFor(base, p1, e1) },
    { ...e2, id: "2", when: "", override: overrideFor(p1, p2, e2) },
  ];
  const prefs = preferences(recs);
  assert.ok(prefs.some((p) => p.id === "smaller_rooms"));
  assert.ok(prefs.some((p) => p.id === "room:bar"));
  assert.deepEqual(preferences(recs, ["smaller_rooms", "room:bar"]).map((p) => p.id).filter((id) => id === "smaller_rooms" || id === "room:bar"), []);
  const ranked = rankWithPrefs([{ profit: 100, km: 0, fans: 1, venue: { id: "a", name: "a", roomType: "music venue", capacity: 500 } }, { profit: 90, km: 0, fans: 1, venue: { id: "b", name: "b", roomType: "bar", capacity: 120 } }], prefs);
  assert.equal(ranked[0].venue.id, "b");
});

test("shared contract: PlanEdits (0-based nights) run through the same engine, with change lines", () => {
  const r = applyPlanEdits(base, [{ op: "swap_city", night: 2, city: "Madison" }, { op: "set_price", night: 0, price: 60 }, { op: "set_room", night: 1, capacity: 250 }, { op: "swap_venue", night: 3, venue: "backup" }], ctx);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.changes, ["Night 3: Minneapolis → Madison", `Chicago: ticket ${base.stops[0].money!.price} → 60`, `Milwaukee: room ${base.stops[1].money!.capacity} → 250`, "Columbus: Columbus Room 1 → Columbus Room 2"]);
  assert.equal(r.plan.stops[0].money!.price, 60);
  assert.equal(r.plan.stops[1].money!.capacity, 250);
  assert.equal(r.plan.money!.profit, r.plan.stops.reduce((a, s) => a + s.money!.profit, 0));
  // Replaying the resolved edits gives the same plan (one write path, one undo stack).
  assert.deepEqual(applyEdits(base, r.edits, ctx).plan.money, r.plan.money);
  // A later leg change keeps the act's fixed price.
  const moved = applyEdits(base, [...r.edits, { op: "reorder", night: stopKey(r.plan.stops[3]), to: 1 }], ctx).plan;
  assert.equal(moved.stops[0].money!.price, 60);
  assert.match(applyPlanEdits(base, [{ op: "drop_night", night: 9 }], ctx).errors[0], /no night 10/);
});

test("a city with no rooms of its own: nearby rooms the run found, and swapping to one recomputes the night", () => {
  // Ann Arbor (~57 km from Detroit) with one room; Detroit has none in the pool.
  const pool: Pool = { ...pool0, cities: [...pool0.cities, { name: "Ann Arbor", lat: 42.28, lon: -83.74, score: 20, fanIndex: 40, thinData: false, hotspots: [], venues: [{ id: "AA-v1", name: "The Ark", roomType: "music venue", capacity: 400, lat: 42.28, lon: -83.74 }] }] };
  const c = { pool };
  const night = stopKey(base.stops[2]);
  const swapped = applyEdits(base, [{ op: "swapCity", night, city: "Detroit" }], c).plan;
  assert.equal(swapped.stops[2].city.name, "Detroit");
  assert.equal(swapped.stops[2].venue, undefined, "no room saved for Detroit");
  const near = nearbyVenues(pool, swapped.stops[2].city);
  assert.deepEqual(near.map((n) => [n.venue.id, n.city]), [["AA-v1", "Ann Arbor"]]);
  assert.ok(near[0].km > 40 && near[0].km <= 60);
  assert.deepEqual(nearbyVenues(pool, swapped.stops[2].city, 30), [], "radius respected");
  const r = applyEdits(base, [{ op: "swapCity", night, city: "Detroit" }, { op: "swapVenue", night: stopKey(swapped.stops[2]), venueId: "AA-v1" }], c);
  assert.deepEqual(r.errors, []);
  const s = r.plan.stops[2];
  assert.equal(s.city.name, "Detroit", "the night stays in Detroit");
  assert.equal(s.venue?.name, "The Ark");
  assert.equal(s.money!.capacity, 400);
  assert.equal(r.plan.money!.profit, r.plan.stops.reduce((a, x) => a + (x.money?.profit ?? 0), 0));
  // A room that's neither in the city nor nearby is refused with one sentence.
  assert.match(applyEdits(swapped, [{ op: "swapVenue", night: stopKey(swapped.stops[2]), venueId: "Chicago-v1" }], c).errors[0]?.error ?? "", /wasn't among the rooms/);
});

test("fact chip after a swap compares the act's pick with Tourbo's suggestion, and other nights keep their comparison", () => {
  const scores = new Map(Object.entries(C).map(([n, v]) => [n, v[2] as number]));
  const before = nightItems(base, scores);
  const swapped = applyEdits(base, [{ op: "swapCity", night: stopKey(base.stops[1]), city: "Detroit" }], ctx).plan;
  const after = nightItems(swapped, scores);
  const d = after[1];
  assert.equal(d.subject, "Detroit");
  assert.equal(d.other, "Milwaukee", "compared with the city Tourbo suggested for that night");
  assert.equal(d.chip?.text, "fans 27 here vs 38 in Milwaukee");
  assert.equal(d.chip?.hedged, true, "a weaker pick is shown hedged, never as a strength");
  assert.equal(d.evidence, "some", "no written why-line for the act's own pick");
  assert.ok(!/concentrated/.test(d.chip!.text));
  // The swapped-out city isn't "the next-best city" for the other nights.
  for (const i of [0, 2, 3]) assert.notEqual(after[i].other, "Milwaukee");
  assert.equal(after[0].other, before[0].other === "Detroit" ? "Madison" : before[0].other);
});

test("an edit from outside the act (a venue passed) replays like any edit and teaches no preference", () => {
  const e = { op: "swapVenue" as const, night: stopKey(base.stops[0]), venueId: "Chicago-v2" };
  const recs: EditRecord[] = [{ ...e, id: "1", when: "", source: "venue passed" }];
  const p = applyEdits(base, recs, ctx).plan;
  assert.equal(p.stops[0].venue?.id, "Chicago-v2");
  // A later edit keeps it.
  const later = applyEdits(base, [...recs, { op: "setPrice", night: stopKey(p.stops[1]), price: 30 }], ctx).plan;
  assert.equal(later.stops[0].venue?.id, "Chicago-v2");
  assert.deepEqual(preferences([...recs, { ...recs[0], id: "2" }]), []);
});
