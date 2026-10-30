import { LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ProjectItem } from "@tourbo/core/projects/types.ts";
import { ErrorLine, ShownError, shownMessage } from "~/components/state";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";

// Ticks are ink (tomato stays the screen's one primary action); 20px box, larger hit area.
const TICK = "mt-0.5 size-5 data-checked:border-foreground data-checked:bg-foreground data-checked:text-background";
import { Input } from "~/components/ui/input";
import { ownerKeyFor } from "~/lib/work";
import { cn } from "~/lib/utils";

// A tour's notes and to-dos (PLAN Q21, replaces project pages). Mount anywhere with the tour id:
// the workspace row menu opens it in a popover; the tour page can mount it in a Notes tab.
// Editing needs this browser to hold the tour's owner key; others read only.
export function TourNotes({ runId, compact }: { runId: string; compact?: boolean }) {
  const [items, setItems] = useState<ProjectItem[]>();
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");
  const [todo, setTodo] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = ownerKeyFor(runId);
  const headers = { "content-type": "application/json", ...(key ? { "X-Owner-Key": key } : {}) };
  const url = `/api/tours/${runId}/notes`;
  const call = async <T,>(init?: RequestInit, path = url): Promise<T> => {
    const res = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new ShownError(body.error ?? "That didn't work. Try again in a moment.");
    return body;
  };
  const load = useCallback(async () => {
    setError(undefined);
    try {
      setItems((await call<{ items: ProjectItem[] }>()).items);
    } catch (e) {
      setError(shownMessage(e, "Your notes didn't load. Try again in a moment."));
    }
  }, [runId]);
  useEffect(() => void load(), [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const { item } = await call<{ item: ProjectItem }>({ method: "POST", body: JSON.stringify({ text, kind: todo ? "todo" : "note" }) });
      setItems((all) => [...(all ?? []), item]);
      setText("");
    } catch (err) {
      setError(shownMessage(err, "That didn't save. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };
  const tick = async (i: ProjectItem) => {
    setItems((all) => all?.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)));
    await call({ method: "POST", body: JSON.stringify({ itemId: i.id, done: !i.done }) }).catch(() => load());
  };
  const remove = async (i: ProjectItem) => {
    setItems((all) => all?.filter((x) => x.id !== i.id));
    await call({ method: "DELETE" }, `${url}?item=${i.id}`).catch(() => load());
  };

  return (
    <div className="grid gap-2" data-testid="tour-notes">
      {error && <ErrorLine message={error} retry onRetry={() => void load()} />}
      {!items && !error ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading notes…
        </p>
      ) : items && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet. Jot down a contact, a to-do, an idea for a night.</p>
      ) : (
        <ul className={cn("grid gap-1 overflow-y-auto text-sm", compact && "max-h-60")}>
          {items?.map((i) => (
            <li key={i.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
              {i.kind === "todo" ? (
                <Checkbox className={TICK} checked={i.done} disabled={!key} onCheckedChange={() => void tick(i)} aria-label={`Done: ${i.text}`} />
              ) : (
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
              )}
              <span className={cn("min-w-0 flex-1 break-words whitespace-pre-wrap", i.done && "text-muted-foreground line-through")}>{i.text}</span>
              {key && (
                <button type="button" className="rounded p-0.5 text-muted-foreground opacity-60 outline-none hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100" aria-label={`Delete: ${i.text}`} onClick={() => void remove(i)}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {key && (
        <form className="flex items-center gap-2" onSubmit={add}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={todo ? "Add a to-do" : "Add a note"} aria-label={todo ? "New to-do" : "New note"} maxLength={2000} />
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <Checkbox className={TICK} checked={todo} onCheckedChange={(v) => setTodo(v === true)} /> To-do
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={busy || !text.trim()}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
