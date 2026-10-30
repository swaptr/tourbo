// Manual-check helper (not part of the suite): walks the main flow by keyboard only on the BDD
// harness (fan-data double, throwaway DB) and prints every focus stop with whether its focus
// indicator is visible and unobscured. Usage:
//   BDD_DEV=1 BDD_PORT=3103 BDD_FAKE_PORT=3196 BDD_PG_PORT=5438 BDD_HMR_PORT=24696 \
//     node --conditions development tests/bdd/support/kbd-walk.ts
import type { Page } from "playwright-core";

import { browser as launch } from "../../stories/_browser.ts";
import { BASE, startHarness, stopHarness } from "./harness.ts";
import { seedPlan } from "./runs.ts";

type Stop = { tag: string; name: string; ring: boolean; obscured: boolean; inView: boolean; by?: string };

async function focusInfo(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 1) || (cs.boxShadow !== "none" && cs.boxShadow !== "") || cs.textDecorationLine.includes("underline");
    const r = el.getBoundingClientRect();
    const cx = r.left + Math.min(r.width / 2, 8), cy = r.top + Math.min(r.height / 2, 8);
    const hit = document.elementFromPoint(Math.max(0, cx), Math.max(0, cy));
    const obscured = !!hit && hit !== el && !el.contains(hit) && !hit.contains(el);
    const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.id || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const by = obscured && hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].slice(0, 5).join(".")}` : undefined;
    return { tag: `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[${el.getAttribute("role")}]` : ""}`, name, ring, obscured, inView, by };
  });
}

async function tabs(page: Page, label: string, n: number) {
  const seen: string[] = [];
  const bad: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const f = await focusInfo(page);
    if (!f) continue;
    const key = `${f.tag} "${f.name}"`;
    seen.push(key);
    if (!f.ring || f.obscured || !f.inView) bad.push(`${key}${f.ring ? "" : " NO-RING"}${f.obscured ? ` OBSCURED by ${f.by}` : ""}${f.inView ? "" : " OFFSCREEN"}`);
  }
  console.log(`\n## ${label}: ${new Set(seen).size} distinct stops in ${n} tabs`);
  for (const s of [...new Set(seen)].slice(0, 60)) console.log(`  ${s}`);
  if (bad.length) console.log(`  !! ${[...new Set(bad)].join("\n  !! ")}`);
  return seen;
}

const press = async (page: Page, key: string, note: string) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(250);
  const f = await focusInfo(page);
  console.log(`  [${key}] ${note} -> ${f ? `${f.tag} "${f.name}"${f.ring ? "" : " NO-RING"}` : "body"}  url=${new URL(page.url()).pathname}${new URL(page.url()).search}`);
};

await startHarness();
const b = await launch();
try {
  const tour = await seedPlan("musician", "Test Act 3");
  for (const width of [1440, 390]) {
    console.log(`\n================ ${width}px`);
    const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    // 1. Setup as a newcomer.
    await page.goto(`${BASE}/start`, { waitUntil: "networkidle" });
    await tabs(page, "setup /start", 25);
    // Pick a kind with the keyboard: focus the first radio and press Space, then continue.
    await page.getByRole("button", { name: "Musician" }).focus();
    await press(page, "Enter", "pick Musician");
    // Skip profile so we land in the workspace.
    await page.getByRole("button", { name: "Skip for now" }).focus({ timeout: 5000 }).catch(() => {});
    await press(page, "Enter", "skip for now");
    await page.waitForURL(/\/work/, { timeout: 90_000 });
    await page.getByTestId("section-nav").waitFor({ timeout: 90_000 });
    await page.waitForLoadState("networkidle");
    // 2. Workspace.
    await page.evaluate(([id, key, title]) => {
      const list = JSON.parse(localStorage.getItem("tourbo:work") ?? "[]");
      list.unshift({ id, kind: "plan", title, status: "done", ownerKey: key, updatedAt: new Date().toISOString() });
      localStorage.setItem("tourbo:work", JSON.stringify(list));
    }, [tour.id, tour.ownerKey, tour.title]);
    await page.reload({ waitUntil: "networkidle" });
    await tabs(page, "workspace /work", 30);
    // 3. New tour popover: "n" shortcut or the New button, then Esc.
    await page.getByTestId("new-menu").focus();
    await press(page, "Enter", "open New menu");
    await press(page, "ArrowDown", "menu item");
    await press(page, "Enter", "choose item");
    await page.waitForTimeout(400);
    await tabs(page, "new tour form", 12);
    await press(page, "Escape", "close new tour popover");
    await press(page, "Escape", "second Esc");
    // 4. Tour page.
    await page.goto(`${BASE}/plan/${tour.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await tabs(page, "tour page", 45);
    // Night list: focus night 2 and open it.
    const night = page.getByTestId("night").nth(1).locator("a").first();
    if (await night.count().catch(() => 0)) {
      await night.focus();
      await press(page, "Enter", "open night 2");
      await tabs(page, "night panel", 25);
    }
    // Tabs (tour-level tablist/nav): arrows.
    const tab = page.getByRole("tab").first();
    if (await tab.count()) {
      await tab.focus();
      await press(page, "ArrowRight", "tab →");
      await press(page, "End", "tab End");
      await press(page, "Home", "tab Home");
      await press(page, "Enter", "activate tab");
    }
    // Ask Tourbo.
    const ask = page.getByRole("button", { name: /Ask Tourbo about/ }).first();
    if (await ask.count()) {
      await ask.focus();
      await press(page, "Enter", "open Ask Tourbo");
      await tabs(page, "ask tourbo", 8);
      await press(page, "Escape", "close Ask Tourbo");
    }
    await press(page, "Escape", "Esc on tour page");
    // Trap check: 120 tabs on the tour page must reach the footer/browser chrome (focus leaves the page or wraps to the top).
    await page.goto(`${BASE}/plan/${tour.id}`, { waitUntil: "networkidle" });
    const all = await tabs(page, "trap check (tour page, 150 tabs)", 150);
    const tail = all.slice(-30);
    console.log(`  distinct in last 30 tabs: ${new Set(tail).size} (≤3 suggests a trap)`);
    await ctx.close();
  }
} finally {
  await b.close();
  await stopHarness();
}
