// The home globe's scene: everything that draws or hit-tests the globe, with no DOM and no React,
// so it runs in a Web Worker on an OffscreenCanvas (lib/globe.worker.ts) or, where that isn't
// available, on the main thread at lower detail (components/globe.tsx). Messages in: size,
// pointer, wheel/zoom, examples to draw, playback; out: hover/tap (marker group), interactions,
// settled marker positions. A matte Earth (petrol ocean, sand land) that is never empty: a faint
// world-of-fans wave, city lights, the waves of examples already shown; the focused example rises
// from its home city with relief, slim towers and a numbered route.
import {
  BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, ClampToEdgeWrapping, Color, CylinderGeometry, DataTexture, DoubleSide, Group, HalfFloatType, InstancedBufferAttribute, InstancedMesh, Line, LineBasicMaterial, LinearFilter, MathUtils, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, Points, Quaternion, RGBAFormat, RedFormat, RepeatWrapping, SRGBColorSpace, Scene, ShaderMaterial, SphereGeometry, SpriteMaterial, UnsignedByteType, Vector3, Vector4, WebGLRenderer,
  InstancedBufferGeometry, OrthographicCamera, Raycaster, Texture, Vector2, WebGLRenderTarget,
} from "three";
import * as topo from "topojson-client";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type * as THREE from "three";

import {
  angularDistanceDeg, arcPoints, densityGridSliced, normaliseDensity, DWELL_DEG, dwellSpeed, ease, FINE_N, fineBox, FOCUS_INNER_DEG, FOCUS_OUTER_DEG, GRID_H, GRID_W, lonDelta,
  bakeSteps, landPolys, mergeMax, packPoints, reliefShadeSteps, terrainSpec, type BakeIn, type BakeOptions, type BakeOut, type BakePrio, type LandPoly, regionalGain, RIPPLE_SPREAD, sampleBaked, scaleGrid, rippleGrow, sampleGrid, speedForDensity, toVec, windowGrid,
  zoomDistance, type Box,
} from "./globe-model.ts";
import type { FanDensity, FanPoint } from "@tourbo/core/examples/types.ts";

// Shape.
const WAVE_MAX_HEIGHT = 0.014; // of the globe radius: the zoomed-out globe shows low relief
// Terrain: the focused example's fan density as mountains (height and colour encode the same density).
const TERRAIN_N = 256; // patch grid and heightmap size (quality tiers lower it)
const TERRAIN_N_LOW = 128;
// Neighbour surfaces: the nearest other examples, flat (no height, no fill), in a sibling ramp.
// All of them in one 3×2 atlas sampled by the base Earth pass: no extra draw call.
const NB_MAX = 6, NB_COLS = 3, NB_ROWS = 2;
const NB_DELAY_MS = 400; // after the selected one has grown
const NB_FADE_TAU_S = 0.35;
const NB_OPACITY = 0.8;
const NB_EDGE = 0.1; // flat surface starts at this share of its peak (crisp edge)
const TERRAIN_SMALL_PX = 600; // canvas side below which the heightmap is TERRAIN_N_LOW
const TERRAIN_CACHE = 12; // baked maps kept (shown, next 3, neighbours): ≤ 12 × 4 × 256² B ≈ 3 MB
const TERRAIN_PREBAKE = 3; // next examples baked ahead while idle
const SLICE_MS = 8; // main-thread fallback bake: work per task before yielding
const TIER_FPS = 50; // below this over a TIER_WINDOW-frame window, step one quality tier down
const TIER_UP_FPS = 58; // at or above this for TIER_UP_S, step back up
const TIER_UP_S = 3;
const TIER_WINDOW = 120; // frames (~2 s): only a sustained dip counts, never one hitch
const TIER_HOLD = 180; // frames ignored after start, a tier change or an example swap
const DENSITY_CACHE = 8; // acts whose grids stay cached
const TERRAIN_HEIGHT_PER_RAD = 0.1; // peak height as a share of the region's height (in radians)
const FOCUS_PITCH_DEG = 48; // camera tilt over the region
const FOCUS_DIST_PER_RAD = 1.55; // camera distance as a multiple of the region's height (radians)
const FOCUS_TAU_S = 0.55; // ease into / out of the region view
const WAVE_LIFT = 0.002; // waves sit just above the land, no z-fighting
const RELIEF = 10;
const ZOOM_WAVE_ALPHA = 0.72; // zoomed in, coastlines and streets-level land show through the data
const FINE_RELIEF_SCALE = 0.12; // fine detail has steep slopes; keep its shading gentle // exaggerates the wave slope for shading so hills read as terrain
const TOWER_MIN = 0.015;
const TOWER_MAX = 0.06;
const TOWER_RADIUS = 0.0028;
const ARC_BASE = 1.003;
const ARC_SEGMENTS = 40;
const ARC_PX = 2.25;
const ARC_HALO_PX = 5.5;
const STUB_FRACTION = 0.38; // the skipped city's dotted stub runs this far toward the nearest stop
// Layers.
const HISTORY_OPACITY = 0.32;
const WORLD_OPACITY = 0.22; // height share of the faint "world of fans" base wave
const WORLD_ALPHA = 0.3;
const HISTORY_ALPHA = 0.45;
const THIN_LIGHTEN = 0.5; // thin-data countries draw lighter
const CITY_PX_MIN = 0.8;
const CITY_PX_RANGE = 1.8;
const MARKER_PX = 9;
// Light: soft directional from the upper left plus ambient; never dark.
const AMBIENT = 0.78;
const DIFFUSE = 0.32;
const AO_STRENGTH = 0.22;
const TERRAIN_EDGE_H = 0.08; // surface starts here (crisp edge); below it the paper shows
const WAVE_AMBIENT = 0.5; // waves: relative shading (flat = 1), so slopes light up or fall into shade
const WAVE_DIFFUSE = 0.6;
const VIGNETTE = 0.86; // brightness at the limb
// Framing.
const FOV_DESKTOP = 30;
const VIEW_TILT_DEG = 28; // desktop: the focus sits above the globe's centre, on the visible cap
const GLOBE_DROP = 0.62; // desktop: a quarter-Earth rising from the bottom
const NARROW_ASPECT = 1.2; // below this the whole globe is centred and fitted to the width
const NARROW_FIT = 1.1; // margin around the globe on narrow screens
// Motion.
const TRAVEL_MIN_S = 0.5;
const TRAVEL_MAX_S = 1.5;
const SPEED_TAU_S = 1.5;
const FILL_S = 1.2;
const SINK_S = 0.8;
const LEG_S = 0.4; // route draw time per leg
const ARRIVAL_ZOOM = 0.1;
const ZOOM_TAU_S = 1.1;
const SWAP_MS = 280; // old towers and route ease away before the next example's appear
const REVEAL_ALL = 1e3;
const ROUTE_OPACITY = 0.85;
const HALO_OPACITY = 0.9;
const STUB_OPACITY = 0.9;
const LAT_MIN = -60, LAT_MAX = 70; // view centre latitude clamp (no flipping over the poles)
const FLING_TAU_S = 0.35; // drag inertia decay
const FLING_MAX_DEG_S = 240;
const ZOOM_STEP = 0.2;
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.9;
const FINE_ZOOM_START = 0.32;
const FINE_ZOOM_FULL = 0.55;
const LAND_DETAIL_ZOOM = 0.25;
const SETTLE_MS = 180; // view still this long before zoom-patch / fine-grid work runs
const DETAIL_SPAN_DEG = 20; // zoom patch height; repainted when the view moves a quarter of it
const DETAIL_PX_DESKTOP = 2048;
const DETAIL_PX_MOBILE = 1024;
const LABELS_ZOOM = 0.35;
const TOWERS_HIDE_ZOOM = 0.4; // close in, towers would tower over the city; labels take over
// Interaction.
// Hover intent: a marker takes over only once the pointer rests on it, so tracing across the map
// doesn't flip examples. Resting = slower than INTENT_PX_MS; switching from a shown marker to
// another one needs a longer rest than the first hover.
const HOVER_IN_MS = 220;
const HOVER_SWITCH_MS = 450;
const INTENT_PX_MS = 0.3; // ~300 px/s
// Area hover: each marker owns a zone, its examples' fan area on screen or ZONE_PX around it,
// whichever is larger; overlaps go to the nearest marker. The hovered one keeps its zone a bit
// wider and only hands over when another marker is SWITCH_RATIO closer.
const ZONE_PX = 48;
const ZONE_PX_TOUCH = 64;
const ZONE_MAX_PX = 140; // a continent-wide tour must not swallow the globe
const AREA_DEG = 12; // example cities this close to the marker count as its fan area
const HOVER_KEEP = 1.15;
const SWITCH_RATIO = 0.75;
const SWITCH_MIN_PX = 10; // …and by at least this many pixels
const MARKERS_PUBLISH_MS = 400;
const STOP_PX = 16; // numbered stop badge
const STOP_MERGE_PX = 14; // stops closer than this on screen share one badge ("3·4")
const INDEX_CELL_PX = 32; // screen-space bucket size for marker hit tests
const TAP_MS = 300;
const DOUBLE_TAP_MS = 320;
const TAP_PX = 8;
// Quality.
const DPR_DESKTOP = 1.5;
const DPR_MOBILE = 1;
const LAND_PX_DESKTOP = 4096;
const LAND_PX_MOBILE = 2048;
const MAX_STOPS = 8;
const GPU_IDLE_MAX_MS = 4000; // startup: longest wait for the GPU to finish warm-up behind the still
const ZONES_MOVING_MS = 120; // marker hover zones: rebuild cadence while the camera moves
const POPS = 2;
// Pop-up lift above its city, in card heights: the first that clears the route badges wins.
const POP_LIFTS = [0.55, 1.1, 1.65, 2.2];
const PEAK_SEARCH = 0.05; // pop-ups: look for the summit within this share of the terrain patch // in-globe pop-ups: the top city + one surprise city
const POP_IN_MS = 450; // gap between the two pop-ups fading in, after the route is drawn

// What the scene needs of an example (a structured-clone-friendly subset of HomeExample).
export type SceneExample = {
  id: string;
  fanKey: string;
  home: { lat: number; lon: number };
  cities: { name: string; lat: number; lon: number; fanStrength: number }[];
  route?: { name: string; lat: number; lon: number }[];
  focus?: string; // non-route cards: the one city the card is about (one pin, no route line)
  decision: { lines: string[] };
  skipped?: { name: string; lat: number; lon: number };
  surprise?: { city: string };
};
// One marker per place with examples. state: 0 unseen, 1 shown before, 2 the story's example.
export type SceneGroup = { lat: number; lon: number; area: [number, number][]; state: number };
// cities: flat [lon×10, lat×10, size bucket 1–4, …] (the export's format; towns come in the same shape later).
export type WorldData = { fan: FanPoint[]; cities: number[] };
export type SceneInit = {
  width: number;
  height: number;
  dpr: number;
  low: boolean; // lower detail (main-thread fallback, phones)
  reduced: boolean;
  colors: Record<string, string>; // CSS token → hex, read on the main thread
  landUrl: string;
  land50Url: string;
  stats?: boolean; // perf:home: answer { t: "stats" } with renderer.info, tier and GPU time
};
export type PointerKind = "enter" | "leave" | "down" | "move" | "up" | "cancel";
export type GlobeIn =
  | { t: "size"; width: number; height: number; dpr?: number }
  | { t: "pointer"; kind: PointerKind; id: number; x: number; y: number; touch: boolean; time: number }
  | { t: "zoom"; dz: number; x?: number; y?: number } // x, y: zoom toward this canvas point
  | { t: "rotate"; dLon: number; dLat: number } // keyboard
  | { t: "cancelInput" } // lost capture, blur, tab hidden: drop every drag/pinch
  | { t: "reset" }
  | { t: "goto"; lat: number; lon: number; zoom: number }
  | { t: "visible"; on: boolean }
  | { t: "playing"; on: boolean }
  | { t: "world"; world: WorldData }
  | { t: "towns"; cities: number[] }
  | { t: "groups"; groups: SceneGroup[] }
  | { t: "show"; ex: SceneExample; density: FanDensity | null; move: boolean }
  | { t: "neighbours"; items: { ex: SceneExample; density: FanDensity; group: number }[] } // ≤ 6 nearest other examples: flat secondary surfaces
  | { t: "prebake"; items: { ex: SceneExample; density: FanDensity }[] } // the next examples in play order (≤ 3): bake their terrain while idle
  | { t: "inspect"; group: number } // the marker the inspect panel shows (-1 = none): ring + leader
  | { t: "stats" }
  | { t: "panels"; rects: [number, number, number, number][]; anchor: [number, number] | null }; // canvas px; anchor = leader end on the inspect panel
export type GlobeOut =
  | { t: "ready" }
  | { t: "failed" }
  | { t: "lost" } // WebGL context lost: show the still until "restored"
  | { t: "restored" }
  | { t: "stats"; calls: number; triangles: number; geometries: number; textures: number; programs: number; tier: number; dpr: number; gpuMs: number | null; shown: string | null; points: number; peak: number; surface: boolean; pops: string[]; neighbours?: string[]; nbGroups?: number[]; view: [number, number, number]; nav?: { lat: number; lon: number; zoom: number; travel: boolean; dragging: boolean; pinch: boolean; pointers: number; degPx: number }; bake?: { ms: number[]; hits: number; baked: number; cancelled: number; queued: number; cached: number; n: number } }
  | { t: "hover"; group: number; from: number } // group -1 = left all zones (from = the zone left)
  | { t: "tap"; group: number }
  | { t: "interact"; kind: "hold" | "release" | "nudge"; reason?: string }
  | { t: "zoomed"; on: boolean }
  | { t: "markers"; vis: number[][]; view: [number, number, number, number, number, number] }; // [group, x, y, zoneRadius] for visible markers; view = [lat, lon, zoom, travelling 0/1, camera y, camera z]

// Terrain patch: a grid over the region's lat/lon box, wrapped onto the sphere and displaced by the
// baked density in the vertex shader; hypsometric tint (sand → gold → amber → tomato → brick),
// and hillshade in the fragment shader; height and colour encode the same density. Low density stays flat and pale; no data draws nothing.
const TERRAIN_COMMON = /* glsl */ `
uniform sampler2D uH;
uniform vec4 uBox; // north lat, west lon, lat span, lon span
uniform float uHeight, uGrow, uTexel;
varying vec2 vUv;
varying float vH, vFacing, vCos;
varying vec3 vUp, vEast, vNorth; // view-space frame at this point
const float RAD = 0.017453292519943295;
float hAt(vec2 uv) { return texture2D(uH, uv).r * uGrow; }
`;
const TERRAIN_VERT = TERRAIN_COMMON + /* glsl */ `
void main() {
  vec2 uv = vec2(position.x, 1.0 - position.y);
  float lat = (uBox.x - uv.y * uBox.z) * RAD, lon = (uBox.y + uv.x * uBox.w) * RAD;
  vec3 up = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  vec3 p = up * (1.0 + ${(WAVE_LIFT * 1.5).toFixed(4)} + hAt(uv) * uHeight);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vUp = normalMatrix * up;
  vEast = normalMatrix * vec3(cos(lon), 0.0, -sin(lon));
  vNorth = normalMatrix * vec3(-sin(lat) * sin(lon), cos(lat), -sin(lat) * cos(lon));
  vCos = max(cos(lat), 0.05);
  vFacing = dot(normalize(vUp), normalize(-mv.xyz));
  vUv = uv;
  vH = hAt(uv);
  gl_Position = projectionMatrix * mv;
}`;
const TERRAIN_FRAG = TERRAIN_COMMON + /* glsl */ `
uniform vec3 uLand, uOcean, uRamp0, uRamp1, uRamp2, uRamp3, uLight;
uniform sampler2D uMap; // the base Earth (land/ocean/coast), so coastlines read through the terrain
uniform sampler2D uShade; // baked lee shadow + ambient occlusion
// The surface starts at a clear height threshold (crisp edge, paper outside), then the ramp.
const float EDGE_H = ${TERRAIN_EDGE_H.toFixed(3)};
vec3 tint(float h) {
  if (h < 0.18) return uRamp0;
  if (h < 0.45) return mix(uRamp0, uRamp1, (h - 0.18) / 0.27);
  if (h < 0.72) return mix(uRamp1, uRamp2, (h - 0.45) / 0.27);
  return mix(uRamp2, uRamp3, (h - 0.72) / 0.28);
}
void main() {
  float h = vH;
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float aa = max(fwidth(h), 0.002);
  float a = smoothstep(EDGE_H - aa, EDGE_H + aa, h) * smoothstep(0.0, 0.14, edge) * smoothstep(0.05, 0.3, vFacing);
  if (a < 0.01) discard;
  // Normal per pixel from the half-float heights (bilinear, central difference over one texel):
  // smooth on long slopes, no per-vertex facets or stair-steps.
  vec2 tx = vec2(uTexel, 0.0), ty = vec2(0.0, uTexel);
  float gx = (hAt(vUv + tx) - hAt(vUv - tx)) * uHeight / (2.0 * uTexel * uBox.w * RAD * vCos);
  float gy = (hAt(vUv - ty) - hAt(vUv + ty)) * uHeight / (2.0 * uTexel * uBox.z * RAD);
  // Low, outlying fan areas read as soft low ground, not balloons: their slopes and shading ease off.
  float relief = mix(0.35, 1.0, smoothstep(0.12, 0.7, h));
  vec3 vN = normalize(normalize(vUp) - relief * (gx * normalize(vEast) + gy * normalize(vNorth)));
  // Hillshade: north-west light plus ambient, relative to flat ground so plains keep their tint.
  // Stronger than before so the mountains read: darker shade side, brighter lit side, then the
  // baked cast shadow / AO (eased in with the growth so a flat start has no shadows).
  float lit = mix(max(dot(normalize(vUp), uLight), 0.0), max(dot(vN, uLight), 0.0), relief);
  // Baked shadow/AO at a light touch: subtle relief, never dark smears.
  float shade = (0.42 + 0.78 * lit) * mix(1.0, texture2D(uShade, vUv).r, uGrow * smoothstep(0.1, 0.5, h));
  // The Earth under this point (same equirectangular map as the globe; wraps at the antimeridian).
  float lat = uBox.x - vUv.y * uBox.z, lon = uBox.y + vUv.x * uBox.w;
  vec3 m = texture2D(uMap, vec2(fract((lon + 180.0) / 360.0), (lat + 90.0) / 180.0)).rgb;
  vec3 seaDir = uOcean - uLand;
  float sea = clamp(dot(m - uLand, seaDir) / max(dot(seaDir, seaDir), 1e-4), 0.0, 1.0);
  vec3 c = tint(h) * shade;
  // Sea under the fans is a shade darker and the coast gets a thin dark edge, so the land under a
  // tour (New Zealand under its peaks) still reads.
  float coast = clamp(fwidth(sea) * 1.6, 0.0, 1.0);
  c = mix(c, c * 0.55, coast * 0.85);
  // Clean sea right up to the coast (the bake is land-clipped; this keeps the edge crisp).
  gl_FragColor = vec4(c, a * (1.0 - smoothstep(0.35, 0.65, sea)));
  #include <colorspace_fragment>
}`;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
// Give the main thread back between init slices (scheduler.yield where available).
const yieldNow = (): Promise<void> => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise((r) => setTimeout(r, 0));
};
const makeCanvas = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const raf = (fn: (t: number) => void): number =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : (setTimeout(() => fn(performance.now()), 16) as unknown as number);
const cancelRaf = (id: number) => (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id));
const focusOf = (ex: SceneExample) => ex.cities[0] ?? ex.home;
const ZERO_GRID = new Uint8Array(GRID_W * GRID_H);

type Grid = Uint8Array<ArrayBuffer>;
const N = GRID_W * GRID_H;
type ActGrids = { density: Grid; thin: Grid; points: FanPoint[] };
const WORLD_KERNEL_DEG = 1.8;
// An act's grids, computed once in the browser from its fan points (≤ a few thousand, cheap).
// A 4th tuple element of 1 marks a point in a thin-data country; those cells draw lighter.
const gridCache = new WeakMap<FanDensity, ActGrids>();
// Computed in slices (yielding between them), so a new act never blocks the main thread.
async function actGrids(d: FanDensity): Promise<ActGrids> {
  const hit = gridCache.get(d);
  if (hit) return hit;
  const points = d.fanPoints as FanPoint[];
  // One kernel pass over all points, one over the thin-country ones.
  const all = await densityGridSliced(points, undefined, yieldNow);
  const density = normaliseDensity(all) as Grid;
  const thin = new Uint8Array(new ArrayBuffer(N));
  const thinPoints = points.filter((p) => (p as number[])[3] === 1);
  if (thinPoints.length) {
    const part = await densityGridSliced(thinPoints, undefined, yieldNow);
    for (let i = 0; i < N; i++) thin[i] = all[i] > 0 ? Math.round(Math.min(1, part[i] / all[i]) * 255) : 0;
  }
  const out = { density, thin, points };
  gridCache.set(d, out);
  return out;
}
const EMPTY_GRIDS: ActGrids = { density: new Uint8Array(new ArrayBuffer(N)), thin: new Uint8Array(new ArrayBuffer(N)), points: [] };

// Cheap separable box blur (3 passes ≈ Gaussian) on one channel of an RGBA grid, in place.
// Running sums: O(1) per cell whatever the radius.
function blurChannel(src: Uint8Array, dst: Uint8Array, channel: number, radius = 3) {
  let a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) a[i] = src[i * 4 + channel];
  const inv = 1 / (2 * radius + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < GRID_H; y++) {
      const row = y * GRID_W;
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += a[row + ((k + GRID_W) % GRID_W)];
      for (let x = 0; x < GRID_W; x++) {
        b[row + x] = s * inv;
        s += a[row + ((x + radius + 1) % GRID_W)] - a[row + ((x - radius + GRID_W) % GRID_W)];
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < GRID_W; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += a[Math.min(GRID_H - 1, Math.max(0, k)) * GRID_W + x];
      for (let y = 0; y < GRID_H; y++) {
        b[y * GRID_W + x] = s * inv;
        s += a[Math.min(GRID_H - 1, y + radius + 1) * GRID_W + x] - a[Math.max(0, y - radius) * GRID_W + x];
      }
    }
    [a, b] = [b, a];
  }
  for (let i = 0; i < N; i++) dst[i * 4 + channel] = Math.round(a[i]);
}

const GLSL_COMMON = /* glsl */ `
#define PI 3.141592653589793
float rippleGrow(float t, float dist) {
  float x = clamp(t * (1.0 + ${RIPPLE_SPREAD.toFixed(3)}) - dist * ${RIPPLE_SPREAD.toFixed(3)}, 0.0, 1.0);
  return 1.0 - pow(1.0 - x, 3.0);
}`;

// Waves. Data texture channels: r = current example, g = previous (sinking), b = history,
// a = thin-country share of the current example. uSoft holds the blurred version.
const WAVE_VERT = /* glsl */ `
${GLSL_COMMON}
uniform sampler2D uData, uSoft, uWorld;
uniform float uGrowT, uPrevFade, uHistOpacity, uWorldOpacity, uHeight, uCosInner, uCosOuter;
uniform vec3 uFocus, uHome;
varying vec2 vUv;
varying float vFocus, vGrow, vFacing;
varying vec3 vEast, vNorth, vNormal;
void main() {
  vec3 n = normalize(position);
  float focus = smoothstep(uCosOuter, uCosInner, dot(n, uFocus));
  float grow = rippleGrow(uGrowT, acos(clamp(dot(n, uHome), -1.0, 1.0)) / PI);
  vec4 m = mix(texture2D(uSoft, uv), texture2D(uData, uv), focus);
  float d = max(max(m.r * grow, m.g * uPrevFade), max(m.b * uHistOpacity, texture2D(uWorld, uv).r * uWorldOpacity));
  vec3 p = n * (1.0 + ${WAVE_LIFT.toFixed(4)} + d * uHeight * mix(0.35, 1.0, focus));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 east = normalize(vec3(n.z, 0.0, -n.x) + vec3(1e-5, 0.0, 0.0));
  vNormal = normalize(normalMatrix * n);
  vEast = normalize(normalMatrix * east);
  vNorth = normalize(normalMatrix * cross(n, east));
  vFacing = dot(vNormal, normalize(-mv.xyz));
  vUv = uv;
  vFocus = focus;
  vGrow = grow;
  gl_Position = projectionMatrix * mv;
}`;

const WAVE_FRAG = /* glsl */ `
#define PI 3.141592653589793
uniform sampler2D uData, uSoft, uWorld, uFine;
uniform float uPrevFade, uHistOpacity, uWorldOpacity, uHeight, uFineMix;
uniform vec4 uFineBox; // north lat, west lon, lat span, lon span
uniform vec3 uRamp0, uRamp1, uRamp2, uRamp3, uLand, uOcean, uLight;
uniform sampler2D uMap; // base Earth: the faint layers stop at the coast (no fog at sea)
varying vec2 vUv;
varying float vFocus, vGrow, vFacing;
varying vec3 vEast, vNorth, vNormal;
vec3 ramp(float t) {
  if (t < 0.33) return mix(uRamp0, uRamp1, t / 0.33);
  if (t < 0.66) return mix(uRamp1, uRamp2, (t - 0.33) / 0.33);
  return mix(uRamp2, uRamp3, (t - 0.66) / 0.34);
}
vec2 fineUv(vec2 uv) {
  float lon = uv.x * 360.0 - 180.0, lat = 90.0 - uv.y * 180.0;
  float dl = mod(lon - uFineBox.y + 540.0, 360.0) - 180.0;
  return vec2(dl / uFineBox.w, (uFineBox.x - lat) / uFineBox.z);
}
// Zoomed in, the current example's surface comes from the fine grid alone, fading out toward the
// box edge (the box is larger than the view), so there is no seam against the coarse surface.
float fineAt(vec2 uv) {
  vec2 f = fineUv(uv);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  return edge > 0.0 ? texture2D(uFine, f).r * smoothstep(0.0, 0.2, edge) : 0.0;
}
// Height field used for shading (focused detail only: current, history and fine detail).
float heightAt(vec2 uv) {
  vec4 m = texture2D(uData, uv);
  float cur = uFineMix > 0.0 ? mix(m.r, fineAt(uv), uFineMix) : m.r;
  return max(max(cur * vGrow, m.g * uPrevFade), m.b * uHistOpacity);
}
void main() {
  vec4 sharp = texture2D(uData, vUv), soft = texture2D(uSoft, vUv);
  vec4 m = mix(soft, sharp, vFocus);
  float cur = uFineMix > 0.0 ? mix(m.r, fineAt(vUv), uFineMix) : m.r;
  float worldRaw = texture2D(uWorld, vUv).r;
  float world = worldRaw * uWorldOpacity;
  float focused = max(cur * vGrow, m.g * uPrevFade);
  float d = max(focused, max(m.b * uHistOpacity, world));
  // Each layer has its own opacity: the focused example is solid, history and the world layer faint.
  float a = max(smoothstep(0.015, 0.2, focused), max(smoothstep(0.015, 0.2, m.b) * ${HISTORY_ALPHA.toFixed(2)}, smoothstep(0.03, 0.7, worldRaw) * ${WORLD_ALPHA.toFixed(2)} * step(0.001, uWorldOpacity)));
  vec3 em = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)).rgb, seaDir = uOcean - uLand;
  float sea = clamp(dot(em - uLand, seaDir) / max(dot(seaDir, seaDir), 1e-4), 0.0, 1.0);
  a *= 1.0 - smoothstep(0.35, 0.65, sea);
  if (a < 0.01) discard;

  // Relief: slope of the height field → tilted normal → soft light; valleys get a little AO.
  float e = mix(1.0 / ${GRID_W.toFixed(1)}, uFineBox.w / 360.0 / ${FINE_N.toFixed(1)} * 2.0, uFineMix);
  float dx = heightAt(vUv + vec2(e, 0.0)) - heightAt(vUv - vec2(e, 0.0));
  float dy = heightAt(vUv - vec2(0.0, e)) - heightAt(vUv + vec2(0.0, e));
  float arc = 2.0 * e * 2.0 * PI;
  vec3 nrm = normalize(vNormal - ${RELIEF.toFixed(1)} * mix(1.0, ${FINE_RELIEF_SCALE.toFixed(2)}, uFineMix) * uHeight / arc * (dx * vEast + dy * vNorth));
  float flatLight = ${WAVE_AMBIENT.toFixed(2)} + ${WAVE_DIFFUSE.toFixed(2)} * max(dot(vNormal, uLight), 0.0);
  float relief = (${WAVE_AMBIENT.toFixed(2)} + ${WAVE_DIFFUSE.toFixed(2)} * max(dot(nrm, uLight), 0.0)) / flatLight;
  float light = (${AMBIENT.toFixed(2)} + ${DIFFUSE.toFixed(2)} * max(dot(vNormal, uLight), 0.0)) * mix(1.0, relief, vFocus);
  float ao = 1.0 - ${AO_STRENGTH.toFixed(2)} * clamp((soft.r - sharp.r) * 3.0, 0.0, 1.0) * vGrow;

  float thin = mix(soft.a, sharp.a, vFocus) * step(world + 1e-3, cur * vGrow);
  vec3 c = ramp(clamp(d, 0.0, 1.0));
  c = mix(uLand, c, mix(0.35, 1.0, vGrow) * mix(0.5, 1.0, vFocus)); // saturates as it rises; out of focus → sand
  c = mix(c, uLand, thin * ${THIN_LIGHTEN.toFixed(2)});
  float horizon = smoothstep(0.05, 0.4, vFacing);
  gl_FragColor = vec4(c * light * ao, a * mix(0.5, 0.95, vFocus) * horizon * (1.0 - 0.35 * thin) * mix(1.0, ${ZOOM_WAVE_ALPHA.toFixed(2)}, uFineMix));
  #include <colorspace_fragment>
}`;

const EARTH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying float vFacing;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vFacing = dot(vNormal, normalize(-mv.xyz));
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;
const EARTH_FRAG = /* glsl */ `
uniform sampler2D uMap, uDetail, uNb;
uniform vec4 uDetailBox; // north lat, west lon, lat span, lon span
uniform float uDetailMix, uNbOn;
uniform vec4 uNbBox[${NB_MAX}];
uniform float uNbA[${NB_MAX}];
uniform vec3 uNb0, uNb1, uNb2, uNb3;
uniform vec3 uLight;
varying vec2 vUv;
varying vec3 vNormal;
varying float vFacing;
vec3 nbRamp(float t) {
  if (t < 0.33) return mix(uNb0, uNb1, t / 0.33);
  if (t < 0.66) return mix(uNb1, uNb2, (t - 0.33) / 0.33);
  return mix(uNb2, uNb3, (t - 0.66) / 0.34);
}
void main() {
  vec4 c = texture2D(uMap, vUv);
  float lon = vUv.x * 360.0 - 180.0, lat = vUv.y * 180.0 - 90.0;
  if (uDetailMix > 0.0) {
    vec2 f = vec2((mod(lon - uDetailBox.y + 540.0, 360.0) - 180.0) / uDetailBox.w, (uDetailBox.x - lat) / uDetailBox.z);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    if (edge > 0.0) c = mix(c, texture2D(uDetail, vec2(f.x, 1.0 - f.y)), uDetailMix * smoothstep(0.0, 0.12, edge));
  }
  if (uNbOn > 0.0) {
    // Neighbour surfaces (flat): the strongest one under this point wins; crisp edge at NB_EDGE.
    float best = 0.0, bestH = 0.0;
    for (int i = 0; i < ${NB_MAX}; i++) {
      if (uNbA[i] < 0.004) continue;
      vec4 b = uNbBox[i];
      vec2 f = vec2((mod(lon - b.y + 540.0, 360.0) - 180.0) / b.w, (b.x - lat) / b.z);
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      if (edge <= 0.0) continue;
      vec2 cell = vec2(mod(float(i), ${NB_COLS}.0), floor(float(i) / ${NB_COLS}.0));
      vec2 inset = clamp(f, vec2(0.5 / ${TERRAIN_N_LOW}.0), vec2(1.0 - 0.5 / ${TERRAIN_N_LOW}.0));
      float h = texture2D(uNb, (cell + inset) / vec2(${NB_COLS}.0, ${NB_ROWS}.0)).r;
      float aa = max(fwidth(h), 0.004);
      float a = smoothstep(${NB_EDGE.toFixed(2)} - aa, ${NB_EDGE.toFixed(2)} + aa, h) * smoothstep(0.0, 0.12, edge) * uNbA[i];
      if (a > best) { best = a; bestH = h; }
    }
    if (best > 0.0) c.rgb = mix(c.rgb, nbRamp(clamp((bestH - ${NB_EDGE.toFixed(2)}) / ${(1 - NB_EDGE).toFixed(2)}, 0.0, 1.0)), best * ${NB_OPACITY.toFixed(2)});
  }
  float light = ${AMBIENT.toFixed(2)} + ${DIFFUSE.toFixed(2)} * max(dot(vNormal, uLight), 0.0);
  float vignette = mix(${VIGNETTE.toFixed(2)}, 1.0, smoothstep(0.0, 0.6, vFacing));
  gl_FragColor = vec4(c.rgb * light * vignette, 1.0);
  #include <colorspace_fragment>
}`;

const TOWER_VERT = /* glsl */ `
${GLSL_COMMON}
attribute float aHeight, aDist, aBase;
uniform float uGrowT;
varying float vT;
varying vec3 vNormal;
void main() {
  float g = rippleGrow(uGrowT, aDist);
  float h = max(aHeight * g, 1e-4);
  vec3 p = position;
  p.xz *= smoothstep(0.0, 0.15, g);
  p.y = p.y > 0.9999 ? h + (p.y - 1.0) : p.y * h;
  p.y += aBase * g + ${WAVE_LIFT.toFixed(4)};
  vT = clamp(p.y / ${TOWER_MAX.toFixed(3)}, 0.0, 1.0);
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const TOWER_FRAG = /* glsl */ `
uniform vec3 uRamp0, uRamp1, uRamp2, uRamp3, uLight;
varying float vT;
varying vec3 vNormal;
vec3 ramp(float t) {
  if (t < 0.33) return mix(uRamp0, uRamp1, t / 0.33);
  if (t < 0.66) return mix(uRamp1, uRamp2, (t - 0.33) / 0.33);
  return mix(uRamp2, uRamp3, (t - 0.66) / 0.34);
}
void main() {
  float light = 0.72 + 0.4 * max(dot(normalize(vNormal), uLight), 0.0);
  gl_FragColor = vec4(ramp(vT) * light, 1.0);
  #include <colorspace_fragment>
}`;

const SHADOW_VERT = /* glsl */ `
${GLSL_COMMON}
attribute float aDist, aBase;
uniform float uGrowT;
varying vec2 vUv;
varying float vGrow;
void main() {
  vGrow = rippleGrow(uGrowT, aDist);
  vUv = uv;
  vec3 p = position + vec3(0.0, 0.0, aBase * vGrow + ${WAVE_LIFT.toFixed(4)} + 0.0004);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const SHADOW_FRAG = /* glsl */ `
uniform vec3 uInk;
varying vec2 vUv;
varying float vGrow;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.0) * 0.28 * vGrow;
  if (a < 0.005) discard;
  gl_FragColor = vec4(uInk, a);
  #include <colorspace_fragment>
}`;

// City lights and event markers: screen-sized soft points on the surface, faded at the horizon.
const POINT_VERT = /* glsl */ `
attribute float aSize, aState;
uniform float uPx, uRange, uScale;
varying float vFacing, vState;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFacing = dot(normalize(normalMatrix * normalize(position)), normalize(-mv.xyz));
  vState = aState;
  gl_PointSize = (uPx + aSize * uRange) * uScale * (aState > 2.5 ? 3.0 : aState > 1.5 ? 1.45 : 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const CITY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vFacing, vState;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, r)) * uAlpha * smoothstep(0.1, 0.45, vFacing);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;
const MARKER_FRAG = /* glsl */ `
uniform vec3 uColor, uRing, uMuted;
varying float vFacing, vState;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float vis = smoothstep(0.12, 0.35, vFacing);
  if (r > 1.0 || vis < 0.01) discard;
  // Hovered/inspected (state 3): the dot at the centre plus a soft highlight ring around it.
  if (vState > 2.5) {
    float rr = r * 3.0; // in dot radii
    if (rr > 1.0) {
      float ring = 1.0 - smoothstep(0.06, 0.12, abs(r - 0.78));
      float glow = (1.0 - smoothstep(0.4, 1.0, r)) * 0.22;
      gl_FragColor = vec4(uColor, max(ring * 0.75, glow) * vis);
      #include <colorspace_fragment>
      return;
    }
    r = rr;
  }
  vec3 fill = vState > 0.5 ? uColor : uMuted;
  vec3 c = r < 0.58 ? fill : uRing;
  float edge = 1.0 - smoothstep(0.86, 1.0, r);
  gl_FragColor = vec4(c, edge * vis * (vState > 0.5 ? 1.0 : 0.85));
  #include <colorspace_fragment>
}`;


export async function createGlobeScene(canvas: HTMLCanvasElement | OffscreenCanvas, init: SceneInit, emit: (m: GlobeOut) => void) {
  let disposed = false;
  let W = init.width, H = init.height;
  const { reduced, low } = init;
  const color = (name: string) => new Color(init.colors[name] ?? "#888888");
  const hex = (name: string) => init.colors[name] ?? "#888888";
  const land = await fetch(init.landUrl).then((r) => r.json());

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: canvas as HTMLCanvasElement, antialias: false, alpha: true, powerPreference: "high-performance" });
  } catch {
    emit({ t: "failed" });
    return undefined;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.info.autoReset = false;
  // Shader error checks query program/shader logs on first use, which stalls for hundreds of ms on
  // some drivers; they're for development only (three.js recommends turning them off in production).
  renderer.debug.checkShaderErrors = import.meta.env.DEV;

  // Resolution and anti-aliasing are fixed for the session: the canvas always renders at the
  // screen's DPR (≤ 2; ≤ 1.5 on small screens) and desktop always uses the MSAA target. Dropping
  // either used to blur the whole canvas and, by switching the render path, link new shader
  // variants mid-frame (a 1.4 s freeze). Quality tiers, for sustained low frame rates only, lower
  // cheaper things: 1 waves (history + world fans) off · 2 hover hit-test every 3rd frame ·
  // 3 coarse terrain mesh. They step back up after TIER_UP_S of headroom.
  const TIER_MAX = 3;
  let tier = 0;
  let hitEvery = 2;
  const capDpr = (d: number) => Math.min(d, low ? 1.5 : 2);
  const sessionDpr = capDpr(init.dpr);
  // At DPR ≥ 1.75 the canvas is already supersampled: 4× MSAA there quadrupled the fill cost again
  // (GPU 23–28 ms/frame at 2880×1800, ~25 fps while dragging) for no visible gain. Fixed per session
  // (the render path picks shader variants), so a later DPR change never relinks programs.
  const useAa = !low && sessionDpr < 1.75;
  renderer.setPixelRatio(sessionDpr);
  // Anti-aliasing on the top tier only: the canvas has antialias off; the scene renders into a 4×
  // multisampled target, resolved and copied to the canvas in one cheap pass. (FXAA was tried: its
  // shader took ~0.6 s to compile on Intel/Mesa, a visible stall; MSAA needs no extra shader work.)
  let aaTarget: WebGLRenderTarget | undefined;
  // The target holds linear colour; the copy converts to the canvas's sRGB like the direct path.
  const aaMat = new ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv);
#include <colorspace_fragment>
}`,
    uniforms: { tDiffuse: { value: null } },
    depthTest: false,
    depthWrite: false,
  });
  const aaScene = new Scene();
  const aaCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const aaGeo = new PlaneGeometry(2, 2);
  aaScene.add(new Mesh(aaGeo, aaMat));
  const sizeAa = () => {
    const on = useAa;
    if (!on) {
      aaTarget?.dispose();
      aaTarget = undefined;
      return;
    }
    const d = renderer.getPixelRatio(), w = Math.max(1, Math.round(W * d)), h = Math.max(1, Math.round(H * d));
    if (!aaTarget) aaTarget = new WebGLRenderTarget(w, h, { depthBuffer: true, samples: 4 });
    else aaTarget.setSize(w, h);
    aaMat.uniforms.tDiffuse.value = aaTarget.texture;
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV_DESKTOP, 1, 0.01, 20);
  const world = new Group();
  scene.add(world);
  const globe = new Group(); // rotates; children are in lat/lon space
  world.add(globe);
  const lightDir = new Vector3(-0.45, 0.6, 0.65).normalize(); // view space, upper left

  // Base Earth: land painted onto an equirectangular canvas; repainted from finer polygons on zoom.
  const landW = Math.min(low ? LAND_PX_MOBILE : LAND_PX_DESKTOP, renderer.capabilities.maxTextureSize);
  const landCanvas = makeCanvas(landW, landW / 2);
  const ctx = landCanvas.getContext("2d") as Ctx2D;
  const earthTex = new CanvasTexture(landCanvas as HTMLCanvasElement);
  earthTex.colorSpace = SRGBColorSpace;
  earthTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); // 16× cost a lot of fill when zoomed
  type Topo = Parameters<typeof topo.feature>[0];
  type Poly = { rings: number[][][]; polar: boolean; w: number; e: number; s: number; n: number };
  // Rings that cross ±180° are unwrapped to continuous longitudes (drawn shifted ±360° too).
  const unwrap = (ring: number[][]) => {
    let offset = 0;
    return ring.map(([lon, lat], i) => {
      if (i > 0) {
        const prev = ring[i - 1][0];
        if (lon - prev > 180) offset -= 360;
        else if (prev - lon > 180) offset += 360;
      }
      return [lon + offset, lat];
    });
  };
  const rawPolys = (topology: Topo): number[][][][] => {
    const fc = topo.feature(topology, (topology as unknown as { objects: { land: never } }).objects.land) as unknown as {
      features?: { geometry: { type: string; coordinates: unknown } }[];
    };
    const raw: number[][][][] = [];
    for (const f of fc.features ?? [fc as unknown as { geometry: { type: string; coordinates: unknown } }]) {
      if (f.geometry.type === "Polygon") raw.push(f.geometry.coordinates as number[][][]);
      else if (f.geometry.type === "MultiPolygon") raw.push(...(f.geometry.coordinates as number[][][][]));
    }
    return raw;
  };
  const toPolys = (topology: Topo): Poly[] => {
    const raw = rawPolys(topology);
    return raw.map((poly) => {
      const rings = poly.map(unwrap);
      let w = Infinity, e = -Infinity, so = Infinity, n = -Infinity;
      for (const [lon, lat] of rings[0]) (w = Math.min(w, lon)), (e = Math.max(e, lon)), (so = Math.min(so, lat)), (n = Math.max(n, lat));
      // Antarctica's ring runs along the map edge; no coast stroke there.
      return { rings, polar: so < -85, w, e, s: so, n };
    });
  };
  // Paint land polygons into a lat/lon box on a canvas (the whole world, or a zoom patch).
  const paint = (c: Ctx2D, polys: Poly[], box: Box, coastPx: number) => {
    const W = c.canvas.width, H = c.canvas.height;
    c.fillStyle = hex("globe-ocean");
    c.fillRect(0, 0, W, H);
    c.fillStyle = hex("globe-land");
    c.strokeStyle = hex("globe-coast");
    c.lineWidth = coastPx;
    c.lineJoin = "round";
    const south = box.lat0 - box.latSpan, east = box.lon0 + box.lonSpan;
    for (const p of polys) {
      if (p.n < south || p.s > box.lat0) continue;
      for (const shift of [-360, 0, 360]) {
        if (p.e + shift < box.lon0 || p.w + shift > east) continue;
        c.beginPath();
        for (const ring of p.rings) {
          ring.forEach(([lon, lat], i) => {
            const x = ((lon + shift - box.lon0) / box.lonSpan) * W, y = ((box.lat0 - lat) / box.latSpan) * H;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          });
          c.closePath();
        }
        c.fill("evenodd");
        if (!p.polar) c.stroke();
      }
    }
  };
  const WORLD_BOX: Box = { lat0: 90, lon0: -180, latSpan: 180, lonSpan: 360 };
  const paintLand = (topology: Topo) => {
    paint(ctx, toPolys(topology), WORLD_BOX, landCanvas.width / 1400);
    earthTex.needsUpdate = true;
  };
  await yieldNow(); // init runs in slices so no single task blocks input (TBT)
  paintLand(land);
  await yieldNow();
  // Zoom patch: finer coastlines painted for the area in view only.
  let fineLand: Poly[] | undefined;
  let landLoading = false;
  const detailPx = low ? DETAIL_PX_MOBILE : DETAIL_PX_DESKTOP;
  const detailCanvas = makeCanvas(detailPx, detailPx);
  const detailCtx = detailCanvas.getContext("2d") as Ctx2D;
  const detailTex = new CanvasTexture(detailCanvas as HTMLCanvasElement);
  detailTex.colorSpace = SRGBColorSpace;
  detailTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  let detailBox: Box | undefined;
  // The patch is painted in a worker (land.worker.ts) and arrives as an ImageBitmap; painting it
  // here plus the canvas readback cost 350–450 ms inside a frame. Main-thread paint is the fallback.
  let landWorker: Worker | undefined, landPending = false;
  try {
    landWorker = new Worker(new URL("./land.worker.ts", import.meta.url), { type: "module" });
    landWorker.onmessage = (e: MessageEvent<{ box?: Box; bmp?: ImageBitmap }>) => {
      landPending = false;
      const { box, bmp } = e.data;
      if (!box || !bmp || disposed) return void bmp?.close();
      const tex = detailTex as unknown as { image: { close?: () => void } };
      tex.image.close?.();
      tex.image = bmp;
      detailTex.flipY = false; // flipped in the worker
      detailTex.needsUpdate = true;
      detailBox = box;
      (earthMat.uniforms.uDetailBox.value as THREE.Vector4).set(box.lat0, box.lon0, box.latSpan, box.lonSpan);
      dirty();
    };
    landWorker.onerror = () => ((landWorker = undefined), (landPending = false), (fineLand = undefined));
  } catch {
    landWorker = undefined;
  }
  const paintDetail = (lat: number, lon: number) => {
    if (!fineLand || landPending) return;
    const cLat = Math.max(-75, Math.min(75, lat));
    const lonSpan = Math.min(120, DETAIL_SPAN_DEG / Math.cos((cLat * Math.PI) / 180));
    const box = { lat0: cLat + DETAIL_SPAN_DEG / 2, lon0: lon - lonSpan / 2, latSpan: DETAIL_SPAN_DEG, lonSpan };
    if (landWorker) {
      landPending = true;
      landWorker.postMessage({ t: "paint", id: 0, box, coastPx: 1.4 });
      return;
    }
    detailBox = box;
    paint(detailCtx, fineLand, detailBox, 1.4);
    detailTex.needsUpdate = true;
    (earthMat.uniforms.uDetailBox.value as THREE.Vector4).set(detailBox.lat0, detailBox.lon0, detailBox.latSpan, detailBox.lonSpan);
  };

  const sphereGeo = new SphereGeometry(1, 128, 64);
  sphereGeo.rotateY(-Math.PI / 2); // three's UV seam starts at -x; lon 0 faces +z like toVec()
  // Neighbour atlas (8-bit flat heights, 3×2 slots of TERRAIN_N_LOW²) and its sibling ramp: the main
  // ramp pulled toward the land colour and greyed, so it reads as related but clearly secondary.
  const nbData = new Uint8Array(new ArrayBuffer(NB_COLS * NB_ROWS * TERRAIN_N_LOW * TERRAIN_N_LOW));
  const nbTex = new DataTexture(nbData, NB_COLS * TERRAIN_N_LOW, NB_ROWS * TERRAIN_N_LOW, RedFormat);
  nbTex.magFilter = nbTex.minFilter = LinearFilter;
  nbTex.generateMipmaps = false;
  nbTex.needsUpdate = true;
  const sibling = (name: string) => {
    const c = color(name).lerp(color("globe-land"), 0.15);
    const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
    return c.lerp(new Color(l, l, l), 0.25);
  };
  const nbRampUniforms = { uNb0: { value: sibling("score-1") }, uNb1: { value: sibling("score-2") }, uNb2: { value: sibling("score-3") }, uNb3: { value: sibling("score-4") } };
  const earthMat = new ShaderMaterial({
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
    uniforms: {
      uMap: { value: earthTex }, uDetail: { value: detailTex }, uDetailBox: { value: new Vector4(0, 0, 1, 1) }, uDetailMix: { value: 0 }, uLight: { value: lightDir },
      uNb: { value: nbTex }, uNbOn: { value: 0 }, uNbBox: { value: Array.from({ length: NB_MAX }, () => new Vector4(0, 0, 1, 1)) }, uNbA: { value: new Array(NB_MAX).fill(0) },
      ...nbRampUniforms,
    },
  });
  const earth = new Mesh(sphereGeo, earthMat);
  earth.renderOrder = 0;
  globe.add(earth);

  // Soft atmosphere rim at the horizon.
  const rimMat = new ShaderMaterial({
    uniforms: { uRim: { value: color("globe-rim") } },
    vertexShader: `varying float vF; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vF = dot(normalize(normalMatrix*normal), normalize(-mv.xyz)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uRim; varying float vF; void main(){ float a = pow(1.0 - clamp(vF,0.0,1.0), 2.6); gl_FragColor = vec4(uRim, a*0.8);
#include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
  });
  const rimGeo = new SphereGeometry(1.006, 128, 64);
  world.add(new Mesh(rimGeo, rimMat));

  // City lights: every seeded city as a tiny soft dot sized by population ("cities", not fans).
  // Filled in when the world file arrives (with the faint world-of-fans layer).
  const cityGeo = new BufferGeometry();
  // Empty attributes until the world layer arrives, so the shader compiled up front is the one used.
  cityGeo.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
  cityGeo.setAttribute("aSize", new BufferAttribute(new Float32Array(0), 1));
  cityGeo.setAttribute("aState", new BufferAttribute(new Float32Array(0), 1));
  const cityMat = new ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: CITY_FRAG,
    uniforms: { uPx: { value: CITY_PX_MIN }, uRange: { value: CITY_PX_RANGE }, uScale: { value: renderer.getPixelRatio() }, uColor: { value: color("foreground") }, uAlpha: { value: 0.15 } },
    transparent: true,
    depthWrite: false,
  });
  const cityPoints = new Points(cityGeo, cityMat);
  cityPoints.renderOrder = 1;
  cityPoints.frustumCulled = false;
  globe.add(cityPoints);

  // Fan waves: one shell displaced in the vertex shader from small RGBA density textures.
  const dataTex = (data: Uint8Array<ArrayBuffer>, w: number, h: number, format: THREE.PixelFormat) => {
    const t = new DataTexture(data, w, h, format, UnsignedByteType);
    t.magFilter = LinearFilter;
    t.minFilter = LinearFilter;
    t.wrapS = format === RedFormat && w === FINE_N ? ClampToEdgeWrapping : RepeatWrapping;
    t.wrapT = ClampToEdgeWrapping;
    t.flipY = false;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  };
  const rgba = new Uint8Array(new ArrayBuffer(N * 4)); // r cur, g prev, b history, a thin
  const rgbaSoft = new Uint8Array(new ArrayBuffer(N * 4));
  const history = new Uint8Array(N);
  let cur: Grid = new Uint8Array(new ArrayBuffer(N));
  const dataT = dataTex(rgba, GRID_W, GRID_H, RGBAFormat);
  const softT = dataTex(rgbaSoft, GRID_W, GRID_H, RGBAFormat);
  const worldT = dataTex(new Uint8Array(new ArrayBuffer(N)), GRID_W, GRID_H, RedFormat);
  const fineT = dataTex(new Uint8Array(new ArrayBuffer(FINE_N * FINE_N)), FINE_N, FINE_N, RedFormat);
  await yieldNow();
  const waveGeo = new SphereGeometry(1, 360, 180);
  waveGeo.rotateY(-Math.PI / 2);
  // Grid row 0 is +90°: flip v so it matches three's sphere UV (v = 1 at the north pole).
  const uvs = waveGeo.attributes.uv.array as Float32Array;
  for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1 - uvs[i];
  const ramp = { uRamp0: { value: color("score-1") }, uRamp1: { value: color("score-2") }, uRamp2: { value: color("score-3") }, uRamp3: { value: color("score-4") } };
  // History and the world-of-fans layer: faint grey hills (the focused example is the terrain).
  const greyRamp = (() => {
    const land = color("globe-land"), ink = color("foreground");
    const at = (k: number) => ({ value: land.clone().lerp(ink, k) });
    return { uRamp0: at(0.06), uRamp1: at(0.12), uRamp2: at(0.2), uRamp3: at(0.28) };
  })();
  const waveMat = new ShaderMaterial({
    vertexShader: WAVE_VERT,
    fragmentShader: WAVE_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uData: { value: dataT },
      uSoft: { value: softT },
      uWorld: { value: worldT },
      uFine: { value: fineT },
      uFineBox: { value: new Vector4(0, 0, 1, 1) },
      uFineMix: { value: 0 },
      uGrowT: { value: 1 },
      uPrevFade: { value: 0 },
      uHistOpacity: { value: HISTORY_OPACITY },
      uWorldOpacity: { value: 0 },
      uHeight: { value: WAVE_MAX_HEIGHT },
      uCosInner: { value: Math.cos((FOCUS_INNER_DEG * Math.PI) / 180) },
      uCosOuter: { value: Math.cos((FOCUS_OUTER_DEG * Math.PI) / 180) },
      uFocus: { value: new Vector3(0, 0, 1) },
      uHome: { value: new Vector3(0, 0, 1) },
      uLand: { value: color("globe-land") },
      uOcean: { value: color("globe-ocean") },
      uMap: { value: earthTex },
      uLight: { value: lightDir },
      ...greyRamp,
    },
  });
  // Waves: blended over the land, never writing depth; polygon offset keeps them off the land.
  waveMat.depthTest = true;
  waveMat.polygonOffset = true;
  waveMat.polygonOffsetFactor = -1;
  waveMat.polygonOffsetUnits = -2;
  const waves = new Mesh(waveGeo, waveMat);
  waves.renderOrder = 2;
  globe.add(waves);

  // Towers: slim rounded cylinders on the surface normal, gold at the base to brick at the tip.
  const cyl = new CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS, 1, 14, 1, true);
  cyl.translate(0, 0.5, 0);
  const cap = new SphereGeometry(TOWER_RADIUS, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, 1, 0);
  const towerGeo = mergeGeometries([cyl.toNonIndexed(), cap.toNonIndexed()])!;
  cyl.dispose();
  cap.dispose();
  const towerAttr = { aHeight: new Float32Array(MAX_STOPS), aDist: new Float32Array(MAX_STOPS), aBase: new Float32Array(MAX_STOPS) };
  for (const [k, v] of Object.entries(towerAttr)) towerGeo.setAttribute(k, new InstancedBufferAttribute(v, 1));
  const growT = { value: 1 };
  const towerMat = new ShaderMaterial({ vertexShader: TOWER_VERT, fragmentShader: TOWER_FRAG, uniforms: { uGrowT: growT, uLight: { value: lightDir }, ...ramp } });
  const towers = new InstancedMesh(towerGeo, towerMat, MAX_STOPS);
  towers.count = 0;
  towers.renderOrder = 3;
  const shadowGeo = new CircleGeometry(1, 24);
  shadowGeo.setAttribute("aDist", towerGeo.getAttribute("aDist"));
  shadowGeo.setAttribute("aBase", towerGeo.getAttribute("aBase"));
  const shadowMat = new ShaderMaterial({ vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, uniforms: { uGrowT: growT, uInk: { value: color("foreground") } }, transparent: true, depthWrite: false });
  const shadows = new InstancedMesh(shadowGeo, shadowMat, MAX_STOPS);
  shadows.count = 0;
  shadows.renderOrder = 2;
  // Instances move with each example; never cull them on a stale bounding sphere.
  towers.frustumCulled = shadows.frustumCulled = false;
  // Towers are replaced by the terrain's peaks (kept built for the swap timing, never added).
  // Heightmap size by need: 128 on phones and small screens (a quarter of the bake and upload).
  const terrainN = low || Math.min(init.width, init.height) < TERRAIN_SMALL_PX ? TERRAIN_N_LOW : TERRAIN_N;
  const terrainGeo = new PlaneGeometry(1, 1, terrainN - 1, terrainN - 1);
  terrainGeo.translate(0.5, 0.5, 0);
  // Heights twice: 8-bit on the CPU (arcs over the ground, pop-up summits), half floats on the GPU
  // (smooth slopes, no 8-bit terracing in the shading). Same-size updates re-upload in place.
  const terrainData = new Uint8Array(new ArrayBuffer(terrainN * terrainN));
  const terrainHalf = new Uint16Array(new ArrayBuffer(terrainN * terrainN * 2));
  const terrainT = new DataTexture(terrainHalf, terrainN, terrainN, RedFormat, HalfFloatType);
  terrainT.magFilter = terrainT.minFilter = LinearFilter;
  terrainT.flipY = false;
  terrainT.wrapS = terrainT.wrapT = ClampToEdgeWrapping;
  // Relief shading baked from the heightmap (lee shadow + AO), 255 = lit.
  const shadeData = new Uint8Array(new ArrayBuffer(terrainN * terrainN)).fill(255);
  const shadeT = dataTex(shadeData, terrainN, terrainN, RedFormat);
  shadeT.wrapS = shadeT.wrapT = ClampToEdgeWrapping;
  const terrainMat = new ShaderMaterial({
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    transparent: true,
    side: DoubleSide,
    uniforms: {
      uH: { value: terrainT },
      uShade: { value: shadeT },
      uBox: { value: new Vector4(0, 0, 1, 1) },
      uHeight: { value: 0 },
      uGrow: { value: 0 },
      uTexel: { value: 1 / terrainN },
      uLand: { value: color("globe-land") },
      uOcean: { value: color("globe-ocean") },
      uMap: { value: earthTex },
      uLight: { value: lightDir },
      ...ramp,
    },
  });
  const terrain = new Mesh(terrainGeo, terrainMat);
  terrain.renderOrder = 3;
  terrain.frustumCulled = false;
  terrain.visible = false;
  globe.add(terrain);
  let terrainBox: Box | undefined, terrainH = 0;
  // Terrain height (globe radii) at a point, for lifting arcs and labels above the mountains.
  const groundAt = (lat: number, lon: number) => (terrainBox ? sampleBaked(terrainData, terrainN, terrainN, terrainBox, lat, lon) * terrainH : 0);

  // Route: one great-circle polyline, ink over a paper halo; the skipped city gets a dotted stub.
  const ink = color("foreground");
  const paper = color("background");
  const routeGeo = new LineGeometry();
  // Both always "dashed" with one dash the length of the drawn part (a stroke-dash reveal); the
  // shader variant never changes, so nothing recompiles mid-draw.
  const routeMat = new LineMaterial({ color: ink.getHex(), linewidth: ARC_PX, transparent: true, opacity: ROUTE_OPACITY, dashed: true, dashSize: 0, gapSize: 1e4, worldUnits: false });
  const haloMat = new LineMaterial({ color: paper.getHex(), linewidth: ARC_HALO_PX, transparent: true, opacity: HALO_OPACITY, dashed: true, dashSize: 0, gapSize: 1e4, worldUnits: false });
  // No depth writes: the halo and the ink share a depth, so writing it would z-fight into dashes.
  for (const m of [routeMat, haloMat]) m.depthWrite = false;
  const route = new Line2(routeGeo, routeMat);
  const halo = new Line2(routeGeo, haloMat);
  const stubGeo = new LineGeometry();
  const stubMat = new LineMaterial({ color: color("globe-skip").getHex(), linewidth: 1.6, transparent: true, opacity: STUB_OPACITY, dashed: true, dashSize: 0.006, gapSize: 0.007, worldUnits: false });
  const stub = new Line2(stubGeo, stubMat);
  halo.renderOrder = 4;
  route.renderOrder = 5;
  stub.renderOrder = 5;
  route.visible = halo.visible = stub.visible = false;
  route.frustumCulled = halo.frustumCulled = stub.frustumCulled = false;
  globe.add(halo, route, stub);

  // Event markers: one per place with examples (all of them, shown or not).
  await yieldNow();
  const markerGeo = new BufferGeometry();
  const markerMat = new ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: MARKER_FRAG,
    uniforms: { uPx: { value: MARKER_PX }, uRange: { value: 0 }, uScale: { value: renderer.getPixelRatio() }, uColor: { value: color("primary") }, uRing: { value: new Color(0xffffff) }, uMuted: { value: color("globe-coast") } },
    transparent: true,
    depthWrite: false,
  });
  markerMat.depthTest = false; // never hidden inside the mountains (faded at the horizon instead)
  const markers = new Points(markerGeo, markerMat);
  markers.renderOrder = 6;
  markers.frustumCulled = false;
  globe.add(markers);
  let markerLatLon: { lat: number; lon: number }[] = [];
  let markerScreen = new Float32Array(0); // x, y, facing per marker
  let markerBaseState = new Float32Array(0);
  const markerIndex = new Map<number, number[]>(); // cell → markers whose zone touches it
  let markerArea: { lat: number; lon: number }[][] = [];
  // Unit vectors of the markers and their area points (no trig while the camera moves).
  let markerVec = new Float32Array(0);
  let areaVec: Float32Array[] = [];
  let markerZone = new Float32Array(0); // zone radius in px (mouse), from the fan area
  let lastCamKey = "", seenCamKey = "", zonesAt = 0;
  let markersPublishedAt = 0;
  let markersDirty = false;
  let hoverPos: { x: number; y: number } | undefined;
  let hoverCandidate = -1, hoverSince = 0;
  let pointerSpeed = 0, lastMove: { x: number; y: number; t: number } | undefined;



  const m4 = new Matrix4();
  const qTmp = new Quaternion();
  const zUp = new Vector3(0, 0, 1);
  const yUp = new Vector3(0, 1, 0);
  const v3 = new Vector3();
  // Per-frame scratch objects: nothing is allocated in the frame loop.
  const nTmp = new Vector3(), camTmp = new Vector3(), qX = new Quaternion(), qY = new Quaternion();
  const X_AXIS = new Vector3(1, 0, 0);

  // View state.
  let viewLat = 20, viewLon = 0;
  let travel: { fromLat: number; fromLon: number; toLat: number; toLon: number; t0: number; dur: number } | undefined;
  let speed = 0;
  let focusLat = viewLat, focusLon = viewLon;
  let growStart = -Infinity;
  let sinkStart = -Infinity;
  let drawStart = Infinity;
  let legs = 0;
  const legEnds: number[] = [];
  let pendingMarks: (() => void) | undefined;
  let swapAt = 0;
  const setReveal = (len: number) => {
    for (const m of [routeMat, haloMat]) m.dashSize = len;
  };
  let current: SceneExample | undefined;
  let currentStops: { name: string; lat: number; lon: number; top: number }[] = [];
  let zoomUser = 0, zoomAuto = 0, zoomEff = 0;
  let fineKey = "", fineBoxNow: Box | undefined, fineLoading = false, fineMix = 0;
  let settledAt = 0;
  let currentPoints: FanPoint[] = [];
  let playing = true; // the page's playback state (rotation only while playing)
  let fling: { lon: number; lat: number } | undefined; // drag inertia, deg/s
  const vel = { lon: 0, lat: 0, t: 0, pLon: 0, pLat: 0 };
  const touched = () => emit({ t: "interact", kind: "nudge" });
  let visible = true;
  let rafId = 0;
  let last = performance.now();
  let dragging: { x: number; y: number; lat: number; lon: number; t: number; moved: boolean; degPx: number } | undefined;
  const pointers = new Map<number, { x: number; y: number }>();
  let lastTap: { x: number; y: number; t: number } | undefined;
  let pinch: { d: number; z: number } | undefined;
  let wheelArmed = false;
  let narrow = false;
  // Render on demand: draw only while something moves or animates (dirtyUntil covers easing tails).
  let terrainPeak = 0;
  let frameBox: Box | undefined, frameH = 0; // the story's region: what the camera frames
  // Terrain bakes, keyed by example and size. In a worker: jobs queue there, the shown example ("now")
  // runs before prebakes ("idle"), a newer "now" cancels an older one (the user jumped), and the
  // points go over as a transferred Float64Array. Results land in a small LRU, so a prebaked swap
  // never waits. Without a worker (or if it fails) the bake runs here in ~8 ms slices.
  type Baked = { out: Uint8Array; hf: Uint16Array; shade: Uint8Array; peak: number };
  type Pending = { id: number; prio: BakePrio; done: Promise<Baked | undefined>; resolve: (b?: Baked) => void; points: FanPoint[]; o: BakeOptions; peakPx: number };
  const bakedCache = new Map<string, Baked>();
  const pendingBakes = new Map<string, Pending>();
  const bakeStats = { ms: [] as number[], hits: 0, baked: 0, cancelled: 0 };
  let bakeSeq = 0, sliceRun = 0, bakeId = 0; // bakeId: the latest show (older results are ignored)
  let bakeWorker: Worker | undefined;
  // Land polygons for clipping the fan terrain to the coast (the coarse land, already loaded).
  const bakeLand: LandPoly[] = landPolys(rawPolys(land));
  const remember = (key: string, b: Baked) => {
    bakedCache.delete(key);
    bakedCache.set(key, b);
    if (bakedCache.size > TERRAIN_CACHE) bakedCache.delete(bakedCache.keys().next().value!);
  };
  const peakOf = (h: Uint8Array) => {
    let p = 0;
    for (let i = 0; i < h.length; i++) if (h[i] > p) p = h[i];
    return p;
  };
  // Main-thread bake in slices (never a long task); a newer one abandons the older.
  const bakeHere = (points: FanPoint[], o: BakeOptions, peakPx: number) =>
    new Promise<Baked | undefined>((resolve) => {
      const run = ++sliceRun;
      const bake = bakeSteps(points, { ...o, land: bakeLand });
      let out: { h8: Uint8Array; hf: Uint16Array; f: Float32Array } | undefined, shading: Generator<void, Uint8Array, void> | undefined;
      const step = () => {
        if (run !== sliceRun || disposed) return resolve(undefined);
        const t0 = performance.now();
        while (performance.now() - t0 < SLICE_MS) {
          if (!shading) {
            const r = bake.next();
            if (r.done) (out = r.value), (shading = reliefShadeSteps(out.f, o.width, o.height, peakPx));
          } else {
            const r = shading.next();
            if (r.done) return resolve({ out: out!.h8, hf: out!.hf, shade: r.value, peak: peakOf(out!.h8) });
          }
        }
        setTimeout(step, 0);
      };
      step();
    });
  const settle = (key: string, p: Pending, b?: Baked) => {
    pendingBakes.delete(key);
    if (b) remember(key, b);
    p.resolve(b);
  };
  // The worker failed this job (or died): bake the shown one here; drop prebakes.
  const fallBack = (key: string, p: Pending) => {
    if (p.prio === "idle") return settle(key, p);
    void bakeHere(p.points, p.o, p.peakPx).then((b) => settle(key, p, b));
  };
  const post = (m: BakeIn, transfer: Transferable[] = []) => bakeWorker?.postMessage(m, transfer);
  try {
    bakeWorker = new Worker(new URL("./bake.worker.ts", import.meta.url), { type: "module" });
    bakeWorker.onmessage = (e: MessageEvent<BakeOut>) => {
      const m = e.data;
      const entry = [...pendingBakes].find(([, p]) => p.id === m.id);
      if (!entry) return;
      const [key, p] = entry;
      if (m.out && m.hf && m.shade) {
        bakeStats.baked++;
        bakeStats.ms.push(Math.round((m.ms ?? 0) * 10) / 10);
        if (bakeStats.ms.length > 20) bakeStats.ms.shift();
        settle(key, p, { out: m.out, hf: m.hf, shade: m.shade, peak: m.peak ?? 0 });
      } else if (m.cancelled) {
        bakeStats.cancelled++;
        settle(key, p);
      } else fallBack(key, p);
    };
    post({ t: "land", polys: bakeLand });
    // A failing worker never leaves the globe without its surface.
    bakeWorker.onerror = () => {
      bakeWorker = undefined;
      for (const [key, p] of [...pendingBakes]) fallBack(key, p);
    };
  } catch {
    bakeWorker = undefined;
  }
  const requestBake = (key: string, points: FanPoint[], o: BakeOptions, peakPx: number, prio: BakePrio, flat = false): Promise<Baked | undefined> => {
    const hit = bakedCache.get(key);
    if (hit) {
      bakeStats.hits++;
      remember(key, hit);
      return Promise.resolve(hit);
    }
    const queued = pendingBakes.get(key);
    if (queued) {
      // Already prebaking: make it the next job (the worker cancels any older "now").
      if (prio === "now" && queued.prio !== "now") {
        queued.prio = "now";
        post({ t: "promote", id: queued.id });
      }
      return queued.done;
    }
    if (!bakeWorker) return prio === "now" ? bakeHere(points, o, peakPx).then((b) => (b && remember(key, b), b)) : Promise.resolve(undefined);
    let resolve!: (b?: Baked) => void;
    const done = new Promise<Baked | undefined>((r) => (resolve = r));
    const id = ++bakeSeq;
    pendingBakes.set(key, { id, prio, done, resolve, points, o, peakPx });
    const pts = packPoints(points);
    post({ t: "bake", job: { id, prio, pts, o, peakPx, flat } }, [pts.buffer]);
    return done;
  };
  const prebake = (items: { ex: SceneExample; density: FanDensity }[]) => {
    const keep = new Set<string>();
    for (const { ex, density } of items.slice(0, TERRAIN_PREBAKE)) {
      const key = `${ex.id}@${terrainN}`;
      keep.add(key);
      if (!bakedCache.has(key) && !pendingBakes.has(key) && bakeWorker)
        void requestBake(key, density.fanPoints as FanPoint[], terrainSpec(ex, terrainN).opts, TERRAIN_HEIGHT_PER_RAD * terrainN, "idle");
    }
    // Prebakes for examples no longer next are dropped (no pile-up behind a jump).
    const stale = [...pendingBakes].filter(([k, p]) => p.prio === "idle" && !keep.has(k)).map(([, p]) => p.id);
    if (stale.length) post({ t: "cancel", ids: stale });
  };
  // Flat neighbour surfaces (for drawing nearby examples as tinted density, no height): the fan field
  // only (no stop summits, ridges or shading), TERRAIN_N_LOW², at "low" priority behind the shown and
  // prebaked examples, sharing the LRU (key "<id>@flat"). Pass the full set each time: neighbours
  // not in it are cancelled. Resolves undefined when cancelled or without a worker.
  const neighbourKeys = new Set<string>();
  const bakeFlat = (items: { ex: SceneExample; density: FanDensity }[]): Promise<(Baked | undefined)[]> => {
    const keep = new Set(items.map(({ ex }) => `${ex.id}@flat`));
    const stale = [...pendingBakes].filter(([k, p]) => p.prio === "low" && neighbourKeys.has(k) && !keep.has(k)).map(([, p]) => p.id);
    if (stale.length) post({ t: "cancel", ids: stale });
    neighbourKeys.clear();
    for (const k of keep) neighbourKeys.add(k);
    return Promise.all(items.map(({ ex, density }) => {
      const { box, opts } = terrainSpec(ex, TERRAIN_N_LOW);
      const o: BakeOptions = { bbox: box, width: opts.width, height: opts.height, kernelDeg: opts.kernelDeg };
      return bakeWorker ? requestBake(`${ex.id}@flat`, density.fanPoints as FanPoint[], o, 0, "low", true) : Promise.resolve(undefined);
    }));
  };
  // ---- Neighbour surfaces: slots in the atlas, faded in after the selected one has grown ----
  type NbSlot = { id: string; group: number; box: Box; out: Uint8Array; a: number; target: number };
  const nbSlots: (NbSlot | undefined)[] = new Array(NB_MAX).fill(undefined);
  let nbWanted: { ex: SceneExample; density: FanDensity; group: number }[] | undefined; // waiting for the selected to settle
  let nbReady: { id: string; group: number; box: Box; out: Uint8Array }[] = []; // baked, waiting for a free slot
  let nbToken = 0;
  const nbSet = (items: { ex: SceneExample; density: FanDensity; group: number }[]) => {
    nbWanted = items.filter((i) => i.ex.id !== current?.id).slice(0, NB_MAX);
    nbReady = [];
    nbToken++;
    // Slots no longer wanted fade out now.
    const keep = new Set(nbWanted.map((i) => i.ex.id));
    for (const sl of nbSlots) if (sl && !keep.has(sl.id)) sl.target = 0;
    dirty();
  };
  // Runs in the frame (cheap unless there's work), only once the view is settled.
  const nbStep = (now: number, dt: number, settled: boolean) => {
    if (nbWanted && settled && current && !pendingMarks && now > growStart + FILL_S * 1000 + NB_DELAY_MS) {
      const items = nbWanted, token = nbToken;
      nbWanted = undefined;
      void bakeFlat(items).then((res) => {
        if (token !== nbToken || disposed) return;
        nbReady = res.flatMap((b, k) => (b ? [{ id: items[k].ex.id, group: items[k].group, box: terrainSpec(items[k].ex, TERRAIN_N_LOW).box, out: b.out }] : []));
        dirty();
      });
    }
    // Place baked ones: already shown → fade back in; else into a free (faded-out) slot.
    if (nbReady.length && settled) {
      let wrote = false;
      nbReady = nbReady.filter((r) => {
        if (r.id === current?.id) return false;
        const have = nbSlots.find((sl) => sl?.id === r.id);
        if (have) return (have.target = 1), false;
        const k = nbSlots.findIndex((sl) => !sl || (sl.target === 0 && sl.a < 0.01));
        if (k < 0) return true; // wait for a fade-out
        const cx = k % NB_COLS, cy = Math.floor(k / NB_COLS), n = TERRAIN_N_LOW, rowW = NB_COLS * n;
        // Each neighbour's own peak = top of the ramp (a flat map's colour only reads its shape).
        let peak = 1;
        for (let i = 0; i < r.out.length; i++) if (r.out[i] > peak) peak = r.out[i];
        const kk = 255 / peak;
        const norm = new Uint8Array(n * n);
        for (let i = 0; i < n * n; i++) norm[i] = Math.min(255, Math.round(r.out[i] * kk));
        for (let y = 0; y < n; y++) nbData.set(norm.subarray(y * n, y * n + n), (cy * n + y) * rowW + cx * n);
        nbSlots[k] = { ...r, out: norm, a: 0, target: 1 };
        (earthMat.uniforms.uNbBox.value as THREE.Vector4[])[k].set(r.box.lat0, r.box.lon0, r.box.latSpan, r.box.lonSpan);
        wrote = true;
        return false;
      });
      if (wrote) nbTex.needsUpdate = true;
    }
    // Fades (promote/demote crossfade with the terrain rise).
    let on = 0, moving = false;
    const A = earthMat.uniforms.uNbA.value as number[];
    nbSlots.forEach((sl, k) => {
      if (!sl) return void (A[k] = 0);
      const a = reduced ? sl.target : ease(sl.a, sl.target, dt, NB_FADE_TAU_S);
      sl.a = Math.abs(a - sl.target) < 0.003 ? sl.target : a;
      if (sl.a !== sl.target) moving = true;
      A[k] = sl.a;
      if (sl.a > 0) on = 1;
      if (sl.target === 0 && sl.a === 0) nbSlots[k] = undefined;
    });
    earthMat.uniforms.uNbOn.value = on;
    if (moving) dirty();
  };
  // The neighbour under a canvas point (its flat surface), for hover and tap; -1 if none.
  const nbHit = (x: number, y: number) => {
    if (!nbSlots.some((sl) => sl && sl.a > 0.5)) return -1;
    const at = pickLatLon(x, y);
    if (!at) return -1;
    let best = -1, bestH = NB_EDGE * 255;
    for (const sl of nbSlots) {
      if (!sl || sl.a <= 0.5) continue;
      const fx = (lonDelta(sl.box.lon0, at.lon) + (lonDelta(sl.box.lon0, at.lon) < -90 ? 360 : 0)) / sl.box.lonSpan, fy = (sl.box.lat0 - at.lat) / sl.box.latSpan;
      if (fx <= 0 || fx >= 1 || fy <= 0 || fy >= 1) continue;
      const n = TERRAIN_N_LOW, h = sl.out[Math.min(n - 1, Math.floor(fy * n)) * n + Math.min(n - 1, Math.floor(fx * n))];
      if (h > bestH) (bestH = h), (best = sl.group);
    }
    return best;
  };
  let dirtyUntil = Infinity, frameNo = 0, lost = false, gpuPending = false;
  let rLat = NaN, rLon = NaN, rZoom = NaN, rFocus = NaN;
  const dirty = (ms = 800) => (dirtyUntil = Math.max(dirtyUntil === Infinity ? 0 : dirtyUntil, performance.now() + ms));
  // Frame-rate window for the quality tiers (only while drawing continuously).
  let fpsFrames = 0, fpsTime = 0, tierHold = TIER_HOLD, goodSince = 0;
  const tierFloor = 0;
  let terrainGeoLow: PlaneGeometry | undefined;
  const applyTier = () => {
    waves.visible = tier < 1;
    hitEvery = tier >= 2 ? 3 : 2;
    if (tier >= 3 && !terrainGeoLow) {
      terrainGeoLow = new PlaneGeometry(1, 1, TERRAIN_N_LOW / 2 - 1, TERRAIN_N_LOW / 2 - 1);
      terrainGeoLow.translate(0.5, 0.5, 0);
    }
    // Lower tiers only coarsen the terrain mesh (same material: nothing recompiles); no tier ever
    // hides the fan surface or changes the resolution.
    terrain.geometry = tier >= 3 && terrainGeoLow ? terrainGeoLow : terrainGeo;
    dirty();
  };
  // GPU time per frame (EXT_disjoint_timer_query_webgl2), sampled for perf:home only.
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timerExt = init.stats ? gl.getExtension("EXT_disjoint_timer_query_webgl2") : null;
  let gpuQuery: WebGLQuery | null = null, gpuMs = 0, gpuSampledAt = 0;
  const GPU_SAMPLE_MS = 500;
  const onLost = (e: Event) => {
    e.preventDefault(); // allow a restore
    console.warn("globe: WebGL context lost; showing the still until it is restored");
    lost = true;
    emit({ t: "lost" });
  };
  const onRestored = () => {
    console.warn("globe: WebGL context restored");
    lost = false;
    dirty();
    emit({ t: "restored" });
  };
  (canvas as HTMLCanvasElement).addEventListener?.("webglcontextlost", onLost);
  (canvas as HTMLCanvasElement).addEventListener?.("webglcontextrestored", onRestored);

  let focusK = 0;
  const camTarget = new Vector3(), camFocus = new Vector3(), camN = new Vector3(), camDown = new Vector3(), camPos = new Vector3();
  const framing = () => {
    const k = MathUtils.smoothstep(zoomEff, 0, 0.45);
    const drop = narrow ? 0 : GLOBE_DROP;
    const tiltDeg = narrow ? 0 : VIEW_TILT_DEG;
    const tilt = tiltDeg * (1 - k);
    world.position.y = -drop * (1 - k);
    camera.position.set(0, 0, zoomDistance(zoomEff));
    camera.up.set(0, 1, 0);
    camTarget.set(0, world.position.y * 0, 0);
    if (focusK > 0.001 && frameBox) {
      // The view centre sits at latitude `tilt` on the camera side of the globe.
      const t = (tilt * Math.PI) / 180;
      camN.set(0, Math.sin(t), Math.cos(t));
      const lift = 1 + frameH * 0.35;
      camFocus.copy(camN).multiplyScalar(lift).add(world.position);
      camDown.set(0, -1, 0).addScaledVector(camN, camN.y).normalize();
      const p = (FOCUS_PITCH_DEG * Math.PI) / 180;
      const dist = Math.min(1.3, Math.max(0.4, ((frameBox.latSpan * Math.PI) / 180) * FOCUS_DIST_PER_RAD));
      camPos.copy(camFocus).addScaledVector(camN, dist * Math.cos(p)).addScaledVector(camDown, dist * Math.sin(p));
      const e = focusK * focusK * (3 - 2 * focusK);
      camera.position.lerp(camPos, e);
      camTarget.lerp(camFocus, e);
    }
    camera.lookAt(camTarget);
    return tilt;
  };

  const resize = () => {
    const w = W, h = H;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    narrow = camera.aspect < NARROW_ASPECT;
    if (narrow) {
      // Fit the whole globe to the width, centred.
      const half = Math.asin(1 / zoomDistance(0)) * NARROW_FIT;
      camera.fov = (2 * Math.atan(Math.tan(half) / camera.aspect) * 180) / Math.PI;
    } else camera.fov = FOV_DESKTOP;
    camera.updateProjectionMatrix();
    for (const m of [routeMat, haloMat, stubMat]) m.resolution.set(w, h);
    sizeAa();
  };
  resize();
  lastCamKey = "";

  // The soft (blurred) copy is caught up one channel per frame: four blurs in the swap task
  // cost 10–60 ms on a busy machine; a frame or two of lag under the sink animation is invisible.
  const blurQueue = new Set<number>();
  const writeChannel = (channel: number, src: Uint8Array) => {
    for (let i = 0; i < N; i++) rgba[i * 4 + channel] = src[i];
    if (src === ZERO_GRID) {
      blurQueue.delete(channel);
      for (let i = 0; i < N; i++) rgbaSoft[i * 4 + channel] = 0;
    } else blurQueue.add(channel);
  };
  const blurStep = () => {
    const c = blurQueue.values().next();
    if (c.done) return;
    blurQueue.delete(c.value);
    blurChannel(rgba, rgbaSoft, c.value);
    softT.needsUpdate = true;
    dirty();
  };
  const uploadData = () => {
    dataT.needsUpdate = true;
    softT.needsUpdate = true;
  };

  // Lift an arc point above the terrain under it (arcs never clip into the mountains).
  const overGround = (p: [number, number, number]): [number, number, number] => {
    const r = Math.hypot(p[0], p[1], p[2]);
    const lat = (Math.asin(p[1] / r) * 180) / Math.PI, lon = (Math.atan2(p[0], p[2]) * 180) / Math.PI;
    const min = 1 + WAVE_LIFT * 1.5 + groundAt(lat, lon) + 0.003;
    const k = Math.max(r, min + (r - ARC_BASE)) / r;
    return [p[0] * k, p[1] * k, p[2] * k];
  };
  const show = (ex: SceneExample, grids: ActGrids, move: boolean) => {
    const now = performance.now();
    tierHold = TIER_HOLD; // the swap itself costs frames; don't judge quality on it
    // Promote: if the new example was a neighbour, its flat surface fades out as the terrain rises;
    // the other neighbours wait for the next set (sent by the page after this show).
    for (const sl of nbSlots) if (sl && sl.id === ex.id) sl.target = 0;
    // The previous example sinks to history level while the new one rises.
    if (current) {
      writeChannel(1, cur);
      mergeMax(history, cur);
      sinkStart = now;
    }
    writeChannel(2, history);
    const f0 = focusOf(ex);
    const density = scaleGrid(grids.density, regionalGain(grids.density, f0.lat, f0.lon, FOCUS_OUTER_DEG));
    // The focused example is drawn as terrain; the wave shell keeps only history and the world layer.
    writeChannel(0, ZERO_GRID);
    writeChannel(3, grids.thin);
    uploadData();
    cur = density;
    current = ex;
    currentPoints = grids.points;
    fineKey = "";
    fineMix = 0;

    // The region's terrain, baked in the browser from the act's fan points (the worker adds the land clip).
    const { stops: allStops, box, opts: bakeOpts } = terrainSpec(ex, terrainN);
    const peakPx = TERRAIN_HEIGHT_PER_RAD * terrainN;
    let baked: Baked | undefined;

    // Terrain, route and stub swap after the old ones have eased away (never popping).
    const applyMarks = () => {
      if (!baked) return;
      // Same-size textures: three re-uploads them in place (texSubImage2D), no reallocation.
      terrainData.set(baked.out);
      terrainHalf.set(baked.hf);
      shadeData.set(baked.shade);
      shadeT.needsUpdate = true;
      terrainPeak = baked.peak;
      terrainT.needsUpdate = true;
      terrainBox = box;
      terrainH = ((box.latSpan * Math.PI) / 180) * TERRAIN_HEIGHT_PER_RAD;
      (terrainMat.uniforms.uBox.value as THREE.Vector4).set(box.lat0, box.lon0, box.latSpan, box.lonSpan);
      terrainMat.uniforms.uHeight.value = terrainH;
      terrain.visible = true;
      // The camera frames the story's region only; an inspected example swaps the terrain in place
      // and never moves the camera.
      if (move || !frameBox) (frameBox = box), (frameH = terrainH);
      // A route card draws its route; any other card pins only its own city (the globe never shows
      // a route the card isn't about).
      const pinCity = ex.focus ? (allStops.find((s) => s.name === ex.focus) ?? ex.cities.find((c) => c.name === ex.focus)) : undefined;
      const all = ex.focus ? (pinCity ? [pinCity] : allStops.slice(0, 1)) : allStops;
      const strength = new Map(ex.cities.map((c) => [c.name, c.fanStrength]));
      const home = toVec(ex.home.lat, ex.home.lon);
      (waveMat.uniforms.uHome.value as THREE.Vector3).set(...home);
      currentStops = all.map((s) => {
        const fs = strength.get(s.name) ?? 60;
        return { name: s.name, lat: s.lat, lon: s.lon, top: TOWER_MIN + ((TOWER_MAX - TOWER_MIN) * fs) / 100 };
      });
      buildStops();
      towers.count = shadows.count = currentStops.length;
      currentStops.forEach((s, i) => {
        const n = new Vector3(...toVec(s.lat, s.lon));
        qTmp.setFromUnitVectors(yUp, n);
        towers.setMatrixAt(i, m4.compose(n, qTmp, new Vector3(1, 1, 1)));
        qTmp.setFromUnitVectors(zUp, n);
        shadows.setMatrixAt(i, m4.compose(n, qTmp, new Vector3(TOWER_RADIUS * 4, TOWER_RADIUS * 4, 1)));
        towerAttr.aHeight[i] = s.top;
        towerAttr.aDist[i] = Math.acos(Math.max(-1, Math.min(1, n.dot(new Vector3(...home))))) / Math.PI;
        towerAttr.aBase[i] = sampleGrid(cur, s.lat, s.lon) * WAVE_MAX_HEIGHT;
      });
      towers.instanceMatrix.needsUpdate = shadows.instanceMatrix.needsUpdate = true;
      for (const k of Object.keys(towerAttr)) (towerGeo.getAttribute(k) as THREE.InstancedBufferAttribute).needsUpdate = true;

      // Route in play order; draws leg by leg after the surface has risen.
      legs = Math.max(0, currentStops.length - 1);
      if (legs) {
        const pts = currentStops.slice(0, -1).flatMap((c, i) => arcPoints(c, currentStops[i + 1], ARC_SEGMENTS, ARC_BASE).slice(i ? 1 : 0)).map(overGround);
        routeGeo.setPositions(pts.flat());
        route.computeLineDistances();
        // Reveal: one dash as long as the drawn part, so the stroke grows along the path.
        let d = 0;
        legEnds.length = 0;
        for (let i = 1; i < pts.length; i++) {
          d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
          if (i % ARC_SEGMENTS === 0) legEnds.push(d);
        }
        setReveal(reduced ? REVEAL_ALL : 0);
        route.visible = halo.visible = true;
      } else route.visible = halo.visible = false;
      if (ex.skipped && currentStops.length) {
        const sk = ex.skipped;
        const near = currentStops.reduce((a, b) => (angularDistanceDeg(sk.lat, sk.lon, a.lat, a.lon) < angularDistanceDeg(sk.lat, sk.lon, b.lat, b.lon) ? a : b));
        const pts = arcPoints(sk, near, ARC_SEGMENTS, ARC_BASE).slice(0, Math.max(2, Math.round(ARC_SEGMENTS * STUB_FRACTION))).map(overGround);
        stubGeo.setPositions(pts.flat());
        stub.computeLineDistances();
        stub.visible = true;
      } else stub.visible = false;
      // Draw-call budget (≤ 10 per frame): with the skipped city's stub drawn, the route goes
      // without its paper halo (one call each).
      if (stub.visible) halo.visible = false;
    };
    // The bake runs in a worker; the swap waits for it (and for the old marks to ease away).
    const job = ++bakeId;
    const ready = () => {
      if (job !== bakeId) return; // a newer example won
      if (reduced || !terrain.visible) applyMarks();
      else {
        if (!pendingMarks) swapAt = Math.max(performance.now(), now + SWAP_MS);
        pendingMarks = applyMarks;
      }
      dirty(1500);
    };
    // From the LRU when prebaked (resolves at once), else baked now; a stale result is ignored.
    void requestBake(`${ex.id}@${terrainN}`, grids.points, bakeOpts, peakPx, "now").then((b) => {
      if (!b || disposed) return;
      baked = b;
      ready();
    });

    // Travel the short way to the example's focus city.
    // The camera centres the region (its terrain box), not just the top city.
    const f = { lat: box.lat0 - box.latSpan / 2, lon: box.lon0 + box.lonSpan / 2 };
    if (move || !frameBox) {
      // Only the story moves the focus; an inspected example leaves the camera where it is.
      focusLat = Math.max(-50, Math.min(60, f.lat));
      focusLon = f.lon;
    }
    const dist = angularDistanceDeg(viewLat, viewLon, focusLat, focusLon);
    // The camera moves only on an advance (move), never on hover, and always the SHORT way
    // (≤ 180° of longitude): a neighbour slightly west is a small step back, never a whole turn
    // east. One damped move, no overshoot. Hover/inspect only swaps what's drawn, in place.
    if (reduced) {
      if (move) (viewLat = focusLat), (viewLon = focusLon), (travel = undefined);
      growStart = -Infinity;
      drawStart = -Infinity;
    } else if (move && !dragging) {
      const step = lonDelta(viewLon, focusLon);
      const dur = Math.min(TRAVEL_MAX_S, TRAVEL_MIN_S + (dist / 180) * TRAVEL_MAX_S) * 1000;
      travel = { fromLat: viewLat, fromLon: viewLon, toLat: focusLat, toLon: viewLon + step, t0: now, dur };
      growStart = now + dur * 0.6;
      drawStart = growStart + FILL_S * 600;
    } else {
      growStart = now;
      drawStart = now + FILL_S * 400;
    }
    void dist;
  };

  const setGroups = (groups: SceneGroup[]) => {
    markerLatLon = groups.map((g) => ({ lat: g.lat, lon: g.lon }));
    markerArea = groups.map((g) => g.area.filter(([lat, lon]) => angularDistanceDeg(g.lat, g.lon, lat, lon) <= AREA_DEG).map(([lat, lon]) => ({ lat, lon })));
    markerVec = new Float32Array(groups.flatMap((g) => toVec(g.lat, g.lon)));
    areaVec = markerArea.map((a) => new Float32Array(a.flatMap((q) => toVec(q.lat, q.lon))));
    const pos = new Float32Array(groups.length * 3);
    const st = new Float32Array(groups.length);
    groups.forEach((g, i) => {
      pos.set(toVec(g.lat, g.lon).map((v) => v * (1 + WAVE_LIFT * 2)), i * 3);
      st[i] = g.state;
    });
    markerGeo.setAttribute("position", new BufferAttribute(pos, 3));
    markerGeo.setAttribute("aSize", new BufferAttribute(new Float32Array(groups.length), 1));
    markerGeo.setAttribute("aState", new BufferAttribute(st, 1));
    markerBaseState = st.slice();
    markerScreen = new Float32Array(groups.length * 3);
    markerZone = new Float32Array(groups.length);
    lastCamKey = "";
  };

  const zoomBy = (dz: number, x?: number, y?: number) => {
    const before = zoomUser;
    zoomUser = Math.min(1, Math.max(0, zoomUser + dz));
    const at = x !== undefined && y !== undefined ? pickLatLon(x, y) : undefined;
    if (at && zoomUser !== before) {
      // Toward the cursor: the view centre moves toward the point by the share the distance to the
      // surface shrinks, so the point stays roughly where it is on screen.
      const k = 1 - (zoomDistance(zoomUser) - 1) / (zoomDistance(before) - 1);
      const from = travel ? { lat: travel.toLat, lon: travel.toLon } : { lat: viewLat, lon: viewLon };
      const toLat = Math.max(LAT_MIN, Math.min(LAT_MAX, from.lat + (at.lat - from.lat) * k));
      const toLon = from.lon + lonDelta(from.lon, at.lon) * k;
      travel = { fromLat: viewLat, fromLon: viewLon, toLat, toLon, t0: performance.now(), dur: reduced ? 0 : 260 };
      fling = undefined;
    } else if (before < 0.01 && dz > 0 && current && !travel && angularDistanceDeg(viewLat, viewLon, focusLat, focusLon) < 40)
      // A zoom button from the globe view heads for the example on screen.
      travel = { fromLat: viewLat, fromLon: viewLon, toLat: focusLat, toLon: viewLon + lonDelta(viewLon, focusLon), t0: performance.now(), dur: reduced ? 0 : TRAVEL_MIN_S * 1000 };
    emitZoomed();
    touched();
  };
  const rotateBy = (dLon: number, dLat: number) => {
    const from = travel ? { lat: travel.toLat, lon: travel.toLon } : { lat: viewLat, lon: viewLon };
    const k = (zoomDistance(zoomUser) - 1) / (zoomDistance(0) - 1); // smaller steps zoomed in
    travel = { fromLat: viewLat, fromLon: viewLon, toLat: Math.max(LAT_MIN, Math.min(LAT_MAX, from.lat + dLat * k)), toLon: from.lon + dLon * k, t0: performance.now(), dur: reduced ? 0 : 220 };
    fling = undefined;
    touched();
  };
  const cancelInput = () => {
    const had = pointers.size > 0 || !!dragging || !!pinch;
    pointers.clear();
    dragging = undefined;
    pinch = undefined;
    Object.assign(vel, { t: 0, lon: 0, lat: 0 });
    if (had) emit({ t: "interact", kind: "release", reason: "pointer" });
  };
  const reset = () => {
    zoomUser = 0;
    fling = undefined;
    emitZoomed();
    touched();
  };

  // Always-on base layers: the faint world-of-fans wave and the city lights.
  // The world grid (~10k points) is summed in slices; the city lights follow in their own task.
  const setWorld = async (w: WorldData) => {
    if (w.fan.length) {
      const acc = await densityGridSliced(w.fan, WORLD_KERNEL_DEG, yieldNow);
      if (disposed) return;
      worldT.image.data = normaliseDensity(acc) as Grid;
      worldT.needsUpdate = true;
      waveMat.uniforms.uWorldOpacity.value = WORLD_OPACITY;
      await yieldNow();
      if (disposed) return;
    }
    cityLists[0] = Int16Array.from(w.cities); // lon×10 / lat×10 fit in 16 bits
    setCities();
    dirty();
  };
  // City lights: big cities with the world file, small towns appended once they arrive.
  const cityLists: ArrayLike<number>[] = [[], []];
  const setCities = () => {
    const n = (cityLists[0].length + cityLists[1].length) / 3;
    const pos = new Float32Array(n * 3), size = new Float32Array(n);
    const D = Math.PI / 1800;
    let i = 0;
    for (const list of cityLists)
      for (let j = 0; j + 2 < list.length; j += 3, i++) {
        const la = list[j + 1] * D, lo = list[j] * D, r = 1.0012 * Math.cos(la);
        pos[i * 3] = r * Math.sin(lo);
        pos[i * 3 + 1] = 1.0012 * Math.sin(la);
        pos[i * 3 + 2] = r * Math.cos(lo);
        size[i] = (Math.min(4, Math.max(1, list[j + 2])) - 1) / 3;
      }
    cityGeo.dispose(); // frees the previous buffers; the next draw uploads the new ones
    cityGeo.setAttribute("position", new BufferAttribute(pos, 3));
    cityGeo.setAttribute("aSize", new BufferAttribute(size, 1));
    cityGeo.setAttribute("aState", new BufferAttribute(new Float32Array(n), 1));
  };
  // The lat/lon under a canvas point (ray against the unit globe), or undefined off the globe.
  const rayTmp = new Raycaster();
  const pickLatLon = (x: number, y: number) => {
    camera.updateMatrixWorld();
    globe.updateMatrixWorld(true);
    rayTmp.setFromCamera(new Vector2((x / W) * 2 - 1, 1 - (y / H) * 2), camera);
    const c = new Vector3().setFromMatrixPosition(globe.matrixWorld);
    const o = rayTmp.ray.origin.clone().sub(c), d = rayTmp.ray.direction;
    const b = o.dot(d), disc = b * b - (o.lengthSq() - 1);
    if (disc < 0) return undefined;
    const hitW = rayTmp.ray.origin.clone().addScaledVector(d, -b - Math.sqrt(disc));
    const q = globe.worldToLocal(hitW).normalize();
    return { lat: (Math.asin(q.y) * 180) / Math.PI, lon: (Math.atan2(q.x, q.z) * 180) / Math.PI };
  };
  // Degrees of arc per screen pixel at the view centre (1° north, measured on screen).
  const degPerPx = () => {
    globe.updateMatrixWorld(true);
    const a = projectP(viewLat, viewLon, 0), b = projectP(Math.min(89, viewLat + 1), viewLon, 0);
    const px = Math.hypot(a.x - b.x, a.y - b.y);
    return px > 0.5 && Number.isFinite(px) ? Math.min(1, 1 / px) : 0.2;
  };
  const goto = (lat: number, lon: number, zoom: number) => {
    travel = { fromLat: viewLat, fromLon: viewLon, toLat: lat, toLon: lon, t0: performance.now(), dur: 0 };
    zoomUser = zoom;
    emitZoomed();
  };

  const projectP = (lat: number, lon: number, lift: number) => {
    v3.set(...toVec(lat, lon)).multiplyScalar(1 + lift);
    nTmp.copy(v3).applyQuaternion(globe.quaternion);
    v3.applyMatrix4(globe.matrixWorld);
    const facing = nTmp.dot(camTmp.copy(camera.position).sub(v3).normalize());
    v3.project(camera);
    return { x: ((v3.x + 1) / 2) * W, y: ((1 - v3.y) / 2) * H, facing };
  };

  // projectP for a unit vector, into a shared result (the per-frame marker pass allocates nothing).
  const projOut = { x: 0, y: 0, facing: 0 };
  const projectVec = (vx: number, vy: number, vz: number, lift: number) => {
    v3.set(vx, vy, vz).multiplyScalar(1 + lift);
    nTmp.copy(v3).applyQuaternion(globe.quaternion);
    v3.applyMatrix4(globe.matrixWorld);
    projOut.facing = nTmp.dot(camTmp.copy(camera.position).sub(v3).normalize());
    v3.project(camera);
    projOut.x = ((v3.x + 1) / 2) * W;
    projOut.y = ((1 - v3.y) / 2) * H;
    return projOut;
  };

  // Fine detail for the area in view, from the act's own points (computed off the frame).
  const loadFine = () => {
    if (!current || fineLoading || !currentPoints.length) return;
    const b = fineBox(viewLat, viewLon);
    const key = `${current.fanKey}:${b.lat0}:${b.lon0}`;
    if (key === fineKey) return;
    fineLoading = true;
    const ex = current;
    setTimeout(() => {
      fineLoading = false;
      if (ex !== current || disposed) return;
      fineT.image.data = windowGrid(currentPoints, b);
      fineT.needsUpdate = true;
      fineKey = key;
      fineBoxNow = b;
      (waveMat.uniforms.uFineBox.value as THREE.Vector4).set(b.lat0, b.lon0, b.latSpan, b.lonSpan);
    }, 0);
  };
  const loadLandDetail = () => {
    if (landWorker) {
      // The worker fetches and decodes the 50m land itself; [] marks "ready to request patches".
      landWorker.postMessage({ t: "init", url: init.land50Url, ocean: hex("globe-ocean"), land: hex("globe-land"), coast: hex("globe-coast"), px: detailPx });
      fineLand = [];
      return;
    }
    landLoading = true;
    fetch(init.land50Url)
      .then((r) => r.json())
      .then((t) => {
        if (!disposed) fineLand = toPolys(t);
      })
      .catch(() => {})
      .finally(() => (landLoading = false));
  };

  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  const frame = (now: number) => {
    rafId = raf(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible || lost) return;
    frameNo++;
    blurStep();

    const held = !playing;
    const interacting = held || !!dragging || !!pinch || !!fling || zoomUser > 0.01;
    if (fling && !dragging) {
      // Let go mid-drag: the globe coasts and slows down (no jump, no snap back).
      viewLon += fling.lon * dt;
      viewLat = Math.max(LAT_MIN, Math.min(LAT_MAX, viewLat + fling.lat * dt));
      const k = Math.exp(-dt / FLING_TAU_S);
      fling.lon *= k;
      fling.lat *= k;
      if (Math.hypot(fling.lon, fling.lat) < 1.5) fling = undefined;
      speed = 0;
    } else if (travel) {
      const t = travel.dur ? Math.min(1, (now - travel.t0) / travel.dur) : 1;
      const k = easeInOut(t);
      viewLon = travel.fromLon + (travel.toLon - travel.fromLon) * k; // toLon is unwrapped: the shortest step
      viewLat = travel.fromLat + (travel.toLat - travel.fromLat) * k;
      if (t >= 1) {
        travel = undefined;
        speed = 0; // arrive at rest, then pick up the density-driven speed
      }
    } else if (!interacting && !reduced) {
      const density = Math.max(sampleGrid(cur, viewLat, viewLon), sampleGrid(history, viewLat, viewLon) * HISTORY_OPACITY);
      speed = ease(speed, speedForDensity(density), dt, SPEED_TAU_S);
      const drift = current ? angularDistanceDeg(viewLat, viewLon, focusLat, focusLon) : DWELL_DEG * 2;
      viewLon += (current ? dwellSpeed(speed, drift) : speed) * dt;
    } else speed = 0; // paused: rotation eases back in from rest on resume
    viewLon = ((viewLon + 540) % 360) - 180;

    // Zoom: a gentle push-in on arrival, or the user's zoom.
    zoomAuto = 0;
    zoomEff = ease(zoomEff, zoomUser, dt, 0.18);
    // Region view: once the example has arrived, the camera tilts over its terrain; between
    // examples (travel) it eases back to the globe view. User zoom takes over from it.
    const wantFocus = current && frameBox && !travel && zoomUser < 0.01 ? 1 : 0;
    focusK = reduced ? wantFocus : ease(focusK, wantFocus, dt, FOCUS_TAU_S);
    const tilt = framing();
    towers.visible = shadows.visible = zoomEff < TOWERS_HIDE_ZOOM;
    // Heavy view-dependent work (a 2048² zoom-patch upload + mipmaps, the fine grid) waits until
    // the view settles: during a drag or zoom the frame only renders. Repainting every 5° of drag
    // made each upload a GPU stall (200–650 ms frames while dragging zoomed in).
    const moving = !!dragging || !!pinch || !!fling || !!travel || Math.abs(zoomEff - zoomUser) > 0.01;
    if (moving) settledAt = now;
    const settled = now - settledAt > SETTLE_MS;
    nbStep(now, dt, settled);
    if (zoomEff > LAND_DETAIL_ZOOM && settled) {
      if (!fineLand && !landLoading) loadLandDetail();
      const off = detailBox ? angularDistanceDeg(viewLat, viewLon, detailBox.lat0 - detailBox.latSpan / 2, detailBox.lon0 + detailBox.lonSpan / 2) : Infinity;
      if (fineLand && off > DETAIL_SPAN_DEG / 4) paintDetail(viewLat, viewLon);
    }
    earthMat.uniforms.uDetailMix.value = detailBox ? MathUtils.smoothstep(zoomEff, LAND_DETAIL_ZOOM, LAND_DETAIL_ZOOM + 0.12) : 0;
    if (zoomEff > FINE_ZOOM_START && settled) loadFine();
    const fineTarget = fineBoxNow && angularDistanceDeg(viewLat, viewLon, fineBoxNow.lat0 - fineBoxNow.latSpan / 2, fineBoxNow.lon0 + fineBoxNow.lonSpan / 2) < fineBoxNow.latSpan ? MathUtils.smoothstep(zoomEff, FINE_ZOOM_START, FINE_ZOOM_FULL) : 0;
    fineMix = ease(fineMix, fineKey ? fineTarget : 0, dt, 0.3);
    waveMat.uniforms.uFineMix.value = fineMix;

    qX.setFromAxisAngle(X_AXIS, ((viewLat - tilt) * Math.PI) / 180);
    qY.setFromAxisAngle(yUp, (-viewLon * Math.PI) / 180);
    globe.quaternion.copy(qX).multiply(qY);
    {
      const la = (viewLat * Math.PI) / 180, lo = (viewLon * Math.PI) / 180;
      (waveMat.uniforms.uFocus.value as THREE.Vector3).set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
    }

    const g = reduced ? 1 : Math.min(1, Math.max(0, (now - growStart) / (FILL_S * 1000)));
    if (pendingMarks && now >= swapAt) {
      pendingMarks();
      pendingMarks = undefined;
    }
    // Outgoing marks ease down (towers sink, route and stub fade) before the swap.
    const out = pendingMarks ? Math.max(0, Math.min(1, (swapAt - now) / SWAP_MS)) : 1;
    routeMat.opacity = ROUTE_OPACITY * out;
    haloMat.opacity = HALO_OPACITY * out;
    stubMat.opacity = STUB_OPACITY * out;
    growT.value = pendingMarks ? 1 - (1 - out) ** 2 : g;
    // Terrain build-up: the height rises from flat; it sinks before a swap.
    const tg = pendingMarks ? 1 - (1 - out) ** 2 : 1 - (1 - g) ** 3;
    terrainMat.uniforms.uGrow.value = tg;
    waveMat.uniforms.uGrowT.value = g;
    const sink = reduced ? 1 : Math.min(1, (now - sinkStart) / (SINK_S * 1000));
    waveMat.uniforms.uPrevFade.value = sink >= 1 ? 0 : 1 - (1 - HISTORY_OPACITY) * (1 - (1 - sink) ** 2) - HISTORY_OPACITY * 0; // falls to history level
    if (route.visible && !reduced && !pendingMarks && legEnds.length) {
      // Leg by leg in play order, each eased; then the full path stays.
      const t = (now - drawStart) / 1000;
      if (t < 0) setReveal(0);
      else if (t < legs * LEG_S) {
        const leg = Math.floor(t / LEG_S);
        const from = leg ? legEnds[leg - 1] : 0;
        setReveal(from + (legEnds[leg] - from) * easeInOut((t - leg * LEG_S) / LEG_S));
      } else setReveal(REVEAL_ALL);
    }

    // Numbered stops (names too when zoomed in) and the skipped ×: fade per instance, one draw.
    (labelMat.uniforms.uViewport.value as Vector2).set(W, H);
    if (labelCount) {
      const names = zoomEff > LABELS_ZOOM;
      let changed = false;
      for (let i = 0; i < currentStops.length; i++) {
        const on = !stopMerged[i] && (reduced || now > drawStart + i * LEG_S * 1000 - 200);
        const popped = pops.some((p, k) => p.stop === i && lAlpha[popBase + k] > 0); // the pop-up names it
        const a = ease(lAlpha[i], on ? 1 : 0, dt, 0.08), n = ease(lAlpha[currentStops.length + i], on && names && !popped ? 1 : 0, dt, 0.12);
        const a2 = a < 0.005 ? 0 : a > 0.995 ? 1 : a, n2 = n < 0.005 ? 0 : n > 0.995 ? 1 : n;
        if (a2 !== lAlpha[i] || n2 !== lAlpha[currentStops.length + i]) changed = true;
        lAlpha[i] = a2;
        lAlpha[currentStops.length + i] = n2;
      }
      // Pop-ups fade in after the route has drawn and step aside while the pointer is on a marker.
      const routeDone = drawStart + legs * LEG_S * 1000;
      for (let k = 0; k < pops.length; k++) {
        const on = !popHidden[k] && hoverCandidate < 0 && (reduced ? drawStart !== Infinity : now > routeDone + k * POP_IN_MS);
        const i = popBase + k, a = ease(lAlpha[i], on ? 1 : 0, dt, 0.15), a2 = a < 0.005 ? 0 : a > 0.995 ? 1 : a;
        if (a2 !== lAlpha[i]) (changed = true), (lAlpha[i] = a2);
      }
      if (changed) {
        alphaAttr.needsUpdate = true;
        dirtyUntil = Math.max(dirtyUntil === Infinity ? 0 : dirtyUntil, now + 100);
      }
    }

    // Draw only when the view moved or something is animating; otherwise the GPU idles.
    const animEnd = Math.max(growStart + FILL_S * 1000, sinkStart + SINK_S * 1000, drawStart === Infinity ? 0 : drawStart + legs * LEG_S * 1000, pendingMarks ? swapAt : 0);
    if (Math.abs(viewLat - rLat) > 1e-4 || Math.abs(viewLon - rLon) > 1e-4 || Math.abs(zoomEff - rZoom) > 1e-5 || Math.abs(focusK - rFocus) > 1e-5) {
      rLat = viewLat, rLon = viewLon, rZoom = zoomEff, rFocus = focusK;
      dirtyUntil = Math.max(dirtyUntil === Infinity ? 0 : dirtyUntil, now + 300);
    }
    const draw = now < dirtyUntil || now < animEnd + 300 || dirtyUntil === Infinity;
    if (draw) {
      renderer.info.reset(); // autoReset is off so the AA copy pass adds to the frame's count
      world.updateMatrixWorld(true);
      // One query in flight, at most every GPU_SAMPLE_MS: reading results (and the disjoint flag)
      // is a round trip to the GPU process, which must not land in every frame it measures.
      const timing = !!timerExt && !gpuQuery && now - gpuSampledAt > GPU_SAMPLE_MS;
      if (timing) gpuSampledAt = now;
      if (timing) {
        gpuQuery = gl.createQuery();
        if (gpuQuery) gl.beginQuery(timerExt.TIME_ELAPSED_EXT, gpuQuery);
      }
      if (aaTarget) {
        renderer.setRenderTarget(aaTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(aaScene, aaCam);
      } else renderer.render(scene, camera);
      if (timing && gpuQuery) {
        gl.endQuery(timerExt.TIME_ELAPSED_EXT);
        gpuPending = true;
      }
      if (dirtyUntil === Infinity) dirtyUntil = now + 800; // first frames after start
      // Quality tiers: step down after a 50-frame window under TIER_FPS (continuous drawing only).
      if (tierHold > 0) tierHold--;
      else if (dt < 0.05 && !document.hidden) {
        // One-off hitches (a bake, a texture upload) are skipped: tiers follow sustained load.
        fpsFrames++;
        fpsTime += dt;
        if (fpsFrames >= TIER_WINDOW) {
          const fps = fpsFrames / fpsTime;
          if (fps < TIER_FPS && tier < TIER_MAX) {
            tier++;
            applyTier();
            tierHold = TIER_HOLD;
            goodSince = 0;
          } else if (fps >= TIER_UP_FPS && tier > tierFloor) {
            // Step back up after TIER_UP_S of good frames (hysteresis: 58 up vs 55 down).
            goodSince ||= now;
            if (now - goodSince > TIER_UP_S * 1000) {
              tier--;
              applyTier();
              tierHold = TIER_HOLD;
              goodSince = 0;
            }
          } else goodSince = 0;
          fpsFrames = 0;
          fpsTime = 0;
        }
      }
    } else (fpsFrames = 0), (fpsTime = 0);
    if (gpuPending && gpuQuery && timerExt && gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) gpuMs = gpuMs ? gpuMs * 0.9 + (gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT) / 1e6) * 0.1 : gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(gpuQuery);
      gpuQuery = null;
      gpuPending = false;
    }


    // Leader: a thin line from the inspected marker to the docked inspect panel (inside WebGL).
    updateLeader();

    // Marker screen positions, hover zones and the bucket index: rebuilt only when the camera moved.
    const camKey = `${viewLat.toFixed(3)},${viewLon.toFixed(3)},${zoomEff.toFixed(4)},${W},${H},${markerLatLon.length},${rectKey},${travel ? 1 : 0},${camera.position.y.toFixed(3)},${camera.position.z.toFixed(3)}`;
    // While the camera keeps moving, rebuild at most every ZONES_MOVING_MS (hover reads positions
    // a few px stale for that long); once it rests, rebuild right away.
    const moved = camKey !== seenCamKey;
    seenCamKey = camKey;
    if (moved) (camMovedAt = now), (markersPublished = false);
    if (camKey !== lastCamKey && (!moved || now - zonesAt >= ZONES_MOVING_MS)) {
      lastCamKey = camKey;
      zonesAt = now;
      markerIndex.clear();
      markerLatLon.forEach((_, i) => {
        const pp = projectVec(markerVec[i * 3], markerVec[i * 3 + 1], markerVec[i * 3 + 2], WAVE_LIFT * 2);
        const p = { x: pp.x, y: pp.y };
        markerScreen[i * 3] = p.x;
        markerScreen[i * 3 + 1] = p.y;
        markerScreen[i * 3 + 2] = pp.facing;
        if (pp.facing < 0.15 || underPanel(p.x, p.y)) return;
        let r = ZONE_PX;
        const av = areaVec[i];
        for (let j = 0; av && j < av.length; j += 3) {
          const q = projectVec(av[j], av[j + 1], av[j + 2], WAVE_LIFT);
          if (q.facing > 0.15) r = Math.max(r, Math.hypot(q.x - p.x, q.y - p.y));
        }
        r = Math.min(ZONE_MAX_PX, r);
        markerZone[i] = r;
        // Index every cell the (touch-sized) zone covers, so a hit test reads one cell.
        const R = Math.max(r, ZONE_PX_TOUCH);
        for (let cx = Math.floor((p.x - R) / INDEX_CELL_PX); cx <= Math.floor((p.x + R) / INDEX_CELL_PX); cx++)
          for (let cy = Math.floor((p.y - R) / INDEX_CELL_PX); cy <= Math.floor((p.y + R) / INDEX_CELL_PX); cy++) {
            const key = cx * 4096 + cy;
            (markerIndex.get(key) ?? markerIndex.set(key, []).get(key)!).push(i);
          }
      });
      mergeStops();
    }
    // Camera settled: publish visible markers once (tests, keyboard order, view-model prefetch).
    if (now - markersAt > MARKERS_PUBLISH_MS && (!markersPublished || now - markersAt > 2000)) {
      markersAt = now;
      markersPublished = true;
      const vis: number[][] = [];
      markerLatLon.forEach((_, i) => {
        if (markerScreen[i * 3 + 2] >= 0.15 && markerIndex.size && !underPanel(markerScreen[i * 3], markerScreen[i * 3 + 1]))
          vis.push([i, Math.round(markerScreen[i * 3]), Math.round(markerScreen[i * 3 + 1]), Math.round(markerZone[i])]);
      });
      emit({ t: "markers", vis, view: [Math.round(viewLat * 1000) / 1000, Math.round(viewLon * 1000) / 1000, Math.round(zoomEff * 1000) / 1000, travel ? 1 : 0, Math.round(camera.position.y * 1000) / 1000, Math.round(camera.position.z * 1000) / 1000] });
    }
    // Hover, batched to the frame: hit-test the latest pointer position once, then debounce in.
    if (hoverPos && frameNo % hitEvery === 0) {
      const h = underPanel(hoverPos.x, hoverPos.y) ? -1 : hit(hoverPos.x, hoverPos.y, false, hoverCandidate);
      hoverPos = undefined;
      if (h !== hoverCandidate) {
        const was = hoverCandidate;
        hoverCandidate = h;
        hoverSince = now;
        setHighlight();
        if (h < 0 && hoverSent >= 0) {
          emit({ t: "hover", group: -1, from: hoverSent });
          emit({ t: "interact", kind: "release", reason: "marker" });
          hoverSent = -1;
        }
        void was;
      }
    }
    if (hoverCandidate >= 0 && hoverSent !== hoverCandidate && pointerSpeed > INTENT_PX_MS && lastMove && now - lastMove.t < 80) hoverSince = now; // still tracing (no move for 80 ms = resting)
    if (hoverCandidate >= 0 && hoverSent !== hoverCandidate && now - hoverSince >= (hoverSent < 0 ? HOVER_IN_MS : HOVER_SWITCH_MS)) {
      if (hoverSent < 0) emit({ t: "interact", kind: "hold", reason: "marker" });
      hoverSent = hoverCandidate;
      emit({ t: "hover", group: hoverCandidate, from: -1 });
    }
  };

  // ---- Labels: stop badges, stop names (zoomed in) and the skipped ×, painted into one atlas and
  // drawn as ONE instanced mesh of screen-space quads (fixed pixel size, always on top) ----
  const primary = hex("primary"), skipCol = hex("globe-skip"), fg = hex("foreground"), bg = hex("background");
  const ATLAS_W = 1024, ATLAS_H = 256, AS = 2; // atlas px; supersample (DPR ≤ 2)
  const atlasCanvas = makeCanvas(ATLAS_W, ATLAS_H);
  const atlas = atlasCanvas.getContext("2d") as Ctx2D;
  const atlasTex = new CanvasTexture(atlasCanvas as HTMLCanvasElement);
  atlasTex.colorSpace = SRGBColorSpace;
  const MAX_LABELS = MAX_STOPS * 2 + 1 + POPS;
  const labelGeo = new InstancedBufferGeometry();
  labelGeo.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  labelGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const lPos = new Float32Array(MAX_LABELS * 3), lRect = new Float32Array(MAX_LABELS * 4), lSize = new Float32Array(MAX_LABELS * 2), lAnchor = new Float32Array(MAX_LABELS * 2), lAlpha = new Float32Array(MAX_LABELS), lFade = new Float32Array(MAX_LABELS);
  const fadeAttr = new InstancedBufferAttribute(lFade, 1);
  const posAttr = new InstancedBufferAttribute(lPos, 3), rectAttr = new InstancedBufferAttribute(lRect, 4), sizeAttr = new InstancedBufferAttribute(lSize, 2), anchorAttr = new InstancedBufferAttribute(lAnchor, 2), alphaAttr = new InstancedBufferAttribute(lAlpha, 1);
  labelGeo.setAttribute("aPos", posAttr);
  labelGeo.setAttribute("aRect", rectAttr);
  labelGeo.setAttribute("aSize", sizeAttr);
  labelGeo.setAttribute("aAnchor", anchorAttr);
  labelGeo.setAttribute("aAlpha", alphaAttr);
  labelGeo.setAttribute("aFade", fadeAttr);
  labelGeo.instanceCount = 0;
  const labelMat = new ShaderMaterial({
    uniforms: { uAtlas: { value: atlasTex }, uViewport: { value: new Vector2(W, H) } },
    vertexShader: /* glsl */ `
attribute vec3 aPos;
attribute vec4 aRect; // u0, v0 (bottom), u1, v1 (top)
attribute vec2 aSize, aAnchor; // CSS px; anchor in quad units
attribute float aAlpha;
attribute float aFade; // 1 = pop-up: hidden behind the globe, fading out towards the horizon
uniform vec2 uViewport;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(aPos, 1.0);
  c.xy += (position.xy - aAnchor) * aSize * 2.0 / uViewport * c.w;
  vUv = vec2(mix(aRect.x, aRect.z, position.x), mix(aRect.y, aRect.w, position.y));
  // normal · view falloff: the globe's own surface occludes anything facing away from the camera.
  vec3 wp = (modelMatrix * vec4(aPos, 1.0)).xyz, ctr = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float facing = dot(normalize(wp - ctr), normalize(cameraPosition - wp));
  vA = aAlpha * mix(1.0, smoothstep(0.06, 0.32, facing), aFade);
  gl_Position = vA < 0.005 ? vec4(2.0, 2.0, 2.0, 1.0) : c; // hidden: outside the clip volume
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(t.rgb, t.a * vA);
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const labelMesh = new Mesh(labelGeo, labelMat);
  labelMesh.frustumCulled = false;
  labelMesh.renderOrder = 8;
  globe.add(labelMesh);
  let labelCount = 0;

  // Atlas painters: each draws at (x, y) in atlas px and returns its CSS-px size.
  const paintBadge = (label: string, x: number, y: number) => {
    const h = STOP_PX * AS, w = Math.max(h, Math.ceil((label.length * 6.5 + 8) * AS));
    atlas.fillStyle = "#ffffff";
    atlas.beginPath();
    atlas.roundRect(x, y, w, h, h / 2);
    atlas.fill();
    atlas.fillStyle = primary;
    atlas.beginPath();
    atlas.roundRect(x + 2 * AS, y + 2 * AS, w - 4 * AS, h - 4 * AS, h / 2 - 2 * AS);
    atlas.fill();
    atlas.fillStyle = "#ffffff";
    atlas.font = `600 ${9 * AS}px system-ui, sans-serif`;
    atlas.textAlign = "center";
    atlas.textBaseline = "middle";
    atlas.fillText(label, x + w / 2, y + h / 2 + 0.5 * AS);
    return [w, h];
  };
  const paintName = (name: string, x: number, y: number) => {
    const h = 14 * AS, w = Math.ceil((name.length * 6.2 + 8) * AS);
    atlas.fillStyle = bg;
    atlas.globalAlpha = 0.9;
    atlas.beginPath();
    atlas.roundRect(x, y, w, h, 3 * AS);
    atlas.fill();
    atlas.globalAlpha = 1;
    atlas.fillStyle = fg;
    atlas.font = `${11 * AS}px system-ui, sans-serif`;
    atlas.textAlign = "center";
    atlas.textBaseline = "middle";
    atlas.fillText(name, x + w / 2, y + h / 2);
    return [w, h];
  };
  const paintSkip = (x: number, y: number) => {
    const n = 11 * AS;
    atlas.fillStyle = skipCol;
    atlas.beginPath();
    atlas.arc(x + n / 2, y + n / 2, n / 2, 0, Math.PI * 2);
    atlas.fill();
    atlas.strokeStyle = "#ffffff";
    atlas.lineWidth = 1.4 * AS;
    atlas.beginPath();
    atlas.moveTo(x + n * 0.33, y + n * 0.33);
    atlas.lineTo(x + n * 0.67, y + n * 0.67);
    atlas.moveTo(x + n * 0.67, y + n * 0.33);
    atlas.lineTo(x + n * 0.33, y + n * 0.67);
    atlas.stroke();
    return [n, n];
  };

  // Pop-up card: the city name over one small line ("top city · fan strength 91").
  const muted = hex("muted-foreground");
  const paintPop = (title: string, sub: string, x: number, y: number) => {
    atlas.font = `600 ${13 * AS}px system-ui, sans-serif`;
    const tw = atlas.measureText(title).width;
    atlas.font = `${12 * AS}px system-ui, sans-serif`;
    const sw = atlas.measureText(sub).width;
    const pad = 8 * AS, h = 42 * AS, w = Math.ceil(Math.max(tw, sw) + pad * 2), tip = 5 * AS, body = h - tip;
    atlas.fillStyle = bg;
    atlas.globalAlpha = 1;
    atlas.beginPath();
    atlas.roundRect(x, y, w, body, 5 * AS);
    atlas.moveTo(x + w / 2 - tip, y + body);
    atlas.lineTo(x + w / 2, y + h);
    atlas.lineTo(x + w / 2 + tip, y + body);
    atlas.fill();
    atlas.globalAlpha = 1;
    atlas.fillStyle = primary;
    atlas.fillRect(x, y + 5 * AS, 2 * AS, body - 10 * AS); // accent edge
    atlas.textAlign = "left";
    atlas.textBaseline = "alphabetic";
    atlas.fillStyle = fg;
    atlas.font = `600 ${13 * AS}px system-ui, sans-serif`;
    atlas.fillText(title, x + pad, y + 16 * AS);
    atlas.fillStyle = muted;
    atlas.font = `${12 * AS}px system-ui, sans-serif`;
    atlas.fillText(sub, x + pad, y + 31 * AS);
    return [w, h];
  };
  type Pop = { lat: number; lon: number; title: string; sub: string; stop: number };
  let pops: Pop[] = [];
  let popBase = 0;
  const popHidden = [false, false];
  // The summit next to a city: the highest baked texel within PEAK_SEARCH of it (pop-ups sit on
  // the peak, not on the city dot beside it).
  const peakNear = (lat: number, lon: number) => {
    const b = terrainBox;
    if (!b) return { lat, lon };
    const fx = ((((lon - b.lon0) % 360) + 360) % 360) / b.lonSpan * terrainN, fy = ((b.lat0 - lat) / b.latSpan) * terrainN;
    const R = Math.max(2, Math.round(terrainN * PEAK_SEARCH));
    let best = -1, bx = fx, by = fy;
    for (let y = Math.max(0, Math.floor(fy) - R); y <= Math.min(terrainN - 1, Math.floor(fy) + R); y++)
      for (let x = Math.max(0, Math.floor(fx) - R); x <= Math.min(terrainN - 1, Math.floor(fx) + R); x++) {
        const v = terrainData[y * terrainN + x];
        if (v > best && (x + 0.5 - fx) ** 2 + (y + 0.5 - fy) ** 2 <= R * R) (best = v), (bx = x + 0.5), (by = y + 0.5);
      }
    return { lat: b.lat0 - (by / terrainN) * b.latSpan, lon: b.lon0 + (bx / terrainN) * b.lonSpan };
  };
  // The current example's top city, plus its surprise city when it's a different, placed city.
  const pickPops = (): Pop[] => {
    const ex = current;
    if (!ex) return [];
    const stopOf = (name: string) => currentStops.findIndex((s) => s.name === name);
    const out: Pop[] = [];
    const top = ex.cities[0];
    if (top) out.push({ lat: top.lat, lon: top.lon, title: top.name, sub: `top city · fan strength ${Math.round(top.fanStrength)}`, stop: stopOf(top.name) });
    const sp = ex.surprise && ex.surprise.city !== top?.name ? ex.surprise.city : undefined;
    const c = sp ? ex.cities.find((x) => x.name === sp) : undefined;
    const r = sp && !c ? ex.route?.find((x) => x.name === sp) : undefined;
    if (c) out.push({ lat: c.lat, lon: c.lon, title: c.name, sub: `surprise · fan strength ${Math.round(c.fanStrength)}`, stop: stopOf(c.name) });
    else if (r) out.push({ lat: r.lat, lon: r.lon, title: r.name, sub: "surprise pick", stop: stopOf(r.name) });
    return out.slice(0, POPS).map((p) => ({ ...p, ...peakNear(p.lat, p.lon) }));
  };

  let stopMerged: boolean[] = [];
  let stopLabel: string[] = [];
  // Lay out the atlas for the current stops: badges [0, n), names [n, 2n), the skipped × last.
  const paintLabels = () => {
    atlas.clearRect(0, 0, ATLAS_W, ATLAS_H);
    let x = 1, y = 1, rowH = 0;
    const place = (k: number, paint: (x: number, y: number) => number[], anchorY: number) => {
      const probe = paint(-10_000, -10_000); // measure (drawn off-canvas)
      if (x + probe[0] + 1 > ATLAS_W) (x = 1), (y += rowH + 1), (rowH = 0);
      const [w, h] = paint(x, y);
      lRect.set([x / ATLAS_W, 1 - (y + h) / ATLAS_H, (x + w) / ATLAS_W, 1 - y / ATLAS_H], k * 4);
      lSize.set([w / AS, h / AS], k * 2);
      lAnchor.set([0.5, anchorY], k * 2);
      x += w + 1;
      rowH = Math.max(rowH, h);
    };
    const n = currentStops.length;
    currentStops.forEach((s, i) => place(i, (px, py) => paintBadge(stopLabel[i] || String(i + 1), px, py), 0.5));
    currentStops.forEach((s, i) => place(n + i, (px, py) => paintName(s.name, px, py), 1.6));
    if (current?.skipped) place(2 * n, paintSkip, 0.5);
    pops.forEach((p, k) => place(popBase + k, (px, py) => paintPop(p.title, p.sub, px, py), -0.55));
    atlasTex.needsUpdate = true;
    rectAttr.needsUpdate = sizeAttr.needsUpdate = anchorAttr.needsUpdate = true;
  };
  const buildStops = () => {
    const n = currentStops.length;
    stopLabel = currentStops.map((_, i) => String(i + 1));
    stopMerged = currentStops.map(() => false);
    currentStops.forEach((s, i) => {
      const v = toVec(s.lat, s.lon), r = 1 + WAVE_LIFT * 3 + groundAt(s.lat, s.lon);
      lPos.set([v[0] * r, v[1] * r, v[2] * r], i * 3);
      lPos.set([v[0] * r, v[1] * r, v[2] * r], (n + i) * 3);
    });
    lAlpha.fill(0);
    const sk = current?.skipped;
    if (sk) {
      const v = toVec(sk.lat, sk.lon), r = 1 + WAVE_LIFT * 3;
      lPos.set([v[0] * r, v[1] * r, v[2] * r], 2 * n * 3);
      lAlpha[2 * n] = 1;
    }
    popBase = 2 * n + (sk ? 1 : 0);
    pops = pickPops();
    popHidden.fill(false);
    lFade.fill(0);
    pops.forEach((p, k) => {
      const v = toVec(p.lat, p.lon), r = 1 + WAVE_LIFT * 3 + groundAt(p.lat, p.lon);
      lPos.set([v[0] * r, v[1] * r, v[2] * r], (popBase + k) * 3);
      lFade[popBase + k] = 1;
    });
    labelCount = popBase + pops.length;
    labelGeo.instanceCount = labelCount;
    paintLabels();
    posAttr.needsUpdate = alphaAttr.needsUpdate = fadeAttr.needsUpdate = true;
    lastCamKey = "";
  };
  // Stops that land on (almost) the same screen spot share one badge: "3·4".
  const mergeStops = () => {
    const pts = currentStops.map((s) => projectP(s.lat, s.lon, WAVE_LIFT));
    const owner = currentStops.map((_, i) => i);
    for (let i = 0; i < pts.length; i++)
      for (let j = 0; j < i; j++)
        if (owner[j] === j && Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < STOP_MERGE_PX) {
          owner[i] = j;
          break;
        }
    let repaint = false;
    currentStops.forEach((_, i) => {
      const group = owner.map((o, k) => (o === i ? k + 1 : 0)).filter(Boolean);
      const label = owner[i] === i ? group.join("·") : "";
      stopMerged[i] = owner[i] !== i;
      if (label && label !== stopLabel[i]) {
        stopLabel[i] = label;
        repaint = true;
      }
    });
    if (repaint) paintLabels();
    // Pop-ups: the second one hides when it would overlap the first (priority: top city), and
    // any pop-up hides under the docked dialog.
    const pp = pops.map((p) => projectP(p.lat, p.lon, WAVE_LIFT * 3));
    // Route badges the pop-up must not sit on (a dense route would otherwise cover the city name).
    const badges = pts.flatMap((q, i) => (stopMerged[i] || q.facing < 0.06 ? [] : [[q.x, q.y, lSize[i * 2] / 2 + 3, lSize[i * 2 + 1] / 2 + 3]]));
    let lifted = false;
    pops.forEach((_, k) => {
      const w = lSize[(popBase + k) * 2], h = lSize[(popBase + k) * 2 + 1];
      // Screen rect: the card sits `lift`–(lift + 1) card heights above its city; it climbs in half
      // steps until no route badge is under it.
      const x0 = pp[k].x - w / 2 - 4, x1 = pp[k].x + w / 2 + 4;
      const clear = (a: number) => !badges.some(([bx, by, bw, bh]) => x0 < bx + bw && x1 > bx - bw && pp[k].y - (1 + a) * h - 4 < by + bh && pp[k].y - a * h + 4 > by - bh);
      const lift = POP_LIFTS.find(clear) ?? POP_LIFTS[POP_LIFTS.length - 1];
      if (lAnchor[(popBase + k) * 2 + 1] !== -lift) (lAnchor[(popBase + k) * 2 + 1] = -lift), (lifted = true);
      const y0 = pp[k].y - (1 + lift) * h - 4, y1 = pp[k].y - lift * h + 4;
      let hide = pp[k].facing < 0.06 || panelRects.some(([rx, ry, rw, rh]) => x0 < rx + rw && x1 > rx && y0 < ry + rh && y1 > ry);
      for (let j = 0; j < k; j++) {
        const wj = lSize[(popBase + j) * 2];
        if (!popHidden[j] && Math.abs(pp[k].x - pp[j].x) < (w + wj) / 2 + 4 && Math.abs(pp[k].y - pp[j].y) < h + 4) hide = true;
      }
      popHidden[k] = hide;
    });
    if (lifted) anchorAttr.needsUpdate = true;
  };

  // ---- Leader line to the docked inspect panel ----
  const leaderGeo = new BufferGeometry();
  const leaderPos = new Float32Array(6);
  leaderGeo.setAttribute("position", new BufferAttribute(leaderPos, 3));
  const leaderMat = new LineBasicMaterial({ color: color("foreground"), transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const leader = new Line(leaderGeo, leaderMat);
  leader.renderOrder = 9;
  leader.frustumCulled = false;
  scene.add(leader);
  let inspectGroup = -1;
  let panelRects: [number, number, number, number][] = [];
  let anchor: [number, number] | null = null;
  let rectKey = "";
  const lp = new Vector3(), lq = new Vector3();
  const updateLeader = () => {
    const g = inspectGroup;
    const on = g >= 0 && !!anchor && (markerScreen[g * 3 + 2] ?? 0) > 0.2 && !underPanel(markerScreen[g * 3], markerScreen[g * 3 + 1]);
    leaderMat.opacity = on ? 0.55 : 0;
    leader.visible = on;
    if (!on || !anchor) return;
    const m = markerLatLon[g];
    lp.set(...toVec(m.lat, m.lon)).multiplyScalar(1 + WAVE_LIFT * 2).applyMatrix4(globe.matrixWorld);
    lq.copy(lp).project(camera);
    lq.set((anchor[0] / W) * 2 - 1, 1 - (anchor[1] / H) * 2, lq.z).unproject(camera);
    leaderPos.set([lp.x, lp.y, lp.z, lq.x, lq.y, lq.z]);
    leaderGeo.attributes.position.needsUpdate = true;
  };
  const underPanel = (x: number, y: number) => {
    for (const [rx, ry, rw, rh] of panelRects) if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return true;
    return false;
  };

  // ---- Hit test: the nearest marker whose zone holds the point (a Voronoi split of overlaps) ----
  // `keep` (the hovered one) gets a slightly wider zone and wins unless another is clearly closer.
  const hit = (x: number, y: number, touch = false, keep = -1) => {
    let best = -1, bestD = Infinity, keepD = Infinity;
    for (const i of markerIndex.get(Math.floor(x / INDEX_CELL_PX) * 4096 + Math.floor(y / INDEX_CELL_PX)) ?? []) {
      const d = Math.hypot(markerScreen[i * 3] - x, markerScreen[i * 3 + 1] - y);
      const r = Math.max(markerZone[i], touch ? ZONE_PX_TOUCH : 0) * (i === keep ? HOVER_KEEP : 1);
      if (d > r) continue;
      if (i === keep) keepD = d;
      if (d < bestD) (bestD = d), (best = i);
    }
    // Switch only when the other marker is ≥ 25% closer AND at least SWITCH_MIN_PX closer, so a few
    // pixels of hand jitter between two close markers never flips the dialog back and forth.
    if (keepD < Infinity && best !== keep && (bestD > keepD * SWITCH_RATIO || keepD - bestD < SWITCH_MIN_PX)) return keep;
    return best >= 0 ? best : nbHit(x, y);
  };
  // Ring on the hovered marker (or the inspected one): instance attribute, no re-render.
  const lit: number[] = [];
  const setHighlight = () => {
    const attr = markerGeo.getAttribute("aState") as THREE.BufferAttribute | undefined;
    if (!attr) return;
    for (const i of lit) if (i < attr.count) attr.setX(i, markerBaseState[i] ?? 0);
    lit.length = 0;
    for (const i of [hoverCandidate, inspectGroup]) if (i >= 0 && i < attr.count) attr.setX(i, 3), lit.push(i);
    attr.needsUpdate = true;
  };
  const emitZoomed = () => {
    const on = zoomUser > 0.01;
    if (on !== zoomedSent) emit({ t: "zoomed", on: (zoomedSent = on) });
  };
  let zoomedSent = false;
  let camMovedAt = 0, markersPublished = false, markersAt = 0;
  let hoverSent = -1;

  // ---- Pointer input (forwarded from the page) ----
  const pointer = (e: Extract<GlobeIn, { t: "pointer" }>) => {
    const p = { x: e.x, y: e.y };
    switch (e.kind) {
      case "enter":
        return;
      case "leave":
        hoverPos = undefined;
        hoverCandidate = -1;
        setHighlight();
        if (hoverSent >= 0) {
          emit({ t: "hover", group: -1, from: hoverSent });
          emit({ t: "interact", kind: "release", reason: "marker" });
          hoverSent = -1;
        }
        return;
      case "down":
        pointers.set(e.id, p);
        emit({ t: "interact", kind: "hold", reason: "pointer" });
        fling = undefined;
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomUser };
          dragging = undefined;
          return;
        }
        dragging = { ...p, lat: viewLat, lon: viewLon, t: e.time, moved: false, degPx: degPerPx() };
        travel = undefined;
        return;
      case "move": {
        if (pointers.has(e.id)) pointers.set(e.id, p);
        if (pinch && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          zoomUser = Math.min(1, Math.max(0, pinch.z + Math.log(Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) * PINCH_ZOOM));
          emitZoomed();
          return;
        }
        if (dragging) {
          if (Math.hypot(p.x - dragging.x, p.y - dragging.y) > TAP_PX && !dragging.moved) dragging.moved = true;
          if (dragging.moved) {
            // Grab and follow: the point under the cursor stays under it (degrees per pixel measured
            // on screen at the drag start, so the speed follows the zoom).
            const dp = dragging.degPx, cosLat = Math.max(0.35, Math.cos((dragging.lat * Math.PI) / 180));
            viewLon = dragging.lon - ((p.x - dragging.x) * dp) / cosLat;
            viewLat = Math.max(LAT_MIN, Math.min(LAT_MAX, dragging.lat + (p.y - dragging.y) * dp));
            // Smoothed drag velocity, for the coast after letting go.
            const t = e.time, dts = (t - vel.t) / 1000;
            if (vel.t && dts > 0) {
              const a = Math.min(1, dts / 0.05);
              vel.lon += (lonDelta(vel.pLon, viewLon) / dts - vel.lon) * a;
              vel.lat += ((viewLat - vel.pLat) / dts - vel.lat) * a;
            }
            Object.assign(vel, { t, pLon: viewLon, pLat: viewLat });
          }
          return;
        }
        if (!e.touch) {
          hoverPos = p; // handled once per frame
          if (lastMove && e.time > lastMove.t) {
            const v = Math.hypot(p.x - lastMove.x, p.y - lastMove.y) / (e.time - lastMove.t);
            pointerSpeed += (v - pointerSpeed) * Math.min(1, (e.time - lastMove.t) / 60);
          }
          lastMove = { ...p, t: e.time };
        }
        return;
      }
      case "up":
      case "cancel": {
        pointers.delete(e.id);
        if (pointers.size < 2) pinch = undefined;
        const d = dragging;
        dragging = undefined;
        if (!pointers.size) emit({ t: "interact", kind: "release", reason: "pointer" });
        if (e.kind === "cancel") return;
        // Coast only if the pointer was still moving when it let go.
        if (d?.moved && e.time - vel.t < 80) {
          const v = Math.hypot(vel.lon, vel.lat), cap = Math.min(1, FLING_MAX_DEG_S / (v || 1));
          if (v > 8) fling = { lon: vel.lon * cap, lat: vel.lat * cap };
        }
        Object.assign(vel, { t: 0, lon: 0, lat: 0 });
        if (d && !d.moved && e.time - d.t < TAP_MS) {
          const h = underPanel(p.x, p.y) ? -1 : hit(p.x, p.y, e.touch);
          // Double tap (touch) off a marker zooms in a step toward it; mouse uses dblclick.
          if (e.touch && h < 0 && lastTap && e.time - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
            lastTap = undefined;
            zoomBy(ZOOM_STEP, p.x, p.y);
            return;
          }
          lastTap = { ...p, t: e.time };
          emit({ t: "tap", group: h });
        }
        return;
      }
    }
  };

  // ---- Examples to draw: grids per act computed here (off the main thread in the worker) ----
  const densityCache = new Map<string, ActGrids>();
  let showToken = 0;
  const showMsg = (m: Extract<GlobeIn, { t: "show" }>) => {
    const token = ++showToken;
    const gridsFor = async () => {
      let grids = densityCache.get(m.ex.fanKey);
      if (!grids) {
        grids = m.density ? await actGrids(m.density) : EMPTY_GRIDS;
        if (m.density) {
          densityCache.set(m.ex.fanKey, grids);
          // Keep the last few acts only (grids are ~0.5 MB each): flat memory over a long visit.
          if (densityCache.size > DENSITY_CACHE) densityCache.delete(densityCache.keys().next().value!);
        }
      }
      return grids;
    };
    // Run after the next paint: the click/advance that caused it paints first (INP), then the act's
    // grids (sliced) and, in its own task, the show and bake hand-off.
    raf(() =>
      setTimeout(async () => {
        if (token !== showToken || disposed) return;
        const g = await gridsFor();
        setTimeout(() => token === showToken && !disposed && show(m.ex, g, m.move), 0);
      }, 0),
    );
  };

  const handle = (m: GlobeIn) => {
    if (disposed) return;
    if (m.t !== "stats") dirty(m.t === "show" ? 1500 : 800);
    switch (m.t) {
      case "size":
        W = m.width;
        H = m.height;
        // The screen's DPR changed (window moved to another display, browser zoom): follow it.
        if (m.dpr && capDpr(m.dpr) !== renderer.getPixelRatio()) {
          renderer.setPixelRatio(capDpr(m.dpr));
          cityMat.uniforms.uScale.value = markerMat.uniforms.uScale.value = renderer.getPixelRatio();
        }
        resize();
        lastCamKey = "";
        return;
      case "pointer":
        return pointer(m);
      case "zoom":
        return zoomBy(m.dz, m.x, m.y);
      case "rotate":
        return rotateBy(m.dLon, m.dLat);
      case "cancelInput":
        return cancelInput();
      case "reset":
        return reset();
      case "goto":
        return goto(m.lat, m.lon, m.zoom);
      case "visible":
        visible = m.on;
        last = performance.now();
        dirty();
        return;
      case "playing":
        playing = m.on;
        dirty();
        return;
      case "stats": {
        const i = renderer.info;
        emit({ t: "stats", calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0, tier, dpr: renderer.getPixelRatio(), gpuMs: timerExt ? Math.round(gpuMs * 100) / 100 : null,
          // What's on screen: the shown example, its fan points, the terrain's peak (0–255) and
          // whether a fan surface is drawn at all (terrain visible with height, or the wave shell).
          nav: { lat: Math.round(viewLat * 100) / 100, lon: Math.round(viewLon * 100) / 100, zoom: Math.round(zoomUser * 1000) / 1000, travel: !!travel, dragging: !!dragging, pinch: !!pinch, pointers: pointers.size, degPx: Math.round(degPerPx() * 1e4) / 1e4 },
          shown: current?.id ?? null, points: currentPoints.length, peak: terrainPeak, bake: { ...bakeStats, ms: [...bakeStats.ms], queued: pendingBakes.size, cached: bakedCache.size, n: terrainN }, surface: !lost && terrain.visible && terrainPeak > 0 && Number.isFinite(viewLat + viewLon + zoomEff),
          pops: pops.filter((_, k) => lAlpha[popBase + k] > 0.5).map((p) => p.title),
          neighbours: nbSlots.filter((sl) => sl && sl.a > 0.5).map((sl) => sl!.id),
          nbGroups: nbSlots.filter((sl) => sl && sl.a > 0.5).map((sl) => sl!.group),
          view: [viewLat, viewLon, zoomEff] });
        return;
      }
      case "world": {
        // Base layers are not urgent: build them when the main thread is idle.
        const w = m.world;
        const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (idle) idle(() => void (!disposed && setWorld(w)), { timeout: 1500 });
        else setTimeout(() => void (!disposed && setWorld(w)), 50);
        return;
      }
      case "towns": {
        const c = m.cities;
        const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        const run = () => !disposed && ((cityLists[1] = Int16Array.from(c)), setCities(), dirty());
        if (idle) idle(run, { timeout: 3000 });
        else setTimeout(run, 50);
        return;
      }
      case "groups":
        setGroups(m.groups);
        setHighlight();
        return;
      case "show":
        return showMsg(m);
      case "prebake":
        return prebake(m.items);
      case "neighbours":
        return nbSet(m.items);
      case "inspect":
        inspectGroup = m.group;
        setHighlight();
        return;
      case "panels":
        panelRects = m.rects;
        anchor = m.anchor;
        rectKey = JSON.stringify(m.rects);
        if (pops.length) (mergeStops(), dirty());
        return;
    }
  };

  // Resolves once the GPU has executed everything queued so far (polled, never blocking), or after
  // GPU_IDLE_MAX_MS. getSyncParameter only updates between tasks, so each poll is its own task.
  const gpuIdle = async () => {
    const g2 = gl as WebGL2RenderingContext;
    if (!g2.fenceSync) return;
    const fence = g2.fenceSync(g2.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) return;
    g2.flush();
    const t0 = performance.now();
    while (!disposed && g2.getSyncParameter(fence, g2.SYNC_STATUS) !== g2.SIGNALED && performance.now() - t0 < GPU_IDLE_MAX_MS) await new Promise((r) => setTimeout(r, 16));
    g2.deleteSync(fence);
  };
  // Compile every shader before the first frame, behind the placeholder (uses
  // KHR_parallel_shader_compile when the driver has it), so the reveal never stutters.
  try {
    await yieldNow();
    // Compile for where the scene will draw: the AA target (linear output) on the top tier, the
    // canvas otherwise; programs differ by output colour space.
    renderer.setRenderTarget(aaTarget ?? null);
    // Geometry filled in later (markers, cities) gets an empty position attribute now: the program
    // key depends on it, and a mismatch would recompile in the first visible frame.
    scene.traverse((o) => {
      const g = (o as Mesh).geometry;
      if (g && !g.getAttribute("position")) g.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
    });
    await renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    renderer.compile(aaScene, aaCam);
    // Without KHR_parallel_shader_compile, compileAsync resolves at once and the first uniform
    // query blocks until the driver has linked (~0.6 s for the terrain on Intel/Mesa). Wait for
    // the GPU to get through the links first, polling, so that query returns immediately.
    await gpuIdle();
    // Some drivers report "complete" early and really link on the first status query; query each
    // program in its own slice so that work never lands in one long first frame.
    // Warm each program with one draw, one object per slice: some drivers only really compile on
    // first use, which would otherwise all land in the first visible frame (~0.5 s on Intel/Mesa).
    const warm: Mesh[] = [];
    scene.traverse((o) => ((o as Mesh).isMesh || (o as unknown as { isPoints?: boolean }).isPoints || (o as unknown as { isLine?: boolean }).isLine) && warm.push(o as Mesh));
    for (const o of warm) {
      await yieldNow();
      const vis = o.visible;
      o.visible = true;
      o.layers.enable(31);
      camera.layers.set(31);
      renderer.setRenderTarget(aaTarget ?? null);
      renderer.render(scene, camera);
      o.layers.disable(31);
      o.visible = vis;
    }
    camera.layers.set(0);
    renderer.setRenderTarget(null);
    await yieldNow();
    if (aaTarget) renderer.render(aaScene, aaCam);
    // Upload the big textures one per slice, so the first visible frame doesn't do it all at once.
    for (const t of [earthTex, detailTex, dataT, softT, worldT, terrainT, atlasTex]) {
      await yieldNow();
      renderer.initTexture(t);
    }
    // Let the GPU finish all of that (driver-side linking, uploads) while the still is showing: poll a
    // fence instead of letting the first visible frame block on it.
    await gpuIdle();
  } catch {}
  rafId = raf(frame);
  if (import.meta.env.DEV) (globalThis as unknown as Record<string, unknown>).__globeScene = { camera, scene, state: () => ({ focusK, travel: !!travel, shows: showToken, viewLat, viewLon, zoomEff }) };
  emit({ t: "ready" });
  const dispose = () => {
    disposed = true;
    cancelRaf(rafId);
    for (const g of [sphereGeo, rimGeo, cityGeo, waveGeo, towerGeo, shadowGeo, routeGeo, stubGeo, markerGeo, leaderGeo]) g.dispose();
    for (const m of [earthMat, rimMat, cityMat, waveMat, towerMat, shadowMat, routeMat, haloMat, stubMat, markerMat, leaderMat]) m.dispose();
    for (const t of [earthTex, detailTex, dataT, softT, worldT, fineT, atlasTex]) t.dispose();
    towers.dispose();
    shadows.dispose();
    // Everything else in the scene (terrain, sprites, labels) and the passes.
    const rest = new Set<{ dispose: () => void }>([terrainGeo, terrainT, shadeT, aaGeo, aaMat]);
    if (terrainGeoLow) rest.add(terrainGeoLow);
    if (aaTarget) rest.add(aaTarget);
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) rest.add(m.geometry);
      for (const mt of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
        rest.add(mt);
        const map = (mt as SpriteMaterial).map;
        if (map) rest.add(map);
        for (const u of Object.values((mt as ShaderMaterial).uniforms ?? {})) if (u.value instanceof Texture) rest.add(u.value);
      }
    });
    for (const r of rest) r.dispose();
    if (gpuQuery) gl.deleteQuery(gpuQuery);
    (canvas as HTMLCanvasElement).removeEventListener?.("webglcontextlost", onLost);
    (canvas as HTMLCanvasElement).removeEventListener?.("webglcontextrestored", onRestored);
    bakeWorker?.terminate();
    bakedCache.clear();
    pendingBakes.clear();
    landWorker?.terminate();
    (detailTex as unknown as { image: { close?: () => void } }).image.close?.();
    renderer.dispose();
    // Release the context's GPU memory now instead of waiting for GC (the page gives each scene its
    // own canvas, so nothing reuses this one).
    renderer.forceContextLoss();
  };
  return { handle, dispose };
}
