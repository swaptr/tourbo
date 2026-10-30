// Home play order: one geographic path, short hops, act gap, wrap-around walk. node --test tests/unit/
import assert from "node:assert/strict";
import { test } from "node:test";

import { angularDistanceDeg } from "../../apps/web/app/lib/globe-model.ts";
import { ACT_GAP, playOrder, rotate, walkStart } from "../../apps/web/app/lib/showcase.ts";

const KM_PER_DEG = 111.2;
// Clusters on three continents, many acts.
function items() {
  const out: { id: string; act: string; lat: number; lon: number }[] = [];
  const spots = [[40, -100], [45, -75], [52, 0], [48, 10], [-33, 151], [-27, 153], [19, 73], [22, 88]];
  let n = 0;
  for (const [lat, lon] of spots) for (let k = 0; k < 12; k++) out.push({ id: `e${n}`, act: `a${n++ % 40}`, lat: lat + ((k * 7) % 5) - 2, lon: lon + ((k * 11) % 7) - 3 });
  return out;
}

test("playOrder visits every example once, starts far west", () => {
  const list = items();
  const path = playOrder(list);
  assert.equal(new Set(path.map((p) => p.id)).size, list.length);
  assert.equal(path[0].lon, Math.min(...list.map((i) => i.lon)));
});

test("playOrder keeps hops short: median < 1,500 km", () => {
  const path = playOrder(items());
  const hops = path.slice(1).map((e, k) => angularDistanceDeg(path[k].lat, path[k].lon, e.lat, e.lon) * KM_PER_DEG).sort((a, b) => a - b);
  assert.ok(hops[Math.floor(hops.length / 2)] < 1500, `median ${hops[Math.floor(hops.length / 2)]}`);
});

test("playOrder keeps the same act ACT_GAP apart when it can", () => {
  const path = playOrder(items());
  for (let k = 0; k < path.length; k++) for (let j = k + 1; j < Math.min(path.length, k + ACT_GAP + 1); j++) assert.notEqual(path[k].act, path[j].act, `${k}/${j}`);
});

test("rotate + walk wraps without repeats", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(rotate(ids, 2), ["c", "d", "a", "b"]);
  assert.deepEqual(rotate(ids, 0), ids);
  const s = walkStart(ids, () => 0.6);
  assert.ok(s >= 0 && s < ids.length);
});
