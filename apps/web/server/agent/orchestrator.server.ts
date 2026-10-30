import Anthropic from "@anthropic-ai/sdk";

import { db } from "@tourbo/core/db/client.server.ts";

import type { Emit } from "@tourbo/core/engine/trace.ts";
import { performerOpts } from "@tourbo/core/engine/plan.ts";
import { resolvePerformer } from "@tourbo/core/engine/resolve.ts";
import { TourParams, type Plan } from "@tourbo/core/shared/types.ts";
import { ORCHESTRATOR_MODEL } from "./models.ts";
import { planBaseline } from "./baseline.ts";
import { createRun, getRun, getSteps, isActive, markActive, saveStep, savePlan, setBaseline, setRunStatus, type Run } from "./runs.server.ts";
import type { WorkerResult } from "./worker.ts";
import { getPreps, prepareShow } from "./prep.server.ts";
import { draftAll } from "../outreach/outreach.server.ts";
import { classifyError, friendlyError, logError } from "./errors.ts";
import { connectMcp } from "../mcp.server.ts";
import { createContext, createTools } from "./tools.ts";
import { recordUsage } from "./usage.ts";
import { appendTrace, createTrace } from "./trace.server.ts";

// Byte-identical across runs (no dates, no ids) so the prompt cache hits.
const SYSTEM = `You are Tourbo, a tour manager agent for touring acts (musicians, comedians, DJs, dancers, poets, visual artists, authors, podcasters) who can't afford a booking agency. You plan a tour that makes money and sells out, using Qloo taste and location data through your tools (served by the Tourbo MCP server); never name cities, venues, openers or local references from your own knowledge.

Work in this order:
1. resolve_act.
2. score_cities to get the shortlist (shows × 1.5 cities, ranked by fan footprint and over-indexing).
3. plan_city for the strongest shortlisted cities (call several in parallel). Prefer high scores; avoid thin-data cities unless the shortlist leaves no choice. Each result includes a money estimate and a verdict (headline / co-headline / support slot / skip).
4. Money judgment: for any city whose verdict is not headline, try evaluate_show (a smaller room, a different ticket price) before giving up on it. Then set_show to commit: keep, downgrade to a support slot, or skip. Prefer swapping a skipped city for the next shortlisted one (plan_city it) over playing a loss-maker.
5. Choose exactly the requested number of shows (excluding skipped cities), balancing profit, score and geography, and call route_tour.
6. plan_promo if the act set a promo budget.
7. critique_plan. If it reports issues you can fix (swap a thin, loss-making or far-flung city for another shortlisted one, re-plan, re-route), fix them and critique once more. Some issues may be unfixable with the data; note them.
8. finalize_plan with a short summary: the overlooked markets, the tour profit estimate and any caveats (estimated capacities and money, thin data).

Money figures are estimates from the act's typical draw scaled by Qloo demand; say so. Be decisive and economical with tool calls.`;

let client: Anthropic | undefined;

// Logged shows of this act (post-show loop) calibrate its typical draw.
async function pastShows(artist: string) {
  try {
    const sql = await db();
    const rows = await sql<{ fan_index: number; attendance: number }[]>`
      select r.fan_index, r.attendance from show_results r
      join runs on runs.id = r.run_id
      where lower(coalesce(runs.plan->'artist'->>'name', runs.artist_name)) = lower(${artist}) and r.fan_index > 0
      order by r.created_at desc limit 20`;
    return rows.map((r) => ({ fanIndex: Number(r.fan_index), attendance: r.attendance }));
  } catch {
    return [];
  }
}

// Input mapping for unlisted acts: a style or "just my city" becomes stand-in acts (the
// discipline's acts liked by fans of that style, or by people in the area), passed as peers.
// The plan keeps `styles` and `basis`, so the plan page can say what it was built from.
async function withStandIns(params: TourParams, emit: Emit): Promise<TourParams> {
  const unlisted = params.basis === "styles" || params.basis === "city" || (!params.basis && (params.styles?.length ?? 0) > 0) || (params.notInQloo && !params.peers.length);
  if (!unlisted) return params;
  const a = await resolvePerformer(params.artist, params.kind, params.peers, performerOpts(params));
  if (!a || (a.basis !== "styles" && a.basis !== "city")) return params;
  emit("decision", `Planning from ${a.basis === "styles" ? (a.styles ?? []).map((t) => t.name).join(", ") : "the area's taste"} via ${a.peers.map((p) => p.name).join(", ")}`, { basis: a.basis });
  return { ...params, peers: a.peers.map((p) => p.name), notInQloo: true, basis: a.basis };
}

// runId: per-city worker picks are stored as they finish and reused when the run resumes.
export async function orchestrate(input: TourParams, emit: Emit, runId?: string): Promise<Plan> {
  client ??= new Anthropic();
  const params = await withStandIns(input, emit);
  const mcp = await connectMcp(emit, ["tourbo"]);
  const past = await pastShows(params.artist);
  if (past.length) emit("decision", `Calibrating draw from ${past.length} logged show${past.length > 1 ? "s" : ""}`, { pastShows: past.length });
  const ctx = createContext(params, emit, mcp, past);
  if (runId) {
    const done = await getSteps<WorkerResult>(runId, "worker").catch(() => new Map<string, WorkerResult>());
    ctx.workers = {
      get: (city) => done.get(city),
      put: (city, result) => void saveStep(runId, "worker", city, result).catch(() => {}),
    };
    ctx.keep = (step, key, value) => void saveStep(runId, step, key, value).catch(() => {});
  }
  try {
    return await runAgent(ctx, params, emit);
  } finally {
    await mcp.close().catch(() => {});
  }
}

async function runAgent(ctx: ReturnType<typeof createContext>, params: TourParams, emit: Emit): Promise<Plan> {
  const runner = client!.beta.messages.toolRunner({
    model: ORCHESTRATOR_MODEL,
    max_tokens: 16000,
    max_iterations: 40,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "medium" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: createTools(ctx),
    messages: [{ role: "user", content: `Plan this tour:\n${JSON.stringify(params)}` }],
  });

  let cacheRead = 0;
  for await (const message of runner) {
    cacheRead += message.usage.cache_read_input_tokens ?? 0;
    recordUsage(ORCHESTRATOR_MODEL, message.usage);
    for (const block of message.content) {
      if (block.type === "thinking" && block.thinking.trim()) emit("thinking_summary", block.thinking);
      if (block.type === "text" && block.text.trim()) emit("decision", block.text);
    }
    if (message.stop_reason === "refusal") {
      throw new Error(`Model declined (${message.stop_details?.category ?? "unknown"})`);
    }
    if (message.stop_reason === "max_tokens" && message.content.some((b) => b.type === "tool_use")) {
      throw new Error("Tool call truncated at max_tokens");
    }
  }
  emit("decision", `Agent finished (prompt cache read ${cacheRead} tokens)`, { cacheRead });

  if (ctx.plan) return ctx.plan;
  throw new Error("Agent stopped without finalizing a plan");
}

// Starts a detached run in this process; progress streams via the trace bus + DB.
// owner: the new run's owner key hash, or a run to copy it from (Adjust keeps the same key).
export async function startRun(input: unknown, owner: { ownerHash?: string; ownerFrom?: string; profileId?: string } = {}): Promise<string> {
  const params = TourParams.parse(input);
  const id = await createRun(params, owner);
  markActive(id);
  const emit = createTrace(id);
  void execute(id, params, emit);
  return id;
}

// Resume a failed or interrupted run in place (same id and link), reusing what already finished:
// the written plan (then the agent doesn't run again), per-city venue picks, show notes, venue
// emails and the baseline. Running or done runs are left alone. Returns false when there is no run.
export async function resumeRun(id: string): Promise<boolean> {
  const run = await getRun(id);
  if (!run) return false;
  if (run.status === "done" || isActive(id)) return true;
  markActive(id);
  const emit = await appendTrace(id);
  emit("decision", run.plan ? "Resuming: the plan is written, finishing the remaining jobs" : "Resuming the plan with the same answers", { resumed: true });
  void execute(id, run.params, emit, run);
  return true;
}

async function execute(id: string, params: TourParams, emit: Emit, prior?: Run) {
  // The Qloo-OFF baseline runs alongside; its failure never fails the run.
  const baseline = prior?.baseline
    ? Promise.resolve()
    : planBaseline(params)
        .then((b) => setBaseline(id, b))
        .then(() => emit("decision", "Baseline (no Qloo) ready for comparison"))
        .catch((error: Error) => (logError(`run ${id} baseline`, error), emit("repair", `Baseline failed: ${friendlyError(error)}`)));
  try {
    await setRunStatus(id, "running");
    let plan = prior?.plan ?? undefined;
    if (!plan) {
      plan = await orchestrate(params, emit, id);
      await savePlan(id, plan);
    }
    await runJobs(id, params, plan, emit);
    await baseline;
    await setRunStatus(id, "done", plan);
    emit("decision", "Plan ready", { done: true });
  } catch (error) {
    // Status first, so a client reloading on the final event sees "failed".
    await setRunStatus(id, "failed").catch(() => {});
    // The raw error goes to the server log only; the trace keeps the plain sentence and its kind.
    const c = classifyError(error);
    logError(`run ${id}`, error, c.kind);
    emit("decision", `Run failed: ${c.message}`, { error: true, done: true, kind: c.kind, retry: c.retry });
  }
}

// Jobs the act asked the agent to do once the plan exists. Each one is best-effort: a failed
// job is reported in the trace and never fails the tour.
async function runJobs(id: string, params: TourParams, plan: Plan, emit: Emit) {
  // Show notes already written (a resumed run) are kept, not rewritten.
  const prepped = await getPreps(id).catch(() => ({}) as Record<number, unknown>);
  const played = plan.stops.map((s, i) => ({ s, i })).filter(({ s, i }) => s.money?.verdict !== "skip" && !prepped[i]);
  if (params.jobs.includes("prep") && played.length) {
    emit("tool_call", `show_prep × ${played.length}`, { job: "prep" });
    await Promise.all(
      played.map(({ s, i }) =>
        prepareShow(id, i, { contrast: i === 0, emit }).catch((error: Error) =>
          (logError(`run ${id} prep`, error), emit("repair", `${s.city.name}: show notes failed (${friendlyError(error)})`, { job: "prep" })),
        ),
      ),
    );
  }
  if (params.jobs.includes("outreach")) {
    emit("tool_call", "draft_venue_emails", { job: "outreach" });
    await draftAll(id).catch((error: Error) => (logError(`run ${id} outreach`, error), emit("repair", `Venue emails failed (${friendlyError(error)})`, { job: "outreach" })));
  }
}
