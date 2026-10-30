// Terrain off the main thread. The globe posts the land polygons once, then bake jobs: an example's
// fan points (flat Float64Array [lat, lon, weight, …], transferred) and its bake options (terrainSpec,
// minus the land). The worker land-clips, bakes (bakeTerrain), adds the relief shading (lee shadow +
// AO) and transfers the maps back (8-bit and half-float heights, shading), the peak and the bake ms.
// Scheduling: jobs queue here and run one per task, so messages that arrive meanwhile are seen
// between jobs. "now" jobs (the example being shown) run before "idle" ones (prebakes of the next
// examples in play order), then "low" ones (flat neighbour surfaces); a newer "now" job cancels any older one still queued (the user jumped),
// "cancel" drops queued jobs by id, and "promote" turns a queued prebake into a "now" job.
import type { BakeJob, BakeIn, BakeOut } from "./globe-model.ts";
import { bakeTerrain, reliefShade, type LandPoly } from "./globe-model.ts";

let land: LandPoly[] | undefined;
const queue: BakeJob[] = [];
let scheduled = false;
const send = (m: BakeOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

function pump() {
  scheduled = false;
  const rank = { now: 0, idle: 1, low: 2 } as const;
  let i = -1;
  for (let k = 0; k < queue.length; k++) if (i < 0 || rank[queue[k].prio] < rank[queue[i].prio]) i = k;
  const job = queue.splice(Math.max(0, i), 1)[0];
  if (!job) return;
  try {
    const t = performance.now();
    const { width: w, height: h } = job.o;
    const { h8: out, hf, f } = bakeTerrain(job.pts, { ...job.o, land });
    const shade = job.flat ? new Uint8Array(w * h).fill(255) : reliefShade(f, w, h, job.peakPx);
    let peak = 0;
    for (let k = 0; k < out.length; k++) if (out[k] > peak) peak = out[k];
    send({ id: job.id, out, hf, shade, peak, ms: performance.now() - t }, [out.buffer, hf.buffer, shade.buffer]);
  } catch {
    send({ id: job.id }); // the scene bakes this one on the main thread, in slices
  }
  schedule();
}
function schedule() {
  if (scheduled || !queue.length) return;
  scheduled = true;
  setTimeout(pump, 0);
}

self.onmessage = (e: MessageEvent<BakeIn>) => {
  const m = e.data;
  if (m.t === "land") land = m.polys;
  else if (m.t === "bake") {
    if (m.job.prio === "now")
      for (let k = queue.length - 1; k >= 0; k--) if (queue[k].prio === "now") send({ id: queue.splice(k, 1)[0].id, cancelled: true });
    queue.push(m.job);
    schedule();
  } else if (m.t === "cancel") {
    for (let k = queue.length - 1; k >= 0; k--) if (m.ids.includes(queue[k].id)) send({ id: queue.splice(k, 1)[0].id, cancelled: true });
  } else if (m.t === "promote") {
    const job = queue.find((j) => j.id === m.id);
    if (job) {
      for (let k = queue.length - 1; k >= 0; k--) if (queue[k].prio === "now" && queue[k] !== job) send({ id: queue.splice(k, 1)[0].id, cancelled: true });
      job.prio = "now";
    }
  }
};
