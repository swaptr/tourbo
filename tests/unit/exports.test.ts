// Export tools (PLAN §18 Q13): iCalendar (RFC 5545) and markdown on fixtures, no network.
// node --test tests/unit/exports.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeText, eventUid, fold, localToUtc, toIcs } from "../../packages/mcp/src/extra/ics.ts";
import { planMarkdown } from "../../packages/mcp/src/extra/markdown.ts";
import { planInput } from "../../packages/mcp/src/tourbo/plan-input.ts";
import { projectMarkdown } from "../../packages/core/src/projects/projects.server.ts";
import { fixturePlan } from "./_plan-fixture.ts";

const NOW = new Date("2026-10-30T12:00:00Z");
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

test("ics: local show time converts to UTC with the city's zone, across DST", () => {
  // Chicago: CST (UTC−6) in January, CDT (UTC−5) in July.
  assert.equal(new Date(localToUtc("2027-01-15", "20:00", "America/Chicago")).toISOString(), "2027-01-16T02:00:00.000Z");
  assert.equal(new Date(localToUtc("2027-07-15", "20:00", "America/Chicago")).toISOString(), "2027-07-16T01:00:00.000Z");
  assert.equal(new Date(localToUtc("2027-03-01", "19:30", "Asia/Kolkata")).toISOString(), "2027-03-01T14:00:00.000Z");
});

test("ics: a valid calendar with one event per show", () => {
  const ics = toIcs(
    [
      { date: "2027-03-01", city: "Chicago", title: "Maya: Chicago at Thalia Hall", start: "20:00", minutes: 120, timezone: "America/Chicago", venue: "Thalia Hall", address: "1807 S Allport St, Chicago", lat: 41.857, lon: -87.657, description: "Doors 19:00; load-in 16:00" },
      { date: "2027-03-02", city: "Milwaukee", title: "Maya: Milwaukee", start: "23:30", minutes: 90 }, // no zone: floating, ends next day
      { date: "2027-03-04", city: "Detroit", title: "Maya: Detroit", allDay: true },
    ],
    { name: "Maya tour", now: NOW },
  );
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n/, "CRLF line endings only");
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `folded: ${line}`);
  const flat = unfold(ics);
  assert.equal(flat.match(/BEGIN:VEVENT/g)?.length, 3);
  assert.equal(flat.match(/DTSTAMP:20261030T120000Z/g)?.length, 3);
  assert.match(flat, /DTSTART:20270302T020000Z\r\nDTEND:20270302T040000Z/);
  assert.match(flat, /LOCATION:Thalia Hall\\, 1807 S Allport St\\, Chicago\\, Chicago/);
  assert.match(flat, /GEO:41\.857000;-87\.657000/);
  assert.match(flat, /DESCRIPTION:Doors 19:00\\; load-in 16:00\\nStarts 20:00 local time \(America\/Chicago\)\./);
  assert.match(flat, /DTSTART:20270302T233000\r\nDTEND:20270303T010000\r\n/, "floating time rolls past midnight");
  assert.match(flat, /DTSTART;VALUE=DATE:20270304\r\nDTEND;VALUE=DATE:20270305/);
  const uids = flat.match(/UID:[^\r]+/g)!;
  assert.equal(new Set(uids).size, 3, "unique UIDs");
  assert.equal(eventUid({ date: "2027-03-01", city: "Chicago", title: "Maya: Chicago at Thalia Hall" }), uids[0].slice(4), "stable UID");
});

test("ics: text escaping and folding keep UTF-8 intact", () => {
  assert.equal(escapeText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
  const long = `SUMMARY:${"Ölçü ".repeat(30)}`;
  const folded = fold(long);
  for (const l of folded.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), long);
});

test("markdown: a plan lists every night, money and route", () => {
  const plan = fixturePlan();
  const md = planMarkdown(plan, { url: "https://tourbo.example/plan/abc" });
  assert.match(md, new RegExp(`^# ${plan.artist.name}: ${plan.stops.length}-night tour`));
  for (const s of plan.stops) assert.ok(md.includes(`| ${s.city.name} |`), s.city.name);
  assert.match(md, /## Route/);
  assert.match(md, /Plan: https:\/\/tourbo\.example\/plan\/abc/);
  assert.match(md, /estimates/);
});

test("markdown: projects reuse projectMarkdown", () => {
  const md = projectMarkdown({
    id: "p1",
    title: "Spring run",
    artist: "Maya",
    kind: "musician",
    createdAt: "2026-10-30T00:00:00Z",
    items: [
      { id: "i1", kind: "todo", text: "Send tech rider", city: "Chicago", done: true, createdAt: "2026-10-30T00:00:00Z" },
      { id: "i2", kind: "note", text: "Bring merch", done: false, createdAt: "2026-10-30T00:00:00Z" },
    ],
    runs: [{ id: "r1", artistName: "Maya", status: "done", createdAt: "2026-10-30T00:00:00Z", stops: 2, cities: ["Chicago", "Detroit"] }],
  });
  assert.match(md, /^# Spring run\nAct: Maya \(musician\)/);
  assert.match(md, /- \[x\] \*\*Chicago:\*\* Send tech rider/);
  assert.match(md, /Chicago → Detroit/);
});

test("plan input: tourbo_plan_tour's compact money parses; junk is one plain sentence", () => {
  const plan = fixturePlan();
  const compact = {
    ...plan,
    stops: plan.stops.map((s) => ({ ...s, money: { verdict: s.money!.verdict, why: "x", currency: "USD", best: { scenario: { deal: "door_split", price: 20, capacity: 300 }, tickets: 200, sellThrough: 0.66, gross: 4000, artistTake: 3000, costs: 1000, profit: 2000 } } })),
  };
  assert.equal(planInput(compact).stops[0].money?.profit, 2000);
  assert.throws(() => planInput({ nope: true }), /^Error: That plan isn't in the expected shape/);
});
