// Story 7: things go wrong; every failure reads as one plain sentence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyError } from "../../apps/web/server/agent/errors.ts";
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
