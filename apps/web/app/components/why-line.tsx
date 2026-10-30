import { useEffect, useState } from "react";

import { finish, fmt, itemHash, type Explained, type ExplainItem } from "@tourbo/core/engine/explain.ts";
import { Hint } from "~/components/hint";
import { RichLine } from "~/components/rich-line";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { ErrorLine } from "~/components/state";

// "Why this one?" in one or two plain sentences, written from the facts and checked against them.
// Every <WhyLine> on a page joins one POST /api/explain per tick, so a plan with 8 nights costs one
// AI call (and none on a revisit: results are saved per run). Items are server ids ("night:2",
// "deal:0") or client-built ExplainItems (@tourbo/core/engine/explain-facts.ts).
export type WhyRef = string | ExplainItem;

type Pending = { ref: WhyRef; resolve: (e: Explained) => void; reject: (e: Error) => void };
const memo = new Map<string, Explained>();
const queues = new Map<string, Pending[]>();
const keyOf = (runId: string | undefined, r: WhyRef) => `${runId ?? "-"}:${typeof r === "string" ? r : `${r.id}:${itemHash(r)}`}`;

function flush(runId: string | undefined) {
  const q = queues.get(runId ?? "-") ?? [];
  queues.delete(runId ?? "-");
  if (!q.length) return;
  const ids = q.flatMap((p) => (typeof p.ref === "string" ? [p.ref] : []));
  const items = q.flatMap((p) => (typeof p.ref === "string" ? [] : [p.ref]));
  fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, ids, items }) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
    .then(({ results }: { results: Explained[] }) => {
      const byId = new Map(results.map((e) => [e.id, e]));
      for (const p of q) {
        const id = typeof p.ref === "string" ? p.ref : p.ref.id;
        const e = byId.get(id) ?? (typeof p.ref === "string" ? undefined : finish(p.ref));
        if (e) (memo.set(keyOf(runId, p.ref), e), p.resolve(e));
        else p.reject(new Error("missing"));
      }
    })
    .catch(() => {
      // Client items fall back to the template here; server ids get a retry line.
      for (const p of q) typeof p.ref === "string" ? p.reject(new Error("failed")) : p.resolve(finish(p.ref));
    });
}

export function requestWhy(runId: string | undefined, ref: WhyRef): Promise<Explained> {
  const hit = memo.get(keyOf(runId, ref));
  if (hit) return Promise.resolve(hit);
  if (typeof ref !== "string" && ref.evidence !== "strong") return Promise.resolve(finish(ref)); // no call for some / none
  return new Promise((resolve, reject) => {
    const k = runId ?? "-";
    const q = queues.get(k) ?? [];
    if (!q.length) setTimeout(() => flush(runId), 40);
    q.push({ ref, resolve, reject });
    queues.set(k, q);
  });
}

export function useWhy(runId: string | undefined, ref: WhyRef | undefined) {
  const [state, setState] = useState<{ e?: Explained; failed?: boolean }>(() => (ref ? { e: memo.get(keyOf(runId, ref)) } : {}));
  const [attempt, setAttempt] = useState(0);
  const k = ref ? keyOf(runId, ref) : "";
  useEffect(() => {
    if (!ref) return;
    let live = true;
    requestWhy(runId, ref).then(
      (e) => live && setState({ e }),
      () => live && setState({ failed: true }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, attempt]);
  return { ...state, retry: () => (setState({}), setAttempt((a) => a + 1)) };
}

// The numbers behind a line, for the "why?" popover. Fan data first; money labelled as estimates.
export function FactList({ item }: { item: ExplainItem }) {
  const nums = item.facts.filter((f) => typeof f.value === "number" || f.say);
  return (
    <div className="grid gap-2">
      <ul className="grid gap-1">
        {nums.map((f) => (
          <li key={f.key} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{f.label}</span>
            <span className="num text-right text-foreground">{fmt(f, item.currency)}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">Fan data{item.facts.some((f) => f.unit === "money") ? " · money figures are estimates" : ""}</p>
    </div>
  );
}

export function WhyLine({ runId, items, className }: { runId?: string; items: WhyRef[]; className?: string }) {
  return (
    <div className={cn("grid gap-1", className)}>
      {items.map((r) => (
        <One key={typeof r === "string" ? r : r.id} runId={runId} item={r} />
      ))}
    </div>
  );
}

function One({ runId, item }: { runId?: string; item: WhyRef }) {
  const { e, failed, retry } = useWhy(runId, item);
  const full = typeof item === "string" ? undefined : item;
  if (failed)
    return (
      <ErrorLine message="We couldn't load the reason." retry onRetry={retry} />
    );
  if (!e) return <Skeleton className="h-3.5 w-4/5" role="status" aria-label="Loading the reason" />;
  if (!e.parts?.length) return null; // evidence too thin: say nothing rather than guess
  return (
    <p className="text-sm leading-snug text-muted-foreground" data-why={e.source}>
      <RichLine parts={e.parts} />
      {full && full.facts.some((f) => typeof f.value === "number") && (
        <>
          {" "}
          <Hint text="why?" label={`The numbers behind ${full.subject}`}>
            <FactList item={full} />
          </Hint>
        </>
      )}
    </p>
  );
}
