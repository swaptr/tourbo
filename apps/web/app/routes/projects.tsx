import { FolderOpen, Plus } from "lucide-react";
import { Form, Link, redirect, useNavigation } from "react-router";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createProject, listProjects } from "@tourbo/core/projects/projects.server.ts";
import type { Route } from "./+types/projects";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Projects — Tourbo" }];
}

export async function loader() {
  try {
    return { projects: await listProjects(), error: undefined };
  } catch {
    return { projects: [], error: "Projects need the database, and it isn't answering. Start it (npm run dev) and reload." };
  }
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Give the project a name, like “Spring tour 2027”." };
  try {
    const p = await createProject({ title, artist: String(form.get("artist") ?? "") || undefined });
    return redirect(`/projects/${p.id}`);
  } catch {
    return { error: "We couldn't save that. Is the database running? Try again in a moment." };
  }
}

export default function Projects({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Projects</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          One per tour or show. Keep the plans, to-dos, setlist or bit drafts and city notes together, so they're there next time.
          Your own AI assistant can read and add to them too.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-3 sm:grid-cols-[2fr_2fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="title">Name</Label>
              <Input id="title" name="title" required placeholder="e.g. Spring tour 2027" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="artist">Act (optional)</Label>
              <Input id="artist" name="artist" placeholder="Your act's name" />
            </div>
            <Button type="submit" disabled={busy}>
              <Plus /> Create
            </Button>
          </Form>
          {actionData?.error && <p className="mt-2 text-sm text-destructive">{actionData.error}</p>}
        </CardContent>
      </Card>

      {loaderData.error && <p className="text-sm text-destructive">{loaderData.error}</p>}
      {!loaderData.error && !loaderData.projects.length && (
        <p className="text-sm text-muted-foreground">No projects yet. Create one above, or plan a tour first and add it to a project from the plan page.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {loaderData.projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="block">
            <Card size="sm" className="transition hover:ring-primary/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="size-4 text-primary" /> {p.title}
                </CardTitle>
                <CardDescription>
                  {p.artist && `${p.artist} · `}
                  {p.runs} plan{p.runs === 1 ? "" : "s"} · {p.items} item{p.items === 1 ? "" : "s"} · {p.createdAt.slice(0, 10)}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
