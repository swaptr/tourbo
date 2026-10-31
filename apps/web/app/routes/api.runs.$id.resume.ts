import { resumeRun } from "../../server/agent/orchestrator.server";
import { checkOwner, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import { runLimit } from "../../server/limits.server";
import type { Route } from "./+types/api.runs.$id.resume";

// POST /api/runs/:id/resume with X-Owner-Key: picks a failed or interrupted plan up where it
// stopped (same link; finished steps are reused, not redone).
export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const check = await checkOwner("run", params.id, ownerKeyOf(request));
    if (check === "missing") return notFound("This plan");
    if (check === "forbidden") return forbidden();
    const limited = runLimit(request);
    if (limited) return Response.json({ error: limited }, { status: 429 });
    await resumeRun(params.id);
    return Response.json({ ok: true, id: params.id });
  } catch (error) {
    return Response.json(apiError(error, "resume", "The planner couldn't restart. Try again in a moment."), { status: 503 });
  }
}
