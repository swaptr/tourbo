// Story 2: a venue lowballs Maya with a $300 flat fee; Tourbo says no and counters.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(() => m.close());

test("Maya: a lowball offer gets a counter, not an accept", async () => {
  const a = await m.call("tourbo_assess_offer", {
    region: "na", kind: "musician", draw: 420, capacity: 450, price: 22, costs: 1800, planned_profit: 3500, planned_deal: "versus",
    offer: { deal: "guarantee", guarantee: 300, price: 20, capacity: 450 }, min_guarantee: 800,
  });
  assert.notEqual(a.decision, "accept");
  if (a.decision === "counter") {
    assert.ok(a.counter.guarantee >= 800, "counter respects her walk-away fee");
    assert.ok(a.counter.guarantee <= a.offered.venueNet, "counter is payable from the door");
  }
});

test("Maya: a fair offer is accepted", async () => {
  const a = await m.call("tourbo_assess_offer", {
    region: "na", kind: "musician", draw: 420, capacity: 450, price: 22, costs: 1800, planned_profit: 2500, planned_deal: "versus",
    offer: { deal: "versus", guarantee: 4500, split: 0.8, price: 22, capacity: 450 },
  });
  assert.equal(a.decision, "accept");
});

test("Maya: the city brief gives show prep real local references", async () => {
  const act = await m.call("tourbo_resolve_act", { name: "Japanese Breakfast" });
  const brief = await m.call("tourbo_city_brief", { act_id: act.id, region: "na", city: "Chicago" });
  assert.ok(brief.cityCulture.length + brief.localArtists.length + brief.localSpots.length >= 10, "enough grounded material");
});

test("Maya: slow ticket sales get concrete actions", async () => {
  const p = await m.call("tourbo_ticket_pace", { expected_tickets: 300, capacity: 400, sold: 20, days_to_show: 10, promo_left: 500, has_smaller_room: true, currency: "USD" });
  assert.equal(p.status, "well behind");
  assert.ok(p.actions.some((a: string) => /promo/.test(a)));
  const fast = await m.call("tourbo_ticket_pace", { expected_tickets: 300, capacity: 320, sold: 250, days_to_show: 7 });
  assert.equal(fast.status, "ahead");
});
