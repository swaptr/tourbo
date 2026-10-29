import { Link } from "react-router";

import { RunTabs } from "~/components/run-tabs";
import { Chip, formatNumber } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { getRun } from "../../server/core/agent/runs.server";
import { traceHistory } from "../../server/core/agent/trace.server";
import { cityMetrics, compareTours, type CompareStop } from "../../server/core/engine/compare";
import type { Route } from "./+types/plan.$id.compare";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName}: Qloo on vs off — Tourbo` : "Tourbo" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  const comparison =
    run.plan && run.baseline ? compareTours(run.plan, run.baseline, cityMetrics(await traceHistory(run.id))) : null;
  return {
    id: run.id,
    artistName: run.plan?.artist.name ?? run.artistName,
    status: run.status,
    baselineSummary: run.baseline?.summary,
    comparison,
  };
}

export default function Compare({ loaderData }: Route.ComponentProps) {
  const { comparison: c } = loaderData;
  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{loaderData.artistName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The same model and request, with and without Qloo. Both plans are measured with this run's Qloo city scores
          and heatmap cells.
        </p>
      </div>
      <RunTabs runId={loaderData.id} />

      {!c ? (
        <p className="text-sm text-muted-foreground">
          {loaderData.status === "running" || loaderData.status === "pending" ? (
            <>
              Still planning. <Link to={`/plan/${loaderData.id}`} className="underline">Watch the trace</Link>, then
              come back.
            </>
          ) : (
            "No comparison for this run (the plan or the baseline is missing)."
          )}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {c.qlooScore !== null && c.baselineScore !== null ? (
              <Stat
                label="Mean city score (fan footprint + over-indexing), on vs off"
                value={`${c.qlooScore} vs ${c.baselineScore}`}
                accent
              />
            ) : (
              <Stat label="Heatmap cells reached, on vs off" value={`${formatNumber(c.qlooCells)} vs ${formatNumber(c.baselineCells)}`} />
            )}
            <Stat label="Cities only Qloo found" value={`${c.qloo.filter((s) => s.onlyHere).length} of ${c.qloo.length}`} />
            <Stat
              label="Venues backed by Qloo data, on vs off"
              value={`${c.qloo.filter((s) => s.venue).length} vs 0`}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Column
              title="Qloo on"
              description="Cities ranked by fan footprint; venues, openers and copy from Qloo data."
              stops={c.qloo}
            />
            <Column
              title="Qloo off"
              description={loaderData.baselineSummary ?? "Model knowledge only."}
              stops={c.baseline}
              off
            />
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", accent && "text-emerald-700 dark:text-emerald-400")}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Column({
  title,
  description,
  stops,
  off,
}: {
  title: string;
  description: string;
  stops: CompareStop[];
  off?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {stops.map((stop, i) => (
            <li key={i} className={cn("rounded-lg p-2", stop.onlyHere && "bg-amber-50 dark:bg-amber-950/40")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {i + 1}. {stop.city}
                </span>
                {stop.onlyHere && <Badge variant="outline">only {off ? "without" : "with"} Qloo</Badge>}
                {stop.score !== null && <Chip>score {stop.score}</Chip>}
                {stop.cells === null ? (
                  <Chip className="bg-muted text-muted-foreground">not scored</Chip>
                ) : (
                  <Chip>heatmap cells {formatNumber(stop.cells)}</Chip>
                )}
              </div>
              <p className="mt-1 text-muted-foreground">
                {stop.venue ?? "no venue"}
                {stop.opener && ` · opener ${stop.opener}`}
                {off && <span className="italic"> · unverified</span>}
              </p>
              {stop.note && <p className="mt-0.5 text-xs text-muted-foreground">{stop.note}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
