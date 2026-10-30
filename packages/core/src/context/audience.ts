// Same shape as QlooParams (qloo/client.server.ts), kept local so this file stays client-safe.
type QlooParams = Record<string, string | number>;

// Audience profile (PLAN §18 Q15): age and gender skew of the act's fans and of a city, from
// Qloo `filter.type=urn:demographics` (qloo-docs demographics-use-case.md: needs
// `signal.interests.entities` and/or `signal.interests.tags`; the response has
// results.demographics[] = { entity_id, query: { age: {bucket: affinity}, gender: {male, female} } },
// affinity > 0 = over-represented). Location is not a documented signal for demographics, so a
// city's profile is the mean of its own most-followed entities' blocks (ids from a location-only
// insights call the engine already makes). Pure functions + types; the fetch is audience.server.ts.
// Client-safe (type-only import).

export const AGE_BUCKETS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];
export type DemoBlock = { entity_id: string; query: { age?: Partial<Record<AgeBucket, number>>; gender?: { male?: number; female?: number } } };

export type Skew = "younger" | "older" | "even";
export type AudienceSide = {
  age: Record<AgeBucket, number>; // mean affinity per bucket
  gender: { male: number; female: number };
  youth: number; // under-30 minus 45+ (mean); > 0.1 younger, < -0.1 older
  skew: Skew;
  top: AgeBucket; // most over-represented bucket
  blocks: number; // how many demographic blocks it is built from
};
export type AudienceProfile = {
  act?: AudienceSide;
  city?: AudienceSide;
  skew: Skew; // the room: city if known, else the act's fans
  ages: AgeBucket[]; // buckets to pass as signal.demographics.age (1–3, most over-represented)
  why: string[]; // plain lines for "why?" (numbers labelled fan data)
};

const SKEW_AT = 0.1;
const r2 = (n: number) => Math.round(n * 100) / 100;
const YOUNG: AgeBucket[] = ["24_and_younger", "25_to_29"];
const OLD: AgeBucket[] = ["45_to_54", "55_and_older"];
export const AGE_LABEL: Record<AgeBucket, string> = {
  "24_and_younger": "under 25",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

// Parse an insights response (or its demographics array) into blocks; tolerant of missing fields.
export function demoBlocks(res: unknown): DemoBlock[] {
  const r = res as { results?: { demographics?: unknown[] }; demographics?: unknown[] } | unknown[] | undefined;
  const list = Array.isArray(r) ? r : (r?.results?.demographics ?? r?.demographics ?? []);
  return list.filter((b): b is DemoBlock => !!b && typeof b === "object" && "query" in (b as object));
}

export function audienceSide(blocks: DemoBlock[]): AudienceSide | undefined {
  const usable = blocks.filter((b) => b.query?.age && Object.keys(b.query.age).length);
  if (!usable.length) return undefined;
  const mean = (f: (b: DemoBlock) => number | undefined) => r2(usable.reduce((n, b) => n + (f(b) ?? 0), 0) / usable.length);
  const age = Object.fromEntries(AGE_BUCKETS.map((k) => [k, mean((b) => b.query.age?.[k])])) as Record<AgeBucket, number>;
  const gender = { male: mean((b) => b.query.gender?.male), female: mean((b) => b.query.gender?.female) };
  const avg = (ks: AgeBucket[]) => ks.reduce((n, k) => n + age[k], 0) / ks.length;
  const youth = r2(avg(YOUNG) - avg(OLD));
  const top = AGE_BUCKETS.slice().sort((a, b) => age[b] - age[a])[0];
  return { age, gender, youth, skew: youth > SKEW_AT ? "younger" : youth < -SKEW_AT ? "older" : "even", top, blocks: usable.length };
}

const sideWhy = (who: string, s: AudienceSide) =>
  `${who}: most over-represented age ${AGE_LABEL[s.top]} (fan data ${s.age[s.top] > 0 ? "+" : ""}${s.age[s.top]}); young vs 45+ ${s.youth > 0 ? "+" : ""}${s.youth}; ${s.gender.male > s.gender.female ? "more men" : s.gender.female > s.gender.male ? "more women" : "even"} (${s.gender.male} / ${s.gender.female})`;

export function audienceProfile(opts: { act?: DemoBlock[]; city?: DemoBlock[]; cityName?: string }): AudienceProfile {
  const act = opts.act ? audienceSide(opts.act) : undefined;
  const city = opts.city ? audienceSide(opts.city) : undefined;
  const room = city ?? act;
  const ages = room
    ? AGE_BUCKETS.filter((k) => room.age[k] > 0)
        .sort((a, b) => room.age[b] - room.age[a])
        .slice(0, 3)
    : [];
  const why = [act && sideWhy("Your fans", act), city && sideWhy(`${opts.cityName ?? "This city"}`, city)].filter((x): x is string => !!x);
  return { act, city, skew: room?.skew ?? "even", ages, why };
}

// How a profile biases idea queries. `signal.demographics.age` is documented for artist, book,
// brand, destination, movie, person, place, podcast, tv_show, video_game (parameters.md);
// `filter.release_year.min/max` only for movie and tv_show (available-parameters-by-entity-type.md).
// Artists have no release year, so recency for covers comes from the age signal plus `eraRerank`.
const AGE_TYPES = new Set(["urn:entity:artist", "urn:entity:book", "urn:entity:brand", "urn:entity:destination", "urn:entity:movie", "urn:entity:person", "urn:entity:place", "urn:entity:podcast", "urn:entity:tv_show", "urn:entity:video_game"]);
const YEAR_TYPES = new Set(["urn:entity:movie", "urn:entity:tv_show"]);
export function audienceParams(profile: AudienceProfile | undefined, type: string, year = new Date().getFullYear()): QlooParams {
  if (!profile || !profile.ages.length) return {};
  const p: QlooParams = {};
  if (AGE_TYPES.has(type)) p["signal.demographics.age"] = profile.ages.join(",");
  if (YEAR_TYPES.has(type)) {
    if (profile.skew === "younger") p["filter.release_year.min"] = year - 10;
    else if (profile.skew === "older") p["filter.release_year.max"] = year - 15;
  }
  return p;
}

// Year an entity is from, when the result carries one (movie/tv release_year or release_date;
// artist results may carry a start/formation year under properties, not documented: optional).
export function entityYear(e: { properties?: Record<string, unknown> }): number | undefined {
  const p = e.properties ?? {};
  for (const k of ["release_year", "start_year", "year_formed", "formed", "active_since", "release_date", "date_of_birth"]) {
    const v = p[k];
    const y = typeof v === "number" ? v : typeof v === "string" ? Number(v.slice(0, 4)) : NaN;
    if (Number.isFinite(y) && y > 1800 && y < 2200) return y;
  }
  return undefined;
}

// Gentle re-rank: a younger room moves recent entities up, an older room older ones. Items with
// no year keep their place relative to each other. `strength` = rank positions per decade.
export function eraRerank<T extends { properties?: Record<string, unknown> }>(list: T[], skew: Skew, strength = 2): T[] {
  if (skew === "even") return list;
  const years = list.map(entityYear).filter((y): y is number => y !== undefined);
  if (!years.length) return list;
  const mid = years.reduce((a, b) => a + b, 0) / years.length;
  const dir = skew === "younger" ? -1 : 1;
  return list
    .map((e, i) => {
      const y = entityYear(e);
      return { e, k: i + (y === undefined ? 0 : (dir * (y - mid) * strength) / 10) };
    })
    .sort((a, b) => a.k - b.k)
    .map((x) => x.e);
}
