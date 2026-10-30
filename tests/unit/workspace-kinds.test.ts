// Tabs by kind (surface brief app-routes-plan-id-tsx.md "## Tabs by kind"): every kind's workspace
// config is valid, Plan always leads, hidden tabs never render, labels are single plain words.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DISCIPLINES, KIND_TABS, NIGHT_TAB_IDS, SHARED_TABS, TOUR_TAB_IDS, nightTabLabel, tabHasData, tabLabel, workspaceFor, workspaceTabs, type TourTabId } from "../../packages/core/src/disciplines/index.ts";
import { MATERIAL_TYPES, defaultType } from "../../packages/core/src/material/material.ts";
import { PerformerKind } from "../../packages/core/src/shared/types.ts";

const KINDS = PerformerKind.options;
const ALL = new Set<string>(TOUR_TAB_IDS);
const VENDOR = /qloo|claude|anthropic|openai|\bai\b|llm|api/i;

// A plan rich enough for every kind tab to have data.
const full = {
  stops: [
    { opener: { id: "o", name: "Local Act", localCells: 3, source: "local" }, localArtists: [{ name: "Other", type: "artist" }], money: { deal: "exhibition", verdict: "headline" }, place: { tone: { points: 1 } } },
    { money: { deal: "workshop", verdict: "headline" } },
    { money: { deal: "tips", verdict: "headline" } },
  ],
};
const bare = { stops: [{ money: { deal: "door_split", verdict: "headline" } }] };
const counts = { covers: 3, questions: 2 };

test("every kind has a workspace with known tab ids, Plan first, no duplicates", () => {
  for (const k of KINDS) {
    const w = workspaceFor(k);
    assert.equal(DISCIPLINES[k].workspace, w, `${k}: record holds its workspace`);
    const tabs = [...w.main, ...w.more];
    for (const t of tabs) assert.ok(ALL.has(t), `${k}: unknown tab ${t}`);
    assert.equal(w.main[0], "plan", `${k}: Plan leads`);
    assert.equal(new Set(tabs).size, tabs.length, `${k}: a tab listed twice`);
    assert.ok(!tabs.includes("tonight"), `${k}: Tonight is added on the road, not listed`);
    for (const t of ["ideas", "set", "prep", "insights"] as const) assert.ok(tabs.includes(t), `${k}: shared tab ${t}`);
    if (w.road) assert.ok(w.more.includes(w.road), `${k}: road tab ${w.road} sits under More`);
    for (const l of Object.keys(w.labels)) assert.ok(ALL.has(l), `${k}: label for unknown tab ${l}`);
    assert.deepEqual([...w.night].sort(), [...NIGHT_TAB_IDS].sort(), `${k}: night panel has Room · Ideas · Set · Notes`);
  }
});

test("labels are single plain words, vendor-neutral", () => {
  for (const k of KINDS) {
    const w = workspaceFor(k);
    for (const t of TOUR_TAB_IDS) {
      const l = tabLabel(w, t);
      assert.match(l, /^[A-Z][a-z]+$/, `${k}: tab ${t} label "${l}" is one capitalised word`);
      assert.doesNotMatch(l, VENDOR);
    }
    for (const t of NIGHT_TAB_IDS) assert.match(nightTabLabel(w, t), /^[A-Z][a-z]+$/, `${k}: night tab ${t}`);
    assert.doesNotMatch(JSON.stringify(w), VENDOR, `${k}: no vendor names`);
  }
});

test("Library nouns and types: plain, known types, default type first", () => {
  for (const k of KINDS) {
    const w = workspaceFor(k);
    assert.match(w.item[0], /^[a-z]+$/);
    assert.match(w.item[1], /^[a-z]+$/);
    assert.ok(w.types.length >= 2 && w.types.includes("other"), `${k}: types end with Other`);
    for (const t of w.types) assert.ok((MATERIAL_TYPES as readonly string[]).includes(t), `${k}: type ${t}`);
    for (const [t, l] of Object.entries(w.typeLabels ?? {})) {
      assert.ok(w.types.includes(t as never), `${k}: label for a type it doesn't offer (${t})`);
      assert.match(l!, /^[A-Z][A-Za-z&]+$/);
    }
    assert.equal(defaultType(k), w.types[0]);
    assert.ok(w.event.start && w.event.end && w.event.venue && w.event.hint.endsWith("."), `${k}: event hints`);
  }
});

test("hidden tabs never render, whatever the data", () => {
  for (const k of KINDS) {
    const w = workspaceFor(k);
    const listed = new Set<TourTabId>([...w.main, ...w.more, "tonight"]);
    for (const onRoad of [false, true]) {
      const { main, more } = workspaceTabs(w, { plan: full, counts, hasBaseline: true, onRoad });
      for (const t of [...main, ...more]) assert.ok(listed.has(t), `${k}: ${t} renders but isn't listed`);
      assert.equal(main[onRoad ? 1 : 0], "plan");
      if (onRoad) assert.equal(main[0], "tonight");
    }
  }
  // The headline cases from the audit.
  const busker = workspaceTabs(workspaceFor("busker"), { plan: full, counts, hasBaseline: true });
  assert.ok(![...busker.main, ...busker.more].includes("live"), "no Tickets for a busker");
  assert.equal(tabLabel(workspaceFor("busker"), "pipeline"), "Permits");
  assert.equal(workspaceFor("visual_artist").support, false, "no opener for a painter");
  assert.ok(![...workspaceFor("visual_artist").main, ...workspaceFor("visual_artist").more].includes("openers"));
  assert.equal(tabLabel(workspaceFor("chef"), "set"), "Menu");
  assert.equal(tabLabel(workspaceFor("teacher"), "set"), "Class");
  assert.equal(tabLabel(workspaceFor("visual_artist"), "set"), "Hang");
});

test("kind tabs show only with data; shared tabs always", () => {
  for (const t of KIND_TABS) {
    assert.equal(tabHasData(t, full, counts), true, `${t} with data`);
    assert.equal(tabHasData(t, bare, {}), false, `${t} without data stays hidden`);
  }
  for (const t of SHARED_TABS) assert.equal(tabHasData(t, bare, {}), true);
  // A skipped night doesn't count.
  assert.equal(tabHasData("sales", { stops: [{ money: { deal: "exhibition", verdict: "skip" } }] }), false);
  // Compare needs a baseline.
  const m = workspaceTabs(workspaceFor("musician"), { plan: bare, hasBaseline: false });
  assert.ok(![...m.main, ...m.more].includes("compare"));
});

test("on the road the kind's road tab takes Booking's slot", () => {
  const road = (k: PerformerKind) => workspaceTabs(workspaceFor(k), { plan: full, counts, hasBaseline: true, onRoad: true });
  assert.ok(road("musician").main.includes("live") && road("musician").more.includes("pipeline"));
  assert.ok(road("teacher").main.includes("sessions") && road("teacher").main.includes("pipeline"), "teacher: Sessions already leads");
  assert.ok(road("visual_artist").main.includes("sales"));
  assert.ok(road("busker").main.includes("pitches"));
});

test("musician and comedian get their own tabs first", () => {
  assert.ok(workspaceFor("musician").main.includes("covers"));
  assert.ok(workspaceFor("musician").more.includes("openers"));
  assert.ok(workspaceFor("comedian").main.includes("crowd"));
  assert.ok(workspaceFor("comedian").more.includes("tone"));
  assert.equal(workspaceFor("nope"), workspaceFor("musician"));
});

test("Library details per kind: known fields, the set style's fields, valid shapes", async () => {
  const { MaterialDetails, MaterialFields } = await import("../../packages/core/src/material/material.ts");
  const known = Object.keys(MaterialDetails.shape);
  for (const k of KINDS) for (const f of workspaceFor(k).fields) assert.ok(known.includes(f), `${k}: unknown detail ${f}`);
  assert.deepEqual(workspaceFor("musician").fields, ["key", "bpm", "energy"]);
  assert.deepEqual(workspaceFor("comedian").fields, ["marker"]);
  assert.deepEqual(workspaceFor("visual_artist").fields, ["size", "price"]);
  assert.ok(workspaceFor("chef").fields.includes("course"));
  assert.deepEqual(workspaceFor("teacher").fields, ["part"]);
  const ok = MaterialFields.safeParse({ title: "Harbour Lights", type: "song", details: { key: "Am", bpm: 96, energy: 4 } });
  assert.ok(ok.success);
  assert.equal(MaterialFields.safeParse({ title: "x", type: "song", details: { energy: 9 } }).success, false);
  assert.equal(MaterialFields.safeParse({ title: "x", type: "piece", details: { course: "brunch" } }).success, false);
  assert.ok(MaterialFields.safeParse({ title: "Old song", type: "song" }).success, "details stay optional");
});

test("shows for classes take sessions and seats; other kinds don't ask", async () => {
  const { EventFields } = await import("../../packages/core/src/events/event.ts");
  for (const k of ["teacher", "maker", "chef", "dancer", "circus"] as const) assert.ok(workspaceFor(k).event.classes, `${k} asks for sessions and seats`);
  for (const k of ["musician", "comedian", "visual_artist", "busker"] as const) assert.equal(workspaceFor(k).event.classes, undefined);
  assert.equal(workspaceFor("chef").event.classes?.sessions, "Seatings");
  const base = { title: "Clay day", artist: "A", kind: "maker", city: { name: "Chicago", lat: 41.9, lon: -87.6 } };
  assert.deepEqual(EventFields.parse({ ...base, classes: { sessions: 2, seats: 12 } }).classes, { sessions: 2, seats: 12 });
  assert.equal(EventFields.safeParse({ ...base, classes: { seats: 0 } }).success, false);
  assert.equal(EventFields.parse(base).classes, undefined);
});
