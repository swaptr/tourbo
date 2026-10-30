import type { City, PerformerKind, Region } from "../shared/types.ts";
import { seedCities } from "./cities.ts";
import { resolvePerformer, signalIds } from "./resolve.ts";
import { scoreCities } from "./score.ts";

// Backtest: for real tours that experienced bookers routed, how many of the act's real cities
// does Tourbo's Qloo scoring put in its top N (N = real stops that are in our seed list)?
// This is agreement with bookers' picks, not accuracy: a real route isn't proof of the best cities.
// Ground truth lives in tests/stories/backtest.json with a public source URL per tour.

export type KnownTour = { act: string; kind: PerformerKind; region: Region; tour: string; source: string; cities: string[] };
export type TourResult = {
  act: string;
  tour: string;
  region: Region;
  matched: string[]; // real cities that are in the seed list
  unmatched: string[]; // real cities outside the seed list (ignored)
  picked: string[]; // Tourbo's top N
  agree: number; // |picked ∩ matched| / N
  chance: number; // expected agreement of a random pick of N seed cities: N / |seeds|
  found: boolean;
};

const ALIASES: Record<string, string> = {
  "new york city": "new york",
  nyc: "new york",
  "washington dc": "washington",
  "washington d c": "washington",
  bangalore: "bengaluru",
  delhi: "new delhi",
  gurgaon: "gurugram",
  bombay: "mumbai",
  calcutta: "kolkata",
  "st louis": "st louis",
  "saint louis": "st louis",
};
const norm = (s: string) => {
  const n = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return ALIASES[n] ?? n;
};

// Suburbs and neighbouring towns → the metro in our seed list (per region: Cambridge is Boston in NA).
const METRO: Partial<Record<Region, Record<string, string>>> = {
  na: { englewood: "denver", "mckees rocks": "pittsburgh", lakewood: "cleveland", "solana beach": "san diego", "royal oak": "detroit", "st paul": "minneapolis", "saint paul": "minneapolis", carrboro: "chapel hill", saxapahaw: "chapel hill", cambridge: "boston", boulder: "denver" },
};

export function matchCities(names: string[], seeds: City[], region?: Region) {
  const byName = new Map(seeds.map((c) => [norm(c.name), c.name]));
  const key = (n: string) => (region && METRO[region]?.[norm(n)]) ?? norm(n);
  const matched = [...new Set(names.map((n) => byName.get(key(n))).filter((n): n is string => !!n))];
  const unmatched = names.filter((n) => !byName.has(key(n)));
  return { matched, unmatched };
}

export const agreement = (picked: string[], truth: string[]) => (truth.length ? picked.filter((p) => truth.includes(p)).length / truth.length : 0);

export async function backtestTour(t: KnownTour): Promise<TourResult> {
  const seeds = seedCities(t.region);
  const { matched, unmatched } = matchCities(t.cities, seeds, t.region);
  const n = matched.length;
  const base = { act: t.act, tour: t.tour, region: t.region, matched, unmatched, chance: Math.round((n / seeds.length) * 100) / 100 };
  const artist = await resolvePerformer(t.act, t.kind);
  if (!artist || artist.unknown || !n) return { ...base, picked: [], agree: 0, found: !!artist };
  const scores = await scoreCities(signalIds(artist), seeds);
  const picked = scores.slice(0, n).map((s) => s.city.name);
  return { ...base, picked, agree: Math.round(agreement(picked, matched) * 100) / 100, found: true };
}

export async function backtest(tours: KnownTour[]) {
  const results: TourResult[] = [];
  for (const t of tours) results.push(await backtestTour(t));
  const scored = results.filter((r) => r.found && r.matched.length);
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0);
  return { results, grounded: mean(scored.map((r) => r.agree)), chance: mean(scored.map((r) => r.chance)) };
}
