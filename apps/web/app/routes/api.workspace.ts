import { checkOwner, forbidden, notFound, ownerKeyOf } from "../../server/owner.server";
import { setArchived, workspaceRows } from "../../server/workspace.server";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/api.workspace";

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// POST { runs, projects, events, profile? } (+ X-Owner-Key = the profile's key): rows for the
// workspace list, only for ids this browser already knows or runs filed under its profile.
// POST { op: "archive" | "restore" | "auto", kind, id } (+ X-Owner-Key = that item's key).
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "That request wasn't readable. Reload and try again." }, { status: 400 });
  try {
    if (typeof body.op === "string") {
      const kind = body.kind === "project" ? "project" : body.kind === "event" ? "event" : "run";
      const id = String(body.id ?? "");
      const check = await checkOwner(kind, id, ownerKeyOf(request), true);
      if (check === "missing") return notFound();
      if (check === "forbidden") return forbidden();
      await setArchived(kind, id, body.op === "archive" ? true : body.op === "restore" ? false : null);
      return Response.json({ ok: true });
    }
    const profile = typeof body.profile === "string" ? { id: body.profile, key: ownerKeyOf(request) } : undefined;
    const rows = await workspaceRows({ runs: ids(body.runs), projects: ids(body.projects), events: ids(body.events), profile });
    return Response.json({ rows }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(apiError(error, "workspace", "Your work can't be loaded right now. Try again in a moment."), { status: 503 });
  }
}
