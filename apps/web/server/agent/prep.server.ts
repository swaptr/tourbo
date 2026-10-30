import Anthropic from "@anthropic-ai/sdk";
import { discipline } from "@tourbo/core/disciplines/index.ts";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { db } from "@tourbo/core/db/client.server.ts";
import { briefNames, normalizeRef, type CityBrief } from "@tourbo/core/engine/brief.ts";
import type { Emit } from "@tourbo/core/engine/trace.ts";
import type { CityPlan, Plan } from "@tourbo/core/shared/types.ts";
import { connectMcp } from "../mcp.server.ts";
import { WORKER_MODEL } from "./models.ts";
import { getRun } from "./runs.server.ts";
import type { Rehearsal } from "./rehearsal.server.ts";
import { recordUsage } from "./usage.ts";

// Show prep for one stop: brief (MCP) → draft → grounding critic → revise, plus a Qloo-off draft
// for contrast. Every reference in the final prep must be a name from the city brief.

const SECTIONS = ["opening", "setlist", "material", "banter", "crowd", "staging", "sponsor", "avoid"] as const;
const UNGROUNDED_OK = new Set<string>(["staging", "avoid"]);

const Draft = z.object({
  hook: z.string().describe("one line: the idea for this night"),
  items: z
    .array(
      z.object({
        section: z.enum(SECTIONS),
        text: z.string().describe("one concrete, usable line or note"),
        refs: z.array(z.string()).describe("exact names from the brief this item uses; empty only for staging/avoid"),
      }),
    )
    .min(6)
    .max(16),
});
type Draft = z.infer<typeof Draft>;

export type PrepStep = { kind: "mcp" | "draft" | "critic" | "revise" | "contrast"; message: string };
export type ShowPrep = {
  city: string;
  brief: CityBrief;
  draft: Draft;
  issues: string[];
  final: Draft;
  remaining: string[];
  generic?: Draft;
  steps: PrepStep[];
  createdAt: string;
  rehearsal?: Rehearsal; // set by rehearse(); a rewrite clears it
};

const RULES = `Use ONLY the Qloo city brief you are given for local references: what the act's fans love (fanTaste), what the city loves (cityCulture), the local scene (localArtists), spots the act's fans go to (localSpots), city brands the fans rank highest (sponsors) and concepts the fans over-index on (fanTags). Every non-staging/avoid item must list in refs the exact names it uses, copied from the brief (the act, city, venue and opener from the show are allowed too). Never use a local name, place, team, show or brand that is not in the brief, including in avoid items. Only cite a ref you actually name in the text; don't attach refs for decoration. Write plainly, specific to this city and room; no generic filler.`;

const GENERIC = `Use your own general knowledge of the city; no data is provided. List any names you use in refs.`;

let client: Anthropic | undefined;

// One retry: structured output occasionally fails to parse (truncation, transient API errors).
const draftPrep = (system: string, payload: unknown) => draftOnce(system, payload).catch(() => draftOnce(system, payload));

async function draftOnce(system: string, payload: unknown): Promise<Draft> {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model: WORKER_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(Draft) },
    system,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });
  recordUsage(WORKER_MODEL, res.usage);
  if (!res.parsed_output) throw new Error(`prep draft failed (${res.stop_reason})`);
  return res.parsed_output;
}

// Deterministic grounding check: a reference counts only if it names a brief item.
// Plan facts (act, city, venue, opener) are grounded too.
export function critique(draft: Draft, brief: CityBrief, planNames: string[] = []): string[] {
  const known = briefNames(brief);
  const facts = new Set(planNames.map(normalizeRef));
  for (const n of facts) known.add(n);
  const issues: string[] = [];
  draft.items.forEach((item, i) => {
    const bad = item.refs.filter((r) => !known.has(normalizeRef(r)));
    if (bad.length) issues.push(`item ${i + 1} (${item.section}) cites ${bad.map((b) => `"${b}"`).join(", ")}, which is not in the city brief`);
    if (!item.refs.length && !UNGROUNDED_OK.has(item.section)) issues.push(`item ${i + 1} (${item.section}) has no fan-data reference`);
    const text = normalizeRef(item.text);
    const unused = item.refs.filter((r) => known.has(normalizeRef(r)) && !facts.has(normalizeRef(r)) && !text.includes(normalizeRef(r)));
    if (unused.length) issues.push(`item ${i + 1} (${item.section}) cites ${unused.map((u) => `"${u}"`).join(", ")} without using it in the text`);
  });
  if (!draft.items.some((i) => i.section === "sponsor") && brief.sponsors.length) issues.push("no sponsor ask although the brief has sponsor candidates");
  return issues;
}

const briefPayload = (b: CityBrief) => ({
  fanTaste: b.fanTaste.map((r) => `${r.name} (${r.type})`),
  cityCulture: b.cityCulture.map((r) => `${r.name} (${r.type})`),
  localArtists: b.localArtists.map((r) => r.name),
  localSpots: b.localSpots.map((r) => r.name),
  sponsors: b.sponsors.map((r) => r.name),
  fanTags: b.fanTags.map((r) => r.name),
});

const showPayload = (plan: Plan, stop: CityPlan) => ({
  act: { name: plan.artist.name, kind: plan.artist.kind, genres: plan.artist.tags.map((t) => t.name).slice(0, 6) },
  city: stop.city.name,
  date: stop.date,
  venue: stop.venue && { name: stop.venue.name, type: stop.venue.tag.split(":").at(-1)?.replace(/_/g, " "), neighborhood: stop.venue.neighborhood },
  capacity: stop.money?.capacity ?? stop.capacity?.max,
  expectedTickets: stop.money?.tickets,
  slot: stop.money?.verdict,
  opener: stop.opener?.name,
});

export async function prepareShow(runId: string, stopIndex: number, opts: { contrast?: boolean; emit?: Emit } = {}): Promise<ShowPrep> {
  const run = await getRun(runId);
  const plan = run?.plan;
  const stop = plan?.stops[stopIndex];
  if (!plan || !stop) throw new Error("No such stop");
  const steps: PrepStep[] = [];
  const mcp = await connectMcp(() => {}, ["tourbo"]);
  let brief: CityBrief;
  try {
    brief = await mcp.call<CityBrief>("tourbo_city_brief", {
      act_id: plan.artist.id,
      peer_ids: plan.artist.peers.map((p) => p.id),
      kind: plan.artist.kind,
      region: plan.params.region,
      city: stop.city.name,
    });
  } finally {
    await mcp.close().catch(() => {});
  }
  const total = Object.values(briefPayload(brief)).reduce((n, list) => n + list.length, 0);
  steps.push({ kind: "mcp", message: `${total} references for ${stop.city.name}` });

  const prepPrompt = discipline(plan.artist.kind).prep;
  const system = `${prepPrompt}\n${RULES}`;
  const show = showPayload(plan, stop);
  const [draft, generic] = await Promise.all([
    draftPrep(system, { show, brief: briefPayload(brief) }),
    opts.contrast === false ? undefined : draftPrep(`${prepPrompt}\n${GENERIC}`, { show }).catch(() => undefined),
  ]);
  steps.push({ kind: "draft", message: `drafted ${draft.items.length} items` });
  if (generic) steps.push({ kind: "contrast", message: `${generic.items.length} items from general knowledge only` });

  const planNames = [plan.artist.name, stop.city.name, stop.venue?.name, stop.opener?.name].filter((n): n is string => !!n);
  const issues = critique(draft, brief, planNames);
  steps.push({ kind: "critic", message: issues.length ? `${issues.length} grounding issue${issues.length > 1 ? "s" : ""}` : "all references grounded" });

  let final = draft;
  let remaining = issues;
  if (issues.length) {
    final = await draftPrep(system, {
      show,
      brief: briefPayload(brief),
      previousDraft: draft,
      criticIssues: issues,
      instruction: "Revise the previous draft: fix every critic issue (replace or drop ungrounded references), keep what was grounded.",
    });
    remaining = critique(final, brief, planNames);
    steps.push({ kind: "revise", message: `revised: ${remaining.length} issue${remaining.length === 1 ? "" : "s"} left` });
  }

  opts.emit?.("decision", `${stop.city.name}: show prep ready (${final.items.length} notes; critic fixed ${issues.length - remaining.length} ungrounded reference${issues.length - remaining.length === 1 ? "" : "s"})`, { job: "prep", city: stop.city.name });
  const prep: ShowPrep = { city: stop.city.name, brief, draft, issues, final, remaining, generic, steps, createdAt: new Date().toISOString() };
  const sql = await db();
  await sql`
    insert into show_prep (run_id, stop_index, prep) values (${runId}, ${stopIndex}, ${sql.json(prep as never)})
    on conflict (run_id, stop_index) do update set prep = excluded.prep, updated_at = now()`;
  return prep;
}

export async function getPreps(runId: string): Promise<Record<number, ShowPrep>> {
  const sql = await db();
  const rows = await sql<{ stop_index: number; prep: ShowPrep }[]>`select stop_index, prep from show_prep where run_id = ${runId}`;
  return Object.fromEntries(rows.map((r) => [r.stop_index, r.prep]));
}
