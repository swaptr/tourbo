// Profile once, then the workspace (PLAN Q21): onboarding gates, multi-kind tours, shows with
// dates and a venue, auto-archive and URL filters. Tours are seeded with the deterministic stand-in
// (no AI); everything else goes through the screens like a user.
import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { kindOf, labelOf } from "../support/kinds.ts";
import { seedPlan } from "../support/runs.ts";
import type { TourboWorld } from "../support/world.ts";

type W = TourboWorld & { tours?: { past: string; soon: string } };

const CHICAGO = { name: "Chicago", lat: 41.88, lon: -87.63 };
const kindRadio = (w: W, name: string) => w.page.getByTestId("new-tour-form").getByRole("radiogroup", { name: "What sort of show is this?" }).getByRole("radio", { name, exact: true });

Given("I am new to Tourbo", async function (this: W) {
  await this.open("/help");
  await this.page.evaluate(() => {
    localStorage.removeItem("tourbo:profile");
    localStorage.removeItem("tourbo:work");
    sessionStorage.removeItem("tourbo:start");
  });
});

// A saved profile, as onboarding leaves it (server row + owner key in this browser).
Given(/^my profile says I do "([^"]+)" first(?: and "([^"]+)" too)?$/, async function (this: W, main: string, also?: string) {
  const kinds = [kindOf(main), ...(also ? [kindOf(also)] : [])];
  this.artist = "Nobody Q21";
  await this.open("/help");
  const ok = await this.page.evaluate(
    async ([fields]) => {
      const res = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
      const body = await res.json();
      if (!res.ok) return body.error ?? res.status;
      localStorage.setItem("tourbo:profile", JSON.stringify({ ...body.profile, ownerKey: body.ownerKey }));
      return true;
    },
    [{ name: this.artist, kinds, listed: false, basis: "city", peers: [], styles: [], home: CHICAGO }] as const,
  );
  assert.equal(ok, true, String(ok));
});

// The workspace is never walled: first-timers follow the quiet "Set up your act" link.
Then("I am asked who I am", async function (this: W) {
  await this.page.getByRole("link", { name: "Set up your act" }).click();
  await this.page.waitForURL(/\/start/);
  await this.page.getByRole("heading", { name: "What do you do?" }).waitFor();
});

When("I pick {string} as my home base and save", async function (this: W, city: string) {
  await this.page.getByLabel("Home base").fill(city);
  await this.page.getByRole("option", { name: new RegExp(`^${city}`) }).first().click();
  await this.page.getByRole("button", { name: /^Save/ }).click();
});

Then("I land on my work", async function (this: W) {
  await this.page.waitForURL(/\/work/);
  await this.page.getByTestId("section-nav").waitFor();
});

When("I plan a tour from my work", async function (this: W) {
  if (!/\/work/.test(this.page.url())) await this.open("/work");
  await this.page.getByTestId("new-menu").click();
  await this.page.getByRole("menuitem", { name: "Plan a tour" }).click();
});

// From the workspace it's a popover; straight after setup it's the full page (/new?type=tour).
Then("the tour form opens without asking who I am", async function (this: W) {
  await this.page.locator('[data-testid="new-tour-form"], h1:has-text("Where do you want to play?")').first().waitFor();
  assert.doesNotMatch(this.page.url(), /\/start/);
});

Then("I am asked only for my name and home base, with why", async function (this: W) {
  await this.page.waitForURL(/\/start\?next=tour/);
  await this.page.getByLabel("Name").waitFor();
  assert.equal(await this.page.locator('ol[aria-label="Progress"] > li').count(), 2, "name + home base only");
  assert.match(await this.page.getByTestId("why-asked").first().innerText(), /Tourbo needs/);
});

Then("the tour form offers {string}, {string} and {string}, {string} picked", async function (this: W, a: string, b: string, other: string, picked: string) {
  const radios = this.page.getByTestId("new-tour-form").getByRole("radiogroup", { name: "What sort of show is this?" }).getByRole("radio");
  await radios.first().waitFor();
  assert.deepEqual((await radios.allInnerTexts()).map((t) => t.trim()), [labelOf(kindOf(a)), labelOf(kindOf(b)), other]);
  assert.equal(await kindRadio(this, labelOf(kindOf(picked))).getAttribute("aria-checked"), "true");
});

When("I pick {string} for this tour", async function (this: W, kind: string) {
  await kindRadio(this, labelOf(kindOf(kind))).click();
});

Then("this tour is a {string} tour", async function (this: W, kind: string) {
  assert.equal(await kindRadio(this, labelOf(kindOf(kind))).getAttribute("aria-checked"), "true");
  // The other kind is no longer picked: one kind per tour.
  const others = this.page.getByTestId("new-tour-form").getByRole("radiogroup", { name: "What sort of show is this?" }).locator('[aria-checked="true"]');
  assert.equal(await others.count(), 1);
});

When("I add a show in {string} from {string} to {string} at my own venue {string}", async function (this: W, city: string, start: string, end: string, venue: string) {
  // Pre-filled with the home base; pick from the town list only when it differs.
  if ((await this.page.getByLabel("City").inputValue()) !== city) {
    await this.page.getByLabel("City").fill(city);
    await this.page.getByRole("option", { name: new RegExp(`^${city}`) }).first().click();
  }
  await this.page.getByLabel("First day (optional)").fill(start);
  await this.page.getByLabel("Last day (optional)").fill(end);
  await this.page.getByRole("radio", { name: /My own venue/ }).click();
  await this.page.getByLabel("Venue name").fill(venue);
  await this.page.locator("form [data-primary]").click();
  await this.page.waitForURL(/\/events\/[0-9a-f-]{36}/);
});

Then("the show page says {string} and {string}", async function (this: W, dates: string, venue: string) {
  await this.page.getByText(dates).first().waitFor();
  await this.page.getByText(venue).first().waitFor();
});

Then("it is listed under Shows", async function (this: W) {
  await this.open("/work?show=events");
  await this.page.getByTestId("work-row").first().waitFor();
  assert.match(await this.page.getByTestId("work-list").innerText(), /The Hideout/);
});

Given("I have a tour that ended last year and one coming up", async function (this: W) {
  const year = new Date().getUTCFullYear();
  const past = await seedPlan("musician", "Past Q21", { startDate: `${year - 1}-03-01` });
  const soon = await seedPlan("musician", "Upcoming Q21", { startDate: `${year + 1}-03-01` });
  this.tours = { past: "Past Q21", soon: "Upcoming Q21" }; // rows show the act name
  await this.remember(past.id, past.ownerKey, past.title);
  await this.remember(soon.id, soon.ownerKey, soon.title);
});

const titles = async (w: W) => {
  await w.page.getByTestId("work-list").first().waitFor();
  return (await w.page.getByTestId("work-list").getByRole("link").allInnerTexts()).map((t) => t.trim());
};

Then("only the upcoming tour is listed", async function (this: W) {
  assert.deepEqual(await titles(this), [this.tours!.soon]);
});

const view = async (w: W, name: "Archived" | "Active") => {
  await w.page.getByTestId("filter-button").click();
  await w.page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
  if (name === "Archived") await w.page.waitForURL(/view=archived/);
  else await w.page.waitForURL((u) => !u.search.includes("view=archived"));
};

When("I show archived work", async function (this: W) {
  await view(this, "Archived");
});

When("I show active work", async function (this: W) {
  await view(this, "Active");
});

Then("the past tour is listed", async function (this: W) {
  await this.page.getByTestId("work-list").getByRole("link", { name: this.tours!.past }).waitFor();
});

When("I restore the past tour", async function (this: W) {
  const row = this.page.getByTestId("work-row").filter({ hasText: this.tours!.past }).first();
  await row.getByTestId("row-actions").click();
  await this.page.getByRole("menuitem", { name: "Restore" }).click();
  // Restored: it leaves the Archived view.
  await this.page.getByTestId("work-list").getByRole("link", { name: this.tours!.past }).waitFor({ state: "detached" });
});

Then("both tours are listed", async function (this: W) {
  await this.page.getByTestId("work-list").getByRole("link", { name: this.tours!.past }).waitFor();
  assert.deepEqual([...(await titles(this))].sort(), [this.tours!.past, this.tours!.soon].sort());
});

When("I search my work for {string}", async function (this: W, q: string) {
  await this.page.getByRole("searchbox", { name: "Search" }).fill(q);
});

Then("the address keeps {string}", async function (this: W, part: string) {
  await this.page.waitForURL((u) => u.search.includes(part));
});

When("I reload the page", async function (this: W) {
  await this.page.reload({ waitUntil: "networkidle" });
});

Then("the search still says {string}", async function (this: W, q: string) {
  assert.equal(await this.page.getByRole("searchbox", { name: "Search" }).inputValue(), q);
});
