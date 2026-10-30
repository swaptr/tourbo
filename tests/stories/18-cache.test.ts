// Story 18 (cache half): repeated fan-data lookups and tool calls come from the cache. Fully
// offline: fetch is stubbed, so no Qloo call can leave this process; Postgres checks skip when the
// DB is down.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

process.env.CACHE_TIERS = "memory";
process.env.QLOO_API_KEY ||= "offline-test";
let fetches = 0;
let reply: () => Response = () => Response.json({ results: { entities: [{ id: "x" }] } });
globalThis.fetch = (async () => {
  fetches++;
  return reply();
}) as typeof fetch;

const { cached, nsStats, snapshot, tierNames } = await import("../../packages/core/src/cache/index.ts");
const { memoryBackend } = await import("../../packages/core/src/cache/memory.ts");
const { fileBackend } = await import("../../packages/core/src/cache/file.ts");
const { qlooGet, qlooCacheHits } = await import("../../packages/core/src/qloo/client.server.ts");
const { CACHED_TOOLS, TOURBO_TOOLS, withCache } = await import("../../packages/mcp/src/tourbo/tools.ts");
const { closeDb, db } = await import("../../packages/core/src/db/client.server.ts");

const dir = await mkdtemp(join(tmpdir(), "tourbo-cache-test-"));
after(async () => {
  await rm(dir, { recursive: true, force: true });
  await closeDb();
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("cache: env picks the tiers", () => {
  assert.deepEqual(tierNames(), ["memory"]);
});

test("cache: the same fan-data request twice calls out once", async () => {
  fetches = 0;
  const hits = qlooCacheHits();
  const a = await qlooGet("/v2/insights", { "filter.type": "urn:entity:artist", q: "same" });
  const b = await qlooGet("/v2/insights", { q: "same", "filter.type": "urn:entity:artist" }); // param order doesn't matter
  assert.deepEqual(a, b);
  assert.equal(fetches, 1);
  assert.equal(qlooCacheHits(), hits + 1);
});

test("cache: null and rejected responses are not cached", async () => {
  reply = () => Response.json(null);
  fetches = 0;
  assert.equal(await qlooGet("/v2/insights", { q: "null" }), null);
  assert.equal(await qlooGet("/v2/insights", { q: "null" }), null);
  assert.equal(fetches, 2);

  reply = () => Response.json({ error: { message: "bad request" } }, { status: 400 });
  fetches = 0;
  await assert.rejects(qlooGet("/v2/insights", { q: "rejected" }), /Qloo 400/);
  await assert.rejects(qlooGet("/v2/insights", { q: "rejected" }), /Qloo 400/);
  assert.equal(fetches, 2);
  reply = () => Response.json({ results: { entities: [] } });

  let calls = 0;
  const fn = async () => (calls++, undefined);
  await cached("k", fn, { ns: "t:null", ttl: 60_000 });
  await cached("k", fn, { ns: "t:null", ttl: 60_000 });
  assert.equal(calls, 2);
});

test("cache: a repeated read-only tool call is a cache hit", async () => {
  assert.deepEqual([...CACHED_TOOLS].filter((n) => !TOURBO_TOOLS.some((t) => t.name === n)), [], "every cached tool exists");
  let runs = 0;
  const tool = withCache({ name: "fake_score", title: "", description: "", input: undefined as never, run: async (i: { city: string }) => ({ city: i.city, n: ++runs }) });
  const first = await tool.run({ city: "Austin", shows: 4 }, () => {});
  const second = await tool.run({ shows: 4, city: "Austin" }, () => {});
  assert.deepEqual(second, first);
  assert.equal(runs, 1);
  assert.equal(nsStats("tool:fake_score").hit, 1);
  await tool.run({ city: "Dallas", shows: 4 }, () => {});
  assert.equal(runs, 2, "different input, different entry");
});

test("cache: one in-flight load per key", async () => {
  let calls = 0;
  const fn = async () => (calls++, await wait(20), "v");
  const opts = { ns: "t:coalesce", ttl: 60_000 };
  assert.deepEqual(await Promise.all([cached("k", fn, opts), cached("k", fn, opts), cached("k", fn, opts)]), ["v", "v", "v"]);
  assert.equal(calls, 1);
  assert.equal(nsStats("t:coalesce").coalesced, 2);
});

test("cache: stale-while-revalidate serves stale, then the refreshed value", async () => {
  let version = 1;
  const fn = async () => `v${version}`;
  const opts = { ns: "t:swr", ttl: 30, swr: 60_000 };
  assert.equal(await cached("k", fn, opts), "v1");
  await wait(50);
  version = 2;
  assert.equal(await cached("k", fn, opts), "v1", "stale value served immediately");
  assert.equal(nsStats("t:swr").stale, 1);
  await wait(10);
  assert.equal(await cached("k", fn, { ...opts, ttl: 60_000 }), "v2", "background refresh landed");

  // Past ttl + swr it's a plain miss.
  version = 3;
  assert.equal(await cached("hard", fn, { ns: "t:swr", ttl: 10, swr: 10 }), "v3");
  await wait(40);
  version = 4;
  assert.equal(await cached("hard", fn, { ns: "t:swr", ttl: 10, swr: 10 }), "v4");
});

test("cache: tiers are read in order and backfilled; read-only files are never written", async () => {
  const a = memoryBackend();
  const file = fileBackend(join(dir, "rw"));
  const b = memoryBackend();
  const tiers = [a, file, b];
  const entry = { value: "from-b", at: Date.now() };
  await b.set("t:order", "k", entry);
  assert.equal(await cached("k", async () => "fetched", { ns: "t:order", ttl: 60_000, tiers }), "from-b");
  await wait(10);
  assert.equal((await a.get("t:order", "k"))?.value, "from-b", "memory backfilled");
  assert.equal((await file.get("t:order", "k"))?.value, "from-b", "file backfilled");

  await a.set("t:order", "k", { value: "from-a", at: Date.now() });
  assert.equal(await cached("k", async () => "fetched", { ns: "t:order", ttl: 60_000, tiers }), "from-a", "first tier wins");

  const ro = fileBackend(join(dir, "ro"), true);
  await cached("k", async () => "fetched", { ns: "t:order", ttl: 60_000, tiers: [ro] });
  await assert.rejects(readdir(join(dir, "ro")), "read-only file tier wrote nothing");

  await snapshot.put("home", { n: 1 }, { tiers: [a, file], tags: ["examples"] });
  assert.deepEqual(await snapshot.get("home", [memoryBackend(), file]), { n: 1 });
  await file.deleteByTag("examples");
  assert.equal(await snapshot.get("home", [file]), undefined);
});

test("cache: switching CACHE_TIERS via env needs no code change", async () => {
  const script = `
    const { cached, tierNames } = await import(${JSON.stringify(new URL("../../packages/core/src/cache/index.ts", import.meta.url).href)});
    if (process.env.WRITE) await cached("k", async () => ({ ok: true }), { ns: "t:env", ttl: 60000 });
    console.log(JSON.stringify(tierNames()));`;
  const run = (env: Record<string, string>) =>
    JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { PATH: process.env.PATH ?? "", QLOO_API_KEY: "offline-test", ...env }, encoding: "utf8" }).trim());
  const cacheDir = join(dir, "env");
  assert.deepEqual(run({ CACHE_TIERS: "memory,file", CACHE_DIR: cacheDir, CACHE_FILE_READONLY: "false", WRITE: "1" }), ["memory", "file"]);
  assert.equal((await readdir(join(cacheDir, "t_env"))).length, 1, "file tier written");
  assert.deepEqual(run({ QLOO_CACHE: "memory" }), ["memory"]);
  assert.deepEqual(run({ QLOO_CACHE: "postgres", CACHE_TIERS: "" }), ["memory", "postgres"]);
  // User, 2026-10-30: in production only the landing page is pre-baked; the live app and MCP
  // always call fan data fresh.
  assert.deepEqual(run({ NODE_ENV: "production" }), [], "production: no cache by default");
  assert.deepEqual(run({ CACHE_TIERS: "none" }), []);
});

const dbUp = await db().then(() => true, () => false);
test("cache: postgres tier round-trips, deletes by tag, and reads legacy Qloo rows", { skip: !dbUp && "Postgres not running" }, async () => {
  const { postgresBackend } = await import("../../packages/core/src/cache/postgres.ts");
  const pg = postgresBackend();
  const key = `story18-${process.pid}-${Date.now()}`;
  await pg.set("t:pg", key, { value: { a: 1 }, at: Date.now(), expiresAt: Date.now() + 60_000, tags: ["story18"] });
  assert.deepEqual((await pg.get("t:pg", key))?.value, { a: 1 });
  await pg.deleteByTag("story18");
  assert.equal(await pg.get("t:pg", key), undefined);

  const sql = await db();
  await sql`insert into qloo_cache (key, url, response) values (${key}, '/story18', ${sql.json({ legacy: true })})`;
  try {
    assert.deepEqual((await pg.get("qloo", key))?.value, { legacy: true }, "old qloo_cache rows still hit");
    await pg.set("qloo", key, { value: { fresh: true }, at: Date.now() });
    assert.deepEqual((await pg.get("qloo", key))?.value, { fresh: true }, "newer row wins");
  } finally {
    await pg.delete("qloo", key);
  }
  assert.equal((await sql`select 1 from qloo_cache where key = ${key}`).length, 0);
  assert.equal(pg.down(), false);
});
