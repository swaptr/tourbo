import { Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { exportWork, hrefOf, importWork, ownerHeaders, readWork, removeWork, serverKind, subscribeWork, updateStatuses, type WorkItem, type WorkKind } from "~/lib/work";
import { ErrorLine, ShownError, shownMessage } from "~/components/state";

const RESTART_FAILED = "The planner couldn't restart. Try again in a moment.";
const DELETE_FAILED = "That didn't delete. Try again in a moment.";

// "Continue where you left off" (PLAN Q16): this browser's own work, read from localStorage after
// hydration (a client-only island: `/` stays prerendered with no server data). Statuses refresh
// from /api/work for the ids listed here only.

const KIND_LABEL: Record<WorkKind, string> = { plan: "Tour plan", set: "Set", prep: "Show notes", ideas: "Ideas", project: "Project", event: "Event" };

type Chip = { label: string; variant: "default" | "secondary" | "destructive" | "outline" };
function chip(i: WorkItem): Chip | undefined {
  if (i.status === "gone") return { label: "deleted", variant: "outline" };
  if (i.kind !== "plan") return undefined;
  switch (i.status) {
    case "done":
      return { label: "ready", variant: "secondary" };
    case "failed":
      return { label: "stopped", variant: "destructive" };
    case "interrupted":
      return { label: "interrupted", variant: "destructive" };
    case "pending":
    case "running":
      return { label: "planning", variant: "outline" };
    default:
      return undefined;
  }
}

const resumable = (i: WorkItem) => i.kind === "plan" && (i.status === "failed" || i.status === "interrupted") && !!i.ownerKey;

type Props = {
  kinds?: WorkKind[]; // default: everything
  title?: string;
  showWhenEmpty?: boolean; // the home page hides an empty list; /projects shows a hint + import
  emptyText?: string;
  className?: string;
};

export function YourWork({ kinds, title = "Continue where you left off", showWhenEmpty = false, emptyText = "Nothing here yet.", className }: Props) {
  const [items, setItems] = useState<WorkItem[] | undefined>(undefined); // undefined while reading
  const [readError, setReadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [all, setAll] = useState(false);

  const read = () => {
    try {
      const list = readWork();
      setItems(kinds ? list.filter((i) => kinds.includes(i.kind)) : list);
      setReadError(false);
      return list;
    } catch {
      setReadError(true);
      setItems([]);
      return [];
    }
  };

  const refresh = async (list: WorkItem[]) => {
    const asked = list.flatMap((i) => {
      const kind = serverKind(i);
      return kind ? [{ kind, id: i.id }] : [];
    });
    if (!asked.length) return;
    setRefreshing(true);
    setRefreshError(false);
    try {
      const res = await fetch("/api/work", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: asked }) });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { runs: { id: string; status: string }[]; projects: string[] };
      const runs = new Map(body.runs.map((r) => [r.id, r.status]));
      const projects = new Set(body.projects);
      updateStatuses((i) => {
        const kind = serverKind(i);
        if (kind === "project") return projects.has(i.id) ? "saved" : "gone";
        if (kind === "run") return runs.get(i.id) ?? "gone";
        return undefined;
      });
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh(read());
    return subscribeWork(read);
  }, []);

  if (items === undefined) return <Frame title={title} className={className}><ListSkeleton /></Frame>;
  if (readError)
    return (
      <Frame title={title} className={className}>
        <ErrorLine message="Your saved work can't be read in this browser." retry onRetry={() => void refresh(read())} />
      </Frame>
    );
  // A notice ("Deleted …") stays up after the last item goes, until dismissed or navigation.
  if (!items.length && !showWhenEmpty && !notice) return null;

  const shown = all ? items : items.slice(0, 5);
  return (
    <Frame title={title} className={className} actions={<Transfer hasItems={items.length > 0} onDone={setNotice} />}>
      {!items.length && showWhenEmpty && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      {refreshError && (
        <ErrorLine message="Couldn't check for updates." retry onRetry={() => void refresh(readWork())} />
      )}
      {notice && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="work-notice">
          {notice}
          <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => setNotice(undefined)}>
            Dismiss
          </button>
        </p>
      )}
      {items.length > 0 && (
        <ul className="divide-y rounded-xl border" data-testid="your-work">
          {shown.map((i) => (
            <Row key={`${i.kind}:${i.id}`} item={i} refreshing={refreshing} onNotice={setNotice} />
          ))}
        </ul>
      )}
      {items.length > 5 && (
        <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </Frame>
  );
}

function Frame({ title, actions, className, children }: { title: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("space-y-3", className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y rounded-xl border" aria-busy="true" aria-label="Loading your work">
      {[0, 1].map((n) => (
        <li key={n} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-7 w-16" />
        </li>
      ))}
    </ul>
  );
}

function Row({ item, refreshing, onNotice }: { item: WorkItem; refreshing: boolean; onNotice: (s?: string) => void }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"resume" | "delete">();
  const [error, setError] = useState<string>();
  const c = chip(item);
  const kind = serverKind(item);
  // Plans and projects made here are deleted on the server; sub-pages (set, notes) only leave the list.
  const deletes = !!item.ownerKey && (item.kind === "plan" || item.kind === "project") && item.status !== "gone";

  const resume = async () => {
    setBusy("resume");
    setError(undefined);
    try {
      const res = await fetch(`/api/runs/${item.id}/resume`, { method: "POST", headers: ownerHeaders(item.id) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new ShownError(body.error ?? RESTART_FAILED);
      updateStatuses((i) => (i.kind === "plan" && i.id === item.id ? "running" : undefined));
      navigate(hrefOf(item));
    } catch (e) {
      setError(shownMessage(e, RESTART_FAILED));
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(undefined);
    try {
      if (deletes && kind) {
        const res = await fetch(`/api/${kind === "run" ? "runs" : "projects"}/${item.id}`, { method: "DELETE", headers: ownerHeaders(item.id) });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok && res.status !== 404) throw new ShownError(body.error ?? DELETE_FAILED);
      }
      removeWork(item);
      onNotice(deletes ? `Deleted “${item.title}”.` : `Removed “${item.title}” from this list.`);
    } catch (e) {
      setError(shownMessage(e, DELETE_FAILED));
      setConfirming(false);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <Link to={hrefOf(item)} className="block truncate font-medium hover:underline">
          {item.title}
        </Link>
        <span className="text-xs text-muted-foreground">
          {KIND_LABEL[item.kind]} · {item.updatedAt.slice(0, 10)}
        </span>
      </div>
      {refreshing && kind ? <Skeleton className="h-5 w-16 rounded-full" /> : c && <Badge variant={c.variant}>{c.label}</Badge>}
      {confirming ? (
        <span className="flex items-center gap-1.5">
          <span className="text-xs">{deletes ? "Delete for good?" : "Remove from list?"}</span>
          <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void remove()}>
            {deletes ? "Delete" : "Remove"}
          </Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          {item.status !== "gone" &&
            (resumable(item) ? (
              <Button size="sm" disabled={!!busy} onClick={() => void resume()}>
                <RotateCcw /> {busy === "resume" ? "Resuming…" : "Resume"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" nativeButton={false} render={<Link to={hrefOf(item)} />}>
                Open
              </Button>
            ))}
          <Button size="icon-sm" variant="ghost" aria-label={`Delete ${item.title}`} onClick={() => setConfirming(true)}>
            <Trash2 />
          </Button>
        </span>
      )}
      {error && <div className="basis-full text-xs"><ErrorLine message={error} /></div>}
    </li>
  );
}

function Transfer({ hasItems, onDone }: { hasItems: boolean; onDone: (s?: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1">
      {hasItems && (
        <Button size="sm" variant="ghost" onClick={() => exportWork()}>
          <Download /> Export my work
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
        <Upload /> Import
      </Button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Import work file"
        onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!f) return;
          try {
            const n = importWork(await f.text());
            onDone(n ? `Imported ${n} item${n === 1 ? "" : "s"}.` : "That file had nothing to import.");
          } catch (error) {
            onDone((error as Error).message);
          }
        }}
      />
    </div>
  );
}

// Can this browser edit the plan? Owned plans need the key from this browser's work list; plans
// without an owner key (made via MCP or before keys) are read-only. False until hydrated.
export function useCanEdit(id: string, owned: boolean) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    const check = () => setHas(!!ownerHeaders(id)["X-Owner-Key"]);
    check();
    return subscribeWork(check);
  }, [id]);
  return owned && has;
}

export function ReadOnlyNote({ what }: { what: string }) {
  return (
    <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
      You're viewing a shared {what}: read-only. To change it, open it in the browser that made it, or import your work there.
    </p>
  );
}
