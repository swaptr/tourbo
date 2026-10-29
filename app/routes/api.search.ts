import { searchArtists } from "../../server/core/engine/resolve";
import type { Route } from "./+types/api.search";

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return { results: [] };
  return { results: await searchArtists(q).catch(() => []) };
}
