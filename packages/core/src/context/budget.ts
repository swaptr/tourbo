import type { SlotDef } from "./slots.ts";

// Originality budget (PLAN §18 Q15): local suggestions are seasoning, not the set. The act's own
// material always leads; Tourbo adds at most `max` local touches (a cover, a local tag, a crowd-
// work beat, a local subject on the wall). Default "touch" ≈ 1 per 25 min and ≤ 15% of the slot.
// Client-safe.

export const FLAVOURS = ["touch", "some", "lots"] as const;
export type Flavour = (typeof FLAVOURS)[number];
export const FLAVOUR_LABEL: Record<Flavour, string> = { touch: "A touch", some: "Some", lots: "Lots" };

// perMinutes: one local touch per this many minutes; share: cap on the slot's time (or pieces /
// courses) given to local touches; roleCap: hard cap for support / guest / shared slots.
const RULES: Record<Flavour, { perMinutes: number; share: number; supportCap: number; shortCap: number }> = {
  touch: { perMinutes: 25, share: 0.15, supportCap: 1, shortCap: 0 },
  some: { perMinutes: 15, share: 0.25, supportCap: 2, shortCap: 1 },
  lots: { perMinutes: 10, share: 0.4, supportCap: 3, shortCap: 1 },
};

export type LocalBudget = {
  flavour: Flavour;
  slot: string;
  max: number; // local items allowed in the order / on the wall / on the menu
  maxMinutes?: number; // for timed slots: minutes the local items may take
  share: number;
  mode: "own" | "shared" | "host"; // shared: nod to what both crowds know; host: the room is the material
  note: string; // one plain line: "Keep your set; add up to 2 local touches."
};

export const isFlavour = (v: unknown): v is Flavour => typeof v === "string" && (FLAVOURS as readonly string[]).includes(v);

// `nodMinutes`: length of one local item (a cover ≈ 4, a local tag ≈ 2). Defaults to 3.
export function localBudget(slot: SlotDef, flavour: Flavour = "touch", nodMinutes = 3): LocalBudget {
  const r = RULES[flavour];
  const mode = slot.role === "shared" || slot.role === "guest" ? "shared" : slot.role === "host" ? "host" : "own";
  let max: number;
  let maxMinutes: number | undefined;
  if (slot.unit === "minutes") {
    // Hosts talk to the room for a living: count them at twice the rate.
    const per = mode === "host" ? r.perMinutes / 2 : r.perMinutes;
    maxMinutes = Math.round(slot.size * r.share * 10) / 10;
    max = Math.min(Math.round(slot.size / per), Math.floor(maxMinutes / nodMinutes));
    if (slot.size >= 10 && max < 1) max = 1; // any real slot can carry one nod
  } else {
    max = Math.round(slot.size * r.share);
    if (slot.size >= 4 && max < 1) max = 1;
  }
  if (slot.role === "short" || (slot.unit === "minutes" && slot.size < 8)) max = Math.min(max, r.shortCap);
  if (slot.role === "support" || slot.role === "guest" || slot.role === "shared") max = Math.min(max, r.supportCap);
  max = Math.max(0, max);
  const [one, many] = slot.unit === "pieces" ? ["local subject", "local subjects"] : slot.unit === "courses" ? ["local course", "local courses"] : ["local touch", "local touches"];
  const yours = slot.unit === "pieces" ? "show" : slot.unit === "courses" ? "menu" : "set";
  const note =
    max === 0
      ? "Keep it all yours: this slot is too short for local touches."
      : `Keep your ${yours}; add ${max === 1 ? `one ${one}` : `up to ${max} ${many}`}${mode === "shared" ? " both crowds know" : ""}.`;
  return { flavour, slot: slot.key, max, maxMinutes, share: r.share, mode, note };
}

// Split ranked local ideas into the ones to use (within budget) and spares to swap in.
export function applyBudget<T>(ideas: T[], budget: Pick<LocalBudget, "max">): { use: T[]; spare: T[] } {
  return { use: ideas.slice(0, budget.max), spare: ideas.slice(budget.max) };
}
