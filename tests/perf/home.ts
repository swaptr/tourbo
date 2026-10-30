// perf:home: the landing page performance gate. Runs the prod build (npm run build && npm start)
// in Chromium with rotation, advances, a hover sweep and zoom all running together, on a desktop
// profile and a 4x CPU-throttled one, then checks the targets and exits non-zero on a miss.
//   npm run perf:home                 # 20 s per profile
//   npm run perf:home -- --long       # 10 min per profile (heap / leak check)
//   npm run perf:home -- --ci         # JSON summary on stdout as well
// PERF_BASE_URL (default http://localhost:3000). STORY_GPU=0 forces software GL.
import type { CDPSession, Page } from "playwright-core";

import { browser, useGpu } from "../stories/_browser.ts";

const BASE = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const LONG = process.argv.includes("--long");
const CI = process.argv.includes("--ci");
const RUN_S = LONG ? 600 : 20;

// Installed before any page script: frame clock, long tasks, LCP/CLS/INP, first WebGL context,
// GL object create/delete counts (for the dispose check) and React commits (devtools hook stub).
const INIT = () => {
  const w = window as unknown as Record<string, any>;
  const P: Record<string, any> = (w.__perf = { frames: [], longTasks: 0, longMs: 0, lcp: 0, cls: 0, inp: 0, fcp: 0, glAt: 0, live: {}, commits: 0, rendered: {} });
  let last = 0;
  const tick = (t: number) => {
    if (last && P.recording) P.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const obs = (type: string, fn: (e: any) => void) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {}
  };
  obs("longtask", (e) => P.recording && ((P.longTasks += 1), (P.longMs += e.duration)));
  obs("largest-contentful-paint", (e) => (P.lcp = e.startTime));
  obs("layout-shift", (e) => {
    if (e.hadRecentInput) return;
    P.cls += e.value;
    for (const src of e.sources ?? []) {
      const n = src.node as Node | null;
      const el = (n?.nodeType === 3 ? n.parentElement : n) as Element | null;
      const what = n?.nodeType === 3 ? `"${(n.textContent ?? "").trim().slice(0, 30)}" in ${el?.tagName?.toLowerCase()}` : el?.getAttribute?.("class")?.slice(0, 40) ?? n?.nodeName;
      const r = (x: DOMRectReadOnly) => `${Math.round(x.x)},${Math.round(x.y)} ${Math.round(x.width)}×${Math.round(x.height)}`;
      (P.shifts ??= []).push(`${what} ${e.value.toFixed(5)} @${Math.round(e.startTime)}ms ${r(src.previousRect)} → ${r(src.currentRect)}`);
    }
  });
  // Long animation frames with script attribution (what the long tasks were).
  obs("long-animation-frame", (e) => {
    if (!P.recording) return;
    if (e.duration > 50) (P.loafBig ??= []).push(`@${Math.round(e.startTime)} ${Math.round(e.duration)}ms block ${Math.round(e.blockingDuration)} render@+${Math.round(e.renderStart - e.startTime)} style@+${Math.round(e.styleAndLayoutStart - e.startTime)} scripts[${(e.scripts ?? []).map((x: any) => `${x.invoker} ${Math.round(x.duration)}ms (fwd ${Math.round(x.forcedStyleAndLayoutDuration)})`).join("; ")}]`);
    for (const sc of e.scripts ?? []) if (sc.duration > 20) (P.loaf ??= []).push(`${Math.round(sc.duration)}ms ${sc.invoker} ${sc.sourceFunctionName || ""} ${(sc.sourceURL || "").split("/").pop()}:${sc.sourceCharPosition}`);
  });
  obs("paint", (e) => e.name === "first-contentful-paint" && (P.fcp = e.startTime));
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e: any) => e.interactionId && (P.inp = Math.max(P.inp, e.duration)))).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {}
  const getContext = HTMLCanvasElement.prototype.getContext;
  const pairs = [["createBuffer", "deleteBuffer"], ["createTexture", "deleteTexture"], ["createProgram", "deleteProgram"], ["createFramebuffer", "deleteFramebuffer"], ["createVertexArray", "deleteVertexArray"]];
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    const gl = (getContext as any).call(this, type, ...rest);
    if (gl && /webgl/.test(type) && !gl.__perf) {
      gl.__perf = true;
      gl.__live = {};
      P.glAt ||= performance.now();
      P.gl ||= gl; // the first context is the globe's (other pages may open their own)
      for (const [c, d] of pairs) {
        const create = gl[c], del = gl[d];
        if (!create) continue;
        gl[c] = function (...a: unknown[]) {
          gl.__live[c] = (gl.__live[c] ?? 0) + 1;
          return create.apply(this, a);
        };
        gl[d] = function (o: unknown) {
          if (o) gl.__live[c] = (gl.__live[c] ?? 0) - 1;
          return del.call(this, o);
        };
      }
    }
    return gl;
  } as typeof getContext;
  // React commits: which components rendered, named by where they sit ("dialog" = inside the
  // home dialog, else the nearest data-testid or class below them).
  const label = (f: any): string => {
    for (let n = f.child; n; n = n.child)
      if (n.stateNode instanceof Element) {
        const el = n.stateNode as Element;
        if (el.closest("[data-testid=info-panel]")) return "dialog";
        return el.getAttribute("data-testid") ?? (el.getAttribute("class") ?? el.tagName).split(" ")[0];
      }
    return "?";
  };
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject: () => 1,
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id: number, root: any) {
      if (!P.recording) return;
      P.commits += 1;
      // Like React DevTools: a subtree whose child pointer didn't change bailed out (nothing under
      // it rendered); a component rendered if it has the PerformedWork flag in this commit.
      const walk = (f: any) => {
        for (; f; f = f.sibling) {
          const prev = f.alternate;
          if ((f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15) && (!prev || f.flags & 1)) {
            const k = label(f);
            P.rendered[k] = (P.rendered[k] ?? 0) + 1;
          }
          if (f.child && (!prev || f.child !== prev.child)) walk(f.child);
        }
      };
      walk(root.current.child);
    },
  };
};

type Result = Record<string, number | string | boolean>;

async function scenario(page: Page, cdp: CDPSession) {
  const bytes = { critical: 0, total: 0, globe: 0, js: 0, data: 0, fonts: 0 };
  const critical: string[] = [];
  const reqs: { url: string; t: number }[] = [];
  cdp.on("Network.requestWillBeSent", (e) => reqs.push({ url: e.request.url, t: e.timestamp }));
  const sizes = new Map<string, { url: string; t: number }>();
  cdp.on("Network.responseReceived", (e) => sizes.set(e.requestId, { url: e.response.url, t: e.timestamp }));
  const done: { url: string; t: number; n: number }[] = [];
  cdp.on("Network.loadingFinished", (e) => {
    const r = sizes.get(e.requestId);
    if (r) done.push({ ...r, n: e.encodedDataLength });
  });
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  const t0 = Date.now();
  await page.goto(`${BASE}/?perf=1`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=globe-canvas][data-markers]", { timeout: 90_000 });
  const ready = Date.now() - t0;
  await page.waitForTimeout(1500);
  const firstGl = await page.evaluate(() => (window as any).__perf.glAt as number);
  // Critical path: everything fetched before the first WebGL context (the globe loads after it).
  // CDP timestamps are monotonic seconds from the first request.
  const base = reqs[0]?.t ?? 0;
  for (const d of done) {
    bytes.total += d.n;
    if (/\/landing\/(examples|world)\./.test(d.url)) bytes.data += d.n; // the first landing fetch
    if (/globe-scene/.test(d.url)) bytes.globe += d.n;
    else if (!firstGl || d.t - base < firstGl / 1000) {
      bytes.critical += d.n;
      if (/\.(js|css)(\?|$)/.test(d.url)) bytes.js += d.n;
      else if (/\.woff2?(\?|$)/.test(d.url)) bytes.fonts += d.n;
      critical.push(`${d.url.replace(BASE, "")} ${Math.round(d.n / 1024)}KB`);
    }
  }

  const box = (await page.locator("[data-testid=globe-canvas]").boundingBox())!;
  const vh = page.viewportSize()!.height;
  await page.mouse.move(5, 5);
  await page.mouse.wheel(0, Math.max(0, box.y + box.height - vh));
  await page.waitForTimeout(800);
  const g = (await page.locator("[data-testid=globe-canvas]").boundingBox())!;

  await cdp.send("HeapProfiler.collectGarbage");
  const heap0 = (await cdp.send("Runtime.getHeapUsage")).usedSize;
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  // PERF_PROFILE=1: sample the main thread while recording and print the slowest task's stack mix.
  if (process.env.PERF_PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
  }
  await page.evaluate(() => ((window as any).__perf.recording = true));
  const sweepStart = reqs.length;
  let hoverReqs = 0;
  const hoverUrls = new Set<string>();
  const heapSamples: number[] = [];
  const end = Date.now() + RUN_S * 1000;
  for (let k = 0; Date.now() < end; k++) {
    // Hover sweep across the globe.
    const sweepFrom = reqs.length;
    for (let s = 0; s <= 20; s++) await page.mouse.move(g.x + g.width * (0.15 + 0.7 * (s / 20)), g.y + g.height * (0.35 + 0.3 * Math.sin(s / 3)), { steps: 2 });
    const hr = reqs.slice(sweepFrom).filter((r) => !/\/landing\/density/.test(r.url));
    hoverReqs += hr.length;
    for (const r of hr) hoverUrls.add(r.url.replace(BASE, ""));
    await page.mouse.move(5, 5);
    // Zoom in and out.
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 300);
    await page.mouse.move(5, 5);
    // Advance.
    await page.locator("[data-testid=info-panel]").getByRole("button", { name: "Next" }).click().catch(() => {});
    await page.waitForTimeout(1500);
    if (k % 5 === 0) heapSamples.push((await cdp.send("Runtime.getHeapUsage")).usedSize);
  }
  await page.evaluate(() => ((window as any).__perf.recording = false));
  if (process.env.PERF_PROFILE) printSlowest((await cdp.send("Profiler.stop")).profile);
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  await cdp.send("HeapProfiler.collectGarbage");
  const heap1 = (await cdp.send("Runtime.getHeapUsage")).usedSize;
  const P = await page.evaluate(() => {
    const p = (window as any).__perf;
    return { loafBig: (p.loafBig ?? []) as string[], shifts: (p.shifts ?? []) as string[], loaf: (p.loaf ?? []) as string[], frames: p.frames as number[], longTasks: p.longTasks, longMs: p.longMs, lcp: p.lcp, cls: p.cls, inp: p.inp, fcp: p.fcp, glAt: p.glAt, commits: p.commits, rendered: p.rendered as Record<string, number> };
  });
  const stats = JSON.parse((await page.locator("[data-testid=globe-canvas]").getAttribute("data-stats")) ?? "{}");
  // Unmount: client-side navigation away; every GL object the globe made must be gone.
  await page.locator("a[href=\"/start?next=tour\"]", { hasText: "Plan a tour" }).first().click();
  await page.waitForURL(/\/start/);
  await page.waitForTimeout(1500);
  const live = await page.evaluate(() => {
    const p = (window as any).__perf;
    return !p.gl || p.gl.isContextLost() ? {} : (p.gl.__live as Record<string, number>);
  });
  const leaked = Object.values(live).reduce((a, b) => a + Math.max(0, b), 0);

  const frames = P.frames.slice(10);
  const sorted = [...frames].sort((a, b) => a - b);
  const mean = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  const taskMs = ((m1.TaskDuration - m0.TaskDuration) * 1000) / Math.max(1, P.frames.length);
  const others = Object.entries(P.rendered).filter(([k]) => k !== "dialog" && k !== "info-panel" && k !== "play-control");
  return {
    ready_ms: ready,
    fps: Math.round(1000 / mean),
    p95_frame_ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    long_tasks: P.longTasks,
    main_ms_per_frame: Math.round(taskMs * 10) / 10,
    gpu_ms: stats.gpuMs ?? "n/a",
    draw_calls: stats.calls ?? "n/a",
    tier: stats.tier ?? "n/a",
    heap_growth_mb: Math.round(((heap1 - heap0) / 1e6) * 10) / 10,
    heap_trend_mb: heapSamples.length > 2 ? Math.round(((heapSamples.at(-1)! - heapSamples[1]) / 1e6) * 10) / 10 : 0,
    commits: P.commits,
    other_renders: others.map(([k, n]) => `${k}×${n}`).join(" ") || "none",
    critical_kb: Math.round(bytes.critical / 1024),
    critical_js_kb: Math.round(bytes.js / 1024),
    fonts_kb: Math.round(bytes.fonts / 1024),
    first_data_kb: Math.round(bytes.data / 1024),
    globe_kb: Math.round(bytes.globe / 1024),
    hover_requests: hoverReqs,
    lcp_ms: Math.round(P.lcp),
    cls: Math.round(P.cls * 1000) / 1000,
    inp_ms: Math.round(P.inp),
    gl_after_paint: P.fcp > 0 && P.glAt > P.fcp,
    gl_leaked: leaked,
    _leaks: JSON.stringify(live),
    _critical: critical.sort((a, b) => Number(b.split(" ").pop()!.replace("KB", "")) - Number(a.split(" ").pop()!.replace("KB", ""))).slice(0, 8).join(", "),
    _loaf: [...new Set(P.loaf)].slice(0, 8).join(" | "),
    _loaf_big: P.loafBig.slice(0, 6).join("\n    "),
    _shifts: P.shifts.slice(0, 4).join(" | "),
    _hover_urls: [...hoverUrls].join(" "),
    _sweep: sweepStart,
  } satisfies Result;
}

// Groups consecutive non-idle samples into tasks; prints the 2 longest with inclusive time per function.
function printSlowest(profile: any) {
  const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const tasks: { t: number; dur: number; fns: Map<string, number> }[] = [];
  let cur: any = null, t = 0;
  profile.samples.forEach((id: number, i: number) => {
    const d = (profile.timeDeltas[i] ?? 0) / 1000;
    t += d;
    const name = byId.get(id).callFrame.functionName;
    if (name === "(idle)" || name === "(root)") return void (cur && tasks.push(cur), (cur = null));
    cur ??= { t, dur: 0, fns: new Map() };
    cur.dur += d;
    const seen = new Set<string>();
    for (let c: number | undefined = id; c !== undefined; c = parent.get(c)) {
      const f = byId.get(c).callFrame;
      const k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber}:${f.columnNumber}`;
      if (!seen.has(k)) seen.add(k), cur.fns.set(k, (cur.fns.get(k) ?? 0) + d);
    }
  });
  for (const x of tasks.sort((a, b) => b.dur - a.dur).slice(0, 2)) {
    console.log(`slowest task ${Math.round(x.dur)}ms at ${Math.round(x.t)}ms`);
    [...x.fns].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(`  ${v.toFixed(1)} ${k}`));
  }
}

type Target = [key: string, ok: (v: any, throttled: boolean) => boolean, want: string];
const TARGETS: Target[] = [
  ["fps", (v, t) => v >= (t ? 30 : 58), "≥ 58 desktop / ≥ 30 throttled"],
  ["long_tasks", (v, t) => t || v === 0, "0 (desktop)"],
  ["main_ms_per_frame", (v, t) => v < (t ? 16 : 4), "< 4 ms (desktop)"],
  ["gpu_ms", (v) => v === "n/a" || v < 8, "< 8 ms"],
  ["draw_calls", (v) => v === "n/a" || v <= 10, "≤ 10"],
  ["heap_growth_mb", (v) => v < (LONG ? 5 : 3), "flat"],
  ["other_renders", (v) => v === "none", "only the dialog commits"],
  ["critical_js_kb", (v) => v <= 200, "≤ 200 KB (JS + CSS before the globe)"],
  ["first_data_kb", (v) => v <= 300, "≤ 300 KB (examples + world)"],
  ["hover_requests", (v) => v === 0, "0"],
  ["lcp_ms", (v, t) => t || v < 2000, "< 2 s"],
  ["cls", (v) => v === 0, "0"],
  ["inp_ms", (v, t) => v < (t ? 400 : 200), "< 200 ms"],
  ["gl_after_paint", (v) => v === true, "WebGL after first paint"],
  ["gl_leaked", (v) => v === 0, "all GPU objects freed"],
];

const b = await browser();
const results: Record<string, Result> = {};
try {
  for (const [name, throttle] of ([["desktop", 1], ["throttled 4x", 4]] as const).filter(([n]) => !process.env.PERF_ONLY || n.startsWith(process.env.PERF_ONLY))) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    results[name] = await scenario(page, cdp);
    await ctx.close();
  }
} finally {
  await b.close();
}

let failed = 0;
const keys = Object.keys(Object.values(results)[0]).filter((k) => !k.startsWith("_"));
const rows = keys.map((k) => {
  const t = TARGETS.find((x) => x[0] === k);
  const cells = Object.entries(results).map(([name, r]) => {
    const ok = !t || t[1](r[k], name !== "desktop");
    if (!ok) failed++;
    return `${r[k]}${ok ? "" : " ✗"}`;
  });
  return `| ${k} | ${cells.join(" | ")} | ${t?.[2] ?? ""} |`;
});
console.log(`perf:home ${BASE} (${useGpu ? "GPU" : "software GL"}, ${RUN_S} s per profile)\n`);
console.log(`| metric | ${Object.keys(results).join(" | ")} | target |\n|---|${Object.keys(results).map(() => "---|").join("")}---|`);
console.log(rows.join("\n"));
if (CI) console.log(JSON.stringify(results));
for (const [name, r] of Object.entries(results))
  console.log(`\n${name}:\n  leaks ${r._leaks}\n  hover requests ${r._hover_urls || "none"}\n  critical ${r._critical}\n  long frames ${r._loaf || "none"}\n  frames > 100 ms\n    ${r._loaf_big || "none"}\n  shifts ${r._shifts || "none"}`);
console.log(failed ? `\n${failed} target(s) missed` : "\nall targets met");
process.exit(failed ? 1 : 0);
