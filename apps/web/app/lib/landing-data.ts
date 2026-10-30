// Landing data in the browser. In production everything comes from the static export in /landing
// (manifest → hashed examples, world and per-continent density files); nothing calls the fan-data
// API, the agent or the database. In dev, before the export exists, the same shapes come from
// /api/home (dev-only). Client-safe.
import { decodeAct } from "@tourbo/core/examples/landing-format.ts";
import type { Continent, FanDensity, FanPoint, HomeExample, LandingRegionFile } from "@tourbo/core/examples/types.ts";

// "warming": the export gate failed; only the world layer (and towns) exist, no examples yet.
// "incomplete": dev-only --ignore-gate export. Older manifests have no status (= ready).
export type LandingManifest = {
  version: string;
  status?: "ready" | "incomplete" | "warming";
  counts?: Record<string, number>;
  // regions: home continent → fan points of its acts (LandingRegionFile). Terrain is baked in the
  // browser from these plus the example itself; the bundle ships data only.
  files: { examples?: string; world?: string; towns?: string; regions?: Partial<Record<Continent, string>>; still?: string; contrast?: string };
};
// City lights ("cities", never fans), flat: [lon×10, lat×10, size bucket, …]. The world file has
// cities ≥ 50k (buckets 2–4); the lazy towns file has the small towns (bucket 1).
export type WorldFile = { fan: FanPoint[]; cities: number[] };
export type TownsFile = { cities: number[] };
export type ContrastRow = { city: string; side: "fan" | "guess" | "both"; line: string };
export type Contrast = { act: string; runId: string; rows: ContrastRow[] };

export type GlobeSource = {
  world: () => Promise<WorldFile | undefined>;
  towns: () => Promise<TownsFile | undefined>;
  density: (ex: HomeExample) => Promise<FanDensity | undefined>;
};

const getJson = <T>(url: string): Promise<T | undefined> =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : undefined))
    .catch(() => undefined);

const LANDING = "/landing/";
const ACTS_KEPT = 8; // unpacked acts kept (matches the scene's grid cache)

// A region file stays as parsed (compact int columns, ~1 MB per region); an act is decoded to
// points only when shown (decodeAct: exact, k / 100).
export function staticSource(m: LandingManifest): GlobeSource {
  const regions = new Map<string, Promise<LandingRegionFile | undefined>>();
  const acts = new Map<string, FanDensity>(); // decoded, the same object per act (grids cache by it)
  let world: Promise<WorldFile | undefined> | undefined;
  return {
    world: () => (world ??= m.files.world ? getJson<WorldFile>(LANDING + m.files.world) : Promise.resolve(undefined)),
    towns: () => (m.files.towns ? getJson<TownsFile>(LANDING + m.files.towns) : Promise.resolve(undefined)),
    density: async (ex) => {
      const file = m.files.regions?.[ex.home.continent];
      if (!file) return undefined;
      let p = regions.get(file);
      if (!p) regions.set(file, (p = getJson<LandingRegionFile>(LANDING + file).then((r) => (r?.v === 1 ? r : undefined))));
      const r = await p;
      if (!r) regions.delete(file); // a failed fetch is retried next time, never cached as "no data"
      const hit = acts.get(ex.fanKey);
      if (hit) return hit;
      const packed = r?.acts[ex.fanKey];
      if (!packed) return undefined;
      const d = decodeAct(packed);
      acts.set(ex.fanKey, d);
      if (acts.size > ACTS_KEPT) acts.delete(acts.keys().next().value!);
      return d;
    },
  };
}

export function devSource(): GlobeSource {
  const acts = new Map<string, Promise<FanDensity | undefined>>();
  let world: Promise<WorldFile | undefined> | undefined;
  return {
    world: () => (world ??= getJson<WorldFile>("/api/home?part=world")),
    towns: () => getJson<TownsFile>("/api/home?part=towns"),
    density: (ex) => {
      let p = acts.get(ex.fanKey);
      if (!p) acts.set(ex.fanKey, (p = getJson<FanDensity>(`/api/home?part=act&fanKey=${encodeURIComponent(ex.fanKey)}`)));
      return p.then((d) => (d || acts.delete(ex.fanKey), d));
    },
  };
}

export const landingWarming = (m: LandingManifest) => m.status === "warming" || !m.files.examples;
export const loadStaticExamples = (m: LandingManifest) => (m.files.examples ? getJson<HomeExample[]>(LANDING + m.files.examples) : Promise.resolve(undefined));
export const loadDevExamples = () => getJson<HomeExample[]>("/api/home?part=examples");
export const loadStaticContrast = (m: LandingManifest) => (m.files.contrast ? getJson<Contrast>(LANDING + m.files.contrast) : Promise.resolve(undefined));
// No data at all (export missing in production, or the no-data preview): land only.
export const emptySource: GlobeSource = { world: async () => undefined, towns: async () => undefined, density: async () => undefined };
