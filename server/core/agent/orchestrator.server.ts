import Anthropic from "@anthropic-ai/sdk";

import type { Emit } from "../engine/trace.ts";
import { TourParams, type Plan } from "../shared/types.ts";
import { ORCHESTRATOR_MODEL } from "./models.ts";
import { createRun, markActive, setRunStatus } from "./runs.server.ts";
import { createContext, createTools } from "./tools.ts";
import { recordUsage } from "./usage.ts";
import { createTrace } from "./trace.server.ts";

// Byte-identical across runs (no dates, no ids) so the prompt cache hits.
const SYSTEM = `You are Tourbo, a tour-routing agent for touring artists. You plan a tour that sells out using Qloo taste and location data through your tools; never name cities, venues or openers from your own knowledge.

Work in this order:
1. resolve_artist with the requested artist.
2. score_cities to get the shortlist (shows × 1.5 cities, ranked by fan footprint and over-indexing).
3. plan_city for the strongest shortlisted cities (call several in parallel). Prefer high scores; avoid thin-data cities unless the shortlist leaves no choice.
4. Choose exactly the requested number of shows, balancing score against geography, and call route_tour.
5. critique_plan. If it reports issues you can fix (swap a thin or far-flung city for another shortlisted one, re-plan, re-route), fix them and critique once more. Some issues may be unfixable with the data; note them.
6. finalize_plan with a short summary that names the overlooked markets and any caveats (estimated capacities, thin data).

Be decisive and economical with tool calls.`;

let client: Anthropic | undefined;

export async function orchestrate(params: TourParams, emit: Emit): Promise<Plan> {
  client ??= new Anthropic();
  const ctx = createContext(params, emit);
  const runner = client.beta.messages.toolRunner({
    model: ORCHESTRATOR_MODEL,
    max_tokens: 16000,
    max_iterations: 30,
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
export async function startRun(input: unknown): Promise<string> {
  const params = TourParams.parse(input);
  const id = await createRun(params);
  markActive(id);
  const emit = createTrace(id);
  void (async () => {
    try {
      await setRunStatus(id, "running");
      const plan = await orchestrate(params, emit);
      await setRunStatus(id, "done", plan);
      emit("decision", "Plan ready", { done: true });
    } catch (error) {
      // Status first, so a client reloading on the final event sees "failed".
      await setRunStatus(id, "failed").catch(() => {});
      emit("decision", `Run failed: ${(error as Error).message}`, { error: true, done: true });
    }
  })();
  return id;
}
