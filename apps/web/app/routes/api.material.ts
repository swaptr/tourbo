import { MaterialFields, Source } from "@tourbo/core/material/material.ts";
import { createMaterial, keepIdea, listMaterial } from "@tourbo/core/material/material.server.ts";
import { checkOwner, forbidden, notFound, ownerKeyOf, UUID } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.material";

// The act's material (PLAN Q21). POST { profileId } lists it (the profile id is the capability;
// kept out of URLs). POST { profileId, material } adds one; POST { profileId, keep } keeps a
// Tourbo idea as a local idea (no duplicates). Writes need the profile's X-Owner-Key.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = (await request.json().catch(() => null)) as { profileId?: string; material?: unknown; keep?: unknown } | null;
  const profileId = String(body?.profileId ?? "");
  if (!UUID.test(profileId)) return notFound("This profile");
  try {
    if (!body?.material && !body?.keep) return Response.json({ items: await listMaterial(profileId) }, { headers: { "cache-control": "no-store" } });
    const check = await checkOwner("profile", profileId, ownerKeyOf(request), true);
    if (check === "missing") return notFound("This profile");
    if (check === "forbidden") return forbidden();
    const parsed = MaterialFields.safeParse(body.material ?? body.keep);
    if (!parsed.success) return invalid(parsed.error.issues[0]);
    if (body.keep) {
      const source = Source.safeParse(parsed.data.source);
      if (!source.success || parsed.data.origin !== "local_idea") return Response.json({ error: "That idea couldn't be kept. Try again." }, { status: 400 });
      const kept = await keepIdea(profileId, { ...parsed.data, source: source.data });
      return kept ? Response.json(kept) : notFound("This profile");
    }
    const material = await createMaterial(profileId, parsed.data);
    return material ? Response.json({ material }) : notFound("This profile");
  } catch (error) {
    return Response.json(apiError(error, "material", "That didn't save. Try again in a moment."), { status: 503 });
  }
}

export const invalid = (issue?: { message: string; path: PropertyKey[] }) =>
  Response.json({ error: issue?.message ?? "Check the fields and save again.", field: issue?.path[0] }, { status: 400 });
