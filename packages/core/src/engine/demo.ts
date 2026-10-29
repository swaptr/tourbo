// Usage: npm run plan:demo -- "<artist>" [region] [shows] [musician|comedian] [peer,peer]
import { closeDb } from "../db/client.server.ts";
import { qlooCacheHits, qlooCallCount } from "../qloo/client.server.ts";
import { TourParams } from "../shared/types.ts";
import { buildPlan } from "./plan.ts";

const [artist = "Japanese Breakfast", region = "na", shows = "8", kind = "musician", peers = ""] = process.argv.slice(2);
const params = TourParams.parse({
  artist,
  kind,
  peers,
  region,
  shows,
  startDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
});

const started = performance.now();
const plan = await buildPlan(params, (kind, message) => {
  if (kind !== "qloo_call") console.error(`[${kind}] ${message}`);
});
console.log(JSON.stringify(plan, null, 2));
console.error(
  `\n${plan.stops.length} stops, ${plan.totalKm} km, ${Math.round(performance.now() - started)} ms, ` +
    `${qlooCallCount()} Qloo calls, ${qlooCacheHits()} cached`,
);
await closeDb();
