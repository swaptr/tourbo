import { z } from "zod";

import { Basis, PerformerKind } from "../shared/types.ts";
import { migrate } from "./rules.ts";

// The act profile (PLAN Q21): who the act is, asked once. Client-safe (types + rules); the DB
// side is profiles.server.ts. Every field is optional: onboarding can be skipped, and each action
// asks only for what it needs (REQUIRED below).

const Chip = z.object({ id: z.string(), name: z.string(), type: z.string().optional() });
export const Home = z.object({ name: z.string().min(1), lat: z.number(), lon: z.number() });
export type Home = z.infer<typeof Home>;

const Fields = z.object({
  name: z.string().trim().max(120).optional(),
  // Multi-talented acts: every kind they do, the first is the main one. Each tour or event
  // carries its own kind (TourParams.kind); this only pre-picks it.
  kinds: z.array(PerformerKind).max(18).default([]),
  listed: z.boolean().default(true), // the name matched the fan data and the act kept it
  basis: Basis.optional(), // unlisted: what plans are built from (peers | styles | city)
  peers: z.array(Chip).max(3).default([]),
  styles: z.array(Chip).max(3).default([]),
  home: Home.optional(),
});
export const ProfileFields = z.preprocess(migrate, Fields);
export type ProfileFields = z.infer<typeof Fields>;
export type Profile = ProfileFields & { id?: string; updatedAt?: string };

// The rules (fields, gates, the loose reader) live in rules.ts, free of the validation library,
// so the header and home page can use them without loading it.
export * from "./rules.ts";

// Read anything stored (old single-kind shape included) as a profile; undefined when unusable.
export function readProfile(raw: unknown): Profile | undefined {
  const parsed = ProfileFields.safeParse(raw);
  if (!parsed.success) return undefined;
  const o = raw as { id?: unknown; updatedAt?: unknown };
  return { ...parsed.data, id: typeof o.id === "string" ? o.id : undefined, updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined };
}
