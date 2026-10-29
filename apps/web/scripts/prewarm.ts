// Fills the Qloo cache for the demo artists so first runs are fast (cache TTL 7 days).
// Usage: npm run qloo:prewarm
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { buildPlan } from "@tourbo/core/engine/plan.ts";
import { qlooCacheHits, qlooCallCount } from "@tourbo/core/qloo/client.server.ts";
import { TourParams } from "@tourbo/core/shared/types.ts";

// Keep in sync with DEMOS in app/routes/home.tsx.
const DEMOS = [
  { artist: "Japanese Breakfast", region: "na" },
  { artist: "Arijit Singh", region: "in" },
  { artist: "Water From Your Eyes", region: "na" },
] as const;

// 12 shows plans the top 12 cities, covering the agent's shortlist for up to 8 shows.
for (const demo of DEMOS) {
  const started = performance.now();
  const params = TourParams.parse({ ...demo, shows: 12, startDate: new Date().toISOString().slice(0, 10) });
  const plan = await buildPlan(params).catch((error: Error) => {
    console.error(`${demo.artist}: ${error.message}`);
    return undefined;
  });
  if (plan) console.log(`${demo.artist}: ${plan.stops.length} cities warmed in ${Math.round(performance.now() - started)} ms`);
}
console.log(`${qlooCallCount()} Qloo calls, ${qlooCacheHits()} cached`);
await closeDb();
