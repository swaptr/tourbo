import { Region, type CityScore, type PerformerKind } from "../shared/types.ts";
import { seedCities } from "./cities.ts";
import { resolveArtist, resolveStyles } from "./resolve.ts";
import { scoreCities } from "./score.ts";
import { noopEmit, type Emit } from "./trace.ts";

// "Tour where acts like you already win": score every seed city in the chosen regions from the
// fans of comparable acts and/or a genre or scene tag (e.g. qawwali: Delhi 628 cells, Mumbai 356,
// Jaipur 110, Lucknow 69, Bengaluru 43; probe 2026-10-29). Scores are relative to this run only.
export type MarketSignal = { acts: { id: string; name: string }[]; tags: { id: string; name: string }[] };

export async function resolveMarketSignal(opts: { acts?: string[]; genres?: string[]; kind?: PerformerKind }): Promise<MarketSignal> {
  const [acts, tags] = await Promise.all([
    Promise.all((opts.acts ?? []).map((a) => resolveArtist(a, opts.kind))),
    resolveStyles(opts.genres ?? [], opts.kind),
  ]);
  return {
    acts: acts.filter((a) => !!a).map((a) => ({ id: a!.id, name: a!.name })),
    tags,
  };
}

export type Market = CityScore & { region: Region };

export async function findMarkets(signal: MarketSignal, regions: Region[], emit: Emit = noopEmit): Promise<Market[]> {
  const cities = regions.flatMap((r) => seedCities(r).map((c) => ({ ...c, region: r })));
  const scores = await scoreCities({ entities: signal.acts.map((a) => a.id), tags: signal.tags.map((t) => t.id) }, cities, emit);
  return scores.map((s) => ({ ...s, region: (s.city as (typeof cities)[number]).region }));
}

export const ALL_REGIONS = Region.options;
