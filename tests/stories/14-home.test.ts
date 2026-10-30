// Story 14: the landing page. Static data only, a globe that is never empty, one info panel, and
// examples that tell the truth. Data checks read the static export (npm run examples:export);
// UI checks need the app running (STORY_BASE_URL, default http://localhost:3000) and Chromium.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Page } from "playwright-core";

import { exampleProblem } from "../../packages/core/src/examples/check.ts";
import type { HomeExample } from "../../packages/core/src/examples/types.ts";
import { appUp, BASE } from "./_mcp.ts";
import { browser, chromiumPath } from "./_browser.ts";

const DIR = new URL("../../apps/web/public/landing/", import.meta.url);
const manifest = await readFile(new URL("manifest.json", DIR), "utf8").then(JSON.parse).catch(() => undefined);
const noExport = !manifest && "no static export yet (npm run examples:export)";
// "warming": the export gate failed, so only the world layer and towns were written.
const noExamples = noExport || (!manifest.files.examples && "export is warming up (no examples yet)");
const up = await appUp();
// STORY_HOME_DEV=1 runs the UI checks against a dev server that serves examples from the database.
const devData = process.env.STORY_HOME_DEV === "1";
const noUi = (!devData && noExport) || (!up && "app not running") || (!chromiumPath && "no Chromium found");
const readJson = async (file: string) => JSON.parse(await readFile(new URL(file, DIR), "utf8"));

test("home data: ≥ 50 examples on ≥ 6 continents, complete and honest", { skip: noExamples }, async () => {
  const examples: HomeExample[] = await readJson(manifest.files.examples);
  assert.ok(examples.length >= 50, `${examples.length} examples`);
  assert.ok(new Set(examples.map((e) => e.home.continent)).size >= 6, "six continents");
  assert.ok(new Set(examples.map((e) => e.feature)).size >= 5, "every feature type shows up");
  for (const ex of examples) {
    assert.ok(ex.cities.length >= 3, `${ex.id}: ≥ 3 cities`);
    assert.equal(exampleProblem(ex), undefined, `${ex.id}: ${exampleProblem(ex)}`);
    const text = [ex.decision.headline, ...ex.decision.lines, ex.compare?.line ?? ""].join(" ");
    assert.doesNotMatch(text, /[$€£₹]-|-\$|Qloo|Claude|Anthropic|fanIndex|heatmap/i, ex.id);
    assert.equal((ex as { fanPoints?: unknown }).fanPoints, undefined, `${ex.id}: no fan points in the examples file`);
  }
});

test("home data: the globe is never empty (world layer + ≥ 1,000 city lights, without any example)", { skip: noExport }, async () => {
  const world = await readJson(manifest.files.world);
  const towns = manifest.files.towns ? await readJson(manifest.files.towns) : { cities: [] };
  const lights = (world.cities.length + towns.cities.length) / 3; // flat [lon×10, lat×10, bucket, …]
  assert.ok(world.cities.length / 3 >= 1000, `${world.cities.length / 3} big-city lights`);
  assert.ok(lights >= 1000, `${lights} city lights`);
  assert.ok(world.fan.length > 100, "world fan layer");
});

async function openHome(page: Page) {
  await page.goto(`${BASE}/`);
  // The globe loads only once it's on screen; scroll it in first (small screens start above it).
  await page.locator("[data-testid=globe-canvas]").scrollIntoViewIfNeeded();
  await page.waitForSelector("[data-testid=globe-canvas][data-markers]", { timeout: 60_000 });
  // Scroll with real input so hover state follows (programmatic scrolls can leave it stale).
  await page.mouse.wheel(0, -10_000);
  await page.waitForTimeout(300);
  const box = (await page.locator("[data-testid=globe-canvas]").boundingBox())!;
  const vh = page.viewportSize()!.height;
  await page.mouse.move(5, 5);
  await page.mouse.wheel(0, Math.max(0, box.y + box.height - vh));
  await page.waitForTimeout(1200);
}
// Markers on screen in page coordinates (published by the globe, throttled).
async function markers(page: Page) {
  const box = (await page.locator("[data-testid=globe-canvas]").boundingBox())!;
  const raw = (await page.locator("[data-testid=globe-canvas]").getAttribute("data-markers")) ?? "[]";
  const all = (JSON.parse(raw) as number[][]).map(([i, x, y]) => ({ i, x: box.x + x, y: box.y + y }));
  // Only markers the pointer can actually reach (not under the dialog or off screen).
  const reachable = await page.evaluate(
    (pts) => pts.map((m) => document.elementFromPoint(m.x, m.y)?.closest("[data-testid=globe]") != null),
    all,
  );
  return all.filter((_, k) => reachable[k]);
}
const DIALOG = "[data-testid=info-panel]";
const FRONT_H2 = `${DIALOG} .ec-layer[data-front] h2`;
const headline = (page: Page) => page.locator(FRONT_H2).textContent();
const inspecting = async (page: Page) => (await page.locator(DIALOG).getAttribute("data-active")) != null;
// The story's example id (the globe publishes it); the card shows "12 / 339", no dots.
const storyDot = (page: Page) => page.locator("[data-testid=globe-canvas]").getAttribute("data-story");
const NEXT = { name: /next example/i }, PREV = { name: /previous example/i };
const view = async (page: Page) => ((await page.locator("[data-testid=globe-canvas]").getAttribute("data-view")) ?? "0,0,0").split(",").map(Number);
// Hold the showcase still with the pause control, so markers stay put while the test aims.
async function holdStill(page: Page) {
  await page.getByTestId("play-control").click();
  let prev = "";
  for (let k = 0; k < 20; k++) {
    const now = (await page.locator("[data-testid=globe-canvas]").getAttribute("data-markers")) ?? "";
    if (now === prev) break;
    prev = now;
    await page.waitForTimeout(700);
  }
}
const hovered = async (page: Page) => Number((await page.locator("[data-testid=globe-canvas]").getAttribute("data-hover")) ?? -1);
// A marker clear of others (so "40 px off" can only mean this one).
const ZONE_MAX = 150; // > the scene's largest marker hover zone (ZONE_MAX_PX 140)
const lonely = (ms: { i: number; x: number; y: number }[]) => ms.find((a) => ms.every((o) => o === a || Math.hypot(o.x - a.x, o.y - a.y) > 100)) ?? ms[0];

test("home UI: static only (no data API, no fan-data calls), no vendor names", { skip: noUi || (devData && "dev data uses the API"), timeout: 120_000 }, async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ""), /Qloo|Claude|Anthropic/);
  const b = await browser();
  try {
    const page = await b.newPage();
    const calls: string[] = [];
    page.on("request", (r) => calls.push(r.url()));
    await openHome(page);
    await page.waitForTimeout(3000);
    assert.deepEqual(calls.filter((u) => /\/api\/|qloo/i.test(u)), [], "the landing page reads static files only");
  } finally {
    await b.close();
  }
});

test("home UI: one dialog; switching examples keeps the same node", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    const first = await page.evaluateHandle((sel) => document.querySelector(sel), DIALOG);
    const heads = new Set<string>();
    for (let k = 0; k < 5; k++) {
      heads.add((await page.locator("[data-testid=globe-canvas]").getAttribute("data-story")) ?? "");
      await page.locator(DIALOG).getByRole("button", NEXT).click();
      await page.waitForTimeout(400);
      assert.equal(await page.locator(DIALOG).count(), 1, "never more than one dialog");
    }
    assert.ok(heads.size >= 4, "the examples changed");
    assert.ok(await page.evaluate(([n, sel]) => n === document.querySelector(sel as string), [first, DIALOG] as const), "same DOM node");
  } finally {
    await b.close();
  }
});

test("home UI: hovering 40 px from a marker shows that example; the camera doesn't move", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    await holdStill(page);
    const m = lonely(await markers(page));
    assert.ok(m, "a marker is visible");
    const before = await headline(page);
    const v0 = await view(page);
    await page.mouse.move(m.x + 40, m.y, { steps: 4 });
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 5000 });
    assert.equal(await hovered(page), m.i, "the zone's marker is the hovered one");
    await page.waitForTimeout(3000);
    const v1 = await view(page);
    assert.ok(Math.abs(v1[0] - v0[0]) <= 0.1 && Math.abs(v1[1] - v0[1]) <= 0.1, `camera unchanged after a 3 s hover (${v0} → ${v1})`);
    assert.ok(Math.abs(v1[4] - v0[4]) <= 0.002 && Math.abs(v1[5] - v0[5]) <= 0.002, `camera position (tilt / distance) unchanged by the hover (${v0} → ${v1})`);
    const text = (await headline(page)) ?? "";
    assert.ok(text.length > 5, "a headline shows");
    void before;
    assert.equal(await page.locator(DIALOG).count(), 1);
  } finally {
    await b.close();
  }
});

// User feedback: "if we even hover a little bit ... it simply just moves to the next location".
// Tracing across the map passes over markers; only a pointer that rests on one may take over.
test("home UI: tracing across a marker at speed doesn't switch the example", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    await holdStill(page);
    const ms = await markers(page);
    const clear = (x: number, y: number) => x > 10 && x < 1000 && ms.every((c) => Math.hypot(c.x - x, c.y - y) > ZONE_MAX);
    const m = ms.find((c) => c.x > 400 && clear(c.x - 180, c.y) && clear(c.x + 180, c.y));
    if (!m) return void console.log("# no marker with clear ground on both sides; skipped");
    const before = await headline(page);
    await page.mouse.move(m.x - 180, m.y);
    await page.waitForTimeout(300);
    // ~1,200 px/s across the marker, then off the far side.
    for (let k = 1; k <= 24; k++) {
      await page.mouse.move(m.x - 180 + k * 15, m.y);
      await page.waitForTimeout(12);
    }
    await page.waitForTimeout(800);
    assert.ok(!(await page.locator(DIALOG).getAttribute("data-active")), "the dialog stayed on the story");
    assert.equal(await headline(page), before, "the example didn't switch");
  } finally {
    await b.close();
  }
});

test("home UI: moving from a marker onto the dialog never toggles it", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    await holdStill(page);
    const m = lonely(await markers(page));
    await page.mouse.move(m.x, m.y, { steps: 3 });
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 5000 });
    await page.waitForTimeout(400); // let the card's swap finish
    const shown = await headline(page);
    const d = (await page.locator(DIALOG).boundingBox())!;
    const states: boolean[] = [];
    for (let k = 1; k <= 12; k++) {
      await page.mouse.move(m.x + ((d.x + d.width / 2 - m.x) * k) / 12, m.y + ((d.y + d.height / 2 - m.y) * k) / 12);
      await page.waitForTimeout(80);
      states.push(await inspecting(page));
    }
    await page.waitForTimeout(1500);
    states.push(await inspecting(page));
    assert.ok(states.every(Boolean), `inspect stayed on the whole way (${states.map(Number).join("")})`);
    assert.equal(await headline(page), shown, "same example while reading it");
  } finally {
    await b.close();
  }
});

test("home UI: moving between two close markers doesn't flip back and forth", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    await holdStill(page);
    const ms = await markers(page);
    // A close pair with no third marker near the line between them, each hoverable on its own
    // (not under the dialog's exclusion rect).
    const nearSeg = (p: { x: number; y: number }, a: { x: number; y: number }, o: { x: number; y: number }) => {
      const dx = o.x - a.x, dy = o.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    };
    let pair: [(typeof ms)[0], (typeof ms)[0]] | undefined;
    for (const a of ms) {
      for (const o of ms) {
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (a === o || pair || d >= 90 || d <= 12 || ms.some((c) => c !== a && c !== o && nearSeg(c, a, o) < 25)) continue;
        await page.mouse.move(a.x, a.y);
        await page.waitForTimeout(200);
        const ha = await hovered(page);
        await page.mouse.move(o.x, o.y);
        await page.waitForTimeout(200);
        if (ha === a.i && (await hovered(page)) === o.i) pair = [a, o];
      }
    }
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1200);
    if (!pair) return void console.log("# no two close, clear markers on screen; skipped");
    const [A, B] = pair;
    const seq: number[] = [];
    const at = async (t: number, wobble = 0, settle = 150) => {
      await page.mouse.move(A.x + (B.x - A.x) * t + wobble, A.y + (B.y - A.y) * t);
      await page.waitForTimeout(settle);
      const h = await hovered(page);
      if (seq.at(-1) !== h) seq.push(h);
    };
    for (let k = 0; k <= 10; k++) await at(k / 10, 0, k === 10 ? 500 : 150); // rest on B: the hover-in delay passes
    const before = seq.length;
    for (let k = 0; k < 8; k++) await at(0.5, k % 2 ? 4 : -4);
    assert.deepEqual(seq.filter((h) => h >= 0), [A.i, B.i], `one hand-over from A to B (saw ${seq.join(" → ")}; A ${JSON.stringify(A)} B ${JSON.stringify(B)}; now ${JSON.stringify((await markers(page)).filter((m) => m.i === A.i || m.i === B.i))})`);
    assert.equal(seq.length, before, "no flip while wobbling in the middle");
  } finally {
    await b.close();
  }
});

test("home UI: hovering pauses the next example; leaving resumes it; rotation only goes forward", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    const story = await storyDot(page);
    let m = lonely(await markers(page));
    assert.ok(m, "a marker is visible");
    // The globe keeps turning, so follow the marker until the hover takes (it needs a short rest).
    for (let t = 0; t < 4; t++) {
      m = (await markers(page)).find((o) => o.i === m!.i) ?? m;
      await page.mouse.move(m.x, m.y, { steps: 3 });
      const ok = await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 1500 }).then(() => true, () => false);
      if (ok) break;
    }
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 3000 });
    assert.equal(await page.getByTestId("play-control").getAttribute("data-state"), "paused-by-interaction");
    for (let k = 0; k < 6; k++) {
      await page.mouse.move(m.x + (k % 2), m.y);
      await page.waitForTimeout(1000);
    }
    await page.mouse.move(5, 5, { steps: 3 }); // leave the globe and the dialog
    await page.waitForFunction((sel) => !document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 5000 });
    assert.equal(await storyDot(page), story, "no new example while hovering");
    await page.waitForFunction((s) => document.querySelector("[data-testid=globe-canvas]")?.getAttribute("data-story") !== s, story, { timeout: 15_000 });
    // After the advance: one travel the short way (east or west), then longitude only increases
    // (no swing back), sampled for 10 s.
    let last = (await view(page))[1], total = 0, wasMoving = true;
    for (let k = 0; k < 25; k++) {
      await page.waitForTimeout(400);
      const [, lon, , moving] = await view(page);
      const d = ((lon - last + 540) % 360) - 180;
      last = lon;
      const travelTail = wasMoving; // this step still spans the end of the travel
      wasMoving = !!moving;
      if (moving || travelTail) continue; // the one damped travel
      assert.ok(d >= -0.05, `longitude went back by ${d.toFixed(2)}° after the travel`);
      total += d;
    }
    assert.ok(total > 0, "it kept turning");
  } finally {
    await b.close();
  }
});

// The example the story is on, and its focus city (where the camera goes).
const focusOf = (e: HomeExample) => e.route?.[0] ?? e.cities[0] ?? e.home;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * R) / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(((b.lon - a.lon) * R) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};
const lonStep = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

test("home UI: Next walks to neighbours; each camera travel is the short way (≤ 180°)", { skip: noUi, timeout: 180_000 }, async () => {
  const examples: HomeExample[] = devData ? await (await fetch(`${BASE}/api/home?part=examples`)).json() : await readJson(manifest.files.examples);
  const byId = new Map(examples.map((e) => [e.id, e]));
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    await holdStill(page);
    const canvas = page.locator("[data-testid=globe-canvas]");
    const story = async () => byId.get((await canvas.getAttribute("data-story")) ?? "");
    const hops: number[] = [];
    let prev = await story();
    for (let k = 0; k < 10; k++) {
      const start = (await view(page))[1];
      await page.locator(DIALOG).getByRole("button", NEXT).click();
      // Follow the travel (unwrapped longitude) until it has started and finished.
      let lon = start, last = start, seen = false;
      for (let t = 0; t < 40; t++) {
        await page.waitForTimeout(100);
        const [, l, , moving] = await view(page);
        lon += lonStep(last, l);
        last = l;
        if (moving) seen = true;
        else if (seen || t > 25) break;
      }
      const travelled = lon - start;
      assert.ok(Math.abs(travelled) <= 180, `advance ${k + 1}: travel ${travelled.toFixed(1)}° (more than half a turn)`);
      assert.ok(Math.abs(travelled - lonStep(start, last)) <= 1, `advance ${k + 1}: travel ${travelled.toFixed(1)}° vs shortest ${lonStep(start, last).toFixed(1)}°`);
      const cur = await story();
      assert.ok(cur && cur !== prev, `advance ${k + 1}: the story moved on`);
      if (prev && cur) hops.push(km(focusOf(prev), focusOf(cur)));
      prev = cur;
    }
    const sorted = [...hops].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    assert.ok(median < 1500, `median hop ${Math.round(median)} km (hops: ${hops.map(Math.round).join(", ")})`);
    assert.ok(hops.filter((h) => h > 6000).length <= 1, `at most one long hop (wrap / continent change): ${hops.map(Math.round).join(", ")}`);
  } finally {
    await b.close();
  }
});

// Picking from "All examples" must always leave a fan surface on screen (user bug: "the globe
// becomes empty"), including examples across the antimeridian. Reads the scene's own report
// (?perf=1 posts renderer.info + what's drawn onto the canvas element once a second).
test("home UI: 20 picks from the list in a row each draw the picked example's surface", { skip: noUi, timeout: 400_000 }, async () => {
  const examples: HomeExample[] = devData ? await (await fetch(`${BASE}/api/home?part=examples`)).json() : await readJson(manifest.files.examples);
  const far = examples.filter((e) => Math.abs(focusOf(e).lon) > 165 || /^(Lorde|Six60|Kylie)/i.test(e.act.name));
  const rest = examples.filter((e) => !far.includes(e)).sort(() => Math.random() - 0.5);
  const picks = [...far.slice(0, 5), ...rest].slice(0, 20).sort(() => Math.random() - 0.5);
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${BASE}/?perf=1`);
    await page.waitForSelector("[data-testid=globe-canvas][data-markers]", { timeout: 60_000 });
    const dialog = page.locator(DIALOG);
    const canvas = page.locator("[data-testid=globe-canvas]");
    for (const [k, ex] of picks.entries()) {
      await dialog.getByRole("button", { name: /all examples/i }).click();
      await dialog.getByRole("combobox").fill(ex.act.name);
      const row = dialog.locator(`[id="ec-opt-${ex.id}"]`);
      await row.waitFor({ timeout: 5000 });
      await row.click();
      await page.waitForFunction((id) => document.querySelector("[data-testid=globe-canvas]")?.getAttribute("data-story") === id, ex.id, { timeout: 5000 });
      // Within 8 s: the scene shows this example, with a terrain surface and a sane camera.
      let st: { shown?: string; surface?: boolean; calls?: number; peak?: number; points?: number; tier?: number; view?: number[] } = {};
      for (let t = 0; t < 40 && !(st.shown === ex.id && st.surface); t++) {
        await page.waitForTimeout(200);
        st = JSON.parse((await canvas.getAttribute("data-stats")) ?? "{}");
      }
      const tag = `pick ${k + 1} ${ex.act.name} (${ex.id}, lon ${focusOf(ex).lon})`;
      assert.equal(st.shown, ex.id, `${tag}: the scene shows the picked example (${JSON.stringify(st)})`);
      assert.ok(st.surface, `${tag}: a fan surface is drawn (${JSON.stringify(st)})`);
      assert.ok((st.calls ?? 0) >= 4, `${tag}: draw calls ${st.calls}`);
      assert.ok(st.view?.every(Number.isFinite), `${tag}: camera is finite`);
    }
    assert.deepEqual(errors.filter((e) => !/favicon|Download the React/.test(e)), [], "no console errors");
  } finally {
    await b.close();
  }
});

test("home UI: in-globe pop-ups name the top city (and at most one surprise), never under the dialog", { skip: noUi || noExamples, timeout: 180_000 }, async () => {
  const examples: HomeExample[] = devData ? await (await fetch(`${BASE}/api/home?part=examples`)).json() : await readJson(manifest.files.examples);
  const byId = new Map(examples.map((e) => [e.id, e]));
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/?perf=1`);
    await page.locator("[data-testid=globe-canvas]").scrollIntoViewIfNeeded();
    await page.waitForSelector("[data-testid=globe-canvas][data-markers]", { timeout: 60_000 });
    const canvas = page.locator("[data-testid=globe-canvas]");
    let named = 0;
    for (let i = 0; i < 8; i++) {
      await page.locator(DIALOG).getByRole("button", NEXT).click();
      await page.waitForTimeout(5500); // route drawn, pop-ups faded in, stats refreshed
      const st = JSON.parse((await canvas.getAttribute("data-stats")) ?? "{}") as { shown?: string; pops?: string[] };
      const ex = byId.get(st.shown ?? "");
      assert.ok(ex, `stats name a known example (${st.shown})`);
      assert.ok((st.pops ?? []).length <= 2, `${ex.id}: at most 2 pop-ups (${st.pops})`);
      for (const name of st.pops ?? []) assert.ok(name === ex.cities[0]?.name || name === ex.surprise?.city, `${ex.id}: pop-up "${name}" is the top or surprise city`);
      if (st.pops?.includes(ex.cities[0]?.name)) named++;
    }
    assert.ok(named >= 2, `the top city shows on at least 2 of 8 examples (${named})`);
  } finally {
    await b.close();
  }
});

test("home UI: 390 px touch — a tap opens the example in the dialog, a drag does not", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await openHome(page);
    await page.locator("[data-testid=globe-canvas]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    const touch = async (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const box = (await page.locator("[data-testid=globe-canvas]").boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await touch("touchStart", cx - 60, cy);
    for (let k = 1; k <= 6; k++) await touch("touchMove", cx - 60 + k * 20, cy);
    await touch("touchEnd", cx + 60, cy);
    await page.waitForTimeout(600);
    assert.equal(await inspecting(page), false, "drag opens nothing");
    await page.waitForTimeout(1500);
    await holdStill(page); // markers stay put while the test aims
    const inView = (ms: { i: number; x: number; y: number }[]) => ms.filter((p) => p.x > 16 && p.x < 374 && p.y > 16 && p.y < 828);
    let all = await markers(page);
    // The narrow globe can face open ocean; Next brings an example's region into view.
    for (let k = 0; k < 5 && !inView(all).length; k++) {
      await page.locator(DIALOG).getByRole("button", NEXT).click();
      await page.waitForTimeout(3000);
      await page.locator("[data-testid=globe-canvas]").scrollIntoViewIfNeeded();
      all = await markers(page);
    }
    const m = lonely(inView(all));
    assert.ok(m, `a marker is visible (${JSON.stringify(all)}; raw ${await page.locator("[data-testid=globe-canvas]").getAttribute("data-markers")}; view ${await page.locator("[data-testid=globe-canvas]").getAttribute("data-view")})`);
    await page.touchscreen.tap(m.x, m.y);
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 5000 });
    await page.waitForTimeout(2000);
    assert.ok(await inspecting(page), "a tapped example stays in the dialog until closed");
  } finally {
    await b.close();
  }
});

test("home UI: reduced motion = no auto-advance", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ reducedMotion: "reduce" });
    await openHome(page);
    const before = await headline(page);
    await page.waitForTimeout(9000);
    assert.equal(await headline(page), before);
  } finally {
    await b.close();
  }
});

test("home UI: every control works", { skip: noUi, timeout: 180_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openHome(page);
    const dialog = page.locator(DIALOG);
    // The footer is the only navigation: [‹ Prev] [☰ All] [Next ›], fixed positions in every state.
    const ctl = dialog.locator("button.ec-ctl");
    const boxes = async () => JSON.stringify(await ctl.evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().x), Math.round(e.getBoundingClientRect().y)])));
    assert.equal(await ctl.count(), 3, "Prev, All, Next");
    assert.equal(await dialog.getByRole("button", { name: /^back/i }).count(), 0, "no Back button");
    assert.match((await dialog.textContent()) ?? "", /\d+\s*\/\s*\d+/, "a 12 / 339 counter");
    const storyBoxes = await boxes();
    // Next / Prev step the story; ← / → do the same.
    const s0 = await storyDot(page);
    await dialog.getByRole("button", NEXT).click();
    await page.waitForFunction((s) => document.querySelector("[data-testid=globe-canvas]")?.getAttribute("data-story") !== s, s0, { timeout: 3000 });
    const s1 = await storyDot(page);
    await dialog.getByRole("button", PREV).click();
    await page.waitForFunction((s) => document.querySelector("[data-testid=globe-canvas]")?.getAttribute("data-story") === s, s0, { timeout: 3000 });
    await page.mouse.move(5, 5);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction((s) => document.querySelector("[data-testid=globe-canvas]")?.getAttribute("data-story") === s, s1, { timeout: 3000 });
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction((s) => document.querySelector("[data-testid=globe-canvas]")?.getAttribute("data-story") === s, s0, { timeout: 3000 });
    assert.equal(await boxes(), storyBoxes, "buttons don't move between examples");
    // Pause / play.
    const play = page.getByTestId("play-control");
    await page.mouse.move(5, 5);
    await play.click();
    assert.equal(await play.getAttribute("data-state"), "paused-by-user");
    const held = await storyDot(page);
    await page.waitForTimeout(8500);
    assert.equal(await storyDot(page), held, "paused: no advance");
    await play.click();
    assert.notEqual(await play.getAttribute("data-state"), "paused-by-user");
    // All toggles the list (holds playback); same button positions; Esc closes; search + pick moves the story.
    const allBtn = ctl.nth(1);
    const listOpen = () => page.locator(DIALOG).evaluate((n) => n.querySelector("[data-list]") != null || n.hasAttribute("data-list"));
    await allBtn.click();
    assert.ok(await listOpen(), "All opens the list");
    assert.equal(await play.getAttribute("data-state"), "paused-by-interaction", "the open list holds playback");
    assert.equal(await boxes(), storyBoxes, "buttons don't move when the list opens");
    await allBtn.click();
    assert.ok(!(await listOpen()), "All again closes the list");
    await allBtn.click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    assert.ok(!(await listOpen()), "Esc closes the list");
    await allBtn.click();
    const before = await storyDot(page);
    const items = dialog.getByRole("option");
    assert.ok((await items.count()) > 3, "the list shows examples");
    const pick = ((await items.nth(2).locator(".ec-act").textContent()) ?? "").trim();
    await dialog.getByRole("combobox").fill(pick);
    await page.waitForTimeout(300);
    assert.ok((await items.filter({ hasText: pick }).count()) >= 1, `search finds "${pick}"`);
    const target = items.filter({ hasText: pick }).first();
    await target.click();
    await page.waitForFunction((b) => document.querySelector("[data-testid=globe-canvas]")?.getAttribute("data-story") !== b, before, { timeout: 3000 });
    assert.ok(!(await listOpen()), "picking closes the list");
    assert.match((await headline(page)) ?? "", /\S/, "the card shows the picked example");
    // Zoom in / out / reset.
    const z0 = (await view(page))[2];
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1200);
    const z1 = (await view(page))[2];
    assert.ok(z1 > z0 + 0.1, `zoom in (${z0} → ${z1})`);
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.waitForTimeout(1200);
    assert.ok((await view(page))[2] < z1, "zoom out");
    await page.getByRole("button", { name: "Reset view" }).click();
    await page.waitForTimeout(1500);
    assert.ok((await view(page))[2] < 0.05, "reset");
    // Marker tap → preview; the card body scrolls with the wheel (page and globe stay put); Next; Esc.
    await holdStill(page);
    const m = lonely(await markers(page));
    await page.mouse.click(m.x, m.y);
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 5000 });
    await page.waitForTimeout(400);
    const body = await page.evaluateHandle((sel) => {
      const all = [...document.querySelectorAll(`${sel} *`)] as HTMLElement[];
      return all.find((n) => n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY) && n.closest(".ec-layer[data-front]") !== null) ?? all.find((n) => n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY)) ?? null;
    }, DIALOG);
    const bodyBox = await body.evaluate((n) => (n ? (n as HTMLElement).getBoundingClientRect().toJSON() : null));
    if (bodyBox) {
      const pageY = await page.evaluate(() => scrollY), z = (await view(page))[2];
      await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(500);
      assert.ok((await body.evaluate((n) => (n as HTMLElement).scrollTop)) > 0, "card body scrolled");
      assert.equal(await page.evaluate(() => scrollY), pageY, "the page didn't scroll");
      assert.equal((await view(page))[2], z, "the globe didn't zoom");
    } else console.log("# card body fits without scrolling; scroll check skipped");
    // Preview (tapped marker): same button positions; Next ends the preview and steps the story.
    assert.equal(await boxes(), storyBoxes, "buttons don't move in a preview");
    const sp = await storyDot(page);
    await dialog.getByRole("button", NEXT).click();
    await page.waitForTimeout(400);
    assert.equal(await inspecting(page), false, "Next ends the preview");
    assert.notEqual(await storyDot(page), sp, "Next steps the story from a preview");
    await page.waitForTimeout(2500); // the camera travels to the new example
    const m2 = lonely(await markers(page));
    await page.mouse.click(m2.x, m2.y);
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-active"), DIALOG, { timeout: 5000 });
    await page.mouse.move(5, 5);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(await inspecting(page), false, "Esc closes");
    // Try it with your act → /start?artist=…
    await page.getByPlaceholder("Try it with any act").fill("Phoebe Bridgers");
    await page.getByPlaceholder("Try it with any act").press("Enter");
    await page.waitForURL(/\/start\?artist=Phoebe/, { timeout: 10_000 });
    // Plan my tour → /start.
    await page.goto(`${BASE}/`);
    await page.locator("a[href=\"/start\"]", { hasText: "Plan my tour" }).click();
    await page.waitForURL(/\/start/, { timeout: 10_000 });
  } finally {
    await b.close();
  }
});

// ---- Navigation: grab-and-follow drag, clamped zoom, never stuck, page scroll wins without intent ----
type Nav = { lat: number; lon: number; zoom: number; travel: boolean; dragging: boolean; pinch: boolean; pointers: number; degPx: number };
// The scene's stats (?perf=1) refresh once a second: wait for a fresh one.
async function nav(page: Page): Promise<Nav & { dpr: number; tier: number }> {
  const c = page.locator("[data-testid=globe-canvas]");
  const before = await c.getAttribute("data-stats");
  for (let k = 0; k < 30; k++) {
    await page.waitForTimeout(100);
    const now = await c.getAttribute("data-stats");
    if (now && now !== before) {
      const s = JSON.parse(now);
      return { ...s.nav, dpr: s.dpr, tier: s.tier };
    }
  }
  const s = JSON.parse(before ?? "{}");
  return { ...s.nav, dpr: s.dpr, tier: s.tier };
}
async function openNav(page: Page) {
  await page.goto(`${BASE}/?perf=1`);
  await page.locator("[data-testid=globe-canvas]").scrollIntoViewIfNeeded();
  await page.waitForSelector("[data-testid=globe-canvas][data-markers][data-stats]", { timeout: 60_000 });
  await holdStill(page);
}
// A spot on the globe away from the dialog and markers (right of centre).
async function openSpot(page: Page) {
  const box = (await page.locator("[data-testid=globe-canvas]").boundingBox())!;
  const ms = await markers(page);
  const cands = [0.62, 0.7, 0.55, 0.78].flatMap((fx) => [0.45, 0.6, 0.35].map((fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })));
  return cands.find((c) => ms.every((m) => Math.hypot(m.x - c.x, m.y - c.y) > 60)) ?? cands[0];
}

test("home UI: a 100 px drag turns the globe by the arc under the cursor (grab and follow)", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openNav(page);
    const n0 = await nav(page);
    const p = await openSpot(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(p.x + i * 10, p.y);
    const during = await nav(page);
    await page.mouse.up();
    const want = (100 * n0.degPx) / Math.max(0.35, Math.cos((n0.lat * Math.PI) / 180));
    const got = -lonStep(n0.lon, during.lon);
    assert.ok(Math.abs(got - want) < want * 0.25 + 0.5, `100 px → ${got.toFixed(2)}° (expected ≈ ${want.toFixed(2)}°)`);
    assert.ok(Math.abs(during.lat - n0.lat) < 1, "a horizontal drag keeps the latitude");
  } finally {
    await b.close();
  }
});

test("home UI: zoom clamps at its min and max", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openNav(page);
    for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    assert.equal((await nav(page)).zoom, 1, "max zoom");
    for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Zoom out" }).click();
    assert.equal((await nav(page)).zoom, 0, "min zoom");
    // Keyboard on the focused globe: + zooms, Esc resets.
    await page.locator("[data-testid=globe-canvas]").focus();
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    assert.ok((await nav(page)).zoom > 0.3, "+ zooms in");
    await page.keyboard.press("Escape");
    assert.equal((await nav(page)).zoom, 0, "Esc resets the view");
  } finally {
    await b.close();
  }
});

test("home UI: a lost pointerup (window blur mid-drag) never leaves the globe stuck", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openNav(page);
    const p = await openSpot(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y, { steps: 4 });
    assert.ok((await nav(page)).dragging, "dragging");
    // The up never arrives (alt-tab, OS dialog): the window blurs instead.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    const n = await nav(page);
    assert.ok(!n.dragging && !n.pinch && n.pointers === 0, `no stale drag (${JSON.stringify(n)})`);
    // Moving afterwards (button still "down" for the browser) doesn't turn the globe.
    const lon = n.lon;
    await page.mouse.move(p.x + 200, p.y, { steps: 5 });
    assert.ok(Math.abs(lonStep(lon, (await nav(page)).lon)) < 0.5, "no drag after the blur");
    await page.mouse.up();
  } finally {
    await b.close();
  }
});

test("home UI: the wheel without intent scrolls the page and shows the ctrl + scroll hint", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/?perf=1`);
    await page.locator("[data-testid=globe-canvas]").scrollIntoViewIfNeeded();
    await page.waitForSelector("[data-testid=globe-canvas][data-markers][data-stats]", { timeout: 60_000 });
    const p = await openSpot(page);
    await page.mouse.move(p.x, p.y);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 200);
    await page.getByTestId("zoom-hint").waitFor({ timeout: 2000 });
    assert.match((await page.getByTestId("zoom-hint").textContent()) ?? "", /(ctrl|⌘) \+ scroll to zoom/i);
    assert.equal((await nav(page)).zoom, 0, "no zoom");
    assert.ok((await page.evaluate(() => scrollY)) > y0, "the page scrolled");
    // ctrl + wheel zooms (toward the cursor).
    await page.waitForTimeout(400);
    const q = await openSpot(page);
    await page.mouse.move(q.x, q.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    assert.ok((await nav(page)).zoom > 0.1, "ctrl + wheel zooms");
  } finally {
    await b.close();
  }
});

test("home UI: a user drag cancels the camera's auto travel", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openNav(page);
    const p = await openSpot(page);
    // Next starts a travel to the next example; grab the globe while it's under way.
    await page.locator(DIALOG).getByRole("button", NEXT).click();
    await page.waitForTimeout(150);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x - 60, p.y + 10, { steps: 6 });
    const n = await nav(page);
    assert.ok(n.dragging && !n.travel, `the drag wins (${JSON.stringify(n)})`);
    const lon = n.lon;
    await page.waitForTimeout(1200);
    assert.ok(Math.abs(lonStep(lon, (await nav(page)).lon)) < 0.5, "held: the camera stays where the user put it");
    await page.mouse.up();
  } finally {
    await b.close();
  }
});

test("home UI: after 30 s of play and a tab hide/show the canvas is still at full resolution", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?perf=1`);
    await page.locator("[data-testid=globe-canvas]").scrollIntoViewIfNeeded();
    await page.waitForSelector("[data-testid=globe-canvas][data-markers][data-stats]", { timeout: 60_000 });
    await page.waitForTimeout(30_000);
    const other = await ctx.newPage();
    await other.bringToFront();
    await page.waitForTimeout(1500);
    await page.bringToFront();
    await other.close();
    await page.waitForTimeout(2500);
    const size = await page.locator("[data-testid=globe-canvas] canvas").evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, dpr: devicePixelRatio }));
    const want = Math.min(size.dpr, 2);
    assert.ok(Math.abs(size.w - size.cw * want) <= 2 && Math.abs(size.h - size.ch * want) <= 2, `backing ${size.w}×${size.h} for ${size.cw}×${size.ch} CSS px at DPR ${want}`);
    assert.equal((await nav(page)).dpr, want, "renderer pixel ratio");
  } finally {
    await b.close();
  }
});

test("home UI: nearby examples draw as flat secondary surfaces; hovering one shows its details", { skip: noUi || noExamples, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await openNav(page);
    // Neighbours fade in once the selected example has settled.
    let st: { calls?: number; neighbours?: string[]; nbGroups?: number[]; shown?: string } = {};
    for (let k = 0; k < 20 && (st.neighbours?.length ?? 0) < 3; k++) {
      await page.waitForTimeout(500);
      st = JSON.parse((await page.locator("[data-testid=globe-canvas]").getAttribute("data-stats")) ?? "{}");
    }
    assert.ok((st.neighbours?.length ?? 0) >= 3, `≥ 3 neighbour surfaces (${st.neighbours?.join(", ")})`);
    assert.ok(!st.neighbours!.includes(st.shown!), "the selected example isn't drawn as a neighbour");
    assert.ok((st.calls ?? 99) <= 10, `≤ 10 draw calls (${st.calls})`);
    // Hover a neighbour's marker: the dialog shows another example.
    const before = await headline(page);
    const ms = await markers(page);
    const m = ms.find((x) => st.nbGroups!.includes(x.i));
    assert.ok(m, "a neighbour's marker is reachable");
    await page.mouse.move(m!.x - 30, m!.y - 30);
    await page.mouse.move(m!.x, m!.y, { steps: 8 });
    await page.waitForFunction((h) => document.querySelector("[data-testid=info-panel] .ec-layer[data-front] h2")?.textContent !== h, before, { timeout: 4000 });
    assert.match((await headline(page)) ?? "", /\S/, "the neighbour's headline shows");
  } finally {
    await b.close();
  }
});
