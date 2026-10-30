// Hand-written three-night plan for the levers / proposals / prompts units. Money is filled in by
// the engine's own evaluate() via repriceStop, so the numbers are internally consistent.
import { repriceStop, retotal } from "../../packages/core/src/engine/levers.ts";
import type { CityPlan, Plan, ShowMoney } from "../../packages/core/src/shared/types.ts";

const money = (draw: number, relDemand: number, capacity: number, price: number, costs: number): ShowMoney => ({
  verdict: "headline",
  why: "",
  currency: "USD",
  deal: "door_split",
  price,
  capacity,
  tickets: 0,
  sellThrough: 0,
  gross: 0,
  artistTake: 0,
  costs,
  profit: 0,
  relDemand,
  draw,
  basis: "fixture",
  estimate: true,
});

function stop(name: string, lat: number, lon: number, score: number, m: ShowMoney, date: string, extra: Partial<CityPlan> = {}): CityPlan {
  const s: CityPlan = { city: { name, region: "na", lat, lon }, score, date, hotspots: [], evidence: [], thinData: false, money: m, ...extra };
  return repriceStop(s, "na", "musician", {});
}

export function fixturePlan(): Plan {
  const stops = [
    stop("Chicago", 41.88, -87.63, 90, money(520, 1.6, 500, 25, 900), "2026-11-10", {
      venue: { id: "v1", name: "Main Room", tag: "urn:tag:category:place:music_venue", foundBy: "fixture" },
      backupVenue: { id: "v2", name: "Backup Hall", tag: "urn:tag:category:place:music_venue", foundBy: "fixture" },
    }),
    stop("Detroit", 42.33, -83.05, 61, money(260, 0.8, 600, 25, 820), "2026-11-11"),
    stop("Pittsburgh", 40.44, -79.99, 70, money(330, 1, 400, 25, 950), "2026-11-13"),
  ];
  // Set the verdicts the way the planner would.
  for (const s of stops) {
    const m = s.money!;
    m.verdict = m.profit >= 0 && m.sellThrough >= 0.6 ? "headline" : m.profit >= 0 ? "co-headline" : m.relDemand >= 0.5 ? "support slot" : "skip";
  }
  const plan: Plan = {
    artist: { id: "A1", name: "Fixture Act", kind: "musician", peers: [], tags: [] },
    params: {
      artist: "Fixture Act", kind: "musician", peers: [], notInQloo: false, region: "na", shows: 3, startDate: "2026-11-10",
      roomMin: 200, roomMax: 800, money: { crew: 3 }, jobs: [],
    },
    stops,
    legs: [
      { from: "Chicago", to: "Detroit", km: 380 },
      { from: "Detroit", to: "Pittsburgh", km: 330 },
    ],
    totalKm: 710,
  };
  return retotal(plan);
}
