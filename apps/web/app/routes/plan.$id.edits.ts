import { z } from "zod";

import { preferences } from "@tourbo/core/engine/edit.ts";
import { changeEdits, editState, loadPool } from "../../server/agent/edits.server";
import { getRun } from "../../server/agent/runs.server";
import { checkOwner, forbidden, notFound, ownerKeyOf, UUID } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/plan.$id.edits";

// "Your plan, your call" (PLAN §18 Q19). The act's edits on a finished plan, as JSON.
//   GET  /plan/:id/edits → { pool, version, edits, prefs }   (read-only, anyone with the link)
//   POST /plan/:id/edits  X-Owner-Key, body one of:
//     { action: "apply", edit: Edit, version }   swapCity | swapVenue | setDate | dropNight |
//                                                restoreNight | addNight | reorder | setLevers
//     { action: "undo", version } | { action: "reset" } | { action: "dismiss" | "restorePref", pref }
//   → { plan, version, diff, prefs, notice?, errors } or { error } (one plain sentence) with 4xx.
// Recompute is deterministic (core engine/edit.ts) on the run's own candidates: no fan-data calls.

export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run?.plan) return notFound("This plan");
  const [pool, state] = await Promise.all([loadPool(run), editState(run.id)]);
  return Response.json({ pool, version: state.version, edits: state.edits, prefs: preferences(state.edits, state.dismissed) });
}

const night = z.string().min(1).max(200);
const Edit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("swapCity"), night, city: z.string().min(1).max(120), venueId: z.string().max(120).optional() }),
  z.object({ op: z.literal("swapVenue"), night, venueId: z.string().min(1).max(120) }),
  z.object({ op: z.literal("setDate"), night, date: z.iso.date() }),
  z.object({ op: z.literal("dropNight"), night }),
  z.object({ op: z.literal("restoreNight"), night }),
  z.object({ op: z.literal("addNight"), city: z.string().min(1).max(120), venueId: z.string().max(120).optional(), at: z.number().int().min(0).max(40).optional() }),
  z.object({ op: z.literal("reorder"), night, to: z.number().int().min(0).max(40) }),
  z.object({
    op: z.literal("setLevers"),
    levers: z.object({
      ticketPrice: z.number().positive().nullable().optional(),
      roomMin: z.number().int().positive().optional(),
      roomMax: z.number().int().positive().optional(),
      crew: z.number().int().min(1).max(20).optional(),
      minGuarantee: z.number().nonnegative().nullable().optional(),
    }),
  }),
]);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("apply"), edit: Edit, version: z.number().int().optional() }),
  z.object({ action: z.literal("undo"), version: z.number().int().optional() }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("dismiss"), pref: z.string().max(80) }),
  z.object({ action: z.literal("restorePref"), pref: z.string().max(80) }),
]);

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const check = await checkOwner("run", params.id, ownerKeyOf(request)).catch(() => "missing" as const);
  if (check === "missing") return notFound("This plan");
  if (check === "forbidden") return forbidden();
  const body = Body.safeParse(await request.json().catch(() => undefined));
  if (!body.success) return Response.json({ error: "That change didn't make sense. Reload and try again." }, { status: 400 });
  try {
    const b = body.data;
    const r = await changeEdits(
      params.id,
      b.action === "apply" ? { kind: "apply", edit: b.edit } : b.action === "undo" ? { kind: "undo" } : b.action === "reset" ? { kind: "reset" } : { kind: b.action, pref: b.pref },
      "version" in b ? b.version : undefined,
    );
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ plan: r.plan, version: r.state.version, edits: r.state.edits, diff: r.diff, prefs: r.prefs, notice: r.notice, errors: r.errors });
  } catch (error) {
    return Response.json(apiError(error, "edits", "That change didn't save. Try again in a moment."), { status: 503 });
  }
}
