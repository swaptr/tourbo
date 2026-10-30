import { Check, ClipboardCopy, Map, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { addItem, deleteItem, getProject, projectMarkdown, setItemDone } from "@tourbo/core/projects/projects.server.ts";
import { ItemKind, type ProjectItem } from "@tourbo/core/projects/types.ts";
import type { Route } from "./+types/projects.$id";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.project.title} — Tourbo` : "Tourbo" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const project = await getProject(params.id);
  if (!project) throw new Response("Not found", { status: 404 });
  return { project, markdown: projectMarkdown(project) };
}

export async function action({ params, request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    if (intent === "add") {
      const kind = ItemKind.catch("note").parse(form.get("kind"));
      const text = String(form.get("text") ?? "").trim();
      if (!text) return { error: "Write something first." };
      await addItem(params.id, { kind, text, city: String(form.get("city") ?? "") || undefined });
      return { ok: true };
    }
    const item = String(form.get("item") ?? "");
    if (intent === "toggle") await setItemDone(params.id, item, form.get("done") === "true");
    if (intent === "delete") await deleteItem(params.id, item);
    return { ok: true };
  } catch {
    return { error: "That didn't save. Is the database running? Try again." };
  }
}

const KIND_LABEL: Record<ItemKind, string> = { todo: "To-dos", setlist: "Setlist and material drafts", brief: "City notes", note: "Notes" };
const KIND_SINGULAR: Record<ItemKind, string> = { todo: "To-do", setlist: "Setlist / bit draft", brief: "City note", note: "Note" };

export default function ProjectView({ loaderData }: Route.ComponentProps) {
  const { project, markdown } = loaderData;
  const add = useFetcher<typeof action>();
  const [kind, setKind] = useState<ItemKind>("todo");
  const startHref = `/start?project=${project.id}${project.artist ? `&artist=${encodeURIComponent(project.artist)}` : ""}`;
  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/projects" className="hover:underline">
              Projects
            </Link>
          </p>
          <h1 className="font-heading text-2xl tracking-tight">{project.title}</h1>
          {project.artist && <p className="mt-1 text-sm text-muted-foreground">{project.artist}</p>}
        </div>
        <div className="flex gap-2">
          <CopyMarkdown text={markdown} />
          <Button size="sm" nativeButton={false} render={<Link to={startHref} />}>
            <Map /> Plan a tour for this
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Tour plans</CardTitle>
          <CardDescription>Plans started from this project, or added from a plan page.</CardDescription>
        </CardHeader>
        <CardContent>
          {!project.runs.length && <p className="text-sm text-muted-foreground">None yet. “Plan a tour for this” starts one and files it here.</p>}
          <ul className="divide-y text-sm">
            {project.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/plan/${r.id}`} className="font-medium hover:underline">
                  {r.cities.length ? r.cities.join(" → ") : r.artistName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {r.status} · {r.createdAt.slice(0, 10)} ·{" "}
                  <Link to={`/plan/${r.id}/prep`} className="underline">
                    show notes
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Add</CardTitle>
        </CardHeader>
        <CardContent>
          <add.Form
            method="post"
            className="grid gap-2"
            onSubmit={(e) => {
              const form = e.currentTarget;
              requestAnimationFrame(() => form.reset());
            }}
          >
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="kind" value={kind} />
            <div className="flex flex-wrap gap-1.5">
              {ItemKind.options.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn("rounded-full border px-3 py-1 text-sm", k === kind ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
                >
                  {KIND_SINGULAR[k]}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_3fr]">
              <Input name="city" placeholder="City (optional)" aria-label="City" />
              {kind === "todo" ? (
                <Input name="text" required placeholder="e.g. Send tech rider to Empty Bottle" aria-label="To-do" />
              ) : (
                <Textarea name="text" required rows={3} placeholder={kind === "setlist" ? "Song order, a local cover, bit premises…" : "Anything worth keeping"} aria-label={KIND_SINGULAR[kind]} />
              )}
            </div>
            <Button type="submit" size="sm" className="justify-self-start" disabled={add.state !== "idle"}>
              Add {KIND_SINGULAR[kind].toLowerCase()}
            </Button>
            {add.data && "error" in add.data && <p className="text-sm text-destructive">{add.data.error}</p>}
          </add.Form>
        </CardContent>
      </Card>

      {!project.items.length && <p className="text-sm text-muted-foreground">Nothing saved yet. Add a to-do above, or ask your own AI assistant to save show notes here.</p>}
      {ItemKind.options.map((k) => {
        const items = project.items.filter((i) => i.kind === k);
        if (!items.length) return null;
        return (
          <section key={k} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{KIND_LABEL[k]}</h2>
            <ul className="space-y-1.5">
              {items.map((i) => (
                <Item key={i.id} item={i} />
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

function Item({ item }: { item: ProjectItem }) {
  const f = useFetcher();
  const done = f.formData ? f.formData.get("done") === "true" : item.done;
  if (f.formData?.get("intent") === "delete") return null;
  return (
    <li className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      {item.kind === "todo" && (
        <f.Form method="post">
          <input type="hidden" name="intent" value="toggle" />
          <input type="hidden" name="item" value={item.id} />
          <input type="hidden" name="done" value={String(!done)} />
          <button type="submit" aria-label={done ? "Mark not done" : "Mark done"} className={cn("mt-0.5 flex size-4 items-center justify-center rounded border", done && "border-primary bg-primary text-primary-foreground")}>
            {done && <Check className="size-3" />}
          </button>
        </f.Form>
      )}
      <p className={cn("min-w-0 flex-1 whitespace-pre-wrap", done && "text-muted-foreground line-through")}>
        {item.city && <span className="font-medium">{item.city}: </span>}
        {item.text}
      </p>
      <f.Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="item" value={item.id} />
        <button type="submit" aria-label="Delete" className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" />
        </button>
      </f.Form>
    </li>
  );
}

function CopyMarkdown({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copied" : "Copy as markdown"}
    </Button>
  );
}
