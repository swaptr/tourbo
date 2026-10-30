// "Your plan, your call": swap a night, tune a lever, ask Tourbo for a change (plan workspace).
import assert from "node:assert/strict";

import { Then, When } from "@cucumber/cucumber";

import type { TourboWorld } from "../support/world.ts";

const nights = (w: TourboWorld) => w.page.getByTestId("night");
const keys = (w: TourboWorld) => nights(w).evaluateAll((els) => els.map((e) => e.getAttribute("data-night") ?? ""));
async function tourProfit(w: TourboWorld) {
  // The tour header's one money figure ("~$29k profit"; the breakdown is in its popover).
  return (await w.page.getByTestId("tour-profit").getAttribute("data-value").catch(() => "")) ?? "";
}
// The tour workspace: click the night in the rail; its card opens in the night panel (Room tab).
async function openNight(w: TourboWorld, i: number) {
  await nights(w).nth(i).getByTestId("night-row").click();
  const panel = w.page.locator("aside").filter({ has: w.page.getByTestId("night-panel") });
  await panel.locator("[data-slot=card]").waitFor();
  return panel;
}

When("I change night {int} to another city Tourbo checked and confirm", async function (this: TourboWorld, n: number) {
  await this.page.waitForLoadState("networkidle");
  this.last = { keys: await keys(this), profit: await tourProfit(this) };
  const row = await openNight(this, n - 1);
  await row.getByTestId("change-city").click();
  const option = this.page.getByTestId("city-option").first();
  await option.waitFor();
  this.last.city = (await option.innerText()).split("\n")[0].trim();
  await option.click();
  // The confirm card renders twice (phone sheet / desktop panel); use the visible one.
  const confirm = this.page.locator("[data-testid=confirm-edit]:visible");
  await confirm.getByTestId("plan-diff").waitFor();
  await confirm.getByRole("button", { name: /^Swap$/ }).click();
  await confirm.waitFor({ state: "detached" });
  await this.page.getByTestId("edit-bar").waitFor();
});

Then("night {int} is in the new city", async function (this: TourboWorld, n: number) {
  const after = await keys(this);
  assert.notEqual(after[n - 1], this.last.keys[n - 1], "night didn't change");
  const text = await nights(this).nth(n - 1).innerText();
  assert.ok(text.includes(this.last.city), `night ${n} doesn't show ${this.last.city}: ${text.slice(0, 120)}`);
});

Then("the tour total changes to match the new night", async function (this: TourboWorld) {
  await this.page.waitForFunction((p) => document.querySelector("[data-testid=tour-profit]")?.getAttribute("data-value") !== p, this.last.profit, { timeout: 15_000 }).catch(() => {});
  const now = await tourProfit(this);
  assert.ok(now, "no tour total on the page");
  assert.notEqual(now, this.last.profit, `tour profit still ${now} after the swap`);
});

Then("the other nights stay as they were", async function (this: TourboWorld) {
  const after = await keys(this);
  const changed = after.map((k, i) => (k !== this.last.keys[i] ? i + 1 : 0)).filter(Boolean);
  assert.equal(changed.length, 1, `nights changed: ${changed.join(", ")}`);
});

When("I undo the change", async function (this: TourboWorld) {
  await this.page.getByTestId("edit-bar").getByRole("button", { name: "Undo" }).click();
  await this.page.getByTestId("edit-bar").waitFor({ state: "detached" });
});

Then("the plan is back to Tourbo's plan", async function (this: TourboWorld) {
  assert.deepEqual(await keys(this), this.last.keys);
  assert.equal(await tourProfit(this), this.last.profit);
});

// ---------- levers ----------
const tune = (w: TourboWorld) => w.page.getByRole("region", { name: "Tune the plan" });

// Tune is a popover from the tour header ("Tune"); bare levers inside (no own toggle).
async function openTune(w: TourboWorld) {
  if (await tune(w).isVisible()) return;
  await w.page.getByRole("button", { name: "Tune", exact: true }).first().click();
  await tune(w).waitFor();
}

When("I open {string} and set {string} to {string}", async function (this: TourboWorld, _tune: string, lever: string, value: string) {
  await this.page.waitForLoadState("networkidle");
  this.last = { profit: await tourProfit(this) };
  await openTune(this);
  const row = this.page.getByTestId(`lever-${lever.toLowerCase()}`);
  await row.waitFor();
  await row.getByRole("button", { name: value, exact: true }).or(row.getByRole("radio", { name: value, exact: true })).first().click();
});

Then("I see what it does to the plan inline", async function (this: TourboWorld) {
  const diff = tune(this).getByTestId("plan-diff");
  await diff.waitFor();
  assert.ok((await diff.innerText()).trim().length > 0, "empty diff");
});

When("I undo the lever", async function (this: TourboWorld) {
  await tune(this).getByRole("button", { name: "Undo" }).click();
});

Then("the plan is back to Tourbo's numbers", async function (this: TourboWorld) {
  await tune(this).getByTestId("plan-diff").waitFor({ state: "detached" });
  assert.equal(await tourProfit(this), this.last.profit);
});

// ---------- asking Tourbo (needs the AI) ----------
When("I ask Tourbo {string}", async function (this: TourboWorld, question: string) {
  await this.page.locator("#ask-tourbo").fill(question);
  await this.page.getByRole("button", { name: "Send" }).click();
});

Then("I see a proposal card with what changes", async function (this: TourboWorld) {
  const card = this.page.getByTestId("proposal-card").first();
  await card.waitFor({ timeout: 300_000 });
  assert.ok((await card.locator("li").count()) > 0, "the proposal lists no changes");
});

When("I apply it", async function (this: TourboWorld) {
  await this.page.getByTestId("proposal-apply").first().click();
});

Then("the proposal is applied to my plan", async function (this: TourboWorld) {
  await this.page.locator("[data-testid=proposal-card][data-proposal=applied]").first().waitFor({ timeout: 60_000 });
});

Then("a share-link visitor can't apply proposals", async function (this: TourboWorld) {
  const visitor = await this.context.browser()!.newContext();
  try {
    const page = await visitor.newPage();
    await page.goto(this.url(`/plan/${this.runId}`), { waitUntil: "networkidle" });
    assert.equal(await page.getByTestId("proposal-apply").count(), 0, "a visitor sees Apply");
  } finally {
    await visitor.close();
  }
});
