// Encode/decode for the landing bundle's fan points (format: LandingRegionFile in ./types.ts).
// Pure and client-safe: the export encodes, the browser (and tests) decode.
import type { FanDensity, FanPoint, LandingActPoints, LandingRegionFile } from "./types.ts";

export const LANDING_Q = 100; // 0.01° and 0.01 weight steps

export function encodeAct(d: FanDensity, isThin: (p: FanPoint) => boolean, max = Infinity): LandingActPoints {
  const pts = [...d.fanPoints].sort((a, b) => b[2] - a[2]).slice(0, max);
  const out: LandingActPoints = { lat: [], lon: [], w: [], thin: [], coverage: d.coverage };
  let prevW = 0, prevThin = 0;
  pts.forEach((p, i) => {
    const w = Math.round(p[2] * LANDING_Q);
    out.lat.push(Math.round(p[0] * LANDING_Q));
    out.lon.push(Math.round(p[1] * LANDING_Q));
    out.w.push(i ? prevW - w : w); // ≥ 0: sorted strongest first, and rounding keeps the order
    prevW = w;
    if (isThin(p)) out.thin.push(i - prevThin), (prevThin = i);
  });
  return out;
}

export const encodeRegion = (acts: Record<string, LandingActPoints>): LandingRegionFile => ({ v: 1, acts });

// Points as [lat, lon, weight] (+ 1 when thin), the values the export rounded to (k / 100 exactly).
export function decodeAct(a: LandingActPoints): FanDensity {
  const n = a.lat.length;
  const thin = new Uint8Array(n);
  for (let i = 0, at = 0; i < a.thin.length; i++) thin[(at += a.thin[i])] = 1;
  const fanPoints: FanPoint[] = new Array(n);
  for (let i = 0, w = 0; i < n; i++) {
    w = i ? w - a.w[i] : a.w[0];
    const p = [a.lat[i] / LANDING_Q, a.lon[i] / LANDING_Q, w / LANDING_Q] as number[];
    if (thin[i]) p.push(1);
    fanPoints[i] = p as FanPoint;
  }
  return { fanPoints, coverage: a.coverage };
}
