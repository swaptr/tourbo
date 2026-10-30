// Order of the home examples: one geographic path through every example, so each advance hops to a
// neighbour (US → US → Canada …) instead of across the world. Greedy nearest neighbour from the far
// west (west hops cost ×1.3), the same act kept ≥ ACT_GAP steps apart, then 2-opt. The static export is already written in this order
// (apps/web/scripts/export-examples.ts); the dev (DB-backed) home sorts with playOrder() here.
// The client picks a random start once per session and walks the path, wrapping at the end, so no
// example repeats before every one has been shown.
// Pure apart from the sessionStorage helpers at the bottom; unit-tested.
import { angularDistanceDeg, lonDelta } from "./globe-model.ts";

export const ACT_GAP = 20;

export type PathItem = { act: string; lat: number; lon: number };

export const WEST_PENALTY = 1.3;
// Hop cost: great-circle distance, ×WEST_PENALTY when it steps west (against the globe's spin).
const hop = (a: PathItem, b: PathItem) => angularDistanceDeg(a.lat, a.lon, b.lat, b.lon) * (lonDelta(a.lon, b.lon) < 0 ? WEST_PENALTY : 1);
const gapOk = (path: PathItem[], from: number, to: number) => {
  for (let k = Math.max(0, from - ACT_GAP); k <= Math.min(path.length - 1, to + ACT_GAP); k++)
    for (let j = k + 1; j <= Math.min(path.length - 1, k + ACT_GAP); j++) if ((k >= from && k <= to) || (j >= from && j <= to)) if (path[k].act === path[j].act) return false;
  return true;
};

// Same algorithm as the export (apps/web/scripts/export-examples.ts): greedy from the far west
// with the act gap, then 2-opt passes that keep the gap.
export function playOrder<T extends PathItem>(list: readonly T[]): T[] {
  if (!list.length) return [];
  const left = [...list];
  let path: T[] = [];
  let at = left.reduce((w, e) => (e.lon < w.lon ? e : w), left[0]);
  while (left.length) {
    const recent = new Set(path.slice(-ACT_GAP).map((e) => e.act));
    const pool = left.filter((e) => !recent.has(e.act));
    const next = (pool.length ? pool : left).reduce((b, e) => (hop(at, e) < hop(at, b) ? e : b));
    path.push(next);
    left.splice(left.indexOf(next), 1);
    at = next;
  }
  // 2-opt without copying: forward (F) and backward (B) prefix sums give a reversed stretch's cost
  // in O(1); hops are asymmetric (west costs more), so the reversed inside uses B.
  const n = path.length;
  const F = new Float64Array(n), B = new Float64Array(n);
  const sums = () => {
    for (let k = 1; k < n; k++) (F[k] = F[k - 1] + hop(path[k - 1], path[k])), (B[k] = B[k - 1] + hop(path[k], path[k - 1]));
  };
  sums();
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    for (let i = 0; i < n - 2; i++)
      for (let j = i + 2; j < n - 1; j++) {
        const before = F[j + 1] - F[i];
        const after = hop(path[i], path[j]) + (B[j] - B[i + 1]) + hop(path[i + 1], path[j + 1]);
        if (after >= before - 0.01) continue; // ~1 km
        const next = [...path.slice(0, i + 1), ...path.slice(i + 1, j + 1).reverse(), ...path.slice(j + 1)];
        if (!gapOk(next, i + 1, j)) continue;
        path = next;
        sums();
        improved = true;
      }
  }
  return path;
}

// Rotate the path so the walk starts at `start` (an index into it); wrapping is then index + 1 mod n.
export const rotate = <T>(list: readonly T[], start: number): T[] => (list.length ? [...list.slice(start % list.length), ...list.slice(0, start % list.length)] : []);

// Where this session's walk starts: right after the last example shown this session (a reload keeps
// walking forward), else a random point on the path, picked once.
const KEY = "tourbo.walk";
export function walkStart(ids: readonly string[], rand: () => number = Math.random): number {
  if (!ids.length) return 0;
  try {
    const last = sessionStorage.getItem(KEY);
    const k = last ? ids.indexOf(last) : -1;
    if (k >= 0) return (k + 1) % ids.length;
  } catch {}
  return Math.floor(rand() * ids.length);
}
export function markShown(id: string) {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    // storage off: the walk still works for this visit
  }
}
