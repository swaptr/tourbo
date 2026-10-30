import assert from "node:assert/strict";
import { test } from "node:test";

import { applyQuery, counts, isArchived, parseQuery, phaseOf, queryToParams, DEFAULT_QUERY, type Query, type WorkRow } from "../../apps/web/app/lib/workspace.ts";
import { EventFields, dateRange, days } from "../../packages/core/src/events/event.ts";

const DAY = "2027-03-10";
const row = (p: Partial<WorkRow>): WorkRow => ({ type: "tour", id: p.title ?? "x", title: "x", status: "done", nights: 4, cities: [], archived: null, createdAt: "2026-10-01T00:00:00Z", owned: true, ...p });
const q = (p: Partial<Query> = {}): Query => ({ ...DEFAULT_QUERY, ...p });

test("phase: draft until planned, then by dates", () => {
  assert.equal(phaseOf(row({ status: "running" }), DAY), "draft");
  assert.equal(phaseOf(row({ status: "failed", firstDate: "2027-01-01", lastDate: "2027-01-05" }), DAY), "draft");
  assert.equal(phaseOf(row({ firstDate: "2027-04-01", lastDate: "2027-04-06" }), DAY), "planned");
  assert.equal(phaseOf(row({ firstDate: "2027-03-08", lastDate: "2027-03-12" }), DAY), "on_the_road");
  assert.equal(phaseOf(row({ firstDate: "2027-03-01", lastDate: "2027-03-09" }), DAY), "past");
  assert.equal(phaseOf(row({ type: "event", status: "saved" }), DAY), "draft", "an event without a date is a draft");
});

test("auto-archive once the last date has passed; hand choice wins; restore brings it back", () => {
  const past = row({ firstDate: "2027-02-01", lastDate: "2027-02-05" });
  assert.ok(isArchived(past, DAY));
  assert.ok(!isArchived({ ...past, archived: false }, DAY), "restored stays active");
  assert.ok(isArchived(row({ firstDate: "2027-05-01", lastDate: "2027-05-02", archived: true }), DAY), "archived by hand");
  assert.ok(!isArchived(row({ status: "running" }), DAY));
});

test("range-based archiving: a 3-day event stays active through its last day, archives the day after", () => {
  const ev = row({ type: "event", status: "saved", firstDate: "2027-03-08", lastDate: "2027-03-10" });
  assert.equal(phaseOf(ev, "2027-03-08"), "on_the_road");
  assert.ok(!isArchived(ev, "2027-03-10"));
  assert.ok(isArchived(ev, "2027-03-11"));
  // Upcoming / past filters use the range too.
  const upcoming = q({ section: "events", when: "upcoming" });
  assert.equal(applyQuery([ev], upcoming, "2027-03-09").length, 1, "mid-event counts as upcoming");
  assert.equal(applyQuery([ev], { ...upcoming, view: "archived", when: "past" }, "2027-03-11").length, 1);
});

test("event fields: end defaults to start, end before start is refused in plain words", () => {
  const base = { title: "Show", artist: "Maya", kind: "visual_artist", city: { name: "Porto", lat: 41.1, lon: -8.6 } };
  assert.equal(EventFields.parse({ ...base, startDate: "2027-05-01" }).endDate, "2027-05-01");
  assert.equal(EventFields.parse(base).endDate, undefined, "drafts need no dates");
  const bad = EventFields.safeParse({ ...base, startDate: "2027-05-03", endDate: "2027-05-01" });
  assert.ok(!bad.success);
  assert.equal(bad.error.issues[0].message, "The last day can't be before the first day.");
  assert.equal(days("2027-05-01", "2027-05-03"), 3);
  assert.match(dateRange("2027-05-01", "2027-05-03"), /1 May – 3 May 2027/);
  assert.equal(dateRange(), "No date yet");
});

test("sort by date (start), name, profit, nights; missing values last", () => {
  const rows = [
    row({ title: "B", firstDate: "2027-05-01", lastDate: "2027-05-04", profit: 100, nights: 3 }),
    row({ title: "a", firstDate: "2027-04-01", lastDate: "2027-04-09", profit: 900, nights: 8 }),
    row({ title: "C", status: "running", nights: 5 }),
  ];
  const names = (x: WorkRow[]) => x.map((r) => r.title).join("");
  assert.equal(names(applyQuery(rows, q(), DAY)), "aBC");
  assert.equal(names(applyQuery(rows, q({ sort: "name", dir: "asc" }), DAY)), "aBC");
  assert.equal(names(applyQuery(rows, q({ sort: "profit", dir: "desc" }), DAY)), "aBC");
  assert.equal(names(applyQuery(rows, q({ sort: "profit", dir: "asc" }), DAY)), "BaC", "no profit yet sorts last either way");
  assert.equal(names(applyQuery(rows, q({ sort: "nights", dir: "desc" }), DAY)), "aCB");
});

test("filter by status, type, kind, region, search; sections split tours and events", () => {
  const rows = [
    row({ title: "Spring run", kind: "musician", region: "na", cities: ["Chicago", "Detroit"], firstDate: "2027-04-01", lastDate: "2027-04-05" }),
    row({ title: "Comedy week", kind: "comedian", region: "eu", cities: ["Porto"], status: "running" }),
    row({ type: "project", title: "Notebook", status: "saved" }),
    row({ type: "event", title: "Gallery", status: "saved", venue: "Rua Gallery", firstDate: "2027-04-02", lastDate: "2027-04-20" }),
  ];
  const t = (x: Partial<Query>) => applyQuery(rows, q(x), DAY).map((r) => r.title);
  assert.deepEqual(t({}).sort(), ["Comedy week", "Notebook", "Spring run"]);
  assert.deepEqual(t({ phase: "draft" }).sort(), ["Comedy week", "Notebook"]);
  assert.deepEqual(t({ type: "project" }), ["Notebook"]);
  assert.deepEqual(t({ kind: "comedian" }), ["Comedy week"]);
  assert.deepEqual(t({ region: "na" }), ["Spring run"]);
  assert.deepEqual(t({ q: "detroit" }), ["Spring run"]);
  assert.deepEqual(t({ section: "events", q: "rua" }), ["Gallery"]);
  assert.deepEqual(counts(rows, "events", DAY), { active: 1, archived: 0 });
});

test("query round-trips through the URL; defaults stay out of it", () => {
  assert.equal(queryToParams(DEFAULT_QUERY).toString(), "");
  const full = q({ section: "events", view: "archived", q: "porto", phase: "past", type: "event", kind: "comedian", region: "eu", when: "past", sort: "profit", dir: "asc" });
  assert.deepEqual(parseQuery(queryToParams(full)), full);
  assert.equal(queryToParams(parseQuery(new URLSearchParams("sort=bogus&status=nope&dir=up&when=soon"))).toString(), "", "junk falls back to defaults");
});

test("home base search: any town by prefix, offline (seed list without the world table)", async () => {
  const { searchTowns } = await import("@tourbo/core/engine/cities.ts");
  assert.equal(searchTowns("c").length, 0, "needs two letters");
  const hits = searchTowns("chic");
  assert.equal(hits[0]?.name, "Chicago");
});
