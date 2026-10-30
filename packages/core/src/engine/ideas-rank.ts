// "Ideas for this place" (PLAN §18 Q12): pure ranking and grounding, no network. ideas.ts fetches
// the fan-data lists and hands them here; tests/unit/ideas-rank.test.ts covers this file.
// Every idea is a name taken from one of that city's lists, with its number; nothing is invented.

import { entityYear, type Skew } from "../context/audience.ts";
import { isGenre } from "./places.ts";
import { applyBudget } from "../context/budget.ts";
import { dropAvoided, type AvoidList } from "../context/sensitivity.ts";

export type IdeaCategory = "cover" | "banter" | "screen" | "brands" | "food_places" | "cuisines" | "people" | "trending" | "themes" | "landmarks" | "artists_films" | "music";
export const IDEA_CATEGORIES: IdeaCategory[] = ["cover", "banter", "trending", "screen", "music", "brands", "food_places", "cuisines", "people", "themes", "landmarks", "artists_films"];

// Plain, vendor-neutral headings (UI and MCP).
export const CATEGORY_LABEL: Record<IdeaCategory, string> = {
  cover: "Cover ideas",
  banter: "Between songs",
  screen: "TV, films and podcasts",
  brands: "Teams and brands",
  food_places: "Food and places",
  cuisines: "Tastes and cuisines",
  people: "People",
  trending: "Trending",
  themes: "Themes",
  landmarks: "Landmarks and places",
  artists_films: "Artists and films they love",
  music: "Music the city loves",
};

// How hints are phrased: comics get premises + crowd-work questions, makers get subjects,
// everyone else local examples. Crowd-work questions are kept only where the discipline record
// says `crowdWork: true` (ideas.ts). Kinds are strings so new disciplines just work.
export type HintMode = "premise" | "subject" | "example";
export function hintMode(kind: string): HintMode {
  if (/comedian|magician|theatre|improv|clown/.test(kind)) return "premise";
  if (/visual|painter|photograph|film|maker|craft|illustrat|sculpt|design|tattoo/.test(kind)) return "subject";
  return "example";
}

export type Idea = {
  idea: string; // short title shown on the card
  category: IdeaCategory;
  ref: string; // exact fan-data name: the critic matches angles against this
  type: string; // artist, tv_show, tag, place…
  value: number; // the fan-data number behind "why?" (0–1-ish; higher = more local)
  why: string; // one plain sentence with the numbers
  angle: string; // deterministic hint; the AI writer may replace it, citing ref
  question?: string; // crowd-work question (comics / speakers)
  cities?: string[]; // other cities in this request where the same ref also ranks
  written?: boolean; // angle written by the AI and passed the critic
  rank?: number; // 1 = best in this city across categories (rankIdeas); cap with a budget
  local?: true; // a local idea: seasoning on top of the act's own set, not a replacement
  image?: string; // entity image (fan data), for the tile avatar
  names?: string[]; // proper nouns in idea / angle / why (ref, city, style): shown bold via segments()
};

// Text as segments for display: exact occurrences of known names (from the idea's structured
// fields, never guessed from prose) become bold parts. Client-safe.
export type Part = { t: string } | { b: string };
export function segments(text: string, names: (string | undefined)[] = []): Part[] {
  const list = [...new Set(names.filter((n): n is string => !!n && n.length > 1))].sort((a, b) => b.length - a.length);
  const out: Part[] = [];
  let rest = text;
  while (rest) {
    let at = -1;
    let hit = "";
    for (const n of list) {
      const i = rest.indexOf(n);
      if (i >= 0 && (at < 0 || i < at)) (at = i), (hit = n);
    }
    if (at < 0) {
      out.push({ t: rest });
      break;
    }
    if (at > 0) out.push({ t: rest.slice(0, at) });
    out.push({ b: hit });
    rest = rest.slice(at + hit.length);
  }
  return out;
}

// Order a city's ideas for a budget ("a touch" = 1–2 per set): round-robin over categories in
// display order, best value first in each, so a small cap still mixes kinds of idea.
export function rankIdeas(ideas: Idea[], order: IdeaCategory[] = IDEA_CATEGORIES): Idea[] {
  const byCat = order.map((c) => ideas.filter((i) => i.category === c).sort((a, b) => b.value - a.value));
  const out: Idea[] = [];
  for (let round = 0; out.length < ideas.length; round++) {
    let any = false;
    for (const list of byCat) if (list[round]) (out.push(list[round]), (any = true));
    if (!any) break;
  }
  return out.map((i, n) => ({ ...i, rank: n + 1, local: true as const }));
}
export const capIdeas = (ideas: Idea[], budget?: number) => (budget && budget > 0 ? ideas.filter((i) => (i.rank ?? 0) <= budget) : ideas);

// Performance context (context/, PLAN §18 Q15) on one city's ideas: drop topics that hit the avoid
// list (covers are songs, not jokes: exempt), rank, then split by the originality budget. `use` =
// the local touches for this slot, `spare` = the rest, still ranked, for swapping in.
export function localIdeas(ideas: Idea[], opts: { order?: IdeaCategory[]; avoid?: AvoidList; max?: number; cap?: number } = {}): { use: Idea[]; spare: Idea[]; avoided: string[] } {
  const { kept, dropped } = opts.avoid ? dropAvoided(ideas, opts.avoid, (i) => `${i.idea} ${i.ref}`, { exempt: (i) => i.category === "cover" }) : { kept: ideas, dropped: [] };
  const ranked = capIdeas(rankIdeas(kept, opts.order), opts.cap);
  const { use, spare } = opts.max === undefined ? { use: ranked, spare: [] } : applyBudget(ranked, { max: opts.max });
  return { use, spare, avoided: dropped.map((d) => d.item.ref) };
}
// spare: ideas past the originality budget (still grounded, ranked); avoided: topics dropped by the avoid list.
export type CityIdeas = { city: string; ideas: Idea[]; empty?: string; spare?: Idea[]; country?: string; avoided?: number };
// line = full sentence (MCP); short = "Play Caamp in Columbus." (primary UI); detail = the
// comparison and numbers (behind a hint).
export type RegionIdea = { ref: string; idea: string; category: IdeaCategory; best: { city: string; value: number }[]; skip: string[]; line: string; short: string; detail: string; names: string[]; fit?: { city: string; value: number }[]; fitFrom?: "map" };
// fitFrom "map": fit is the tour-wide fan-data map (withHeatFit), 0–1; a city missing from it isn't in its data.

// Minimal entity / tag shape (Qloo insights results).
export type Ent = { name: string; entity_id?: string; tag_id?: string; popularity?: number; query?: { affinity?: number }; tags?: { tag_id?: string; id?: string; name: string }[]; properties?: Record<string, unknown> };
// Entity image URL when the fan data has one (properties.image.url).
export const imageOf = (e: Ent): string | undefined => {
  const img = e.properties?.image as { url?: unknown } | undefined;
  return typeof img?.url === "string" ? img.url : undefined;
};

export const norm = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const keyOf = (e: Ent) => norm(e.name);
const r2 = (n: number) => Math.round(n * 100) / 100;
const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function dedupe(list: Ent[]) {
  const seen = new Set<string>();
  return list.filter((e) => e.name && !seen.has(keyOf(e)) && !!seen.add(keyOf(e)));
}

// ---------- Covers ----------

export type CoverCand = { ref: string; key: string; cityRank: number; overallRank?: number; localRank?: number; score: number; popularity?: number; image?: string; genre?: string; year?: number };

// Audience age skew (context/audience.ts): a younger room lifts recent artists, an older room older
// ones, by `strength` score per decade from the list's mean year. Artists without a year (most:
// artist results rarely carry one) keep their score, so no years = no change.
export function skewCovers(list: CoverCand[], skew: Skew = "even", strength = 0.1): CoverCand[] {
  const years = list.map((c) => c.year).filter((y): y is number => y !== undefined);
  if (skew === "even" || !years.length) return list;
  const mid = years.reduce((a, b) => a + b, 0) / years.length;
  const dir = skew === "younger" ? 1 : -1;
  return list
    .map((c) => (c.year === undefined ? c : { ...c, score: r2(c.score + (dir * (c.year - mid) * strength) / 10) }))
    .sort((a, b) => b.score - a.score || a.cityRank - b.cityRank);
}
// The artist's first genre tag (fan data), for a specific cover angle.
// Music genres only, never place-like tags ("Chicago"); "hip - hop" → "hip-hop", "r & b" → "R&B".
const genreOf = (e: Ent) => {
  const t = e.tags?.find((t) => (t.tag_id ?? t.id ?? "").startsWith("urn:tag:genre:music:") && isGenre(t.name));
  return t ? tagCase(t.name) : undefined;
};
// A tag mid-sentence: lower case ("hip-hop", "dream pop"), acronyms and "R&B" kept.
export const tagCase = (name: string) =>
  name.trim().replace(/\s*-\s*/g, "-").replace(/^r\s*&\s*b$/i, "R&B").replace(/^(?![^&]*&)(?!.*[A-Z]{2}).*$/, (m) => m.toLowerCase());

// Musicians: artists the act's fans in this city rank high, and higher than the act's fans overall
// (lift = overall rank − city rank, as in set.ts), plus a bonus when the city as a whole (location
// only) also ranks them. Well-known acts first (popularity ≥ 0.8) when there are enough of them.
export function coverCandidates(opts: { fansHere: Ent[]; overall: Ent[]; cityTop: Ent[]; exclude?: string[]; skew?: Skew }): CoverCand[] {
  const ex = new Set((opts.exclude ?? []).map(norm));
  const overall = dedupe(opts.overall);
  const city = dedupe(opts.cityTop);
  const N = Math.max(overall.length, 25);
  const M = Math.max(city.length, 1);
  const oRank = new Map(overall.map((e, i) => [keyOf(e), i]));
  const cRank = new Map(city.map((e, i) => [keyOf(e), i]));
  const all = dedupe(opts.fansHere)
    .filter((e) => !ex.has(keyOf(e)))
    .map((e, i) => {
      const o = oRank.get(keyOf(e));
      const c = cRank.get(keyOf(e));
      const lift = ((o ?? N) - i) / N;
      const local = c === undefined ? 0 : (M - c) / M;
      return { ref: e.name, key: keyOf(e), cityRank: i + 1, overallRank: o === undefined ? undefined : o + 1, localRank: c === undefined ? undefined : c + 1, score: r2(lift + 0.5 * local), popularity: e.popularity, image: imageOf(e), genre: genreOf(e), year: entityYear(e) };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.cityRank - b.cityRank);
  const known = all.filter((c) => c.popularity === undefined || c.popularity >= 0.8);
  return skewCovers(known.length >= 3 ? known : all, opts.skew);
}

// Unknown act (or no fan data for it here): the city's own top artists, contrasted with the other
// cities in the request (an artist every city loves is not a local idea).
export function cityCoverCandidates(byCity: Map<string, Ent[]>, exclude: string[] = [], skew: Skew | Map<string, Skew> = "even"): Map<string, CoverCand[]> {
  const ex = new Set(exclude.map(norm));
  const lifted = contrast(byCity);
  return new Map(
    [...lifted].map(([city, list]) => [
      city,
      skewCovers(
        list.filter((x) => !ex.has(keyOf(x.e))).map((x) => ({ ref: x.e.name, key: keyOf(x.e), cityRank: x.rank, localRank: x.rank, score: x.score, popularity: x.e.popularity, image: imageOf(x.e), genre: genreOf(x.e), year: entityYear(x.e) })),
        typeof skew === "string" ? skew : skew.get(city),
      ),
    ]),
  );
}

// One cover per city per slot; the same cover goes only where it scores best (at most half the
// cities, at least one), so a tour gets different covers in cities with different taste.
export function assignCovers(cands: Map<string, CoverCand[]>, perCity = 3): Map<string, CoverCand[]> {
  const cities = [...cands.keys()];
  const cap = cities.length < 2 ? 1 : Math.ceil(cities.length / 2);
  const used = new Map<string, number>();
  const out = new Map<string, CoverCand[]>(cities.map((c) => [c, []]));
  const pool = cities.flatMap((city) => (cands.get(city) ?? []).map((c) => ({ city, c }))).sort((a, b) => b.c.score - a.c.score || a.c.cityRank - b.c.cityRank);
  for (const { city, c } of pool) {
    const got = out.get(city)!;
    if (got.length >= perCity || got.some((x) => x.key === c.key) || (used.get(c.key) ?? 0) >= cap) continue;
    got.push(c);
    used.set(c.key, (used.get(c.key) ?? 0) + 1);
  }
  // A city left short (its best covers went elsewhere) takes its own next best, shared or not.
  for (const city of cities) {
    const got = out.get(city)!;
    for (const c of cands.get(city) ?? []) {
      if (got.length >= Math.min(perCity, 2)) break;
      if (!got.some((x) => x.key === c.key)) got.push(c);
    }
  }
  return out;
}

// The card title already says "Cover X": the angle says why here and how, without repeating it.
function coverAngle(city: string, c: CoverCand, rawStyle?: string) {
  const style = rawStyle && tagCase(rawStyle);
  const what = c.genre && (!style || norm(c.genre) !== norm(style)) ? `Take their ${c.genre}` : "Take one of their songs";
  const how = style ? `${what} into your ${style} style` : `${what}, stripped back, your way`;
  if (c.overallRank === undefined && c.localRank !== undefined && c.localRank !== c.cityRank) return `${how}: your fans in ${city} and the city itself both rank them high.`;
  if (c.overallRank === undefined && c.localRank === undefined) return `${how}: your ${city} fans love them more than your fans elsewhere.`;
  if (c.overallRank !== undefined) return `${how}: your ${city} crowd ranks them well above your fans elsewhere.`;
  return `${how}: a ${city} favourite.`;
}

export function coverIdea(city: string, c: CoverCand, style?: string): Idea {
  const parts = [c.overallRank !== undefined || c.localRank === undefined || c.localRank !== c.cityRank ? `#${c.cityRank} with your fans in ${city}` : `#${c.cityRank} of the artists ${city} over-indexes on`];
  if (c.overallRank !== undefined) parts.push(`vs #${c.overallRank} with your fans overall`);
  else if (c.localRank === undefined || c.localRank !== c.cityRank) parts.push("and not in their overall top list");
  if (c.localRank !== undefined && c.localRank !== c.cityRank) parts.push(`#${c.localRank} in ${city} as a whole`);
  return {
    idea: `Cover ${c.ref}`,
    category: "cover",
    ref: c.ref,
    type: "artist",
    value: c.score,
    why: `${parts.join(", ")} (fan data, local lift ${c.score}).`,
    angle: coverAngle(city, c, style),
    names: [c.ref, city, ...(style ? [tagCase(style)] : []), ...(c.genre ? [c.genre] : [])],
    ...(c.image ? { image: c.image } : {}),
  };
}

// ---------- Local topics and subjects ----------

export type Ranked = { e: Ent; rank: number; elsewhere?: number; score: number };

// Location-only lists: rank here vs mean rank in the other cities (absent = list length + 1).
// One city: score is just rank. Higher score = more this city's own.
export function contrast(byCity: Map<string, Ent[]>): Map<string, Ranked[]> {
  const lists = new Map([...byCity].map(([c, l]) => [c, dedupe(l)]));
  const ranks = new Map([...lists].map(([c, l]) => [c, new Map(l.map((e, i) => [keyOf(e), i + 1]))]));
  const out = new Map<string, Ranked[]>();
  for (const [city, list] of lists) {
    const others = [...lists.keys()].filter((c) => c !== city);
    const L = Math.max(list.length, 1);
    out.set(
      city,
      list
        .map((e, i) => {
          const rank = i + 1;
          const own = (L + 1 - rank) / L;
          if (!others.length) return { e, rank, score: r2(own) };
          const elsewhere = others.reduce((n, o) => n + (ranks.get(o)!.get(keyOf(e)) ?? Math.max(lists.get(o)!.length, L) + 1), 0) / others.length;
          return { e, rank, elsewhere: r2(elsewhere), score: r2(own * 0.5 + Math.max(-1, Math.min(1, (elsewhere - rank) / L)) * 0.5) };
        })
        .sort((a, b) => b.score - a.score || a.rank - b.rank),
    );
  }
  return out;
}

type Bucket = { category: IdeaCategory; type: string; label: string }; // label: "TV", "brands"…

const hint = (kind: string, category: IdeaCategory, ref: string, city: string): { angle: string; question?: string } => {
  if (category === "banter") return { angle: `A line between songs about ${ref}.` };
  const mode = hintMode(kind);
  if (mode === "subject") {
    if (category === "landmarks") return { angle: `Make ${ref} your subject, from the angle locals know, not the postcard one.` };
    if (category === "food_places" || category === "cuisines") return { angle: `A study of ${ref} and the people around it.` };
    if (category === "themes") return { angle: `A small series on ${ref}, as ${city} sees it.` };
    return { angle: `A piece in conversation with ${ref}, which ${city} loves.` };
  }
  const q: Partial<Record<IdeaCategory, string>> = {
    screen: `Who here is watching ${ref}?`,
    trending: `Who's already sick of ${ref}?`,
    brands: `Who here would fight for ${ref}?`,
    food_places: `Who's been to ${ref} this week?`,
    cuisines: `Where does ${city} get the best ${ref}?`,
    people: `Who here is a ${ref} fan?`,
    themes: `What's the most ${city} thing about ${ref}?`,
    music: `Who here grew up on ${ref}?`,
    landmarks: `Who here has a ${ref} story?`,
    artists_films: `Who here loves ${ref}?`,
  };
  const premise: Partial<Record<IdeaCategory, string>> = {
    screen: `${city} loves ${ref}: what would it look like set here?`,
    trending: `${ref} is having a moment in ${city}: open on it.`,
    brands: `${city}'s loyalty to ${ref}, and what it says about the city.`,
    food_places: `${ref} as the place everyone in ${city} has a story about.`,
    cuisines: `${city}'s strong opinions about ${ref}.`,
    people: `${ref} as ${city}'s unofficial spokesperson.`,
    themes: `${city} and ${ref}: the bit only this crowd gets.`,
    music: `${ref} as the soundtrack of ${city}.`,
    landmarks: `${ref}, the way locals actually see it.`,
    artists_films: `${ref}, and why ${city} can't get enough of it.`,
  };
  return { angle: `${mode === "premise" ? "Premise" : "Local example"}: ${premise[category] ?? ref}`, question: q[category] };
};

// Pick per category for each city, best local score first, no name twice in a city.
export function topicIdeas(opts: {
  kind: string;
  buckets: { bucket: Bucket; byCity: Map<string, Ent[]> }[];
  quota: Partial<Record<IdeaCategory, number>>;
}): Map<string, Idea[]> {
  const out = new Map<string, Idea[]>();
  for (const { bucket, byCity } of opts.buckets) {
    const ranked = contrast(byCity);
    for (const [city, list] of ranked) {
      const ideas = out.get(city) ?? [];
      out.set(city, ideas);
      const want = opts.quota[bucket.category] ?? 2;
      let have = ideas.filter((i) => i.category === bucket.category).length;
      for (const x of list) {
        if (have >= want) break;
        if (ideas.some((i) => norm(i.ref) === keyOf(x.e))) continue;
        const aff = x.e.query?.affinity;
        const why =
          `#${x.rank} of the ${bucket.label} ${city} over-indexes on` +
          (x.elsewhere !== undefined ? (x.elsewhere > x.rank ? `, vs #${Math.round(x.elsewhere)} on average in the other cities` : ", about as high elsewhere") : "") +
          ` (fan data${aff !== undefined ? `, affinity ${r2(aff)}` : ""}, local score ${x.score}).`;
        ideas.push({ idea: x.e.name, category: bucket.category, ref: x.e.name, type: bucket.type, value: x.score, why, names: [x.e.name, city], ...(imageOf(x.e) ? { image: imageOf(x.e) } : {}), ...hint(opts.kind, bucket.category, x.e.name, city) });
        have++;
      }
    }
  }
  return out;
}

// ---------- Region view and grounding ----------

// Marks ideas that also rank in other cities, and ranks the strongest ideas across the cities:
// "Play AC/DC in Brisbane and Perth, not Sydney".
export function regionView(cities: CityIdeas[], scores: Map<string, Map<string, number>>, take = 6): RegionIdea[] {
  if (cities.length < 2) return [];
  const byRef = new Map<string, { idea: Idea; in: Set<string> }>();
  for (const c of cities)
    for (const i of c.ideas) {
      const k = norm(i.ref);
      const cur = byRef.get(k) ?? { idea: i, in: new Set<string>() };
      cur.in.add(c.city);
      if (i.value > cur.idea.value) cur.idea = i;
      byRef.set(k, cur);
    }
  for (const c of cities)
    for (const i of c.ideas) {
      const others = [...(byRef.get(norm(i.ref))?.in ?? [])].filter((x) => x !== c.city);
      if (others.length) i.cities = others;
    }
  const names = cities.map((c) => c.city);
  return [...byRef.entries()]
    .map(([k, { idea, in: where }]) => {
      const best = names
        .filter((n) => where.has(n))
        .map((city) => ({ city, value: scores.get(k)?.get(city) ?? cities.find((c) => c.city === city)!.ideas.find((i) => norm(i.ref) === k)!.value }))
        .sort((a, b) => b.value - a.value);
      const skip = names.filter((n) => !where.has(n));
      // Every city's number for this ref (heat grid): the winners, plus skipped cities where the
      // ref was still a scored candidate. A city with no number isn't in its data.
      const fit = names.flatMap((city) => {
        const v = best.find((b) => b.city === city)?.value ?? scores.get(k)?.get(city);
        return v === undefined ? [] : [{ city, value: v }];
      });
      const verb = idea.category === "cover" ? `Play ${idea.ref}` : idea.category === "landmarks" || idea.category === "themes" ? `Paint ${idea.ref}` : `Use ${idea.ref}`;
      const where2 = and(best.map((b) => b.city));
      return {
        ref: idea.ref,
        idea: idea.idea,
        category: idea.category,
        best,
        skip,
        line: `${verb} in ${where2}${skip.length ? `, not ${and(skip)}` : ""}.`,
        short: `${verb} in ${where2}.`,
        detail: `${skip.length ? `Ranks lower in ${and(skip)}. ` : ""}Local score: ${best.map((b) => `${b.city} ${b.value}`).join(", ")} (fan data).`,
        names: [idea.ref, ...names],
        fit,
        top: best[0]?.value ?? 0,
      };
    })
    .filter((r) => r.skip.length) // an idea for every city isn't a regional call
    .sort((a, b) => (b.category === "cover" ? 1 : 0) - (a.category === "cover" ? 1 : 0) || b.top - a.top)
    .slice(0, take)
    .map(({ top: _top, ...r }) => r);
}

// ---------- Tour-wide fit from one fan-data map per idea ----------

// The region grid only knows an idea's number in cities where it was in that city's own lists.
// ideas.ts makes ONE heatmap call per region idea (signal = the idea's id, filter.location = a
// MULTIPOLYGON of a box round each tour city) and this turns the cells into a 0–1 fit per city,
// with the same blend as score.ts scoreCities() (keep the two in step):
//   footprint = log1p(Σ affinity × popularity), overIndex = mean(affinity_rank), fit = 0.6·f + 0.4·o
// normalised across the cities that got cells (min → 0 = "weak here"). No cells = not in its data.
export type GeoCity = { name: string; lat: number; lon: number };
export type HeatCell = { location: { latitude: number; longitude: number }; query: { affinity: number; affinity_rank: number; popularity: number } };
export const HEAT_BOX_KM = 30; // half-width of each city's box; cells beyond it are ignored

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const rad = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLon - aLon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const f5 = (n: number) => Math.round(n * 1e5) / 1e5;

// WKT, longitude first (parameters.md filter.location): one closed square per city.
export function cityBoxes(cities: GeoCity[], halfKm = HEAT_BOX_KM): string {
  const dLat = halfKm / 111.32;
  const rings = cities.map((c) => {
    const dLon = halfKm / (111.32 * Math.max(0.1, Math.cos((c.lat * Math.PI) / 180)));
    const [w, e, s, n] = [c.lon - dLon, c.lon + dLon, c.lat - dLat, c.lat + dLat].map(f5);
    return `((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
  });
  return `MULTIPOLYGON(${rings.join(", ")})`;
}

// Per-city fit 0–1 from one heatmap response; each cell goes to its nearest city within the box.
export function heatFit(cells: HeatCell[], cities: GeoCity[], radiusKm = HEAT_BOX_KM * 1.42): Map<string, number> {
  const by = new Map<string, HeatCell[]>();
  for (const cell of cells) {
    let best: string | undefined;
    let dist = radiusKm;
    for (const c of cities) {
      const d = km(cell.location.latitude, cell.location.longitude, c.lat, c.lon);
      if (d <= dist) (best = c.name), (dist = d);
    }
    if (best) by.set(best, [...(by.get(best) ?? []), cell]);
  }
  const got = cities.filter((c) => by.get(c.name)?.length);
  const m = got.map((c) => {
    const l = by.get(c.name)!;
    return { city: c.name, footprint: Math.log1p(l.reduce((n, x) => n + x.query.affinity * x.query.popularity, 0)), overIndex: l.reduce((n, x) => n + x.query.affinity_rank, 0) / l.length };
  });
  const scale = (vs: number[]) => {
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    return vs.map((v) => (hi === lo ? 1 : (v - lo) / (hi - lo)));
  };
  const f = scale(m.map((x) => x.footprint));
  const o = scale(m.map((x) => x.overIndex));
  const raw = m.map((_, i) => 0.6 * f[i] + 0.4 * o[i]);
  const s = scale(raw);
  return new Map(m.map((x, i) => [x.city, r2(m.length < 2 ? 1 : s[i])]));
}

// Region rows with the map fit (same city order); rows without one keep their list numbers.
export function withHeatFit(region: RegionIdea[], fits: Map<string, Map<string, number>>, cities: string[]): RegionIdea[] {
  return region.map((r) => {
    const f = fits.get(norm(r.ref));
    if (!f?.size) return r;
    const fit = cities.filter((c) => f.has(c)).map((city) => ({ city, value: f.get(city)! }));
    const top = [...fit].sort((a, b) => b.value - a.value)[0];
    const weak = fit.filter((x) => x.value === 0).map((x) => x.city);
    const map = `Across your tour, fans of ${r.ref} lean most to ${top.city}${weak.length ? `, least to ${and(weak)}` : ""} (fan data map, fit 0–1).`;
    return { ...r, fit, fitFrom: "map" as const, detail: `${r.detail} ${map}`, names: [...new Set([...r.names, ...fit.map((x) => x.city)])] };
  });
}

// Critic: a written line counts only if its ref is one of that city's ideas and the text uses it.
export type WrittenLine = { ref: string; angle: string; question?: string };
export function groundLines(ideas: Idea[], lines: WrittenLine[]): { kept: Map<string, WrittenLine>; dropped: string[] } {
  const known = new Set(ideas.map((i) => norm(i.ref)));
  const kept = new Map<string, WrittenLine>();
  const dropped: string[] = [];
  for (const l of lines) {
    const k = norm(l.ref);
    if (!known.has(k)) dropped.push(`"${l.ref}" is not in this city's fan data`);
    else if (!norm(l.angle).includes(k)) dropped.push(`the line for "${l.ref}" doesn't use it`);
    else if (l.question && !norm(l.question).includes(k)) kept.set(k, { ref: l.ref, angle: l.angle });
    else kept.set(k, l);
  }
  return { kept, dropped };
}

// Group a city's ideas for display, in a fixed order.
export function grouped(ideas: Idea[]): { category: IdeaCategory; label: string; ideas: Idea[] }[] {
  return IDEA_CATEGORIES
    .map((category) => ({ category, label: CATEGORY_LABEL[category], ideas: ideas.filter((i) => i.category === category) }))
    .filter((g) => g.ideas.length);
}
