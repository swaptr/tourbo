// Story 18 (static landing half of Q8): `/` is prerendered at build with the first example inline,
// served as a file with CDN-friendly headers, sets no cookie, and needs no database, fan-data or AI
// call. Runs its own production server (apps/web/build, `npm run build`) on a spare port with the
// database / fan-data / AI endpoints pointed at counting sinks (nothing shared is stopped). The
// header checks also run against the app at STORY_BASE_URL (the Docker app) when it's up.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import type { HomeExample } from "../../packages/core/src/examples/types.ts";
import { firstLoadAssets, hasBuild, startLandingServer, WEB_DIR, type LandingServer } from "../../apps/web/scripts/landing-server.ts";
import { appUp, BASE } from "./_mcp.ts";

const LANDING_HTML = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";
const IMMUTABLE = /public, max-age=31536000, immutable/;
const manifest = await readFile(`${WEB_DIR}/build/client/landing/manifest.json`, "utf8").then(JSON.parse).catch(() => undefined);
const noBuild = !hasBuild() && "no production build (npm run build)";
const noExamples = noBuild || (!manifest?.files.examples && "no landing examples in the build (npm run examples:export)");
// Only a production app (Docker or `npm start`) named by STORY_BASE_URL; the default dev server sets no cache policy.
const dockerUp = !!process.env.STORY_BASE_URL && (await appUp());

let srv: LandingServer;
before(async () => {
  if (!noBuild) srv = await startLandingServer(3118);
});
after(async () => srv?.stop());

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

test("landing: prerendered HTML has the hero and the first example (play order) inline", { skip: noExamples }, async () => {
  const [first]: HomeExample[] = JSON.parse(await readFile(`${WEB_DIR}/build/client/landing/${manifest.files.examples}`, "utf8"));
  const res = await fetch(`${srv.base}/`);
  assert.equal(res.status, 200);
  const page = text(await res.text());
  assert.match(page, /Your fans already picked your tour/);
  assert.match(page, /Plan a tour/);
  assert.ok(page.includes(first.act.name), `first act ${first.act.name} is in the HTML`);
  assert.ok(page.includes(text(first.decision.headline).trim()), `first headline "${first.decision.headline}" is in the HTML`);
  // It's the build-time file, byte for byte (no request-time render).
  const file = await readFile(`${WEB_DIR}/build/client/index.html`, "utf8");
  assert.equal(await fetch(`${srv.base}/`).then((r) => r.text()), file);
});

async function checkHeaders(base: string) {
  const home = await fetch(`${base}/`);
  assert.equal(home.headers.get("cache-control"), LANDING_HTML, "/ cache policy");
  assert.match(home.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(home.headers.get("set-cookie"), null, "/ sets no cookie");
  const html = await home.text();
  const data = await fetch(`${base}/_.data`);
  assert.equal(data.status, 200, "/_.data (client navigation to /) is prerendered too");
  assert.equal(data.headers.get("cache-control"), LANDING_HTML);
  assert.equal(data.headers.get("set-cookie"), null);
  await data.arrayBuffer();
  const assets = firstLoadAssets(html).filter((a) => a.startsWith("/assets/"));
  assert.ok(assets.length >= 3, `${assets.length} first-load assets`);
  for (const a of assets) {
    const r = await fetch(base + a);
    assert.equal(r.status, 200, a);
    assert.match(r.headers.get("cache-control") ?? "", IMMUTABLE, a);
    assert.equal(r.headers.get("set-cookie"), null, a);
    await r.arrayBuffer();
  }
  const m = await fetch(`${base}/landing/manifest.json`);
  if (m.status === 200) {
    const cc = m.headers.get("cache-control") ?? "";
    const age = Number(/max-age=(\d+)/.exec(cc)?.[1]);
    assert.ok(age > 0 && age <= 300 && !/immutable/.test(cc), `manifest short max-age (${cc})`);
    const files: string[] = Object.values((await m.json()).files).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v as Record<string, string>))).slice(0, 5);
    for (const f of files) {
      const r = await fetch(`${base}/landing/${f}`, { method: "HEAD" });
      assert.match(r.headers.get("cache-control") ?? "", IMMUTABLE, f);
    }
  }
}

test("landing: headers on /, hashed assets and the manifest match the cache policy; no cookie", { skip: noBuild }, async () => {
  await checkHeaders(srv.base);
});

test("landing: the app at STORY_BASE_URL (Docker) serves the same policy", { skip: noBuild || (!dockerUp && "app not running") }, async () => {
  await checkHeaders(BASE);
});

test("landing: / renders with the database down and no keys, and calls no database, fan data or AI", { skip: noBuild }, async () => {
  const before = srv.calls();
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${srv.base}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /info-panel/);
    await fetch(`${srv.base}/_.data`).then((r) => r.arrayBuffer());
  }
  assert.deepEqual(srv.calls(), before, "no connection to the database, fan-data or AI endpoints");
  assert.deepEqual(before, { db: 0, fanData: 0, ai: 0 }, "nothing touched them at startup either");
});
