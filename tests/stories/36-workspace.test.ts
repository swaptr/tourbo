// Story 36 (PLAN Q21): profile once, then a workspace of tours and events. The act answers who
// they are in at most three short steps (or skips); every later tour or event starts from that
// profile and only asks what's missing. The workspace lists their tours, one-off events and tour
// nights with status, archives past ones by itself, and keeps sort / filter / search in the URL.
// No fan-data or AI calls: tours are copies of saved plans. Web parts need the app running
// (STORY_BASE_URL, default http://localhost:3000) and Chromium.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { createEvent, getEvent, listEvents, syncTourNights } from "@tourbo/core/events/events.server.ts";
import { createProfile, getProfile } from "@tourbo/core/profiles/profiles.server.ts";
import { canDo, missingFor } from "@tourbo/core/profiles/profile.ts";
import { applyQuery, isArchived, parseQuery } from "../../apps/web/app/lib/workspace.ts";
import { workspaceRows } from "../../apps/web/server/workspace.server.ts";
import { appUp, BASE } from "./_mcp.ts";
import { browser, chromiumPath } from "./_browser.ts";

const newKey = () => {
  const key = randomBytes(24).toString("base64url");
  return { key, hash: createHash("sha256").update(key).digest("hex") };
};
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let up = false;
let source: { plan: { stops: { date?: string }[] } & Record<string, unknown>; params: Record<string, unknown> } | undefined;
const runs: string[] = [];
const events: string[] = [];
const profiles: string[] = [];

// A saved plan copied under a new id, its nights moved to start `offset` days from today.
async function copyTour(hash: string, offset: number, profileId?: string, title = "Story 36 act") {
  const sql = await db();
  const plan = structuredClone(source!.plan);
  plan.stops.forEach((s, i) => (s.date = iso(offset + i)));
  (plan as { artist: { name: string } }).artist.name = title;
  const [row] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status, plan, owner_hash, profile_id)
    values (${title}, ${sql.json({ ...source!.params, mode: "tour" } as never)}, 'done', ${sql.json(plan as never)}, ${hash}, ${profileId ?? null})
    returning id`;
  runs.push(row.id);
  return row.id;
}

before(async () => {
  up = await appUp();
  const sql = await db();
  [source] = await sql<NonNullable<typeof source>[]>`select plan, params from runs where status = 'done' and plan is not null and jsonb_array_length(plan->'stops') >= 2 order by created_at desc limit 1`;
});

after(async () => {
  const sql = await db();
  if (events.length) await sql`delete from events where id = any(${events}::uuid[])`;
  if (runs.length) await sql`delete from runs where id = any(${runs}::uuid[])`;
  if (profiles.length) await sql`delete from profiles where id = any(${profiles}::uuid[])`;
  await closeDb();
});

test("profile once: saved with several kinds; tour needs name + home, events only the name", async () => {
  const owner = newKey();
  const p = await createProfile({ name: "Story 36 Rohan", kinds: ["comedian", "musician"], listed: false, basis: "city", peers: [], styles: [] }, owner.hash);
  profiles.push(p.id!);
  const back = await getProfile(p.id!);
  assert.deepEqual(back?.kinds, ["comedian", "musician"], "kinds keep their order (main first)");
  assert.deepEqual(missingFor(back, "tour"), ["home"], "a tour asks only for the home base");
  assert.ok(canDo(back, "event"), "an event needs nothing more");
  assert.ok(canDo({ ...back, home: { name: "Pune", lat: 18.5, lon: 73.9 } }, "tour"));
});

test("workspace rows: only what this browser knows or its profile owns; tour nights become events", async (t) => {
  if (!source) return t.skip("no finished plan in the database");
  const owner = newKey();
  const p = await createProfile({ name: "Story 36 Maya", kinds: ["musician"], listed: true, peers: [], styles: [] }, owner.hash);
  profiles.push(p.id!);
  const known = await copyTour(owner.hash, 30);
  const filed = await copyTour(owner.hash, 60, p.id);
  const stranger = await copyTour(newKey().hash, 90);

  const mine = await workspaceRows({ runs: [known], projects: [], events: [], profile: { id: p.id!, key: owner.key } });
  const tours = mine.filter((r) => r.type === "tour").map((r) => r.id);
  assert.ok(tours.includes(known) && tours.includes(filed), "known ids + the profile's runs");
  assert.ok(!tours.includes(stranger), "never someone else's work");
  const wrongKey = await workspaceRows({ runs: [], projects: [], events: [], profile: { id: p.id!, key: "nope" } });
  assert.ok(!wrongKey.some((r) => r.id === filed), "the profile's runs need its owner key");

  const nights = mine.filter((r) => r.type === "event" && r.tourId === known);
  assert.equal(nights.length, source.plan.stops.filter((s) => (s as { money?: { verdict?: string } }).money?.verdict !== "skip").length, "one event per played night");
  for (const n of nights) events.push(n.id);
  await syncTourNights(known); // idempotent
  assert.equal((await listEvents([], null, [known])).length, nights.length);
});

test("a 3-day event at the act's own venue archives itself the day after it ends", async () => {
  const owner = newKey();
  const e = await createEvent(
    { title: "Story 36 weekend", artist: "Story 36 Mira", kind: "visual_artist", city: { name: "Porto", lat: 41.15, lon: -8.61 }, startDate: iso(-3), endDate: iso(-1), venue: { name: "Galeria Story", address: "Rua 36", source: "own" } },
    { ownerHash: owner.hash },
  );
  events.push(e.id);
  const back = await getEvent(e.id);
  assert.equal(back?.venue?.name, "Galeria Story");
  assert.equal(back?.endDate, iso(-1));
  const [row] = await workspaceRows({ runs: [], projects: [], events: [e.id] });
  assert.equal(row.type, "event");
  assert.ok(isArchived(row, iso(0)), "past its last day: archived");
  assert.ok(!isArchived(row, iso(-1)), "on its last day: still active");
  assert.equal(applyQuery([row], parseQuery(new URLSearchParams("show=events&view=archived&q=galeria")), iso(0)).length, 1, "found under Archived by venue");
});

test("owner key: archive / restore need it", async (t) => {
  if (!up) return t.skip("needs the app running");
  if (!source) return t.skip("no finished plan in the database");
  const owner = newKey();
  const id = await copyTour(owner.hash, 10);
  const post = (key: string | undefined, op: string) =>
    fetch(`${BASE}/api/workspace`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "X-Owner-Key": key } : {}) }, body: JSON.stringify({ op, kind: "run", id }) });
  const denied = await post(undefined, "archive");
  assert.equal(denied.status, 403);
  assert.match(((await denied.json()) as { error: string }).error, /^Only the browser that made this/);
  assert.equal((await post(owner.key, "archive")).status, 200);
  const sql = await db();
  assert.equal((await sql<{ archived: boolean }[]>`select archived from runs where id = ${id}`)[0].archived, true);
  assert.equal((await post(owner.key, "restore")).status, 200);
  assert.equal((await sql<{ archived: boolean }[]>`select archived from runs where id = ${id}`)[0].archived, false);
});

test("browser: first time → empty workspace → 3 steps → workspace; Plan a tour never asks who again; filters live in the URL", async (t) => {
  if (!up || !chromiumPath) return t.skip("needs the app running and Chromium");
  if (!source) return t.skip("no finished plan in the database");
  const b = await browser();
  try {
    const page = await b.newPage();
    await page.goto(`${BASE}/work`);
    // Never walled: the empty list with a quiet "Set up your act" link.
    await page.getByTestId("work-empty").waitFor({ timeout: 15_000 });
    await page.getByRole("link", { name: "Set up your act" }).click();
    await page.waitForURL(/\/start/, { timeout: 15_000 });
    await page.getByRole("heading", { name: "What do you do?" }).waitFor();
    assert.equal(await page.locator('ol[aria-label="Progress"] > li').count(), 3, "three steps");
    const tiles = page.locator("main button[aria-pressed]");
    await tiles.nth(1).click();
    await tiles.nth(0).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByLabel("Name").fill("Nobody Story 36");
    await page.getByTestId("unlisted").waitFor({ timeout: 20_000 });
    await page.getByRole("radio", { name: /Just my city/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByLabel("Home base").fill("Chicago");
    await page.getByRole("option", { name: /^Chicago/ }).first().click();
    await page.getByRole("button", { name: /^Save/ }).click();
    await page.waitForURL(/\/work/, { timeout: 15_000 });
    await page.getByTestId("work-empty").waitFor({ timeout: 15_000 });
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem("tourbo:profile") ?? "{}"));
    profiles.push(profile.id);
    assert.deepEqual(profile.kinds?.length, 2);

    // Plan a tour: straight to the tour form, the main kind pre-picked, both kinds offered.
    await page.getByTestId("new-menu").click();
    await page.getByRole("menuitem", { name: "Plan a tour" }).click();
    // Opens as a popover on the workspace (the full page stays at /new?type=tour).
    await page.getByTestId("new-tour-form").waitFor();
    const kinds = page.getByTestId("new-tour-form").getByRole("radiogroup", { name: "What sort of show is this?" }).getByRole("radio");
    assert.equal(await kinds.count(), 3, "two profile kinds + Something else");
    assert.equal(await kinds.first().getAttribute("aria-checked"), "true");
    await page.keyboard.press("Escape");

    // Two tours filed under this profile: one upcoming, one past (archived by itself).
    const ownerKey = profile.ownerKey as string;
    const owner = { key: ownerKey, hash: createHash("sha256").update(ownerKey).digest("hex") };
    const soon = await copyTour(owner.hash, 20, profile.id, "Story 36 Spring");
    await copyTour(owner.hash, -40, profile.id, "Story 36 Winter");
    await page.evaluate((id) => localStorage.setItem("tourbo:work", JSON.stringify([{ id, kind: "plan", title: "Story 36 Spring", updatedAt: new Date().toISOString() }])), soon);
    await page.goto(`${BASE}/work`);
    const titles = () => page.getByTestId("work-list").getByRole("link").allInnerTexts();
    await page.getByTestId("work-list").first().waitFor({ timeout: 15_000 });
    assert.deepEqual(await titles(), ["Story 36 Spring"], "the past tour isn't in Active");
    await page.getByTestId("filter-button").click();
    await page.getByRole("menuitemradio", { name: /^Archived/ }).click();
    await page.waitForURL(/view=archived/);
    await page.getByTestId("work-list").getByRole("link", { name: "Story 36 Winter" }).waitFor();
    await page.getByTestId("filter-button").click();
    await page.getByRole("menuitemradio", { name: /^Active/ }).click();
    await page.waitForURL((u) => !u.search.includes("view=archived"));
    await page.getByRole("searchbox", { name: "Search" }).fill("winter");
    await page.waitForURL(/q=winter/);
    await page.getByTestId("work-empty").waitFor({ timeout: 10_000 }).catch(async (e) => {
      throw new Error(`no empty state at ${page.url()}: ${(await page.locator("main").innerText()).replace(/\n+/g, " | ").slice(0, 600)} ${e}`);
    });
    await page.reload();
    assert.equal(await page.getByRole("searchbox", { name: "Search" }).inputValue(), "winter", "search survives a reload");
  } finally {
    await b.close();
  }
});
