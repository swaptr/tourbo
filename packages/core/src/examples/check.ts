import type { HomeExample } from "./types.ts";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The words must match the numbers: "skip/cut <city>" or "<city> loses" only when that night
// actually loses money. Returns the problem, or undefined when the example is consistent.
export function headlineMismatch(ex: HomeExample): string | undefined {
  const c = ex.compare;
  if (!c || c.skipped.profit < 0) return undefined;
  const name = esc(c.skipped.name);
  const text = [ex.decision.headline, ...ex.decision.lines, c.line].join(" ");
  if (new RegExp(`\\b(skip|cut|drop)\\s+${name}\\b|\\b${name}\\b[^.;]*\\bloses?\\b`, "i").test(text)) return `says skip/loses ${c.skipped.name}, but that night makes ${c.skipped.profit} ${c.currency}`;
  return undefined;
}

// Money words must match money numbers: no "$-…" strings, no negative delta called "more", and a
// chosen city that earns less than the skipped one needs a stated reason.
export function compareMismatch(ex: HomeExample): string | undefined {
  const text = [ex.decision.headline, ...ex.decision.lines, ex.compare?.line ?? "", ex.losingNight?.line ?? ""].join(" ");
  if (/[$€£₹]\s?-|\b[A-Z]{2,3}\$?\s?-\d|~-\d/.test(text)) return `negative amount written as "-": ${text.match(/.{0,20}[$€£₹]\s?-.{0,10}/)?.[0] ?? ""}`;
  const c = ex.compare;
  if (!c) return undefined;
  const delta = c.chosen.profit - c.skipped.profit;
  if (delta < 0 && /more per night/.test(text)) return `says "more per night" but ${c.chosen.name} earns ${-delta} less than ${c.skipped.name}`;
  if (delta < 0 && !c.reason) return `${c.chosen.name} earns less than ${c.skipped.name} and no reason is given`;
  return undefined;
}

export const exampleProblem = (ex: HomeExample) => headlineMismatch(ex) ?? compareMismatch(ex);
