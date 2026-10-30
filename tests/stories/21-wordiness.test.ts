// Story 21 (PLAN Q9): every screen says what to do in a few words. Server HTML of home, help, every
// wizard step, a plan, its show notes (and its set tab, once that route exists) must have:
//   - no visible <p> over 160 characters in primary UI (text inside a collapsed <details>, the "why?"
//     and "?" toggles, is secondary and not counted);
//   - exactly one primary button.
// Convention: the screen's one primary action carries the `data-primary` attribute (a filled
// button); every other action is outline/ghost or sits in the "More" menu.
// The wizard's first step is a grid of choice tiles (picking one is the action), so it has none.
// Needs the app running. The plan pages use STORY_RUN_ID, else the newest finished plan in the DB.
import assert from "node:assert/strict";
import { test } from "node:test";

import { appUp, BASE } from "./_mcp.ts";
import { browser, chromiumPath } from "./_browser.ts";
import { closeDb, db } from "../../packages/core/src/db/client.server.ts";

const up = await appUp();
const noApp = !up && "app not running";
const MAX = 160;

async function html(path: string) {
  const res = await fetch(`${BASE}${path}`);
  assert.equal(res.status, 200, `${path} status`);
  return res.text();
}
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// Primary UI: drop scripts, styles, comments and every <details> block (innermost first).
function primaryUi(page: string) {
  let s = page.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, "");
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/<details\b(?:(?!<details\b)[\s\S])*?<\/details>/gi, " ");
  }
  return s;
}
function longParagraphs(path: string, page: string) {
  return [...primaryUi(page).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > MAX)
    .map((t) => `${path}: (${t.length}) ${t.slice(0, 80)}…`);
}
const primaries = (page: string) => (primaryUi(page).match(/\sdata-primary(?:=""|="true")?[\s>]/g) ?? []).length;

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
const noRun = noApp || (!runId && "no plan found (set STORY_RUN_ID)");

async function check(paths: string[], noPrimary: string[] = []) {
  const long: string[] = [];
  const wrongCount: string[] = [];
  for (const path of paths) {
    const page = await html(path);
    long.push(...longParagraphs(path, page));
    const n = primaries(page);
    if (n !== (noPrimary.includes(path) ? 0 : 1)) wrongCount.push(`${path}: ${n} primary buttons`);
  }
  assert.deepEqual(long, [], `paragraphs over ${MAX} characters`);
  assert.deepEqual(wrongCount, [], "exactly one data-primary button per screen");
}

test("wordiness: home and help are short, one primary action each", { skip: noApp }, async () => {
  await check(["/", "/help"]);
});

test("wordiness: /help has five cards, two lines and one button each, no vendor names", { skip: noApp }, async () => {
  const page = await html("/help");
  const cards = page.split('data-testid="help-card"').slice(1);
  assert.equal(cards.length, 5, "five help cards");
  for (const card of cards) {
    const body = card.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]+>/g, "") ?? "";
    assert.ok(body.length > 0 && body.length <= 120, `card text fits two lines: ${body}`);
    assert.ok(/<a\b[^>]*href="\/[^"]*"/.test(card), "card has a link button");
  }
  assert.match(page, /href="\/start\?step=1"/, "not-listed card deep-links into the wizard's who step");
  assert.match(page, /href="\/connect"/, "assistant card links /connect");
  const text = primaryUi(page).replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(text, /\b(Qloo|Claude|Anthropic|ChatGPT|Gemini|OpenAI)\b/i);
});

test("wordiness: every wizard step is short, one primary action each", { skip: noApp }, async () => {
  // Profile onboarding (PLAN Q21): three one-question steps, each with one Continue / Save.
  await check([0, 1, 2].map((n) => `/start?step=${n}`));
});

test("wordiness: plan, show notes and set pages are short, one primary action each", { skip: noRun }, async () => {
  // The primary action is for whoever can edit; a shared (owned) plan is read-only to this
  // keyless fetch and has none. Check the owner's view: an unowned copy, editable by anyone.
  const sql = await db();
  const [copy] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status, plan, baseline)
    select artist_name, params, status, plan, baseline from runs where id = ${runId!} and owner_hash is not null
    returning id`;
  const id = copy?.id ?? runId;
  try {
    const paths = [`/plan/${id}`, `/plan/${id}/prep`];
    if ((await fetch(`${BASE}/plan/${id}/set`)).status === 200) paths.push(`/plan/${id}/set`);
    await check(paths);
    // Someone else's shared plan: nothing to press.
    if (copy) for (const path of [`/plan/${runId}`, `/plan/${runId}/prep`]) assert.equal(primaries(await html(path)), 0, `${path} is read-only`);
  } finally {
    if (copy) await sql`delete from runs where id = ${copy.id}`;
    await closeDb().catch(() => {});
  }
});

test("wordiness: the plan page has a collapsed Adjust panel and a basis line", { skip: noRun }, async () => {
  const page = await html(`/plan/${runId}`);
  if (!/>done<\/span>/.test(page)) return; // the panel shows on finished plans only
  assert.match(page, /<details[^>]*data-testid="adjust-panel"(?![^>]*\sopen)/, "Adjust is collapsed");
  assert.match(page, /data-testid="basis-line">[^<]{10,}/, "basis line");
});

// Hints ("?" / "why?") open as popovers that never leave the viewport: open the left-most,
// right-most and lowest hint on each page at 390 and 1440 px and check the popup's box.
test("wordiness: hint popovers stay inside the viewport at 390 and 1440 px", { skip: noRun || (!chromiumPath && "no Chromium found"), timeout: 180_000 }, async () => {
  const b = await browser();
  const out: string[] = [];
  try {
    for (const width of [390, 1440]) {
      const page = await b.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } });
      for (const path of [`/plan/${runId}`, `/plan/${runId}/prep`, "/start"]) {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
        // Async lines (the tour's fan-data insight) settle first, so trigger indexes stay put.
        await page.locator('[aria-label="Reading fan data"]').first().waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
        await page.waitForLoadState("networkidle");
        const boxes = await page.locator("[data-hint]").evaluateAll((els) =>
          els.map((el, i) => {
            const r = el.getBoundingClientRect();
            return { i, x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width };
          }).filter((r) => r.w > 0),
        );
        if (!boxes.length) continue;
        const picks = new Set([
          boxes.reduce((a, r) => (r.x < a.x ? r : a)).i,
          boxes.reduce((a, r) => (r.x + r.w > a.x + a.w ? r : a)).i,
          boxes.reduce((a, r) => (r.y > a.y ? r : a)).i,
        ]);
        for (const i of picks) {
          const trigger = page.locator("[data-hint]").nth(i);
          await trigger.scrollIntoViewIfNeeded();
          // Keyboard opens it deterministically (no hover-intent timing); tap/click is the same toggle.
          await page.mouse.move(0, 0);
          await trigger.focus();
          await page.keyboard.press("Enter");
          const popup = page.locator("[data-hint-popup]").last();
          await popup.waitFor({ state: "visible", timeout: 5000 });
          await page.waitForTimeout(250); // open animation (zoom-in-95) settles
          const box = (await popup.boundingBox())!;
          const vp = page.viewportSize()!;
          if (box.x < 0 || box.y < 0 || box.x + box.width > vp.width + 0.5 || box.y + box.height > vp.height + 0.5)
            out.push(`${width}px ${path} hint #${i}: ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}`);
          await page.keyboard.press("Escape");
          await page.mouse.move(0, 0);
          await popup.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
        }
      }
      await page.close();
    }
  } finally {
    await b.close();
  }
  assert.deepEqual(out, [], "every hint popup fits the viewport");
});
