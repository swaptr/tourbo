import { z } from "zod";

// Shared between server/core and app/ (no server-only imports here).

export const Region = z.enum(["na", "in"]);
export type Region = z.infer<typeof Region>;

export const TourParams = z.object({
  artist: z.string().min(1),
  region: Region.default("na"),
  homeBase: z.string().optional(),
  shows: z.coerce.number().int().min(2).max(20).default(8),
  startDate: z.iso.date(),
  endDate: z.iso.date().optional(),
  roomMin: z.coerce.number().int().positive().default(200),
  roomMax: z.coerce.number().int().positive().default(800),
});
export type TourParams = z.infer<typeof TourParams>;

export const Artist = z.object({
  id: z.string(),
  name: z.string(),
  popularity: z.number().optional(),
  image: z.string().optional(),
  tags: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
});
export type Artist = z.infer<typeof Artist>;

export const City = z.object({
  name: z.string(),
  query: z.string().optional(), // Qloo locality query when the bare name is ambiguous
  region: Region,
  lat: z.number(),
  lon: z.number(),
});
export type City = z.infer<typeof City>;

export const Hotspot = z.object({
  geohash: z.string(),
  lat: z.number(),
  lon: z.number(),
  affinity: z.number(),
  popularity: z.number(),
});
export type Hotspot = z.infer<typeof Hotspot>;

export const CityScore = z.object({
  city: City,
  score: z.number(), // 0–100, normalized across the candidate set
  cells: z.number(),
  hotspots: z.array(Hotspot),
  thinData: z.boolean(),
});
export type CityScore = z.infer<typeof CityScore>;

export const Venue = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  popularity: z.number().optional(),
  affinity: z.number().optional(),
  tag: z.string(),
  neighborhood: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  foundBy: z.string(), // repair-chain step that found it, e.g. "hotspot 1500m"
});
export type Venue = z.infer<typeof Venue>;

export const Opener = z.object({
  id: z.string(),
  name: z.string(),
  popularity: z.number().optional(),
  affinity: z.number().optional(),
  localCells: z.number(), // heatmap presence in the city
});
export type Opener = z.infer<typeof Opener>;

export const Reference = z.object({
  name: z.string(),
  type: z.string(), // tv_show | podcast | brand | person | movie | place
  affinity: z.number().optional(),
  popularity: z.number().optional(),
});
export type Reference = z.infer<typeof Reference>;

// Raw material for promo angles (and later set notes): every item is a Qloo result.
export const AngleFacts = z.object({
  fanTaste: z.array(Reference), // what this artist's fans love (global)
  cityCulture: z.array(Reference), // what this city loves (location-only signal)
  localSpots: z.array(Reference), // places in this city weighted by the artist's fans
});
export type AngleFacts = z.infer<typeof AngleFacts>;

export const Evidence = z.object({
  claim: z.string(),
  source: z.enum(["heatmap", "venue", "fanTaste", "cityCulture", "localSpots", "opener"]),
  ref: z.string(), // exact Qloo item name (or metric) the claim rests on
  value: z.string().optional(), // the Qloo number quoted, e.g. "affinity 0.94"
});
export type Evidence = z.infer<typeof Evidence>;

export const CityPlan = z.object({
  city: City,
  score: z.number(),
  date: z.iso.date().optional(),
  hotspots: z.array(Hotspot),
  venue: Venue.optional(),
  backupVenue: Venue.optional(),
  opener: Opener.optional(),
  facts: AngleFacts.optional(),
  angle: z.string().optional(),
  capacity: z
    .object({ min: z.number(), max: z.number(), estimate: z.literal(true) })
    .optional(), // Qloo has no capacity field; LLM estimate, always labelled
  fit: z.string().optional(),
  evidence: z.array(Evidence).default([]),
  thinData: z.boolean(),
});
export type CityPlan = z.infer<typeof CityPlan>;

export const Leg = z.object({ from: z.string(), to: z.string(), km: z.number() });
export type Leg = z.infer<typeof Leg>;

export const Plan = z.object({
  artist: Artist,
  params: TourParams,
  stops: z.array(CityPlan),
  legs: z.array(Leg),
  totalKm: z.number(),
  summary: z.string().optional(),
});
export type Plan = z.infer<typeof Plan>;

// Qloo-OFF plan: same model, same request, no tools. Shown next to the real plan.
export const Baseline = z.object({
  stops: z.array(
    z.object({
      city: z.string(),
      venue: z.string(),
      opener: z.string().nullable(),
      why: z.string(),
    }),
  ),
  summary: z.string(),
});
export type Baseline = z.infer<typeof Baseline>;

export const OutreachStatus = z.enum(["drafted", "sent", "interested", "hold", "passed", "confirmed"]);
export type OutreachStatus = z.infer<typeof OutreachStatus>;

export type Outreach = {
  id: string;
  runId: string;
  stopIndex: number;
  city: string;
  venueId: string;
  venueName: string;
  status: OutreachStatus;
  subject: string;
  draft: string;
  lastReply: string | null;
  replySummary: string | null;
  updatedAt: string;
};

export const TraceKind = z.enum([
  "thinking_summary",
  "tool_call",
  "qloo_call",
  "repair",
  "critic",
  "decision",
]);

export const TraceEvent = z.object({
  seq: z.number().int(),
  kind: TraceKind,
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  at: z.iso.datetime(),
});
export type TraceEvent = z.infer<typeof TraceEvent>;

// Name to send as `filter.location.query` / `signal.location.query`.
export const locationQuery = (city: City) => city.query ?? city.name;
