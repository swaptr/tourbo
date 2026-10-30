// Screens in general: navigation, copy rules, layout at phone width, console, plain errors.
import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { fanData } from "../support/harness.ts";
import { seedInterrupted } from "../support/runs.ts";
import type { TourboWorld } from "../support/world.ts";

const VENDOR = /\b(qloo|claude|anthropic)\b/i;

Given("I am on a {int} px wide screen", async function (this: TourboWorld, width: number) {
  await this.page.setViewportSize({ width, height: 844 });
});

When("I open {string}", async function (this: TourboWorld, path: string) {
  await this.open(path);
});

When("I follow {string}", async function (this: TourboWorld, name: string) {
  // Links styled as buttons (Button render={<Link/>}) may expose role="button".
  await this.page.locator("a").filter({ hasText: name, visible: true }).first().click();
  await this.page.waitForLoadState("networkidle");
});

When("I press {string}", async function (this: TourboWorld, name: string) {
  await this.page.getByRole("button", { name }).first().click();
});

Then("I see {string}", async function (this: TourboWorld, text: string) {
  await this.page.getByText(text, { exact: false }).first().waitFor();
});

Then("I see a {string} button", async function (this: TourboWorld, name: string) {
  await this.page.getByRole("button", { name, exact: true }).first().waitFor();
});

Then("I can't continue", async function (this: TourboWorld) {
  assert.equal(await this.page.getByRole("button", { name: /^Continue/ }).isDisabled(), true);
});

Then("the page never names the data or AI vendor", async function (this: TourboWorld) {
  await this.page.waitForLoadState("networkidle");
  const text = await this.page.locator("body").innerText();
  const hit = text.match(new RegExp(`.{0,60}${VENDOR.source}.{0,60}`, "i"));
  assert.equal(hit, null, `vendor named on ${this.page.url()}: "${hit?.[0]}"`);
  const title = await this.page.title();
  assert.doesNotMatch(title, VENDOR, `vendor in the title: ${title}`);
});

Then("the page names the data and AI vendors", async function (this: TourboWorld) {
  const text = await this.page.locator("body").innerText();
  assert.match(text, /\bQloo\b/);
  assert.match(text, /\bClaude\b/);
});

const ASSISTANTS = ["Claude Desktop", "Claude Code", "Cursor", "VS Code", "ChatGPT", "Windsurf", "Zed", "Cline", "Goose", "Gemini"];
Then("it lists at least {int} AI assistants", async function (this: TourboWorld, n: number) {
  const text = await this.page.locator("body").innerText();
  const found = ASSISTANTS.filter((a) => text.includes(a));
  assert.ok(found.length >= n, `assistants named on /connect: ${found.join(", ") || "none"}`);
});

Then("there are no console errors", async function (this: TourboWorld) {
  await this.page.waitForLoadState("networkidle");
  await this.page.waitForTimeout(500);
  assert.deepEqual(this.consoleErrors, [], `console errors on ${this.page.url()}`);
});

// Opens every "?" / "why?" hint on the page (data-hint) and checks its popup (data-hint-popup)
// fits inside the viewport.
Then("every hint popover stays inside the screen", async function (this: TourboWorld) {
  const { width, height } = this.page.viewportSize()!;
  const triggers = this.page.locator("[data-hint]");
  const n = await triggers.count();
  assert.ok(n > 0, "no hints on this page");
  let checked = 0;
  for (let i = 0; i < n; i++) {
    const t = triggers.nth(i);
    if (!(await t.isVisible())) continue;
    await t.scrollIntoViewIfNeeded();
    await t.click();
    const popup = this.page.locator("[data-hint-popup]").last();
    await popup.waitFor();
    await this.page.waitForTimeout(150); // open animation
    const box = (await popup.boundingBox())!;
    const label = (await t.getAttribute("aria-label")) ?? (await t.innerText());
    assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `hint "${label}" spills sideways: x ${Math.round(box.x)}–${Math.round(box.x + box.width)} of ${width}`);
    assert.ok(box.y >= 0 && box.y + box.height <= height + 0.5, `hint "${label}" spills off the bottom/top: y ${Math.round(box.y)}–${Math.round(box.y + box.height)} of ${height}`);
    await this.page.keyboard.press("Escape");
    await popup.waitFor({ state: "detached" }).catch(() => {});
    checked++;
  }
  assert.ok(checked > 0, "no visible hints to check");
});

Then("nothing is wider than the screen", async function (this: TourboWorld) {
  const over = await this.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `the page scrolls sideways by ${over} px`);
});

Then("I can step to the next example", async function (this: TourboWorld) {
  const card = this.page.getByRole("region", { name: "Tour example" });
  await card.waitFor();
  const before = await card.textContent();
  await this.page.getByRole("button", { name: "Next example" }).click();
  await this.page.waitForFunction((b) => document.querySelector('[aria-label="Tour example"]')?.textContent !== b, before, { timeout: 15_000 });
});

// ---------- things going wrong ----------
Given("the fan data is rate-limited", function () {
  fanData().fail(429);
});
When("the fan data is back", function () {
  fanData().reset();
});

// One or two short sentences, says what to do, no vendor, no stack trace.
const PLAIN = /again|retry|later|moment|minute|set up|add |pick |check /i;
Then("I see a plain message that says what to do next", async function (this: TourboWorld) {
  const candidates = this.page.locator("[role=alert], .text-destructive").filter({ hasText: PLAIN });
  await candidates.first().waitFor({ timeout: 120_000 });
  const text = (await candidates.first().innerText()).replace(/\s*(Try again|Retry)\s*$/, "").trim();
  assert.ok(text.length <= 200, `message too long (${text.length}): ${text}`);
  assert.ok((text.match(/[.!?](\s|$)/g) ?? []).length <= 2, `more than two sentences: ${text}`);
  assert.doesNotMatch(text, VENDOR, `names a vendor: ${text}`);
  assert.doesNotMatch(text, /\bat \S+ \(|Error:|stack|undefined|\{|\}/, `looks technical: ${text}`);
});

Then("I can retry", async function (this: TourboWorld) {
  await this.page.getByRole("button", { name: /^(Try again|Retry)$/ }).first().waitFor();
});
When("I retry", async function (this: TourboWorld) {
  await this.page.getByRole("button", { name: /^(Try again|Retry)$/ }).first().click();
});

Then("I can choose {string}, {string} or {string}", async function (this: TourboWorld, a: string, b: string, c: string) {
  for (const name of [a, b, c]) await this.page.getByRole("radio", { name: new RegExp(name.replace("…", ".*")) }).waitFor();
});

Given("a plan that was cut off by a server restart", async function (this: TourboWorld) {
  const seeded = await seedInterrupted(this.kind);
  this.runId = seeded.id;
  this.artist = "Test Act 3";
  await this.remember(seeded.id, seeded.ownerKey, seeded.title);
});

When("I open my plan", async function (this: TourboWorld) {
  await this.open(`/plan/${this.runId}`);
});

When("I ask Tourbo to write my angles", async function (this: TourboWorld) {
  await this.page.getByRole("button", { name: "Write promo lines" }).click();
});

When("I ask Tourbo to write show notes", async function (this: TourboWorld) {
  await this.page.getByRole("button", { name: "Write show notes" }).first().click();
});

Then("the show notes appear with an opening line", async function (this: TourboWorld) {
  await this.page.getByRole("button", { name: "Rewrite" }).first().waitFor({ timeout: 300_000 });
});
