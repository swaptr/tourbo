import type { Skew } from "../context/audience.ts";
import type { Boundary } from "../context/sensitivity.ts";
import { IDEA_CATEGORIES, norm, type CityIdeas, type Idea, type IdeaCategory } from "./ideas-rank.ts";

// The act's feedback on ideas (PLAN §18 Q19): Keep (pin), Not for me (hide + avoid similar),
// More like this, and a short "Tell Tourbo" note parsed into constraints. Pure and client-safe:
// the AI (server) only turns the note into `Constraints`; everything here is deterministic.
// Most feedback just re-orders / filters the saved ideas; only a constraint that changes what is
// asked of the fan data (era, clean) makes the cities it applies to fetch again.

export type IdeaMark = { city: string; ref: string; category: IdeaCategory };
export type Constraints = {
  avoidRefs: string[]; // names to never suggest
  avoidCategories: IdeaCategory[];
  avoidWords: string[]; // words that must not appear in an idea's name or angle
  preferCategories: IdeaCategory[];
  era?: "recent" | "classic"; // covers / references: newer or older acts
  clean?: boolean; // keep it clean (comics, speakers)
  maxPerCity?: number;
  cities?: string[]; // only these cities (empty = every city)
};
export type IdeaFeedback = { pins: IdeaMark[]; hides: IdeaMark[]; more: IdeaMark[]; note?: string; constraints?: Constraints; parsedBy?: "ai" | "words" };
export const EMPTY_FEEDBACK: IdeaFeedback = { pins: [], hides: [], more: [] };
export const EMPTY_CONSTRAINTS: Constraints = { avoidRefs: [], avoidCategories: [], avoidWords: [], preferCategories: [] };

export type FeedbackChange =
  | { op: "pin" | "unpin" | "hide" | "unhide" | "more" | "unmore"; mark: IdeaMark }
  | { op: "note"; note: string; constraints: Constraints; parsedBy: "ai" | "words" }
  | { op: "dropConstraint"; field: keyof Constraints; value?: string }
  | { op: "clear" };

// by: the "Not for me" that hid it (undo that one to bring it back); reason note = the Tell Tourbo note.
export type HiddenIdea = Idea & { reason: "yours" | "similar" | "note"; by?: IdeaMark };
export type CityWithFeedback = CityIdeas & { hidden?: HiddenIdea[]; pinned?: string[]; noMore?: IdeaCategory[] };

const same = (a: IdeaMark, b: IdeaMark) => norm(a.city) === norm(b.city) && norm(a.ref) === norm(b.ref);
const STOP = new Set(["the", "and", "of", "a", "an", "in", "on", "at", "for", "to", "with", "la", "le", "el", "de", "los", "las", "show", "live", "band", "club", "city"]);
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));

export function changeFeedback(fb: IdeaFeedback, c: FeedbackChange): IdeaFeedback {
  const without = (list: IdeaMark[], m: IdeaMark) => list.filter((x) => !same(x, m));
  switch (c.op) {
    case "pin":
      return { ...fb, pins: [...without(fb.pins, c.mark), c.mark], hides: without(fb.hides, c.mark) };
    case "unpin":
      return { ...fb, pins: without(fb.pins, c.mark) };
    case "hide":
      return { ...fb, hides: [...without(fb.hides, c.mark), c.mark], pins: without(fb.pins, c.mark), more: without(fb.more, c.mark) };
    case "unhide":
      return { ...fb, hides: without(fb.hides, c.mark) };
    case "more":
      return { ...fb, more: [...without(fb.more, c.mark), c.mark] };
    case "unmore":
      return { ...fb, more: without(fb.more, c.mark) };
    case "note":
      return { ...fb, note: c.note.trim().slice(0, 200) || undefined, constraints: cleanConstraints(c.constraints), parsedBy: c.parsedBy };
    case "dropConstraint": {
      const k = fb.constraints;
      if (!k) return fb;
      const v = k[c.field];
      const next = { ...k, [c.field]: Array.isArray(v) && c.value !== undefined ? (v as string[]).filter((x) => x !== c.value) : undefined };
      return { ...fb, constraints: cleanConstraints(next as Constraints) };
    }
    case "clear":
      return EMPTY_FEEDBACK;
  }
}

// Bounds and dedupes whatever a parser returned.
export function cleanConstraints(k: Partial<Constraints> | undefined): Constraints {
  const list = (v: unknown, max = 12) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, max);
  const cats = (v: unknown) => list(v).filter((x): x is IdeaCategory => (IDEA_CATEGORIES as string[]).includes(x));
  const max = typeof k?.maxPerCity === "number" && Number.isFinite(k.maxPerCity) ? Math.max(1, Math.min(12, Math.round(k.maxPerCity))) : undefined;
  return {
    avoidRefs: list(k?.avoidRefs),
    avoidCategories: cats(k?.avoidCategories),
    avoidWords: list(k?.avoidWords).map((w) => w.toLowerCase()),
    preferCategories: cats(k?.preferCategories),
    ...(k?.era === "recent" || k?.era === "classic" ? { era: k.era } : {}),
    ...(k?.clean ? { clean: true } : {}),
    ...(max ? { maxPerCity: max } : {}),
    ...(list(k?.cities).length ? { cities: list(k?.cities, 8) } : {}),
  };
}

export const hasConstraints = (k?: Constraints) =>
  !!k && !!(k.avoidRefs.length || k.avoidCategories.length || k.avoidWords.length || k.preferCategories.length || k.era || k.clean || k.maxPerCity);

// Constraints as short removable chips ("No sports", "Recent acts"), each with the field it drops.
export function constraintChips(k: Constraints | undefined, label: (c: IdeaCategory) => string = (c) => c): { text: string; field: keyof Constraints; value?: string }[] {
  if (!k) return [];
  const scope = k.cities?.length ? ` (${k.cities.join(", ")})` : "";
  return [
    ...k.avoidRefs.map((v) => ({ text: `Not ${v}`, field: "avoidRefs" as const, value: v })),
    ...k.avoidCategories.map((v) => ({ text: `No ${label(v).toLowerCase()}`, field: "avoidCategories" as const, value: v })),
    ...k.avoidWords.map((v) => ({ text: `Nothing about "${v}"`, field: "avoidWords" as const, value: v })),
    ...k.preferCategories.map((v) => ({ text: `More ${label(v).toLowerCase()}`, field: "preferCategories" as const, value: v })),
    ...(k.era ? [{ text: k.era === "recent" ? "Recent acts" : "Classic acts", field: "era" as const }] : []),
    ...(k.clean ? [{ text: "Keep it clean", field: "clean" as const }] : []),
    ...(k.maxPerCity ? [{ text: `At most ${k.maxPerCity} per city`, field: "maxPerCity" as const }] : []),
  ].map((c) => ({ ...c, text: c.text + scope }));
}

// ---------- The deterministic "Tell Tourbo" fallback (no AI key) ----------

const CATEGORY_WORDS: [RegExp, IdeaCategory][] = [
  [/\b(sport|sports|team|teams|brand|brands)\b/, "brands"],
  [/\b(tv|television|film|films|movie|movies|podcast|podcasts|shows?)\b/, "screen"],
  [/\b(food|restaurant|restaurants|bar|bars|places?)\b/, "food_places"],
  [/\b(cuisine|cuisines|dish|dishes)\b/, "cuisines"],
  [/\b(celebrit(y|ies)|people|famous)\b/, "people"],
  [/\b(trend|trending|news)\b/, "trending"],
  [/\b(cover|covers)\b/, "cover"],
  [/\b(landmark|landmarks)\b/, "landmarks"],
  [/\b(theme|themes)\b/, "themes"],
];

export function parseNoteWords(note: string, cities: string[] = []): Constraints {
  const t = ` ${note.toLowerCase()} `;
  const k: Partial<Constraints> = { avoidRefs: [], avoidCategories: [], avoidWords: [], preferCategories: [] };
  // Clauses split on , ; . and "but"; a clause with no / not / avoid / skip / less / without is negative.
  for (const clause of t.split(/[,;.]|\bbut\b/)) {
    const neg = /\b(no|not|avoid|skip|less|without|never|don'?t|drop)\b/.test(clause);
    const pos = /\b(more|prefer|love|lots of|add)\b/.test(clause);
    for (const [re, cat] of CATEGORY_WORDS) if (re.test(clause)) (neg ? k.avoidCategories! : pos ? k.preferCategories! : []).push(cat);
    if (/\b(clean|family|no swearing|no profanity)\b/.test(clause)) k.clean = true;
    if (/\b(recent|new|newer|modern|current)\b/.test(clause)) k.era = "recent";
    if (/\b(classic|classics|old|older|oldies|retro)\b/.test(clause)) k.era = "classic";
    const quoted = [...clause.matchAll(/"([^"]{2,40})"/g)].map((m) => m[1]);
    if (neg) k.avoidWords!.push(...quoted);
    const n = /\b(?:at most|max(?:imum)?|only)\s+(\d{1,2})\b/.exec(clause);
    if (n) k.maxPerCity = Number(n[1]);
  }
  const named = cities.filter((c) => t.includes(` ${c.toLowerCase().split(",")[0]}`));
  if (named.length && named.length < cities.length) k.cities = named;
  return cleanConstraints(k);
}

// ---------- Applying feedback to a saved payload ----------

const inScope = (k: Constraints, city: string) => !k.cities?.length || k.cities.some((c) => norm(c) === norm(city));

// Similar to a hidden idea: the same name in any city, or the same category sharing a name word
// ("Detroit Lions" hidden → "Detroit Pistons" too). Two hides in a category push the rest of it
// to the end of that city's list.
function similar(i: Idea, city: string, hides: IdeaMark[]): { reason: "yours" | "similar"; by: IdeaMark } | undefined {
  for (const h of hides) if (norm(h.ref) === norm(i.ref) && norm(h.city) === norm(city)) return { reason: "yours", by: h };
  for (const h of hides) {
    if (norm(h.ref) === norm(i.ref)) return { reason: "similar", by: h };
    if (h.category === i.category && words(h.ref).some((w) => words(i.ref).includes(w))) return { reason: "similar", by: h };
  }
  return undefined;
}

function blockedByNote(i: Idea, k: Constraints | undefined, city: string): boolean {
  if (!k || !inScope(k, city)) return false;
  if (k.avoidCategories.includes(i.category)) return true;
  if (k.avoidRefs.some((r) => norm(r) === norm(i.ref) || norm(i.ref).includes(norm(r)))) return true;
  const text = `${i.ref} ${i.idea} ${i.angle} ${i.question ?? ""}`.toLowerCase();
  return k.avoidWords.some((w) => text.includes(w));
}

export function applyFeedbackToCity(c: CityIdeas, fb: IdeaFeedback): CityWithFeedback {
  const k = fb.constraints;
  const city = c.city;
  const hidden: HiddenIdea[] = [];
  const keep = (list: Idea[]) =>
    list.filter((i) => {
      const s = similar(i, city, fb.hides);
      if (s) hidden.push({ ...i, ...s });
      else if (blockedByNote(i, k, city)) hidden.push({ ...i, reason: "note" });
      return !s && !blockedByNote(i, k, city);
    });
  let ideas = keep(c.ideas);
  let spare = keep(c.spare ?? []);
  const budget = c.ideas.length;
  // Back-fill what was hidden from the spare ideas, so the city keeps its count.
  while (ideas.length < budget && spare.length) ideas = [...ideas, spare.shift()!];
  // More like this: up to 2 spare ideas of that category join; prefer = that category first.
  const more = fb.more.filter((m) => norm(m.city) === norm(city));
  const wanted = new Set<IdeaCategory>([...more.map((m) => m.category), ...(k && inScope(k, city) ? k.preferCategories : [])]);
  const noMore: IdeaCategory[] = [];
  for (const cat of new Set(more.map((m) => m.category))) {
    const add = spare.filter((i) => i.category === cat).slice(0, 2);
    if (!add.length) noMore.push(cat);
    ideas = [...ideas, ...add];
    spare = spare.filter((i) => !add.includes(i));
  }
  // Order: pinned first, then wanted categories, then the rest; categories with 2+ hides last.
  const pins = fb.pins.filter((p) => norm(p.city) === norm(city));
  const pinned = (i: Idea) => pins.some((p) => norm(p.ref) === norm(i.ref));
  const tired = new Set(IDEA_CATEGORIES.filter((cat) => fb.hides.filter((h) => norm(h.city) === norm(city) && h.category === cat).length >= 2));
  const rank = (i: Idea) => (pinned(i) ? 0 : wanted.has(i.category) ? 1 : tired.has(i.category) ? 3 : 2);
  ideas = ideas.map((i, n) => ({ i, n })).sort((a, b) => rank(a.i) - rank(b.i) || a.n - b.n).map((x) => x.i);
  const max = k && inScope(k, city) ? k.maxPerCity : undefined;
  if (max && ideas.length > max) {
    const cut = ideas.filter((i) => !pinned(i)).slice(Math.max(0, max - ideas.filter(pinned).length));
    ideas = ideas.filter((i) => !cut.includes(i));
    spare = [...cut, ...spare];
  }
  const out: CityWithFeedback = { ...c, ideas, ...(spare.length ? { spare } : { spare: undefined }) };
  if (hidden.length) out.hidden = hidden;
  if (pins.length) out.pinned = pins.map((p) => p.ref);
  if (noMore.length) out.noMore = noMore;
  if (!ideas.length && !c.empty) out.empty = hidden.length ? `Every idea for ${city} is hidden by your choices. Show them below or change your note.` : undefined;
  return out;
}

export function applyFeedback<T extends { cities: CityIdeas[] }>(payload: T, fb: IdeaFeedback | undefined): T & { cities: CityWithFeedback[] } {
  if (!fb) return payload as T & { cities: CityWithFeedback[] };
  return { ...payload, cities: payload.cities.map((c) => applyFeedbackToCity(c, fb)) };
}

// ---------- What must be asked of the fan data again ----------

// The fetch inputs a city's constraints change: era → skew, clean → boundaries.
export type FetchPatch = { skew?: Skew; boundaries?: Boundary[] };
export function fetchPatch(k: Constraints | undefined, city: string): FetchPatch {
  if (!k || !inScope(k, city)) return {};
  return { ...(k.era ? { skew: k.era === "recent" ? ("younger" as const) : ("older" as const) } : {}), ...(k.clean ? { boundaries: ["clean" as Boundary] } : {}) };
}
export const patchKey = (p: FetchPatch) => (p.skew || p.boundaries ? JSON.stringify([p.skew ?? "", p.boundaries ?? []]) : "");

// Cities whose fetch inputs differ between two feedback states (pins / hides / more / avoid never
// count: they only re-order or filter what is saved).
export function affectedCities(before: IdeaFeedback | undefined, after: IdeaFeedback | undefined, cities: string[]): string[] {
  return cities.filter((c) => patchKey(fetchPatch(before?.constraints, c)) !== patchKey(fetchPatch(after?.constraints, c)));
}

// ---------- What a night's Ideas show (one source: the Ideas tab, its badge, the night panel) ----------

// The act's feedback applied; for kinds with their own Covers tab, covers leave Ideas and the next
// spare ideas take their slots (the budget stays). `covers` = how many covers went to that tab.
export type ShownCity = CityWithFeedback & { covers?: number };
export function shownCity(c: CityIdeas, fb: IdeaFeedback | undefined, coversTab: boolean): ShownCity {
  const d: CityWithFeedback = fb ? applyFeedbackToCity(c, fb) : c;
  if (!coversTab) return d;
  const notCover = (l?: Idea[]) => (l ?? []).filter((x) => x.category !== "cover");
  const ideas = notCover(d.ideas);
  const spare = notCover(d.spare);
  const covers = d.ideas.length - ideas.length + (d.spare?.length ?? 0) - spare.length;
  const n = d.ideas.length - ideas.length;
  const out = [...ideas, ...spare.slice(0, n)];
  const rest = spare.slice(n);
  return { ...d, ideas: out, spare: rest.length ? rest : undefined, covers, empty: out.length ? undefined : covers && !d.hidden?.length ? undefined : d.empty };
}
