import type { PlaceNotes } from "../shared/types.ts";
import { placeFeatures, type PlaceInput, type PlaceOptions } from "./index.server.ts";
import type { FetchJson } from "./live.server.ts";
import type { PlaceFeatures } from "./types.ts";

// Engine hook-ups for place features (PLAN §18 Q18): plan nights, show economics, set and avoid
// list read these. Static features (price nudge, younger crowd, tone) come from committed
// snapshots, so `staticPlace` makes no network call; `placeNotes` adds the live, date-dependent
// ones (holidays, usual weather) with the live layer's short timeouts. Neither ever throws.

const OFFLINE: FetchJson = () => Promise.reject(new Error("offline"));

export async function staticPlace(city: PlaceInput, opts: Omit<PlaceOptions, "fetch"> = {}): Promise<PlaceFeatures | undefined> {
  try {
    return await placeFeatures(city, [], { ...opts, fetch: OFFLINE });
  } catch {
    return undefined;
  }
}

// Plan JSON shape (shared/types.ts PlaceNotes): derived features + surfaced facts only.
export function toPlaceNotes(pf: PlaceFeatures): PlaceNotes {
  return { surfaced: pf.surfaced, changes: pf.changes as Record<string, string>, facts: pf.facts, ...pf.derived };
}

export async function placeNotes(city: PlaceInput, dates: string[] = [], opts: PlaceOptions = {}): Promise<PlaceNotes | undefined> {
  try {
    return toPlaceNotes(await placeFeatures(city, dates, opts));
  } catch {
    return undefined;
  }
}

// Economics inputs from a place: the nudge applies only when it surfaces (changes the price).
export function priceAdjust(notes?: Pick<PlaceNotes, "surfaced" | "priceNudge">): { priceFactor?: number; elasticity?: number } {
  const p = notes?.priceNudge;
  if (!p || !notes.surfaced.includes("priceNudge")) return {};
  return { priceFactor: p.factor, elasticity: p.elasticity };
}
