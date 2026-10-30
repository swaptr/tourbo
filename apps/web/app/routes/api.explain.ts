import { z } from "zod";

import { grade, type ExplainItem } from "@tourbo/core/engine/explain.ts";
import { explainMany, itemsForRun } from "../../server/agent/explain.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.explain";

// POST /api/explain { runId, ids?: ["night:0", "deal:2"], items?: ExplainItem[] }
// ids: built on the server from the saved plan; items: built in the page from data it already
// shows (ideas, set moves, charts) with @tourbo/core/engine/explain-facts.ts. One AI call per batch,
// results saved per run + item hash. Always answers: template sentences when the AI is missing.
const Fact = z.object({
  key: z.string().max(40),
  label: z.string().max(160),
  value: z.union([z.number(), z.string().max(160)]),
  unit: z.enum(["score", "x", "pct", "money", "km", "count", "rank", "plain"]).optional(),
  say: z.string().max(200).optional(),
});
const Item = z.object({
  id: z.string().max(200),
  kind: z.enum(["compare", "takeaway", "pick"]),
  subject: z.string().max(160),
  other: z.string().max(160).optional(),
  facts: z.array(Fact).max(16),
  names: z.array(z.string().max(160)).max(16).optional(),
  currency: z.string().max(8).optional(),
  evidence: z.enum(["strong", "some", "none"]),
  chip: z.object({ text: z.string().max(120), meter: z.number().optional(), hedged: z.boolean().optional() }).optional(),
});
const Body = z.object({
  runId: z.uuid().optional(),
  ids: z.array(z.string().max(200)).max(60).optional(),
  items: z.array(Item).max(60).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request didn't look right. Reload the page and try again." }, { status: 400 });
  const { runId, ids = [], items = [] } = body.data;
  try {
    const built = runId && ids.length ? await itemsForRun(runId, ids) : [];
    // Client items: the evidence grade is a display hint only; a "strong" claim with no facts can't spend tokens.
    const client = items.map((i): ExplainItem => (i.facts.length < 2 && i.evidence === "strong" ? { ...i, evidence: grade({ margin: 0.1 }) } : i));
    const results = await explainMany([...built, ...client], { runId });
    return Response.json({ results });
  } catch (error) {
    return Response.json(apiError(error, "explain", "We couldn't write the reasons just now. Try again in a moment."), { status: 503 });
  }
}
