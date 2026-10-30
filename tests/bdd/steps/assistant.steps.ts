// "Your own AI assistant": the same MCP tools any assistant gets, called through an in-memory
// MCP client of the Tourbo server (as tests/stories/_mcp.ts), on the suite's fan-data double
// and throwaway DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Given, Then, When } from "@cucumber/cucumber";

import { distanceKm } from "@tourbo/core/shared/geo.ts";
import { ROOT } from "../support/harness.ts";
import { KINDS } from "../support/kinds.ts";
import { mcp } from "../../stories/_mcp.ts";
import type { TourboWorld } from "../support/world.ts";

const CHICAGO = { lat: 41.88, lon: -87.63 };

Given("an AI assistant connected to Tourbo", async function (this: TourboWorld) {
  this.mcp ??= await mcp();
});

Then("the project's assistant config registers the Tourbo server", function () {
  const config = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  const server = config.mcpServers?.tourbo;
  assert.ok(server, ".mcp.json has no tourbo server");
  assert.ok(String(server.args?.join(" ")).includes("packages/mcp/src/bin/stdio.ts"), "tourbo server doesn't start the stdio bin");
  assert.doesNotMatch(JSON.stringify(config), /api[_-]?key"\s*:\s*"[^<]/i, "a key is committed in .mcp.json");
});

Then("it can see the tools {string}, {string}, {string}, {string} and {string}", async function (this: TourboWorld, a: string, b: string, c: string, d: string, e: string) {
  const names = [a, b, c, d, e];
  const { tools } = await this.mcp!.client.listTools();
  const have = new Set(tools.map((t) => t.name));
  for (const n of names) assert.ok(have.has(n), `${n} not listed`);
});

When("it plans {int} shows for {string} near {string} in {string}", async function (this: TourboWorld, shows: number, artist: string, city: string, region: string) {
  this.last = await this.mcp!.call("tourbo_plan_tour", { artist, region, shows, start_date: "2027-03-01", home_base: city });
});

When("it plans {int} shows for {string} as a {string} near {string} in {string}", async function (this: TourboWorld, shows: number, artist: string, kind: string, city: string, region: string) {
  this.last = await this.mcp!.call("tourbo_plan_tour", { artist, kind, region, shows, start_date: "2027-03-01", home_base: city });
});

Then("it gets {int} stops, each with a room and a money verdict", function (this: TourboWorld, n: number) {
  assert.equal(this.last.stops.length, n);
  for (const s of this.last.stops) {
    assert.ok(s.venue?.name, `${s.city.name}: no room`);
    assert.match(s.money?.verdict ?? "", /^(headline|co-headline|support slot|skip)$/);
  }
});

Then("the stops are at least {int} days apart", function (this: TourboWorld, days: number) {
  const dates = this.last.stops.map((s: { date: string }) => Date.parse(s.date)).sort((a: number, b: number) => a - b);
  for (let i = 1; i < dates.length; i++) assert.ok((dates[i] - dates[i - 1]) / 86_400_000 >= days, `stops ${i} and ${i + 1} are ${(dates[i] - dates[i - 1]) / 86_400_000} days apart`);
});

Then("the money counts visitors, not just tickets", function (this: TourboWorld) {
  const whys = this.last.stops.map((s: { money?: { why: string } }) => s.money?.why ?? "");
  assert.ok(whys.some((w: string) => /visitor|sales per|commission/i.test(w)), `money lines: ${whys.join(" | ")}`);
});

When("it asks which acts suit the venue {string} in {string}", async function (this: TourboWorld, venue: string, city: string) {
  this.last = await this.mcp!.call("tourbo_acts_for_venue", { venue, city });
});

Then("it gets at least {int} acts", function (this: TourboWorld, n: number) {
  assert.equal(this.last.found, true, "venue not found");
  assert.ok(this.last.acts.length >= n, `${this.last.acts.length} acts`);
});

Then("some of them have local fans", function (this: TourboWorld) {
  assert.ok(this.last.acts.some((a: { localCells: number }) => a.localCells > 0));
});

When("it lists the kinds of act Tourbo plans for", async function (this: TourboWorld) {
  this.last = await this.mcp!.call("tourbo_disciplines", {});
});

Then("the list has all {int} kinds, including {string}", function (this: TourboWorld, n: number, key: string) {
  const keys = this.last.disciplines.map((d: { key: string }) => d.key);
  assert.equal(keys.length, n, `listed: ${keys.join(", ")}`);
  assert.deepEqual([...keys].sort(), [...KINDS].sort());
  assert.ok(keys.includes(key));
});

// ---------- offers (story 2) ----------
Given("Maya expects about {int} people in a {int}-person room at {int} a ticket with {int} in costs", function (this: TourboWorld, draw: number, capacity: number, price: number, costs: number) {
  this.last = { region: "na", kind: "musician", draw, capacity, price, costs, planned_profit: 3500, planned_deal: "versus" };
});

When("the venue offers a flat fee of {int}", async function (this: TourboWorld, fee: number) {
  this.mcp ??= await mcp();
  this.last = await this.mcp.call("tourbo_assess_offer", { ...this.last, offer: { deal: "guarantee", guarantee: fee, price: this.last.price - 2, capacity: this.last.capacity }, min_guarantee: 800 });
});

When("the venue offers {int} against {int}% of the door", async function (this: TourboWorld, guarantee: number, pct: number) {
  this.mcp ??= await mcp();
  this.last = await this.mcp.call("tourbo_assess_offer", { ...this.last, planned_profit: 2500, offer: { deal: "versus", guarantee, split: pct / 100, price: this.last.price, capacity: this.last.capacity } });
});

Then("Tourbo does not accept the offer", function (this: TourboWorld) {
  assert.notEqual(this.last.decision, "accept");
});
Then("Tourbo accepts the offer", function (this: TourboWorld) {
  assert.equal(this.last.decision, "accept");
});
Then("any counter-offer asks for at least {int}, her lowest fee", function (this: TourboWorld, min: number) {
  if (this.last.decision !== "counter") return;
  assert.ok(this.last.counter.guarantee >= min, `counter ${this.last.counter.guarantee}`);
  assert.ok(this.last.counter.guarantee <= this.last.offered.venueNet, "counter isn't payable from the door");
});

// ---------- projects (story 10) ----------
When("it makes a project {string} for {string}", async function (this: TourboWorld, title: string, artist: string) {
  this.projectId = (await this.mcp!.call("tourbo_project_create", { title, artist, kind: "musician" })).id;
  assert.match(this.projectId, /^[0-9a-f-]{36}$/);
});
When("it adds the to-do {string} for {string}", async function (this: TourboWorld, text: string, city: string) {
  await this.mcp!.call("tourbo_project_add", { project_id: this.projectId, kind: "todo", text, city });
});
When("it adds the setlist idea {string}", async function (this: TourboWorld, text: string) {
  await this.mcp!.call("tourbo_project_add", { project_id: this.projectId, kind: "setlist", text });
});
When("it ticks the to-do done", async function (this: TourboWorld) {
  const items = (await this.mcp!.call("tourbo_project_get", { project_id: this.projectId })).project.items;
  const todo = items.find((i: { kind: string }) => i.kind === "todo");
  await this.mcp!.call("tourbo_project_update", { project_id: this.projectId, item_id: todo.id, done: true });
});
When("it adds and then deletes a throwaway note", async function (this: TourboWorld) {
  const extra = (await this.mcp!.call("tourbo_project_add", { project_id: this.projectId, kind: "note", text: "Throwaway" })).item;
  await this.mcp!.call("tourbo_project_update", { project_id: this.projectId, item_id: extra.id, delete: true });
});
Then("the project has {int} items", async function (this: TourboWorld, n: number) {
  this.last = await this.mcp!.call("tourbo_project_get", { project_id: this.projectId });
  assert.equal(this.last.project.items.length, n);
});
Then("its markdown shows the to-do ticked for {string}", function (this: TourboWorld, city: string) {
  assert.match(this.last.markdown, new RegExp(`- \\[x\\] \\*\\*${city}:\\*\\* `));
});
When("it opens the project {string}", async function (this: TourboWorld, id: string) {
  this.last = await this.mcp!.call("tourbo_project_get", { project_id: id });
});
Then("it is told the project wasn't found", function (this: TourboWorld) {
  assert.equal(this.last.found, false);
  const hint = JSON.stringify(this.last);
  assert.doesNotMatch(hint, /stack|Error:|at \S+ \(/);
});
// Projects are retired on the website (PLAN Q21): an old link is a permanent redirect.
Then("that project's old web link moves for good to the workspace", async function (this: TourboWorld) {
  const res = await fetch(this.url(`/projects/${this.projectId}`), { redirect: "manual" });
  assert.equal(res.status, 301);
  assert.equal(new URL(res.headers.get("location") ?? "", this.url("/")).pathname, "/work");
});

// ---------- tour notes (story 10, on the website) ----------
const notes = (w: TourboWorld) => w.page.getByTestId("tour-notes");
async function addNote(w: TourboWorld, text: string, todo: boolean) {
  const box = notes(w);
  const check = box.getByRole("checkbox", { name: "To-do" });
  if ((await check.isChecked()) !== todo) await check.click();
  await box.getByRole("textbox", { name: todo ? "New to-do" : "New note" }).fill(text);
  await box.getByRole("button", { name: "Add" }).click();
  await box.getByRole("listitem").filter({ hasText: text }).waitFor();
}
When("I add the to-do {string} to the tour", async function (this: TourboWorld, text: string) {
  await addNote(this, text, true);
});
When("I add the note {string} to the tour", async function (this: TourboWorld, text: string) {
  await addNote(this, text, false);
});
When("I tick {string} done", async function (this: TourboWorld, text: string) {
  const box = notes(this).getByRole("checkbox", { name: `Done: ${text}` });
  const saved = this.page.waitForResponse((r) => r.url().includes("/notes") && r.request().method() === "POST");
  await box.check();
  assert.ok((await saved).ok(), "tick saved");
});
When("I delete {string} from the tour notes", async function (this: TourboWorld, text: string) {
  const saved = this.page.waitForResponse((r) => r.url().includes("/notes") && r.request().method() === "DELETE");
  await notes(this).getByRole("button", { name: `Delete: ${text}` }).click();
  assert.ok((await saved).ok(), "delete saved");
});
Then("the tour notes show {string} ticked and {string}", async function (this: TourboWorld, todo: string, note: string) {
  const box = notes(this);
  await box.getByRole("listitem").filter({ hasText: note }).waitFor();
  assert.equal(await box.getByRole("checkbox", { name: `Done: ${todo}` }).isChecked(), true);
});
Then("the tour notes don't show {string}", async function (this: TourboWorld, text: string) {
  assert.equal(await notes(this).getByRole("listitem").filter({ hasText: text }).count(), 0);
});

// ---------- cities (story 11) ----------
When("it scores cities for {string} within {int} km of Chicago", async function (this: TourboWorld, name: string, km: number) {
  const act = await this.mcp!.call("tourbo_resolve_act", { name });
  this.last = { km, r: await this.mcp!.call("tourbo_score_cities", { act_id: act.id, region: "na", shows: 4, near: { ...CHICAGO, radius_km: km } }) };
});
Then("every city it returns is inside the circle", function (this: TourboWorld) {
  const { km, r } = this.last;
  assert.ok(r.cities.length >= 4, `${r.cities.length} cities`);
  for (const c of r.cities) assert.ok(distanceKm(CHICAGO, c) <= km + 1, `${c.city} is outside`);
});

// ---------- rehearsal (story 12) ----------
When("it builds the rehearsal panel for {string} in {string} and in {string}", async function (this: TourboWorld, name: string, a: string, b: string) {
  const act = await this.mcp!.call("tourbo_resolve_act", { name });
  const args = { act_id: act.id, kind: "musician", region: "na" };
  this.last = [await this.mcp!.call("tourbo_rehearsal_panel", { ...args, city: a }), await this.mcp!.call("tourbo_rehearsal_panel", { ...args, city: b })];
});
Then("each panel has at least {int} fans, each built from at least {int} facts", function (this: TourboWorld, fans: number, facts: number) {
  for (const p of this.last) {
    assert.ok(p.personas.length >= fans, `${p.personas.length} personas`);
    for (const x of p.personas) assert.ok(x.slice.length >= facts, `${x.id}: ${x.slice.length} facts`);
  }
});
Then("each panel is labelled a rehearsal", function (this: TourboWorld) {
  for (const p of this.last) assert.match(p.label, /rehearsal/i);
});
Then("the born-and-raised local differs between the two cities", function (this: TourboWorld) {
  const local = (p: { personas: { id: string; slice: { name: string }[] }[] }) => p.personas.find((x) => x.id === "local")?.slice.map((r) => r.name).join("|");
  assert.notEqual(local(this.last[0]), local(this.last[1]));
});
