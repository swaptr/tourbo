import { AI_LIMIT, isAiLimit } from "./errors.ts";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { avoidPrompt, type Boundary, type Flavour } from "@tourbo/core/context/index.ts";
import type { Skew } from "@tourbo/core/context/audience.ts";
import { discipline } from "@tourbo/core/disciplines/index.ts";
import { groundMoves, type CitySet, type SetItemInput, type SetResult, type Slot, type WrittenMove } from "@tourbo/core/engine/set.ts";
import { connectMcp } from "../mcp.server.ts";
import { PlainError } from "./errors.ts";
import { WORKER_MODEL } from "./models.ts";
import { getRun, getSteps, saveStep } from "./runs.server.ts";
import { recordUsage } from "./usage.ts";

// "Build my set" for a plan: the deterministic order comes from the MCP tool tourbo_build_set
// (same as any external agent); the AI assistant then writes short reasons + transitions per city.
// A written reason survives only if it cites names from that city's facts (groundMoves); otherwise
// the tool's plain reason stays. No AI key: the plain order and reasons, with one sentence saying so.

const Written = z.object({
  moves: z
    .array(
      z.object({
        pos: z.number().int().describe("position in the running order, from the input"),
        reason: z.string().describe("why this goes here, max 18 words, plain"),
        transition: z.string().optional().describe("one short line to say on stage going into it (optional)"),
        refs: z.array(z.string()).describe("exact fact names this line uses"),
      }),
    )
    .max(40),
});

export type CityWriting = { moves: Record<number, WrittenMove>; dropped: number; avoided?: number };
export type SetBuild = { result: SetResult; writing: (CityWriting | undefined)[]; aiNote?: string };

const MAX_CITIES = 6;

let client: Anthropic | undefined;

const system = (noun: string, kind: string, c: CitySet) => `You help a touring act order their ${noun} set for one city. You get the running order Tourbo already chose (with a plain reason per slot) and the city's fan-data facts.
For each slot, write a short, warm reason (max 18 words) and, where it helps, one transition line the act could say on stage. ${discipline(kind as never).crowdWork ? "These are bits plus crowd-work slots." : "These are the act's own pieces plus local-nod slots."}
Originality first: the act's own material leads. ${c.local ? `${c.local.budget.note} Don't add local references to the act's own slots beyond that.` : ""}
${c.avoid ? avoidPrompt(c.avoid) : ""}
Use ONLY names from the facts list for anything local; refs must list the exact fact names your line uses, and every ref must appear in your text. Never invent venues, people, songs or local references. Don't reorder anything.`;

async function writeCity(noun: string, kind: string, c: CitySet): Promise<CityWriting> {
  client ??= new Anthropic();
  const payload = {
    city: c.city,
    order: c.order.map((e, pos) => ({ pos, title: e.title, move: e.move, minutes: e.minutes, plainReason: e.reason })),
    facts: c.facts.map((f) => `${f.name}: ${f.detail}`),
    ...(c.audience?.ages.length ? { audience: c.audience.why } : {}),
  };
  const call = () =>
    client!.messages.parse({
      model: WORKER_MODEL,
      max_tokens: 3000,
      output_config: { effort: "low", format: zodOutputFormat(Written) },
      system: system(noun, kind, c),
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
  const res = await call().catch(() => call());
  recordUsage(WORKER_MODEL, res.usage);
  const { kept, dropped, avoided } = groundMoves(res.parsed_output?.moves ?? [], c);
  return { moves: Object.fromEntries(kept.map((m) => [m.pos, m])), dropped, avoided };
}

// Exported for story 20 (STORY_LLM): write reasons on top of a tool result.
export async function writeReasons(result: SetResult): Promise<{ writing: (CityWriting | undefined)[]; aiNote?: string }> {
  const noun = discipline(result.kind).noun;
  try {
    client ??= new Anthropic();
  } catch {
    return { writing: [], aiNote: "Your AI assistant isn't set up here, so these are Tourbo's plain reasons." };
  }
  let limited = false;
  const writing = await Promise.all(
    result.cities.map((c) =>
      writeCity(noun, result.kind, c).catch((error) => {
        if (isAiLimit(error)) limited = true;
        return undefined;
      }),
    ),
  );
  const aiNote = writing.every((w) => !w) ? (limited ? `${AI_LIMIT} These are Tourbo's plain reasons.` : "Your AI assistant didn't answer, so these are Tourbo's plain reasons. Try again in a minute.") : undefined;
  return { writing, aiNote };
}

// A built set is the user's work, saved per plan (run_steps "set", keyed by a hash of its inputs);
// "set_last" points at the latest one with its inputs so the tab restores it on revisit. The same
// inputs never rebuild unless forced (Rebuild). An edited plan (PLAN Q19) reuses each city still in
// it from a set built with the same inputs and builds only the new cities. The Tune era lever
// (skew) is an input too, so changing it never shows a stale order.
export type SetInputs = { text: string; picks: unknown[]; slot: Slot; flavour: Flavour; boundaries: Boundary[]; skew?: Skew };
export type SavedSet = { key: string; base?: string; cities?: string[]; inputs: SetInputs; build: SetBuild; savedAt: string };
type KeyInputs = Pick<SetInputs, "slot" | "flavour" | "boundaries" | "skew">;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
// Default skew keeps the keys sets were saved under before levers fed in.
const keyParts = (items: SetItemInput[], i: KeyInputs) => [items, i.slot, i.flavour, [...i.boundaries].sort(), ...(i.skew ? [i.skew] : [])];
export const setKey = (items: SetItemInput[], i: KeyInputs, cities: string[]) =>
  hash(i.skew ? [...keyParts(items, i), cities] : [items, i.slot, i.flavour, [...i.boundaries].sort(), cities]);
export const setBaseKey = (items: SetItemInput[], i: KeyInputs) => hash(keyParts(items, i));

export async function savedSet(runId: string): Promise<SavedSet | undefined> {
  return (await getSteps<SavedSet>(runId, "set_last").catch(() => new Map<string, SavedSet>())).get("last");
}

const cityKey = (s: string) => s.toLowerCase().split(",")[0].replace(/[^a-z0-9]/g, "");

// Newest saved city sets (same inputs) for the cities asked; `missing` = cities none of them has.
export function reuseCities(saved: SavedSet[], base: string, cities: string[]) {
  const list = saved.filter((s) => s.base === base).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const found = cities.map((c) => {
    for (const s of list) {
      const i = s.build.result.cities.findIndex((x) => cityKey(x.city) === cityKey(c));
      if (i >= 0) return { city: s.build.result.cities[i], writing: s.build.writing[i], aiNote: s.build.aiNote, template: s.build.result };
    }
    return undefined;
  });
  return { found, missing: cities.filter((_, i) => !found[i]) };
}

export async function buildOrRestoreSet(runId: string, inputs: SetInputs, items: SetItemInput[], force = false): Promise<SetBuild & { savedAt?: string; reused?: number }> {
  const run = await getRun(runId);
  const cities = [...new Set((run?.plan?.stops ?? []).map((s) => s.city.query ?? s.city.name))].slice(0, MAX_CITIES);
  const key = setKey(items, inputs, cities);
  const base = setBaseKey(items, inputs);
  const all = force ? new Map<string, SavedSet>() : await getSteps<SavedSet>(runId, "set").catch(() => new Map<string, SavedSet>());
  const hit = all.get(key);
  if (hit) {
    await saveStep(runId, "set_last", "last", { ...hit, inputs }).catch(() => {});
    return { ...hit.build, savedAt: hit.savedAt };
  }
  const reuse = force ? undefined : reuseCities([...all.values()], base, cities);
  const reused = reuse ? reuse.found.filter(Boolean).length : 0;
  let build: SetBuild;
  if (reuse && reused > 0) {
    const fresh = reuse.missing.length ? await buildSetForRun(runId, { items, slot: inputs.slot, flavour: inputs.flavour, boundaries: inputs.boundaries, skew: inputs.skew, cities: reuse.missing }) : undefined;
    const byCity = (c: string) => {
      const old = reuse.found[cities.indexOf(c)];
      if (old) return { city: old.city, writing: old.writing };
      const i = fresh!.result.cities.findIndex((x) => cityKey(x.city) === cityKey(c));
      return i >= 0 ? { city: fresh!.result.cities[i], writing: fresh!.writing[i] } : undefined;
    };
    const parts = cities.map(byCity).filter((x): x is NonNullable<typeof x> => !!x);
    const template = fresh?.result ?? reuse.found.find(Boolean)!.template;
    build = { result: { ...template, cities: parts.map((p) => p.city) }, writing: parts.map((p) => p.writing), aiNote: fresh?.aiNote };
  } else build = await buildSetForRun(runId, { items, slot: inputs.slot, flavour: inputs.flavour, boundaries: inputs.boundaries, skew: inputs.skew });
  const saved: SavedSet = { key, base, cities, inputs, build, savedAt: new Date().toISOString() };
  await Promise.all([saveStep(runId, "set", key, saved), saveStep(runId, "set_last", "last", saved)]).catch(() => {});
  return { ...build, savedAt: saved.savedAt, ...(reused ? { reused } : {}) };
}

// cities: only these (plan city names or queries); default every city in the plan (max 6).
export async function buildSetForRun(runId: string, input: { items: SetItemInput[]; slot: Slot; flavour?: Flavour; boundaries?: Boundary[]; skew?: Skew; cities?: string[]; withAi?: boolean }): Promise<SetBuild> {
  const run = await getRun(runId);
  const plan = run?.plan;
  if (!plan) throw new PlainError("This plan isn't ready yet. Wait for it to finish, then build your set.");
  if (!input.items.length) throw new PlainError("Paste at least one song or bit, one per line.");
  const cities = input.cities?.length ? input.cities : [...new Set(plan.stops.map((s) => s.city.query ?? s.city.name))].slice(0, MAX_CITIES);
  if (!cities.length) throw new PlainError("This plan has no nights yet. Plan a tour first.");
  const a = plan.artist;
  const known = (!a.basis || a.basis === "act") && !!a.id;
  const styles = (a.styles?.length ? a.styles : a.tags).map((t) => t.name).slice(0, 2);
  const mcp = await connectMcp(() => {}, ["tourbo"]);
  let result: SetResult;
  try {
    result = await mcp.call<SetResult>("tourbo_build_set", {
      items: input.items,
      cities,
      region: plan.params.region,
      kind: plan.artist.kind,
      slot: input.slot,
      flavour: input.flavour ?? "touch",
      ...(input.boundaries?.length ? { boundaries: input.boundaries } : {}),
      ...(input.skew && input.skew !== "even" ? { skew: input.skew } : {}),
      ...(known ? { act_id: plan.artist.id } : {}),
      peer_ids: a.basis === "peers" || known ? a.peers.map((p) => p.id).filter((id) => id && id !== a.id).slice(0, 5) : [],
      default_styles: styles,
    });
  } finally {
    await mcp.close().catch(() => {});
  }
  if (input.withAi === false) return { result, writing: [] };
  return { result, ...(await writeReasons(result)) };
}
