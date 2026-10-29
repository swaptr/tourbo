// Name → Qloo id resolution, ported from @qloo/qloo-harness@0.1.26 (MIT, Copyright (c) 2026 Qloo):
// dist/resolution-provider.js `createNativeQlooResolutionProvider`. Exact name match or one
// candidate matching every context term resolves; anything else is returned as a choice.
import { qlooGet } from "@tourbo/core/qloo/client.server.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TAG_URN_PREFIX = "urn:tag:";
const STOP_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"]);

export type Candidate = {
  id: string;
  name: string;
  type?: string;
  popularity?: number;
  description?: string;
  rank?: number;
  parent_types?: string[];
};

export type Outcome =
  | { input: string; status: "resolved"; match: "identifier" | "exact" | "semantic"; selected: Candidate; alternatives?: Candidate[]; warnings?: string[] }
  | { input: string; status: "ambiguous" | "not_found"; candidates?: Candidate[]; warnings?: string[] };

export type Issue = { input: string; kind: string; input_kind: "entity" | "tag"; field: string; scope?: string; candidates?: Candidate[]; warnings?: string[] };
export type Resolved = { input: string; id: string; name: string; type?: string; match: string };
export type Resolution = { resolved: Resolved[]; issues: Issue[]; warnings: string[] };

type Json = Record<string, unknown>;
const record = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const normalize = (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase("en-US");

// Qloo returns `results` as an array or as `{ <key>: [...] }`.
export function resultArray(response: unknown, key: string): unknown[] {
  const results = record(response)?.results;
  if (Array.isArray(results)) return results;
  return array(record(results)?.[key]);
}

function entityCandidate(value: unknown): Candidate | undefined {
  const r = record(value);
  const id = r?.entity_id ?? r?.id;
  if (!r || typeof id !== "string" || typeof r.name !== "string") return undefined;
  const props = record(r.properties);
  const types = array(r.types).filter((t): t is string => typeof t === "string");
  const type = (typeof r.subtype === "string" && r.subtype) || (typeof r.type === "string" && r.type) || types.find((t) => t.startsWith("urn:entity:")) || types[0];
  const description = props?.short_description ?? props?.description ?? r.description;
  return {
    id,
    name: r.name,
    ...(type ? { type } : {}),
    ...(typeof r.popularity === "number" ? { popularity: r.popularity } : {}),
    ...(typeof description === "string" && description ? { description: description.slice(0, 500) } : {}),
  };
}

function tagCandidate(value: unknown, rank: number): Candidate | undefined {
  const r = record(value);
  const id = r?.id ?? r?.tag_id;
  if (!r || typeof id !== "string" || typeof r.name !== "string") return undefined;
  const parents = [...new Set(array(r.parents).map((p) => record(p)?.type).filter((t): t is string => typeof t === "string"))];
  return {
    id,
    name: r.name,
    ...(typeof r.type === "string" ? { type: r.type } : {}),
    rank,
    ...(typeof r.popularity === "number" ? { popularity: r.popularity } : {}),
    ...(parents.length ? { parent_types: parents.slice(0, 20) } : {}),
  };
}

const tokens = (v: string) =>
  [...new Set(v.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu)?.filter((t) => t.length >= 2 && !STOP_WORDS.has(t)) ?? [])];

// "Blue Note New York": pick the only candidate whose text contains every input term.
function contextualMatch(input: string, candidates: Candidate[]) {
  const wanted = tokens(input);
  if (candidates.length < 2 || wanted.length < 2) return { candidates };
  const ranked = candidates.map((c) => {
    const text = new Set(tokens([c.name, c.type, c.description].filter(Boolean).join(" ")));
    return { c, matched: wanted.filter((t) => text.has(t)).length };
  });
  const max = Math.max(...ranked.map((r) => r.matched));
  const best = ranked.filter((r) => r.matched === max);
  if (max === wanted.length && best.length === 1 && ranked.some((r) => r.matched < max)) {
    return { candidates: [best[0].c], selected: best[0].c, alternatives: candidates.filter((c) => c.id !== best[0].c.id).slice(0, 4) };
  }
  if (max === wanted.length && best.length < candidates.length) return { candidates: best.map((r) => r.c) };
  return { candidates };
}

const memo = new Map<string, Promise<Outcome>>();

async function resolveEntity(input: string, type?: string): Promise<Outcome> {
  if (UUID_PATTERN.test(input)) {
    const res = await qlooGet("/entities", { entity_ids: input });
    const exact = resultArray(res, "entities").map(entityCandidate).filter((c) => c?.id.toLowerCase() === input.toLowerCase()) as Candidate[];
    if (exact.length === 1) return { input, status: "resolved", match: "identifier", selected: exact[0] };
    return exact.length ? { input, status: "ambiguous", candidates: exact.slice(0, 5) } : { input, status: "not_found" };
  }
  const res = await qlooGet("/search", { query: input, types: type, take: 5 });
  const candidates = resultArray(res, "entities").map(entityCandidate).filter((c): c is Candidate => !!c);
  if (!candidates.length) return { input, status: "not_found" };
  const exact = candidates.filter((c) => normalize(c.name) === normalize(input));
  if (exact.length === 1) {
    return { input, status: "resolved", match: "exact", selected: exact[0], alternatives: candidates.filter((c) => c.id !== exact[0].id).slice(0, 4) };
  }
  // Deviation from the harness: several exact-name duplicates (Qloo has e.g. two "Japanese
  // Breakfast" artists) resolve to the most popular one instead of asking, so agents can proceed.
  if (exact.length > 1) {
    const [top, ...rest] = [...exact].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return {
      input,
      status: "resolved",
      match: "exact",
      selected: top,
      alternatives: rest.slice(0, 4),
      warnings: [`${exact.length} Qloo entities are named "${input}"; picked the most popular (${top.id}). Pass another id to override.`],
    };
  }
  const ctx = contextualMatch(input, candidates);
  if (ctx.selected) {
    return {
      input,
      status: "resolved",
      match: "semantic",
      selected: ctx.selected,
      alternatives: ctx.alternatives,
      warnings: ["Selected the only candidate matching every supplied term; reuse its Qloo ID to pin it."],
    };
  }
  return { input, status: "ambiguous", candidates: (exact.length ? exact : ctx.candidates).slice(0, 5) };
}

async function resolveTag(input: string, targetType?: string): Promise<Outcome> {
  if (input.startsWith(TAG_URN_PREFIX)) return { input, status: "resolved", match: "identifier", selected: { id: input, name: input } };
  const res = await qlooGet("/v2/tags", { "filter.query": input, "feature.semantic_search": true, take: 20 });
  const ranked = resultArray(res, "tags").map((t, i) => tagCandidate(t, i + 1)).filter((c): c is Candidate => !!c);
  const withParents = ranked.filter((c) => c.parent_types?.length);
  const candidates = targetType && withParents.length ? ranked.filter((c) => c.parent_types?.includes(targetType)) : ranked;
  if (!candidates.length) {
    return { input, status: "not_found", ...(targetType && withParents.length ? { warnings: [`No tag in the first ${ranked.length} results supports ${targetType}.`] } : {}) };
  }
  const exact = candidates.filter((c) => normalize(c.name) === normalize(input));
  if (exact.length === 1) {
    return { input, status: "resolved", match: "exact", selected: exact[0], alternatives: candidates.filter((c) => c.id !== exact[0].id).slice(0, 4) };
  }
  return {
    input,
    status: "ambiguous",
    candidates: (exact.length ? exact : candidates).slice(0, 5),
    warnings: exact.length ? [] : ["Tag search returned ranked candidates without a calibrated score; choose one (pass its urn:tag id)."],
  };
}

function remember(key: string, run: () => Promise<Outcome>) {
  let hit = memo.get(key);
  if (!hit) {
    hit = run().catch((error) => {
      memo.delete(key);
      throw error;
    });
    if (memo.size > 2000) memo.delete(memo.keys().next().value!);
    memo.set(key, hit);
  }
  return hit;
}

function collect(outcomes: Outcome[], inputKind: "entity" | "tag", field: string, scope?: string): Resolution {
  const resolved: Resolved[] = [];
  const issues: Issue[] = [];
  for (const o of outcomes) {
    if (o.status === "resolved") {
      resolved.push({ input: o.input, id: o.selected.id, name: o.selected.name, ...(o.selected.type ? { type: o.selected.type } : {}), match: o.match });
    } else {
      issues.push({ input: o.input, kind: o.status, input_kind: inputKind, field, ...(scope ? { scope } : {}), ...(o.candidates ? { candidates: o.candidates } : {}), ...(o.warnings?.length ? { warnings: o.warnings } : {}) });
    }
  }
  return { resolved, issues, warnings: [...new Set(outcomes.flatMap((o) => o.warnings ?? []))] };
}

export async function resolveEntities(inputs: string[] = [], field: string, type?: string): Promise<Resolution> {
  const outcomes = await Promise.all(inputs.map((i) => remember(`e|${type ?? ""}|${normalize(i)}`, () => resolveEntity(i, type)).then((o) => ({ ...o, input: i }))));
  return collect(outcomes, "entity", field, type);
}

export async function resolveTags(inputs: string[] = [], field: string, targetType?: string): Promise<Resolution> {
  const outcomes = await Promise.all(inputs.map((i) => remember(`t|${targetType ?? ""}|${normalize(i)}`, () => resolveTag(i, targetType)).then((o) => ({ ...o, input: i }))));
  return collect(outcomes, "tag", field, targetType);
}

// "young women", "men 25-34", "millennials" → Qloo demographic signals.
export function parseDemographic(value: string): { gender?: "female" | "male"; age?: string } {
  const v = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const out: { gender?: "female" | "male"; age?: string } = {};
  if (/\b(women|woman|female|ladies)\b/u.test(v)) out.gender = "female";
  else if (/\b(men|man|male|guys)\b/u.test(v)) out.gender = "male";
  const range = v.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/u);
  const over = v.match(/\b(?:over|older than|above)\s*(\d{1,2})\b/u);
  const under = v.match(/\b(?:under|younger than|below)\s*(\d{1,2})\b/u);
  if (range && Number(range[1]) <= Number(range[2])) out.age = ageBuckets(Number(range[1]), Number(range[2]));
  else if (/\b(teenagers?|teens?|gen[\s-]?z)\b/u.test(v)) out.age = "24_and_younger";
  else if (/\byoung\b/u.test(v)) out.age = "24_and_younger,25_to_29";
  else if (/\bmillennials?\b/u.test(v)) out.age = "30_to_34,35_to_44";
  else if (/\b(seniors?|elderly|retirees?)\b/u.test(v)) out.age = "55_and_older";
  else if (/\bmiddle[\s-]?aged?\b/u.test(v)) out.age = "35_to_44,45_to_54";
  else if (over) out.age = ageBuckets(Number(over[1]), 120);
  else if (under) out.age = ageBuckets(0, Number(under[1]));
  return out;
}

function ageBuckets(low: number, high: number) {
  const ranges: [number, number, string][] = [
    [0, 24, "24_and_younger"],
    [25, 29, "25_to_29"],
    [30, 34, "30_to_34"],
    [35, 44, "35_to_44"],
    [45, 54, "45_to_54"],
    [55, 120, "55_and_older"],
  ];
  return ranges.filter(([l, h]) => low <= h && high >= l).map(([, , name]) => name).join(",");
}
