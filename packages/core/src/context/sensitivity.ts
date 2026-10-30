import type { Tone } from "../places/types.ts";
import { countryOf, regionPolicy, type RegionNote, type TopicId } from "./regions.ts";

// Sensitivity (PLAN §18 Q15): an avoid list per act and place, used in AI prompts and by a
// deterministic critic that drops AI-written lines hitting it. Three layers:
// 1. Universal never-punch-down rules: groups (race, ethnicity, religion, caste, disability,
//    sexuality, gender identity, nationality / immigrants) are never the butt of a suggested line.
//    Comedy ethics background: https://ethics.org.au/punching-up-who-does-it-serve/ and
//    https://cupola.gettysburg.edu/philfac/86 (the up/down line is contested; we stay conservative
//    because these lines are machine-suggested, not the act's own).
// 2. The act's boundaries: clean (default for most) or any of edgy / dark / political.
// 3. Region notes (regions.ts) with sources, plus a taste signal (does the city's own taste lean
//    to dark / adult comedy or family-friendly) that only shifts advice, never the hard rules.
// Guidance, not legal advice. The act's own pasted material is never filtered, only suggestions.
// Client-safe.

export const BOUNDARIES = ["clean", "edgy", "dark", "political"] as const;
export type Boundary = (typeof BOUNDARIES)[number];
export const BOUNDARY_LABEL: Record<Boundary, string> = { clean: "Clean", edgy: "Edgy", dark: "Dark", political: "Political" };
export const GUIDANCE_NOTE = "Guidance, not legal advice: check local rules and the venue.";

// Topic words the critic matches (whole words, case-insensitive; "*" = any word ending).
export const TOPICS: Record<TopicId | "faith_groups" | "ethnic_groups" | "group_butt" | "profanity" | "sex" | "drugs" | "death", { label: string; terms: string[] }> = {
  faith_groups: { label: "religious groups", terms: ["hindu*", "muslim*", "islam*", "christian*", "catholic*", "jew", "jews", "jewish", "sikh*", "buddhist*", "atheist*", "religion*", "religious"] },
  ethnic_groups: { label: "race, ethnicity, caste or nationality", terms: ["race", "racial", "racist", "ethnic*", "skin colour", "skin color", "caste*", "dalit*", "brahmin*", "immigrant*", "refugee*", "foreigner*", "tribe*"] },
  religion: { label: "religion and religious figures", terms: ["religion*", "religious", "god", "gods", "allah", "prophet*", "muhammad", "mohammed", "jesus", "christ", "krishna", "shiva", "ganesh*", "hanuman", "buddha", "guru", "deity", "deities", "temple*", "mosque*", "church*", "gurdwara*", "quran", "koran", "bible", "gita", "scripture*", "holy", "sacred", "blasphem*", "hindu*", "muslim*", "islam*", "christian*", "jew", "jews", "jewish", "sikh*", "buddhist*", "pope", "imam*", "priest*", "rabbi*"] },
  royalty: { label: "the royal family", terms: ["king", "queen", "royal*", "monarch*", "monarchy", "prince", "princess", "crown prince"] },
  head_of_state: { label: "the head of state", terms: ["president", "prime minister", "chancellor", "head of state"] },
  military: { label: "the military", terms: ["army", "armed forces", "military", "soldier*", "troops", "navy", "air force"] },
  national_tragedy: { label: "national tragedies", terms: ["tragedy", "disaster", "massacre", "plane crash", "terror attack"] },
  politics: { label: "party politics", terms: ["politic*", "election*", "minister*", "government", "parliament", "senator*", "congressman", "mayor", "governor", "chief minister", "vote", "voters", "bjp", "congress party", "republican*", "democrat*", "tory", "tories", "labour party"] },
  ethnicity: { label: "race and ethnicity", terms: ["race", "racial", "racist", "ethnic*", "skin colour", "skin color", "tribe*", "caste*", "dalit*", "brahmin*", "immigrant*", "refugee*", "foreigner*", "accent*"] },
  sexuality: { label: "sexuality and gender identity", terms: ["gay", "gays", "lesbian*", "homosexual*", "transgender", "trans", "queer", "bisexual*", "lgbt*"] },
  obscenity: { label: "obscene or explicit jokes", terms: ["porn*", "obscen*", "genital*", "masturbat*", "incest"] },
  group_butt: { label: "a group as the butt of the joke", terms: ["disabled", "disability", "wheelchair*", "autistic", "autism", "retard*", "cripple*", "midget*", "dwarf*", "deaf", "blind people", "mentally ill"] },
  profanity: { label: "swearing", terms: ["fuck*", "shit*", "bitch*", "bastard*", "asshole*", "arsehole*", "dick", "cunt*", "motherf*"] },
  sex: { label: "sex jokes", terms: ["sex", "sexy", "sexual*", "horny", "orgasm*", "porn*", "hooker*", "stripper*", "nude*", "naked"] },
  drugs: { label: "drug jokes", terms: ["weed", "cocaine", "coke", "stoned", "high on", "drunk", "meth", "lsd", "ecstasy", "mdma"] },
  death: { label: "death and tragedy", terms: ["death", "dead", "die", "dying", "died", "suicide", "kill*", "murder*", "funeral*", "cancer", "rape*", "abortion*", "corpse*", "grave*"] },
};
export type AvoidTopic = keyof typeof TOPICS;

export type AvoidRule = {
  topic: AvoidTopic;
  scope: "universal" | "boundary" | "region";
  why: string; // one plain line
  terms: string[];
  source?: { title: string; url: string };
};
export type EdgeLean = { lean: "edgier" | "cleaner" | "neutral"; score: number; refs: string[] };
export type AvoidList = {
  kind: string;
  country?: string;
  boundaries: Boundary[];
  rules: AvoidRule[];
  advice: string[]; // softer lines (taste lean, "keep it clean early")
  notes: RegionNote[]; // the region notes behind the rules (for "why?")
  disclaimer: string;
};

// Universal: the never-punch-down groups (named groups only; broader religion words such as
// "god" or "temple" join where a region note asks for it). Suggestions only: the act can still
// write their own.
const UNIVERSAL: AvoidTopic[] = ["ethnic_groups", "faith_groups", "sexuality", "group_butt"];

// Talking kinds default to "edgy" only for comics; everyone else defaults to clean.
export function defaultBoundaries(kind: string): Boundary[] {
  return kind === "comedian" ? ["edgy"] : ["clean"];
}

export function parseBoundaries(v: unknown, kind = "musician"): Boundary[] {
  const list = (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim()).filter((x): x is Boundary => (BOUNDARIES as readonly string[]).includes(x));
  if (!list.length) return defaultBoundaries(kind);
  return list.includes("clean") && list.length > 1 ? list.filter((b) => b !== "clean") : [...new Set(list)];
}

// Taste signal for edginess: tag names on the city's own most-followed entities (comics, TV,
// films; any QlooEntity-like list with tags), rank-weighted. Positive = edgier, negative = cleaner.
const EDGY_TAG = /\b(dark comedy|black comedy|dark humou?r|adult (animation|comedy)|raunchy|crude|satir\w*|political comedy|shock|insult comedy|roast)\b/i;
const CLEAN_TAG = /\b(family|kids?|children'?s|clean comedy|wholesome|christian comedy|faith)\b/i;
export function edgeFromTaste(entities: { name: string; tags?: { name?: string }[] }[]): EdgeLean {
  const N = Math.max(entities.length, 1);
  let score = 0;
  const refs: string[] = [];
  entities.forEach((e, i) => {
    const names = (e.tags ?? []).map((t) => t.name ?? "").join(" | ");
    const w = 1 - i / N;
    const edgy = EDGY_TAG.test(names);
    const clean = CLEAN_TAG.test(names);
    if (edgy && !clean) score += w;
    if (clean && !edgy) score -= w;
    if ((edgy || clean) && edgy !== clean && refs.length < 3) refs.push(e.name);
  });
  score = Math.round(score * 100) / 100;
  return { lean: score >= 1 ? "edgier" : score <= -1 ? "cleaner" : "neutral", score, refs };
}

// `tone` (place features, places/derive.ts): open-data tone strictness adds region topics
// (religion, politics, leaders) and its advice lines on top of the region notes.
export function avoidList(kind: string, place: { country?: string; query?: string; name?: string; region?: string } | string | undefined, boundaries: Boundary[] = defaultBoundaries(kind), taste?: EdgeLean, tone?: Pick<Tone, "addTopics" | "advice" | "strictness">): AvoidList {
  const b = parseBoundaries(boundaries, kind);
  const country = typeof place === "string" ? (place.length === 2 ? place.toUpperCase() : countryOf({ query: place })) : place ? countryOf(place) : undefined;
  const policy = regionPolicy(country);
  const rules: AvoidRule[] = [];
  const add = (topic: AvoidTopic, scope: AvoidRule["scope"], why: string, extra: string[] = [], source?: AvoidRule["source"]) => {
    const cur = rules.find((r) => r.topic === topic);
    if (cur) {
      cur.terms = [...new Set([...cur.terms, ...extra])];
      if (scope === "region" && !cur.source) Object.assign(cur, { scope, why, source });
      return;
    }
    rules.push({ topic, scope, why, terms: [...TOPICS[topic].terms, ...extra], source });
  };
  for (const t of UNIVERSAL) add(t, "universal", `Never make ${TOPICS[t].label} the butt of a joke.`);
  if (!b.includes("edgy") && !b.includes("dark")) {
    add("profanity", "boundary", "You chose clean: no swearing.");
    add("sex", "boundary", "You chose clean: no sex jokes.");
    add("drugs", "boundary", "You chose clean: no drug jokes.");
  }
  if (!b.includes("dark")) add("death", "boundary", "You didn't choose dark: no jokes about death or tragedy.");
  if (!b.includes("political")) add("politics", "boundary", "You didn't choose political: no party politics.");
  for (const note of policy?.notes ?? []) for (const t of note.avoid) add(t, "region", `${policy!.name}: ${note.text}`, note.terms ?? [], note.source);
  const where = policy?.name ?? (typeof place === "object" ? place?.name : undefined) ?? "Here";
  if (tone && tone.strictness !== "standard") for (const t of tone.addTopics) add(t, "region", `${where}: open data says keep ${TOPICS[t].label} out of the material.`);
  const advice: string[] = [];
  if (taste?.lean === "cleaner" && (b.includes("edgy") || b.includes("dark"))) advice.push(`This city's taste leans family-friendly${taste.refs.length ? ` (${taste.refs.join(", ")})` : ""}: open clean, save the edgier bits for later.`);
  if (taste?.lean === "edgier" && !b.includes("clean")) advice.push(`This city's taste leans darker${taste.refs.length ? ` (${taste.refs.join(", ")})` : ""}: your edgier bits should land, the rules above still hold.`);
  if (policy?.notes.some((x) => x.avoid.length)) advice.push(`${policy.name} has laws or recent cases on some topics: see why.`);
  if (tone && tone.strictness !== "standard") for (const a of tone.advice) if (!advice.includes(a)) advice.push(a);
  return { kind, country, boundaries: b, rules, advice, notes: policy?.notes ?? [], disclaimer: GUIDANCE_NOTE };
}

// Prompt fragment for AI writers (show notes, set reasons).
export function avoidPrompt(list: AvoidList): string {
  const lines = list.rules.map((r) => `- ${TOPICS[r.topic].label}: ${r.why}`);
  return `Sensitivity (hard rules for every line you write; the act's boundaries: ${list.boundaries.join(", ")}):\n${lines.join("\n")}${list.advice.length ? `\nAdvice: ${list.advice.join(" ")}` : ""}\nNever write a line that touches these topics. Put any warning for the act in an "avoid" note instead, in plain words.`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termRe = (t: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(t.toLowerCase()).replace(/\\\*$/, "[\\p{L}\\p{N}']*")}(?![\\p{L}\\p{N}])`, "iu");
const RE_CACHE = new Map<string, RegExp>();
const re = (t: string) => {
  let r = RE_CACHE.get(t);
  if (!r) RE_CACHE.set(t, (r = termRe(t)));
  return r;
};

export type AvoidHit = { topic: AvoidTopic; term: string; scope: AvoidRule["scope"] };
// Hits of a text against the list. `allow`: grounded names (a band called Queen, a show named
// "The Prophet") are removed from the text before matching so they don't trip the check.
export function checkAgainstAvoid(text: string, list: AvoidList | AvoidRule[], allow: string[] = []): AvoidHit[] {
  const rules = Array.isArray(list) ? list : list.rules;
  let t = ` ${text} `;
  for (const a of allow.filter((x) => x && x.length > 1).sort((x, y) => y.length - x.length)) t = t.replace(new RegExp(escape(a), "gi"), " ");
  const hits: AvoidHit[] = [];
  for (const r of rules) {
    const term = r.terms.find((x) => re(x).test(t));
    if (term) hits.push({ topic: r.topic, term, scope: r.scope });
  }
  return hits;
}

// Keep the lines that pass; `avoid`-type notes (warnings to the act) are exempt via `exempt`.
export function dropAvoided<T>(items: T[], list: AvoidList, text: (x: T) => string, opts: { allow?: string[]; exempt?: (x: T) => boolean } = {}): { kept: T[]; dropped: { item: T; hits: AvoidHit[] }[] } {
  const kept: T[] = [];
  const dropped: { item: T; hits: AvoidHit[] }[] = [];
  for (const it of items) {
    const hits = opts.exempt?.(it) ? [] : checkAgainstAvoid(text(it), list, opts.allow);
    if (hits.length) dropped.push({ item: it, hits });
    else kept.push(it);
  }
  return { kept, dropped };
}
