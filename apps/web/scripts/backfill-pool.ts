// One-off for runs made before PLAN Q19: saves each finished run's room candidates and openers into run_steps by replaying the run's own fan-data tool calls from the
// local cache only. The fan-data host is pointed at a dead address, so a cache miss fails instead
// of calling out (no quota used). New runs save their pool while they plan.
//   node --env-file-if-exists=../../.env scripts/backfill-pool.ts [runId…]
export {};
process.env.QLOO_BASE_URL = "http://127.0.0.1:9";

const { db } = await import("@tourbo/core/db/client.server.ts");
const { connectMcp } = await import("../server/mcp.server.ts");
const { getSteps, saveStep } = await import("../server/agent/runs.server.ts");

const sql = await db();
const only = process.argv.slice(2);
const runs = await sql<{ id: string }[]>`select id from runs where status = 'done' and plan is not null order by created_at desc`;
const mcp = await connectMcp(() => {}, ["tourbo"]);
let filled = 0;
for (const { id } of runs.filter((r) => !only.length || only.includes(r.id))) {
  if ((await getSteps(id, "pool")).size || (await getSteps(id, "pool_venues")).size) continue;
  // City scores stay from the run's own trace (a replay could score a different city list now that
  // the world cities are loaded); only room candidates and openers are replayed.
  const calls = await sql<{ payload: { message: string; data?: { input?: Record<string, unknown> } } }[]>`
    select payload from trace_events where run_id = ${id} and kind = 'tool_call' and payload->>'message' like 'mcp tourbo_%' order by seq`;
  const input = (tool: string) => calls.filter((c) => c.payload.message === `mcp ${tool}`).map((c) => c.payload.data?.input ?? {});
  const [openers] = input("tourbo_openers");
  if (openers) await mcp.call<{ openers: unknown }>("tourbo_openers", openers).then((r) => saveStep(id, "pool", "openers", { openers: r.openers })).catch(() => {});
  let rooms = 0;
  const seen = new Set<string>();
  for (const d of input("tourbo_city_detail")) {
    const city = String(d.city);
    if (seen.has(city)) continue;
    seen.add(city);
    await mcp
      .call<{ venues: unknown[] }>("tourbo_city_detail", d)
      .then((r) => saveStep(id, "pool_venues", city, r.venues).then(() => rooms++))
      .catch(() => {});
  }
  filled++;
  console.log(`${id}: pool saved (${rooms} cities with rooms)`);
}
await mcp.close().catch(() => {});
console.log(`${filled} run(s) backfilled`);
process.exit(0);
