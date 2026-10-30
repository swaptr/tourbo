// Output schemas (MCP `outputSchema`, checked against `structuredContent` by the SDK and by
// clients). Loose objects: the named fields are guaranteed, extra fields may appear as the
// engine grows, so a newer server never fails an older client's validation. Numbers that come
// from fan data may be missing or null.
import { z } from "zod";

export const obj = z.looseObject;
export const num = z.number().nullish();
export const str = z.string().nullish();

export const Reference = obj({ name: z.string(), type: z.string(), affinity: num, popularity: num });
export const Hotspot = obj({ geohash: z.string(), lat: z.number(), lon: z.number(), affinity: num, popularity: num });
export const Opener = obj({ id: z.string(), name: z.string(), affinity: num, popularity: num, localCells: num, source: str });
export const Issue = obj({ city: str, kind: z.string(), detail: z.string() });
export const NotFound = { found: z.boolean().optional().describe("false = nothing matched; read hint"), hint: str };

export const CityScoreRow = obj({
  city: z.string(),
  lat: num,
  lon: num,
  score: z.number().describe("0–100 within this call"),
  reach: num,
  lean: num,
  heatmapCells: z.number(),
  fanIndex: num,
  thinData: z.boolean(),
  hotspots: z.array(Hotspot).optional().describe("Top fan hotspots (max 3); only for shortlisted cities unless detail:true"),
});

export const DetailVenue = obj({
  id: z.string(),
  name: z.string(),
  roomType: z.string(),
  defaultCapacityEstimate: z.number(),
  neighborhood: str,
  address: str,
  lat: num,
  lon: num,
  affinity: num,
  popularity: num,
  foundBy: z.string(),
  description: str,
});

export const Outcome = obj({
  scenario: obj({ deal: z.string(), price: z.number(), capacity: z.number() }),
  tickets: z.number(),
  sellThrough: z.number(),
  gross: z.number(),
  artistTake: z.number(),
  costs: z.number(),
  profit: z.number(),
});
export const Money = obj({
  verdict: z.enum(["headline", "co-headline", "support slot", "skip"]),
  why: z.string(),
  currency: z.string(),
  best: Outcome,
});

export const PlanStop = obj({
  city: obj({ name: z.string(), region: z.string(), lat: z.number(), lon: z.number() }),
  score: z.number(),
  date: str,
  fanIndex: num,
  hotspots: z.array(Hotspot),
  venue: obj({ id: z.string(), name: z.string() }).optional(),
  backupVenue: obj({ id: z.string(), name: z.string() }).optional(),
  opener: Opener.optional(),
  thinData: z.boolean(),
  money: Money.optional(),
});
export const Plan = obj({
  artist: obj({ id: z.string(), name: z.string(), kind: z.string() }),
  params: obj({ region: z.string(), shows: z.number(), startDate: z.string() }),
  stops: z.array(PlanStop),
  legs: z.array(obj({ from: z.string(), to: z.string(), km: z.number() })),
  totalKm: z.number(),
});

export const Idea = obj({
  idea: z.string(),
  category: z.string(),
  ref: z.string().describe("Exact fan-data name; cite only refs"),
  type: z.string(),
  value: z.number(),
  why: z.string(),
  angle: z.string(),
  question: str,
  cities: z.array(z.string()).optional(),
  rank: num,
  local: z.boolean().optional(),
});
export const IdeasResult = obj({
  kind: z.string(),
  basis: z.enum(["act", "city"]),
  basisLine: z.string(),
  cities: z.array(obj({ city: z.string(), ideas: z.array(Idea), spare: z.array(Idea).optional(), empty: str, avoided: num })),
  region: z.array(obj({ ref: z.string(), idea: z.string(), category: z.string(), best: z.array(obj({ city: z.string(), value: z.number() })), skip: z.array(z.string()), line: z.string() })),
  partial: z.boolean(),
  label: z.string(),
  frame: z.string(),
});

const SetEntry = obj({ item: num, title: z.string(), tag: str, minutes: z.number(), fit: num, move: z.string(), reason: z.string(), refs: z.array(z.string()) });
export const SetResult = obj({
  kind: z.string(),
  slot: z.string(),
  slotLabel: z.string(),
  flavour: z.string(),
  items: z.number(),
  suggestedStyles: z.array(z.string()),
  cities: z.array(
    obj({
      city: z.string(),
      facts: z.array(obj({ name: z.string(), kind: z.string(), detail: z.string(), value: num })),
      order: z.array(SetEntry).describe("Running order: every item exactly once, plus local moves"),
      coverIdeas: z.array(obj({ artist: z.string(), why: z.string(), angle: z.string(), cityRank: z.number(), affinity: num })),
      crowdWork: z.array(z.string()),
      length: obj({ total: z.number(), target: z.number(), verdict: z.enum(["over", "short", "ok"]), note: z.string() }),
      weakSpot: obj({ item: z.number(), title: z.string(), reason: z.string(), refs: z.array(z.string()) }).optional(),
      local: obj({ used: z.number() }),
    }),
  ),
});

const PlaceFact = obj({ id: z.string(), text: z.string(), refs: z.array(z.string()), strength: z.enum(["strong", "weak"]), source: z.string() });
export const PlacesResult = obj({
  places: z.array(
    z.union([
      obj({ city: z.string(), error: z.string() }),
      obj({
        place: obj({ name: z.string() }),
        features: obj({}),
        derived: obj({}),
        surfaced: z.array(z.string()),
        changes: z.record(z.string(), z.string()),
        facts: z.array(PlaceFact),
        missing: z.array(z.string()),
      }),
    ]),
  ),
  note: z.string(),
});
