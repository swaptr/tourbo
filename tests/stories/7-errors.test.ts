// Story 7: things go wrong; every failure reads as one plain sentence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyError, PlainError } from "../../apps/web/server/agent/errors.ts";
import { mcp } from "./_mcp.ts";
import { appUp, BASE } from "./_mcp.ts";

test("errors: raw failures map to plain advice", () => {
  assert.match(friendlyError(new Error("Artist not found: zzz")), /sound like/);
  assert.match(friendlyError(new Error("Could not resolve authentication method. Expected the apiKey")), /Anthropic key/);
  assert.match(friendlyError(new Error("Qloo 503 after 3 retries")), /Qloo/);
  assert.match(friendlyError(new Error("connect ECONNREFUSED 127.0.0.1:5433")), /database/);
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
  const res = await fetch(`${BASE}/start.data`, { method: "POST", body });
  assert.match(await res.text(), /Fewer than two cities/);
});

test("errors: rehearsal and project failures read as one plain sentence", async () => {
  // Rehearsal: plain messages pass through; a missing AI key maps to the setup sentence.
  assert.equal(friendlyError(new PlainError("Write the show notes for this night first, then rehearse them.")), "Write the show notes for this night first, then rehearse them.");
  assert.match(friendlyError(new Error("Could not resolve authentication method. Expected the apiKey")), /Anthropic key/);
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

test("errors: an unknown project page is a friendly 404", { skip: !(await appUp()) && "app not running" }, async () => {
  const res = await fetch(`${BASE}/projects/00000000-0000-0000-0000-000000000000`);
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /at .*\.ts:\d+/);
});
