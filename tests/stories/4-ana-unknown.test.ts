// Story 4: Ana isn't on Qloo; she plans from acts she sounds like, and it says so.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(() => m.close());

test("Ana: an unknown name is not silently matched to someone else", async () => {
  const r = await m.call("tourbo_resolve_act", { name: "Ana Velasquez Moonlight Quartet" });
  assert.equal(r.found, false);
  assert.match(r.hint, /peers/);
});

test("Ana: with peers the plan is built from their fans and flagged unknown", async () => {
  const r = await m.call("tourbo_resolve_act", { name: "Ana Velasquez Moonlight Quartet", peers: ["Japanese Breakfast", "Snail Mail"] });
  assert.equal(r.found, true);
  assert.equal(r.unknown, true);
  assert.ok(r.peers.length >= 1);
});
