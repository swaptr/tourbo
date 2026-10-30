import { ProfileFields } from "@tourbo/core/profiles/profile.ts";
import { getProfile, updateProfile } from "@tourbo/core/profiles/profiles.server.ts";
import { checkOwner, deleteOwned, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.profile.$id";

// GET: the profile (by its capability id). POST (X-Owner-Key): update. DELETE (X-Owner-Key): forget it.
export async function loader({ params }: Route.LoaderArgs) {
  const profile = await getProfile(params.id).catch(() => undefined);
  return profile ? Response.json({ profile }, { headers: { "cache-control": "no-store" } }) : notFound("This profile");
}

export async function action({ params, request }: Route.ActionArgs) {
  try {
    const check = await checkOwner("profile", params.id, ownerKeyOf(request), true);
    if (check === "missing") return notFound("This profile");
    if (check === "forbidden") return forbidden();
    if (request.method === "DELETE") {
      await deleteOwned("profile", params.id);
      return Response.json({ ok: true });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const parsed = ProfileFields.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Something in your profile isn't right. Check it and save again." }, { status: 400 });
    const profile = await updateProfile(params.id, parsed.data);
    return profile ? Response.json({ profile }) : notFound("This profile");
  } catch (error) {
    return Response.json(apiError(error, "profile", "Your profile didn't save. Try again in a moment."), { status: 503 });
  }
}
