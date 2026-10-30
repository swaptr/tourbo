// Story 7: things go wrong; every failure reads as one plain sentence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyError, PlainError } from "../../apps/web/server/agent/errors.ts";
import { mcp } from "./_mcp.ts";
import { appUp, BASE } from "./_mcp.ts";

test("errors: raw failures map to plain advice", () => {
  assert.match(friendlyError(new Error("Artist not found: zzz")), /sound like/);
  assert.match(friendlyError(new Error("Could not resolve authentication method. Expected the apiKey")), /AI assistant isn't set up/);
  assert.match(friendlyError(new Error("Qloo 503 after 3 retries")), /Fan data is busy/);
  for (const m of ["Could not resolve authentication method", "Qloo 503", "Artist not found: zzz", "refusal"]) assert.doesNotMatch(friendlyError(new Error(m)), /Qloo|Claude|Anthropic|Tourbo key/);
  assert.equal(friendlyError(new Error("connect ECONNREFUSED 127.0.0.1:5433")), "The database is unreachable. Restart the app and try again.");
  assert.equal(friendlyError(new Error("Qloo 429 on /search: monthly quota used up, resets in 3 days")), "Data provider limit reached.");
  for (const m of ["x", "TypeError: undefined is not a function"]) assert.doesNotMatch(friendlyError(new Error(m)), /TypeError|undefined/);
});

test("errors: remote MCP is closed without a token", { skip: !(await appUp()) && "app not running" }, async () => {
  const res = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.ok([401, 404].includes(res.status));
});

test("errors: a bad plan link is a friendly 404, not a crash", { skip: !(await appUp()) && "app not running" }, async () => {
  const res = await fetch(`${BASE}/plan/not-a-real-id`);
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /at .*\.ts:\d+/);
});

test("errors: the wizard rejects a circle with no cities", { skip: !(await appUp()) && "app not running" }, async () => {
  const body = new URLSearchParams({ kind: "musician", artist: "Japanese Breakfast", lat: "0", lon: "-30", radiusKm: "100", startDate: "2027-03-01", shows: "4", room: "club", jobs: "" });
  const res = await fetch(`${BASE}/new.data`, { method: "POST", body });
  assert.match(await res.text(), /Fewer than two cities/);
});

test("errors: rehearsal and project failures read as one plain sentence", async () => {
  // Rehearsal: plain messages pass through; a missing AI key maps to the setup sentence.
  assert.equal(friendlyError(new PlainError("Write the show notes for this night first, then rehearse them.")), "Write the show notes for this night first, then rehearse them.");
  assert.match(friendlyError(new Error("Could not resolve authentication method. Expected the apiKey")), /AI assistant isn't set up/);
  // Projects through MCP: a bad id is a hint, an empty project is valid and reads cleanly.
  const m = await mcp();
  try {
    const bad = await m.call("tourbo_project_get", { project_id: "not-an-id" });
    assert.equal(bad.found, false);
    assert.match(bad.hint, /tourbo_project_list/);
    const empty = await m.call("tourbo_project_create", { title: "Story test empty project" });
    const got = await m.call("tourbo_project_get", { project_id: empty.id });
    assert.equal(got.markdown.trim(), "# Story test empty project");
  } finally {
    await m.close();
  }
});

test("errors: an old project link or an unknown tour's notes never crash", { skip: !(await appUp()) && "app not running" }, async () => {
  // Projects are retired (notes live on the tour): an old link lands on the workspace.
  const old = await fetch(`${BASE}/projects/00000000-0000-0000-0000-000000000000`, { redirect: "manual" });
  assert.equal(old.status, 301);
  assert.equal(new URL(old.headers.get("location") ?? "", BASE).pathname, "/work");
  const res = await fetch(`${BASE}/api/tours/not-a-real-id/notes`);
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /at .*\.ts:\d+/);
});
