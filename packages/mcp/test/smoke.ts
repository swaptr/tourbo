// Stdio smoke test: spawns the server like Claude Desktop would.
// Always (no fan data needed): every tool has a title, annotations and an outputSchema; the
// no-fan-data tools return structured results that validate against their schema; error paths
// are one plain sentence. SMOKE_LIVE=1 (needs QLOO_API_KEY + quota) also calls fan-data tools.
// Usage: npm run test -w @tourbo/mcp
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { cloneDoneRun, deleteRun } from "@tourbo/core/runs/clone.server.ts";

const live = process.env.SMOKE_LIVE === "1";
const env = { ...(process.env as Record<string, string>), QLOO_CACHE: "memory" };
if (!live) env.QLOO_API_KEY = env.QLOO_API_KEY || "placeholder-not-a-key"; // local tools only; no fan-data call is made
const transport = new StdioClientTransport({ command: process.execPath, args: [new URL("../src/bin/stdio.ts", import.meta.url).pathname], env, stderr: "inherit" });
const client = new Client({ name: "tourbo-smoke", version: "0.1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`${tools.length} tools:`, tools.map((t) => t.name).join(", "));
const schemas = new Map<string, ReturnType<typeof fromJsonSchema>>();
for (const t of tools) {
  assert.ok(t.title, `${t.name} has a title`);
  assert.ok(t.description && t.description.length > 20, `${t.name} has a description`);
  const a = t.annotations;
  assert.ok(a, `${t.name} has annotations`);
  for (const k of ["readOnlyHint", "idempotentHint", "openWorldHint"] as const) assert.equal(typeof a[k], "boolean", `${t.name} ${k}`);
  if (a.readOnlyHint === false) assert.equal(typeof a.destructiveHint, "boolean", `${t.name} destructiveHint`);
  assert.equal(t.outputSchema?.type, "object", `${t.name} has an object outputSchema`);
  schemas.set(t.name, fromJsonSchema(t.outputSchema as never));
}
const hint = (n: string) => tools.find((t) => t.name === n)!.annotations!;
assert.equal(hint("tourbo_project_update").destructiveHint, true);
assert.equal(hint("tourbo_project_create").destructiveHint, false);
assert.equal(hint("tourbo_route").openWorldHint, false);
assert.equal(hint("tourbo_plan_edit").destructiveHint, true);
assert.equal(hint("tourbo_plan_edit").openWorldHint, false);
assert.equal(hint("tourbo_score_cities").openWorldHint, true);

const validate = async (name: string, value: unknown) => {
  const r = await schemas.get(name)!["~standard"].validate(value);
  assert.ok(!("issues" in r && r.issues), `${name} output validates: ${JSON.stringify("issues" in r ? r.issues : "")}`);
};
const call = async (name: string, args: Record<string, unknown>, opts: { error?: boolean } = {}) => {
  let events = 0;
  const res = await client.callTool({ name, arguments: args }, { onprogress: () => void events++, timeout: 120_000 });
  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  console.log(`${name} ${res.isError ? "ERROR" : "ok"} (${events} progress): ${text.slice(0, 160)}`);
  if (opts.error) {
    assert.ok(res.isError, `${name} is an error`);
    const msg = JSON.parse(text).error as string;
    assert.match(msg, /^[^\n]{10,240}$/, `${name}: one plain line`);
    assert.doesNotMatch(msg, /ZodError|at \w+ \(|Invalid environment/, name);
    return msg;
  }
  assert.ok(!res.isError, `${name} succeeded: ${text}`);
  assert.ok(res.structuredContent, `${name} has structuredContent`);
  await validate(name, res.structuredContent);
  return res.structuredContent as any;
};

// No fan data: deterministic tools.
await call("tourbo_disciplines", {});
await call("qloo_capabilities", {});
const route = await call("tourbo_route", { region: "na", cities: ["Chicago", "Milwaukee", "Detroit"], start_date: "2027-03-01" });
const eco = await call("tourbo_show_economics", { region: "na", city: "Chicago", fan_index: 40, median_fan_index: 30, rooms: [{ name: "Thalia Hall", capacity: 800 }], travel_km: 150 });
await call("tourbo_assess_offer", { region: "na", draw: eco.demand.draw, capacity: 800, price: eco.best.scenario.price, costs: eco.best.costs, planned_profit: eco.best.profit, offer: { deal: "guarantee", guarantee: 500 } });
await call("tourbo_ticket_pace", { expected_tickets: 300, capacity: 400, sold: 80, days_to_show: 20 });
await call("tourbo_promo_plan", { budget: 1000, stops: [{ city: "Chicago", capacity: 400, tickets: 100, relDemand: 1.2 }, { city: "Detroit", capacity: 300, tickets: 200, relDemand: 0.8 }] });
const ics = await call("tourbo_export_ics", { act: "Smoke Act", stops: route.stops.map((s: { date: string; city: string }) => ({ date: s.date, city: s.city })) });
assert.match(ics.ics, /^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
assert.equal(ics.events, 3);

// Error paths: one plain sentence each.
await call("tourbo_route", { region: "na", cities: ["Nowhereville Zzz"], start_date: "2027-03-01" }, { error: true });
await call("tourbo_build_set", { text: "", cities: ["Chicago"] }, { error: true });
await call("tourbo_export_markdown", {}, { error: true });
await call("tourbo_export_ics", { stops: [{ date: "2027-03-01", city: "Chicago", timezone: "Mars/Olympus" }] }, { error: true });
await call("tourbo_critique_plan", { plan: { nope: true } }, { error: true });
await call("tourbo_plan_edit", { run_id: "not-a-uuid" }, { error: true });
await call("tourbo_plan_edit", { run_id: "00000000-0000-0000-0000-000000000000" }, { error: true });

// tourbo_plan_edit on a copy of a finished run in the local DB (skipped when there is none).
const copy = await cloneDoneRun("mcp smoke act").catch((e: Error) => (console.log(`plan_edit skipped: ${e.message}`), undefined));
if (copy) {
  try {
    const view = await call("tourbo_plan_edit", { run_id: copy.id, candidates: true });
    assert.equal(view.version, 0);
    assert.ok(view.candidates.length > 0, "candidates from the run");
    const night = view.nights.find((n: { verdict: string | null }) => n.verdict !== "skip") ?? view.nights[0];
    const drop = await call("tourbo_plan_edit", { run_id: copy.id, edits: [{ op: "dropNight", night: night.key }], version: view.version });
    assert.equal(drop.version, 1);
    assert.equal(drop.edits, 1);
    assert.ok(drop.nights.find((n: { key: string }) => n.key === night.key).dropped, "night dropped");
    assert.ok(drop.change.removed.includes(night.key));
    const stale = await call("tourbo_plan_edit", { run_id: copy.id, action: "reset", version: 0 }, { error: true });
    assert.match(stale, /changed since that version/);
    await call("tourbo_plan_edit", { run_id: copy.id, edits: [{ op: "swapVenue", night: night.key, venueId: "no-such-room" }] }, { error: true });
    const undo = await call("tourbo_plan_edit", { run_id: copy.id, action: "undo" });
    assert.equal(undo.edits, 0);
    assert.equal(undo.money?.profit, view.money?.profit, "undo restores the money");
    await call("tourbo_plan_edit", { run_id: copy.id, action: "undo" }, { error: true });
  } finally {
    await deleteRun(copy.id);
  }
}

if (live) {
  const act = await call("tourbo_resolve_act", { name: "Japanese Breakfast" });
  const scores = await call("tourbo_score_cities", { act_id: act.id, region: "na", shows: 4 });
  assert.ok(scores.cities.filter((c: { hotspots?: unknown[] }) => c.hotspots).length <= scores.shortlist.length, "hotspots only for the shortlist by default");
  await call("tourbo_city_detail", { act_id: act.id, region: "na", city: scores.shortlist[0] });
  await call("qloo_recommend", { target_type: "brand", signals: ["Japanese Breakfast"], signal_location: "Chicago", limit: 5 });
  await call("qloo_find_tags", { query: "qawwali", limit: 3 });
  await call("tourbo_find_markets", { genres: ["qawwali"], regions: ["in"], limit: 5 });
  const set = await call("tourbo_build_set", { text: "Golden Hour, opener\nSlow River, slow\nNeon Nights, banger\nGoodbye Song, closer", cities: ["Chicago"], act_id: act.id, slot: "support" });
  assert.equal(set.cities[0].order.filter((e: { item?: number }) => e.item !== undefined).length, 4, "tourbo_build_set keeps every song");
  await call("tourbo_ideas", { cities: ["Chicago"], act_id: act.id });
}
await client.close();
await closeDb();
console.log("\nsmoke ok");
