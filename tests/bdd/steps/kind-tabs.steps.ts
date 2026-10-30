// Tabs by kind: the tour's tab row, More menu and night panel follow the kind's workspace
// (packages/core/src/disciplines/index.ts WORKSPACES). Runs offline on the synthetic fan data.
import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { createEvent } from "@tourbo/core/events/events.server.ts";
import { newOwnerKey } from "../../../apps/web/server/owner.server.ts";
import { kindOf } from "../support/kinds.ts";

import type { TourboWorld } from "../support/world.ts";

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s*\d+(\/\d+)?\s*$/, "").trim(); // drop count badges

async function tourTabs(w: TourboWorld): Promise<{ main: string[]; more: string[] }> {
  const nav = w.page.getByRole("navigation", { name: "Tour" });
  await nav.waitFor({ timeout: 15_000 });
  const main = (await nav.getByRole("link").allInnerTexts()).map(clean).filter(Boolean);
  let more: string[] = [];
  const trigger = nav.getByRole("button");
  if (await trigger.count()) {
    await trigger.first().click();
    const menu = w.page.getByRole("menu");
    await menu.waitFor({ timeout: 5_000 });
    more = (await menu.getByRole("menuitem").allInnerTexts()).map(clean).filter(Boolean);
    await w.page.keyboard.press("Escape");
  }
  return { main, more };
}

Then("the tour tabs include {string}", async function (this: TourboWorld, want: string) {
  const { main } = await tourTabs(this);
  for (const t of list(want)) assert.ok(main.includes(t), `tab "${t}" missing; row is ${main.join(" · ")}`);
});

Then("More holds {string}", async function (this: TourboWorld, want: string) {
  const { more } = await tourTabs(this);
  for (const t of list(want)) assert.ok(more.includes(t), `"${t}" not under More; More is ${more.join(" · ")}`);
});

Then("the tour never shows {string}", async function (this: TourboWorld, hidden: string) {
  const { main, more } = await tourTabs(this);
  for (const t of list(hidden)) assert.ok(!main.includes(t) && !more.includes(t), `"${t}" shows for this kind: ${[...main, ...more].join(" · ")}`);
});

Then("the night panel tabs are {string}", async function (this: TourboWorld, want: string) {
  const panel = this.page.getByTestId("night-panel").first();
  await panel.waitFor({ timeout: 15_000 });
  const tabs = (await panel.getByRole("tab").allInnerTexts()).map(clean);
  assert.deepEqual(tabs, list(want));
});

// ---- The set's interior per kind (energy curve, crowd slot, wall, menu, class timeline) ----

type Item = { title: string; type: string; lengthMin?: number; details?: Record<string, unknown> };
const LIBRARY: Record<string, Item[]> = {
  musician: [
    { title: "Harbour Lights", type: "song", lengthMin: 4, details: { key: "Am", bpm: 92, energy: 2 } },
    { title: "Paper Moon", type: "song", lengthMin: 3.5, details: { key: "C", bpm: 128, energy: 5 } },
    { title: "Slow Train", type: "song", lengthMin: 5, details: { key: "F#m", bpm: 110, energy: 4 } },
  ],
  comedian: [
    { title: "Airport bit", type: "bit", lengthMin: 4, details: { marker: "opener" } },
    { title: "Landlord", type: "bit", lengthMin: 6 },
    { title: "Airport callback", type: "bit", lengthMin: 1, details: { marker: "callback" } },
    { title: "My dad", type: "bit", lengthMin: 7, details: { marker: "closer" } },
  ],
  visual_artist: [
    { title: "Lake, March", type: "piece", details: { size: "60 × 80 cm", price: 900 } },
    { title: "Red Line", type: "piece", details: { size: "40 × 40 cm", price: 450 } },
    { title: "Night Market", type: "piece", details: { size: "100 × 70 cm" } },
  ],
  chef: [
    { title: "Pickled plums", type: "piece", details: { course: "snack" } },
    { title: "Smoked trout", type: "piece", details: { course: "starter" } },
    { title: "Lamb, yoghurt", type: "piece", details: { course: "main" } },
    { title: "Burnt honey tart", type: "piece", details: { course: "dessert" } },
  ],
  teacher: [
    { title: "Breath and spine", type: "talk", lengthMin: 10, details: { part: "warmup" } },
    { title: "Arm balances", type: "talk", lengthMin: 30, details: { part: "teach" } },
    { title: "Partner flow", type: "talk", lengthMin: 15, details: { part: "practice" } },
    { title: "Savasana", type: "talk", lengthMin: 5, details: { part: "cooldown" } },
  ],
};

Given("my library has a few {string} items with their details", async function (this: TourboWorld & { showId?: string }, key: string) {
  const items = LIBRARY[kindOf(key)];
  await this.page.waitForLoadState("load");
  await this.page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"));
  const res = await this.page.evaluate(
    async ([items, kind]) => {
      const p = JSON.parse(localStorage.getItem("tourbo:profile") ?? "{}");
      const out: number[] = [];
      for (const m of items) {
        const r = await fetch("/api/material", { method: "POST", headers: { "content-type": "application/json", "X-Owner-Key": p.ownerKey }, body: JSON.stringify({ profileId: p.id, material: { ...m, kind } }) });
        out.push(r.status);
      }
      return out;
    },
    [items, key] as const,
  );
  assert.ok(res.every((s) => s === 200), `adding material: ${res.join(", ")}`);
});

Given("a {string} show with all of them in its set", async function (this: TourboWorld & { showId?: string }, key: string) {
  const profile = await this.page.evaluate(() => JSON.parse(localStorage.getItem("tourbo:profile") ?? "{}") as { id?: string });
  const owner = newOwnerKey();
  const e = await createEvent({ title: `Test ${key} show`, artist: "Nobody Q21", kind: kindOf(key), city: { name: "Chicago", lat: 41.88, lon: -87.63 }, startDate: "2027-03-05", endDate: undefined }, { ownerHash: owner.hash, profileId: profile.id });
  this.showId = e.id;
  const status = await this.page.evaluate(
    async ([id, ownerKey, title]) => {
      const list = JSON.parse(localStorage.getItem("tourbo:work") ?? "[]");
      list.unshift({ id, kind: "event", title, ownerKey, updatedAt: new Date().toISOString() });
      localStorage.setItem("tourbo:work", JSON.stringify(list));
      const p = JSON.parse(localStorage.getItem("tourbo:profile") ?? "{}");
      const { items } = await (await fetch("/api/material", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: p.id }) })).json();
      const r = await fetch(`/api/events/${id}/set`, { method: "PUT", headers: { "content-type": "application/json", "X-Owner-Key": ownerKey }, body: JSON.stringify({ ids: items.map((m: { id: string }) => m.id) }) });
      return r.status;
    },
    [e.id, owner.key, e.title] as const,
  );
  assert.equal(status, 200);
});

When("I open that show", async function (this: TourboWorld & { showId?: string }) {
  await this.open(`/events/${this.showId}`);
  await this.page.getByTestId("set-list").waitFor({ timeout: 15_000 });
});

Then("its set shows {string}", async function (this: TourboWorld, testId: string) {
  await this.page.getByTestId(testId).first().waitFor({ timeout: 10_000 });
});

Then("each item shows {string}", async function (this: TourboWorld, text: string) {
  const rows = await this.page.getByTestId("set-list").innerText();
  assert.ok(rows.includes(text), `"${text}" not in the set: ${rows}`);
});

Then("the Library form asks for {string}", async function (this: TourboWorld, labels: string) {
  await this.open("/material");
  if (!(await this.page.getByTestId("new-form").isVisible())) {
    await this.page.getByTestId("new-menu").click();
    await this.page.getByRole("menuitem", { name: /^Add a / }).click();
  }
  const form = this.page.getByTestId("new-form").getByTestId("material-form");
  for (const l of list(labels)) await form.getByLabel(new RegExp(`^${l}`)).first().waitFor({ timeout: 5_000 });
});
