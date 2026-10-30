// Profile onboarding (/start, PLAN Q21) then the new-tour form (/new), driven by role and text
// like a user. A first-timer answers who they are once (kind, name, home base), then plans.
import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { kindOf, labelOf } from "../support/kinds.ts";
import type { TourboWorld } from "../support/world.ts";

Given("I start a new plan", async function (this: TourboWorld) {
  await this.open("/start");
  await this.page.evaluate(() => {
    sessionStorage.removeItem("tourbo:start");
    localStorage.removeItem("tourbo:profile");
  });
  await this.open("/start?next=tour");
  await this.page.getByRole("heading", { name: "What do you do?" }).waitFor();
});

When("I pick the kind {string}", async function (this: TourboWorld, key: string) {
  this.kind = kindOf(key);
  const tile = this.page.getByRole("button", { name: labelOf(this.kind), exact: true });
  if (!(await tile.isVisible())) await this.page.getByRole("button", { name: /More kinds/ }).click();
  await tile.click();
  await this.page.getByRole("button", { name: /^Continue/ }).click();
  await this.page.getByLabel("Name").waitFor();
});

When("I type my name {string}", async function (this: TourboWorld, name: string) {
  this.artist = name;
  await this.page.getByLabel("Name").fill(name);
});

Then("Tourbo says my name isn't listed yet", async function (this: TourboWorld) {
  await this.page.getByTestId("unlisted").waitFor();
});

Then("Tourbo finds me", async function (this: TourboWorld) {
  await this.page.getByRole("button", { name: "Not me" }).waitFor();
});

When("I plan from {string}", async function (this: TourboWorld, way: string) {
  await this.page.getByRole("radio", { name: new RegExp(way.replace("…", ".*")) }).click();
  if (/style/i.test(way)) {
    // First suggested style chip ("+ name").
    const chip = this.page.getByRole("button", { name: /^\+ / }).first();
    await chip.click();
    await this.page.getByRole("button", { name: /^Remove / }).first().waitFor();
  }
});

When("I continue", async function (this: TourboWorld) {
  const heading = this.page.getByRole("heading", { level: 1 });
  const before = await heading.innerText();
  await this.page.getByRole("button", { name: /^Continue/ }).click();
  await this.page.waitForFunction((b) => document.querySelector("h1")?.textContent !== b, before);
});

When("I start near {string} within {int} km", async function (this: TourboWorld, city: string, km: number) {
  // First time: the profile's last step asks for home base, then the tour form opens there.
  const home = this.page.getByLabel("Home base");
  if (await home.isVisible().catch(() => false)) {
    await home.fill(city);
    await this.page.getByRole("option", { name: new RegExp(`^${city}`) }).first().click();
    await this.page.getByRole("button", { name: /^Save and continue/ }).click();
    await this.page.getByRole("heading", { name: "Where do you want to play?" }).waitFor();
  }
  await this.page.getByLabel("Or start near").selectOption({ label: city });
  await this.page.getByLabel(/^Within/).fill(String(km));
  await this.page.getByText(/cities inside/).first().waitFor();
});

When("I set the first show to {string} and play {int} shows", async function (this: TourboWorld, date: string, shows: number) {
  await this.page.getByLabel("First show").fill(date);
  const count = this.page.locator("span.tabular-nums").first();
  for (let i = 0; i < 12; i++) {
    const now = Number(await count.textContent());
    if (now === shows) break;
    await this.page.getByRole("button", { name: now > shows ? "Fewer shows" : "More shows" }).click();
  }
  assert.equal(Number(await count.textContent()), shows);
});

When("I start planning", async function (this: TourboWorld) {
  await this.page.getByRole("button", { name: "Start planning" }).click();
  await this.page.waitForURL(/\/plan\/[0-9a-f-]{36}/);
});
