import { ChevronDown, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRevalidator, useRouteLoaderData } from "react-router";

import { limitKindOf } from "@tourbo/core/shared/errors.ts";
import type { TraceEvent } from "@tourbo/core/shared/types.ts";
import { AgentProgress } from "~/components/agent-progress";
import { firstLine as clip } from "~/components/city-card";
import { ErrorLine, useLimits } from "~/components/state";
import { Trace, traceSummary } from "~/components/trace";
import { Button } from "~/components/ui/button";
import { useCanEdit } from "~/components/your-work";
import { neutral } from "~/lib/neutral";
import { keepOnViewChange } from "~/lib/plan-nav";
import { cn } from "~/lib/utils";
import { ownerHeaders } from "~/lib/work";
import { getRun } from "../../server/agent/runs.server";
import { traceHistory } from "../../server/agent/trace.server";
import type { loader as layoutLoader } from "./plan.$id";
import type { Route } from "./+types/plan.$id._index";

const UUID = /^[0-9a-f-]{36}$/i;

// The Plan tab's own pane (the map, nights and night panel are the layout's workspace): planning
// progress while it runs, the failure line with Retry, and "How Tourbo decided" under the map.
export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  return { events: await traceHistory(run.id) };
}

export const shouldRevalidate = keepOnViewChange;

export default function PlanPane({ loaderData }: Route.ComponentProps) {
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/plan.$id");
  if (!layout) return null;
  const { run } = layout;
  return <PlanBody key={run.id} run={run} owned={layout.owned} data={loaderData} />;
}

type LayoutRun = NonNullable<ReturnType<typeof useRouteLoaderData<typeof layoutLoader>>>["run"];

function PlanBody({ run, owned, data }: { run: LayoutRun; owned: boolean; data: Route.ComponentProps["loaderData"] }) {
  const live = run.status === "pending" || run.status === "running";
  const failed = run.status === "interrupted" || run.status === "failed";
  const events = useTraceStream(run.id, data.events, live);
  const plan = run.plan;
  const canEdit = useCanEdit(run.id, owned);
  const [traceOpen, setTraceOpen] = useState(false);
  const retry = useRetry(run.id);
  const failure = [...events].reverse().find((e) => e.data?.error === true);
  // A provider limit still in force shows once, in the page notice, and retrying wouldn't help.
  // An old limit failure (limit since reset) reads inline and can be retried.
  const failureText = failure?.message.replace(/^Run failed: /, "");
  const limits = useLimits();
  const limitKind = run.status === "interrupted" ? undefined : limitKindOf(failureText);
  const limited = limitKind === "data_limit" ? limits.data : limitKind === "ai_limit" ? limits.ai : false;
  const canRetry = run.status === "interrupted" || (!limited && (failure?.data?.retry !== false || !!limitKind));


  return (
    <div className={cn("space-y-6", plan && "space-y-2 pt-1")}>
      {live && (
        <section className="mx-auto max-w-xl space-y-3">
          <h2 className="font-heading text-lg">Tourbo is planning your tour</h2>
          <AgentProgress events={events} jobs={run.params.jobs ?? []} status={run.status} />
          <p className="text-sm text-muted-foreground">Usually 1–3 minutes. You can close this tab; the plan stays at this address.</p>
        </section>
      )}

      {failed && (
        <section className="mx-auto max-w-xl space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 text-destructive" />
            {run.status === "interrupted" ? "The planner was interrupted." : "The planner couldn't finish."}
          </p>
          {!limited && (
            <p className="text-sm">
              {run.status === "interrupted"
                ? "The server restarted mid-run. Retry with the same settings."
                : clip(neutral(failureText) ?? "Something went wrong while planning.")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canEdit && canRetry && (
              <Button type="button" size="sm" data-primary disabled={retry.busy} onClick={retry.run}>
                {retry.busy && <LoaderCircle className="animate-spin" />} Retry
              </Button>
            )}
            <Button size="sm" variant={canEdit ? "outline" : "default"} data-primary={!canEdit || undefined} nativeButton={false} render={<Link to="/start" />}>
              Change settings
            </Button>
          </div>
          <ErrorLine message={retry.error} />
        </section>
      )}

      {events.length > 0 && !live && (
        <details className="group/trace rounded-xl ring-1 ring-foreground/10" onToggle={(e) => setTraceOpen(e.currentTarget.open)}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 -rotate-90 text-muted-foreground transition-transform duration-150 group-open/trace:rotate-0" aria-hidden />
            How Tourbo decided
            <span className="hidden min-w-0 flex-1 truncate font-normal text-muted-foreground md:block">· {traceSummary(events)}</span>
          </summary>
          {traceOpen && <Trace events={events} live={false} className="border-t" />}
        </details>
      )}
    </div>
  );
}

// Pick a failed or interrupted plan up where it stopped (same link), with this browser's owner key.
function useRetry(runId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const revalidator = useRevalidator();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/runs/${runId}/resume`, { method: "POST", headers: ownerHeaders(runId) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? "The planner couldn't restart. Try again in a moment.");
      else await revalidator.revalidate();
    } catch {
      setError("The planner couldn't restart. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

// Appends live SSE events to the server-rendered history; reloads the run when it ends.
function useTraceStream(runId: string, initial: TraceEvent[], live: boolean) {
  const [events, setEvents] = useState(initial);
  const revalidator = useRevalidator();

  useEffect(() => setEvents(initial), [initial]);

  useEffect(() => {
    if (!live) return;
    const after = initial.at(-1)?.seq ?? 0;
    const source = new EventSource(`/api/runs/${runId}/events?after=${after}`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as TraceEvent;
      setEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
    };
    const finish = () => {
      source.close();
      void revalidator.revalidate();
    };
    source.addEventListener("end", finish);
    source.addEventListener("interrupted", finish);
    return () => source.close();
    // Reconnect only when the run or its liveness changes, not on every new event.
  }, [runId, live]);

  return events;
}
