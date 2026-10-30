import { minutesLabel, setMinutes } from "@tourbo/core/material/material.ts";
import { getEventSet, saveEventSet } from "@tourbo/core/material/material.server.ts";
import { checkOwner, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.events.$id.set";

// An event's set (PLAN Q21): an ordered list of material. GET → { set, minutes, length }.
// PUT { ids } (X-Owner-Key of the event; a tour night's is its tour's) replaces the order.
const reply = (set: Awaited<ReturnType<typeof getEventSet>>) => ({ set, minutes: setMinutes(set), length: minutesLabel(setMinutes(set)) });

export async function loader({ params }: Route.LoaderArgs) {
  try {
    const check = await checkOwner("event", params.id, null);
    if (check === "missing") return notFound("This event");
    return Response.json(reply(await getEventSet(params.id)), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(apiError(error, "event set", "The set didn't load. Try again in a moment."), { status: 503 });
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });
  try {
    const check = await checkOwner("event", params.id, ownerKeyOf(request), true);
    if (check === "missing") return notFound("This event");
    if (check === "forbidden") return forbidden();
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    if (!Array.isArray(body?.ids) || !body.ids.every((i) => typeof i === "string")) return Response.json({ error: "The set didn't save. Try again." }, { status: 400 });
    return Response.json(reply(await saveEventSet(params.id, body.ids as string[])));
  } catch (error) {
    return Response.json(apiError(error, "event set", "The set didn't save. Try again in a moment."), { status: 503 });
  }
}
