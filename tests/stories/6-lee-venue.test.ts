// Story 6: Lee books a small Chicago bar and needs acts for empty Tuesdays.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(() => m.close());

test("Lee: acts his room's crowd likes, ranked, with local fans", async () => {
  const r = await m.call("tourbo_acts_for_venue", { venue: "Empty Bottle", city: "Chicago" });
  assert.equal(r.found, true);
  assert.ok(r.acts.length >= 5);
  assert.ok(r.acts.some((a: { localCells: number }) => a.localCells > 0), "some acts have local fans");
});
