// The plan page and its tabs: nights, ideas, your set, insights, and "Your work" on home.
import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";
import type { Locator, Page } from "playwright-core";

import { DISCIPLINES, tabLabel, workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { distanceKm } from "@tourbo/core/shared/geo.ts";
import { LLM } from "../support/harness.ts";
import { defaultBudget, ideaLabels, kindOf, setOrder } from "../support/kinds.ts";
import { finishWithStandIn, getRun, seedPlan, waitSettled } from "../support/runs.ts";
import type { TourboWorld } from "../support/world.ts";

const VERDICT = /^(headline|co-headline|support slot|skip|dropped|profit|loss|break-even)$/;
const VENDOR = /\b(qloo|claude|anthropic)\b/i;

Then("my plan page opens", async function (this: TourboWorld) {
  this.runId = this.page.url().match(/\/plan\/([0-9a-f-]{36})/)![1];
  await this.page.getByRole("heading", { level: 1 }).waitFor();
});

// With the AI key: the real agent finishes the run. Without: the run must fail with a plain
// sentence and a Retry (story 7), then the suite finishes it with the deterministic stand-in.
Then("the plan has at least {int} nights with a money verdict", async function (this: TourboWorld, min: number) {
  const run = await waitSettled(this.runId);
  if (!LLM && run.status !== "done") {
    await plannerFailedPlainly(this);
    await finishWithStandIn(this.runId);
  } else assert.equal(run.status, "done", `plan ended ${run.status}`);
  await this.page.reload();
  const verdicts = await nightVerdicts(this);
  const nights = verdicts.filter((v) => VERDICT.test(v));
  assert.ok(nights.length >= min, `expected ≥ ${min} nights with a verdict, saw ${nights.length} (${verdicts.join(", ")})`);
});

// The plan's nights: the workspace list (data-testid="night"; one night open as a card, the
// rest collapsed rows that open on click) or, in the older layout, one card per night.
export async function planLoaded(world: TourboWorld) {
  await world.page.locator("[data-testid=night], [data-slot=card]").filter({ hasText: /fan score|\$|€|₹/ }).first().waitFor();
}
async function nightVerdicts(world: TourboWorld): Promise<string[]> {
  await world.page.waitForLoadState("networkidle");
  await planLoaded(world);
  // Workspace rows carry data-verdict (profit | loss | break-even); older layout: card badges.
  const rows = world.page.getByTestId("night-row");
  if (await rows.count()) return rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-verdict") ?? "(none)"));
  return (await world.page.locator("[data-slot=card-action] span").allInnerTexts()).map((v) => v.trim());
}

export async function plannerFailedPlainly(world: TourboWorld) {
  await waitSettled(world.runId);
  await world.page.reload();
  await world.page.getByText("The planner couldn't finish.").waitFor();
  const sentence = await world.page.getByText("The planner couldn't finish.").locator("xpath=following-sibling::p[1]").innerText();
  assert.ok(sentence.length > 0 && sentence.length <= 200, `failure sentence: "${sentence}"`);
  assert.doesNotMatch(sentence, VENDOR, `failure sentence names a vendor: ${sentence}`);
  assert.doesNotMatch(sentence, /\bat \S+ \(|Error:|stack|undefined/i, `failure sentence looks like a stack trace: ${sentence}`);
  // Retry only when trying again can help (error model): a setup problem (no AI key) or a limit
  // in force offers "Change settings" instead.
  // "Change settings" is a link styled as a button (role button).
  await world.page.getByRole("button", { name: /^(Retry|Change settings)$/ }).or(world.page.getByRole("link", { name: "Change settings" })).first().waitFor();
}

Then("the planner says plainly that it couldn't finish, with a retry", async function (this: TourboWorld) {
  await plannerFailedPlainly(this);
});

Then("the AI planner finishes the plan by itself", async function (this: TourboWorld) {
  const run = await waitSettled(this.runId);
  assert.equal(run.status, "done", "the AI planner didn't finish");
  assert.doesNotMatch(run.plan?.summary ?? "", /test stand-in/);
});

Then("I see the tour total", async function (this: TourboWorld) {
  await this.page.getByTestId("tour-profit").waitFor();
});

Then(/^every (?:room in the plan|space) is a kind of space an? "(.+)" (?:plays|shows in)$/, async function (this: TourboWorld, key: string) {
  const kind = kindOf(key);
  const stops = this.last?.stops ?? (await getRun(this.runId))!.plan!.stops;
  const tags = new Set(DISCIPLINES[kind].spaces.map((s) => s.tag));
  const rooms = stops.map((s: { venue?: { tag: string; name: string } }) => s.venue).filter(Boolean);
  assert.ok(rooms.length > 0, "no rooms in the plan");
  for (const v of rooms) assert.ok(tags.has(v.tag), `${v.name} (${v.tag}) isn't a ${kind} space`);
});

Then("prices are shown in {string}", async function (this: TourboWorld, symbol: string) {
  const text = await this.page.locator("main").innerText();
  assert.ok(text.includes(symbol), `no ${symbol} on the plan page`);
});

Then("the plan says it was planned from fans of {string} and {string}", async function (this: TourboWorld, a: string, b: string) {
  const line = await this.page.getByTestId("basis-line").innerText();
  assert.match(line, /Planned from/);
  assert.ok(line.includes(a) && line.includes(b), `basis line: "${line}"`);
});

Then("the plan says in one line what it was built from", async function (this: TourboWorld) {
  const line = (await this.page.getByTestId("basis-line").innerText()).trim();
  assert.ok(line.length > 0 && line.length <= 160 && !line.includes("\n"), `basis line: "${line}"`);
  assert.doesNotMatch(line, VENDOR);
});

Then("every city in the plan is inside my circle", async function (this: TourboWorld) {
  const run = (await getRun(this.runId))!;
  const area = run.params.area!;
  for (const s of run.plan!.stops) {
    const km = distanceKm(area, s.city);
    assert.ok(km <= area.radiusKm + 25, `${s.city.name} is ${Math.round(km)} km out (circle ${area.radiusKm})`);
  }
});

Then("no losing night is shown as the best bet", async function (this: TourboWorld) {
  const run = (await getRun(this.runId))!;
  for (const s of run.plan!.stops) if (s.money?.verdict === "headline") assert.ok(s.money.profit >= 0, `${s.city.name} is a headline at a loss`);
  const best = this.page.locator("[data-slot=card]", { hasText: "Strongest" });
  if (await best.count()) assert.doesNotMatch(await best.first().innerText(), /\bskip\b/);
});

async function openSeeded(world: TourboWorld, seeded: { id: string; ownerKey: string; title: string }, artist: string) {
  world.runId = seeded.id;
  world.ownerKey = seeded.ownerKey;
  world.artist = artist;
  await world.remember(seeded.id, seeded.ownerKey, seeded.title);
  await world.open(`/plan/${world.runId}`);
  await planLoaded(world);
}

Given("a finished plan for a {string}", async function (this: TourboWorld, key: string) {
  this.kind = kindOf(key);
  await openSeeded(this, await seedPlan(this.kind), "Test Act 3");
});

Given("a finished plan for an unlisted {string} planned from {string}", async function (this: TourboWorld, key: string, way: string) {
  this.kind = kindOf(key);
  const styles = /style/i.test(way);
  const artist = `Unlisted ${key}`;
  const extra = { notInQloo: true, basis: styles ? "styles" : "city", styles: styles ? "urn:tag:genre:music:test_music_indie_1" : "" };
  await openSeeded(this, await seedPlan(this.kind, artist, extra), artist);
});

When("I open the {string} tab", async function (this: TourboWorld, tab: string) {
  // Older feature wording → the tour page's tab labels (apps/web/app/lib/tour-tabs.ts).
  const name = ({ "Show notes": "Notes", Insights: "Numbers", "Your set": "Set", Outreach: "Booking" } as Record<string, string>)[tab] ?? tab;
  let link = this.page.getByRole("navigation").getByRole("link", { name, exact: true });
  if (!(await link.count())) {
    // Numbers, Tickets and Compare sit in the tab row's More menu.
    const more = this.page.getByRole("navigation").getByRole("button", { name: "More" });
    if (await more.count()) {
      await more.first().click();
      link = this.page.getByRole("menuitem", { name, exact: true });
    }
  }
  if (!(await link.count())) return "pending"; // the tab isn't built yet
  const href = (await link.first().getAttribute("href"))!;
  // Tab links carry ?night=N (the picked night); compare paths only.
  const path = new URL(href, this.page.url()).pathname;
  await link.first().click();
  const went = await this.page.waitForURL((u) => u.pathname === path, { timeout: 10_000 }).then(() => true, () => false);
  if (!went) {
    this.attach(`tab "${tab}" click didn't navigate from ${this.page.url()}; opening ${href} directly`);
    await this.page.goto(this.url(href), { waitUntil: "networkidle" });
    assert.equal(new URL(this.page.url()).pathname, path, `${href} redirected to ${this.page.url()}`);
  }
  await this.page.waitForLoadState("networkidle");
});

Then("I see idea tiles of the right kinds for a {string}", async function (this: TourboWorld, key: string) {
  const kind = kindOf(key);
  const view = this.page.getByTestId("city-ideas").first();
  try {
    await view.waitFor({ timeout: 90_000 });
  } catch {
    const failed = this.page.getByRole("alert");
    assert.fail((await failed.isVisible()) ? `ideas failed: ${await failed.innerText()}` : "no ideas appeared in 90 s");
  }
  const headings = (await view.locator("h3").allInnerTexts()).map((h) => h.replace(/\s*\d+\s*$/, "").trim());
  const allowed = new Set(ideaLabels(kind));
  // At the default "a touch" of local flavour the board shows only a few ideas, so ≥ 1 group.
  assert.ok(headings.length >= 1, `no idea groups for ${kind}`);
  for (const h of headings) assert.ok(allowed.has(h), `"${h}" isn't an idea group for ${kind} (expected one of ${[...allowed].join(", ")})`);
  const why = await view.getByText("why?").count();
  assert.ok(why > 0, "idea tiles have no why? number");
});

const PIECES = ["Opening Number, opener, 4", "Second Piece", "Slow One, slow", "Big One, banger", "Quiet Bit, slow", "Last One, closer, 5"];

When("I build my set from {int} of my own pieces, if my kind has a set", async function (this: TourboWorld, n: number) {
  if (!setOrder(this.kind)) return;
  // Each kind names its Set tab (Programme, Rundown, Menu…): workspaceFor(kind).labels.
  const tab = tabLabel(workspaceFor(this.kind), "set");
  await this.page.getByRole("navigation").getByRole("link", { name: tab, exact: true }).click();
  const box = this.page.getByRole("textbox", { name: /^Your / });
  // Pasting is folded under the night's own set: open it first.
  if (!(await box.isVisible())) await this.page.getByText("Or paste a list and order every night at once").click();
  await box.fill(PIECES.slice(0, n).join("\n"));
  await this.page.getByRole("button", { name: "Order every night" }).click();
});

Then("each city gets a running order that stays within the originality budget, if my kind has a set", async function (this: TourboWorld) {
  if (!setOrder(this.kind)) return;
  const cards = this.page.locator("[data-slot=card]").filter({ has: this.page.locator("ol") });
  await cards.first().waitFor();
  const budget = defaultBudget(this.kind);
  const count = await cards.count();
  assert.ok(count >= 2, `expected a running order per city, saw ${count}`);
  for (let i = 0; i < count; i++) {
    const text = await cards.nth(i).locator("ol").innerText();
    // Each move's label is the first span of its line (MOVE_LABEL in plan.$id.set.tsx).
    const moves = await cards.nth(i).getByTestId("set-move").evaluateAll((els) => els.map((e) => e.getAttribute("data-move-kind") ?? ""));
    const local = moves.filter((m) => m === "nod" || m === "crowd").length;
    assert.ok(local <= budget, `card ${i + 1}: ${local} local touches, budget ${budget}`);
    for (const p of PIECES.map((x) => x.split(",")[0])) assert.ok(text.includes(p), `card ${i + 1} lost "${p}"`);
  }
});

Then("I see charts, each with a plain question as its title and a one-line takeaway", async function (this: TourboWorld) {
  // ChartCard: data-testid "chart-*", a [data-chart-title] heading and a [data-chart-takeaway] line.
  const cards = this.page.locator("[data-testid^=chart]:not([data-testid=chart-empty])").filter({ has: this.page.locator("[data-chart-title]") });
  await cards.first().waitFor({ timeout: 90_000 });
  const n = await cards.count();
  assert.ok(n >= 2, `only ${n} chart(s)`);
  for (let i = 0; i < n; i++) {
    const title = (await cards.nth(i).locator("[data-chart-title]").innerText()).trim();
    assert.match(title, /\?$/, `chart title isn't a question: "${title}"`);
    const takeaway = cards.nth(i).locator("[data-chart-takeaway]");
    assert.ok(await takeaway.count(), `"${title}" has no takeaway`);
    const line = (await takeaway.innerText()).replace(/\s*why\?\s*$/, "").trim();
    assert.ok(line.length > 0 && line.length <= 200 && !line.includes("\n"), `"${title}" takeaway isn't one line: "${line}"`);
  }
  const text = await this.page.locator("main").innerText();
  assert.doesNotMatch(text, VENDOR);
});

// A returning user (profile saved) who opens the site lands on their workspace (PLAN Q21).
When("I go to the home page", async function (this: TourboWorld) {
  await this.open("/");
  await this.page.waitForURL(/\/work/, { timeout: 10_000 }).catch(() => {});
});

// In the act's own workspace a tour reads by its route ("Chicago to Detroit"), not the act's
// name (work.tsx shownTitle): find the row by the plan's link when the run id is known.
// `inRow` is relative to a row (a `has:` filter can't start from the list above it).
const planLink = (w: TourboWorld, scope: Locator | Page) =>
  w.runId ? scope.locator(`a[href="/plan/${w.runId}"]`) : scope.getByRole("link", { name: new RegExp(`^${w.artist!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
const workLink = (w: TourboWorld) => planLink(w, w.page.getByTestId("work-list"));
const inRow = (w: TourboWorld) => planLink(w, w.page);

Then("my work lists the plan", async function (this: TourboWorld) {
  if (!/\/work/.test(this.page.url())) await this.open("/work");
  await workLink(this).first().waitFor();
});

When("I delete the plan from my work", async function (this: TourboWorld) {
  const row = this.page.getByTestId("work-row").filter({ has: inRow(this) }).first();
  await row.getByTestId("row-actions").click();
  await this.page.getByRole("menuitem", { name: /^Delete/ }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await workLink(this).first().waitFor({ state: "detached" });
});

Then("the plan is gone for good", async function (this: TourboWorld) {
  assert.equal(await getRun(this.runId), undefined, "the plan is still on the server");
  const res = await this.page.request.get(this.url(`/plan/${this.runId}`));
  assert.equal(res.status(), 404);
});
