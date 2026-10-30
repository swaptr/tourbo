import { audienceParams, type AudienceProfile, type Skew } from "../context/audience.ts";
import { fetchAudienceProfile } from "../context/audience.server.ts";
import { performanceContext, type Boundary, type Flavour } from "../context/index.ts";
import { placeFeatures } from "../places/index.server.ts";
import { heatmap, insights, type QlooEntity } from "../qloo/api.server.ts";
import { QlooError } from "../qloo/client.server.ts";
import type { QlooParams } from "../qloo/client.server.ts";
import { PARAMS_BY_TYPE, VERIFIED_EXTRA, type InsightsType } from "../qloo/params.ts";
import { discipline } from "../disciplines/index.ts";
import type { PerformerKind } from "../shared/types.ts";
import { sensitive } from "./angles.ts";
import { isMusician } from "./openers.ts";
import {
  assignCovers,
  cityCoverCandidates,
  CATEGORY_LABEL,
  cityBoxes,
  coverCandidates,
  coverIdea,
  heatFit,
  hintMode,
  IDEA_CATEGORIES,
  localIdeas,
  norm,
  regionView,
  topicIdeas,
  withHeatFit,
  type CityIdeas,
  type CoverCand,
  type Ent,
  type GeoCity,
  type IdeaCategory,
  type RegionIdea,
} from "./ideas-rank.ts";

// "Ideas for this place" (PLAN §18 Q12): per city, several ideas of what to perform or make there,
// each a name from that city's fan data with its number. Deterministic, no LLM; the MCP tool
// `tourbo_ideas` returns this as is. Ranking lives in ideas-rank.ts (pure, unit-tested).
//
// Covers: set.ts `arrangeCity` also returns 2–3 cover ideas per city (same lift idea: rank with
// the act's fans here vs overall) but caps at 3 per city and has no cross-city view, so the
// ranking is implemented in ideas-rank.ts; keep the two formulas in step.
//
// Request shapes, checked against qloo-docs (2026-07 docs) and params.ts:
// - location-only: `signal.location.query` (insights-with-location-use-case.md; VERIFIED_EXTRA for
//   artist, person, brand, tv_show, podcast; movie and book are allowUnlisted: the docs' own
//   example is `filter.type=urn:entity:movie&signal.location.query=…`).
// - act's fans in a city: `signal.interests.entities` + `signal.location.query` (two signals,
//   "What movies do Marvin Gaye fans living in Echo Park love?", insights-with-location.md).
// - places: `filter.location.query` (VERIFIED_EXTRA) + `filter.tags` (category / genre place tags).
// - trending: `bias.trends=high` (enum off…very_high, insights-api-deep-dive.md), whitelisted.
// - themes: `filter.type=urn:tag` + `signal.location.query` + `filter.tag.types` (taste-analysis.md;
//   not in the by-type table, so allowUnlisted).
// - tour-wide fit (region grid): `filter.type=urn:heatmap` + `signal.interests.entities=<idea id>`
//   (tags: `signal.interests.tags=<tag id>`; heatmaps-use-case.md: either signal, any entity) +
//   `filter.location=MULTIPOLYGON(…)` (WKT, lon first; parameters.md) + `output.heatmap.boundary=
//   urn:geohash`, all in the urn:heatmap whitelist. One call per region idea, top HEAT_IDEAS only.
// Categories per discipline: `ideaPlan(kind)` (discipline record's `ideas`, else DEFAULTS).
// Calls per city: one per source (musician defaults 4 + 1 per request, comedian 10, painter 7).

export type IdeasBasis = "act" | "city";
export type IdeasResult = {
  kind: PerformerKind;
  basis: IdeasBasis;
  basisLine: string; // one plain line: what the ideas are based on
  cities: CityIdeas[];
  region: RegionIdea[];
  categories: Partial<Record<IdeaCategory, string>>;
  partial: boolean; // some fan-data lists failed; ideas come from the rest
  label: string;
  frame: string; // "keep your set, add this": ideas are seasoning, not a new set
  audience?: Audience;
  context?: IdeasContextInfo;
};

// Performance context (context/, PLAN §18 Q15): the slot and flavour set how many local ideas per
// city (originality budget; the rest go to `spare`), boundaries + place set the avoid list (topics
// that hit it are dropped), and an audience profile (when there is one) biases the lists and the
// cover ranking. `audience: true` fetches the act's demographics: 1 extra call per run, off by
// default (the demographics request is not probed yet; fan-data quota exhausted 2026-10-30).
export type IdeasContext = { slot?: string; flavour?: Flavour; boundaries?: Boundary[]; audience?: boolean | AudienceProfile; skew?: Skew /* the act's era lever: forces the cover tilt */ };
export type IdeasContextInfo = { slot: string; slotLabel: string; flavour: Flavour; boundaries: Boundary[]; max: number; note: string; skew?: AudienceProfile["skew"]; audienceWhy?: string[] };

// Optional audience profile (context layer): biases entity queries via signal.demographics.*
// (parameters.md: age ranges 24_and_younger | 25_to_29 | 30_to_34 | 35_to_44 | 45_to_54 |
// 55_and_older, gender male | female; whitelisted for every entity type, not for urn:tag).
export const AGE_RANGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
export type Audience = { age?: (typeof AGE_RANGES)[number][]; gender?: "male" | "female" };
const demo = (type: InsightsType, a?: Audience): QlooParams => {
  if (!a || type === "urn:tag" || type === "urn:heatmap") return {};
  const ok = (k: string) => (PARAMS_BY_TYPE[type] as readonly string[]).includes(k);
  return {
    ...(a.age?.length && ok("signal.demographics.age") ? { "signal.demographics.age": a.age.join(",") } : {}),
    ...(a.gender && ok("signal.demographics.gender") ? { "signal.demographics.gender": a.gender } : {}),
  };
};

const TAKE = 10;
const LANDMARK = "urn:tag:genre:place:tourist_attraction"; // tag id from qloo-docs examples
const RESTAURANT = "urn:tag:category:place:restaurant"; // as angles.ts
const BAR = "urn:tag:category:place:bar";
const THEME_TAGS = "urn:tag:keyword:media"; // taste-analysis.md example namespace

// lat/lon (seed cities): lets the cover era tilt fall back to place features (median age).
type City = { name: string; query: string; lat?: number; lon?: number; region?: string; country?: string };

// Era tilt for covers per city: the fan-data audience skew when known; else place features'
// younger-crowd skew (median age, with the act's fan youth when there is a profile). Optional:
// cities without coordinates, errors and slow lookups (1.5 s) stay "even".
async function coverSkews(cities: City[], kind: PerformerKind, profile?: AudienceProfile, forced?: Skew): Promise<Map<string, Skew>> {
  if (forced && forced !== "even") return new Map(cities.map((c) => [c.name, forced]));
  const known = profile?.city?.skew ?? profile?.skew;
  if (known && known !== "even") return new Map(cities.map((c) => [c.name, known]));
  const fanYouth = profile?.city?.youth ?? profile?.act?.youth;
  const one = async (c: City): Promise<Skew> => {
    if (c.lat === undefined || c.lon === undefined) return "even";
    const timeout = new Promise<undefined>((r) => (setTimeout(() => r(undefined), 1500) as { unref?: () => void }).unref?.());
    const f = await Promise.race([placeFeatures({ name: c.name, lat: c.lat, lon: c.lon, query: c.query, region: c.region, country: c.country }, [], { kind, fanYouth }).catch(() => undefined), timeout]);
    return f?.derived.youngerCrowd?.skew ?? "even";
  };
  return new Map(await Promise.all(cities.map(async (c) => [c.name, await one(c)] as const)));
}

// One fan-data list per source; a category is one or more sources. Discipline records may
// override a category's entity types / place tags (see `ideaPlan`).
type Source = { type: InsightsType; label: string; tag?: string; tagTypes?: string; parents?: string; trend?: boolean; musicOnly?: boolean };
const SOURCES: Record<Exclude<IdeaCategory, "cover">, Source[]> = {
  banter: [
    { type: "urn:entity:tv_show", label: "TV shows" },
    { type: "urn:entity:person", label: "people" },
  ],
  trending: [{ type: "urn:entity:tv_show", label: "trending shows", trend: true }],
  screen: [
    { type: "urn:entity:tv_show", label: "TV shows" },
    { type: "urn:entity:movie", label: "films" },
    { type: "urn:entity:podcast", label: "podcasts" },
    { type: "urn:entity:book", label: "books" },
  ],
  music: [{ type: "urn:entity:artist", label: "artists", musicOnly: true }],
  brands: [{ type: "urn:entity:brand", label: "brands" }],
  food_places: [
    { type: "urn:entity:place", label: "restaurants", tag: RESTAURANT },
    { type: "urn:entity:place", label: "bars", tag: BAR },
  ],
  // Tag-level taste of the city's places (cuisines, dining styles): taste-analysis.md, parents filter.
  cuisines: [{ type: "urn:tag", label: "food tastes", parents: "urn:entity:place" }],
  people: [{ type: "urn:entity:person", label: "people" }],
  themes: [{ type: "urn:tag", label: "themes", tagTypes: THEME_TAGS }],
  landmarks: [{ type: "urn:entity:place", label: "landmarks", tag: LANDMARK }],
  artists_films: [
    { type: "urn:entity:artist", label: "artists", musicOnly: true },
    { type: "urn:entity:movie", label: "films" },
  ],
};

export type IdeaSlot = { category: IdeaCategory; take: number; sources: Source[] };

// Defaults until a discipline lists its own `ideas` (another agent adds `Discipline.ideas`).
const DEFAULTS: Record<"music" | "visual" | "talk", [IdeaCategory, number][]> = {
  music: [["cover", 3], ["banter", 2]],
  talk: [["trending", 2], ["screen", 3], ["brands", 2], ["food_places", 2], ["people", 2], ["themes", 2]],
  visual: [["landmarks", 3], ["food_places", 1], ["themes", 3], ["artists_films", 3], ["people", 1]],
};

export function ideasKindGroup(kind: string): "music" | "visual" | "talk" {
  return kind === "musician" || kind === "dj" ? "music" : hintMode(kind) === "subject" ? "visual" : "talk";
}

const TYPE_OF: Record<string, InsightsType> = Object.fromEntries(
  ["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show"].map((t) => [t, `urn:entity:${t}` as InsightsType]),
);

// Which categories (and how many ideas each) a discipline gets. Reads `discipline(kind).ideas`
// loosely: an array of category names, or of { category, take?, types?, tags? } where types are
// entity types ("urn:entity:movie" or "movie") and tags are place tags. Unknown entries are skipped.
export function ideaPlan(kind: string): IdeaSlot[] {
  let raw: unknown;
  try {
    const d = discipline(kind as PerformerKind) as { key?: string; ideas?: unknown } | undefined;
    raw = d?.key === kind ? d.ideas : undefined; // unknown kinds fall back to musician: use defaults instead
  } catch {
    raw = undefined;
  }
  const list = Array.isArray(raw) ? raw : [];
  const slots: IdeaSlot[] = [];
  for (const item of list) {
    const o = (typeof item === "string" ? { category: item } : item) as { category?: string; take?: number; types?: string[]; tags?: string[] };
    const category = o?.category as IdeaCategory;
    if (!IDEA_CATEGORIES.includes(category)) continue;
    const take = Math.max(1, Math.min(5, Number(o.take) || (category === "cover" ? 3 : 2)));
    let sources = category === "cover" ? [] : SOURCES[category];
    const types = (o.types ?? []).map((t) => (t.startsWith("urn:") ? t : TYPE_OF[t])).filter((t): t is InsightsType => !!t && t in PARAMS_BY_TYPE);
    if (types.length) sources = types.map((type) => ({ type, label: type.split(":").at(-1)!.replace(/_/g, " ") + "s", musicOnly: type === "urn:entity:artist" }));
    if (o.tags?.length) sources = [...sources.filter((s) => s.type !== "urn:entity:place"), ...o.tags.map((tag) => ({ type: "urn:entity:place" as InsightsType, label: "places", tag }))];
    slots.push({ category, take, sources });
  }
  if (slots.length) return slots;
  return DEFAULTS[ideasKindGroup(kind)].map(([category, take]) => ({ category, take, sources: category === "cover" ? [] : SOURCES[category] }));
}

// Records failures instead of throwing, so one 429 doesn't blank the page; ideasFor() rethrows
// when nothing at all came back.
class Calls {
  errors: unknown[] = [];
  ok = 0;
  ids = new Map<string, { entity?: string; tag?: string }>(); // norm(name) → fan-data id, for the heat fit
  audience?: Audience;
  profile?: AudienceProfile;
  constructor(audience?: Audience, profile?: AudienceProfile) {
    this.audience = audience;
    this.profile = profile;
  }
  // Profile params (signal.demographics.age, release-year window) only where the type lists them.
  private fromProfile(type: InsightsType): QlooParams {
    const ok = (PARAMS_BY_TYPE[type] ?? []) as readonly string[];
    return Object.fromEntries(Object.entries(audienceParams(this.profile, type)).filter(([k]) => ok.includes(k)));
  }
  async list(type: InsightsType, params: QlooParams, allowUnlisted: string[] = []): Promise<QlooEntity[]> {
    try {
      const r = await insights(type, { take: TAKE, ...this.fromProfile(type), ...demo(type, this.audience), ...params }, { allowUnlisted });
      this.ok++;
      const list = type === "urn:tag" ? ((r.tags ?? []) as unknown as QlooEntity[]) : (r.entities ?? []);
      for (const e of list as Ent[]) {
        const tag = type === "urn:tag" ? (e.tag_id ?? (e as { id?: string }).id) : undefined;
        if (e.name && !this.ids.has(norm(e.name)) && (tag || e.entity_id)) this.ids.set(norm(e.name), tag ? { tag } : { entity: e.entity_id });
      }
      return list;
    } catch (error) {
      this.errors.push(error);
      return [];
    }
  }
  // One location-only list for a source (request shapes: see the header).
  source(s: Source, c: City): Promise<QlooEntity[]> {
    if (s.type === "urn:entity:place") return this.list(s.type, { "filter.location.query": c.query, ...(s.tag ? { "filter.tags": s.tag } : {}) }).then(safe);
    if (s.type === "urn:tag")
      return this.list(s.type, { ...loc(c), ...(s.tagTypes ? { "filter.tag.types": s.tagTypes } : {}), ...(s.parents ? { "filter.parents.types": s.parents } : {}) }, ["signal.location.query", "filter.tag.types", "filter.parents.types"]);
    const extra = VERIFIED_EXTRA[s.type]?.includes("signal.location.query") ? [] : ["signal.location.query"];
    return this.list(s.type, { ...loc(c), ...(s.trend ? { "bias.trends": "high" } : {}), ...(s.musicOnly ? { take: 25 } : {}) }, extra).then((l) => (s.musicOnly ? l.filter(isMusician) : safe(l)));
  }
}

const loc = (c: City) => ({ "signal.location.query": c.query });

// Tour-wide fit for the region grid (see header): one heatmap per top region idea, in parallel
// (qlooGet caps concurrency). A failed call keeps that row's list numbers and marks the result
// partial; a quota error (429) earlier in the run skips the stage entirely.
const HEAT_IDEAS = 6;
async function heatFits(calls: Calls, refs: string[], cities: City[]): Promise<Map<string, Map<string, number>>> {
  const geo = cities.filter((c): c is City & GeoCity => c.lat !== undefined && c.lon !== undefined);
  const out = new Map<string, Map<string, number>>();
  if (geo.length < 2 || calls.errors.some((e) => e instanceof QlooError && e.status === 429)) return out;
  const location = cityBoxes(geo);
  await Promise.all(
    refs.slice(0, HEAT_IDEAS).map(async (ref) => {
      const id = calls.ids.get(norm(ref));
      if (!id) return;
      try {
        const cells = await heatmap({ ...(id.tag ? { "signal.interests.tags": id.tag } : { "signal.interests.entities": id.entity! }), "filter.location": location, "output.heatmap.boundary": "urn:geohash" });
        calls.ok++;
        out.set(norm(ref), heatFit(cells, geo));
      } catch (error) {
        calls.errors.push(error);
      }
    }),
  );
  return out;
}
const safe = (l: QlooEntity[]) => l.filter((e) => !sensitive(e));

async function perCity(cities: City[], fetch: (c: City) => Promise<QlooEntity[]>): Promise<Map<string, Ent[]>> {
  const lists = await Promise.all(cities.map(fetch));
  return new Map(cities.map((c, i) => [c.name, lists[i]]));
}

export async function ideasFor(opts: {
  cities: City[];
  kind: PerformerKind;
  signal?: string[]; // act + peers (fan-data ids); empty = from the city alone
  actNames?: string[]; // never suggest the act itself
  styles?: string[]; // the act's genres, for the cover angle
  basisLine?: string;
  audience?: Audience; // bias every list toward this crowd (younger → more recent acts and shows)
  budget?: number; // max ideas per city, best first (rank); omit for all
  context?: IdeasContext; // slot / flavour / boundaries / audience: see IdeasContext
}): Promise<IdeasResult> {
  const { cities, kind } = opts;
  const signal = (opts.signal ?? []).filter(Boolean);
  const cx = opts.context;
  const profile = typeof cx?.audience === "object" ? cx.audience : cx?.audience && signal.length ? await fetchAudienceProfile({ actIds: signal }).catch(() => undefined) : undefined;
  const calls = new Calls(opts.audience, profile);
  const out = new Map<string, CityIdeas>(cities.map((c) => [c.name, { city: c.name, ideas: [] }]));
  const scores = new Map<string, Map<string, number>>();
  const keep = (city: string, ref: string, v: number) => {
    const m = scores.get(norm(ref)) ?? new Map<string, number>();
    m.set(city, v);
    scores.set(norm(ref), m);
  };

  const plan = ideaPlan(kind);
  const coverSlot = plan.find((p) => p.category === "cover");
  if (coverSlot) {
    const skews = await coverSkews(cities, kind, profile, cx?.skew);
    const [overall, cityTop, fansHere] = await Promise.all([
      signal.length ? calls.list("urn:entity:artist", { "signal.interests.entities": signal.join(","), take: 50 }) : Promise.resolve([]),
      perCity(cities, (c) => calls.list("urn:entity:artist", { ...loc(c), take: 25 }).then((l) => l.filter(isMusician))),
      signal.length ? perCity(cities, (c) => calls.list("urn:entity:artist", { "signal.interests.entities": signal.join(","), ...loc(c), take: 25 }).then((l) => l.filter(isMusician))) : undefined,
    ]);
    const exclude = [...(opts.actNames ?? []), ...overall.filter((e) => signal.includes(e.entity_id)).map((e) => e.name)];
    const cands = new Map<string, CoverCand[]>();
    if (fansHere) for (const c of cities) cands.set(c.name, coverCandidates({ fansHere: fansHere.get(c.name) ?? [], overall, cityTop: cityTop.get(c.name) ?? [], exclude, skew: skews.get(c.name) }));
    // No act, or no fan data for it in a city: what the city itself plays.
    const fallback = cityCoverCandidates(cityTop, exclude, skews);
    for (const c of cities) if (!cands.get(c.name)?.length) cands.set(c.name, fallback.get(c.name) ?? []);
    for (const [city, list] of cands) for (const x of list) keep(city, x.ref, x.score);
    const picks = assignCovers(cands, coverSlot.take);
    const style = opts.styles?.[0];
    for (const c of cities) out.get(c.name)!.ideas.push(...(picks.get(c.name) ?? []).map((x) => coverIdea(c.name, x, style)));
  }
  const topicSlots = plan.filter((p) => p.category !== "cover" && p.sources.length);
  const buckets = await Promise.all(
    topicSlots.flatMap((slot) =>
      slot.sources.map((src) =>
        perCity(cities, (c) => calls.source(src, c)).then((byCity) => ({ bucket: { category: slot.category, type: src.type.split(":").at(-1)!, label: src.label }, byCity })),
      ),
    ),
  );
  const picked = topicIdeas({ kind, quota: Object.fromEntries(topicSlots.map((s) => [s.category, s.take])), buckets });
  for (const c of cities) {
    const ideas = out.get(c.name)!.ideas;
    for (const i of picked.get(c.name) ?? []) if (!ideas.some((x) => norm(x.ref) === norm(i.ref))) ideas.push(i);
    for (const i of ideas) if (i.category !== "cover") keep(c.name, i.ref, i.value);
  }

  // Disciplines without crowd work (discipline record `crowdWork: false`) get no questions.
  const d = discipline(kind) as { key?: string; crowdWork?: boolean };
  if (d.key === kind && d.crowdWork === false) for (const c of out.values()) for (const i of c.ideas) delete i.question;
  if (!calls.ok && calls.errors.length) throw calls.errors[0]; // e.g. quota (429): the caller says so plainly
  const order = [...new Set(plan.map((p) => p.category))];
  let info: IdeasContextInfo | undefined;
  for (const c of cities) {
    const ci = out.get(c.name)!;
    if (!cx) {
      ci.ideas = localIdeas(ci.ideas, { order, cap: opts.budget }).use;
      continue;
    }
    const ctx = performanceContext({ kind, slot: cx.slot, flavour: cx.flavour, boundaries: cx.boundaries, place: { name: c.name, query: c.query, country: c.country }, audience: profile });
    const r = localIdeas(ci.ideas, { order, avoid: ctx.avoid, cap: opts.budget, max: ctx.budget.max });
    Object.assign(ci, { ideas: r.use, ...(r.spare.length ? { spare: r.spare } : {}), ...(ctx.avoid.country ? { country: ctx.avoid.country } : {}), ...(r.avoided.length ? { avoided: r.avoided.length } : {}) });
    if (!r.use.length && r.spare.length) ci.empty = ctx.budget.note;
    info ??= { slot: ctx.slot.key, slotLabel: ctx.slot.label, flavour: ctx.budget.flavour, boundaries: ctx.avoid.boundaries, max: ctx.budget.max, note: ctx.budget.note, ...(profile ? { skew: profile.skew, audienceWhy: profile.why } : {}) };
  }
  const list = [...out.values()];
  // Region view ranks across cities from every grounded idea (used + spare), not the set itself.
  const region0 = regionView(
    list.map((c) => ({ ...c, ideas: [...c.ideas, ...(c.spare ?? [])] })),
    scores,
  );
  const region = withHeatFit(region0, await heatFits(calls, region0.map((r) => r.ref), cities), cities.map((c) => c.name));
  for (const c of list) if (!c.ideas.length && !c.empty) c.empty = `The fan data has little on ${c.city} yet. Try the nearest bigger city.`;
  const used = new Set(list.flatMap((c) => [...c.ideas, ...(c.spare ?? [])].map((i) => i.category)));
  const basis: IdeasBasis = signal.length ? "act" : "city";
  const where = cities.length === 1 ? cities[0].name : "each city";
  return {
    kind,
    basis,
    basisLine: opts.basisLine ?? (basis === "act" ? `Ideas from your fans' taste and what ${where} loves.` : `Ideas from what ${where} loves.`),
    cities: list,
    region,
    categories: Object.fromEntries([...used].map((k) => [k, CATEGORY_LABEL[k]])),
    partial: calls.errors.length > 0,
    frame: ideasKindGroup(kind) === "visual" ? "Keep your own work; add a piece from here." : "Keep your set; add one or two of these.",
    ...(opts.audience ? { audience: opts.audience } : {}),
    ...(info ? { context: info } : {}),
    label: ideasKindGroup(kind) === "visual" ? "Taste-based ideas, not sales predictions." : "Ideas grounded in fan data; numbers are behind why?.",
  };
}
