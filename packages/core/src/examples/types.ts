// Client-safe shape of a home-page example (Q7). Built by scripts/prewarm-examples.ts through
// the Tourbo engine, stored in Postgres (home_examples), read by the home loader. Never in git.

export type Continent = "africa" | "asia" | "europe" | "north_america" | "south_america" | "oceania";

export type ExampleCity = {
  name: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lon: number;
  fanStrength: number; // 0–100, relative to the cities in this example
  lean: number; // how much the city leans to this act vs its size (1 = average)
  why?: ScoreWhy; // what's behind fanStrength, for the hover/"why?" view
};

// "Why is fan strength 92?": the score's parts in plain terms.
export type ScoreWhy = {
  reach: number; // 0–100: how many fans, vs the other candidate cities
  pull: number; // 0–100: how strongly the city leans to the act
  rank: number; // 1-based rank among `of` candidate cities
  of: number;
  hotspots: number; // fan clusters found in the city (heatmap cells)
  line: string; // e.g. "Most fans of the 15 cities near Sydney (reach 100) and a strong lean (80). Fan strength = 60% reach + 40% lean."
};

// What the example showcases: examples lead with a decision Tourbo made, rotated across types.
export type ExampleFeature = "route" | "offer" | "prep" | "rehearsal" | "pace" | "venue";

// "Why here, not there?": the chosen city against the alternative it beat (WhyCompare).
export type CompareCity = {
  name: string;
  fanStrength: number; // 0–100
  why?: ScoreWhy;
  lean: number; // 1 = average pull for its size
  tickets: number; // expected tickets
  roomFit: string; // e.g. "theatre, ~1,600 seats for ~1,400 expected"
  profit: number; // estimated night profit (negative = loses money)
  travelKm: number; // from the act's home city
  localTaste?: string; // one plain line on what that city's fans love
};
// reason: set when the skipped city would earn more; the engine's own reason (off route, thin data).
export type Compare = { line: string; currency: string; chosen: CompareCity; skipped: CompareCity; reason?: string };

export type HomeExample = {
  id: string; // slug, e.g. "acdc-sydney-route"
  feature: ExampleFeature;
  // The decision, in plain words: headline + 2–4 supporting lines (no vendor or tool names).
  // e.g. route: "5 nights, A$212k estimated profit" / offer: "Counter A$9,000 flat with A$12,000 vs 70% of the door"
  // prep: an opening line + a local nod / rehearsal: a line and who loved or winced / pace: "Behind: 120 of 300 sold, 21 days out → move promo to …"
  // venue: "Enmore Theatre over Hordern Pavilion: right size for 1,600 expected"
  decision: { headline: string; lines: string[] };
  // comparable: the act isn't in the fan data, so it was planned from these acts' fans (say so on the card).
  act: { name: string; kind: string; image?: string; comparable?: string[] };
  home: { city: string; country: string; continent: Continent; lat: number; lon: number };
  cities: ExampleCity[]; // top 3–5 by fan strength, best first
  medianFanStrength: number; // across all candidate cities, for the "why?" chart
  surprise?: { city: string; line: string }; // a high-scoring city people wouldn't guess
  skipped?: { name: string; lat: number; lon: number; fanStrength: number }; // a big city the route leaves out (grey ×, no arc)
  room?: { name: string; type?: string; city: string; capacity?: number }; // best bookable room (never a festival); type e.g. "theatre"
  route?: { name: string; lat: number; lon: number; date: string; profit: number }[]; // play order
  tourProfit?: { amount: number; currency: string; nights: number }; // profitable nights only
  // The weakest candidate night: loses money (loses: true, amount = the loss) or, when every nearby
  // night pays, the thinnest margin (loses: false, amount = −profit).
  losingNight?: { city: string; amount: number; currency: string; loses: boolean; line: string };
  profit?: { amount: number; currency: string; city: string }; // estimated profit of the best night
  localTaste?: { city: string; line: string }; // one plain line on what that city's fans love
  compare?: Compare;
  fanKey: string; // the act's worldwide fan density lives in home_fan_density (shared by its examples)
  // Worldwide fan density for the globe: country heatmaps on a 0.25° (rich countries) or 0.5° grid,
  // plus metro heatmaps at full resolution (geohash 6–7) for the act's top fan countries. Weight 0–1
  // blends the share of the country's (or metro's) peak with a log-scaled global Σ affinity ×
  // popularity, scaled down for thin countries. ≤ ~25k points per act; low weights are faded by
  // the renderer, not dropped.
  // Not stored on the example row; filled from home_fan_density when needed.
  fanPoints?: FanPoint[];
  coverage?: Coverage;
  checkedAt: string; // ISO date of the data
};

export type CityDot = [lon: number, lat: number];

export type FanPoint = [lat: number, lon: number, weight: number];
// In the landing bundle (examples:export), points in thin-data countries carry a 4th element: 1.
export type LandingFanPoint = FanPoint | [lat: number, lon: number, weight: number, thin: 1];
export type Coverage = Record<string, { cells: number; thin: boolean }>; // per ISO country code with any data
export type FanDensity = { fanPoints: FanPoint[]; coverage: Coverage };

// ---- Landing bundle: per-continent fan points (examples:export → public/landing/density-<continent>.<hash>.json) ----
// One file per home continent, one entry per act (fanKey), shared by all of that act's examples, so
// no point is stored twice. Columnar quantised ints (gzip/brotli well, parse fast, decode exactly):
// - lat[i], lon[i]: degrees × 100 (the export rounds points to 0.01°, so k / 100 is exact)
// - w: weight × 100, strongest first; w[0] is the first weight, then each entry is the drop from the
//   previous one (always ≥ 0)
// - thin: indexes of points in thin-data countries, ascending, delta-coded (first index, then gaps)
// The browser bakes each example's terrain from these points plus the example's own fields
// (cities, route, decision.lines, skipped, home → terrainSpec) and the coarse land it already loads.
export type LandingActPoints = { lat: number[]; lon: number[]; w: number[]; thin: number[]; coverage: Coverage };
export type LandingRegionFile = { v: 1; acts: Record<string, LandingActPoints> };
