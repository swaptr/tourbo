import { checkOwner, deleteOwned, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.projects.$id";

// DELETE /api/projects/:id with X-Owner-Key: deletes the project and its notes. Its plans stay.
export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "DELETE") return new Response("Method not allowed", { status: 405 });
  try {
    const check = await checkOwner("project", params.id, ownerKeyOf(request), true);
    if (check === "missing") return notFound("This project");
    if (check === "forbidden") return forbidden();
    await deleteOwned("project", params.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(apiError(error, "delete project", "That didn't delete. Try again in a moment."), { status: 503 });
  }
}
