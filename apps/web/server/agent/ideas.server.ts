import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { avoidPrompt, defaultSlot, dropAvoided, isFlavour, parseBoundaries, performanceContext, slotFor, type Boundary, type Flavour } from "@tourbo/core/context/index.ts";
import type { IdeasResult } from "@tourbo/core/engine/ideas.ts";
import { CATEGORY_LABEL, groundLines, IDEA_CATEGORIES, norm, type CityIdeas } from "@tourbo/core/engine/ideas-rank.ts";
import { affectedCities, changeFeedback, cleanConstraints, EMPTY_FEEDBACK, fetchPatch, parseNoteWords, patchKey, shownCity, type Constraints, type FeedbackChange, type IdeaFeedback, type ShownCity } from "@tourbo/core/engine/idea-feedback.ts";
import { workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { signalIds } from "@tourbo/core/engine/resolve.ts";
import { leverContext, parseLevers, type LeverContext } from "@tourbo/core/engine/levers.ts";
import type { PerformerKind, Plan, Region } from "@tourbo/core/shared/types.ts";
import { connectMcp } from "../mcp.server.ts";
import { apiError } from "./errors.ts";
import { WORKER_MODEL } from "./models.ts";
import { getRun, getSteps, saveStep } from "./runs.server.ts";
import { recordUsage } from "./usage.ts";

// "Ideas for this place" (PLAN §18 Q12) on the website: the deterministic ideas come from the
// MCP tool `tourbo_ideas` (same as any assistant gets); the AI then writes one angle line per idea.
// Critic as in show prep: a line survives only if its ref is one of that city's ideas and the
// text names it. Without an AI key the page keeps the deterministic hints and says so once.

// inputs: what these ideas were asked with (slot, flavour, boundaries, era skew), for the saved key.
export type IdeasPayload = IdeasResult & { act?: string; note?: string; inputs?: IdeasInputs };

async function callIdeas(args: Record<string, unknown>): Promise<IdeasResult> {
  const mcp = await connectMcp(() => {}, ["tourbo"]);
  try {
    return await mcp.call<IdeasResult>("tourbo_ideas", args);
  } finally {
    await mcp.close().catch(() => {});
  }
}

// Performance context the ideas depend on (context/, PLAN §18 Q15): slot, local flavour,
// boundaries, and the Tune era lever (PLAN Q20: recent → "younger", classic → "older" covers).
export type IdeasInputs = { slot: string; flavour: Flavour; boundaries: Boundary[]; skew?: "younger" | "older" };
export function ideasInputs(kind: string, v: { slot?: unknown; flavour?: unknown; boundaries?: unknown; skew?: unknown } = {}): IdeasInputs {
  return {
    slot: slotFor(kind, typeof v.slot === "string" && v.slot ? v.slot.slice(0, 40) : undefined).key,
    flavour: isFlavour(v.flavour) ? v.flavour : "touch",
    boundaries: [...parseBoundaries(v.boundaries, kind)].sort(),
    ...(v.skew === "younger" || v.skew === "older" ? { skew: v.skew } : {}),
  };
}
const isDefault = (kind: string, i: IdeasInputs) => {
  const d = ideasInputs(kind, { slot: defaultSlot(kind).key });
  return i.slot === d.slot && i.flavour === d.flavour && i.boundaries.join() === d.boundaries.join() && !i.skew;
};
const inputsOf = (s: SavedIdeas) => s.data.inputs ?? s.data.context;

// Ideas are the user's work, saved per plan (run_steps): opening the tab again shows the saved
// ones; only a change in what they depend on (cities, act, kind, slot, flavour, boundaries) or an
// explicit refresh makes new ones. Default inputs keep the original key (ideas saved earlier load).
export function ideasKey(plan: Pick<Plan, "stops" | "artist">, inputs?: Parameters<typeof ideasInputs>[1]) {
  const base: unknown[] = [plan.stops.map((s) => s.city.name), plan.artist.kind, signalIds(plan.artist)];
  const i = ideasInputs(plan.artist.kind, inputs);
  // No skew = the key ideas saved before the era lever had (they still load).
  if (!isDefault(plan.artist.kind, i)) base.push(i.skew ? [i.slot, i.flavour, i.boundaries, i.skew] : [i.slot, i.flavour, i.boundaries]);
  return createHash("sha256").update(JSON.stringify(base)).digest("hex").slice(0, 16);
}

export async function savedIdeas(runId: string, inputs?: Partial<IdeasInputs>) {
  const run = await getRun(runId);
  if (!run?.plan?.stops.length) return undefined;
  const key = ideasKey(run.plan, inputs);
  const [ideas, angles] = await Promise.all([getSteps<SavedIdeas>(runId, "ideas"), getSteps<SavedIdeas>(runId, "ideas_angles")]);
  if (ideas.get(key) || angles.get(key)) return { key, ideas: ideas.get(key), angles: angles.get(key) };
  // An edited plan (PLAN Q19): cities still in it keep their saved ideas; only a new city needs some.
  const cities = run.plan.stops.map((s) => s.city.name);
  const same = sameInputs(run.plan.artist.kind, inputs);
  const merged = mergeSaved([...ideas.values(), ...angles.values()].filter(same), cities);
  if (!merged || merged.missing.length) return { key, ideas: undefined, angles: undefined, missing: merged?.missing ?? cities };
  const mergedAngles = mergeSaved([...angles.values()].filter(same), cities);
  return { key, ideas: merged, angles: mergedAngles && !mergedAngles.missing.length ? mergedAngles : undefined };
}

const sameInputs = (kind: string, inputs?: Partial<IdeasInputs>) => {
  const want = JSON.stringify(ideasInputs(kind, inputs));
  return (s: SavedIdeas) => JSON.stringify(ideasInputs(kind, inputsOf(s))) === want;
};

// Newest saved ideas per city (PLAN Q19 per-city reuse); `missing` = cities with none saved.
function mergeSaved(saved: SavedIdeas[], cities: string[]): { data: IdeasPayload; savedAt: string; missing: string[] } | undefined {
  const list = [...saved].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  if (!list.length) return undefined;
  const found = cities.map((c) => list.map((s) => s.data.cities.find((x) => norm(x.city) === norm(c))).find(Boolean));
  const keep = new Set(cities.map(norm));
  const template = list[0].data;
  const region = template.region
    .map((r) => ({ ...r, best: r.best.filter((b) => keep.has(norm(b.city))), skip: r.skip.filter((c) => keep.has(norm(c))) }))
    .filter((r) => r.best.length);
  return { data: { ...template, cities: found.filter((c): c is NonNullable<typeof c> => !!c), region }, savedAt: list[0].savedAt, missing: cities.filter((_, i) => !found[i]) };
}

// The plan's saved levers (Tune, PLAN Q20) as context for ideas / show notes: what the act chose
// there applies wherever the page doesn't say otherwise (e.g. ?flavour= on the ideas page).
export async function leverDefaults(runId: string, kind: string): Promise<LeverContext> {
  const saved = (await getSteps<unknown>(runId, "levers").catch(() => new Map<string, unknown>())).get("current");
  return leverContext(parseLevers(saved), kind);
}

export type SavedIdeas = { data: IdeasPayload; savedAt: string };

export async function saveIdeas(runId: string, step: "ideas" | "ideas_angles", data: IdeasPayload) {
  const run = await getRun(runId);
  if (!run?.plan) return;
  await saveStep(runId, step, ideasKey(run.plan, data.inputs ?? data.context), { data, savedAt: new Date().toISOString() } satisfies SavedIdeas).catch(() => {});
}

// reuse: keep the saved ideas of cities still in the plan and ask only for the others (edited plan).
export async function ideasForPlan(runId: string, inputs?: Partial<IdeasInputs>, opts: { reuse?: boolean } = {}): Promise<IdeasPayload> {
  const run = await getRun(runId);
  const plan = run?.plan;
  if (!plan?.stops.length) throw new PlainIdeasError("The plan isn't ready yet. Open it again when the nights are in.");
  const ids = signalIds(plan.artist);
  const all = plan.stops.map((s) => s.city.name);
  const saved = opts.reuse
    ? mergeSaved([...(await getSteps<SavedIdeas>(runId, "ideas_angles")).values(), ...(await getSteps<SavedIdeas>(runId, "ideas")).values()].filter(sameInputs(plan.artist.kind, inputs)), all)
    : undefined;
  if (saved && !saved.missing.length) return saved.data;
  const asked = ideasInputs(plan.artist.kind, inputs);
  const result = await callIdeas({
    cities: saved ? saved.missing : all,
    region: plan.params.region,
    kind: plan.artist.kind,
    act_id: ids[0],
    peer_ids: ids.slice(1, 6),
    act_name: plan.artist.name,
    ...asked,
  });
  if (saved) {
    const byCity = new Map([...saved.data.cities, ...result.cities].map((c) => [norm(c.city), c]));
    const cities = all.map((c) => byCity.get(norm(c))).filter((c): c is NonNullable<typeof c> => !!c);
    return { ...result, act: plan.artist.name, cities, region: [...saved.data.region, ...result.region], inputs: asked };
  }
  return { ...result, act: plan.artist.name, inputs: asked };
}

// Any city, no plan: /ideas?city=…&kind=…&act=… An act that isn't found never blocks: the
// ideas then come from the city alone, and the basis line says so.
export async function ideasForCity(opts: { city: string; kind: PerformerKind; act?: string; region?: Region; inputs?: Partial<IdeasInputs> }): Promise<IdeasPayload> {
  const mcp = await connectMcp(() => {}, ["tourbo"]);
  let act: { id: string; name: string; peers: { id: string }[] } | undefined;
  let note: string | undefined;
  try {
    if (opts.act?.trim()) {
      const r = await mcp.call<{ found: boolean; id?: string; name?: string; peers?: { id: string }[] }>("tourbo_resolve_act", { name: opts.act.trim(), kind: opts.kind });
      if (r.found && r.id) act = { id: r.id, name: r.name ?? opts.act, peers: r.peers ?? [] };
      else note = `We couldn't find "${opts.act.trim()}" in the fan data, so these ideas come from ${opts.city} alone.`;
    }
    const result = await mcp.call<IdeasResult>("tourbo_ideas", {
      cities: [opts.city],
      region: opts.region ?? "na",
      kind: opts.kind,
      ...ideasInputs(opts.kind, opts.inputs),
      ...(act ? { act_id: act.id, peer_ids: act.peers.map((p) => p.id).slice(0, 5), act_name: act.name } : {}),
    });
    return { ...result, act: act?.name, note, basisLine: act ? `Ideas from fans of ${act.name} and what ${result.cities[0]?.city ?? opts.city} loves.` : result.basisLine };
  } finally {
    await mcp.close().catch(() => {});
  }
}

// ---------- Feedback: Keep / Not for me / More like this / Tell Tourbo (PLAN §18 Q19) ----------

// Saved per plan (run_steps "ideas_feedback"): `state` = the act's feedback; `fresh` = cities asked
// again because a constraint changed what the fan data is asked (era, clean), keyed by those inputs.
export type FreshCity = { key: string; city: CityIdeas; savedAt: string };
export type FeedbackState = { feedback: IdeaFeedback; fresh: Record<string, FreshCity>; version: number };
const EMPTY_STATE: FeedbackState = { feedback: EMPTY_FEEDBACK, fresh: {}, version: 0 };

export async function feedbackState(runId: string): Promise<FeedbackState> {
  const steps = await getSteps<FeedbackState>(runId, "ideas_feedback").catch(() => new Map<string, FeedbackState>());
  return steps.get("state") ?? EMPTY_STATE;
}

// The inputs one city is asked with once the act's constraints apply to it.
export function cityInputs(kind: string, inputs: IdeasInputs, fb: IdeaFeedback, city: string): IdeasInputs {
  const p = fetchPatch(fb.constraints, city);
  return ideasInputs(kind, { ...inputs, ...(p.skew ? { skew: p.skew } : {}), ...(p.boundaries ? { boundaries: p.boundaries } : {}) });
}
const freshKey = (i: IdeasInputs) => createHash("sha256").update(JSON.stringify(i)).digest("hex").slice(0, 16);

// Cities whose constraints change the fan-data ask and that have no answer saved for it yet.
export function staleCities(kind: string, inputs: IdeasInputs, state: FeedbackState, cities: string[]): string[] {
  return cities.filter((c) => patchKey(fetchPatch(state.feedback.constraints, c)) && state.fresh[norm(c)]?.key !== freshKey(cityInputs(kind, inputs, state.feedback, c)));
}

// The saved payload with the cities asked again swapped in (only when their inputs still match).
export function withFresh<T extends { cities: CityIdeas[] }>(data: T, kind: string, inputs: IdeasInputs, state: FeedbackState): T {
  return {
    ...data,
    cities: data.cities.map((c) => {
      if (!patchKey(fetchPatch(state.feedback.constraints, c.city))) return c;
      const f = state.fresh[norm(c.city)];
      return f && f.key === freshKey(cityInputs(kind, inputs, state.feedback, c.city)) ? f.city : c;
    }),
  };
}

export async function changeIdeasFeedback(runId: string, change: FeedbackChange, version?: number): Promise<{ ok: true; state: FeedbackState; affected: string[] } | { ok: false; error: string }> {
  const run = await getRun(runId);
  if (!run?.plan) return { ok: false, error: "This plan isn't here any more. It may have been deleted." };
  const state = await feedbackState(runId);
  if (version !== undefined && version !== state.version) return { ok: false, error: "These ideas changed in another tab. Reload to see the latest, then try again." };
  const feedback = changeFeedback(state.feedback, change);
  const next: FeedbackState = { ...state, feedback, version: state.version + 1 };
  await saveStep(runId, "ideas_feedback", "state", next);
  return { ok: true, state: next, affected: affectedCities(state.feedback, feedback, run.plan.stops.map((s) => s.city.name)) };
}

// Ask the fan data again for just these cities (grouped by their inputs: one call per group).
export async function refreshCities(runId: string, inputs: IdeasInputs, cities: string[]): Promise<FeedbackState> {
  const run = await getRun(runId);
  const plan = run?.plan;
  if (!plan) throw new PlainIdeasError("The plan isn't ready yet. Open it again when the nights are in.");
  const state = await feedbackState(runId);
  const kind = plan.artist.kind;
  const want = staleCities(kind, inputs, state, plan.stops.map((s) => s.city.name).filter((c) => cities.some((x) => norm(x) === norm(c))));
  if (!want.length) return state;
  const groups = new Map<string, { inputs: IdeasInputs; cities: string[] }>();
  for (const c of want) {
    const i = cityInputs(kind, inputs, state.feedback, c);
    const g = groups.get(freshKey(i)) ?? { inputs: i, cities: [] };
    g.cities.push(c);
    groups.set(freshKey(i), g);
  }
  const ids = signalIds(plan.artist);
  const fresh = { ...state.fresh };
  const now = new Date().toISOString();
  for (const [key, g] of groups) {
    const r = await callIdeas({ cities: g.cities, region: plan.params.region, kind, act_id: ids[0], peer_ids: ids.slice(1, 6), act_name: plan.artist.name, ...g.inputs });
    for (const c of r.cities) fresh[norm(c.city)] = { key, city: c, savedAt: now };
  }
  const latest = await feedbackState(runId);
  const next: FeedbackState = { ...latest, fresh: { ...latest.fresh, ...fresh } };
  await saveStep(runId, "ideas_feedback", "state", next);
  return next;
}

// "Tell Tourbo": the AI only turns the note into constraints (cached per text); applying them is
// deterministic (engine/idea-feedback.ts). No AI key → a small word parser, said once.
const NoteSchema = z.object({
  avoidRefs: z.array(z.string()).max(12).describe("exact names the act doesn't want suggested"),
  avoidCategories: z.array(z.enum(IDEA_CATEGORIES as [string, ...string[]])).max(12),
  avoidWords: z.array(z.string()).max(12).describe("lowercase words or topics to keep out (e.g. politics, religion)"),
  preferCategories: z.array(z.enum(IDEA_CATEGORIES as [string, ...string[]])).max(12),
  era: z.enum(["recent", "classic"]).optional().describe("only if the note asks for newer or older acts / references"),
  clean: z.boolean().optional().describe("true only if the note asks to keep it clean / family friendly"),
  maxPerCity: z.number().int().min(1).max(12).optional(),
  cities: z.array(z.string()).max(8).optional().describe("only if the note limits itself to some of the given cities; copy their names exactly"),
});
const NOTE_SYSTEM = `You turn a touring act's short note about local ideas into constraints. Categories: ${IDEA_CATEGORIES.map((c) => `${c} (${CATEGORY_LABEL[c]})`).join(", ")}. Only fill what the note clearly says; leave everything else empty. Never add names that aren't in the note.`;
export const NOTE_WORDS = "Your AI assistant isn't set up here, so Tourbo read your note by its key words.";

export async function parseNote(runId: string, note: string, cities: string[]): Promise<{ constraints: Constraints; parsedBy: "ai" | "words"; notice?: string }> {
  const text = note.trim().slice(0, 200);
  if (!text) return { constraints: cleanConstraints({}), parsedBy: "words" };
  if (!aiReady()) return { constraints: parseNoteWords(text, cities), parsedBy: "words", notice: NOTE_WORDS };
  const key = createHash("sha256").update(JSON.stringify([text.toLowerCase(), cities])).digest("hex").slice(0, 16);
  const hit = (await getSteps<Constraints>(runId, "ideas_note").catch(() => new Map<string, Constraints>())).get(key);
  if (hit) return { constraints: cleanConstraints(hit), parsedBy: "ai" };
  client ??= new Anthropic();
  try {
    const res = await client.messages.parse({
      model: WORKER_MODEL,
      max_tokens: 600,
      output_config: { effort: "low", format: zodOutputFormat(NoteSchema) },
      system: NOTE_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ note: text, cities }) }],
    });
    recordUsage(WORKER_MODEL, res.usage);
    const constraints = cleanConstraints({ ...(res.parsed_output as Partial<Constraints> | null), cities: res.parsed_output?.cities?.filter((c) => cities.some((x) => norm(x) === norm(c))) });
    await saveStep(runId, "ideas_note", key, constraints).catch(() => {});
    return { constraints, parsedBy: "ai" };
  } catch {
    return { constraints: parseNoteWords(text, cities), parsedBy: "words", notice: "Your AI assistant didn't answer, so Tourbo read your note by its key words." };
  }
}

// ---------- AI angles ----------

const Lines = z.object({
  lines: z
    .array(
      z.object({
        ref: z.string().describe("the idea's ref, copied exactly"),
        angle: z.string().describe("one short line (max ~20 words) that names the ref"),
        question: z.string().optional().describe("comics / speakers only: one crowd-work question that names the ref"),
      }),
    )
    .max(20),
});

const SYSTEM = (kind: string, city: string) =>
  `You write one angle line per idea for a touring ${kind} playing ${city}. Each idea is a name from that city's fan data. Rules: write only for the ideas given, copy each idea's ref exactly into ref and name it in the line; never mention any other local name, team, show, place or brand; no numbers. Covers: how to play that artist's song in the act's own way. Topics: a bit premise or local example, plus a short crowd-work question for comics and speakers. Painting subjects: a concrete subject or series idea. Plain words, specific to ${city}.`;

let client: Anthropic | undefined;

export const aiReady = () => !!process.env.ANTHROPIC_API_KEY;
export const NO_AI = "Your AI assistant isn't set up on this server, so these are the plain ideas without written angles.";

export async function writeAngles(result: IdeasPayload): Promise<IdeasPayload & { dropped: number }> {
  if (!aiReady()) return { ...result, note: NO_AI, dropped: 0 };
  client ??= new Anthropic();
  let dropped = 0;
  const inputs = ideasInputs(result.kind, result.context);
  const cities = await Promise.all(
    result.cities.map(async (c) => {
      if (!c.ideas.length) return c;
      const ctx = performanceContext({ kind: result.kind, ...inputs, place: { country: c.country, name: c.city } });
      const payload = { act: result.act, ideas: c.ideas.map((i) => ({ ref: i.ref, category: i.category, hint: i.angle })) };
      const call = () =>
        client!.messages.parse({
          model: WORKER_MODEL,
          max_tokens: 3000,
          output_config: { effort: "low", format: zodOutputFormat(Lines) },
          system: `${SYSTEM(result.kind.replace(/_/g, " "), c.city)}\n${avoidPrompt(ctx.avoid)}`,
          messages: [{ role: "user", content: JSON.stringify(payload) }],
        });
      const res = await call().catch(() => call());
      recordUsage(WORKER_MODEL, res.usage);
      // Sensitivity critic first (grounded names are allowed, so a show title doesn't trip it), then grounding.
      const refs = c.ideas.map((i) => i.ref);
      const safe = dropAvoided(res.parsed_output?.lines ?? [], ctx.avoid, (l) => `${l.angle} ${l.question ?? ""}`, { allow: refs });
      const { kept, dropped: bad } = groundLines(c.ideas, safe.kept);
      dropped += bad.length + safe.dropped.length;
      return { ...c, ideas: c.ideas.map((i) => { const l = kept.get(norm(i.ref)); return l ? { ...i, angle: l.angle, question: l.question ?? i.question, written: true } : i; }) };
    }),
  );
  return { ...result, cities, dropped };
}

// ---------- Errors: one plain sentence, vendor-neutral ----------

export class PlainIdeasError extends Error {}

export function ideasError(error: unknown): { error: string; retry: boolean } {
  if (error instanceof PlainIdeasError) return { error: error.message, retry: false };
  return apiError(error, "ideas");
}

// What the Ideas tab shows per city for the plan's own context (Tune levers, default slot), with
// the act's feedback applied and covers left to the Covers tab: the one source for the page, its
// tab badge and the night panel. DB reads only.
// The ideas context for a plan page's URL (?slot=&flavour=&b=), on top of the plan's Tune levers.
export async function ideasInputsFor(runId: string, kind: string, q?: URLSearchParams): Promise<IdeasInputs> {
  const l = await leverDefaults(runId, kind);
  return ideasInputs(kind, { slot: q?.get("slot") ?? undefined, flavour: q?.get("flavour") ?? l.flavour, boundaries: q?.get("b") ?? l.boundaries, skew: l.skew });
}

export async function shownIdeas(runId: string, kind: string, inputs?: IdeasInputs): Promise<{ data: IdeasPayload; cities: ShownCity[]; savedAt?: string; angles: boolean; feedback?: IdeaFeedback } | undefined> {
  const i: IdeasInputs = inputs ?? (await ideasInputsFor(runId, kind));
  const [saved, fb] = await Promise.all([savedIdeas(runId, i), feedbackState(runId).catch(() => undefined)]);
  const s = saved?.angles ?? saved?.ideas;
  if (!s) return undefined;
  const data = fb ? withFresh(s.data, kind, i, fb) : s.data;
  const coversTab = workspaceFor(kind).main.includes("covers");
  return { data, cities: data.cities.map((c) => shownCity(c, fb?.feedback, coversTab)), savedAt: s.savedAt, angles: !!saved?.angles, feedback: fb?.feedback };
}
