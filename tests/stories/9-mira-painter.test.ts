// Story 9: Mira paints. She isn't on Qloo; the same tools plan a gallery run from the fans of
// artists she's compared to, with longer stays and sales on top of entry.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(() => m.close());

let act: { id: string; peers: { id: string }[] };

test("Mira: every discipline is listed with how it maps to Qloo", async () => {
  const r = await m.call("tourbo_disciplines", {});
  const keys = r.disciplines.map((d: { key: string }) => d.key);
  for (const k of ["musician", "comedian", "dj", "dancer", "poet", "visual_artist", "author", "podcaster"]) assert.ok(keys.includes(k), k);
  const painter = r.disciplines.find((d: { key: string }) => d.key === "visual_artist");
  assert.ok(painter.spaces.includes("gallery"));
  assert.ok(painter.stayDays > 1);
});

test("Mira: not in Qloo, planned from a comparable artist", async () => {
  const r = await m.call("tourbo_resolve_act", { name: "Mira Okafor", kind: "visual_artist", peers: ["Banksy"] });
  assert.equal(r.found, true);
  assert.equal(r.unknown, true);
  assert.equal(r.kind, "visual_artist");
  act = r;
});

test("Mira: London spaces are galleries and museums, never clubs", async () => {
  const r = await m.call("tourbo_city_detail", { act_id: act.id, peer_ids: act.peers.map((p) => p.id), kind: "visual_artist", region: "eu", city: "London" });
  assert.ok(r.venues.length >= 3);
  const types = new Set(r.venues.map((v: { roomType: string }) => v.roomType));
  assert.ok(types.has("gallery") || types.has("museum"), [...types].join(","));
  assert.ok(![...types].some((t) => t === "club" || t === "comedy club"));
});

test("Mira: exhibitions stay about two weeks per city", async () => {
  const r = await m.call("tourbo_route", { region: "eu", cities: ["London", "Amsterdam", "Berlin"], start_date: "2027-03-01", kind: "visual_artist" });
  const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
  for (let i = 1; i < r.stops.length; i++) assert.ok(days(r.stops[i - 1].date, r.stops[i].date) >= 13);
});

test("Mira: money counts sales per visitor, not just entry", async () => {
  const args = { region: "eu", city: "London", fan_index: 100, median_fan_index: 100, rooms: [{ name: "Gallery", capacity: 150 }], ticket_price: 8, opener: false };
  const painter = await m.call("tourbo_show_economics", { ...args, kind: "visual_artist" });
  const band = await m.call("tourbo_show_economics", { ...args, kind: "musician" });
  assert.ok(painter.best.artistTake > band.best.artistTake, `${painter.best.artistTake} vs ${band.best.artistTake}`);
});

test("Mira: a gallery run beats a one-night door deal, and a mural commission is offered as an alternative", async () => {
  const r = await m.call("tourbo_show_economics", { region: "eu", kind: "visual_artist", city: "London", fan_index: 120, median_fan_index: 100, rooms: [{ name: "Gallery", capacity: 150 }], opener: false, crew: 1 });
  assert.equal(r.best.scenario.deal, "exhibition");
  assert.ok(r.alternatives.some((a: { scenario: { deal: string } }) => a.scenario.deal === "commission"));
});
