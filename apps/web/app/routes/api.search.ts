import { searchArtists } from "@tourbo/core/engine/resolve.ts";
import { PerformerKind } from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/api.search";

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const kind = PerformerKind.catch("musician").parse(params.get("kind"));
  if (q.length < 2) return { results: [] };
  return { results: await searchArtists(q, 6, kind).catch(() => []) };
}
