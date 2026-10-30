// Material + event sets (PLAN Q21): the library through /material, sets through the set API the
// event page's <EventSet> uses (same owner key, same requests).
import assert from "node:assert/strict";

import { Given, Then, When, type DataTable } from "@cucumber/cucumber";

import { createEvent } from "@tourbo/core/events/events.server.ts";
import { newOwnerKey } from "../../../apps/web/server/owner.server.ts";
import type { TourboWorld } from "../support/world.ts";

type W = TourboWorld & { events?: Record<string, string> };

async function addSong(w: W, title: string, length = "") {
  // New opens the add form in a popover; it stays open between adds.
  if (!(await w.page.getByTestId("new-form").isVisible())) {
    await w.page.getByTestId("new-menu").click();
    await w.page.getByRole("menuitem", { name: /^Add a / }).click();
  }
  const form = w.page.getByTestId("new-form").getByTestId("material-form");
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Length (min)").fill(length);
  await form.getByRole("button", { name: "Add" }).click();
}

When("I add these songs to my material:", async function (this: W, table: DataTable) {
  const rows = table.hashes();
  for (const [i, r] of rows.entries()) {
    await addSong(this, r.title, r.length);
    await this.page.getByTestId("material-row").nth(i).waitFor();
  }
});

When("I try to add a song without a title", async function (this: W) {
  await addSong(this, "", "4");
});

Then("my material lists {int} songs", async function (this: W, count: number) {
  await this.open("/material");
  await this.page.getByTestId("material-row").first().waitFor();
  assert.equal(await this.page.getByTestId("material-row").count(), count);
});

// Events this browser made: rows in the DB, owner keys in "Your work" (as the new-event form does).
Given("I have two events {string} and {string}", async function (this: W, a: string, b: string) {
  const profile = await this.page.evaluate(() => JSON.parse(localStorage.getItem("tourbo:profile") ?? "{}") as { id?: string });
  assert.ok(profile.id, "adding material should have created the act profile");
  this.events = {};
  for (const title of [a, b]) {
    const owner = newOwnerKey();
    const e = await createEvent({ title, artist: "Test Act 3", kind: "musician", city: { name: "Chicago", lat: 41.88, lon: -87.63 }, startDate: "2027-03-05", endDate: undefined }, { ownerHash: owner.hash, profileId: profile.id });
    this.events[title] = e.id;
    await this.page.evaluate(([id, ownerKey, title]) => {
      const list = JSON.parse(localStorage.getItem("tourbo:work") ?? "[]");
      list.unshift({ id, kind: "event", title, ownerKey, updatedAt: new Date().toISOString() });
      localStorage.setItem("tourbo:work", JSON.stringify(list));
    }, [e.id, owner.key, title]);
  }
});

async function putSet(w: W, event: string, titles: string[] | "all") {
  const id = w.events![event];
  const res = await w.page.evaluate(
    async ([id, titles]) => {
      const profile = JSON.parse(localStorage.getItem("tourbo:profile") ?? "{}");
      const { items } = await (await fetch("/api/material", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: profile.id }) })).json();
      const ids = titles === "all" ? items.map((m: { id: string }) => m.id) : (titles as string[]).map((t) => items.find((m: { title: string }) => m.title === t)?.id);
      const key = JSON.parse(localStorage.getItem("tourbo:work") ?? "[]").find((i: { id: string }) => i.id === id)?.ownerKey;
      const r = await fetch(`/api/events/${id}/set`, { method: "PUT", headers: { "content-type": "application/json", "X-Owner-Key": key }, body: JSON.stringify({ ids }) });
      return { status: r.status, body: await r.json() };
    },
    [id, titles] as const,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as { set: { title: string }[] };
}

When("I build the set for {string} from all 5 songs", async function (this: W, event: string) {
  const { set } = await putSet(this, event, "all");
  assert.equal(set.length, 5);
});

When("I reuse {string}, {string} and {string} for {string}", async function (this: W, a: string, b: string, c: string, event: string) {
  await putSet(this, event, [a, b, c]);
});

Then("the set for {string} is {string}, {string}, {string}", async function (this: W, event: string, a: string, b: string, c: string) {
  const body = await this.page.evaluate(async (id) => (await fetch(`/api/events/${id}/set`)).json(), this.events![event]);
  assert.deepEqual(body.set.map((m: { title: string }) => m.title), [a, b, c]);
});

When("I delete the event {string}", async function (this: W, event: string) {
  const id = this.events![event];
  const status = await this.page.evaluate(async (id) => {
    const key = JSON.parse(localStorage.getItem("tourbo:work") ?? "[]").find((i: { id: string }) => i.id === id)?.ownerKey;
    return (await fetch(`/api/events/${id}`, { method: "DELETE", headers: { "X-Owner-Key": key } })).status;
  }, id);
  assert.equal(status, 200);
});
