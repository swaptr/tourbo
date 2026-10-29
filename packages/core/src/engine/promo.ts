import type { CityScore, Hotspot } from "../shared/types.ts";

// Split a promo budget across stops by expected extra tickets: unsold seats × city demand.
// Spend goes to the top fan hotspots (geohash cells) — the neighbourhoods for flyers and geo-ads.
export type PromoStop = { city: string; capacity: number; tickets: number; relDemand: number; hotspots: Hotspot[] };

export type PromoAllocation = { city: string; spend: number; share: number; unsold: number; targets: { geohash: string; lat: number; lon: number; radiusKm: number }[]; why: string };

export function allocatePromo(budget: number, stops: PromoStop[]): PromoAllocation[] {
  const weights = stops.map((s) => Math.max(0, s.capacity - s.tickets) * Math.sqrt(Math.max(s.relDemand, 0.05)));
  const total = weights.reduce((a, b) => a + b, 0);
  return stops.map((s, i) => {
    const share = total ? weights[i] / total : 1 / stops.length;
    const unsold = Math.max(0, s.capacity - s.tickets);
    return {
      city: s.city,
      spend: Math.round(budget * share),
      share: Math.round(share * 100) / 100,
      unsold,
      targets: s.hotspots.slice(0, 3).map((h) => ({ geohash: h.geohash, lat: h.lat, lon: h.lon, radiusKm: 1.5 })),
      why: unsold ? `${unsold} seats expected unsold; demand ×${s.relDemand}` : "Expected to sell out; minimal spend",
    };
  });
}

export const hotspotsOf = (score: CityScore) => score.hotspots;
