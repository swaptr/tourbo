import { resolveArtist, searchArtists, searchPeers } from "@tourbo/core/engine/resolve.ts";
import { PerformerKind } from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/api.resolve";
import { apiError } from "../../server/agent/errors";


// Onboarding "Is this you?": a strict name match, plus close names to pick from.
// `?peer=` is the "I sound like…" autocomplete: any kind of act (singer, comic, podcast, show).
export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const peer = params.get("peer")?.trim();
  if (peer !== undefined) {
    if (peer.length < 2) return { ok: true as const, act: undefined, suggestions: [], peers: [] };
    try {
      return { ok: true as const, act: undefined, suggestions: [], peers: await searchPeers(peer, 6) };
    } catch (e) {
      return { ok: false as const, act: undefined, suggestions: [], peers: [], ...apiError(e, "api.resolve peers") };
    }
  }
  const name = params.get("name")?.trim() ?? "";
  const kind = PerformerKind.catch("musician").parse(params.get("kind"));
  if (name.length < 2) return { ok: true as const, act: undefined, suggestions: [] };
  // Either half can fail on its own: close names still help when the exact match didn't load.
  const [exact, close] = await Promise.allSettled([resolveArtist(name, kind), searchArtists(name, 5, kind)]);
  const act = exact.status === "fulfilled" ? exact.value : undefined;
  const suggestions = close.status === "fulfilled" ? close.value.filter((s) => s.id !== act?.id).map((s) => s.name) : [];
  if (exact.status === "rejected" && !suggestions.length) {
    return { ok: false as const, act: undefined, suggestions: [], ...apiError(exact.reason, "api.resolve") };
  }
  return { ok: true as const, act: act && { id: act.id, name: act.name, image: act.image, genres: act.tags.map((t) => t.name).slice(0, 4) }, suggestions };
}
