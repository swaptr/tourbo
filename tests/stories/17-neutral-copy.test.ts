// Story 17 (PLAN Q5): the product speaks as Tourbo. No vendor names in visible text outside
// /connect, and /connect treats every AI assistant equally. Needs the app running.
// The plan/prep pages use STORY_RUN_ID, else the newest finished plan in the DB; skipped if none.
import assert from "node:assert/strict";
import { test } from "node:test";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { appUp, BASE } from "./_mcp.ts";

const up = await appUp();
const noApp = !up && "app not running";
const VENDORS = /\b(Qloo|Claude|Anthropic)\b/gi;

// Visible text only: drop scripts, styles and tags (attributes go with them), decode basic entities.
function visibleText(html: string) {
  return html
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}
async function page(path: string) {
  const res = await fetch(`${BASE}${path}`);
  assert.equal(res.status, 200, `${path} status`);
  return res.text();
}
function vendorHits(path: string, html: string) {
  const text = visibleText(html);
  return [...text.matchAll(VENDORS)].map((m) => `${path}: …${text.slice(Math.max(0, m.index - 40), m.index + 40)}…`);
}

async function findRun(): Promise<string | undefined> {
  if (process.env.STORY_RUN_ID) return process.env.STORY_RUN_ID;
  // Projects are retired (PLAN Q21): the newest finished plan in the app's database (read-only).
  try {
    const sql = await db();
    const [row] = await sql<{ id: string }[]>`select id from runs where status = 'done' and plan is not null order by created_at desc limit 1`;
    return row?.id;
  } catch {
    return undefined;
  } finally {
    await closeDb().catch(() => {});
  }
}
const runId = up ? await findRun() : undefined;

test("neutral copy: home, profile, tour form and workspace never name the vendors", { skip: noApp }, async () => {
  const hits: string[] = [];
  for (const path of ["/", "/start", "/new", "/work", "/material"]) hits.push(...vendorHits(path, await page(path)));
  assert.deepEqual(hits, []);
});

test("neutral copy: wizard kind tiles are one plain word each", { skip: noApp }, async () => {
  const text = visibleText(await page("/start"));
  for (const word of ["Musician", "Comedian", "DJ", "Poet"]) assert.ok(text.includes(word), `/start shows ${word}`);
  for (const old of ["Singer / band", "spoken word", "DJ / producer", "Poet /"]) assert.ok(!text.includes(old), `/start no longer says "${old}"`);
});

test("neutral copy: plan and show-notes pages never name the vendors", { skip: noApp || (!runId && "no run found (set STORY_RUN_ID)") }, async () => {
  const hits: string[] = [];
  for (const path of [`/plan/${runId}`, `/plan/${runId}/prep`]) hits.push(...vendorHits(path, await page(path)));
  assert.deepEqual(hits, []);
});

test("neutral copy: /connect lists at least four AI assistants as equals", { skip: noApp }, async () => {
  const html = await page("/connect");
  const tabs = html.match(/role="tab"/g) ?? [];
  assert.ok(tabs.length >= 4, `${tabs.length} client tabs`);
  const clients = ["Claude", "ChatGPT", "Gemini", "Cursor", "VS Code"].filter((c) => html.includes(c));
  assert.ok(clients.length >= 4, `clients named: ${clients.join(", ")}`);
});
