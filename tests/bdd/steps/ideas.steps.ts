// "Ideas for each city" (stories 24–27) and the "I sound like…" picker (story 4).
import assert from "node:assert/strict";

import { Then, When } from "@cucumber/cucumber";

import { fanData } from "../support/harness.ts";
import type { TourboWorld } from "../support/world.ts";

type CityIdeas = { city: string; ideas: { ref: string; category: string }[]; why: number };

// Every night's ideas: one city at a time, picked by ?night= (the nights rail); tiles carry
// data-testid="idea", data-category, data-ref.
async function cityIdeas(world: TourboWorld): Promise<CityIdeas[]> {
  const page = world.page;
  await page.getByTestId("city-ideas").first().waitFor({ timeout: 90_000 });
  const n = Math.max(await page.locator("ol [data-index]").count(), 1);
  const out: CityIdeas[] = [];
  for (let i = 1; i <= n; i++) {
    const url = new URL(page.url());
    url.searchParams.set("night", String(i));
    if (n > 1) await page.goto(url.toString(), { waitUntil: "networkidle" });
    const view = page.locator("[data-testid=city-ideas]:visible").first();
    await view.waitFor({ timeout: 90_000 });
    // Ideas past the budget sit behind "Show N more to look through" (per night): open them when asked to.
    if (world.last?.showAll) for (const b of await page.getByRole("button", { name: /^Show \d+ more to look through$/ }).all()) if (await b.isVisible()) await b.click();
    const city = (await view.getAttribute("data-city")) ?? String(i);
    const tiles = view.getByTestId("idea");
    const ideas = await tiles.evaluateAll((els) => els.map((e) => ({ ref: e.getAttribute("data-ref") ?? "", category: e.getAttribute("data-category") ?? "" })));
    const why = await view.locator("[data-testid=idea] [data-hint]").count();
    out.push({ city, ideas, why });
  }
  return out;
}

Then("every city has between {int} and {int} {string} ideas", async function (this: TourboWorld, min: number, max: number, category: string) {
  for (const c of await cityIdeas(this)) {
    const n = c.ideas.filter((i) => i.category === category).length;
    assert.ok(n >= min && n <= max, `${c.city}: ${n} ${category} ideas`);
  }
});

Then("every city has at least {int} ideas across at least {int} categories", async function (this: TourboWorld, min: number, cats: number) {
  for (const c of await cityIdeas(this)) {
    assert.ok(c.ideas.length >= min, `${c.city}: ${c.ideas.length} ideas`);
    const kinds = new Set(c.ideas.map((i) => i.category));
    assert.ok(kinds.size >= cats, `${c.city}: ${kinds.size} categories (${[...kinds].join(", ")})`);
  }
});

Then("every idea has a {string}", async function (this: TourboWorld, _why: string) {
  for (const c of await cityIdeas(this)) assert.ok(c.why >= c.ideas.length, `${c.city}: ${c.ideas.length} ideas, ${c.why} why? hints`);
});

Then("at least two cities get different ideas", async function (this: TourboWorld) {
  const all = await cityIdeas(this);
  assert.ok(all.length >= 2, `only ${all.length} city`);
  const keys = new Set(all.map((c) => c.ideas.map((i) => i.ref).sort().join("|")));
  assert.ok(keys.size >= 2, "every city got the same ideas");
});

Then("the ideas are labelled as taste-based, not sales predictions", async function (this: TourboWorld) {
  await this.page.getByTestId("city-ideas").first().waitFor({ timeout: 90_000 });
  const text = await this.page.locator("main").innerText();
  assert.match(text, /taste/i, "no taste-based label on the ideas");
  assert.match(text, /not (a )?sales|not .*predict/i, "the ideas aren't labelled as 'not sales predictions'");
});

Then("the ideas say in one line what they are based on", async function (this: TourboWorld) {
  await this.page.getByTestId("city-ideas").first().waitFor({ timeout: 90_000 });
  // IdeasBoard's first line: frame + basis line.
  const line = (await this.page.getByTestId("ideas-basis").first().innerText()).trim();
  assert.ok(line.length > 0 && line.length <= 200 && !line.includes("\n"), `basis line: "${line}"`);
  assert.match(line, /from|based|loves|fans|people/i, `doesn't say what it's based on: "${line}"`);
});

// ---------- "I sound like…" ----------
async function typePeer(world: TourboWorld, name: string) {
  const box = world.page.getByRole("textbox", { name: "Acts you sound like" });
  await box.fill(name);
  return box;
}

When("I add {string} as an act I sound like", async function (this: TourboWorld, name: string) {
  await typePeer(this, name);
  await this.page.getByRole("option", { name: new RegExp(`^${name}\\b`) }).first().click();
  await this.page.getByRole("button", { name: `Remove ${name}` }).waitFor();
});

When("I try to add {string} as an act I sound like", async function (this: TourboWorld, name: string) {
  const box = await typePeer(this, name);
  await box.press("Enter");
});

Then("I see a hint that there is no match for {string}", async function (this: TourboWorld, name: string) {
  await this.page.getByRole("status").filter({ hasText: `No match for “${name}”` }).waitFor();
});

// The originality budget caps local ideas (default "a touch"); "Lots" shows the full lists.
When("I ask for lots of local flavour", async function (this: TourboWorld) {
  const url = new URL(this.page.url());
  url.searchParams.set("flavour", "lots");
  await this.page.goto(url.toString(), { waitUntil: "networkidle" });
});

// ---------- saved ideas / context controls ----------
When("I come back to the Ideas tab later", async function (this: TourboWorld) {
  this.last = { before: await cityIdeas(this), calls: fanData().stats()["/v2/insights"] ?? 0 };
  await this.open("/help");
  await this.open(`/plan/${this.runId}/ideas`);
});

Then("the same ideas show without asking the fan data again", async function (this: TourboWorld) {
  const after = await cityIdeas(this);
  const key = (x: CityIdeas[]) => x.map((c) => `${c.city}:${c.ideas.map((i) => i.ref).join(",")}`).join("|");
  assert.equal(key(after), key(this.last.before), "the ideas changed on revisit");
  const calls = fanData().stats()["/v2/insights"] ?? 0;
  assert.equal(calls, this.last.calls, `revisit made ${calls - this.last.calls} fan-data calls`);
});

When("I note how many ideas each city shows", async function (this: TourboWorld) {
  this.last = Object.fromEntries((await cityIdeas(this)).map((c) => [c.city, c.ideas.length]));
});

Then("every city shows at least as many ideas as before, and one shows more", async function (this: TourboWorld) {
  const after = await cityIdeas(this);
  let more = false;
  for (const c of after) {
    const before = this.last[c.city] ?? 0;
    assert.ok(c.ideas.length >= before, `${c.city}: ${before} → ${c.ideas.length}`);
    if (c.ideas.length > before) more = true;
  }
  assert.ok(more, "no city got more ideas with lots of local flavour");
});

Then("I still see the plain ideas", async function (this: TourboWorld) {
  assert.ok((await this.page.getByTestId("idea").count()) > 0, "the ideas went away");
});

// Ideas past the originality budget sit behind "Show N more to look through" (context-controls.tsx).
When("I show the rest of the ideas", async function (this: TourboWorld) {
  await this.page.getByTestId("city-ideas").first().waitFor({ timeout: 90_000 });
  const more = this.page.getByRole("button", { name: /^Show \d+ more to look through$/ });
  await more.first().waitFor();
  this.last = { ...(this.last ?? {}), showAll: true };
});

// Story 24: covers live on their own tab (ranked by over-index); Ideas only links to it.
Then("the Ideas tab leaves covers to the Covers tab", async function (this: TourboWorld) {
  const ideas = await cityIdeas(this);
  assert.ok(ideas.every((c) => !c.ideas.some((i) => i.category === "cover")), "Ideas still lists covers");
  await this.page.getByRole("link", { name: "their own tab" }).waitFor();
});

When("I open the Covers tab", async function (this: TourboWorld) {
  const url = new URL(this.page.url());
  url.pathname = url.pathname.replace(/\/ideas$/, "/covers");
  url.search = "";
  await this.page.goto(url.toString(), { waitUntil: "load" });
  await this.page.getByTestId("kind-tab").waitFor({ timeout: 30_000 });
});

async function nightCovers(world: TourboWorld) {
  return world.page.locator("[data-testid=kind-tab] ol > li").evaluateAll((lis) =>
    lis.map((li) => ({ refs: [...li.querySelectorAll("[data-testid=cover]")].map((e) => e.getAttribute("data-ref") ?? ""), why: li.querySelectorAll("[data-testid=cover] [data-hint]").length })),
  );
}

Then("every night has between {int} and {int} covers, each with a {string}", async function (this: TourboWorld, min: number, max: number, _why: string) {
  const nights = await nightCovers(this);
  assert.ok(nights.length > 0, "no nights on the Covers tab");
  nights.forEach((n, i) => {
    assert.ok(n.refs.length >= min && n.refs.length <= max, `night ${i + 1}: ${n.refs.length} covers`);
    assert.ok(n.why >= n.refs.length, `night ${i + 1}: ${n.refs.length} covers, ${n.why} why? hints`);
  });
});

Then("at least two nights get different covers", async function (this: TourboWorld) {
  const keys = new Set((await nightCovers(this)).map((n) => n.refs.join("|")));
  assert.ok(keys.size >= 2, "every night got the same covers");
});
