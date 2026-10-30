import assert from "node:assert/strict";
import { test } from "node:test";

import { RESUME_MS, hold, nudge, playState, playback, release, restart, setHidden, tick, toggleUser } from "../../apps/web/app/lib/globe-model.ts";

const D = 7500;

test("playback: advances once after the full time, then restarts the clock", () => {
  let p = playback(D, 0);
  assert.equal(tick(p, D - 1).advance, false);
  const r = tick(p, D);
  assert.equal(r.advance, true);
  p = r.p;
  assert.equal(tick(p, D).advance, false, "no double advance in the same instant");
  assert.equal(tick(p, D + 100).advance, false);
  assert.equal(tick(p, 2 * D).advance, true);
});

test("playback: a hold pauses, resumes RESUME_MS after release and continues where it stopped", () => {
  let p = playback(D, 0);
  p = hold(p, "marker", 2000); // 5500 left
  assert.equal(playState(p, 2000), "paused-by-interaction");
  assert.equal(tick(p, 60_000).advance, false, "never advances while held");
  p = release(p, "marker", 60_000);
  assert.equal(playState(p, 60_000 + RESUME_MS - 1), "paused-by-interaction");
  assert.equal(playState(p, 60_000 + RESUME_MS), "playing");
  const resumeAt = 60_000 + RESUME_MS;
  assert.equal(tick(p, resumeAt + 5499).advance, false);
  assert.equal(tick(p, resumeAt + 5500).advance, true);
});

test("playback: rapid hover in/out never advances early or skips", () => {
  let p = playback(D, 0);
  let advances = 0;
  for (let k = 0; k < 95; k++) {
    const t = 1000 + k * 200; // hold at even steps, release at odd; the last step (k = 94) holds
    p = k % 2 ? release(p, "marker", t) : hold(p, "marker", t);
    const r = tick(p, t + 1);
    p = r.p;
    advances += Number(r.advance);
  }
  assert.equal(advances, 0, "flicking over a marker keeps it paused");
  p = release(p, "marker", 20_000);
  // 1000 ms ran before the first hover: 6500 left once the idle wait ends.
  assert.equal(tick(p, 20_000 + RESUME_MS + 6499).advance, false);
  assert.equal(tick(p, 20_000 + RESUME_MS + 6500).advance, true);
});

test("playback: a drag that ends over a marker stays paused until the hover ends", () => {
  let p = playback(D, 0);
  p = hold(p, "drag", 1000);
  p = hold(p, "marker", 1500);
  p = release(p, "drag", 2000);
  assert.equal(playState(p, 2000 + RESUME_MS + 10_000), "paused-by-interaction");
  p = release(p, "marker", 20_000);
  assert.equal(playState(p, 20_000 + RESUME_MS), "playing");
});

test("playback: hidden tab mid-transition freezes the clock; showing again continues", () => {
  let p = playback(D, 0);
  p = setHidden(p, true, 3000);
  assert.equal(playState(p, 3000), "hidden");
  assert.equal(tick(p, 100_000).advance, false);
  p = setHidden(p, false, 100_000);
  assert.equal(playState(p, 100_000), "playing");
  assert.equal(tick(p, 100_000 + 4499).advance, false);
  assert.equal(tick(p, 100_000 + 4500).advance, true);
  // Hidden while also held: back to paused-by-interaction, not playing.
  p = hold(playback(D, 0), "panel", 10);
  p = setHidden(setHidden(p, true, 20), false, 30);
  assert.equal(playState(p, 30), "paused-by-interaction");
});

test("playback: the pause button wins over everything and play starts at once", () => {
  let p = playback(D, 0);
  p = toggleUser(p, 1000);
  assert.equal(playState(p, 1000), "paused-by-user");
  p = release(hold(p, "marker", 2000), "marker", 3000);
  assert.equal(playState(p, 3000 + RESUME_MS), "paused-by-user");
  p = toggleUser(p, 50_000);
  assert.equal(playState(p, 50_000), "playing");
  assert.equal(tick(p, 50_000 + 6499).advance, false);
  assert.equal(tick(p, 50_000 + 6500).advance, true);
});

test("playback: nudge pauses briefly; restart gives a new example its full time", () => {
  let p = nudge(playback(D, 0), 1000);
  assert.equal(playState(p, 1000 + RESUME_MS - 1), "paused-by-interaction");
  assert.equal(playState(p, 1000 + RESUME_MS), "playing");
  p = restart(p, 5000);
  assert.equal(tick(p, 5000 + D - 1).advance, false);
  assert.equal(tick(p, 5000 + D).advance, true);
  assert.equal(release(p, "never-held", 6000).idleUntil, p.idleUntil, "releasing an unknown hold changes nothing");
});
