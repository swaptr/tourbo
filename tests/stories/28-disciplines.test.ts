// Story 28: every kind of act (singer to supper-club chef) works end to end: rooms to book, show
// notes, ideas per city mapped to real fan-data types, sensible money and a plan request that
// parses. No network: registry, economics and request parsing only.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DISCIPLINES, discipline, spaceLabel } from "../../packages/core/src/disciplines/index.ts";
import { estimateDemand, optimise, legCosts, type Deal } from "../../packages/core/src/engine/economics.ts";
import { ideaPlan } from "../../packages/core/src/engine/ideas.ts";
import { IDEA_CATEGORIES } from "../../packages/core/src/engine/ideas-rank.ts";
import { PARAMS_BY_TYPE } from "../../packages/core/src/qloo/params.ts";
import { PerformerKind, TourParams } from "../../packages/core/src/shared/types.ts";

// Insights entity types listed in qloo-docs available-parameters-by-entity-type.md (+ urn:tag,
// taste-analysis.md), as of 2026-10-30.
const DOC_TYPES = ["urn:entity:artist", "urn:entity:book", "urn:entity:brand", "urn:entity:destination", "urn:entity:movie", "urn:entity:person", "urn:entity:place", "urn:entity:podcast", "urn:entity:tv_show", "urn:entity:video_game", "urn:tag"];
// Place tags: probed 2026-10-29/30 (first eight disciplines) or printed in qloo-docs schema-taxonomy.md.
const PLACE_TAGS = new Set([
  // probed
  "urn:tag:category:place:live_music_venue",
  "urn:tag:category:place:concert_hall",
  "urn:tag:category:place:night_club",
  "urn:tag:category:place:bar",
  "urn:tag:category:place:comedy_club",
  "urn:tag:genre:place:comedy_club",
  "urn:tag:category:place:lounge",
  "urn:tag:genre:place:performing_arts_theater",
  "urn:tag:category:place:dance_school",
  "urn:tag:category:place:cafe",
  "urn:tag:category:place:book_store",
  "urn:tag:category:place:library",
  "urn:tag:category:place:art_gallery",
  "urn:tag:category:place:museum",
  "urn:tag:category:place:restaurant",
  // docs
  "urn:tag:genre:place:tourist_attraction",
  "urn:tag:genre:place:historical_landmark",
  "urn:tag:genre:place:park",
  "urn:tag:genre:place:hotel",
  "urn:tag:genre:place:hotel:wellness",
  "urn:tag:genre:place:restaurant:fine_dining",
  "urn:tag:genre:place:shopping_mall",
]);
const KINDS = PerformerKind.options;
const NEW_KINDS = ["speaker", "magician", "theatre", "photographer", "maker", "busker", "circus", "chef", "filmmaker", "teacher"];

test("every kind of act has one registry record", () => {
  assert.deepEqual(Object.keys(DISCIPLINES).sort(), [...KINDS].sort());
  for (const k of NEW_KINDS) assert.ok(KINDS.includes(k as PerformerKind), k);
  for (const k of KINDS) assert.equal(discipline(k).key, k);
});

test("every discipline has rooms to book, from known place tags", () => {
  for (const d of Object.values(DISCIPLINES)) {
    assert.ok(d.spaces.length >= 3, `${d.key}: at least 3 kinds of space`);
    for (const s of d.spaces) {
      assert.ok(PLACE_TAGS.has(s.tag), `${d.key}: ${s.tag} is a probed or documented place tag`);
      assert.ok(s.capacity > 0 && s.label, d.key);
      assert.equal(spaceLabel(s.tag).length > 0, true);
    }
    assert.ok(d.entityTypes.length && d.entityTypes.every((t) => DOC_TYPES.includes(t)), `${d.key}: resolves as a documented type`);
    assert.ok(DOC_TYPES.includes(d.peerType), d.key);
    assert.ok(d.rooms.length > 40 && /Exclude/.test(d.rooms), `${d.key}: rooms rule says what to exclude`);
  }
});

test("every discipline has show notes, a label, an example and an honest verified line", () => {
  for (const d of Object.values(DISCIPLINES)) {
    assert.ok(d.prep.length > 200, `${d.key}: prep prompt`);
    for (const section of ["opening", "staging", "sponsor", "avoid"]) assert.ok(d.prep.includes(section), `${d.key}: prep has ${section}`);
    assert.ok(d.label && d.noun && d.hint && d.example && d.scene && d.support, d.key);
    assert.ok(d.revenue.length, d.key);
    assert.ok(d.verified.length > 10, d.key);
  }
  // Tile labels are one plain word ("Poet", not "Poet / spoken word"); the hint line carries the range.
  for (const d of Object.values(DISCIPLINES)) {
    assert.match(d.label, /^[A-Z][A-Za-z]+$/, `${d.key}: one-word label`);
    assert.ok(d.hint.length > 0 && d.hint.length <= 40 && d.hint !== d.label, `${d.key}: short hint that adds to the label`);
  }
  for (const k of NEW_KINDS) assert.match(discipline(k as PerformerKind).verified, /not probed/, `${k}: unverified is said plainly`);
});

test("every discipline gets ideas per city, mapped to documented fan-data types", () => {
  for (const d of Object.values(DISCIPLINES)) {
    assert.ok(d.ideas.length >= 2, `${d.key}: at least two idea categories`);
    for (const i of d.ideas) {
      assert.ok(IDEA_CATEGORIES.includes(i.category), `${d.key}: ${i.category}`);
      for (const t of i.types ?? []) assert.ok(DOC_TYPES.includes(t) && t in PARAMS_BY_TYPE, `${d.key}: ${t}`);
      for (const tag of i.tags ?? []) assert.ok(PLACE_TAGS.has(tag), `${d.key}: ${tag}`);
    }
    // The ideas engine turns the record into fan-data calls of documented types.
    const slots = ideaPlan(d.key);
    assert.deepEqual(slots.map((s) => s.category), d.ideas.map((i) => i.category), `${d.key}: engine follows the record`);
    for (const s of slots) for (const src of s.sources) assert.ok(DOC_TYPES.includes(src.type), `${d.key}: ${src.type}`);
  }
  assert.ok(discipline("musician").ideas.some((i) => i.category === "cover") && discipline("musician").setOrder);
  assert.ok(discipline("comedian").crowdWork && discipline("speaker").crowdWork && discipline("magician").crowdWork);
  assert.ok(discipline("chef").ideas.some((i) => i.category === "cuisines"));
  assert.ok(discipline("filmmaker").ideas.some((i) => i.types?.includes("urn:entity:movie")));
  assert.ok(discipline("dancer").ideas.some((i) => i.category === "music") && discipline("circus").ideas.some((i) => i.category === "music"));
});

const money = (kind: PerformerKind, rooms = discipline(kind).spaces.map((s) => ({ name: s.label, capacity: s.capacity }))) =>
  optimise({ region: "na", kind, demand: estimateDemand({ fanIndex: 100, medianFanIndex: 100, roomMin: 60, roomMax: 300 }), rooms, costs: legCosts(300, 2, false) });

test("money: every discipline gets a finite verdict from one of its own deals", () => {
  for (const d of Object.values(DISCIPLINES)) {
    const r = money(d.key);
    const allowed: Deal[] = d.deals ?? ["door_split", "guarantee", "versus", "bar_deal"];
    assert.ok(allowed.includes(r.best.scenario.deal), `${d.key}: ${r.best.scenario.deal}`);
    assert.ok(Number.isFinite(r.best.profit) && Number.isFinite(r.best.costs) && r.why.length, d.key);
    if (d.deals?.includes("workshop")) assert.ok(d.workshop, `${d.key}: workshop terms`);
    if (d.deals?.includes("supper_club")) assert.ok(d.perHeadCost, `${d.key}: food cost`);
    if (d.deals?.includes("tips")) assert.ok(d.tipsPerHead, `${d.key}: tips per head`);
  }
});

test("money: busker has no ticket, teacher sells class seats, chef pays for food", () => {
  const busk = money("busker");
  assert.equal(busk.best.scenario.deal, "tips");
  assert.equal(busk.best.scenario.price, 0);
  assert.equal(busk.best.gross, 0);

  const w = discipline("teacher").workshop!;
  const yoga = money("teacher");
  assert.equal(yoga.best.scenario.deal, "workshop");
  assert.ok(yoga.best.tickets <= w.classSize * w.sessions, "seats capped by class size × sessions");
  assert.ok(yoga.best.scenario.price > 0);

  const chef = money("chef", [{ name: "restaurant", capacity: 50 }]);
  const dinner = [chef.best, ...chef.alternatives].find((o) => o.scenario.deal === "supper_club");
  assert.ok(dinner, "a supper-club option is priced");
  assert.ok(dinner.artistTake < dinner.gross, "food and the space's share come off the take");
});

test("a full plan request parses for every discipline", () => {
  for (const kind of KINDS) {
    const p = TourParams.parse({
      artist: discipline(kind).example,
      kind,
      peers: "A, B",
      styles: discipline(kind).scene,
      region: "eu",
      area: { lat: 51.5, lon: -0.12, radiusKm: 600 },
      shows: 5,
      startDate: "2027-03-01",
      roomMin: 40,
      roomMax: 300,
      money: { crew: 2 },
      jobs: "prep,outreach",
    });
    assert.equal(p.kind, kind);
    assert.deepEqual(p.peers, ["A", "B"]);
  }
});

test("the website offers every discipline unless the env narrows it", async () => {
  if (process.env.DEMO_DISCIPLINES) return; // set locally: the override wins, nothing to check
  const { getWebEnv } = await import("../../apps/web/server/env.server.ts");
  assert.deepEqual(getWebEnv().DEMO_DISCIPLINES, [...KINDS]);
});
