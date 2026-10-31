// Story 5: Dev uses Tourbo from Claude Code: `npm run mcp` (the stdio bin) starts, tools list.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = new URL("../../", import.meta.url).pathname;

test("Dev: the stdio server starts and exposes its tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--env-file-if-exists=.env", "packages/mcp/src/bin/stdio.ts"],
    cwd: root,
    env: { ...(process.env as Record<string, string>), QLOO_CACHE: "memory" },
  });
  const client = new Client({ name: "story-dev", version: "0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ["tourbo_resolve_act", "tourbo_score_cities", "tourbo_show_economics", "tourbo_assess_offer", "tourbo_plan_tour"]) assert.ok(names.includes(n), n);
  // Project tools write; everything else only reads.
  for (const n of ["tourbo_project_create", "tourbo_project_add", "tourbo_project_update"]) assert.equal(tools.find((t) => t.name === n)?.annotations?.readOnlyHint, false, n);
  for (const n of ["tourbo_project_get", "tourbo_project_list", "tourbo_disciplines", "tourbo_score_cities"]) assert.equal(tools.find((t) => t.name === n)?.annotations?.readOnlyHint, true, n);
  // Every tool: title, annotations (all three hints; destructive for writes) and an object outputSchema.
  for (const t of tools) {
    assert.ok(t.title, `${t.name} title`);
    for (const k of ["readOnlyHint", "idempotentHint", "openWorldHint"] as const) assert.equal(typeof t.annotations?.[k], "boolean", `${t.name} ${k}`);
    if (!t.annotations?.readOnlyHint) assert.equal(typeof t.annotations?.destructiveHint, "boolean", `${t.name} destructiveHint`);
    assert.equal(t.outputSchema?.type, "object", `${t.name} outputSchema`);
  }
  assert.equal(tools.find((t) => t.name === "tourbo_project_update")?.annotations?.destructiveHint, true, "delete is destructive");
  for (const n of ["tourbo_route", "tourbo_show_economics", "tourbo_export_ics", "tourbo_disciplines"]) assert.equal(tools.find((t) => t.name === n)?.annotations?.openWorldHint, false, `${n} stays local`);
  for (const n of ["tourbo_ideas", "tourbo_build_set", "tourbo_place_features", "tourbo_export_ics", "tourbo_export_markdown"]) assert.ok(names.includes(n), n);
  const { resources } = await client.listResources();
  assert.ok(resources.some((r) => r.uri === "tourbo://disciplines"));
  const templates = (await client.listResourceTemplates()).resourceTemplates.map((t) => t.uriTemplate);
  for (const u of ["tourbo://project/{id}", "tourbo://plan/{run_id}", "tourbo://city/{region}/{city}/brief"]) assert.ok(templates.includes(u), u);
  const { prompts } = await client.listPrompts();
  for (const n of ["plan_tour", "prep_city", "build_set", "ideas_for_city"]) assert.ok(prompts.some((p) => p.name === n), n);
  const kinds = await client.complete({ ref: { type: "ref/prompt", name: "plan_tour" }, argument: { name: "kind", value: "ma" } });
  assert.deepEqual(kinds.completion.values.sort(), ["magician", "maker"]);
  // A no-fan-data tool returns structuredContent that the client validated against its schema.
  const route = await client.callTool({ name: "tourbo_route", arguments: { region: "na", cities: ["Chicago", "Detroit"], start_date: "2027-03-01" } });
  assert.ok(!route.isError && (route.structuredContent as { stops: unknown[] }).stops.length === 2);
  await client.close();
});

// The published package: one bundled file (npm run mcp:build), stdio and --http.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const bin = `${root}packages/mcp/dist/bin/tourbo-mcp.js`;
const built = () => {
  if (!existsSync(bin)) execFileSync("npm", ["run", "mcp:build"], { cwd: root, stdio: "ignore" });
  return bin;
};
// One cheap fan-data call; a shared key can hit its rate limit, which must still read as a plain sentence.
async function resolveAct(client: Client) {
  const res = await client.callTool({ name: "tourbo_resolve_act", arguments: { name: "Japanese Breakfast" } }, { timeout: 120_000 });
  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  if (res.isError) assert.match(JSON.parse(text).error, /^[^\n]{5,300}$/, "error is one plain line");
  else assert.ok(JSON.parse(text).id, "resolved act has an id");
}

test("Dev: the built tourbo-mcp bin serves stdio", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [built()], env: { ...(process.env as Record<string, string>), QLOO_CACHE: "memory" } });
  const client = new Client({ name: "story-dev-bin", version: "0" });
  await client.connect(transport);
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const n of ["tourbo_resolve_act", "tourbo_plan_tour", "qloo_recommend", "qloo_capabilities"]) assert.ok(names.includes(n), n);
  await resolveAct(client);
  await client.close();
});

test("Dev: tourbo-mcp --http needs a bearer token", async () => {
  const token = `story-${process.pid}`;
  const child = spawn(process.execPath, [built(), "--http", "--port", "0"], { env: { ...process.env, MCP_TOKENS: token, QLOO_CACHE: "memory" }, stdio: ["ignore", "ignore", "pipe"] });
  try {
    const port = await new Promise<number>((ok, fail) => {
      let log = "";
      child.stderr.on("data", (d) => {
        log += d;
        const m = log.match(/ready on http:\/\/[^:]+:(\d+)\/mcp/);
        if (m) ok(Number(m[1]));
      });
      child.once("exit", () => fail(new Error(`server exited: ${log}`)));
    });
    const url = `http://127.0.0.1:${port}/mcp`;
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    const denied = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    assert.equal(denied.status, 401);
    assert.match((await denied.json()).error, /token/i);

    const client = new Client({ name: "story-dev-http", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(names.includes("tourbo_resolve_act"));
    await resolveAct(client);
    await client.close();
  } finally {
    child.kill();
  }
});

test("Dev: tourbo-mcp --http refuses to start without MCP_TOKENS", () => {
  const env = { ...process.env };
  delete env.MCP_TOKENS;
  let status = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [built(), "--http", "--port", "0"], { env, stdio: "pipe", timeout: 10_000 });
  } catch (error) {
    status = (error as { status: number }).status;
    stderr = String((error as { stderr: Buffer }).stderr);
  }
  assert.equal(status, 1);
  assert.match(stderr, /MCP_TOKENS/);
});
