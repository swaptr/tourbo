// Story 19: Dev is a local comic nobody has heard of. He isn't in the fan data and sounds like
// nobody famous, yet still gets a plan: from his style, or from what his area likes. The plan
// says which in one line. A made-up "sounds like" act is turned away with a hint, never dropped.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE, appUp } from "./_mcp.ts";
import { basisLine } from "@tourbo/core/engine/basis.ts";
import { buildPlan } from "@tourbo/core/engine/plan.ts";
import { resolvePerformer } from "@tourbo/core/engine/resolve.ts";
import { TourParams } from "@tourbo/core/shared/types.ts";

const SHOWS = 3;
const ACT = "Devraj Quillfeather Tuesday Comic";
const base = { artist: ACT, kind: "comedian", notInQloo: true, shows: SHOWS, startDate: "2026-12-01", roomMin: 50, roomMax: 200, area: { lat: 41.88, lon: -87.63, radiusKm: 600 }, region: "na" };

test("Dev: a made-up comic plans from a style", async () => {
  const plan = await buildPlan(TourParams.parse({ ...base, basis: "styles", styles: ["observational comedy"] }));
  assert.equal(plan.basis, "styles");
  assert.ok(plan.stops.length >= SHOWS, `${plan.stops.length} nights`);
  assert.match(basisLine(plan), /^Planned from fans of .*comed/i);
});

test("Dev: a made-up comic plans from just his city", async () => {
  const plan = await buildPlan(TourParams.parse({ ...base, basis: "city" }));
  assert.equal(plan.basis, "city");
  assert.ok(plan.stops.length >= SHOWS, `${plan.stops.length} nights`);
  assert.equal(basisLine(plan), "Planned from what people in this area like");
});

test("Dev: an unknown act with nothing else still gets a plan (never a hard stop)", async () => {
  const a = await resolvePerformer(ACT, "comedian", [], { notInQloo: true, near: "Chicago" });
  assert.ok(a, "fell back to the area");
  assert.equal(a.basis, "city");
});

test("Dev: a 'sounds like' act that matches nobody is rejected with a hint", async () => {
  const fake = "Zzqx Plorvintine Nonexistent";
  const a = await resolvePerformer(ACT, "comedian", [fake, "Zakir Khan"], { notInQloo: true });
  assert.ok(a);
  assert.deepEqual(a.unmatched, [fake], "unmatched peer is reported, not silently dropped");
  assert.ok(a.peers.some((p) => /Zakir Khan/.test(p.name)));
  if (!(await appUp())) return;
  const r = await fetch(`${BASE}/api/resolve?peer=${encodeURIComponent(fake)}`).then((x) => x.text());
  assert.ok(!r.includes(`"name":"${fake}"`), "the wizard's list never offers the made-up name");
  const page = await fetch(`${BASE}/start?step=1`).then((x) => x.text());
  assert.ok(!/stack|TypeError/i.test(page));
});
