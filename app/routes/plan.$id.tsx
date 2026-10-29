import { LoaderCircle, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Form, redirect, useNavigation, useRevalidator } from "react-router";

import { CityCard } from "~/components/city-card";
import { TourMap } from "~/components/tour-map";
import { Trace, formatNumber } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { startRun } from "../../server/core/agent/orchestrator.server";
import { getRun, type RunStatus } from "../../server/core/agent/runs.server";
import { traceHistory } from "../../server/core/agent/trace.server";
import type { TraceEvent } from "../../server/core/shared/types";
import type { Route } from "./+types/plan.$id";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.run.artistName} tour — Tourbo` : "Tourbo" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  return {
    run: { id: run.id, artistName: run.artistName, params: run.params, status: run.status, plan: run.plan },
    events: await traceHistory(run.id),
  };
}

// Retry an interrupted or failed run with the same parameters.
export async function action({ params }: Route.ActionArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  return redirect(`/plan/${await startRun(run.params)}`);
}

const STATUS: Record<RunStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "starting", variant: "outline" },
  running: { label: "planning", variant: "outline" },
  done: { label: "done", variant: "secondary" },
  failed: { label: "failed", variant: "destructive" },
  interrupted: { label: "interrupted", variant: "destructive" },
};

export default function PlanView({ loaderData }: Route.ComponentProps) {
  const { run } = loaderData;
  const live = run.status === "pending" || run.status === "running";
  const events = useTraceStream(run.id, loaderData.events, live);
  const navigation = useNavigation();
  const plan = run.plan;
  const status = STATUS[run.status];

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start gap-4">
        {plan?.artist.image && (
          <img src={plan.artist.image} alt="" className="size-16 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{plan?.artist.name ?? run.artistName}</h1>
            <Badge variant={status.variant}>
              {live && <LoaderCircle className="animate-spin" />}
              {status.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.params.shows} shows · {run.params.region === "in" ? "India" : "North America"} · from{" "}
            {run.params.startDate}
            {run.params.homeBase && ` · home ${run.params.homeBase}`} · rooms {formatNumber(run.params.roomMin)}–
            {formatNumber(run.params.roomMax)}
            {plan && (
              <>
                {" "}
                · <RouteIcon className="inline size-3.5" /> {formatNumber(plan.totalKm)} km
              </>
            )}
          </p>
          {plan?.summary && <p className="mt-2 max-w-3xl text-sm">{plan.summary}</p>}
        </div>
      </div>

      {(run.status === "interrupted" || run.status === "failed") && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <TriangleAlert className="size-4 text-destructive" />
          {run.status === "interrupted"
            ? "Run interrupted (the server restarted mid-run)."
            : "Run failed. See the trace for the reason."}
          <Form method="post">
            <Button type="submit" size="sm" variant="outline" disabled={navigation.state !== "idle"}>
              Retry
            </Button>
          </Form>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="flex h-[32rem] flex-col rounded-xl ring-1 ring-foreground/10">
          <h2 className="border-b px-3 py-2 text-sm font-medium">
            Agent trace <span className="text-muted-foreground">· {events.length} events</span>
          </h2>
          <div className="flex-1 overflow-y-auto p-3">
            {events.length ? (
              <Trace events={events} live={live} />
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for the agent…</p>
            )}
          </div>
        </section>
        <section className="h-[32rem] overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <TourMap stops={plan?.stops ?? []} />
        </section>
      </div>

      {plan && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plan.stops.map((stop, i) => (
            <CityCard key={stop.city.name} stop={stop} index={i} />
          ))}
        </section>
      )}
    </main>
  );
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
