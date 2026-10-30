import { z } from "zod";

import { ASSIST_TASKS } from "@tourbo/core/assist/assist.ts";
import { runAssist } from "../../server/agent/assist.server";
import { apiError } from "../../server/agent/errors";
import { checkOwner, ownerKeyOf, UUID } from "../../server/owner.server";
import type { Route } from "./+types/api.assist";

// POST /api/assist { task, input, profileId? } (+ X-Owner-Key of the profile or the run).
// Returns { draft, evidence[], source: "fan data" | "ai" | "rules", notice?, limited?, cached? }.
// Drafts only: nothing is saved to the act's work here (Keep goes through the usual APIs). The AI
// assistant runs, and its result is cached, only for the owner; others get the rules draft.
const Body = z.object({ task: z.enum(ASSIST_TASKS), input: z.unknown(), profileId: z.string().regex(UUID).optional() });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request didn't look right. Reload the page and try again." }, { status: 400 });
  const { task, input, profileId } = body.data;
  try {
    const key = ownerKeyOf(request);
    const profileOk = profileId ? (await checkOwner("profile", profileId, key, true)) === "ok" : false;
    const result = await runAssist(task, input ?? {}, { key, profileId, profileOk });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Some of that didn't look right. Check it and try again." }, { status: 400 });
    const e = apiError(error, `assist ${task}`, "Tourbo couldn't draft that just now. Try again in a moment.");
    return Response.json(e, { status: e.retry ? 503 : 400 });
  }
}
