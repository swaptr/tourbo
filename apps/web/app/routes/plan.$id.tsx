import { LoaderCircle, TriangleAlert } from "lucide-react";
import { neutral } from "~/lib/neutral";
import { useEffect, useState } from "react";
import { Form, Link, redirect, useNavigation, useRevalidator } from "react-router";

import { AgentProgress } from "~/components/agent-progress";
import { FanRanking } from "~/components/fan-ranking";
import { CityCard, formatMoney } from "~/components/city-card";
import { RunTabs } from "~/components/run-tabs";
import { ProjectPicker } from "~/components/project-picker";
import { ShareButton } from "~/components/share-button";
import { TourMap } from "~/components/tour-map";
import { Trace, formatNumber } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { startRun } from "../../server/agent/orchestrator.server";
import { getRun, type RunStatus } from "../../server/agent/runs.server";
import { traceHistory } from "../../server/agent/trace.server";
import { REGION_NAMES, type TraceEvent } from "@tourbo/core/shared/types.ts";
import { discipline } from "@tourbo/core/disciplines/index.ts";
import { attachRun, createProject, listProjects, projectOfRun } from "@tourbo/core/projects/projects.server.ts";
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
    // Projects are optional: a DB hiccup here never breaks the plan page.
    project: await projectOfRun(run.id).catch(() => undefined),
    projects: await listProjects(20).catch(() => []),
  };
}

// Retry an interrupted or failed run with the same parameters.
export async function action({ params, request }: Route.ActionArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  if (form.get("intent") === "project") {
    try {
      let id = String(form.get("project") ?? "");
      if (id === "new") id = (await createProject({ title: `${run.plan?.artist.name ?? run.artistName} tour`, artist: run.artistName, kind: run.params.kind })).id;
      await attachRun(id, run.id);
      return { ok: true };
    } catch {
      return { error: "Couldn't add it. Try again." };
    }
  }
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
  const failed = run.status === "interrupted" || run.status === "failed";
  const events = useTraceStream(run.id, loaderData.events, live);
  const navigation = useNavigation();
  const plan = run.plan;
  const status = STATUS[run.status];
  const failure = [...events].reverse().find((e) => e.data?.error === true);
  const dates = plan?.stops.map((s) => s.date).filter(Boolean).sort() ?? [];

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start gap-4">
        {plan?.artist.image && <img src={plan.artist.image} alt="" className="hidden size-14 rounded-xl object-cover sm:block" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl tracking-tight">{plan?.artist.name ?? run.artistName}</h1>
            <Badge variant={status.variant}>
              {live && <LoaderCircle className="animate-spin" />}
              {status.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.params.shows} shows · {REGION_NAMES[run.params.region]}
            {run.params.homeBase && ` · near ${run.params.homeBase}`}
            {dates.length ? ` · ${dates[0]} → ${dates.at(-1)}` : ` · from ${run.params.startDate}`}
          </p>
        </div>
        {plan && (
          <div className="flex flex-wrap items-center gap-2">
            <ProjectPicker current={loaderData.project} projects={loaderData.projects} />
            <ShareButton />
          </div>
        )}
      </div>

      {plan && <RunTabs runId={run.id} />}

      {live && (
        <section className="mx-auto max-w-xl space-y-3">
          <h2 className="font-heading text-lg">Tourbo is planning your tour</h2>
          <AgentProgress events={events} jobs={run.params.jobs ?? []} status={run.status} />
          <p className="text-sm text-muted-foreground">
            Usually 1–3 minutes. You can close this tab; the plan is saved at this address.
          </p>
        </section>
      )}

      {failed && (
        <section className="mx-auto max-w-xl space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 text-destructive" />
            {run.status === "interrupted" ? "The planner was interrupted." : "The planner couldn't finish."}
          </p>
          <p className="text-sm">
            {run.status === "interrupted"
              ? "The server restarted mid-run. Retrying with the same settings usually works."
              : (neutral(failure?.message.replace(/^Run failed: /, "")) ?? "Something went wrong while planning.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Form method="post">
              <Button type="submit" size="sm" disabled={navigation.state !== "idle"}>
                Retry
              </Button>
            </Form>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/start" />}>
              Change settings
            </Button>
          </div>
          {typeof failure?.data?.detail === "string" && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Technical detail</summary>
              <p className="mt-1 [overflow-wrap:anywhere]">{neutral(failure.data.detail)}</p>
            </details>
          )}
        </section>
      )}

      {plan && (
        <>
          {plan.money && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Expected tour profit" value={formatMoney(plan.money.profit, plan.money.currency)} tone={plan.money.profit >= 0 ? "good" : "bad"} />
              <Stat label="Ticket sales (gross)" value={formatMoney(plan.money.gross, plan.money.currency)} />
              <Stat label="Your costs" value={formatMoney(plan.money.costs + (plan.money.promoBudget ?? 0), plan.money.currency)} />
              <Stat label="Driving / flying" value={`${formatNumber(plan.totalKm)} km`} />
            </div>
          )}
          {plan.summary && <p className="max-w-3xl text-sm">{neutral(plan.summary)}</p>}
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <section className="h-96 overflow-hidden rounded-xl ring-1 ring-border">
              <TourMap stops={plan.stops} />
            </section>
            <FanRanking stops={plan.stops} />
          </div>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {plan.stops.map((stop, i) => (
              <CityCard key={stop.city.name} stop={stop} index={i} support={discipline(plan.artist.kind).support} best={stop.score === Math.max(...plan.stops.map((x) => x.score))} />
            ))}
          </section>
          <p className="text-xs text-muted-foreground">
            Money is an estimate: your typical draw scaled by fan demand in each city, with regional costs. Capacities are estimates too.
          </p>
        </>
      )}

      {events.length > 0 && !live && (
        <details className="rounded-xl ring-1 ring-foreground/10">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            How Tourbo decided <span className="font-normal text-muted-foreground">· full log, {events.length} steps</span>
          </summary>
          <div className="max-h-[32rem] overflow-y-auto border-t p-4">
            <Trace events={events} live={false} />
          </div>
        </details>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`num mt-1 font-heading text-2xl sm:text-3xl ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
    </div>
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
