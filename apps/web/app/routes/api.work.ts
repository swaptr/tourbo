import { workStatus } from "../../server/owner.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.work";

// POST { items: [{ kind: "run" | "project", id }] } → current status of items this browser
// already knows. Never lists anything else (no enumeration).
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = (await request.json().catch(() => null)) as { items?: unknown } | null;
  const items = Array.isArray(body?.items)
    ? body.items.filter((i): i is { kind: "run" | "project"; id: string } => !!i && (i.kind === "run" || i.kind === "project") && typeof i.id === "string")
    : [];
  try {
    return Response.json(await workStatus(items), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(apiError(error, "work", "Your work can't be checked right now. Try again in a moment."), { status: 503 });
  }
}
