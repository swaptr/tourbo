import { z } from "zod";

import { applyLevers, parseLevers } from "@tourbo/core/engine/levers.ts";
import { EditError } from "@tourbo/core/engine/proposals.ts";
import { apiError } from "../../server/agent/errors";
import { AI_OFF, aiReady, askedToday, CHAT_LIMITS, chatHistory, chatTurn, ipLeft, loadScope, type ChatEvent } from "../../server/agent/chat.server";
import {
  applyProposal,
  discardProposal,
  getConstraints,
  getLevers,
  listProposals,
  promptsFor,
  proposeEdits,
  recordAnswer,
  saveLevers,
  undoProposal,
} from "../../server/agent/proposals.server";
import { getRun } from "../../server/agent/runs.server";
import { checkOwner, forbidden, notFound, ownerHash, ownerKeyOf } from "../../server/owner.server";
import type { Route } from "./+types/api.chat";

// Conversation layer API (PLAN §18 Q20). One route, owner-key protected writes:
//   GET  /api/chat?runId=…            → history, proposals, levers, saved preferences, open questions
//   GET  /api/chat?city=…             → whether Ask Tourbo is on and questions left (no plan)
//   POST { intent: "ask", runId | city…, message } → text/event-stream of ChatEvent (data: lines)
//   POST { intent: "apply" | "discard" | "undo", runId, proposalId }
//   POST { intent: "levers", runId, levers }      → saved lever state + the tuned view's diff
//   POST { intent: "answer", runId, promptId, optionId } → records the preference; an option with
//        an edit is applied as a proposal (Undo on the returned card)
// Shared links can read but not write: writes without the owner key get one plain 403 sentence.

const UUID = z.uuid();
const ipOf = (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || r.headers.get("x-real-ip") || "local";
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  if (!runId) return Response.json({ ai: aiReady(), off: aiReady() ? undefined : AI_OFF, left: ipLeft(ipOf(request)) });
  if (!UUID.safeParse(runId).success) return notFound("This plan");
  const run = await getRun(runId);
  if (!run) return notFound("This plan");
  try {
    const [history, proposals, levers, constraints, prompts, owner] = await Promise.all([
      chatHistory(runId),
      listProposals(runId),
      getLevers(runId),
      getConstraints(runId),
      run.plan && run.status === "done" ? promptsFor(runId, run.plan) : Promise.resolve([]),
      ownerHash("run", runId).catch(() => null),
    ]);
    return Response.json({
      ai: aiReady(),
      off: aiReady() ? undefined : AI_OFF,
      left: Math.max(0, CHAT_LIMITS.perRunPerDay - askedToday(history)),
      history,
      proposals,
      levers,
      constraints,
      prompts,
      owned: Boolean(owner), // made with an owner key: only that browser may write
      ready: run.status === "done" && !!run.plan,
    });
  } catch (error) {
    const e = apiError(error, "chat load");
    return Response.json(e, { status: 503 });
  }
}

const Ask = z.object({
  intent: z.literal("ask"),
  runId: UUID.optional(),
  city: z.string().max(80).optional(),
  kind: z.string().max(30).optional(),
  region: z.string().max(10).optional(),
  act: z.string().max(120).optional(),
  facts: z.string().max(6000).optional(), // /ideas: what the page already shows, as grounding
  message: z.string().trim().min(1).max(CHAT_LIMITS.maxChars),
});
const OnProposal = z.object({ intent: z.enum(["apply", "discard", "undo"]), runId: UUID, proposalId: UUID });
const SetLevers = z.object({ intent: z.literal("levers"), runId: UUID, levers: z.record(z.string(), z.unknown()) });
const Answer = z.object({ intent: z.literal("answer"), runId: UUID, promptId: z.string().max(200), optionId: z.string().max(40) });
const Body = z.discriminatedUnion("intent", [Ask, OnProposal, SetLevers, Answer]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("That request didn't look right. Reload the page and try again.");
  const body = parsed.data;
  const runId = "runId" in body ? body.runId : undefined;
  if (runId) {
    const check = await checkOwner("run", runId, ownerKeyOf(request)).catch(() => "missing" as const);
    if (check === "missing") return notFound("This plan");
    if (check === "forbidden") return forbidden();
  }
  try {
    switch (body.intent) {
      case "ask":
        return askStream(body, ipOf(request));
      case "apply":
        return Response.json(await applyProposal(body.runId, body.proposalId));
      case "discard":
        return Response.json({ proposal: await discardProposal(body.runId, body.proposalId) });
      case "undo":
        return Response.json(await undoProposal(body.runId, body.proposalId));
      case "levers": {
        const run = await getRun(body.runId);
        if (!run?.plan) return bad("The plan isn't ready yet.");
        const levers = parseLevers(body.levers);
        await saveLevers(body.runId, levers);
        return Response.json({ levers, diff: applyLevers(run.plan, levers).diff });
      }
      case "answer": {
        const run = await getRun(body.runId);
        if (!run?.plan) return bad("The plan isn't ready yet.");
        const prompt = (await promptsFor(body.runId, run.plan)).find((p) => p.id === body.promptId);
        const option = prompt?.options.find((o) => o.id === body.optionId);
        if (!prompt || !option) return bad("That question has changed. Reload to see the current ones.", 409);
        await recordAnswer(body.runId, prompt.id, option.id, option.prefer);
        if (!option.edit?.length) return Response.json({ ok: true });
        const proposal = await proposeEdits(body.runId, `${prompt.question} ${option.label}`, option.edit);
        return Response.json(await applyProposal(body.runId, proposal.id));
      }
    }
  } catch (error) {
    const e = apiError(error, "chat action");
    return Response.json(e, { status: error instanceof EditError ? 422 : 503 });
  }
}

function askStream(body: z.infer<typeof Ask>, ip: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: ChatEvent) => {
        if (open) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        const scope = await loadScope(body);
        if (!scope) send({ type: "error", text: body.runId ? "This plan isn't ready to talk about yet." : "Pick a city first, then ask.", retry: false });
        else await chatTurn(scope, body.message, ip, send);
      } catch (error) {
        const e = apiError(error, "chat ask");
        send({ type: "error", text: e.error, retry: e.retry });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  // text/event-stream: the compression middleware passes it through unbuffered (server.js).
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
