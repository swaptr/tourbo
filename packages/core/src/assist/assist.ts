import { localBudget, type Flavour } from "../context/budget.ts";
import { slotFor } from "../context/slots.ts";
import { ideaItem } from "../engine/explain-facts.ts";
import { groundCheck, money, times, type ExplainItem, type Fact } from "../engine/explain.ts";
import type { Idea } from "../engine/ideas-rank.ts";
import { defaultType, MATERIAL_TYPES, type MaterialType, type Origin } from "../material/material.ts";
import { PerformerKind, REGION_NAMES, type CityPlan, type Plan, type Region } from "../shared/types.ts";

// AI assists (PLAN Q21): the rules half. Every assist is deterministic first (this file, pure and
// client-safe, no LLM); the server (apps/web/server/agent/assist.server.ts) may let the AI fill
// gaps or shorten a line, and the critic keeps only what these facts allow. Fan data is the hero:
// every chip here comes from a saved plan, saved ideas or the act's own text.

export const ASSIST_TASKS = ["library_parse", "library_tags", "title", "row_insight", "build_set", "profile_suggest"] as const;
export type AssistTask = (typeof ASSIST_TASKS)[number];
export type AssistSource = "fan data" | "ai" | "rules";
// One chip under a draft; detail is the "why?" popover text.
export type AssistEvidence = { label: string; detail?: string; source: "fan data" | "your text" | "rules"; hedged?: boolean };
export type AssistResult<T> = { draft: T; evidence: AssistEvidence[]; source: AssistSource; notice?: string; limited?: boolean; cached?: boolean };

// Drafts per task (what /api/assist returns in `draft`).
export type ParseDraft = { items: ParsedItem[]; unread: number; skipped: number };
export type TagsDraft = { items: (ItemTags & { title: string })[] };
export type TitleDraft = { title: string; alternatives: string[] };
export type RowDraft = { runId: string; line: string; evidence: AssistEvidence[]; source: "fan data" | "ai" };
export type RowsDraft = { rows: RowDraft[] };
export type BuildSetDraft = SetDraft;
export type ProfileDraft = ProfileSuggestion;

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const cityKey = (s?: string) => norm((s ?? "").split(",")[0]);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- library_parse: pasted text → library items ----------

export type ParsedItem = {
  title: string;
  type: MaterialType;
  lengthMin?: number;
  origin: Origin;
  by?: string; // the original artist, when the text says so
  tags: string[];
  line: number; // 1-based line in the paste
  guess?: ("origin" | "type" | "length")[]; // fields that are a guess, shown hedged
  from: "rules" | "ai";
};
export type ParseResult = { items: ParsedItem[]; gaps: { line: number; text: string }[]; skipped: number };

const HEADER = /^(?:set\s*list|setlist|set\s*\d+|first set|second set|encore|intro|outro|break|intermission|interval|notes?|bits?|songs?|talks?|[-=_*~]{3,})\s*:?$/i;
const MMSS = /[([]?\b(\d{1,2}):([0-5]\d)\b[)\]]?/;
const MINUTES = /[([]?~?\s*\b(\d{1,3}(?:[.,]\d)?)\s*(?:m|min|mins|minutes|')(?![a-z])[)\]]?/i;
const TYPE_WORDS: Record<string, MaterialType> = { song: "song", bit: "bit", joke: "bit", talk: "talk", lecture: "talk", keynote: "talk", piece: "piece", painting: "piece", poem: "piece", routine: "routine", trick: "routine", act: "routine" };
const SET_WORDS = new Set(["opener", "closer", "banger", "slow", "encore", "ballad", "new"]);
const PROSE = /^(?:we|i|i'm|then|usually|and|after|before|maybe|also|sometimes|my|our)\b/i;

function cleanTitle(s: string) {
  return s
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/[\s,;:.–—-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120);
}

// One line → an item, or "prose" (a gap the AI may read), or nothing (a header / blank).
export function parseLine(raw: string, kind?: string): Omit<ParsedItem, "line"> | "prose" | undefined {
  let s = raw.trim().replace(/^(?:[-*•·>]+|#?\d+[.):]|#\d+)\s+/, "").trim();
  const tidy = (t: string) => t.replace(/\s+[–—-](?:\s+[–—-])+\s+/g, " – ").replace(/\s+[–—|-]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  if (!s || HEADER.test(s) || /:$/.test(s)) return undefined;
  const tags: string[] = [];
  let type: MaterialType | undefined;
  let origin: Origin | undefined;
  let by: string | undefined;
  let lengthMin: number | undefined;

  const mmss = s.match(MMSS);
  if (mmss) {
    lengthMin = Number(mmss[1]) + Number(mmss[2]) / 60;
    s = s.replace(mmss[0], " ");
  } else {
    const m = s.match(MINUTES);
    if (m) {
      lengthMin = Number(m[1].replace(",", "."));
      s = s.replace(m[0], " ");
    }
  }
  // Cover markers: "(cover)", "[cover]", "cover: X", "cover of X", "(X cover)", "(by X)", "(orig. X)".
  const coverOf = s.match(/^cover(?:\s+of)?\s*[:-]?\s+(.+)$/i);
  if (coverOf) (s = coverOf[1]), (origin = "cover");
  s = s.replace(/[([]\s*(?:a\s+)?cover\s*[)\]]/i, () => ((origin = "cover"), " "));
  s = s.replace(/[([]\s*(?:by|orig\.?|originally by)\s+([^)\]]+)[)\]]/i, (_, who: string) => ((origin = "cover"), (by = who.trim()), " "));
  s = s.replace(/[([]\s*([^)\]]+?)\s+cover\s*[)\]]/i, (_, who: string) => ((origin = "cover"), (by = who.trim()), " "));
  s = s.replace(/[([]\s*(?:original|own|mine|new)\s*[)\]]/i, (w) => ((origin = "original"), /new/i.test(w) && tags.push("new"), " "));

  s = tidy(s);
  // Separators: "Title – note | 4 min"; a comma only splits off known words ("Title, opener, 4").
  const parts = s.split(/\s*[|;\t]\s*|\s+[–—-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  for (let m = parts[0].match(/,\s*([^,]+)$/); m; m = parts[0].match(/,\s*([^,]+)$/)) {
    const w = m[1].trim().toLowerCase();
    if (/^\d+(?:\.\d+)?$/.test(w)) lengthMin ??= Number(w);
    else if (!TYPE_WORDS[w] && !SET_WORDS.has(w) && !/^(?:cover|original|own|mine)$/.test(w)) break;
    else parts.splice(1, 0, w);
    parts[0] = parts[0].slice(0, m.index).trim();
  }
  let title = parts[0];
  for (const p of parts.slice(1)) {
    const w = p.toLowerCase().replace(/[()[\]]/g, "").trim();
    if (TYPE_WORDS[w]) type = TYPE_WORDS[w];
    else if (SET_WORDS.has(w)) tags.push(w === "ballad" ? "slow" : w);
    else if (w === "cover") origin = "cover";
    else if (/^(?:original|own|mine)$/.test(w)) origin = "original";
    else if (!by && /^\p{Lu}/u.test(p) && p.split(/\s+/).length <= 4 && kind !== undefined && defaultType(kind) === "song") {
      // "Hey Jude – The Beatles": a name after the dash reads as the original artist (a guess).
      by = p;
      origin ??= "cover";
    }
  }
  // "bit: airline food" / "song: Paprika" prefixes.
  const pre = title.match(/^(song|bit|joke|talk|piece|poem|routine|trick)\s*[:-]\s*(.+)$/i);
  if (pre) (type = TYPE_WORDS[pre[1].toLowerCase()]), (title = pre[2]);
  title = cleanTitle(title);
  if (!title) return undefined;
  if (title.split(/\s+/).length > 10 || (PROSE.test(title) && title.split(/\s+/).length > 4) || /[.!?]\s+\p{L}/u.test(title)) return "prose";
  const guess: ParsedItem["guess"] = [];
  if (by && !/cover|orig|by/i.test(raw)) guess.push("origin");
  return { title, type: type ?? defaultType(kind), lengthMin: lengthMin !== undefined && lengthMin > 0 && lengthMin <= 600 ? r1(lengthMin) : undefined, origin: origin ?? "original", ...(by ? { by: by.slice(0, 80) } : {}), tags: [...new Set(tags)], ...(guess.length ? { guess } : {}), from: "rules" };
}

export const MAX_PARSE = 80;
export function parseLibrary(text: string, kind?: string): ParseResult {
  const items: ParsedItem[] = [];
  const gaps: ParseResult["gaps"] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let encore = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*encore\s*:?\s*$/i.test(raw)) encore = true;
    const r = parseLine(raw, kind);
    if (!r) return void (raw.trim() && skipped++);
    if (r === "prose") return void gaps.push({ line: i + 1, text: raw.trim().slice(0, 400) });
    const k = norm(r.title);
    if (seen.has(k) || items.length >= MAX_PARSE) return void skipped++;
    seen.add(k);
    items.push({ ...r, tags: encore && !r.tags.includes("encore") ? [...r.tags, "encore"] : r.tags, line: i + 1 });
  });
  return { items, gaps, skipped };
}

// Critic for AI-read items: the title must be in the pasted text; a length only if its number is.
export function groundParsed(ai: { title: string; type?: string; lengthMin?: number; origin?: string; by?: string }[], text: string, kind?: string, line = 0): ParsedItem[] {
  const hay = norm(text);
  const nums = new Set([...text.matchAll(/\d+(?:[.,:]\d+)?/g)].map((m) => m[0]));
  return ai.flatMap((a) => {
    const title = cleanTitle(a.title ?? "");
    if (!title || !hay.includes(norm(title))) return [];
    const len = a.lengthMin !== undefined && [...nums].some((n) => Math.abs(Number(n.replace(",", ".").split(":")[0]) - a.lengthMin!) < 1) ? r1(a.lengthMin) : undefined;
    const type = (MATERIAL_TYPES as readonly string[]).includes(a.type ?? "") ? (a.type as MaterialType) : defaultType(kind);
    const by = a.by && hay.includes(norm(a.by)) ? a.by.slice(0, 80) : undefined;
    const origin: Origin = a.origin === "cover" ? "cover" : "original";
    const guess: ParsedItem["guess"] = [];
    if (origin === "cover" && !/cover|orig|by/i.test(text)) guess.push("origin");
    if (len === undefined && a.lengthMin !== undefined) guess.push("length");
    return [{ title, type, ...(len !== undefined ? { lengthMin: len } : {}), origin, ...(by ? { by } : {}), tags: [], line, ...(guess.length ? { guess } : {}), from: "ai" as const }];
  });
}

// ---------- library_tags: mood / energy / topic ----------

export const MOODS = ["upbeat", "tender", "wistful", "dark", "playful", "angry", "hopeful"] as const;
export const ENERGIES = ["high", "mid", "low"] as const;
export const TOPICS = ["love", "heartbreak", "family", "work", "money", "travel", "city life", "food", "dating", "school", "politics", "faith", "nature", "technology", "sports", "home", "friends", "growing up", "music", "health", "getting older", "parties", "night life"] as const;
export type Mood = (typeof MOODS)[number];
export type Energy = (typeof ENERGIES)[number];
export type ItemTags = { mood: Mood[]; energy?: Energy; topics: string[]; tags: string[]; from: "rules" | "ai" | "none" };

const MOOD_WORDS: Record<Mood, string[]> = {
  upbeat: ["dance", "party", "happy", "sun", "summer", "celebrat", "joy", "bright", "banger", "shine", "good time"],
  tender: ["love", "heart", "kiss", "darling", "baby", "sweet", "tender", "lullaby", "hold"],
  wistful: ["goodbye", "miss", "memor", "remember", "yesterday", "leaving", "rain", "alone", "lonely", "last"],
  dark: ["dark", "death", "die", "ghost", "blood", "black", "fear", "grave", "devil"],
  playful: ["silly", "funny", "weird", "crazy", "cat", "dog", "banana", "joke"],
  angry: ["hate", "fight", "war", "angry", "rage", "riot", "burn"],
  hopeful: ["hope", "tomorrow", "rise", "new day", "light", "dream"],
};
const HIGH = ["banger", "opener", "dance", "party", "fast", "loud", "jump", "fire", "run", "wild", "rock"];
const LOW = ["slow", "ballad", "acoustic", "lullaby", "quiet", "soft", "sleep", "piano", "whisper"];
const TOPIC_WORDS: Record<string, string[]> = {
  love: ["love", "lover", "kiss", "heart"],
  heartbreak: ["breakup", "break up", "heartbreak", "ex ", "goodbye"],
  family: ["mom", "mum", "dad", "mother", "father", "sister", "brother", "family", "kids", "grandma", "wedding"],
  work: ["job", "boss", "office", "work", "shift"],
  money: ["money", "rent", "cash", "broke", "bills"],
  travel: ["airport", "flight", "plane", "road", "train", "travel", "hotel", "tour"],
  "city life": ["city", "subway", "street", "downtown", "uber", "traffic"],
  food: ["food", "pizza", "taco", "coffee", "kitchen", "cook", "dinner", "eat"],
  dating: ["dating", "date", "tinder", "app", "single"],
  school: ["school", "teacher", "college", "class"],
  politics: ["politic", "vote", "election", "government"],
  faith: ["church", "god", "pray", "faith", "heaven"],
  nature: ["ocean", "river", "mountain", "forest", "sea", "garden", "moon", "sky"],
  technology: ["phone", "internet", "ai", "computer", "robot", "online"],
  sports: ["football", "soccer", "basketball", "baseball", "gym", "sport"],
  home: ["home", "house", "hometown"],
  friends: ["friend", "buddy", "crew"],
  "growing up": ["kid", "teen", "growing up", "childhood", "young"],
  music: ["song", "band", "guitar", "radio", "record"],
  health: ["doctor", "hospital", "therapy", "sick", "health"],
  "getting older": ["old", "aging", "birthday", "forty", "thirty"],
  parties: ["party", "drunk", "bar", "wedding"],
  "night life": ["club", "night", "dj", "bar"],
};

const hasWord = (hay: string, w: string) => (w.endsWith(" ") || w.includes(" ") ? hay.includes(w) : new RegExp(`\\b${w}`).test(hay));
export function tagsFromWords(item: { title: string; notes?: string; tags?: string[] }): ItemTags {
  const hay = ` ${norm(`${item.title} ${item.notes ?? ""} ${(item.tags ?? []).join(" ")}`)} `;
  const mood = MOODS.filter((m) => MOOD_WORDS[m].some((w) => hasWord(hay, w))).slice(0, 2);
  const hi = HIGH.some((w) => hasWord(hay, w));
  const lo = LOW.some((w) => hasWord(hay, w));
  const energy: Energy | undefined = hi && !lo ? "high" : lo && !hi ? "low" : undefined;
  const topics = Object.entries(TOPIC_WORDS)
    .filter(([, ws]) => ws.some((w) => hasWord(hay, w)))
    .map(([t]) => t)
    .slice(0, 2);
  return withFlat({ mood, energy, topics, from: mood.length || energy || topics.length ? "rules" : "none" });
}
// Flat tags for the library (Material.tags): "upbeat", "high energy", "family".
export function withFlat(t: Omit<ItemTags, "tags">): ItemTags {
  return { ...t, tags: [...new Set([...t.mood, ...(t.energy ? [`${t.energy} energy`] : []), ...t.topics])].slice(0, 6) };
}
// Energy of a library item from its saved tags (for set building).
export function energyOf(tags: string[] = []): Energy | undefined {
  const t = tags.map((x) => x.toLowerCase());
  if (t.some((x) => x === "high energy" || x === "banger" || x === "upbeat" || x === "opener")) return "high";
  if (t.some((x) => x === "low energy" || x === "slow" || x === "ballad" || x === "tender")) return "low";
  if (t.includes("mid energy")) return "mid";
  return undefined;
}

// ---------- title: auto title for a tour or show ----------

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "DC", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const MIDWEST = new Set(["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"]);
const WEST_COAST = new Set(["CA", "OR", "WA"]);
const EAST_COAST = new Set(["ME", "NH", "MA", "RI", "CT", "NY", "NJ", "PA", "DE", "MD", "DC", "VA"]);
const SOUTH = new Set(["TX", "OK", "AR", "LA", "MS", "AL", "TN", "KY", "GA", "FL", "SC", "NC"]);

export type TitleCity = { name: string; admin1?: string; country?: string; countryName?: string };
export type TitleInput = { kind?: string; mode?: "tour" | "event"; cities: TitleCity[]; startDate?: string; endDate?: string; region?: Region };

export function seasonOf(date?: string, region?: Region): string | undefined {
  if (!date || !/^\d{4}-\d{2}/.test(date)) return undefined;
  const m = Number(date.slice(5, 7)) - 1;
  // Southern-hemisphere regions flip the seasons; "fall" is North American English.
  const south = region === "oceania";
  const idx = Math.floor(((m + 1) % 12) / 3); // 0 winter (Dec–Feb), 1 spring, 2 summer, 3 autumn
  const names = ["winter", "spring", "summer", region === "na" ? "fall" : "autumn"];
  return names[south ? (idx + 2) % 4 : idx];
}
const SHOW_NOUN: Partial<Record<PerformerKind, string>> = { comedian: "comedy night", visual_artist: "gallery show", photographer: "photo show", speaker: "talk", teacher: "workshop", author: "reading", podcaster: "live show", dj: "DJ night", poet: "reading", chef: "supper club", filmmaker: "screening" };

// Area shared by every city: a US state, a US area, a country, or the tour region.
function sharedArea(cities: TitleCity[], region?: Region): string | undefined {
  const us = cities.every((c) => c.country === "US" && c.admin1);
  if (us) {
    const states = new Set(cities.map((c) => c.admin1!));
    if (states.size === 1) return US_STATES[[...states][0]];
    for (const [set, name] of [[MIDWEST, "Midwest"], [WEST_COAST, "West Coast"], [EAST_COAST, "East Coast"], [SOUTH, "Southern"]] as const) if ([...states].every((s) => set.has(s))) return name;
  }
  const countries = new Set(cities.map((c) => c.countryName ?? c.country).filter(Boolean));
  if (countries.size === 1 && cities.every((c) => c.countryName ?? c.country)) {
    const n = [...countries][0]!;
    return n.length > 3 ? n : undefined;
  }
  return region ? REGION_NAMES[region] : undefined;
}

export function titleFor(i: TitleInput): { title: string; facts: Fact[]; names: string[] } {
  const cities = i.cities.filter((c) => c.name?.trim());
  const season = seasonOf(i.startDate, i.region);
  const year = i.startDate?.slice(0, 4);
  const names = cities.map((c) => c.name.split(",")[0].trim());
  const facts: Fact[] = [];
  if (season) facts.push({ key: "season", label: "season of the first date", value: season });
  if (year) facts.push({ key: "year", label: "year", value: Number(year) });
  const event = i.mode === "event" || cities.length === 1;
  if (event) {
    const noun = SHOW_NOUN[i.kind as PerformerKind] ?? "show";
    const city = names[0];
    const title = city ? cap(`${season ? `${season} ${noun}` : noun} in ${city}`) : cap(season ? `${season} ${noun}` : `New ${noun}`);
    return { title, facts, names };
  }
  const area = sharedArea(cities, i.region);
  if (area) {
    if (area !== REGION_NAMES[i.region as Region] || cities.length > 2) {
      const what = area === REGION_NAMES[i.region as Region] || cities.length >= 8 ? "tour" : "run";
      const title = cap(`${area} ${season ? `${season} ` : ""}${what}${area === REGION_NAMES[i.region as Region] && year ? ` ${year}` : ""}`);
      return { title, facts, names: [...names, area] };
    }
  }
  if (names.length >= 2) return { title: cap(`${names[0]} to ${names[names.length - 1]}${season ? `, ${season} ${year ?? ""}`.trimEnd() : ""}`), facts, names };
  return { title: cap(`${season ? `${season} ` : ""}tour${year ? ` ${year}` : ""}`), facts, names };
}

// Words a written title may use besides the facts: seasons, months and plain tour words.
export const TITLE_WORDS = ["Spring", "Summer", "Fall", "Autumn", "Winter", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Tour", "Run", "Live", "Night", "Nights", "Show", "Tonight", "Coast", "East", "West", "North", "South", "Midwest", "DJ"];

// Critic for an AI title: names from the facts or plain title words, the exact year, max 6 words.
export function titleCheck(text: string, t: { facts: Fact[]; names: string[] }): boolean {
  const s = text.replace(/["“”]/g, "").trim();
  if (!s || s.split(/\s+/).length > 6) return false;
  const year = t.facts.find((f) => f.key === "year")?.value;
  if ([...s.matchAll(/\b\d{4}\b/g)].some((m) => Number(m[0]) !== year)) return false;
  const item: ExplainItem = { id: "title", kind: "pick", subject: t.names[0] ?? "Tour", facts: t.facts, names: [...t.names, ...TITLE_WORDS], evidence: "strong" };
  return groundCheck(s, item).ok;
}

// ---------- row_insight: one line per tour or show, from the saved plan ----------

export type RowInsight = { line: string; item: ExplainItem; evidence: AssistEvidence[] };

export function rowInsight(plan: Pick<Plan, "stops" | "medianFanIndex" | "money" | "artist">, id = "row"): RowInsight | undefined {
  const stops = plan.stops.filter((s) => Number.isFinite(s.score));
  if (!stops.length) return undefined;
  const name = (s: CityPlan) => s.city.name.split(",")[0];
  const cur = plan.money?.currency ?? stops.find((s) => s.money)?.money?.currency ?? "USD";
  const facts: Fact[] = [];
  const evidence: AssistEvidence[] = [];
  const strongest = [...stops].sort((a, b) => b.score - a.score)[0];
  const lean = (s: CityPlan) => (s.fanIndex && plan.medianFanIndex ? s.fanIndex / plan.medianFanIndex : undefined);
  const leaned = stops.map((s) => ({ s, x: lean(s) })).filter((x): x is { s: CityPlan; x: number } => x.x !== undefined && x.x >= 1.3).sort((a, b) => b.x - a.x)[0];
  const parts: string[] = [];

  if (stops.length === 1) {
    const s = stops[0];
    const score = Math.round(s.score);
    facts.push({ key: "fan", label: `fan strength in ${name(s)}`, value: score, unit: "score" });
    evidence.push({ label: `fan strength ${score} in ${name(s)}`, detail: `How strong your fan base is in ${name(s)}, 0–100 (fan data).`, source: "fan data", hedged: score < 50 });
    // Plain words in the line; the numbers live in the evidence ("why?").
    let line = `${name(s)}: ${score >= 70 ? "a strong" : score >= 45 ? "a solid" : "a small"} fan base`;
    const x = lean(s);
    if (x && x >= 1.3) {
      facts.push({ key: "lean", label: "times more concentrated than a typical city", value: r1(x), unit: "x" });
      line = `${name(s)} is a fan hotspot`;
    }
    if (s.money) {
      facts.push({ key: "profit", label: "estimated profit", value: Math.round(s.money.profit), unit: "money" });
      line += s.money.profit < 0 ? "; may lose money" : "; should turn a profit";
      evidence.push({ label: `${s.money.profit < 0 ? "loses" : "earns"} about ${money(Math.abs(s.money.profit), s.money.currency)}`, detail: "Tourbo's money estimate for this night: tickets, deal and costs.", source: "rules", hedged: true });
    }
    return { line: `${line}.`, item: { id, kind: "pick", subject: name(s), facts, names: [name(s)], currency: cur, evidence: "strong" }, evidence };
  }

  if (leaned) {
    const x = r1(leaned.x);
    facts.push({ key: "lean", label: `times more concentrated in ${name(leaned.s)} than a typical city`, value: x, unit: "x" });
    parts.push(`${name(leaned.s)} is your fan hotspot`);
    evidence.push({ label: `${name(leaned.s)} ${times(x)} a typical city`, detail: `Your fans are ${times(x)} more concentrated in ${name(leaned.s)} than in a typical city on this tour (fan data).`, source: "fan data" });
  }
  if (!leaned || leaned.s !== strongest) {
    const score = Math.round(strongest.score);
    facts.push({ key: "top", label: `fan strength in ${name(strongest)}`, value: score, unit: "score" });
    parts.push(`${name(strongest)} has your biggest fan base`);
    evidence.push({ label: `${name(strongest)} fan strength ${score}`, detail: `The strongest fan base on this tour, 0–100 (fan data).`, source: "fan data" });
  }
  const losing = stops.filter((s) => s.money && s.money.profit < 0).sort((a, b) => a.money!.profit - b.money!.profit)[0];
  const weakest = [...stops].sort((a, b) => a.score - b.score)[0];
  if (losing) {
    const loss = Math.round(Math.abs(losing.money!.profit));
    facts.push({ key: "loss", label: `estimated loss in ${name(losing)}`, value: loss, unit: "money" });
    parts.push(`${name(losing)} may lose money`);
    evidence.push({ label: `${name(losing)} loses about ${money(loss, losing.money!.currency)}`, detail: "Tourbo's money estimate for that night; check the deal or the room.", source: "rules", hedged: true });
  } else if (weakest !== strongest && weakest !== leaned?.s) {
    const score = Math.round(weakest.score);
    facts.push({ key: "low", label: `fan strength in ${name(weakest)}`, value: score, unit: "score" });
    parts.push(`${name(weakest)} has the fewest fans`);
    evidence.push({ label: `${name(weakest)} fan strength ${score}`, detail: "The weakest fan base on this tour, 0–100 (fan data).", source: "fan data", hedged: true });
  }
  const line = `${parts.slice(0, 2).join("; ")}.`;
  return { line, item: { id, kind: "pick", subject: name(strongest), facts, names: stops.map(name), currency: cur, evidence: "strong" }, evidence };
}

// ---------- build_set: order library items for one night ----------

export type LibraryItem = { id?: string; title: string; type?: string; lengthMin?: number; tags?: string[]; origin: Origin; source?: { ref: string; city?: string; category?: string } };
export type Nod = { ref: string; title: string; category?: string; chip: string; detail: string; hedged?: boolean; materialId?: string; minutes?: number };
export type SetRole = "open" | "build" | "breather" | "nod" | "peak" | "close";
export type SetDraftItem = { materialId?: string; title: string; minutes: number; timed: boolean; origin: Origin; role: SetRole; reason: string; chip?: string; detail?: string; hedged?: boolean; isNew?: boolean };
export type SetDraft = { city: string; slot: string; slotLabel: string; target: number; minutes: number; order: SetDraftItem[]; left: number; note: string };

const isTalky = (kind?: string) => ["bit", "talk"].includes(defaultType(kind));
const coversFit = (kind?: string) => defaultType(kind) === "song";

// 1–2 local nods for a city from what's saved: kept local ideas in the library first, then saved
// ideas for the city, then the saved plan's own facts (local artists for music, city culture).
export function nodsFor(opts: { city: string; kind?: string; library: LibraryItem[]; ideas?: Idea[]; stop?: Pick<CityPlan, "localArtists" | "facts">; take?: number }): Nod[] {
  const { city } = opts;
  const c = city.split(",")[0];
  const out: Nod[] = [];
  const seen = new Set<string>();
  const add = (n: Nod) => {
    const k = norm(n.ref);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(n);
  };
  const ideas = [...(opts.ideas ?? [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const chipOf = (i: Idea) => {
    const item = ideaItem(c, i);
    return item.chip ? { chip: item.chip.text, hedged: item.chip.hedged } : { chip: `popular in ${c}`, hedged: true };
  };
  for (const m of opts.library) {
    if (m.origin !== "local_idea" || !m.source || cityKey(m.source.city) !== cityKey(city)) continue;
    const idea = ideas.find((i) => norm(i.ref) === norm(m.source!.ref));
    add({ ref: m.source.ref, title: m.title, category: m.source.category, materialId: m.id, minutes: m.lengthMin, ...(idea ? { ...chipOf(idea), detail: idea.why } : { chip: `kept for ${c}`, hedged: true, detail: `You kept this idea for ${c} from its fan data.` }) });
  }
  for (const i of ideas) {
    if (!coversFit(opts.kind) && i.category === "cover") continue;
    add({ ref: i.ref, title: i.idea || i.ref, category: i.category, ...chipOf(i), detail: i.why });
  }
  const s = opts.stop;
  if (s && coversFit(opts.kind)) for (const a of (s.localArtists ?? []).slice(0, 2)) add({ ref: a.name, title: `Cover: ${a.name}`, category: "cover", chip: `${c} fans play ${a.name}`, detail: `${a.name} ranks high with your fans in ${c} (fan data).`, hedged: true });
  if (s?.facts) for (const r of s.facts.cityCulture.slice(0, 2)) add({ ref: r.name, title: `${c} nod: ${r.name}`, category: "topic", chip: `${c} loves ${r.name}`, detail: `${r.name} is one of the things ${c} over-indexes on (fan data). One line about it, in your own words.`, hedged: true });
  return out.slice(0, opts.take ?? 4);
}

export function buildSetDraft(opts: { items: LibraryItem[]; kind?: string; city: string; slot?: string; minutes?: number; flavour?: Flavour; nods?: Nod[] }): SetDraft {
  const kind = opts.kind ?? "musician";
  const slot = slotFor(kind, opts.slot ?? "headline");
  const target = Math.round(opts.minutes && opts.minutes > 0 ? opts.minutes : slot.unit === "minutes" ? slot.size : 45);
  const per = isTalky(kind) ? 5 : 4;
  const c = opts.city.split(",")[0];
  const mins = (m: { lengthMin?: number }) => (m.lengthMin && m.lengthMin > 0 ? m.lengthMin : per);
  const budget = localBudget({ ...slot, size: target }, opts.flavour ?? "touch", per);
  const nodsWanted = budget.max === 0 ? 0 : Math.min(2, budget.max, opts.nods?.length ?? 0);
  const nods = (opts.nods ?? []).slice(0, nodsWanted);
  const nodIds = new Set(nods.map((n) => n.materialId).filter(Boolean));
  // The act's own material leads: originals, then covers; local ideas only arrive as nods.
  const own = opts.items.filter((m) => m.origin !== "local_idea" && !nodIds.has(m.id));
  const originals = own.filter((m) => m.origin === "original");
  const covers = own.filter((m) => m.origin === "cover");
  const nodMinutes = nods.reduce((s, n) => s + (n.minutes ?? per), 0);
  const room = Math.max(per, target - nodMinutes);
  const tagged = (m: LibraryItem, t: string) => (m.tags ?? []).some((x) => x.toLowerCase() === t);
  // Must-haves first (tagged opener / closer), then the rest in the act's own order.
  const priority = [...originals.filter((m) => tagged(m, "opener") || tagged(m, "closer")), ...originals, ...covers];
  const picked: LibraryItem[] = [];
  let total = 0;
  for (const m of priority) {
    if (picked.includes(m)) continue;
    if (total >= room) break;
    if (total + mins(m) > room + Math.max(2, room * 0.1) && picked.length) continue;
    picked.push(m);
    total += mins(m);
  }
  const energy = (m: LibraryItem) => energyOf(m.tags);
  const pool = [...picked];
  const take = (pred: (m: LibraryItem) => boolean) => {
    const i = pool.findIndex(pred);
    return i >= 0 ? pool.splice(i, 1)[0] : undefined;
  };
  const opener = take((m) => tagged(m, "opener")) ?? take((m) => m.origin === "original" && energy(m) === "high") ?? take((m) => m.origin === "original") ?? take(() => true);
  const closer = pool.length ? (take((m) => tagged(m, "closer") || tagged(m, "encore")) ?? take((m) => m.origin === "original" && energy(m) === "high") ?? take((m) => m.origin === "original" && energy(m) !== "low") ?? pool.pop()) : undefined;
  const peak = pool.length > 2 ? take((m) => energy(m) === "high") : undefined;
  // Middle: the act's own songs with one breather past the middle, covers spread between them
  // (always after at least one original).
  const origs = pool.filter((m) => m.origin === "original");
  const covs = pool.filter((m) => m.origin !== "original");
  const slowAt = origs.findIndex((m) => energy(m) === "low");
  if (slowAt >= 0) {
    const [slow] = origs.splice(slowAt, 1);
    origs.splice(Math.ceil(origs.length * 0.6), 0, slow);
  }
  const spread = [...origs];
  covs.forEach((m, k) => spread.splice(Math.min(spread.length, Math.max(1, Math.round(((k + 1) * (origs.length + 1)) / (covs.length + 1))) + k), 0, m));

  const row = (m: LibraryItem, role: SetRole): SetDraftItem => {
    const yours = m.origin === "original";
    const reason =
      role === "open" ? (tagged(m, "opener") ? "Your opener" : yours ? "Opens with your own material" : "Opens the night")
      : role === "close" ? (tagged(m, "closer") ? "Your closer" : "Ends on one of yours")
      : role === "peak" ? "Lifts the room before the close"
      : role === "breather" ? "A slower one to let the room breathe"
      : yours ? "Your own" : "A cover the room knows";
    return { ...(m.id ? { materialId: m.id } : {}), title: m.title, minutes: mins(m), timed: !!m.lengthMin, origin: m.origin, role, reason, chip: yours ? "your own" : m.origin === "cover" ? "cover" : undefined };
  };
  const order: SetDraftItem[] = [];
  if (opener) order.push(row(opener, "open"));
  for (const m of spread) order.push(row(m, energy(m) === "low" ? "breather" : "build"));
  if (peak) order.push(row(peak, "peak"));
  if (closer) order.push(row(closer, "close"));
  // Nods sit inside the set (~40% and ~70%), never first or last: seasoning, not the set.
  // A short set (the library doesn't fill the slot) gets one nod at most: seasoning stays small.
  const used = total < target * 0.85 ? nods.slice(0, 1) : nods;
  used.forEach((n, k) => {
    const at = Math.max(1, Math.min(order.length - (closer ? 1 : 0), Math.round(order.length * (k === 0 ? 0.4 : 0.7))));
    const nodRow: SetDraftItem = { ...(n.materialId ? { materialId: n.materialId } : { isNew: true }), title: n.title, minutes: n.minutes ?? per, timed: !!n.minutes, origin: "local_idea", role: "nod", reason: `A nod to ${c}`, chip: n.chip, detail: n.detail, hedged: n.hedged };
    order.splice(at, 0, nodRow);
  });
  const minutes = Math.round(order.reduce((s, e) => s + e.minutes, 0) * 2) / 2;
  const left = opts.items.filter((m) => m.origin !== "local_idea").length - order.filter((e) => e.origin !== "local_idea").length;
  const note = !order.length
    ? "Add a few songs or bits to your library first."
    : minutes < target * 0.85
      ? `About ${Math.round(target - minutes)} min short of the ${slot.label} slot; add more of your own.`
      : `Fits a ${target}-min ${slot.label} slot: your material first${used.length ? `, ${used.length} local nod${used.length > 1 ? "s" : ""}` : ""}.`;
  return { city: opts.city, slot: slot.key, slotLabel: slot.label, target, minutes, order, left: Math.max(0, left), note };
}

export function setEvidence(d: SetDraft, kind?: string): AssistEvidence[] {
  const yours = d.order.filter((e) => e.origin === "original").length;
  const out: AssistEvidence[] = [];
  if (d.order.length) out.push({ label: `${yours} of ${d.order.length} are yours`, detail: "Originals lead; local nods season the set and never replace it.", source: "rules" });
  for (const e of d.order) if (e.role === "nod" && e.chip) out.push({ label: e.chip, detail: e.detail, source: "fan data", hedged: e.hedged });
  out.push({ label: `${d.minutes} of ${d.target} min`, detail: `Untimed items count as ${isTalky(kind) ? 5 : 4} min until you set a length.`, source: "rules", hedged: d.order.some((e) => !e.timed) });
  return out;
}

// ---------- profile_suggest: kinds + home base from the act lookup ----------

const GENRE_KIND: [RegExp, PerformerKind][] = [
  [/comed|stand ?up|sketch|improv/i, "comedian"],
  [/podcast/i, "podcaster"],
  [/\b(?:dj|house|techno|edm|trance|drum and bass|dubstep|electronic dance)\b/i, "dj"],
  [/poet|spoken word|slam/i, "poet"],
  [/magic|illusion/i, "magician"],
  [/\bdance\b|ballet|choreo/i, "dancer"],
  [/theat|musical|broadway|opera/i, "theatre"],
  [/circus|acrobat/i, "circus"],
  [/lectur|keynote|motivational/i, "speaker"],
];

export type SavedHome = { name: string; lat: number; lon: number; count: number };
export type ProfileSuggestion = { kinds: PerformerKind[]; home?: { name: string; lat: number; lon: number }; homeFrom?: "your plans" | "fan data" };

export function suggestProfile(i: { genres?: string[]; savedKinds?: string[]; savedHomes?: SavedHome[]; strongest?: { name: string; lat: number; lon: number; score: number } }): { draft: ProfileSuggestion; evidence: AssistEvidence[] } {
  const evidence: AssistEvidence[] = [];
  const kinds: PerformerKind[] = [];
  const push = (k: string) => {
    const p = PerformerKind.safeParse(k);
    if (p.success && !kinds.includes(p.data)) kinds.push(p.data);
  };
  const saved = [...new Set(i.savedKinds ?? [])];
  saved.forEach(push);
  if (saved.length) evidence.push({ label: `planned as ${saved.join(", ").replace(/_/g, " ")}`, detail: "From the plans you've already made with Tourbo.", source: "rules" });
  const genres = (i.genres ?? []).slice(0, 6);
  for (const g of genres) {
    const hit = GENRE_KIND.find(([re]) => re.test(g));
    push(hit ? hit[1] : "musician");
  }
  if (genres.length) evidence.push({ label: genres.slice(0, 3).join(", "), detail: "Styles the fan data lists for this act.", source: "fan data" });
  let home: ProfileSuggestion["home"];
  let homeFrom: ProfileSuggestion["homeFrom"];
  const top = [...(i.savedHomes ?? [])].sort((a, b) => b.count - a.count)[0];
  if (top) {
    home = { name: top.name, lat: top.lat, lon: top.lon };
    homeFrom = "your plans";
    evidence.push({ label: `home base ${top.name}`, detail: `You started ${top.count === 1 ? "a plan" : `${top.count} plans`} from ${top.name}.`, source: "rules" });
  } else if (i.strongest) {
    home = { name: i.strongest.name, lat: i.strongest.lat, lon: i.strongest.lon };
    homeFrom = "fan data";
    evidence.push({ label: `fans strongest in ${i.strongest.name}`, detail: `Fan strength ${Math.round(i.strongest.score)} of 100 in ${i.strongest.name}, the best in your saved plans (fan data). Only a hint: change it if home is elsewhere.`, source: "fan data", hedged: true });
  }
  return { draft: { kinds: kinds.slice(0, 4), ...(home ? { home, homeFrom } : {}) }, evidence };
}
