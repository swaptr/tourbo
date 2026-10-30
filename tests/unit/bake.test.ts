import assert from "node:assert/strict";
import { test } from "node:test";

import { bakeDensity, regionBox, sampleBaked } from "../../apps/web/app/lib/globe-model.ts";

const syd = { lat: -33.9, lon: 151.2 }, mel = { lat: -37.8, lon: 144.96 }, bne = { lat: -27.5, lon: 153.0 }, per = { lat: -31.95, lon: 115.86 };
const box = regionBox([syd, mel, bne, per]);

test("bake: region box covers the stops with a margin", () => {
  for (const p of [syd, mel, bne, per]) {
    assert.ok(p.lat < box.lat0 && p.lat > box.lat0 - box.latSpan);
    assert.ok(p.lon > box.lon0 && p.lon < box.lon0 + box.lonSpan);
  }
});

test("bake: no data = flat zero; peaks at the stops; ridge along legs; skipped lower", () => {
  const W = 128, H = 128;
  const flat = bakeDensity([], { bbox: box, width: W, height: H, kernelDeg: 0.5 });
  assert.equal(flat.length, W * H);
  assert.equal(Math.max(...flat), 0, "no data → nothing");
  const stops = [{ ...syd, strength: 100 }, { ...mel, strength: 80 }, { ...bne, strength: 60 }];
  const d = bakeDensity([[syd.lat, syd.lon, 5]], { bbox: box, width: W, height: H, kernelDeg: 0.5, stops, route: [bne, syd, mel], skipped: per });
  const at = (p: { lat: number; lon: number }) => sampleBaked(d, W, H, box, p.lat, p.lon);
  assert.ok(at(syd) > 0.95, `Sydney is the top peak (${at(syd)})`);
  assert.ok(at(mel) > 0.6 && at(mel) < at(syd));
  const mid = { lat: (syd.lat + mel.lat) / 2, lon: (syd.lon + mel.lon) / 2 };
  assert.ok(at(mid) > 0.2, `ridge between Sydney and Melbourne (${at(mid)})`);
  const off = { lat: -24, lon: 133 }; // central Australia, far from any leg
  assert.ok(at(off) < at(mid), "the ridge is along the route, not everywhere");
  assert.ok(at(per) > 0.2 && at(per) < at(mel), `skipped city is a lower peak (${at(per)})`);
});
