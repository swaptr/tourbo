import { styleTags } from "@tourbo/core/engine/resolve.ts";
import { discipline } from "@tourbo/core/disciplines/index.ts";
import { PerformerKind } from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/api.tags";
import { apiError } from "../../server/agent/errors";

// "My style is…" chips: fan-data genre/scene tags for the chosen discipline. With no query,
// the discipline's own example scenes are offered as a start.
export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const kind = PerformerKind.catch("musician").parse(params.get("kind"));
  const q = params.get("q")?.trim() ?? "";
  try {
    if (q.length >= 2) return { ok: true as const, tags: await styleTags(q, kind, 8) };
    const seeds = discipline(kind).scene.split(",").map((s) => s.trim()).filter(Boolean);
    const lists = await Promise.all(seeds.map((s) => styleTags(s, kind, 4)));
    const seen = new Set<string>();
    return { ok: true as const, tags: lists.flat().filter((t) => !seen.has(t.id) && !!seen.add(t.id)).slice(0, 8) };
  } catch (e) {
    return { ok: false as const, tags: [], ...apiError(e, "api.tags") };
  }
}
