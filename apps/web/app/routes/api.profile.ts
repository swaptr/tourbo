import { ProfileFields } from "@tourbo/core/profiles/profile.ts";
import { createProfile } from "@tourbo/core/profiles/profiles.server.ts";
import { newOwnerKey } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.profile";

// POST /api/profile: save a new act profile (PLAN Q21). The owner key goes back to this browser
// only; the server keeps its hash.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsed = ProfileFields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Something in your profile isn't right. Check it and save again." }, { status: 400 });
  try {
    const owner = newOwnerKey();
    const profile = await createProfile(parsed.data, owner.hash);
    return Response.json({ profile, ownerKey: owner.key });
  } catch (error) {
    return Response.json(apiError(error, "profile", "Your profile didn't save. Try again in a moment."), { status: 503 });
  }
}
