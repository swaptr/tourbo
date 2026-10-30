import { resolveArtist, searchArtists } from "@tourbo/core/engine/resolve.ts";
import { PerformerKind } from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/api.resolve";

// Onboarding "Is this you?": a strict name match, plus close names to pick from.
export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim() ?? "";
  const kind = PerformerKind.catch("musician").parse(params.get("kind"));
  if (name.length < 2) return { ok: true as const, act: undefined, suggestions: [] };
  try {
    const [act, suggestions] = await Promise.all([resolveArtist(name, kind), searchArtists(name, 5, kind)]);
    return {
      ok: true as const,
      act: act && { id: act.id, name: act.name, image: act.image, genres: act.tags.map((t) => t.name).slice(0, 4) },
      suggestions: suggestions.filter((s) => s.id !== act?.id).map((s) => s.name),
    };
  } catch {
    return { ok: false as const, act: undefined, suggestions: [], error: "We couldn't look you up just now. Try again in a moment." };
  }
}
