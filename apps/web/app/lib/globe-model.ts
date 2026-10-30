// Pure data shaping for the home globe: density grids, focus falloff, rotation speed and
// great-circle maths. No DOM, no three.js, so the server and unit tests can use it.

// Density grid: equirectangular, GRID_W × GRID_H cells (2° each), row 0 at +90° latitude.
export const GRID_W = 180;
export const GRID_H = 90;
export const CELL_DEG = 360 / GRID_W;
// Kernel width for turning coarse fan points into smooth hills.
export const KERNEL_DEG = 2.4;
const KERNEL_REACH = 3; // in kernel widths
export const DENSITY_GAMMA = 0.65;

// Focus: data within FOCUS_INNER_DEG of the view centre is sharp; it fades out by FOCUS_OUTER_DEG.
export const FOCUS_INNER_DEG = 25;
export const FOCUS_OUTER_DEG = 35;

// Rotation speed (degrees of longitude per second): fast where there is no fan data, slow where it's dense.
export const SPEED_MAX = 9;
export const SPEED_MIN = 0.8;
const SPEED_DENSITY_KNEE = 0.1; // density at which the globe is half-way between max and min speed

export type FanPoint = [lat: number, lon: number, weight: number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export function cellIndex(lat: number, lon: number) {
  const x = ((Math.floor((lon + 180) / CELL_DEG) % GRID_W) + GRID_W) % GRID_W;
  const y = Math.min(GRID_H - 1, Math.max(0, Math.floor((90 - lat) / CELL_DEG)));
  return y * GRID_W + x;
}

// Gaussian kernel density of the fan points on the grid, normalised to 0–255 (peak = 255, gamma-lifted).
// Longitude wraps; distances shrink with cos(latitude) so hills stay round near the poles.
// exp(-t) for t in [0, EXP_MAX), tabulated: the kernel sum runs ~10⁵–10⁶ times per grid.
const EXP_MAX = 16, EXP_STEPS = 256;
const EXP_LUT = Float32Array.from({ length: EXP_MAX * EXP_STEPS }, (_, i) => Math.exp(-(i + 0.5) / EXP_STEPS));
export function densityGrid(points: FanPoint[], kernelDeg?: number, normalise?: true): Uint8Array;
export function densityGrid(points: FanPoint[], kernelDeg: number | undefined, normalise: false): Float32Array;
export function densityGrid(points: FanPoint[], kernelDeg = KERNEL_DEG, normalise = true): Uint8Array | Float32Array {
  const acc = new Float32Array(GRID_W * GRID_H);
  accumulateDensity(acc, points, 0, points.length, kernelDeg);
  return normalise ? normaliseDensity(acc) : acc;
}
// Kernel sum of points[from, to) into acc (raw, unnormalised).
export function accumulateDensity(acc: Float32Array, points: FanPoint[], from: number, to: number, kernelDeg = KERNEL_DEG) {
  const reach = Math.ceil((KERNEL_REACH * kernelDeg) / CELL_DEG);
  const twoS2 = 2 * kernelDeg * kernelDeg;
  for (let i = from; i < to; i++) {
    const p = points[i], lat = p[0], lon = p[1], w = p[2];
    if (!(w > 0)) continue;
    const cx = Math.floor((lon + 180) / CELL_DEG);
    const cy = Math.floor((90 - lat) / CELL_DEG);
    for (let dy = -reach; dy <= reach; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= GRID_H) continue;
      const cellLat = 90 - (y + 0.5) * CELL_DEG;
      const k = Math.cos((cellLat * Math.PI) / 180);
      for (let dx = -reach; dx <= reach; dx++) {
        const x = (((cx + dx) % GRID_W) + GRID_W) % GRID_W;
        const cellLon = -180 + (cx + dx + 0.5) * CELL_DEG;
        const dLat = cellLat - lat;
        const dLon = (cellLon - lon) * k;
        const t = (dLat * dLat + dLon * dLon) / twoS2;
        if (t < EXP_MAX) acc[y * GRID_W + x] += w * EXP_LUT[(t * EXP_STEPS) | 0];
      }
    }
  }
}
// 0–255 with a gamma below 1, which lifts smaller fan bases (e.g. an act's home country next to a
// huge US base).
export function normaliseDensity(acc: Float32Array): Uint8Array<ArrayBuffer> {
  let max = 0;
  for (let i = 0; i < acc.length; i++) if (acc[i] > max) max = acc[i];
  const out = new Uint8Array(new ArrayBuffer(acc.length));
  if (max === 0) return out;
  for (let i = 0; i < acc.length; i++) out[i] = Math.round((acc[i] / max) ** DENSITY_GAMMA * 255);
  return out;
}
// The raw kernel sum, in slices of about `sliceMs`, yielding between them (main-thread callers:
// a cold first call over a few thousand points can take 40+ ms).
export async function densityGridSliced(points: FanPoint[], kernelDeg = KERNEL_DEG, yieldNow: () => Promise<void>, sliceMs = 8): Promise<Float32Array> {
  const acc = new Float32Array(GRID_W * GRID_H);
  let i = 0, step = 64;
  while (i < points.length) {
    const t0 = performance.now();
    while (i < points.length && performance.now() - t0 < sliceMs) {
      const to = Math.min(points.length, i + step);
      accumulateDensity(acc, points, i, to, kernelDeg);
      i = to;
    }
    if (i < points.length) await yieldNow();
  }
  return acc;
}

// Bilinear sample of a grid (0–1), used for the speed lookup under the view centre.
export function sampleGrid(grid: Uint8Array, lat: number, lon: number) {
  const fx = (((lon + 180) / CELL_DEG - 0.5) % GRID_W + GRID_W) % GRID_W;
  const fy = Math.min(GRID_H - 1, Math.max(0, (90 - lat) / CELL_DEG - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = (x0 + 1) % GRID_W, y1 = Math.min(GRID_H - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const v = (x: number, y: number) => grid[y * GRID_W + x] / 255;
  return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
}

// The focused example's own region should read even when the act's biggest fan base is elsewhere
// (AC/DC's Australian fans next to its US base): scale the grid so its peak within radiusDeg of the
// focus reaches REGION_TARGET, by at most REGION_GAIN_MAX.
export const REGION_TARGET = 0.85;
export const REGION_GAIN_MAX = 4;
export function regionalGain(grid: Uint8Array, lat: number, lon: number, radiusDeg: number) {
  let peak = 0;
  for (let y = 0; y < GRID_H; y++) {
    const cLat = 90 - (y + 0.5) * CELL_DEG;
    if (Math.abs(cLat - lat) > radiusDeg) continue;
    for (let x = 0; x < GRID_W; x++) {
      const v = grid[y * GRID_W + x];
      if (v > peak && angularDistanceDeg(lat, lon, cLat, -180 + (x + 0.5) * CELL_DEG) <= radiusDeg) peak = v;
    }
  }
  if (peak === 0) return 1;
  return Math.min(REGION_GAIN_MAX, Math.max(1, (REGION_TARGET * 255) / peak));
}
export function scaleGrid(grid: Uint8Array, gain: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(grid.length));
  for (let i = 0; i < grid.length; i++) out[i] = Math.min(255, Math.round(grid[i] * gain));
  return out;
}

// Merge a newer grid into the history (element-wise max), so shown examples stay on the globe.
export function mergeMax(into: Uint8Array, grid: Uint8Array) {
  for (let i = 0; i < into.length; i++) if (grid[i] > into[i]) into[i] = grid[i];
  return into;
}

// 1 at the view centre, 0 far away; smooth between FOCUS_INNER_DEG and FOCUS_OUTER_DEG.
export function focusWeight(angleDeg: number, inner = FOCUS_INNER_DEG, outer = FOCUS_OUTER_DEG) {
  return 1 - smoothstep(inner, outer, angleDeg);
}

// Speed ∝ 1 / data density: fast over ocean and empty land, slow over dense fan areas.
export function speedForDensity(density: number) {
  const d = clamp01(density);
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * (SPEED_DENSITY_KNEE / (SPEED_DENSITY_KNEE + d));
}

// Exponential smoothing that is frame-rate independent (tau in seconds).
export function ease(current: number, target: number, dt: number, tau: number) {
  return target + (current - target) * Math.exp(-dt / tau);
}

// Signed shortest longitude step from a to b, in (-180, 180].
export function lonDelta(a: number, b: number) {
  let d = (((b - a) % 360) + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

const RAD = Math.PI / 180;

export function angularDistanceDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / RAD;
}

// Unit vector for a lat/lon in three.js convention (y up, lon 0 facing +z).
export function toVec(lat: number, lon: number): [number, number, number] {
  const phi = lat * RAD, lam = lon * RAD;
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
}

// Arc height grows with the hop's length (short hops stay low, long ones rise) and never spikes.
export const ARC_LIFT_PER_RAD = 0.32;
export const ARC_LIFT_MIN = 0.006;
export const ARC_LIFT_MAX = 0.11;
export const arcLift = (omegaRad: number) => Math.min(ARC_LIFT_MAX, Math.max(ARC_LIFT_MIN, ARC_LIFT_PER_RAD * omegaRad));

// Points along the great circle from a to b, lifted into a smooth arc (max lift at the middle).
export function arcPoints(a: { lat: number; lon: number }, b: { lat: number; lon: number }, segments = 48, base = 1) {
  const va = toVec(a.lat, a.lon), vb = toVec(b.lat, b.lon);
  const omega = Math.acos(Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
  const lift = arcLift(omega);
  const out: [number, number, number][] = [];
  const s = Math.sin(omega) || 1;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const k1 = omega ? Math.sin((1 - t) * omega) / s : 1 - t;
    const k2 = omega ? Math.sin(t * omega) / s : t;
    const r = base + lift * Math.sin(Math.PI * t);
    out.push([(va[0] * k1 + vb[0] * k2) * r, (va[1] * k1 + vb[1] * k2) * r, (va[2] * k1 + vb[2] * k2) * r]);
  }
  return out;
}

// Fill animation: the surface rises from the home city outward. t is 0→1 over the fill time,
// dist is the angular distance from home normalised to 0–1 (π = 1). Ease-out, never overshoots.
export const RIPPLE_SPREAD = 1.6; // how much later the far side starts than home
export function rippleGrow(t: number, dist: number) {
  const x = clamp01(t * (1 + RIPPLE_SPREAD) - clamp01(dist) * RIPPLE_SPREAD);
  return 1 - (1 - x) ** 3;
}

// While an example is on screen the globe keeps turning but stays near it: speed fades toward
// SPEED_MIN as the view drifts DWELL_DEG away from the example's focus city.
export const DWELL_DEG = 18;
export function dwellSpeed(speed: number, driftDeg: number) {
  return SPEED_MIN + (speed - SPEED_MIN) * (1 - smoothstep(DWELL_DEG * 0.4, DWELL_DEG, driftDeg));
}

// Stops in play order: the example's own route when given, else the "A → B → C" decision line,
// else the cities as listed. Only cities with coordinates survive.
type Stop = { name: string; lat: number; lon: number };
export function routeStops<C extends Stop>(cities: C[], route?: Stop[], lines: string[] = []): Stop[] {
  const byName = new Map(cities.map((c) => [c.name.toLowerCase(), c]));
  const pick = (names: string[]) => names.map((n) => byName.get(n.trim().toLowerCase())).filter((c): c is C => !!c);
  if (route && route.length >= 2 && route.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))) return route;
  for (const l of lines) {
    if (!l.includes("→")) continue;
    const r = pick(l.split("·")[0].split("→"));
    if (r.length >= 2) return r;
  }
  return cities;
}

// Zoom 0 = quarter-Earth framing, 1 = about city level (~300 km across). Log-spaced camera distance.
export const ZOOM_DIST_FAR = 3.1;
export const ZOOM_DIST_NEAR = 1.09;
export const zoomDistance = (z: number) => Math.exp(Math.log(ZOOM_DIST_FAR) + (Math.log(ZOOM_DIST_NEAR) - Math.log(ZOOM_DIST_FAR)) * clamp01(z));

// Fine detail for the zoomed or focused region: a FINE_N × FINE_N grid over a window around a
// whole-degree centre, so neighbourhood-level fan data (0.01°) shows its shape when zoomed in.
export const FINE_N = 256;
export const FINE_SPAN_DEG = 10; // window height; width is widened by 1/cos(lat) so cells stay square
export const FINE_KERNEL_DEG = 0.04;
const FINE_LOG_K = 60;
export type Box = { lat0: number; lon0: number; latSpan: number; lonSpan: number }; // lat0 = north edge
export function fineBox(lat: number, lon: number): Box {
  const cLat = Math.max(-80, Math.min(80, Math.round(lat)));
  const cLon = Math.round(lon);
  const lonSpan = Math.min(60, FINE_SPAN_DEG / Math.cos((cLat * Math.PI) / 180));
  return { lat0: cLat + FINE_SPAN_DEG / 2, lon0: cLon - lonSpan / 2, latSpan: FINE_SPAN_DEG, lonSpan };
}
// Kernel width for a point from its coordinate precision (its cell size): a 0.25° cell gets a
// ~0.18° kernel, a 0.01° metro cell the base kernel. Coarse cells then read as a smooth surface.
const PRECISION_KERNELS: [step: number, kernelDeg: number][] = [[0.5, 0.35], [0.25, 0.18], [0.1, 0.08], [0.05, 0.04]];
export function pointKernelDeg(lat: number, lon: number, base = FINE_KERNEL_DEG) {
  const on = (step: number) => Math.abs(lat / step - Math.round(lat / step)) < 1e-6 && Math.abs(lon / step - Math.round(lon / step)) < 1e-6;
  for (const [step, k] of PRECISION_KERNELS) if (on(step)) return Math.max(base, k);
  return base;
}
// Gaussian density inside a box (row 0 at the north edge), normalised to 0–255.
export function windowGrid(points: FanPoint[], box: Box, n = FINE_N, kernelDeg = FINE_KERNEL_DEG): Uint8Array<ArrayBuffer> {
  const acc = new Float32Array(n * n);
  const cy = box.latSpan / n, cx = box.lonSpan / n;
  const k = Math.cos(((box.lat0 - box.latSpan / 2) * Math.PI) / 180);
  for (const [lat, lon0, w] of points) {
    if (!(w > 0)) continue;
    // Points come at mixed precision (0.5° country cells, 0.01° metro cells): widen the kernel to
    // the point's own cell so coarse cells read as a smooth surface, not a lattice of dots.
    const k2 = pointKernelDeg(lat, lon0, kernelDeg);
    const twoS2 = 2 * k2 * k2;
    const reachY = Math.ceil((KERNEL_REACH * k2) / cy), reachX = Math.ceil((KERNEL_REACH * k2) / (cx * k));
    const lon = box.lon0 + ((((lon0 - box.lon0) % 360) + 360) % 360);
    const fy = (box.lat0 - lat) / cy, fx = (lon - box.lon0) / cx;
    if (fy < -reachY || fy > n + reachY || fx < -reachX || fx > n + reachX) continue;
    for (let y = Math.max(0, Math.floor(fy) - reachY); y <= Math.min(n - 1, Math.floor(fy) + reachY); y++) {
      const dLat = box.lat0 - (y + 0.5) * cy - lat;
      for (let x = Math.max(0, Math.floor(fx) - reachX); x <= Math.min(n - 1, Math.floor(fx) + reachX); x++) {
        const dLon = (box.lon0 + (x + 0.5) * cx - lon) * k;
        acc[y * n + x] += w * Math.exp(-(dLat * dLat + dLon * dLon) / twoS2);
      }
    }
  }
  let max = 0;
  for (const v of acc) if (v > max) max = v;
  const out = new Uint8Array(new ArrayBuffer(n * n));
  // Log scale: one busy downtown must not flatten every other neighbourhood to zero.
  if (max > 0) for (let i = 0; i < acc.length; i++) out[i] = Math.round((Math.log1p((acc[i] / max) * FINE_LOG_K) / Math.log1p(FINE_LOG_K)) * 255);
  return out;
}

// Base64 for the density grid over JSON (server → client). The density payload is two grids back
// to back: density, then the share of it that comes from thin-data countries (0–255).
export const gridToBase64 = (g: Uint8Array) => (typeof Buffer !== "undefined" ? Buffer.from(g).toString("base64") : btoa(String.fromCharCode(...g)));
export function gridFromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Playback: one state machine for auto-rotation and auto-advance on the home page.
// playing | paused-by-user (the pause button) | paused-by-interaction (holds such as a drag, a
// hovered marker or panel, focus in the panel, then RESUME_MS after the last one ends) | hidden
// (tab hidden or globe off-screen). Time left on the current example only runs while playing, so a
// pause continues where it stopped; `tick` advances once and restarts the clock, never twice.
export const RESUME_MS = 3000;
export type PlayState = "playing" | "paused-by-user" | "paused-by-interaction" | "hidden";
export type Playback = { dur: number; left: number; at: number; user: boolean; hidden: boolean; holds: readonly string[]; idleUntil: number };

export const playback = (dur: number, now: number, user = false): Playback => ({ dur, left: dur, at: now, user, hidden: false, holds: [], idleUntil: 0 });

export function playState(p: Playback, now: number): PlayState {
  if (p.hidden) return "hidden";
  if (p.user) return "paused-by-user";
  if (p.holds.length || now < p.idleUntil) return "paused-by-interaction";
  return "playing";
}

// Spend the playing time since the last event. Between events only the idle deadline can change
// the state, so the playing part is [max(at, idleUntil), now].
function settle(p: Playback, now: number): Playback {
  if (now <= p.at) return p;
  if (p.hidden || p.user || p.holds.length) return { ...p, at: now };
  const ran = Math.max(0, now - Math.max(p.at, p.idleUntil));
  return { ...p, left: Math.max(0, p.left - ran), at: now };
}

export function hold(p: Playback, reason: string, now: number): Playback {
  const s = settle(p, now);
  return s.holds.includes(reason) ? s : { ...s, holds: [...s.holds, reason] };
}
export function release(p: Playback, reason: string, now: number): Playback {
  const s = settle(p, now);
  if (!s.holds.includes(reason)) return s;
  return { ...s, holds: s.holds.filter((h) => h !== reason), idleUntil: Math.max(s.idleUntil, now + RESUME_MS) };
}
// A one-off interaction (wheel, zoom button, a tap): pauses for RESUME_MS.
export const nudge = (p: Playback, now: number): Playback => ({ ...settle(p, now), idleUntil: now + RESUME_MS });
// The pause/play button. Play starts right away (no idle wait); the clock keeps its time left.
export function toggleUser(p: Playback, now: number): Playback {
  const s = settle(p, now);
  return s.user ? { ...s, user: false, idleUntil: 0 } : { ...s, user: true };
}
export const setHidden = (p: Playback, hidden: boolean, now: number): Playback => (p.hidden === hidden ? p : { ...settle(p, now), hidden });
// A new example is on screen (auto or picked by hand): its full time starts now.
export const restart = (p: Playback, now: number): Playback => ({ ...settle(p, now), left: p.dur, at: now });

export function tick(p: Playback, now: number): { p: Playback; advance: boolean; left: number } {
  const s = settle(p, now);
  if (s.left > 0 || playState(s, now) !== "playing") return { p: s, advance: false, left: s.left / s.dur };
  return { p: { ...s, left: s.dur, at: now }, advance: true, left: 1 };
}

// ---- Home page store: one reducer, three slices (story, inspect, playback) ----
// Story card: the auto-advancing example; changes only on ADVANCE/GOTO. Inspect panel: shows the
// story's example until a marker is hovered/tapped/focused, then exactly that one example; it falls
// back to the story INSPECT_GRACE_MS after leaving. Single writer: while inspect is active (incl. its
// grace) the story is frozen and an advance waits, then fires once. Concurrent changes queue behind
// one transition token (latest wins). Every slice carries a version; async work checks it.
// Pure and time-explicit (`now` on every event) so it's unit-tested; the store owns the only clock.
export const INSPECT_GRACE_MS = 1000; // the dialog returns to the story ~1 s after leaving
export const SWAP_MIN_MS = 150; // at most one inspect swap per this, latest target wins
export const TRANSITION_MS = 250; // one panel's crossfade; the other waits for it

export type HomeEvent =
  | { type: "INIT"; ids: string[]; dur: number; reduced: boolean }
  | { type: "GOTO"; index: number }
  | { type: "HOVER"; id: string | null; from?: string } // the zone under the pointer (null = none; `from` = the zone left, so a late leave is ignored)
  | { type: "TAP"; id: string | null } // touch/click: pins (null = tap on empty globe → close)
  | { type: "FOCUS"; id: string | null } // keyboard focus on a marker
  | { type: "PANEL"; over: boolean } // pointer/focus inside the inspect panel keeps it
  | { type: "EXPAND"; on?: boolean }
  | { type: "CLOSE" }
  | { type: "HOLD"; reason: string }
  | { type: "RELEASE"; reason: string }
  | { type: "NUDGE" }
  | { type: "TOGGLE" }
  | { type: "HIDDEN"; hidden: boolean }
  | { type: "TICK" };

export type StorySlice = { ids: string[]; index: number; id: string | null; done: boolean; version: number; pendingAdvance: boolean };
export type InspectSlice = {
  id: string | null; // the example shown because of the pointer (null = following the story)
  target: string | null; // latest wanted (rate-limited into `id`)
  pinned: boolean;
  over: boolean; // pointer/focus inside the panel
  mode: "compact" | "expanded";
  leftAt: number; // when the pointer left the last zone (grace start)
  lastSwapAt: number;
  version: number;
};
export type HomeState = {
  story: StorySlice;
  inspect: InspectSlice;
  playback: Playback;
  busy: { owner: "story" | "inspect" | null; until: number }; // the one transition token
};

export const initialHome = (now: number): HomeState => ({
  story: { ids: [], index: 0, id: null, done: false, version: 0, pendingAdvance: false },
  inspect: { id: null, target: null, pinned: false, over: false, mode: "compact", leftAt: -Infinity, lastSwapAt: -Infinity, version: 0 },
  playback: playback(7500, now),
  busy: { owner: null, until: -Infinity },
});

// Inspect is active while something is (or was, within the grace) under the pointer.
// The pointer over the dialog while it shows the story isn't inspecting (it only pauses playback),
// so the story's own controls (Next, dots) keep working.
export const inspectActive = (s: HomeState, now: number) =>
  s.inspect.id !== null || s.inspect.target !== null || s.inspect.pinned || now - s.inspect.leftAt < INSPECT_GRACE_MS;
// Which example the globe's route/towers follow: whoever owns the current change.
export const globeFocusId = (s: HomeState) => s.inspect.id ?? s.story.id;
// What the inspect panel shows: its own example, or the story's when idle.
export const inspectShownId = (s: HomeState) => s.inspect.id ?? s.story.id;

const tokenFree = (s: HomeState, who: "story" | "inspect", now: number) => s.busy.owner === who || now >= s.busy.until;
const take = (s: HomeState, who: "story" | "inspect", now: number): HomeState => ({ ...s, busy: { owner: who, until: now + TRANSITION_MS } });

function setStoryIndex(s: HomeState, index: number, now: number): HomeState {
  // The play order is one geographic path; the walk wraps at the end (every example once per lap).
  const { ids } = s.story;
  const done = !ids.length;
  const k = done ? 0 : ((index % ids.length) + ids.length) % ids.length;
  const story = { ...s.story, index: k, id: done ? null : ids[k], done, version: s.story.version + 1, pendingAdvance: false };
  return take({ ...s, story, playback: restart(s.playback, now) }, "story", now);
}

// Apply the wanted inspect target if the rate limit, the grace and the token allow.
function settleInspect(s: HomeState, now: number): HomeState {
  const i = s.inspect;
  const want = i.target ?? (i.pinned || i.over || now - i.leftAt < INSPECT_GRACE_MS ? i.id : null);
  if (want === i.id) return s;
  if (now - i.lastSwapAt < SWAP_MIN_MS || !tokenFree(s, "inspect", now)) return s;
  const inspect = { ...i, id: want, mode: want === null ? ("compact" as const) : i.mode, lastSwapAt: now, version: i.version + 1 };
  return take({ ...s, inspect }, "inspect", now);
}

// When the store next needs a TICK (the clock is event-driven, not per frame): the advance, the
// end of an idle pause, the inspect grace, a rate-limited swap, the transition token. Extra wakeups
// are harmless; a missed one would stall, so every timed rule is listed. Infinity = nothing pending.
export function nextDeadline(s: HomeState, now: number): number {
  const p = s.playback, i = s.inspect;
  let d = Infinity;
  const at = (t: number) => {
    if (t > now && t < d) d = t;
  };
  if (!p.hidden && !p.user && !p.holds.length && s.story.ids.length > 1) at(Math.max(p.at, p.idleUntil, now) + Math.max(0, p.left - Math.max(0, now - Math.max(p.at, p.idleUntil))));
  at(p.idleUntil);
  if (i.id !== null && i.target === null && !i.pinned && !i.over) at(i.leftAt + INSPECT_GRACE_MS);
  if ((i.target ?? null) !== i.id) at(i.lastSwapAt + SWAP_MIN_MS);
  at(s.busy.until);
  return d;
}

// Fraction of the current example's time left (0–1) at `now`, without allocating (for the ring).
export function timeLeft(p: Playback, now: number): number {
  if (p.hidden || p.user || p.holds.length) return p.left / p.dur;
  return Math.max(0, p.left - Math.max(0, now - Math.max(p.at, p.idleUntil))) / p.dur;
}

// Playback holds while inspect is active; when it goes idle, a waiting advance fires once.
function syncHolds(s: HomeState, now: number): HomeState {
  const active = inspectActive(s, now);
  const held = s.playback.holds.includes("inspect");
  if (active && !held) return { ...s, playback: hold(s.playback, "inspect", now) };
  if (!active && held) s = { ...s, playback: release(s.playback, "inspect", now) };
  if (!active && s.story.pendingAdvance && tokenFree(s, "story", now)) s = setStoryIndex(s, s.story.index + 1, now);
  return s;
}

export function homeReduce(s: HomeState, e: HomeEvent, now: number): HomeState {
  const i = s.inspect;
  switch (e.type) {
    case "INIT": {
      const pb = playback(e.dur, now, e.reduced);
      return { ...initialHome(now), story: { ids: e.ids, index: 0, id: e.ids[0] ?? null, done: !e.ids.length, version: s.story.version + 1, pendingAdvance: false }, playback: pb, inspect: { ...i, id: null, target: null, pinned: false, version: i.version + 1 } };
    }
    case "GOTO": {
      // Next / dots are explicit: they end any inspect (the dialog goes back to the story) and move
      // the story at once, even mid-transition. Only a timer-driven advance waits (single writer).
      const cleared = i.id !== null || i.target !== null || i.pinned;
      const inspect = cleared ? { ...i, id: null, target: null, pinned: false, mode: "compact" as const, leftAt: -Infinity, lastSwapAt: now, version: i.version + 1 } : i;
      return syncHolds(setStoryIndex({ ...s, inspect, busy: { owner: null, until: -Infinity } }, e.index, now), now);
    }
    case "HOVER":
    case "FOCUS": {
      if (i.pinned && e.type === "HOVER") return s; // a tapped example stays until closed
      if (e.type === "HOVER" && e.id === null && e.from !== undefined && e.from !== i.target) return s; // stale leave
      if (e.id === i.target) return syncHolds(settleInspect(s, now), now);
      const leftAt = e.id !== null ? -Infinity : i.target !== null ? now : i.leftAt;
      return syncHolds(settleInspect({ ...s, inspect: { ...i, target: e.id, leftAt } }, now), now);
    }
    case "TAP":
      if (e.id === null) return homeReduce(s, { type: "CLOSE" }, now);
      return syncHolds(settleInspect({ ...s, inspect: { ...i, target: e.id, pinned: true, mode: "expanded", leftAt: -Infinity } }, now), now);
    case "PANEL": {
      // Pointer/focus in the dialog: keeps an inspected example (grace starts on leave) and pauses
      // playback while reading; over the story it never blocks the story's own controls.
      const leftAt = e.over ? i.leftAt : i.id !== null || i.target !== null ? now : i.leftAt;
      const playback = e.over ? hold(s.playback, "panel", now) : release(s.playback, "panel", now);
      return syncHolds({ ...s, playback, inspect: { ...i, over: e.over, leftAt } }, now);
    }
    case "EXPAND":
      return { ...s, inspect: { ...i, mode: (e.on ?? i.mode === "compact") ? "expanded" : "compact", version: i.version + 1 } };
    case "CLOSE":
      return syncHolds(settleInspect({ ...s, inspect: { ...i, target: null, pinned: false, over: false, leftAt: -Infinity } }, now), now);
    case "HOLD":
      return { ...s, playback: hold(s.playback, e.reason, now) };
    case "RELEASE":
      return { ...s, playback: release(s.playback, e.reason, now) };
    case "NUDGE":
      return { ...s, playback: nudge(s.playback, now) };
    case "TOGGLE":
      return { ...s, playback: toggleUser(s.playback, now) };
    case "HIDDEN":
      return { ...s, playback: setHidden(s.playback, e.hidden, now) };
    case "TICK": {
      s = syncHolds(settleInspect(s, now), now);
      if (s.story.done || s.story.ids.length < 2) return s;
      const t = tick(s.playback, now);
      s = t.p === s.playback ? s : { ...s, playback: t.p };
      if (!t.advance) return s;
      // Single writer: an advance during inspect (or another transition) waits, then fires once.
      if (inspectActive(s, now) || !tokenFree(s, "story", now)) return { ...s, story: { ...s.story, pendingAdvance: true } };
      return setStoryIndex(s, s.story.index + 1, now);
    }
  }
}

// ---- Terrain: a baked fan-density heightmap per region (pure; used by the export and in-browser) ----
// Height and colour encode the same density: tour cities sit on peaks, a ridge runs along the route
// legs so the tour reads connected, and the skipped city is a lower peak. Row 0 = north edge,
// column 0 = west edge; values 0–255 (gamma-lifted so mid density reads as hills, not plains).
export type BakeOptions = {
  bbox: Box; // lat0 = north edge, lon0 = west edge
  width: number;
  height: number;
  kernelDeg: number; // fan point blur
  route?: { lat: number; lon: number }[]; // play order: ridge along each leg
  stops?: { lat: number; lon: number; strength: number }[]; // 0–100: peaks at the tour cities
  skipped?: { lat: number; lon: number };
  ridge?: number; // ridge height as a share of the lower endpoint's peak (default 0.45)
  gamma?: number;
  land?: LandPoly[]; // clip to land (short coastal fade): no terrain over the sea
};
export const BAKE_GAMMA = 0.85;
export const BAKE_RIDGE = 0.45;
export const SKIPPED_PEAK = 0.4; // of the tallest stop
// Reused Float32 buffers per slot (bakes run one at a time per thread), cleared on hand-out.
const scratchBufs: Float32Array[] = [];
function scratch(slot: number, n: number): Float32Array {
  let b = scratchBufs[slot];
  if (!b || b.length < n) b = scratchBufs[slot] = new Float32Array(n);
  const v = b.subarray(0, n);
  v.fill(0);
  return v;
}
// The value at rank floor(n × q) of the sorted array (or its max when that is 0; 1 when all 0),
// without sorting it: zeros are counted, the non-zero values go through quickselect.
function percentile(a: Float32Array, q: number): number {
  const k = Math.floor(a.length * q);
  const nz = scratch(2, a.length);
  let m = 0, max = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) (nz[m++] = a[i]), a[i] > max && (max = a[i]);
  const zeros = a.length - m;
  if (k < zeros) return max || 1;
  let lo = 0, hi = m - 1;
  const t = k - zeros;
  while (lo < hi) {
    const pivot = nz[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (nz[i] < pivot) i++;
      while (nz[j] > pivot) j--;
      if (i <= j) {
        const x = nz[i];
        (nz[i] = nz[j]), (nz[j] = x), i++, j--;
      }
    }
    if (t <= j) hi = j;
    else if (t >= i) lo = i;
    else break;
  }
  return nz[t] || max || 1;
}
// Fan points for a bake: tuples, or flat [lat, lon, weight, …] (what the worker gets, transferred).
export type BakePoints = FanPoint[] | Float64Array;
export function packPoints(points: FanPoint[]): Float64Array<ArrayBuffer> {
  const out = new Float64Array(points.length * 3);
  for (let i = 0; i < points.length; i++) (out[i * 3] = points[i][0]), (out[i * 3 + 1] = points[i][1]), (out[i * 3 + 2] = points[i][2]);
  return out;
}
export function bakeDensity(points: BakePoints, o: BakeOptions): Uint8Array<ArrayBuffer> {
  return bakeTerrain(points, o).h8;
}
export function bakeTerrain(points: BakePoints, o: BakeOptions): Baked {
  const it = bakeSteps(points, o);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
// The same bake in slices: yields between groups of points and between phases, so a main-thread
// fallback can run it a few ms at a time (the worker just runs it through). One bake at a time per
// thread (shared scratch buffers); an abandoned bake is simply never resumed.
export function* bakeSteps(points: BakePoints, o: BakeOptions): Generator<void, Baked, void> {
  const { bbox, width: w, height: h } = o;
  const acc = scratch(0, w * h);
  const cy = bbox.latSpan / h, cx = bbox.lonSpan / w;
  const kLat = Math.cos(((bbox.lat0 - bbox.latSpan / 2) * Math.PI) / 180);
  // Radial quartic (biweight) kernel of support radius R (degrees of latitude; longitude scaled by
  // cos(lat)): (1 − r²/R²)², full support, smooth to zero (no rim, no square corners), no exp.
  const dxs = scratch(1, w);
  const splat = (lat: number, lon0: number, wgt: number, R: number, max = false) => {
    const lon = bbox.lon0 + ((((lon0 - bbox.lon0) % 360) + 360) % 360);
    const ry = Math.ceil(R / cy), rx = Math.ceil(R / (cx * kLat)), inv = 1 / (R * R);
    const fy = (bbox.lat0 - lat) / cy, fx = (lon - bbox.lon0) / cx;
    const y0 = Math.floor(fy), x0 = Math.floor(fx);
    const ya = Math.max(0, y0 - ry), yb = Math.min(h - 1, y0 + ry), xa = Math.max(0, x0 - rx), xb = Math.min(w - 1, x0 + rx);
    if (ya > yb || xa > xb) return;
    const nx = xb - xa + 1;
    for (let x = 0; x < nx; x++) {
      const d = (x + xa + 0.5 - fx) * cx * kLat;
      dxs[x] = d * d * inv;
    }
    for (let y = ya; y <= yb; y++) {
      const d = (y + 0.5 - fy) * cy, qy = 1 - d * d * inv;
      if (qy <= 0) continue;
      const row = y * w + xa;
      for (let x = 0; x < nx; x++) {
        const q = qy - dxs[x];
        if (q <= 0) continue;
        const v = wgt * q * q;
        if (max) acc[row + x] = Math.max(acc[row + x], v);
        else acc[row + x] += v;
      }
    }
  };
  // Adaptive bandwidth: each point's radius follows the data spacing around it (KNN-th nearest
  // neighbour × KNN_SCALE), at least its own cell (coarse country cells read as a smooth surface)
  // and MIN_R_PX pixels, at most the region kernel. Dense metro points stay sharp; one disc per
  // city never happens.
  const flat = points instanceof Float64Array, n = flat ? points.length / 3 : points.length;
  const P = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) (P[i * 3] = flat ? points[i * 3] : points[i][0]), (P[i * 3 + 1] = flat ? points[i * 3 + 1] : points[i][1]), (P[i * 3 + 2] = flat ? points[i * 3 + 2] : points[i][2]);
  const rMin = MIN_R_PX * cy, rMax = Math.max(rMin, o.kernelDeg * MAX_R_SCALE);
  const radius = adaptiveRadii(P, kLat, rMin, rMax);
  yield;
  for (let i = 0; i < n; i++) {
    const wt = P[i * 3 + 2];
    if (wt > 0) splat(P[i * 3], P[i * 3 + 1], wt, Math.max(radius[i], pointCellDeg(P[i * 3], P[i * 3 + 1]) * CELL_R_SCALE));
    if (i % 128 === 127) yield;
  }
  yield;
  // Normalise the fan field to 0–1 by its own 99.8th percentile (one dense metro doesn't flatten the rest).
  const p99 = percentile(acc, 0.998);
  // Soft knee instead of a hard clip, so dense metros round off rather than plateau.
  for (let i = 0; i < acc.length; i++) if (acc[i] !== 0) acc[i] = 1 - Math.exp(-1.6 * (acc[i] / p99)); // < 1 everywhere: no plateau
  yield;
  // Shape: the tour stops are the summits, shaped by their own fan data: within reach of a stop the
  // field is lifted so its local top reaches the stop's height (the metro keeps its detail), plus a
  // small summit right on the city. A narrow ridge along the legs, a lower peak at the skipped city.
  const peakR = Math.max(o.kernelDeg * 1.6, bbox.latSpan / 40) * 2.5;
  const stops = o.stops ?? [];
  const top = Math.max(0.01, ...stops.map((s) => s.strength / 100));
  for (const st of stops) liftAround(acc, w, h, bbox, kLat, st.lat, st.lon, 0.55 + 0.45 * (st.strength / 100) / top, peakR);
  for (const st of stops) splat(st.lat, st.lon, (0.55 + 0.45 * (st.strength / 100) / top) * 0.9, peakR * 0.3, true);
  const route = o.route ?? [];
  const ridge = o.ridge ?? BAKE_RIDGE;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const ha = stops.find((s) => s.lat === a.lat && s.lon === a.lon)?.strength ?? 70;
    const hb = stops.find((s) => s.lat === b.lat && s.lon === b.lon)?.strength ?? 70;
    const wgt = (ridge * Math.min(ha, hb)) / 100 / top;
    ridgeAlong(acc, w, h, bbox, kLat, a, b, wgt, peakR * 0.3);
  }
  if (o.skipped) splat(o.skipped.lat, o.skipped.lon, SKIPPED_PEAK, peakR * 0.3, true);
  yield;
  if (o.land) {
    const mask = rasterLand(o.land, bbox, w, h);
    yield;
    let landCells = 0;
    for (let i = 0; i < mask.length; i++) landCells += mask[i];
    // All sea → nothing; all land → no fade; else a crisp coast with the fade on the land side only.
    if (!landCells) acc.fill(0);
    else if (landCells < mask.length) {
      const fade = coastFade(mask, w, h, Math.max(1, Math.round(w * COAST_FADE)));
      yield;
      for (let i = 0; i < acc.length; i++) if (acc[i] !== 0) acc[i] *= mask[i] ? fade[i] : 0;
    }
  }
  const g = o.gamma ?? BAKE_GAMMA;
  // Heights: 8-bit for the CPU (arcs, pop-ups) and half floats for the GPU (no terracing on slopes);
  // f = the same 0–255 field in float for the relief shading (valid until the next bake).
  const h8 = new Uint8Array(new ArrayBuffer(w * h)), hf = new Uint16Array(new ArrayBuffer(w * h * 2)), f = scratch(5, w * h);
  for (let i = 0; i < acc.length; i++)
    if (acc[i] > 0) {
      const v = Math.min(1, acc[i]) ** g;
      f[i] = v * 255;
      h8[i] = Math.round(v * 255);
      hf[i] = toHalf(v);
    }
  return { h8, hf, f };
}
export type Baked = { h8: Uint8Array<ArrayBuffer>; hf: Uint16Array<ArrayBuffer>; f: Float32Array };
const MIN_R_PX = 3; // smallest kernel radius, in heightmap pixels
const MAX_R_SCALE = 2.5; // largest radius = region kernel × this (≈ the old 3σ reach)
const KNN = 6, KNN_SCALE = 1.8; // radius ≈ 1.8 × distance to the 6th nearest point
const CELL_R_SCALE = 1.6; // never narrower than 1.6 × the point's own cell (0.25°/0.5° country cells)
// The point's cell size from its coordinate precision (0.5°, 0.25°, 0.1°, 0.05° grids; else 0).
function pointCellDeg(lat: number, lon: number) {
  for (const [step] of PRECISION_KERNELS) if (Math.abs(lat / step - Math.round(lat / step)) < 1e-6 && Math.abs(lon / step - Math.round(lon / step)) < 1e-6) return step;
  return 0;
}
// Distance to the KNN-th nearest neighbour per point (lon scaled by kLat), via a uniform grid hash.
function adaptiveRadii(P: Float64Array, kLat: number, rMin: number, rMax: number): Float64Array {
  const n = P.length / 3, out = new Float64Array(n).fill(rMax);
  if (!n) return out;
  const cell = rMax / KNN_SCALE; // search ±1 cell = up to rMax
  const grid = new Map<number, number[]>();
  const key = (gx: number, gy: number) => gx * 100003 + gy;
  const gxOf = (i: number) => Math.floor((P[i * 3 + 1] * kLat) / cell), gyOf = (i: number) => Math.floor(P[i * 3] / cell);
  for (let i = 0; i < n; i++) {
    const k = key(gxOf(i), gyOf(i));
    let b = grid.get(k);
    if (!b) grid.set(k, (b = []));
    b.push(i);
  }
  const best = new Float64Array(KNN);
  for (let i = 0; i < n; i++) {
    best.fill(Infinity);
    const gx = gxOf(i), gy = gyOf(i), lat = P[i * 3], lon = P[i * 3 + 1];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const b = grid.get(key(gx + dx, gy + dy));
        if (!b) continue;
        for (const j of b) {
          if (j === i) continue;
          const a = P[j * 3] - lat, c = (P[j * 3 + 1] - lon) * kLat, d2 = a * a + c * c;
          if (d2 >= best[KNN - 1]) continue;
          let m = KNN - 1;
          while (m > 0 && best[m - 1] > d2) (best[m] = best[m - 1]), m--;
          best[m] = d2;
        }
      }
    if (Number.isFinite(best[KNN - 1])) out[i] = Math.min(rMax, Math.max(rMin, Math.sqrt(best[KNN - 1]) * KNN_SCALE));
  }
  return out;
}
// A ridge along one leg: height × quartic(distance to the segment / R), max-combined. A smooth
// crest (a chain of bumps would scallop under the shading).
function ridgeAlong(acc: Float32Array, w: number, h: number, bbox: Box, kLat: number, a: { lat: number; lon: number }, b: { lat: number; lon: number }, wgt: number, R: number) {
  const cy = bbox.latSpan / h, cx = bbox.lonSpan / w;
  const px = (lon: number) => (((((lon - bbox.lon0) % 360) + 360) % 360)) / cx; // pixel x of a longitude
  const ax = px(a.lon), ay = (bbox.lat0 - a.lat) / cy;
  const bx = ax + (lonDelta(a.lon, b.lon) / cx), by = (bbox.lat0 - b.lat) / cy;
  // Work in degrees on the ground (x scaled by cos lat) so R is isotropic.
  const sx = cx * kLat, sy = cy;
  const ex = (bx - ax) * sx, ey = (by - ay) * sy, len2 = ex * ex + ey * ey || 1e-12, inv = 1 / (R * R);
  const rx = Math.ceil(R / sx), ry = Math.ceil(R / sy);
  const xa = Math.max(0, Math.floor(Math.min(ax, bx)) - rx), xb = Math.min(w - 1, Math.ceil(Math.max(ax, bx)) + rx);
  const ya = Math.max(0, Math.floor(Math.min(ay, by)) - ry), yb = Math.min(h - 1, Math.ceil(Math.max(ay, by)) + ry);
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++) {
      const vx = (x + 0.5 - ax) * sx, vy = (y + 0.5 - ay) * sy;
      const t = Math.max(0, Math.min(1, (vx * ex + vy * ey) / len2));
      const dx = vx - t * ex, dy = vy - t * ey, q = 1 - (dx * dx + dy * dy) * inv;
      if (q > 0) acc[y * w + x] = Math.max(acc[y * w + x], wgt * q * q);
    }
}
// Lift the field around a stop so its local top reaches `target`, fading out by radius R (quartic).
function liftAround(acc: Float32Array, w: number, h: number, bbox: Box, kLat: number, lat: number, lon0: number, target: number, R: number) {
  const cy = bbox.latSpan / h, cx = bbox.lonSpan / w;
  const lon = bbox.lon0 + ((((lon0 - bbox.lon0) % 360) + 360) % 360);
  const fy = (bbox.lat0 - lat) / cy, fx = (lon - bbox.lon0) / cx;
  const ry = Math.ceil(R / cy), rx = Math.ceil(R / (cx * kLat));
  const ya = Math.max(0, Math.floor(fy) - ry), yb = Math.min(h - 1, Math.floor(fy) + ry), xa = Math.max(0, Math.floor(fx) - rx), xb = Math.min(w - 1, Math.floor(fx) + rx);
  if (ya > yb || xa > xb) return;
  // The local top, weighted towards the city (a big neighbour metro shouldn't set the scale).
  let localTop = 0;
  const inv = 1 / (R * R);
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++) {
      const a = (y + 0.5 - fy) * cy, b = (x + 0.5 - fx) * cx * kLat, q = 1 - (a * a + b * b) * inv * 4; // inner half
      if (q > 0) localTop = Math.max(localTop, acc[y * w + x]);
    }
  if (localTop < 0.02 || localTop >= target) return;
  const gain = target / localTop - 1;
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++) {
      const a = (y + 0.5 - fy) * cy, b = (x + 0.5 - fx) * cx * kLat, q = 1 - (a * a + b * b) * inv;
      if (q > 0) acc[y * w + x] *= 1 + gain * q * q;
    }
}
// Float → IEEE half (for HalfFloatType textures), round-to-nearest; inputs are 0–1.
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0], e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff, sgn = (x >>> 16) & 0x8000;
  if (e <= 0) return e < -10 ? sgn : sgn | (((m | 0x800000) >> (1 - e)) + 0x1000) >> 13;
  if (e >= 31) return sgn | 0x7c00;
  return sgn | ((e << 10) + ((m + 0x1000) >> 13));
}

// ---- Land mask: land polygons rasterised into the bake box (even-odd scanline, pure JS so the
// worker and the export share it). Rings are flat [lon, lat, …], unwrapped across the antimeridian.
export type LandPoly = { rings: Float32Array[]; w: number; e: number; s: number; n: number };
export const COAST_FADE = 0.014; // coastal fade, as a share of the bake width (~4 px at 256)
// Polygons from GeoJSON-style coordinates ([lon, lat] rings, as topojson-client's feature() gives).
export function landPolys(polygons: number[][][][]): LandPoly[] {
  return polygons.map((poly) => {
    const rings = poly.map((ring) => {
      const out = new Float32Array(ring.length * 2);
      let offset = 0;
      ring.forEach(([lon, lat], i) => {
        if (i) {
          const prev = ring[i - 1][0];
          if (lon - prev > 180) offset -= 360;
          else if (prev - lon > 180) offset += 360;
        }
        out[i * 2] = lon + offset;
        out[i * 2 + 1] = lat;
      });
      return out;
    });
    let w = Infinity, e = -Infinity, so = Infinity, n = -Infinity;
    const r0 = rings[0];
    for (let i = 0; i < r0.length; i += 2) (w = Math.min(w, r0[i])), (e = Math.max(e, r0[i])), (so = Math.min(so, r0[i + 1])), (n = Math.max(n, r0[i + 1]));
    return { rings, w, e, s: so, n };
  });
}
// 1 on land, 0 at sea; row 0 = north edge.
export function rasterLand(polys: LandPoly[], box: Box, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const south = box.lat0 - box.latSpan, east = box.lon0 + box.lonSpan;
  // Edges in pixel space (x0, y0, x1, y1), for every polygon (and ±360° copy) touching the box.
  const edges: number[] = [];
  for (const p of polys) {
    if (p.n < south || p.s > box.lat0) continue;
    for (const shift of [-360, 0, 360]) {
      if (p.e + shift < box.lon0 || p.w + shift > east) continue;
      for (const r of p.rings)
        for (let i = 0, n = r.length / 2; i < n; i++) {
          const j = (i + 1) % n;
          edges.push(((r[i * 2] + shift - box.lon0) / box.lonSpan) * w, ((box.lat0 - r[i * 2 + 1]) / box.latSpan) * h, ((r[j * 2] + shift - box.lon0) / box.lonSpan) * w, ((box.lat0 - r[j * 2 + 1]) / box.latSpan) * h);
        }
    }
  }
  // Bucket each edge by the pixel rows whose centre it may cross (so a row scans only its edges).
  const rows: number[][] = Array.from({ length: h }, () => []);
  for (let k = 0; k < edges.length; k += 4) {
    const lo = Math.max(0, Math.floor(Math.min(edges[k + 1], edges[k + 3]) - 0.5)), hi = Math.min(h - 1, Math.ceil(Math.max(edges[k + 1], edges[k + 3])));
    for (let y = lo; y <= hi; y++) rows[y].push(k);
  }
  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (const k of rows[y]) {
      const y0 = edges[k + 1], y1 = edges[k + 3];
      if ((y0 <= cy) !== (y1 <= cy)) xs.push(edges[k] + ((cy - y0) / (y1 - y0)) * (edges[k + 2] - edges[k]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[y * w + x] = 1;
    }
  }
  return mask;
}
// Mask → 0–1 weight: a box blur of `r` px, then a smoothstep that reaches 0 just past the coast
// and 1 a couple of pixels inland, so peaks stop at the shore without a hard cliff.
export function coastFade(mask: Uint8Array, w: number, h: number, r: number): Float32Array {
  let a = Float32Array.from(mask), b = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = s * inv;
        s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        b[y * w + x] = s * inv;
        s += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
      }
    }
    [a, b] = [b, a];
  }
  for (let i = 0; i < a.length; i++) a[i] = smoothstep(0.5, 0.95, a[i]); // 0 at the coast line, 1 a few px inland
  return a;
}

// ---- Relief shading baked from the heightmap (worker): soft cast shadow from the upper-left
// (north-west) light plus ambient occlusion, 255 = fully lit. peakPx = the tallest peak's height
// in texels, so slopes compare against the real horizontal scale.
// Kept light (2026-10-30, "hazy, dirty" feedback): a soft lee shadow and a little AO, not smears.
// Cut again after the PNW screenshot (brown smears on every blob): shallow, short, soft.
export const SHADOW_DEPTH = 0.2, SHADOW_SOFT = 0.15, AO_DEPTH = 0.15, AO_RADIUS_DIV = 64;
export const SUN_ELEVATION = 0.9; // tan of the light's elevation (~42°): short lee shadows
export const SHADE_BLUR_PX = 1; // the diagonal horizon scan aliases into streaks; a 1 px blur hides them
export function reliefShade(hgt: Uint8Array | Float32Array, w: number, h: number, peakPx: number): Uint8Array<ArrayBuffer> {
  const it = reliefShadeSteps(hgt, w, h, peakPx);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
export function* reliefShadeSteps(hgt: Uint8Array | Float32Array, w: number, h: number, peakPx: number): Generator<void, Uint8Array<ArrayBuffer>, void> {
  const out = new Uint8Array(new ArrayBuffer(w * h));
  const k = peakPx / 255, c = Math.SQRT2 * SUN_ELEVATION, soft = peakPx * SHADOW_SOFT + 1e-3;
  // AO: how far a texel sits below its neighbourhood mean (valleys and lee foot darken).
  const r = Math.max(2, Math.round(w / AO_RADIUS_DIV));
  const mean = coastBlur(hgt, w, h, r);
  yield;
  // Cast shadow: the light ray towards the north-west clears every texel s steps up it by
  // s·√2·tan(elevation). The highest such horizon is one running max per diagonal (O(1) per texel,
  // not a ray march): horizon(x, y) = max(height(x−1, y−1), horizon(x−1, y−1)) − √2·tan(elevation).
  let prev = new Float64Array(w).fill(-Infinity), cur = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    cur[0] = -Infinity;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, h0 = hgt[i] * k;
      if (x && y) cur[x] = Math.max(hgt[i - w - 1] * k, prev[x - 1]) - c;
      else cur[x] = -Infinity;
      const rise = cur[x] - h0;
      const shadow = rise > 0 ? Math.min(1, rise / soft) : 0;
      const ao = Math.min(1, Math.max(0, (mean[i] - hgt[i]) / 255) * 2.2);
      out[i] = Math.round(255 * (1 - SHADOW_DEPTH * shadow) * (1 - AO_DEPTH * ao));
    }
    [prev, cur] = [cur, prev];
    if (y % 64 === 63) yield;
  }
  const soft2 = coastBlur(out, w, h, SHADE_BLUR_PX);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(soft2[i]);
  return out;
}
const coastBlur = (src: Uint8Array | Float32Array, w: number, h: number, r: number) => {
  // Same separable running-sum box blur as coastFade, one pass, raw values.
  const a = Float32Array.from(src), b = new Float32Array(w * h), inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) (b[y * w + x] = s * inv), (s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]);
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += b[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) (a[y * w + x] = s * inv), (s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]);
  }
  return a;
};

// What the scene bakes for an example (and the export pre-bakes with the same function): the region
// box and bake options. `n` = heightmap size.
export type TerrainExample = {
  cities: (Stop & { fanStrength: number })[];
  route?: Stop[];
  decision: { lines: string[] };
  skipped?: { lat: number; lon: number };
  home: { lat: number; lon: number };
};
export const TERRAIN_STOPS = 8;
export function terrainSpec(ex: TerrainExample, n: number, land?: LandPoly[]) {
  const stops = routeStops(ex.cities, ex.route, ex.decision.lines).slice(0, TERRAIN_STOPS);
  const strengthOf = new Map(ex.cities.map((c) => [c.name, c.fanStrength]));
  const focus = ex.cities[0] ?? ex.home;
  const box = regionBox([...stops, ...(ex.skipped ? [ex.skipped] : []), ...(stops.length ? [] : [focus])], 9);
  const opts: BakeOptions = {
    bbox: box,
    width: n,
    height: n,
    kernelDeg: Math.max(0.3, box.latSpan / 30),
    stops: stops.map((s) => ({ lat: s.lat, lon: s.lon, strength: strengthOf.get(s.name) ?? 60 })),
    route: stops,
    skipped: ex.skipped,
    land,
  };
  return { stops, box, opts };
}

// The region box around an example: its stops (and skipped city) plus a margin, at least minDeg
// tall, widened for latitude so the patch is roughly square on the ground.
export function regionBox(pts: { lat: number; lon: number }[], marginDeg = 6, minDeg = 14): Box {
  const c = pts[0];
  let n = -90, s = 90, e = -Infinity, w = Infinity;
  for (const p of pts) {
    const lon = c.lon + lonDelta(c.lon, p.lon);
    (n = Math.max(n, p.lat)), (s = Math.min(s, p.lat)), (e = Math.max(e, lon)), (w = Math.min(w, lon));
  }
  const midLat = (n + s) / 2, midLon = (e + w) / 2;
  const k = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  let latSpan = Math.max(minDeg, n - s + 2 * marginDeg);
  let lonSpan = Math.max(minDeg / k, e - w + (2 * marginDeg) / k);
  latSpan = Math.max(latSpan, lonSpan * k);
  lonSpan = Math.max(lonSpan, latSpan / k);
  const lat0 = Math.min(85, midLat + latSpan / 2);
  return { lat0, lon0: midLon - lonSpan / 2, latSpan: Math.min(latSpan, lat0 + 85), lonSpan: Math.min(lonSpan, 300) };
}
// Bilinear sample of a baked heightmap (0–1) at a lat/lon; 0 outside the box.
export function sampleBaked(data: Uint8Array, w: number, h: number, box: Box, lat: number, lon: number) {
  const dl = ((((lon - box.lon0) % 360) + 360) % 360);
  const fx = (dl / box.lonSpan) * w - 0.5, fy = ((box.lat0 - lat) / box.latSpan) * h - 0.5;
  if (fx < 0 || fy < 0 || fx > w - 1 || fy > h - 1) return 0;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0, v = (x: number, y: number) => data[y * w + x] / 255;
  return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
}

// ---- Bake worker protocol (lib/bake.worker.ts) ----
// "now" = the example being shown; "idle" = a prebake of the next examples in play order; "low" =
// flat neighbour surfaces (behind both). flat: no relief shading (shade comes back all lit).
export type BakePrio = "now" | "idle" | "low";
export type BakeJob = { id: number; prio: BakePrio; pts: Float64Array; o: BakeOptions; peakPx: number; flat?: boolean };
export type BakeIn = { t: "land"; polys: LandPoly[] } | { t: "bake"; job: BakeJob } | { t: "cancel"; ids: number[] } | { t: "promote"; id: number };
// No `out`: cancelled (stale) or failed (the scene bakes it on the main thread, in slices).
// out = 8-bit heights (CPU), hf = the same as half floats (GPU texture), shade = relief shading.
export type BakeOut = { id: number; out?: Uint8Array<ArrayBuffer>; hf?: Uint16Array<ArrayBuffer>; shade?: Uint8Array<ArrayBuffer>; peak?: number; ms?: number; cancelled?: true };
