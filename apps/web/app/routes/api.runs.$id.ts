import { checkOwner, deleteOwned, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.runs.$id";

// DELETE /api/runs/:id with X-Owner-Key: deletes the plan and everything under it (show notes,
// venue emails, check-ins, progress).
export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "DELETE") return new Response("Method not allowed", { status: 405 });
  try {
    const check = await checkOwner("run", params.id, ownerKeyOf(request), true);
    if (check === "missing") return notFound("This plan");
    if (check === "forbidden") return forbidden();
    await deleteOwned("run", params.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(apiError(error, "delete run", "That didn't delete. Try again in a moment."), { status: 503 });
  }
}
