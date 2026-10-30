import { localBudget, type Flavour, type LocalBudget } from "./budget.ts";
import { AGE_LABEL, type AudienceProfile } from "./audience.ts";
import { avoidList, avoidPrompt, type AvoidList, type Boundary, type EdgeLean } from "./sensitivity.ts";
import { slotFor, type SlotDef } from "./slots.ts";
import type { Tone } from "../places/types.ts";

// Performance context (PLAN §18 Q15): one object every idea / set / prep path reads.
// Client-safe; the demographics fetch lives in audience.server.ts.
export * from "./slots.ts";
export * from "./budget.ts";
export * from "./audience.ts";
export * from "./sensitivity.ts";
export { REGIONS, countryOf, regionPolicy, type RegionNote, type RegionPolicy, type TopicId } from "./regions.ts";

export type PerformanceContext = { kind: string; slot: SlotDef; budget: LocalBudget; avoid: AvoidList; audience?: AudienceProfile };

export function performanceContext(opts: {
  kind: string;
  slot?: string;
  size?: number; // override minutes / pieces / courses
  flavour?: Flavour;
  boundaries?: Boundary[];
  place?: { country?: string; query?: string; name?: string; region?: string } | string;
  taste?: EdgeLean;
  tone?: Tone; // place features (places/): extra avoid topics + advice where open data says be careful
  audience?: AudienceProfile;
  nodMinutes?: number;
}): PerformanceContext {
  const slot = slotFor(opts.kind, opts.slot, opts.size);
  return {
    kind: opts.kind,
    slot,
    budget: localBudget(slot, opts.flavour, opts.nodMinutes),
    avoid: avoidList(opts.kind, opts.place, opts.boundaries, opts.taste, opts.tone),
    audience: opts.audience,
  };
}

// Prompt fragment for AI writers: the slot, the originality rule, the audience and the avoid list.
export function contextPrompt(ctx: PerformanceContext): string {
  const unit = ctx.slot.unit === "minutes" ? "min" : ctx.slot.unit;
  const b = ctx.budget;
  const lines = [
    `Slot: ${ctx.slot.label} (${ctx.slot.size} ${unit}). ${ctx.slot.note}`,
    `Originality first: the act's own material leads. Suggest at most ${b.max} local touch${b.max === 1 ? "" : "es"} in total${b.maxMinutes ? ` (about ${b.maxMinutes} min)` : ""}; frame each as "keep your set, add this".${b.mode === "shared" ? " This is a shared bill: prefer nods both audiences know." : b.mode === "host" ? " You are hosting: talking to the room is the job, but keep it short between acts." : ""}`,
  ];
  const a = ctx.audience;
  if (a?.ages.length) lines.push(`Audience: skews ${a.skew === "even" ? "across ages" : a.skew} (most over-represented: ${a.ages.map((k) => AGE_LABEL[k]).join(", ")}); pick references this age group knows.`);
  lines.push(avoidPrompt(ctx.avoid));
  return lines.join("\n");
}
