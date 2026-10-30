import assert from "node:assert/strict";
import { test } from "node:test";

import { homeReduce, initialHome, inspectShownId, globeFocusId, nextDeadline, INSPECT_GRACE_MS, RESUME_MS, SWAP_MIN_MS, type HomeEvent, type HomeState } from "../../apps/web/app/lib/globe-model.ts";

const D = 7500;
const ids = ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8", "i9"];
function run(start = 0) {
  let s: HomeState = homeReduce(initialHome(start), { type: "INIT", ids, dur: D, reduced: false }, start);
  let now = start;
  const log: HomeState[] = [];
  const at = (t: number, e?: HomeEvent) => {
    // The store ticks every frame; emulate 16 ms frames up to t.
    for (; now + 16 < t; now += 16) log.push((s = homeReduce(s, { type: "TICK" }, now + 16)));
    now = t;
    s = homeReduce(s, e ?? { type: "TICK" }, t);
    log.push(s);
    return s;
  };
  return { at, get s() { return s; }, log };
}

test("store: the story advances on the clock; inspect follows it while idle", () => {
  const r = run();
  assert.equal(r.s.story.id, "a1");
  assert.equal(inspectShownId(r.s), "a1");
  r.at(D + 20);
  assert.equal(r.s.story.id, "b2");
  assert.equal(inspectShownId(r.s), "b2");
});

test("store: an advance due during inspect waits until inspect is idle, then fires once", () => {
  const r = run();
  r.at(500, { type: "HOVER", id: "e5" });
  assert.equal(inspectShownId(r.s), "e5");
  const storyV = r.s.story.version, inspectV = r.s.inspect.version;
  r.at(20_000);
  assert.equal(r.s.story.id, "a1", "story frozen while inspecting");
  assert.equal(r.s.story.version, storyV);
  assert.equal(r.s.inspect.version, inspectV, "the advance never touches inspect");
  r.at(20_000, { type: "HOVER", id: null, from: "e5" });
  r.at(20_000 + INSPECT_GRACE_MS - 20);
  assert.equal(inspectShownId(r.s), "e5", "grace keeps it");
  r.at(20_000 + INSPECT_GRACE_MS + 20);
  assert.equal(r.s.inspect.id, null, "back to the story");
  assert.equal(r.s.story.id, "a1", "and the story resumes from its time left, not instantly");
  // 500 ms ran before the hover; resume after grace + RESUME_MS, then 7000 ms left.
  const resume = 20_000 + INSPECT_GRACE_MS + RESUME_MS;
  r.at(resume + 6900);
  assert.equal(r.s.story.id, "a1");
  r.at(resume + 7100);
  assert.equal(r.s.story.id, "b2");
  r.at(resume + 7200);
  assert.equal(r.s.story.id, "b2", "fired once");
});

test("store: leave A and enter B within 50 ms → B shows; A's late leave is ignored", () => {
  const r = run();
  r.at(1000, { type: "HOVER", id: "c3" });
  r.at(2000, { type: "HOVER", id: null, from: "c3" });
  r.at(2030, { type: "HOVER", id: "d4" });
  r.at(2040, { type: "HOVER", id: null, from: "c3" }); // late
  r.at(2400);
  assert.equal(r.s.inspect.id, "d4");
  assert.equal(r.s.inspect.target, "d4");
});

test("store: sweeping 8 markers in 1 s and back: ≤ 1 swap per 150 ms, last wins, story never changes", () => {
  const r = run();
  const story0 = r.s.story;
  const sweep = [...ids.slice(1, 9), ...ids.slice(1, 9).reverse()];
  sweep.forEach((id, k) => r.at(1000 + k * 62, { type: "HOVER", id }));
  r.at(1000 + sweep.length * 62 + 300);
  const swaps: number[] = [];
  let v = -1, t = 0;
  for (const s of r.log) {
    if (s.inspect.version !== v && v !== -1) swaps.push(t);
    v = s.inspect.version;
    t = s.playback.at;
  }
  for (let k = 1; k < swaps.length; k++) assert.ok(swaps[k] - swaps[k - 1] >= SWAP_MIN_MS - 16, `swap gap ${swaps[k] - swaps[k - 1]} ms`);
  assert.equal(r.s.inspect.id, sweep.at(-1), "final panel shows the last marker");
  assert.ok(r.log.every((s) => s.story === story0 || s.story.id === story0.id), "story card never changes during a sweep");
});

test("store: leave and re-enter within 300 ms never falls back to the story", () => {
  const r = run();
  r.at(1000, { type: "HOVER", id: "f6" });
  r.at(1500, { type: "HOVER", id: null, from: "f6" });
  r.at(1790, { type: "HOVER", id: "f6" });
  r.at(3000);
  assert.ok(r.log.filter((s) => s.playback.at >= 1000).every((s) => s.inspect.id === "f6"), "never closed");
});

test("store: rapid hover in/out across an advance boundary never shows a wrong example", () => {
  const r = run();
  const seen = new Set<string | null>();
  for (let k = 0; k < 60; k++) {
    const t = 6000 + k * 50;
    r.at(t, k % 2 ? { type: "HOVER", id: null, from: "g7" } : { type: "HOVER", id: "g7" });
    seen.add(r.s.inspect.id);
    assert.ok(r.s.inspect.id === null || r.s.inspect.id === "g7");
    assert.equal(r.s.story.id, "a1", "no advance mid-toggling");
  }
  assert.ok(seen.has("g7"));
});

test("store: tap pins (hover can't steal it), close returns to the story; globe follows the owner", () => {
  const r = run();
  r.at(1000, { type: "TAP", id: "h8" });
  assert.equal(globeFocusId(r.s), "h8");
  assert.equal(r.s.inspect.mode, "expanded");
  r.at(1300, { type: "HOVER", id: "c3" });
  assert.equal(r.s.inspect.id, "h8");
  r.at(1400, { type: "CLOSE" });
  r.at(1600);
  assert.equal(r.s.inspect.id, null);
  assert.equal(globeFocusId(r.s), "a1");
});

test("store: Next works while the pointer is over the dialog, and ends any inspect", () => {
  const r = run();
  r.at(300, { type: "PANEL", over: true }); // pointer moves onto the dialog to press Next
  r.at(320, { type: "GOTO", index: 1 });
  assert.equal(r.s.story.id, "b2", "Next moves the story while hovering the dialog");
  r.at(900, { type: "GOTO", index: 2 });
  assert.equal(r.s.story.id, "c3", "a second Next right after works too");
  r.at(1200, { type: "HOVER", id: "f6" });
  r.at(1500, { type: "HOVER", id: null, from: "f6" });
  r.at(1550, { type: "PANEL", over: true }); // onto the dialog showing f6
  assert.equal(inspectShownId(r.s), "f6");
  r.at(1600, { type: "GOTO", index: 3 });
  assert.equal(r.s.story.id, "d4");
  assert.equal(inspectShownId(r.s), "d4", "Next ends the inspect: the dialog shows the new story");
  r.at(1700 + D);
  assert.equal(r.s.story.id, "d4", "playback stays paused while the pointer is on the dialog");
  r.at(1800 + D, { type: "PANEL", over: false });
  r.at(1800 + D + RESUME_MS + D + 50);
  assert.notEqual(r.s.story.id, "d4", "playback resumes after leaving the dialog");
});

test("store: the walk wraps at the end; Next from the last example goes to the first", () => {
  const r = run();
  r.at(10, { type: "GOTO", index: ids.length - 1 });
  assert.equal(r.s.story.id, "i9");
  r.at(20, { type: "GOTO", index: ids.length });
  assert.equal(r.s.story.id, "a1");
  assert.equal(r.s.story.done, false);
});

test("store: the examples list holds playback; picking one moves the story and stays held", () => {
  const r = run();
  r.at(10, { type: "HOLD", reason: "list" });
  r.at(D * 2); // no auto-advance while the list is open
  assert.equal(r.s.story.id, "a1");
  r.at(D * 2 + 10, { type: "GOTO", index: 4 });
  assert.equal(r.s.story.id, "e5");
  r.at(D * 4);
  assert.equal(r.s.story.id, "e5", "still held after the pick");
  r.at(D * 4 + 10, { type: "RELEASE", reason: "list" });
  r.at(D * 4 + 10 + RESUME_MS + D + 50);
  assert.equal(r.s.story.id, "f6", "resumes after the release");
});

test("store: ticking only at nextDeadline gives the same story as ticking every frame", () => {
  const events: [number, HomeEvent][] = [[1000, { type: "HOVER", id: "c3" }], [3000, { type: "HOVER", id: null, from: "c3" }], [9000, { type: "HOLD", reason: "list" }], [12000, { type: "RELEASE", reason: "list" }]];
  const frames = run();
  for (const [t, e] of events) frames.at(t, e);
  frames.at(40_000);
  let s: HomeState = homeReduce(initialHome(0), { type: "INIT", ids, dur: D, reduced: false }, 0);
  let now = 0;
  const queue = [...events];
  while (now < 40_000) {
    const d = Math.min(nextDeadline(s, now), queue[0]?.[0] ?? Infinity, 40_000);
    now = d;
    if (queue[0] && queue[0][0] === d) s = homeReduce(s, queue.shift()![1], d);
    s = homeReduce(s, { type: "TICK" }, d + 1);
    now = d + 1;
  }
  assert.equal(s.story.id, frames.s.story.id);
});
