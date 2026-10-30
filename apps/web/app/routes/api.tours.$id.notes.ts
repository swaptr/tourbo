import { addItem, createProject, deleteItem, getProject, projectOfRun, setItemDone, attachRun } from "@tourbo/core/projects/projects.server.ts";
import { getRun } from "../../server/agent/runs.server";
import { apiError } from "../../server/agent/errors";
import { checkOwner, forbidden, notFound, ownerHash, ownerKeyOf, UUID } from "../../server/owner.server";
import type { Route } from "./+types/api.tours.$id.notes";

// A tour's notes and to-dos (PLAN Q21: projects folded into tours). Stored as the tour's notebook
// (the project attached to the run), made on the first note. Anyone with the link reads; writes
// need the tour's owner key. GET → { items }; POST { text, kind } adds; POST { itemId, done }
// ticks; DELETE ?item=… removes.

const NOTE_KINDS = new Set(["note", "todo"]);

export async function loader({ params }: Route.LoaderArgs) {
  if (!UUID.test(params.id)) return notFound("This tour");
  try {
    const project = await projectOfRun(params.id);
    const items = project ? ((await getProject(project.id))?.items ?? []).filter((i) => NOTE_KINDS.has(i.kind)) : [];
    return Response.json({ items }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(apiError(error, "tour notes", "Your notes didn't load. Try again in a moment."), { status: 503 });
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;
  if (!UUID.test(id)) return notFound("This tour");
  const check = await checkOwner("run", id, ownerKeyOf(request), true).catch(() => "forbidden" as const);
  if (check === "missing") return notFound("This tour");
  if (check === "forbidden") return forbidden();
  try {
    let project = await projectOfRun(id);
    if (request.method === "DELETE") {
      const item = new URL(request.url).searchParams.get("item") ?? "";
      if (project) await deleteItem(project.id, item);
      return Response.json({ ok: true });
    }
    const body = (await request.json().catch(() => null)) as { text?: string; kind?: string; itemId?: string; done?: boolean } | null;
    if (body?.itemId) {
      if (project) await setItemDone(project.id, body.itemId, !!body.done);
      return Response.json({ ok: true });
    }
    const text = String(body?.text ?? "").trim().slice(0, 2000);
    if (!text) return Response.json({ error: "Write something first.", field: "text" }, { status: 400 });
    if (!project) {
      const run = await getRun(id);
      if (!run) return notFound("This tour");
      project = await createProject({ title: `${run.plan?.artist.name ?? run.params.artist} tour`, artist: run.params.artist, kind: run.params.kind, ownerHash: (await ownerHash("run", id)) ?? undefined });
      await attachRun(project.id, id);
    }
    const item = await addItem(project.id, { kind: body?.kind === "todo" ? "todo" : "note", text });
    return Response.json({ item });
  } catch (error) {
    return Response.json(apiError(error, "tour notes", "That didn't save. Try again in a moment."), { status: 503 });
  }
}
