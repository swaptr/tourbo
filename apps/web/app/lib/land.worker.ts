// Zoom patch of fine coastlines (world-atlas land-50m), painted off the main thread. The globe
// posts the file URL and colours once, then a box per repaint; this paints it into an
// OffscreenCanvas and returns an ImageBitmap (transferred). Painting 50m land plus the canvas →
// texture readback took 350–450 ms in the frame when done on the main thread.
import * as topo from "topojson-client";

type Box = { lat0: number; lon0: number; latSpan: number; lonSpan: number };
type Poly = { rings: number[][][]; polar: boolean; w: number; e: number; s: number; n: number };
type In =
  | { t: "init"; url: string; ocean: string; land: string; coast: string; px: number }
  | { t: "paint"; id: number; box: Box; coastPx: number };

let polys: Promise<Poly[]> | undefined;
let colors = { ocean: "#000", land: "#fff", coast: "#888" };
let canvas: OffscreenCanvas | undefined;

const unwrap = (ring: number[][]) => {
  let offset = 0;
  return ring.map(([lon, lat], i) => {
    if (i > 0) {
      const prev = ring[i - 1][0];
      if (lon - prev > 180) offset -= 360;
      else if (prev - lon > 180) offset += 360;
    }
    return [lon + offset, lat];
  });
};
async function load(url: string): Promise<Poly[]> {
  const topology = await fetch(url).then((r) => r.json());
  const fc = topo.feature(topology, topology.objects.land) as unknown as { features?: { geometry: { type: string; coordinates: unknown } }[] };
  const raw: number[][][][] = [];
  for (const f of fc.features ?? [fc as unknown as { geometry: { type: string; coordinates: unknown } }]) {
    if (f.geometry.type === "Polygon") raw.push(f.geometry.coordinates as number[][][]);
    else if (f.geometry.type === "MultiPolygon") raw.push(...(f.geometry.coordinates as number[][][][]));
  }
  return raw.map((poly) => {
    const rings = poly.map(unwrap);
    let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
    for (const [lon, lat] of rings[0]) (w = Math.min(w, lon)), (e = Math.max(e, lon)), (s = Math.min(s, lat)), (n = Math.max(n, lat));
    return { rings, polar: s < -85, w, e, s, n };
  });
}
// Same drawing as the globe's own land painter (ocean fill, land fill, coast stroke).
function paint(c: OffscreenCanvasRenderingContext2D, list: Poly[], box: Box, coastPx: number) {
  const W = c.canvas.width, H = c.canvas.height;
  c.fillStyle = colors.ocean;
  c.fillRect(0, 0, W, H);
  c.fillStyle = colors.land;
  c.strokeStyle = colors.coast;
  c.lineWidth = coastPx;
  c.lineJoin = "round";
  const south = box.lat0 - box.latSpan, east = box.lon0 + box.lonSpan;
  for (const p of list) {
    if (p.n < south || p.s > box.lat0) continue;
    for (const shift of [-360, 0, 360]) {
      if (p.e + shift < box.lon0 || p.w + shift > east) continue;
      c.beginPath();
      for (const ring of p.rings) {
        ring.forEach(([lon, lat], i) => {
          const x = ((lon + shift - box.lon0) / box.lonSpan) * W, y = ((box.lat0 - lat) / box.latSpan) * H;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        });
        c.closePath();
      }
      c.fill("evenodd");
      if (!p.polar) c.stroke();
    }
  }
}

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.t === "init") {
    colors = { ocean: m.ocean, land: m.land, coast: m.coast };
    canvas = new OffscreenCanvas(m.px, m.px);
    polys = load(m.url);
    return;
  }
  try {
    const list = await polys!;
    const c = canvas!.getContext("2d")!;
    paint(c, list, m.box, m.coastPx);
    // Flipped here so the texture uploads with flipY off (ImageBitmaps ignore UNPACK_FLIP_Y).
    const bmp = await createImageBitmap(canvas!, { imageOrientation: "flipY" });
    (self as unknown as Worker).postMessage({ id: m.id, box: m.box, bmp }, [bmp]);
  } catch {
    (self as unknown as Worker).postMessage({ id: m.id });
  }
};
