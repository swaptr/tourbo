// Unlisted acts (Q9): the plan's basis line and the stand-in filter, on hand-made fixtures.
import assert from "node:assert/strict";
import { test } from "node:test";

import { basisLine, planBasis } from "../../packages/core/src/engine/basis.ts";
import { fits } from "../../packages/core/src/engine/resolve.ts";
import { TourParams, type Plan } from "../../packages/core/src/shared/types.ts";

const params = (extra: Record<string, unknown> = {}) => TourParams.parse({ artist: "Dev Rao", kind: "comedian", startDate: "2026-12-01", ...extra });
const artist = (extra: Partial<Plan["artist"]> = {}): Plan["artist"] => ({ id: "a", name: "Dev Rao", kind: "comedian", peers: [], tags: [], ...extra });

test("basis line: act, peers, styles, city", () => {
  assert.equal(basisLine({ artist: artist(), params: params() }), "Planned from your fans");
  assert.equal(
    basisLine({ artist: artist({ id: "p1", peers: [{ id: "p1", name: "Zakir Khan" }, { id: "p2", name: "Anubhav Bassi" }] }), params: params({ notInQloo: true, basis: "peers" }) }),
    "Planned from fans of Zakir Khan and Anubhav Bassi",
  );
  assert.equal(
    basisLine({ artist: artist({ basis: "styles", styles: [{ id: "urn:tag:genre:x", name: "observational comedy" }] }), params: params({ basis: "styles" }) }),
    "Planned from fans of observational comedy",
  );
  assert.equal(basisLine({ artist: artist({ peers: [{ id: "x", name: "Local Star" }] }), params: params({ basis: "city" }) }), "Planned from what people in this area like");
});

test("basis line: hosted plans without plan.basis fall back to params", () => {
  // Style ids only (the hosted agent's artist carries no style names).
  const p = params({ styles: "urn:tag:genre:media:observational_comedy,urn:tag:genre:media:satire", basis: "styles" });
  assert.equal(planBasis({ artist: artist(), params: p }), "styles");
  assert.equal(basisLine({ artist: artist(), params: p }), "Planned from fans of observational comedy and satire");
  // Older runs: unknown act anchored on its first peer.
  assert.equal(planBasis({ artist: artist({ id: "p1", peers: [{ id: "p1", name: "A" }] }), params: params() }), "peers");
});

test("wizard form values parse: empty basis is no basis, styles split on commas", () => {
  const p = TourParams.parse({ artist: "X", startDate: "2026-12-01", basis: "", styles: "" });
  assert.equal(p.basis, undefined);
  assert.deepEqual(p.styles, []);
  assert.deepEqual(TourParams.parse({ artist: "X", startDate: "2026-12-01", styles: "indie folk, qawwali" }).styles, ["indie folk", "qawwali"]);
});

test("stand-ins keep only acts of the discipline", () => {
  const comic = { name: "A Comic", entity_id: "1", properties: { description: "American stand-up comedian" } };
  const actor = { name: "An Actor", entity_id: "2", properties: { description: "American actor" } };
  assert.equal(fits(comic, "comedian"), true);
  assert.equal(fits(actor, "comedian"), false);
  const painter = { name: "P", entity_id: "3", properties: { description: "British painter" } };
  assert.equal(fits(painter, "visual_artist"), true);
  assert.equal(fits(actor, "visual_artist"), false);
});
