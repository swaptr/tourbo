import { z } from "zod";

// Shared between server/core and app/ (no server-only imports here).

// Money/cost profiles. A city's region comes from its country (world cities) or the seed list.
export const Region = z.enum(["na", "eu", "in", "latam", "africa", "asia", "oceania"]);
export type Region = z.infer<typeof Region>;

export const REGION_NAMES: Record<Region, string> = {
  na: "North America",
  eu: "Europe",
  in: "India",
  latam: "Latin America",
  africa: "Africa",
  asia: "Asia",
  oceania: "Oceania",
};

// Discipline keys; profiles (entity types, spaces, prices, prep) live in disciplines/index.ts.
export const PerformerKind = z.enum([
  "musician", "comedian", "dj", "dancer", "poet", "visual_artist", "author", "podcaster",
  "speaker", "magician", "theatre", "photographer", "maker", "busker", "circus", "chef", "filmmaker", "teacher",
]);
export type PerformerKind = z.infer<typeof PerformerKind>;

const list = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.string()).default([]),
);

// Money inputs for the show-economics model; all optional, regional defaults apply.
export const MoneyParams = z.object({
  ticketPrice: z.coerce.number().positive().optional(), // local currency; omitted = optimise
  promoBudget: z.coerce.number().nonnegative().optional(), // whole tour
  minGuarantee: z.coerce.number().nonnegative().optional(), // per show, for negotiation
  minDoorSplit: z.coerce.number().min(0).max(1).optional(), // artist share of net door, for negotiation
  crew: z.coerce.number().int().min(1).max(20).optional(), // people travelling
});
export type MoneyParams = z.infer<typeof MoneyParams>;

// "Where": a point on the map and a radius; candidate cities are the seed cities inside it.
export const Area = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(50).max(5000),
});
export type Area = z.infer<typeof Area>;

// What a plan's fan signal comes from: the act itself, acts it sounds like, a style, or just the area.
export const Basis = z.enum(["act", "peers", "styles", "city"]);
export type Basis = z.infer<typeof Basis>;

export const TourParams = z.object({
  artist: z.string().min(1),
  kind: PerformerKind.default("musician"),
  // "Sounds like": comparable acts blended into the fan signal (unknown or thin acts).
  peers: list,
  notInQloo: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false), // "Not me" in onboarding
  // Unlisted acts: genre/scene names or urn:tag ids ("My style is…"), and what the plan is built from.
  styles: list.optional(),
  basis: z.preprocess((v) => (v === "" ? undefined : v), Basis.optional()),
  region: Region.default("na"),
  homeBase: z.string().optional(),
  area: Area.optional(),
  // A one-off event (PLAN Q21) is one night; a tour is two or more.
  shows: z.coerce.number().int().min(1).max(20).default(8),
  mode: z.enum(["tour", "event"]).optional(),
  startDate: z.iso.date(),
  endDate: z.iso.date().optional(),
  roomMin: z.coerce.number().int().positive().default(200),
  roomMax: z.coerce.number().int().positive().default(800),
  money: MoneyParams.default({}),
  // Jobs the agent does on the act's behalf once the plan is ready.
  jobs: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.enum(["prep", "outreach"])).default(["prep"]),
  ),
});
export type TourParams = z.infer<typeof TourParams>;

export const Artist = z.object({
  id: z.string(),
  name: z.string(),
  kind: PerformerKind.default("musician"),
  // Comparable acts whose fans are blended into the heatmap signal.
  peers: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  popularity: z.number().optional(),
  image: z.string().optional(),
  tags: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  basis: Basis.optional(),
  styles: z.array(z.object({ id: z.string(), name: z.string() })).optional(), // style tags behind basis "styles"
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
  fanIndex: z.number().optional(), // Σ affinity × popularity over heatmap cells (relative demand)
  // The score's two parts, 0–100 across the candidate set: score = 60% reach + 40% lean.
  reach: z.number().optional(), // how many fans (log footprint)
  lean: z.number().optional(), // how strongly the city leans to the act (mean affinity rank)
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
  // local = the city's own favourite acts that share the headliner's audience; similar = global look-alikes
  source: z.enum(["local", "similar"]).default("similar"),
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
  source: z.enum(["heatmap", "venue", "fanTaste", "cityCulture", "localSpots", "opener", "sponsors", "localArtists"]),
  ref: z.string(), // exact Qloo item name (or metric) the claim rests on
  value: z.string().optional(), // the Qloo number quoted, e.g. "affinity 0.94"
});
export type Evidence = z.infer<typeof Evidence>;

// Show economics for one stop. Every figure is an estimate (Qloo has no capacity/price/sales).
export const ShowMoney = z.object({
  verdict: z.enum(["headline", "co-headline", "support slot", "skip"]),
  why: z.string(),
  currency: z.string(),
  deal: z.string(),
  price: z.number(),
  capacity: z.number(),
  room: z.string().optional(),
  guarantee: z.number().optional(),
  tickets: z.number(),
  sellThrough: z.number(),
  gross: z.number(),
  artistTake: z.number(),
  costs: z.number(),
  profit: z.number(),
  breakEvenPrice: z.number().optional(),
  promo: z.number().optional(),
  sponsor: z.number().optional(),
  relDemand: z.number(),
  draw: z.number(),
  basis: z.string(),
  reason: z.string().optional(), // the agent's note when it overrides the model's pick
  // Place features moved the reference ticket (PLAN §18 Q18): factor × the region's usual ticket,
  // note = "price nudged −10% for local incomes".
  priceNudge: z.object({ factor: z.number(), elasticity: z.number().optional(), note: z.string() }).optional(),
  estimate: z.literal(true).default(true),
});
export type ShowMoney = z.infer<typeof ShowMoney>;

// Place features for one night (PLAN §18 Q18, packages/core/src/places/): open-data facts that
// sharpen fan-data suggestions. Only `surfaced` ones change a suggestion; `facts` feed "why?".
// dateRisk is the night card's warning chip (holiday / usual weather on the show date).
export const PlaceNotes = z.object({
  surfaced: z.array(z.string()).default([]),
  changes: z.record(z.string(), z.string()).default({}),
  facts: z.array(z.object({ id: z.string(), text: z.string(), refs: z.array(z.string()), strength: z.enum(["strong", "weak"]), source: z.string() })).default([]),
  priceNudge: z.object({ factor: z.number(), elasticity: z.number(), incomeRatio: z.number(), anchor: z.string().optional() }).optional(),
  youngerCrowd: z.object({ score: z.number(), skew: z.enum(["younger", "older", "even"]), fromFanData: z.boolean() }).optional(),
  tone: z.object({ points: z.number(), strictness: z.enum(["standard", "careful", "strict"]), addTopics: z.array(z.enum(["religion", "politics", "head_of_state"])), advice: z.array(z.string()) }).optional(),
  dateRisk: z
    .object({ level: z.enum(["low", "medium", "high"]), reasons: z.array(z.string()), holidays: z.array(z.object({ date: z.string(), name: z.string(), national: z.boolean() })) })
    .optional(),
  spendHeadroom: z.object({ share: z.number(), relative: z.number(), level: z.enum(["tight", "ok", "roomy"]), spendUsd: z.number(), monthlyIncomeUsd: z.number() }).optional(),
});
export type PlaceNotes = z.infer<typeof PlaceNotes>;

export const Access = z.object({
  nearestStation: z.object({ name: z.string(), km: z.number(), kind: z.string() }).optional(),
  nearestAirport: z.object({ name: z.string(), km: z.number(), kind: z.string() }).optional(),
  transitStops800m: z.number().optional(),
  parking500m: z.number().optional(),
  score: z.number(),
  source: z.string(),
});
export type Access = z.infer<typeof Access>;

export const PromoTarget = z.object({ geohash: z.string(), lat: z.number(), lon: z.number(), radiusKm: z.number() });

export const CityPlan = z.object({
  city: City,
  score: z.number(),
  fanIndex: z.number().optional(),
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
  money: ShowMoney.optional(),
  sponsors: z.array(Reference).optional(), // city brands ranked by the act's fans
  localArtists: z.array(Reference).optional(),
  access: Access.optional(), // venue access (OpenStreetMap)
  promo: z.object({ spend: z.number(), targets: z.array(PromoTarget), why: z.string() }).optional(),
  place: PlaceNotes.optional(), // open-data place features for this city and date (PLAN §18 Q18)
  // "Your pick" (PLAN Q19): the act changed this night; Tourbo's own suggestion stays for reference.
  yours: z
    .object({
      changed: z.array(z.enum(["city", "venue", "date", "order", "added", "price", "room"])),
      suggested: z.object({ city: z.string(), venue: z.string().optional(), profit: z.number().optional() }).optional(),
    })
    .optional(),
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
  // Tour P&L (estimate) over the stops that are played.
  money: z
    .object({ currency: z.string(), gross: z.number(), artistTake: z.number(), costs: z.number(), profit: z.number(), promoBudget: z.number().optional() })
    .optional(),
  medianFanIndex: z.number().optional(),
  basis: Basis.optional(),
  edited: z.number().optional(), // PLAN Q19: version of the act's edits applied on top of Tourbo's plan
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
  offer?: unknown; // negotiation state (apps/web outreach OfferState)
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
