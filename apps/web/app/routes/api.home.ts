import { devActDensity, devExamples, devTowns, devWorld } from "../../server/home.server";
import type { Route } from "./+types/api.home";

// Dev only: the landing export's shapes served live from Postgres, for the globe review page and
// for local work before `npm run examples:export` has run. 404 in production: the landing page
// reads only the static files in /landing.
//   ?part=examples · ?part=world · ?part=towns · ?part=act&fanKey=
export async function loader({ request }: Route.LoaderArgs) {
  if (import.meta.env.PROD) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const json = (body: unknown) => Response.json(body ?? null, { status: body ? 200 : 404, headers: { "cache-control": "no-store" } });
  try {
    switch (params.get("part")) {
      case "examples":
        return json(await devExamples());
      case "world":
        return json(await devWorld());
      case "towns":
        return json(await devTowns());
      case "act":
        return json(await devActDensity(params.get("fanKey") ?? ""));
      default:
        return new Response("Unknown part.", { status: 400 });
    }
  } catch {
    return new Response("Data unavailable.", { status: 503 });
  }
}
