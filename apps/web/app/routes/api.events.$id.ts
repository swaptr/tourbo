import { EventFields } from "@tourbo/core/events/event.ts";
import { getEvent, linkEventRun, updateEvent } from "@tourbo/core/events/events.server.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import { citiesNear } from "@tourbo/core/engine/cities.ts";
import { TourParams } from "@tourbo/core/shared/types.ts";
import { startRun } from "../../server/agent/orchestrator.server";
import { checkOwner, deleteOwned, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import { runLimit } from "../../server/limits.server";
import type { Route } from "./+types/api.events.$id";

// One event (PLAN Q21). GET: the event. POST (X-Owner-Key): { event } saves the fields;
// { intent: "help" } starts a one-night helper plan around the event's city, whose rooms Tourbo
// then suggests (fit + money). DELETE (X-Owner-Key): deletes the event; material stays.
export async function loader({ params }: Route.LoaderArgs) {
  const event = await getEvent(params.id).catch(() => undefined);
  return event ? Response.json({ event }, { headers: { "cache-control": "no-store" } }) : notFound("This event");
}

export async function action({ params, request }: Route.ActionArgs) {
  try {
    const check = await checkOwner("event", params.id, ownerKeyOf(request), true);
    if (check === "missing") return notFound("This event");
    if (check === "forbidden") return forbidden();
    if (request.method === "DELETE") {
      await deleteOwned("event", params.id);
      return Response.json({ ok: true });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = (await request.json().catch(() => null)) as { intent?: string; event?: unknown; basis?: string; peers?: string; styles?: string } | null;
    const current = await getEvent(params.id);
    if (!current) return notFound("This event");
    if (body?.intent === "help") {
      const limited = !current.runId && runLimit(request);
      if (limited) return Response.json({ error: limited }, { status: 429 });
      return Response.json(await helpPick(current, body));
    }
    const parsed = EventFields.safeParse(body?.event);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the event and save again." }, { status: 400 });
    const event = await updateEvent(params.id, parsed.data);
    return event ? Response.json({ event }) : notFound("This event");
  } catch (error) {
    return Response.json(apiError(error, "event", "That didn't save. Try again in a moment."), { status: 503 });
  }
}

// One night around the event's city: the planner checks rooms there and prices each one.
// Unlisted acts send their way in (basis + peers / styles) from the profile.
async function helpPick(event: NonNullable<Awaited<ReturnType<typeof getEvent>>>, how: { basis?: string; peers?: string; styles?: string }) {
  if (event.runId) return { runId: event.runId };
  await ensureWorld();
  const area = { lat: event.city.lat, lon: event.city.lon, radiusKm: 80 };
  const near = citiesNear(area, 0);
  const params = TourParams.safeParse({
    artist: event.artist,
    kind: event.kind,
    basis: how.basis || undefined,
    notInQloo: !!how.basis && how.basis !== "act",
    peers: how.peers ?? "",
    styles: how.styles || undefined,
    region: near.region,
    homeBase: event.city.name,
    area,
    shows: 1,
    mode: "event",
    startDate: event.startDate ?? new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
    roomMin: 50,
    roomMax: 800,
    jobs: [],
  });
  if (!params.success) return { error: "Tourbo can't look for rooms for this event yet. Check its city and date." };
  // Same owner as the event: the event row's hash is reused for the helper plan.
  const { db } = await import("@tourbo/core/db/client.server.ts");
  const sql = await db();
  const [row] = await sql<{ owner_hash: string }[]>`select owner_hash from events where id = ${event.id}`;
  const runId = await startRun(params.data, { ownerHash: row?.owner_hash });
  await linkEventRun(event.id, runId);
  return { runId };
}
