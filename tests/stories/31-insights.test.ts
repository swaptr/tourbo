// Story 31 (PLAN §18 Q17): the plan's Insights tab answers plain questions with charts. Uses an
// existing finished plan with money estimates from the DB; skips when the app or Chromium is down
// or no such plan exists. No fan-data calls (the page only reads the saved plan).
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { appUp, BASE } from "./_mcp.ts";
import { browser, chromiumPath } from "./_browser.ts";

after(() => closeDb().catch(() => {}));

const up = await appUp();
let runId: string | undefined;
if (up) {
  const sql = await db();
  const [row] = await sql<{ id: string }[]>`
    select id from runs where status = 'done' and jsonb_array_length(plan->'stops') >= 2
      and plan->'stops'->0->'money' is not null order by created_at desc limit 1`;
  runId = row?.id;
}
const skip = (!up && "app not running") || (!chromiumPath && "no Chromium found") || (!runId && "no finished plan with money in the DB");

const VENDOR = /qloo|claude|anthropic/i;

for (const width of [1440, 390]) {
  test(`insights at ${width}px: every chart has a question title and a takeaway, no console errors`, { skip, timeout: 120_000 }, async () => {
    const b = await browser();
    try {
      const page = await b.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(`${BASE}/plan/${runId}/insights`, { waitUntil: "load" });
      assert.equal(res?.status(), 200);
      // Streamed cards (emails, pace) replace their skeletons.
      await page.waitForFunction(() => !document.querySelector('[role="status"] h2'), undefined, { timeout: 30_000 });

      const cards = await page.$$eval('[data-testid^="chart"]', (els) =>
        els.map((el) => ({
          id: el.getAttribute("data-testid"),
          title: el.querySelector("h2")?.textContent?.trim() ?? "",
          takeaway: el.querySelector("[data-chart-takeaway]")?.textContent?.trim() ?? el.querySelector("p")?.textContent?.trim() ?? "",
        })),
      );
      const ids = cards.map((c) => c.id);
      for (const want of ["chart-map", "chart-fans", "chart-money", "chart-costs", "chart-drives"]) assert.ok(ids.includes(want), `${want} rendered (got ${ids.join(", ")})`);
      for (const c of cards) {
        assert.match(c.title, /\?$/, `${c.id}: title is a question`);
        assert.ok(c.takeaway.length > 10 && c.takeaway.length <= 200, `${c.id}: one-line takeaway (${c.takeaway})`);
      }
      assert.ok((await page.$$('[data-testid="fans-bars"] [data-bar]')).length >= 2, "fan bars drawn");
      assert.ok((await page.$$('[data-testid="money-bars"] [data-bar]')).length >= 2, "money bars drawn");

      // Keyboard focus on a bar shows the same tooltip as hover: value + label.
      // (Retried: the dev build may still be hydrating.)
      for (let i = 0; i < 30 && !(await page.$('[role="tooltip"]')); i++) {
        await page.locator("main h1").click();
        await page.focus('[data-testid="fans-bars"] [data-bar]');
        await page.waitForTimeout(500);
      }
      assert.match((await page.textContent('[role="tooltip"]')) ?? "", /\d/);

      // Numbers behind "why?".
      await page.click('[data-testid="chart-money"] [data-hint]');
      assert.match((await page.textContent("[data-hint-popup]")) ?? "", /Tour total/);

      const text = (await page.textContent("main")) ?? "";
      assert.doesNotMatch(text, VENDOR, "vendor-neutral");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `no sideways scroll at ${width}px (${overflow}px)`);
      assert.deepEqual(errors, []);
    } finally {
      await b.close();
    }
  });
}

test("insights: a plan without money shows plain empty states, not a broken page", { skip: (!up && "app not running") || (!chromiumPath && "no Chromium found"), timeout: 60_000 }, async (t) => {
  const sql = await db();
  const [row] = await sql<{ id: string }[]>`
    select id from runs where status = 'done' and jsonb_array_length(plan->'stops') >= 2 and plan->'stops'->0->'money' is null limit 1`;
  if (!row) return t.skip("no plan without money in the DB");
  const res = await fetch(`${BASE}/plan/${row.id}/insights`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Where are your fans strongest\?/);
  assert.match(html, /no money estimate/i);
});
