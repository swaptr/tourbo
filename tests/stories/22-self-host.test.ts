// Story 22: a developer self-hosts the published Tourbo MCP server (npx, own endpoint, Docker)
// with their own fan-data key. Uses the built bundle (npm run mcp:build). No LLM.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = new URL("../../", import.meta.url).pathname;
const pkgDir = `${root}packages/mcp/`;
const bin = `${pkgDir}dist/bin/tourbo-mcp.js`;

test("Self-host: build once", () => {
  execFileSync("npm", ["run", "mcp:build"], { cwd: root, stdio: "ignore" });
  assert.ok(existsSync(bin));
});

// A clean environment: no key, no database, nothing from the repo's .env.
const cleanEnv = (extra: Record<string, string> = {}) => ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...extra });

async function connect(env: Record<string, string>) {
  const client = new Client({ name: "story-self-host", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin], env, cwd: "/" }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args }, { timeout: 60_000 });
    const text = res.content?.[0]?.type === "text" ? res.content[0].text : "{}";
    return { isError: !!res.isError, value: JSON.parse(text) as { error?: string } & Record<string, unknown> };
  };
  return { client, call };
}

const oneSentence = (s: string | undefined) => {
  assert.ok(s, "has an error message");
  assert.doesNotMatch(s, /\n|at \w+ \(|Invalid environment|ZodError/, "plain sentence, no stack or schema dump");
  assert.ok(s.length < 200, "short");
};

test("Self-host: without a fan-data key the tools list and each call says what to set", async () => {
  const { client, call } = await connect(cleanEnv());
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const n of ["tourbo_resolve_act", "tourbo_score_cities", "tourbo_plan_tour", "qloo_recommend", "qloo_capabilities"]) assert.ok(names.includes(n), n);
  for (const [name, args] of [
    ["tourbo_resolve_act", { name: "Japanese Breakfast" }],
    ["qloo_recommend", { target_type: "brand", signals: ["Japanese Breakfast"], limit: 3 }],
  ] as const) {
    const r = await call(name, args);
    assert.ok(r.isError, `${name} is an error`);
    oneSentence(r.value.error);
    assert.match(r.value.error!, /QLOO_API_KEY/, name);
  }
  await client.close();
});

test("Self-host: without DATABASE_URL the project tools say projects need it", async () => {
  // A placeholder key: project tools never call fan data, so no real key is needed here.
  const { client, call } = await connect(cleanEnv({ QLOO_API_KEY: "placeholder-not-a-key" }));
  for (const [name, args] of [
    ["tourbo_project_list", {}],
    ["tourbo_project_create", { title: "Spring run" }],
    ["tourbo_export_markdown", { project_id: "00000000-0000-0000-0000-000000000000" }],
  ] as const) {
    const r = await call(name, args);
    assert.ok(r.isError, `${name} is an error`);
    oneSentence(r.value.error);
    assert.match(r.value.error!, /DATABASE_URL/, name);
  }
  // Resources answer the same way (a JSON-RPC error with the sentence).
  await assert.rejects(client.readResource({ uri: "tourbo://project/00000000-0000-0000-0000-000000000000" }), /DATABASE_URL/);
  // Tools that need neither still work, with output that validates (the client checks it).
  const ics = await call("tourbo_export_ics", { act: "Spring", stops: [{ date: "2027-03-01", city: "Chicago", timezone: "America/Chicago" }] });
  assert.ok(!ics.isError && /BEGIN:VCALENDAR/.test(String(ics.value.ics)));
  const bad = await call("tourbo_route", { region: "na", cities: ["Nowhereville Zzz"], start_date: "2027-03-01" });
  assert.ok(bad.isError);
  oneSentence(bad.value.error);
  await client.close();
});

// The listed surface (names, titles, annotations, schemas) as one comparable value.
async function surface(client: Client) {
  const { tools } = await client.listTools();
  return JSON.stringify(tools.map((t) => [t.name, t.title, t.annotations, t.inputSchema, t.outputSchema]).sort());
}

test("Self-host: stdio and --http --no-auth list the identical tools; localhost-only Host check", async () => {
  const { client } = await connect(cleanEnv());
  const viaStdio = await surface(client);
  await client.close();
  const child = spawn(process.execPath, [bin, "--http", "--no-auth", "--port", "0"], { env: cleanEnv(), stdio: ["ignore", "ignore", "pipe"] });
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
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
    const http = new Client({ name: "story-self-host-http", version: "0" });
    await http.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`)));
    assert.equal(await surface(http), viaStdio, "same tools over stdio and HTTP");
    await http.close();
    // DNS rebinding guard: a request addressed to another host name is refused.
    const { request } = await import("node:http");
    const status = await new Promise<number>((ok, fail) => {
      const req = request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { host: "evil.example", "content-type": "application/json", accept: "application/json, text/event-stream" } }, (res) => {
        res.resume();
        ok(res.statusCode ?? 0);
      });
      req.on("error", fail);
      req.end("{}");
    });
    assert.equal(status, 403);
  } finally {
    child.kill();
  }
});

test("Self-host: --version, --help and the npm package contents", () => {
  const pkg = JSON.parse(readFileSync(`${pkgDir}package.json`, "utf8"));
  assert.equal(execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" }).trim(), pkg.version);
  assert.match(execFileSync(process.execPath, [bin, "--help"], { encoding: "utf8" }), /--http[\s\S]*--no-auth/);
  assert.equal(pkg.engines.node, ">=22");
  // @tourbo/core is unpublished: it must be inlined, never a dependency (the others serve the in-repo source).
  assert.ok(!Object.keys(pkg.dependencies ?? {}).some((d) => d.startsWith("@tourbo/")), "no @tourbo/* runtime dependency");
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: pkgDir, encoding: "utf8" }));
  const files = packed.files.map((f: { path: string }) => f.path).sort();
  for (const f of files) assert.match(f, /^(dist\/|README\.md$|LICENSE$|package\.json$)/, f);
  for (const f of ["dist/bin/tourbo-mcp.js", "README.md", "LICENSE"]) assert.ok(files.includes(f), f);
  assert.ok(packed.size < 600_000, `pack size ${packed.size} under budget`);
  // Placeholders only in published docs.
  assert.doesNotMatch(readFileSync(`${pkgDir}README.md`, "utf8"), /[0-9a-f]{32}/i);
});

test("Self-host: Docker image serves /healthz and one tool call", { skip: process.env.STORY_DOCKER !== "1" && "set STORY_DOCKER=1" }, async () => {
  execFileSync("docker", ["compose", "--profile", "mcp", "build", "mcp"], { cwd: root, stdio: "ignore" });
  const token = `story-${process.pid}`;
  const port = 18787;
  const name = `tourbo-mcp-story-${process.pid}`;
  const args = ["run", "--rm", "-d", "--name", name, "-p", `127.0.0.1:${port}:8787`, "-e", `MCP_TOKENS=${token}`];
  if (process.env.QLOO_API_KEY) args.push("-e", "QLOO_API_KEY"); // passed by name, never on the command line
  execFileSync("docker", [...args, "tourbo-mcp:local"], { stdio: "ignore", env: process.env });
  try {
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      ok = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.ok).catch(() => false);
      if (!ok) await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(ok, "/healthz 200");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
    const client = new Client({ name: "story-docker", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const res = await client.callTool({ name: "tourbo_disciplines", arguments: {} });
    assert.ok(!res.isError || /QLOO_API_KEY/.test(JSON.stringify(res.content)));
    await client.close();
  } finally {
    spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
  }
});

test("Hosted: /mcp limits tool calls per token and per IP with a plain 429 sentence", async () => {
  const { startHttpServer } = await import("@tourbo/mcp/http.ts");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
  const server = await startHttpServer({ port: 0, host: "127.0.0.1", tokens: ["a", "b"], rateLimit: { calls: 2, windowMs: 60_000 } });
  const port = (server.address() as { port: number }).port;
  const url = new URL(`http://127.0.0.1:${port}/mcp`);
  const connectAs = async (token: string) => {
    const client = new Client({ name: "story-limit", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
  };
  try {
    const a = await connectAs("a");
    await a.callTool({ name: "tourbo_disciplines", arguments: {} });
    await a.callTool({ name: "tourbo_disciplines", arguments: {} });
    await assert.rejects(a.callTool({ name: "tourbo_disciplines", arguments: {} }), /429|Too many requests/);
    // Same IP, other token: the per-IP budget is spent too.
    const b = await connectAs("b");
    await assert.rejects(b.callTool({ name: "tourbo_disciplines", arguments: {} }), /429|Too many requests/);
    const raw = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer b", "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "tourbo_disciplines", arguments: {} } }),
    });
    assert.equal(raw.status, 429);
    assert.ok(raw.headers.get("retry-after"));
    assert.match((await raw.json()).error, /^Too many requests: wait \d+ minutes? and try again\.$/);
    await a.close();
    await b.close();
  } finally {
    server.close();
  }
});
