import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  buildSetDraft,
  ENERGIES,
  groundParsed,
  MOODS,
  nodsFor,
  parseLibrary,
  rowInsight,
  setEvidence,
  suggestProfile,
  tagsFromWords,
  titleCheck,
  titleFor,
  TOPICS,
  withFlat,
  type AssistEvidence,
  type AssistResult,
  type AssistTask,
  type BuildSetDraft,
  type ParseDraft,
  type ProfileDraft,
  type RowDraft,
  type RowsDraft,
  type TagsDraft,
  type TitleDraft,
  type LibraryItem,
  type ParsedItem,
  type SavedHome,
  type TitleCity,
} from "@tourbo/core/assist/assist.ts";
import { isFlavour } from "@tourbo/core/context/budget.ts";
import { db } from "@tourbo/core/db/client.server.ts";
import { getEvent } from "@tourbo/core/events/events.server.ts";
import { groundCheck, itemHash } from "@tourbo/core/engine/explain.ts";
import { norm } from "@tourbo/core/engine/ideas-rank.ts";
import { listMaterial } from "@tourbo/core/material/material.server.ts";
import { MATERIAL_TYPES } from "@tourbo/core/material/material.ts";
import { PerformerKind, Region, type Plan } from "@tourbo/core/shared/types.ts";
import { keyMatches, UUID } from "../owner.server.ts";
import { AI_LIMIT, activeLimits, isAiLimit, logError, PlainError } from "./errors.ts";
import { aiReady, savedIdeas } from "./ideas.server.ts";
import { WORKER_MODEL } from "./models.ts";
import { getRun, getSteps, saveStep } from "./runs.server.ts";
import { recordUsage } from "./usage.ts";

// AI assists (PLAN Q21): the AI does the chores, fan data supplies the facts. Each task runs the
// rules first (@tourbo/core/assist/assist.ts); the AI assistant only fills what the rules couldn't
// read (library parse / tags), offers title alternatives, or shortens a row insight. A critic
// keeps an AI value only if it is in the user's text or the saved facts. Drafts are never applied
// here: the page shows them with Keep / Edit / Discard. AI runs (and its results are cached) only
// for a caller holding the owner key of the profile or run; everyone else gets the rules draft.
// AI off or limited: the rules draft plus one plain notice (AI_LIMIT semantics as elsewhere).

const VERSION = "a1"; // bump to drop cached drafts after a prompt change
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify([VERSION, v])).digest("hex").slice(0, 24);

export const NOTICE = {
  off: "Your AI assistant isn't set up here, so this is Tourbo's plain draft.",
  limited: `${AI_LIMIT} This is Tourbo's plain draft.`,
  failed: "Your AI assistant didn't answer, so this is Tourbo's plain draft. Try again in a minute.",
};

export type AssistAuth = { key: string | null; profileId?: string; profileOk: boolean };

// ---------- AI plumbing ----------

let client: Anthropic | undefined;
type AiState = "ok" | "off" | "limited";
const aiState = (): AiState => (!aiReady() ? "off" : activeLimits().ai ? "limited" : "ok");

// One structured call. Returns the parsed output, or a notice for the fallback.
async function ask<S extends z.ZodType>(schema: S, system: string, payload: unknown, maxTokens: number): Promise<{ out?: z.infer<S>; notice?: string; limited?: boolean }> {
  const state = aiState();
  if (state !== "ok") return { notice: NOTICE[state], limited: state === "limited" };
  try {
    client ??= new Anthropic({ maxRetries: 1 });
    const res = await client.messages.parse({
      model: WORKER_MODEL,
      max_tokens: maxTokens,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    recordUsage(WORKER_MODEL, res.usage);
    if (res.stop_reason === "refusal" || !res.parsed_output) return { notice: NOTICE.failed };
    return { out: res.parsed_output as z.infer<S> };
  } catch (error) {
    logError("assist", error);
    return isAiLimit(error) ? { notice: NOTICE.limited, limited: true } : { notice: NOTICE.failed };
  }
}

async function cacheGet<T>(task: AssistTask, key: string): Promise<T | undefined> {
  try {
    const sql = await db();
    const [row] = await sql<{ output: T }[]>`select output from assists where task = ${task} and key = ${key}`;
    return row?.output;
  } catch {
    return undefined; // table not there yet (older process) or DB down: no cache, still answers
  }
}
async function cacheSet(task: AssistTask, key: string, output: unknown) {
  try {
    const sql = await db();
    await sql`insert into assists (task, key, output) values (${task}, ${key}, ${sql.json(output as never)})
      on conflict (task, key) do update set output = excluded.output, created_at = now()`;
  } catch {}
}

const withNotice = <T>(r: AssistResult<T>, a: { notice?: string; limited?: boolean }): AssistResult<T> => ({ ...r, ...(a.notice ? { notice: a.notice } : {}), ...(a.limited ? { limited: true } : {}) });

// ---------- Inputs ----------

const Kind = PerformerKind.optional().catch(undefined);
export const Inputs = {
  library_parse: z.object({ text: z.string().max(8000), kind: Kind }),
  library_tags: z.object({ items: z.array(z.object({ title: z.string().min(1).max(160), notes: z.string().max(2000).optional(), tags: z.array(z.string().max(40)).max(12).optional() })).min(1).max(60), kind: Kind }),
  title: z.object({
    runId: z.string().regex(UUID).optional(),
    kind: Kind,
    mode: z.enum(["tour", "event"]).optional(),
    cities: z.array(z.string().min(1).max(120)).max(20).default([]),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    region: Region.optional().catch(undefined),
    ai: z.boolean().optional(),
  }),
  row_insight: z.object({ runIds: z.array(z.string().regex(UUID)).min(1).max(40) }),
  build_set: z.object({
    runId: z.string().regex(UUID).optional(),
    eventId: z.string().regex(UUID).optional(),
    city: z.string().max(120).optional(),
    kind: Kind,
    slot: z.string().max(40).optional(),
    minutes: z.number().min(1).max(600).optional(),
    flavour: z.string().optional(),
    items: z
      .array(z.object({ id: z.string().max(64).optional(), title: z.string().min(1).max(160), type: z.string().max(20).optional(), lengthMin: z.number().min(0).max(600).optional(), tags: z.array(z.string().max(40)).max(12).optional(), origin: z.enum(["original", "cover", "local_idea"]).default("original"), source: z.object({ ref: z.string().max(160), city: z.string().max(120).optional(), category: z.string().max(40).optional() }).optional() }))
      .max(200)
      .optional(),
  }),
  profile_suggest: z.object({ name: z.string().max(120).default(""), genres: z.array(z.string().max(80)).max(8).optional() }),
} satisfies Record<AssistTask, z.ZodType>;

// ---------- library_parse ----------

const ParsedAi = z.object({
  items: z
    .array(
      z.object({
        line: z.number().int().describe("the line number the item came from, copied exactly"),
        title: z.string().describe("the title exactly as written in that line"),
        type: z.enum(MATERIAL_TYPES),
        lengthMin: z.number().optional().describe("minutes, only if the line states a length"),
        origin: z.enum(["original", "cover"]).describe("cover only if the line says it's someone else's"),
        by: z.string().optional().describe("the original artist, only if named in the line"),
      }),
    )
    .max(80),
});
const PARSE_SYSTEM = `You read a performer's pasted notes and list the separate songs, bits, talks, pieces or routines they mention. Copy each title exactly as written in its line. Give a length only if the line states one. Mark a cover only when the line says it is someone else's. Never add titles that aren't in the text.`;


async function libraryParse(input: z.infer<typeof Inputs.library_parse>, auth: AssistAuth): Promise<AssistResult<ParseDraft>> {
  const rules = parseLibrary(input.text, input.kind);
  const base = (items: ParsedItem[], unread: number, source: "ai" | "rules"): AssistResult<ParseDraft> => {
    const guessed = items.filter((i) => i.guess?.length).length;
    const evidence: AssistEvidence[] = [{ label: `${items.length} item${items.length === 1 ? "" : "s"} read`, detail: "Read from the text you pasted: titles, lengths and cover notes as written.", source: "your text" }];
    if (guessed) evidence.push({ label: `${guessed} guessed`, detail: "Marked as a guess (for example, a name after a dash read as the original artist). Check them before you keep.", source: "rules", hedged: true });
    if (unread) evidence.push({ label: `${unread} line${unread === 1 ? "" : "s"} not read`, detail: "These lines read like notes, not titles. Add them by hand if they're material.", source: "rules", hedged: true });
    return { draft: { items, unread, skipped: rules.skipped }, evidence, source };
  };
  if (!rules.gaps.length) return base(rules.items, 0, "rules");
  if (!auth.profileOk) return base(rules.items, rules.gaps.length, "rules");
  const key = hash([input.kind, input.text]);
  const hit = await cacheGet<AssistResult<ParseDraft>>("library_parse", key);
  if (hit) return { ...hit, cached: true };
  const a = await ask(ParsedAi, PARSE_SYSTEM, { kind: input.kind ?? "musician", lines: rules.gaps }, 4000);
  if (!a.out) return withNotice(base(rules.items, rules.gaps.length, "rules"), a);
  const seen = new Set(rules.items.map((i) => norm(i.title)));
  const extra: ParsedItem[] = [];
  let read = 0;
  for (const gap of rules.gaps) {
    const mine = groundParsed(a.out.items.filter((i) => i.line === gap.line), gap.text, input.kind, gap.line).filter((i) => !seen.has(norm(i.title)) && seen.add(norm(i.title)));
    if (mine.length) read++;
    extra.push(...mine);
  }
  const items = [...rules.items, ...extra].sort((x, y) => x.line - y.line).slice(0, 80);
  const result = base(items, rules.gaps.length - read, extra.length ? "ai" : "rules");
  await cacheSet("library_parse", key, result);
  return result;
}

// ---------- library_tags ----------

const TagsAi = z.object({
  items: z
    .array(
      z.object({
        i: z.number().int().describe("the item's index, copied exactly"),
        mood: z.array(z.enum(MOODS)).max(2),
        energy: z.enum(ENERGIES),
        topics: z.array(z.enum(TOPICS)).max(2),
      }),
    )
    .max(60),
});
const TAGS_SYSTEM = `You tag a performer's own material for set building. For each item pick up to 2 moods, one energy level and up to 2 topics, only from the allowed values, judging from its title and notes. When unsure, pick energy "mid" and leave moods or topics empty.`;


async function libraryTags(input: z.infer<typeof Inputs.library_tags>, auth: AssistAuth): Promise<AssistResult<TagsDraft>> {
  const rules = input.items.map((it) => ({ title: it.title, ...tagsFromWords(it) }));
  const gaps = rules.map((r, i) => ({ r, i })).filter(({ r }) => !r.mood.length || !r.energy || !r.topics.length);
  const result = (items: TagsDraft["items"], source: "ai" | "rules"): AssistResult<TagsDraft> => {
    const byAi = items.filter((i) => i.from === "ai").length;
    const evidence: AssistEvidence[] = [{ label: "from your titles and notes", detail: "Tags come from the words in each item's title and notes.", source: "your text" }];
    if (byAi) evidence.push({ label: `${byAi} tagged by your AI assistant`, detail: "A best guess from the title alone, from a fixed list of moods, energy and topics. Edit any that feel off.", source: "rules", hedged: true });
    const none = items.filter((i) => i.from === "none").length;
    if (none) evidence.push({ label: `${none} without tags`, detail: "Nothing in the title says much. Add a mood or energy by hand.", source: "rules", hedged: true });
    return { draft: { items }, evidence, source };
  };
  if (!gaps.length || !auth.profileOk) return result(rules, "rules");
  const key = hash([input.kind, input.items]);
  const hit = await cacheGet<AssistResult<TagsDraft>>("library_tags", key);
  if (hit) return { ...hit, cached: true };
  const a = await ask(TagsAi, TAGS_SYSTEM, { kind: input.kind ?? "musician", items: gaps.map(({ i }) => ({ i, title: input.items[i].title, notes: input.items[i].notes?.slice(0, 300) })) }, 4000);
  if (!a.out) return withNotice(result(rules, "rules"), a);
  const byI = new Map(a.out.items.map((x) => [x.i, x]));
  const items = rules.map((r, i) => {
    const g = byI.get(i);
    if (!g || !gaps.some((x) => x.i === i)) return r;
    const merged = withFlat({ mood: r.mood.length ? r.mood : g.mood, energy: r.energy ?? g.energy, topics: r.topics.length ? r.topics : g.topics, from: "ai" });
    return { title: r.title, ...merged };
  });
  const out = result(items, items.some((i) => i.from === "ai") ? "ai" : "rules");
  await cacheSet("library_tags", key, out);
  return out;
}

// ---------- title ----------

const TitleAi = z.object({ titles: z.array(z.string().describe("max 6 words")).max(3) });
const TITLE_SYSTEM = `You suggest short, warm titles (max 6 words) for a performer's tour or show. Use only the city, area, season and year names you are given plus plain words (tour, run, nights, live). Never invent places, venues, people or themes. No quotes, no emoji.`;


async function citiesInfo(names: string[]): Promise<TitleCity[]> {
  if (!names.length) return [];
  try {
    const sql = await db();
    const rows = await sql<{ key: string; admin1: string | null; country: string; country_name: string | null }[]>`
      select distinct on (lower(c.name)) lower(c.name) as key, c.admin1, c.country, co.name as country_name
      from cities c left join countries co on co.code = c.country
      where lower(c.name) = any(${names.map((n) => n.split(",")[0].trim().toLowerCase())})
      order by lower(c.name), c.population desc`;
    const by = new Map(rows.map((r) => [r.key, r]));
    return names.map((n) => {
      const r = by.get(n.split(",")[0].trim().toLowerCase());
      return { name: n, ...(r ? { admin1: r.admin1 ?? undefined, country: r.country, countryName: r.country_name ?? undefined } : {}) };
    });
  } catch {
    return names.map((name) => ({ name }));
  }
}

async function title(input: z.infer<typeof Inputs.title>, auth: AssistAuth): Promise<AssistResult<TitleDraft>> {
  let { cities, startDate, endDate, region, kind, mode } = input;
  let canAi = auth.profileOk;
  if (input.runId) {
    const run = await getRun(input.runId);
    if (!run) throw new PlainError("This plan isn't here any more. It may have been deleted.", "not_found");
    const stops = run.plan?.stops ?? [];
    if (stops.length) cities = stops.map((s) => s.city.name);
    startDate ??= stops.find((s) => s.date)?.date ?? run.params.startDate;
    endDate ??= [...stops].reverse().find((s) => s.date)?.date ?? run.params.endDate;
    region ??= run.params.region;
    kind ??= run.plan?.artist.kind ?? run.params.kind;
    mode ??= run.params.mode ?? (stops.length === 1 ? "event" : "tour");
    canAi ||= await ownsRun(input.runId, auth);
  }
  const t = titleFor({ kind, mode, cities: await citiesInfo(cities), startDate, endDate, region });
  const evidence: AssistEvidence[] = [{ label: [t.names.slice(0, 3).join(", "), t.facts.find((f) => f.key === "season")?.value].filter(Boolean).join(" · ") || "your details", detail: "Built from the cities, dates and kind of show you picked.", source: "rules" }];
  const rules: AssistResult<TitleDraft> = { draft: { title: t.title, alternatives: [] }, evidence, source: "rules" };
  if (!input.ai || !canAi) return rules;
  const key = hash([kind, mode, cities, startDate, region]);
  const hit = await cacheGet<AssistResult<TitleDraft>>("title", key);
  if (hit) return { ...hit, cached: true };
  const a = await ask(TitleAi, TITLE_SYSTEM, { kind, mode, cities: t.names, season: t.facts.find((f) => f.key === "season")?.value, year: startDate?.slice(0, 4), plain: t.title }, 1500);
  if (!a.out) return withNotice(rules, a);
  const alternatives = [...new Set(a.out.titles.map((s) => s.replace(/["“”]/g, "").trim()))].filter((s) => norm(s) !== norm(t.title) && titleCheck(s, t)).slice(0, 3);
  const out: AssistResult<TitleDraft> = { draft: { title: t.title, alternatives }, evidence, source: alternatives.length ? "ai" : "rules" };
  await cacheSet("title", key, out);
  return out;
}

// ---------- row_insight ----------

const RowsAi = z.object({ lines: z.array(z.object({ id: z.string().describe("copied exactly"), text: z.string().describe("max 12 words") })).max(40) });
const ROWS_SYSTEM = `You shorten one-line insights about a performer's tours for a list view. Rewrite each line in at most 12 plain words, keeping its strongest point. Use ONLY the names in that item's facts and keep each city's role exactly as given (the city with the biggest fan base stays the biggest, the one with the fewest fans stays the fewest). No numbers, scores or multipliers in the line: they sit behind "why?". Plain words: never "over-index", "fan index" or "score". Say "fans", never the names of any data provider, AI or tool. No markdown.`;


async function ownsRun(runId: string, auth: AssistAuth): Promise<boolean> {
  const [row] = await (await db())<{ owner_hash: string | null; profile_id: string | null }[]>`select owner_hash, profile_id from runs where id = ${runId}`;
  if (!row) return false;
  return (!!row.owner_hash && keyMatches(row.owner_hash, auth.key)) || (auth.profileOk && !!row.profile_id && row.profile_id === auth.profileId);
}

async function rowInsights(input: z.infer<typeof Inputs.row_insight>, auth: AssistAuth): Promise<AssistResult<RowsDraft>> {
  const ids = [...new Set(input.runIds)];
  const sql = await db();
  const runs = await sql<{ id: string; plan: Plan | null; owner_hash: string | null; profile_id: string | null }[]>`select id, plan, owner_hash, profile_id from runs where id = any(${ids}::uuid[])`;
  const facts = runs.flatMap((r) => {
    const ins = r.plan?.stops?.length ? rowInsight(r.plan, r.id) : undefined;
    if (!ins) return [];
    const mine = (!!r.owner_hash && keyMatches(r.owner_hash, auth.key)) || (auth.profileOk && r.profile_id === auth.profileId);
    return [{ id: r.id, ins, mine, key: `row:${itemHash(ins.item)}` }];
  });
  const rows = new Map<string, RowDraft>(facts.map((f) => [f.id, { runId: f.id, line: f.ins.line, evidence: f.ins.evidence, source: "fan data" }]));
  // Saved rewrites first (any caller may read them); new ones only for the owner's rows.
  const saved = await Promise.all(facts.map((f) => getSteps<string>(f.id, "assist").then((m) => m.get(f.key)).catch(() => undefined)));
  const todo: typeof facts = [];
  facts.forEach((f, i) => {
    const line = saved[i];
    // Saved rewrites from before the plain-words rule (numbers, "over-index") are ignored and redone.
    if (line && !/\d|over-?index|score/i.test(line)) Object.assign(rows.get(f.id)!, { line, source: "ai" });
    else if (f.mine) todo.push(f);
  });
  let notice: { notice?: string; limited?: boolean } = {};
  if (todo.length) {
    const a = await ask(RowsAi, ROWS_SYSTEM, { items: todo.map((f) => ({ id: f.id, line: f.ins.line, facts: f.ins.item.facts.map((x) => ({ label: x.label, value: x.value, ...(x.unit ? { unit: x.unit } : {}) })), names: f.ins.item.names })) }, Math.min(8000, 1500 + todo.length * 150));
    notice = a;
    for (const l of a.out?.lines ?? []) {
      const f = todo.find((x) => x.id === l.id);
      if (!f) continue;
      const text = l.text.trim();
      const check = groundCheck(text, f.ins.item);
      // The critic: every number and name from the facts, and actually shorter.
      if (!check.ok || text.length > f.ins.line.length) continue;
      const row = rows.get(f.id)!;
      row.line = /[.!?]$/.test(text) ? text : `${text}.`;
      row.source = "ai";
      await saveStep(f.id, "assist", f.key, row.line).catch(() => {});
    }
  }
  const list = ids.flatMap((id) => rows.get(id) ?? []);
  return withNotice({ draft: { rows: list }, evidence: list.length === 1 ? list[0].evidence : [], source: list.some((r) => r.source === "ai") ? "ai" : "fan data" }, notice);
}

// ---------- build_set ----------


async function buildSet(input: z.infer<typeof Inputs.build_set>, auth: AssistAuth): Promise<AssistResult<BuildSetDraft>> {
  let { city, kind, runId } = input;
  if (input.eventId) {
    const ev = await getEvent(input.eventId);
    if (!ev) throw new PlainError("This event isn't here any more. It may have been deleted.", "not_found");
    city ??= ev.city.name;
    kind ??= ev.kind;
    runId ??= ev.tourId ?? ev.runId;
  }
  const run = runId ? await getRun(runId) : undefined;
  kind ??= run?.plan?.artist.kind ?? run?.params.kind;
  if (!city) city = run?.plan?.stops[0]?.city.name;
  if (!city) throw new PlainError("Pick the night's city first, then build the set.");
  const library: LibraryItem[] = input.items ?? (auth.profileId ? await listMaterial(auth.profileId) : []);
  if (!library.length) throw new PlainError("Your library is empty. Add a few songs or bits, then build the set.");
  const same = (a: string) => norm(a.split(",")[0]) === norm(city!.split(",")[0]);
  const stop = run?.plan?.stops.find((s) => same(s.city.name) || same(s.city.query ?? ""));
  const saved = runId && run?.plan ? await savedIdeas(runId).catch(() => undefined) : undefined;
  const ideas = (saved?.angles ?? saved?.ideas)?.data.cities.find((c) => same(c.city))?.ideas;
  const nods = nodsFor({ city, kind, library, ideas, stop });
  const draft = buildSetDraft({ items: library, kind, city, slot: input.slot, minutes: input.minutes, flavour: isFlavour(input.flavour) ? input.flavour : undefined, nods });
  const usedNods = draft.order.some((e) => e.role === "nod");
  const evidence = setEvidence(draft, kind);
  if (!usedNods && !nods.length) evidence.push({ label: `no saved fan data for ${city.split(",")[0]}`, detail: "Open this night's ideas once and Tourbo can add a local nod from its fan data.", source: "rules", hedged: true });
  return { draft, evidence, source: usedNods ? "fan data" : "rules" };
}

// ---------- profile_suggest ----------


async function profileSuggest(input: z.infer<typeof Inputs.profile_suggest>): Promise<AssistResult<ProfileDraft>> {
  const name = input.name.trim();
  let savedKinds: string[] = [];
  let savedHomes: SavedHome[] = [];
  let strongest: { name: string; lat: number; lon: number; score: number } | undefined;
  let genres = input.genres ?? [];
  if (name.length >= 2) {
    const sql = await db();
    const runs = await sql<{ kind: string | null; home: string | null; plan: Plan | null }[]>`
      select params->>'kind' as kind, params->>'homeBase' as home, plan from runs
      where lower(artist_name) = ${name.toLowerCase()} order by created_at desc limit 20`;
    savedKinds = runs.map((r) => r.kind ?? r.plan?.artist.kind).filter((k): k is string => !!k);
    const counts = new Map<string, number>();
    for (const r of runs) if (r.home?.trim()) counts.set(r.home.trim(), (counts.get(r.home.trim()) ?? 0) + 1);
    if (counts.size) {
      const rows = await sql<{ key: string; name: string; lat: number; lon: number }[]>`
        select distinct on (lower(name)) lower(name) as key, name, lat, lon from cities
        where lower(name) = any(${[...counts.keys()].map((k) => k.split(",")[0].toLowerCase())}) order by lower(name), population desc`.catch(() => []);
      savedHomes = [...counts].flatMap(([home, count]) => {
        const r = rows.find((x) => x.key === home.split(",")[0].toLowerCase());
        return r ? [{ name: r.name, lat: r.lat, lon: r.lon, count }] : [];
      });
    }
    const plan = runs.find((r) => r.plan?.stops?.length)?.plan;
    const top = plan ? [...plan.stops].sort((a, b) => b.score - a.score)[0] : undefined;
    if (top) strongest = { name: top.city.name, lat: top.city.lat, lon: top.city.lon, score: top.score };
    if (!genres.length && plan) genres = plan.artist.tags.map((t) => t.name).slice(0, 4);
  }
  const { draft, evidence } = suggestProfile({ genres, savedKinds, savedHomes, strongest });
  return { draft, evidence, source: evidence.some((e) => e.source === "fan data") ? "fan data" : "rules" };
}

// ---------- Entry ----------

export async function runAssist(task: AssistTask, raw: unknown, auth: AssistAuth): Promise<AssistResult<unknown>> {
  switch (task) {
    case "library_parse":
      return libraryParse(Inputs.library_parse.parse(raw), auth);
    case "library_tags":
      return libraryTags(Inputs.library_tags.parse(raw), auth);
    case "title":
      return title(Inputs.title.parse(raw), auth);
    case "row_insight":
      return rowInsights(Inputs.row_insight.parse(raw), auth);
    case "build_set":
      return buildSet(Inputs.build_set.parse(raw), auth);
    case "profile_suggest":
      return profileSuggest(Inputs.profile_suggest.parse(raw));
  }
}
