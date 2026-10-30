import { MaterialFields } from "@tourbo/core/material/material.ts";
import { deleteMaterial, getMaterial, updateMaterial } from "@tourbo/core/material/material.server.ts";
import { checkOwner, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import { invalid } from "./api.material";
import type { Route } from "./+types/api.material.$id";

// One library item. POST { material } updates it, DELETE removes it (and from every set).
// Both need the owning profile's X-Owner-Key.
export async function action({ params, request }: Route.ActionArgs) {
  try {
    const current = await getMaterial(params.id);
    if (!current) return notFound("This item");
    const check = await checkOwner("profile", current.profileId, ownerKeyOf(request), true);
    if (check === "missing") return notFound("This item");
    if (check === "forbidden") return forbidden();
    if (request.method === "DELETE") {
      await deleteMaterial(params.id);
      return Response.json({ ok: true });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = (await request.json().catch(() => null)) as { material?: unknown } | null;
    const parsed = MaterialFields.safeParse(body?.material);
    if (!parsed.success) return invalid(parsed.error.issues[0]);
    const material = await updateMaterial(params.id, parsed.data);
    return material ? Response.json({ material }) : notFound("This item");
  } catch (error) {
    return Response.json(apiError(error, "material", "That didn't save. Try again in a moment."), { status: 503 });
  }
}
