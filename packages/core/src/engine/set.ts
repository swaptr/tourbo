import { audienceParams, eraRerank, type AudienceProfile, type Skew } from "../context/audience.ts";
import { fetchAudienceProfile } from "../context/audience.server.ts";
import { localBudget, type Flavour, type LocalBudget } from "../context/budget.ts";
import { avoidList, checkAgainstAvoid, edgeFromTaste, type AvoidList, type Boundary } from "../context/sensitivity.ts";
import { slotFor, type SlotDef } from "../context/slots.ts";
import { discipline } from "../disciplines/index.ts";
import { insights, type QlooEntity } from "../qloo/api.server.ts";
import type { InsightsType } from "../qloo/params.ts";
import { staticPlace } from "../places/hooks.server.ts";
import type { Derived } from "../places/types.ts";
import type { PerformerKind, Region } from "../shared/types.ts";
import { findCity } from "./cities.ts";
import { cityCulture } from "./angles.ts";
import { normalizeRef } from "./brief.ts";

// "Build my set": order the act's own songs or bits per city. The fan data has no song or track
// entities, so fit works at style level: each item carries 1–2 style names (genre tags), matched
// against the genre tags of the artists (people, for comics) the city over-indexes on. No LLM.
// Every reason cites a fact name from that city's `facts`, so writers can be checked like show prep.
// Calls per city: 1 (city taste) + 1 (act's fans in the city, when the act is known) + 4 for comics
// (city culture, shared cache with the city brief); +1 per run for the act's fans overall.
// Performance context (context/, PLAN §18 Q15): the slot sets the target length, the originality
// budget caps how many local items (covers, local tags, crowd work) go into the order, and the
// avoid list drops crowd-work topics and AI-written reasons that hit it.

export const SET_TAGS = ["opener", "slow", "banger", "closer"] as const;
export type SetTag = (typeof SET_TAGS)[number];
export type SetItemInput = { title: string; tag?: SetTag; minutes?: number; styles?: string[] };
export type Slot = string; // slot key from context/slots.ts; "headline" / "support" always resolve

export type SetFact = { name: string; kind: "style" | "city_style" | "city_artist" | "cover" | "topic"; detail: string; value?: number };
export type SetMove = "open" | "keep" | "build" | "breather" | "nod" | "peak" | "close" | "crowd";
export type SetEntry = { item?: number; title: string; tag?: SetTag; minutes: number; fit?: number; move: SetMove; reason: string; refs: string[] };
export type CoverIdea = { artist: string; why: string; angle: string; cityRank: number; overallRank?: number; affinity?: number };
export type CitySet = {
  city: string;
  facts: SetFact[];
  order: SetEntry[];
  coverIdeas: CoverIdea[];
  crowdWork: string[];
  length: { total: number; target: number; verdict: "over" | "short" | "ok"; note: string };
  weakSpot?: { item: number; title: string; reason: string; refs: string[] };
  local: { used: number; budget: LocalBudget }; // local items in `order` (never above budget.max)
  avoid: AvoidList;
  audience?: AudienceProfile;
};
export type SetResult = { kind: PerformerKind; slot: Slot; slotLabel: string; flavour: Flavour; items: number; cities: CitySet[]; suggestedStyles: string[] };

// Slot length in minutes (context/slots.ts); untimed slots (pieces, courses) fall back to 45.
export const targetMinutes = (kind: PerformerKind, slot: Slot) => {
  const d = slotFor(kind, slot);
  return d.unit === "minutes" ? d.size : 45;
};
const itemMinutes = (kind: PerformerKind) => (discipline(kind).crowdWork ? 5 : 4);
// Covers make sense where the act's peers are music artists (singers, DJs, buskers).
const playsCovers = (kind: PerformerKind) => discipline(kind).peerType === "urn:entity:artist";
// Location-only insights types verified by probe (params.ts VERIFIED_EXTRA); others read people.
const LOCATION_TYPES = new Set<string>(["urn:entity:artist", "urn:entity:person", "urn:entity:podcast"]);
const cityType = (kind: PerformerKind) => {
  const t = discipline(kind).peerType;
  return (LOCATION_TYPES.has(t) ? t : "urn:entity:person") as InsightsType;
};
const LOCAL_MOVES = new Set<SetMove>(["nod", "crowd"]);
const NOD_MIN = 4;
const CITY_TAKE = 25;

// "R & B", "Rhythm & Blues", "R&B" → "rnb"; "Hip - Hop" → "hip hop".
export function styleKey(s: string) {
  return normalizeRef(s.replace(/&/g, " and "))
    .replace(/\br and b\b|\brhythm and blues\b|\brnb\b/g, "rnb")
    .replace(/\bhip hop\b/g, "hiphop")
    .replace(/\bsinger and songwriter\b|\bsinger songwriter\b/g, "singersongwriter")
    .trim();
}
function match(style: string, tag: string) {
  const a = styleKey(style);
  const b = styleKey(tag);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = a.split(" ");
  const tb = new Set(b.split(" "));
  return ta.every((t) => tb.has(t)) || b.split(" ").every((t) => ta.includes(t)) ? 0.5 : 0;
}
const genreTags = (e: QlooEntity) => (e.tags ?? []).filter((t) => (t.tag_id ?? t.id ?? "").includes(":genre:")).map((t) => t.name);

// Parse "Title, banger, 4, folk" / "Title | closer | 5m". Unknown words become styles (max 2).
export function parseSetLines(text: string): SetItemInput[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ""))
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split(/\s*[|,;]\s*|\s+[—–]\s+/).map((s) => s.trim());
      const item: SetItemInput = { title: title.slice(0, 120) };
      const styles: string[] = [];
      for (const part of rest.filter(Boolean)) {
        const lower = part.toLowerCase();
        const mins = lower.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes)?$/);
        if ((SET_TAGS as readonly string[]).includes(lower)) item.tag = lower as SetTag;
        else if (mins) item.minutes = Number(mins[1]);
        else if (styles.length < 2) styles.push(part.slice(0, 60));
      }
      if (styles.length) item.styles = styles;
      return item;
    })
    .slice(0, 40);
}

type CityTaste = { entities: QlooEntity[]; fans?: QlooEntity[] };

async function cityTaste(city: string, kind: PerformerKind, signal: string[], audience?: AudienceProfile): Promise<CityTaste> {
  const type = cityType(kind);
  const age = audienceParams(audience, "urn:entity:artist");
  const [{ entities = [] }, fans] = await Promise.all([
    insights(type, { "signal.location.query": city, take: CITY_TAKE }, { allowUnlisted: ["signal.location.query"] }).catch(() => ({ entities: [] as QlooEntity[] })),
    signal.length && playsCovers(kind)
      ? insights("urn:entity:artist", { "signal.interests.entities": signal.join(","), "signal.location.query": city, take: 15, ...age })
          .then((r) => r.entities ?? [])
          .catch(() => undefined)
      : undefined,
  ]);
  return { entities, fans };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Cover ideas (shared with other engines). Pure ranking: prefer artists whose rank with the act's
// fans in this city beats their rank with the act's fans overall; without that (unknown act, no
// city signal) fall back to the city's own most-followed artists closest to the given styles.
export function rankCoverIdeas(opts: {
  city: string;
  fans?: QlooEntity[]; // act's fans + this city (signal.location.query), ranked
  overall?: QlooEntity[]; // act's fans, no location
  cityEntities?: QlooEntity[]; // location-only taste
  styles?: string[];
  exclude?: string[];
  angleStyle?: string;
  take?: number;
  skew?: Skew; // audience age skew: younger moves recent acts up, older moves older ones (when years are known)
  placeSkew?: Skew; // place features' youngerCrowd.skew (places/): used only when the fan-data skew is even
}): CoverIdea[] {
  const { city } = opts;
  const n = opts.take ?? 3;
  const skew = (opts.skew ?? "even") === "even" ? (opts.placeSkew ?? "even") : opts.skew!;
  const exclude = new Set((opts.exclude ?? []).map(normalizeRef));
  const overall = opts.overall ?? [];
  const overallRank = new Map(overall.map((e, i) => [e.entity_id, i]));
  const angle = (artist: string) => (opts.angleStyle ? `Play a ${artist} song in your own ${opts.angleStyle} arrangement.` : `Play a ${artist} song stripped down, your way.`);
  const ok = (e: QlooEntity) => !exclude.has(normalizeRef(e.name)) && genreTags(e).length > 0;
  const all = opts.fans ?? [];
  const fans = all.filter(ok);
  // A city signal that changes nothing (same top order as overall) says nothing about this city.
  const top5 = (list: QlooEntity[]) => list.slice(0, 5).map((e) => e.entity_id).join();
  const same = overall.length > 0 && top5(all) === top5(overall);
  if (fans.length && !same) {
    const ranked = all
      .map((e, cityRank) => ({ e, cityRank, overall: overallRank.get(e.entity_id), properties: e.properties }))
      .filter(({ e }) => ok(e))
      .map((x) => ({ ...x, lift: (x.overall ?? (overall.length || 50)) - x.cityRank }))
      .sort((a, b) => b.lift - a.lift || a.cityRank - b.cityRank);
    return eraRerank(ranked, skew)
      .slice(0, n)
      .map(({ e, cityRank, overall: o }) => ({
        artist: e.name,
        cityRank: cityRank + 1,
        overallRank: o === undefined ? undefined : o + 1,
        affinity: e.query?.affinity === undefined ? undefined : r2(e.query.affinity),
        why: `#${cityRank + 1} with your fans in ${city}${o === undefined ? `, not in their overall top ${overall.length || 50}` : ` vs #${o + 1} with your fans overall`}`,
        angle: angle(e.name),
      }));
  }
  const styles = opts.styles ?? [];
  const ranked = (opts.cityEntities ?? [])
    .map((e, rank) => ({ e, rank, m: Math.max(0, ...styles.flatMap((s) => genreTags(e).map((t) => match(s, t)))), properties: e.properties }))
    .filter(({ e }) => ok(e))
    .sort((a, b) => b.m - a.m || a.rank - b.rank);
  return eraRerank(ranked, skew)
    .slice(0, n)
    .map(({ e, rank }) => ({ artist: e.name, cityRank: rank + 1, why: `#${rank + 1} of the artists ${city} over-indexes on`, angle: angle(e.name) }));
}

// Fetch + rank cover ideas for one city. `signal` = act (+ peers) Qloo ids; empty = location only.
export async function coverIdeas(opts: { city: string; signal?: string[]; styles?: string[]; exclude?: string[]; angleStyle?: string; take?: number; overall?: QlooEntity[] }): Promise<CoverIdea[]> {
  const signal = opts.signal ?? [];
  const [taste, overall] = await Promise.all([
    cityTaste(opts.city, "musician", signal),
    opts.overall ?? (signal.length ? fansOverall(signal) : Promise.resolve([] as QlooEntity[])),
  ]);
  return rankCoverIdeas({ city: opts.city, fans: taste.fans, overall, cityEntities: taste.entities, styles: opts.styles, exclude: opts.exclude, angleStyle: opts.angleStyle, take: opts.take });
}

const fansOverall = (signal: string[]) =>
  insights("urn:entity:artist", { "signal.interests.entities": signal.join(","), take: 50 })
    .then((r) => r.entities ?? [])
    .catch(() => [] as QlooEntity[]);

export function arrangeCity(opts: {
  city: string;
  kind: PerformerKind;
  slot: Slot;
  items: SetItemInput[];
  defaultStyles: string[];
  taste: CityTaste;
  overall?: QlooEntity[];
  culture?: { name: string }[];
  targetMinutes?: number;
  exclude?: string[];
  flavour?: Flavour; // originality budget, default "touch"
  boundaries?: Boundary[];
  place?: { country?: string; query?: string; region?: string }; // for the region avoid notes
  audience?: AudienceProfile;
  placeHints?: Pick<Derived, "youngerCrowd" | "tone">; // place features (places/): age skew fallback + tone for the avoid list
  skew?: Skew; // the act's own era choice (Tune "recent / classic"): wins over the audience guess
}): CitySet {
  const { city, kind, items, taste } = opts;
  const N = Math.max(taste.entities.length, 1);
  const d = discipline(kind);
  const crowd = d.crowdWork;
  const covers = playsCovers(kind);
  const who = covers ? "artists" : "names";
  const base = slotFor(kind, opts.slot);
  const slotDef: SlotDef = opts.targetMinutes && base.unit === "minutes" ? { ...base, size: opts.targetMinutes } : base;
  const budget = localBudget(slotDef, opts.flavour, covers ? NOD_MIN : 2);
  const avoid = avoidList(kind, { name: city, ...opts.place }, opts.boundaries, crowd ? edgeFromTaste(taste.entities) : undefined, opts.placeHints?.tone);
  const facts: SetFact[] = [];
  const addFact = (f: SetFact) => {
    if (!facts.some((x) => normalizeRef(x.name) === normalizeRef(f.name))) facts.push(f);
  };

  // Style strength in this city: Σ over the city's top artists (rank-weighted) of the best tag match.
  const allStyles = [...new Set(items.flatMap((i) => (i.styles?.length ? i.styles : opts.defaultStyles)))];
  const strength = new Map<string, { score: number; examples: string[] }>();
  for (const s of allStyles) {
    let score = 0;
    const examples: string[] = [];
    taste.entities.forEach((e, rank) => {
      const m = Math.max(0, ...genreTags(e).map((t) => match(s, t)));
      if (m > 0) {
        score += m * (1 - rank / N);
        if (examples.length < 2) examples.push(e.name);
      }
    });
    strength.set(s, { score, examples });
    addFact({
      name: s,
      kind: "style",
      value: r2(score),
      detail: examples.length ? `${city}'s top ${who} include ${examples.join(" and ")}, tagged ${s} (strength ${r2(score)})` : `none of ${city}'s top ${N} ${who} is tagged ${s}`,
    });
    for (const ex of examples) addFact({ name: ex, kind: "city_artist", detail: `one of ${city}'s most-followed ${who}, tagged ${s}` });
  }

  // What the city leans to overall (top genre tags of its artists): suggestions + facts.
  const tagWeight = new Map<string, { name: string; w: number }>();
  taste.entities.forEach((e, rank) => {
    for (const t of new Set(genreTags(e).map(styleKey))) {
      const name = genreTags(e).find((g) => styleKey(g) === t)!;
      const cur = tagWeight.get(t) ?? { name, w: 0 };
      cur.w += 1 - rank / N;
      tagWeight.set(t, cur);
    }
  });
  const cityStyles = [...tagWeight.values()].filter((t) => !/^(american|chicago|japan|japanese|british|indian)$/i.test(t.name)).sort((a, b) => b.w - a.w).slice(0, 5);
  for (const t of cityStyles) addFact({ name: t.name, kind: "city_style", value: r2(t.w), detail: `a top style among ${city}'s most-followed ${who} (weight ${r2(t.w)})` });
  const topStyle = cityStyles[0]?.name;

  const maxScore = Math.max(0, ...[...strength.values()].map((v) => v.score));
  const fitOf = (i: SetItemInput) => {
    const styles = i.styles?.length ? i.styles : opts.defaultStyles;
    const best = styles.map((s) => ({ s, v: strength.get(s)?.score ?? 0 })).sort((a, b) => b.v - a.v)[0];
    return { fit: maxScore ? r2((best?.v ?? 0) / maxScore) : 0, style: best?.s };
  };
  const scored = items.map((it, idx) => ({ idx, it, ...fitOf(it) }));
  type S = (typeof scored)[number];
  const byFit = (a: S, b: S) => b.fit - a.fit || a.idx - b.idx;

  // Cover ideas: artists the act's fans in this city rank high, and higher than fans elsewhere.
  const angleStyle = scored.slice().sort(byFit)[0]?.style ?? opts.defaultStyles[0];
  let coverIdeas: CoverIdea[] = [];
  if (covers) {
    coverIdeas = rankCoverIdeas({ city, fans: taste.fans, overall: opts.overall, cityEntities: taste.entities, styles: allStyles, exclude: opts.exclude, angleStyle, skew: opts.skew ?? opts.audience?.skew, placeSkew: opts.placeHints?.youngerCrowd?.skew });
    for (const c of coverIdeas) addFact({ name: c.artist, kind: "cover", value: c.cityRank, detail: c.why });
  }
  // Crowd-work topics: the city's own culture minus anything on the avoid list.
  const crowdWork = (opts.culture ?? [])
    .map((c) => c.name)
    .filter((n) => !checkAgainstAvoid(n, avoid).length)
    .slice(0, 4);
  for (const t of crowdWork) addFact({ name: t, kind: "topic", detail: `something ${city} watches, follows or buys a lot` });

  // Running order: opener → keep → middle (slow ones near 60%) → nod → peak → closer.
  const pool = [...scored];
  const take = (pred: (s: S) => boolean) => {
    const pick = pool.filter(pred).sort(byFit)[0];
    if (pick) pool.splice(pool.indexOf(pick), 1);
    return pick;
  };
  const openers = pool.filter((s) => s.it.tag === "opener").sort(byFit);
  const closers = pool.filter((s) => s.it.tag === "closer").sort(byFit);
  for (const s of [...openers, ...closers]) pool.splice(pool.indexOf(s), 1);
  const open = openers.shift() ?? take((s) => s.it.tag !== "slow");
  const close = closers.shift() ?? take((s) => s.it.tag !== "slow");
  const extraOpen = openers; // more than one opener tag: keep them at the front
  const extraClose = closers;
  const fast = pool.filter((s) => s.it.tag !== "slow").sort(byFit);
  const slow = pool.filter((s) => s.it.tag === "slow").sort(byFit);
  const keep = fast.shift();
  const peak = fast.shift();
  const middle = [...fast];
  middle.splice(Math.round(middle.length * 0.6), 0, ...slow);

  const why = (s: S) => {
    const st = s.style ? strength.get(s.style) : undefined;
    if (s.style && st?.examples.length) return { text: `${city} over-indexes on ${s.style} (${st.examples[0]})`, refs: [s.style, st.examples[0]] };
    if (s.style) return { text: `${s.style} is thin in ${city}${topStyle ? `; this crowd leans ${topStyle}` : ""}`, refs: [s.style, ...(topStyle ? [topStyle] : [])] };
    return { text: topStyle ? `this crowd leans ${topStyle}` : "no style tag to match", refs: topStyle ? [topStyle] : [] };
  };
  const minutes = (s: S) => s.it.minutes ?? itemMinutes(kind);
  const entry = (s: S, move: SetMove, lead: string): SetEntry => {
    const w = why(s);
    return { item: s.idx, title: s.it.title, tag: s.it.tag, minutes: minutes(s), fit: s.fit, move, reason: `${lead}: ${w.text}.`, refs: w.refs };
  };
  const order: SetEntry[] = [];
  const noun = d.noun.includes("comedy") || crowd ? "bit" : covers ? "song" : "piece";
  // Local items, in order of preference, capped by the originality budget. The act's own items
  // always stay; local items are seasoning ("keep your set, add this").
  const shared = budget.mode === "shared" ? " both crowds know" : "";
  const locals: SetEntry[] = [];
  if (crowd && crowdWork.length) {
    locals.push({ title: `Crowd work: ${crowdWork.slice(0, 2).join(" / ")}`, minutes: 3, move: "crowd", reason: `Warm the room on what ${city} follows: ${crowdWork.slice(0, 2).join(" and ")}.`, refs: crowdWork.slice(0, 2) });
    for (const t of crowdWork.slice(2)) locals.push({ title: `Local tag: ${t}`, minutes: 2, move: "nod", reason: `Keep your set, add this: ${city} follows ${t}.`, refs: [t] });
  } else if (covers) {
    for (const c of coverIdeas) locals.push({ title: `Cover: ${c.artist}`, minutes: NOD_MIN, move: "nod", reason: `Keep your set, add a nod${shared}: ${c.artist} is ${c.why}.`, refs: [c.artist] });
  }
  const useLocal = locals.slice(0, budget.max);
  const crowdEntry = useLocal[0]?.move === "crowd" ? useLocal.shift() : undefined;
  for (const s of extraOpen) order.push(entry(s, "open", `Tagged opener`));
  if (open) order.push(entry(open, "open", open.it.tag === "opener" ? "Your opener" : `Open with your best-fit ${noun}`));
  if (crowdEntry) order.push(crowdEntry);
  if (keep) order.push(entry(keep, "keep", "Keep them"));
  // Spread extra local items through the middle; the last one sits before the peak (as before).
  const mid = middle.map((s) => entry(s, s.it.tag === "slow" ? "breather" : "build", s.it.tag === "slow" ? "Breather" : "Build"));
  const last = useLocal.pop();
  const L = mid.length;
  useLocal.forEach((l, i) => mid.splice(Math.round(((i + 1) * L) / (useLocal.length + 1)) + i, 0, l));
  order.push(...mid);
  if (last) order.push(last);
  if (peak) order.push(entry(peak, "peak", "Peak before the close"));
  for (const s of extraClose) order.push(entry(s, "peak", "Tagged closer, moved up"));
  if (close) order.push(entry(close, "close", close.it.tag === "closer" ? "Your closer" : `Close on a strong ${noun}`));

  // Weak spot: lowest fit among the movable middle items (else anything but the opener).
  const movable = order.filter((e) => e.item !== undefined && (e.move === "build" || e.move === "breather" || e.move === "keep"));
  const weakest = (movable.length ? movable : order.filter((e) => e.item !== undefined)).slice().sort((a, b) => (a.fit ?? 0) - (b.fit ?? 0) || (b.item ?? 0) - (a.item ?? 0))[0];
  const weakSpot = weakest && {
    item: weakest.item!,
    title: weakest.title,
    reason: `Weakest fit here (${weakest.fit ?? 0} of 1): ${weakest.reason.replace(/^[^:]+: /, "")} Tighten it, or cut it if you run long.`,
    refs: weakest.refs,
  };

  const total = order.reduce((n, e) => n + e.minutes, 0);
  const target = opts.targetMinutes ?? targetMinutes(kind, opts.slot);
  const label = slotDef.label;
  const verdict = total > target * 1.05 ? "over" : total < target * 0.85 ? "short" : "ok";
  const note =
    verdict === "over"
      ? `${total} min is ${total - target} over the ${target}-min ${label} slot${weakSpot ? `: cut "${weakSpot.title}" first` : ""}.`
      : verdict === "short"
        ? `${total} min is ${target - total} short of the ${target}-min ${label} slot.`
        : `${total} min fits the ${target}-min ${label} slot.`;
  const used = order.filter((e) => LOCAL_MOVES.has(e.move)).length;
  return { city, facts, order, coverIdeas, crowdWork, length: { total, target, verdict, note }, weakSpot, local: { used, budget }, avoid, audience: opts.audience };
}

export async function buildSet(opts: {
  items: SetItemInput[];
  cities: { name: string; query: string; country?: string; region?: string; lat?: number; lon?: number }[];
  kind: PerformerKind;
  slot: Slot;
  signal?: string[]; // act + peers (Qloo ids); empty = unknown act, location-only
  actNames?: string[]; // never suggest the act itself as a cover
  defaultStyles?: string[]; // used for items without styles (e.g. the act's genres)
  targetMinutes?: number;
  flavour?: Flavour;
  boundaries?: Boundary[];
  // Audience profile from fan-data demographics (2 extra calls per city + 1 per run). Off by
  // default until the demographics request is probed (quota exhausted 2026-10-30).
  audience?: boolean;
  skew?: Skew; // the act's era choice (levers): younger = recent covers first, older = classics
}): Promise<SetResult> {
  const signal = opts.signal ?? [];
  const defaultStyles = (opts.defaultStyles ?? []).slice(0, 2);
  const covers = playsCovers(opts.kind);
  const actAudience = opts.audience && signal.length ? await fetchAudienceProfile({ actIds: signal }) : undefined;
  const overall = signal.length && covers ? await fansOverall(signal) : [];
  const exclude = [...(opts.actNames ?? []), ...overall.filter((e) => signal.includes(e.entity_id)).map((e) => e.name)];
  const cities = await Promise.all(
    opts.cities.map(async (c) => {
      const [taste, culture] = await Promise.all([
        cityTaste(c.query, opts.kind, signal, actAudience),
        discipline(opts.kind).crowdWork ? cityCulture(c.query).catch(() => []) : undefined,
      ]);
      const audience = opts.audience
        ? await fetchAudienceProfile({ actIds: signal, cityEntityIds: taste.entities.slice(0, 10).map((e) => e.entity_id), cityName: c.name })
        : undefined;
      // Place features from committed open-data snapshots (no network): age skew + tone.
      const at = c.lat !== undefined && c.lon !== undefined ? { lat: c.lat, lon: c.lon } : c.region ? findCity(c.region as Region, c.name) : undefined;
      const place = at
        ? await staticPlace(
            { name: c.name, lat: at.lat, lon: at.lon, region: c.region, country: c.country, query: c.query },
            { kind: opts.kind, fanYouth: audience?.city?.youth ?? audience?.act?.youth, edge: discipline(opts.kind).crowdWork ? { lean: edgeFromTaste(taste.entities).lean } : undefined },
          )
        : undefined;
      const placeHints = place && { youngerCrowd: place.derived.youngerCrowd, tone: place.derived.tone };
      return arrangeCity({ city: c.name, kind: opts.kind, slot: opts.slot, items: opts.items, defaultStyles, taste, overall, culture, targetMinutes: opts.targetMinutes, exclude, flavour: opts.flavour, boundaries: opts.boundaries, place: c, audience, placeHints, skew: opts.skew });
    }),
  );
  const suggested = new Map<string, number>();
  for (const c of cities) for (const f of c.facts) if (f.kind === "city_style") suggested.set(f.name, (suggested.get(f.name) ?? 0) + (f.value ?? 0));
  return {
    kind: opts.kind,
    slot: opts.slot,
    slotLabel: slotFor(opts.kind, opts.slot).label,
    flavour: opts.flavour ?? "touch",
    items: opts.items.length,
    cities,
    suggestedStyles: [...suggested.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 8),
  };
}

// Plain markdown for one city's set (project item, copy-paste).
export function setMarkdown(c: CitySet) {
  const lines = c.order.map((e, i) => `${i + 1}. ${e.title} (${e.minutes} min)`);
  if (c.coverIdeas.length) lines.push("", `Cover ideas: ${c.coverIdeas.map((x) => x.artist).join(", ")}`);
  if (c.crowdWork.length) lines.push("", `Crowd work: ${c.crowdWork.join(", ")}`);
  lines.push("", c.length.note);
  if (c.weakSpot) lines.push(`Weak spot: ${c.weakSpot.title}`);
  return lines.join("\n");
}

// Grounding check for written reasons (same idea as the show-prep critic): a reason is kept only
// if it cites at least one name, every cited name is in this city's facts, and the text uses it;
// and it doesn't hit the city's avoid list (fact names are allowed: a band called Queen is fine).
export type WrittenMove = { pos: number; reason: string; transition?: string; refs: string[] };
export function groundMoves(moves: WrittenMove[], c: CitySet): { kept: WrittenMove[]; dropped: number; avoided: number } {
  const known = new Set(c.facts.map((f) => normalizeRef(f.name)));
  const names = [...c.facts.map((f) => f.name), ...c.order.map((e) => e.title)];
  let avoided = 0;
  const kept = moves.filter((m) => {
    if (!Number.isInteger(m.pos) || m.pos < 0 || m.pos >= c.order.length || !m.refs.length) return false;
    const text = normalizeRef(`${m.reason} ${m.transition ?? ""}`);
    if (!m.refs.every((r) => known.has(normalizeRef(r)) && text.includes(normalizeRef(r)))) return false;
    if (c.avoid && checkAgainstAvoid(`${m.reason} ${m.transition ?? ""}`, c.avoid, names).length) {
      avoided++;
      return false;
    }
    return true;
  });
  return { kept, dropped: moves.length - kept.length, avoided };
}
