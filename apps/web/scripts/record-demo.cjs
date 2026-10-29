// @ts-nocheck: optional dev tool; playwright is installed ad hoc (see SUBMISSION.md).
// Silent walkthrough footage of the demo flow (order follows the video script in SUBMISSION.md).
// Usage (playwright is not a project dependency):
//   npm i --no-save playwright && npx playwright install chromium-headless-shell
//   BASE=http://localhost:3000 node scripts/record-demo.cjs   # video lands in /tmp/tourbo-video
// Runs a real agent tour (~$0.02).
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3000";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: "/tmp/tourbo-video", size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  await page.goto(BASE);
  await pause(2500);
  await page.getByRole("button", { name: /Japanese Breakfast/ }).click();
  await pause(1500);
  await page.getByRole("button", { name: "Plan tour" }).click();
  await page.waitForURL(/\/plan\//);
  const planUrl = page.url();
  console.log("run", planUrl);
  await page.getByText("Plan ready").first().waitFor({ timeout: 240_000 });
  await pause(3000);
  await page.locator("section").nth(1).scrollIntoViewIfNeeded();
  await pause(4000);
  const card = page.locator("[data-slot=card]").first();
  await card.scrollIntoViewIfNeeded();
  await card.getByText("Local scene").click().catch(() => {});
  await pause(5000);
  await page.mouse.wheel(0, 900);
  await pause(4000);
  await page.getByRole("link", { name: "Qloo on vs off" }).click();
  await pause(6000);
  await page.mouse.wheel(0, 700);
  await pause(4000);
  await page.getByRole("link", { name: "Outreach" }).click();
  await pause(2000);
  await page.getByRole("button", { name: /Draft venue inquiries/ }).click();
  await page.getByRole("button", { name: /Approve & send all/ }).waitFor({ timeout: 120_000 });
  await pause(1500);
  await page.getByText("Review draft").first().click();
  await pause(5000);
  await page.getByRole("button", { name: /Approve & send all/ }).click();
  await page.getByText("Simulate reply:").first().waitFor({ timeout: 60_000 });
  await pause(2000);
  await page.getByRole("button", { name: "pass", exact: true }).first().click();
  await page.getByText("Passed").first().waitFor();
  await pause(1000);
  await page.waitForFunction(() => document.body.innerText.includes("Passed\n1"), null, { timeout: 60_000 }).catch(() => {});
  await pause(5000);
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await pause(3000);
  await page.locator("section").first().evaluate((el) => el.querySelector(".overflow-y-auto")?.scrollTo(0, 1e6));
  await pause(5000);
  await context.close();
  console.log("video", await page.video().path());
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
