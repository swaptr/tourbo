// Usage: npm run agent:demo -- "<artist>" [na|eu|in] [shows] [musician|comedian] [peer,peer] [promoBudget]
// Runs the full agent (orchestrator + per-city workers) and prints the trace live.
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { qlooCacheHits, qlooCallCount } from "@tourbo/core/qloo/client.server.ts";
import { TourParams } from "@tourbo/core/shared/types.ts";
import { orchestrate } from "./orchestrator.server.ts";
import { usageSummary } from "./usage.ts";

const [artist = "Japanese Breakfast", region = "na", shows = "6", kind = "musician", peers = "", promo = ""] = process.argv.slice(2);
const params = TourParams.parse({
  artist,
  kind,
  peers,
  money: promo ? { promoBudget: promo } : {},
  region,
  shows,
  startDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
});

const started = performance.now();
try {
  const plan = await orchestrate(params, (kind, message) => {
    if (kind !== "qloo_call" && kind !== "thinking_summary") console.error(`[${kind}] ${message.slice(0, 220)}`);
  });
  console.log(JSON.stringify(plan, null, 2));
} catch (error) {
  console.error(`FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  console.error(
    `${Math.round(performance.now() - started)} ms, ${qlooCallCount()} Qloo calls, ${qlooCacheHits()} cached`,
  );
  console.error(JSON.stringify(usageSummary()));
  await closeDb();
}
