import { Hint } from "~/components/hint";
import { Link } from "react-router";
import { neutral } from "~/lib/neutral";

import { keepOnViewChange } from "~/lib/plan-nav";
import { firstLine } from "~/components/city-card";
import { Chip, formatNumber } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { getRun } from "../../server/agent/runs.server";
import { traceHistory } from "../../server/agent/trace.server";
import { cityMetrics, compareTours, type CompareStop } from "@tourbo/core/engine/compare.ts";
import type { Route } from "./+types/plan.$id.compare";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName}: with vs without fan data — Tourbo` : "Tourbo" }];
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

export const shouldRevalidate = keepOnViewChange;

export default function Compare({ loaderData }: Route.ComponentProps) {
  const { comparison: c } = loaderData;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg tracking-tight">With vs without fan data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Same tour, planned with fan data and as an AI guess.</p>
      </div>

      {!c ? (
        <p className="text-sm text-muted-foreground">
          {loaderData.status === "running" || loaderData.status === "pending" ? (
            <>
              Still planning. <Link to={`/plan/${loaderData.id}`} className="underline">Watch the trace</Link>, then
              come back.
            </>
          ) : (
            <>
              No comparison for this run yet. Plan the tour again to get one. <Link to="/help" className="underline">Need help?</Link>
            </>
          )}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {c.qlooScore !== null && c.baselineScore !== null ? (
              <Stat
                label="Average fan score, with vs without fan data"
                value={`${c.qlooScore} vs ${c.baselineScore}`}
                accent
              />
            ) : (
              <Stat label="Fan areas reached, with vs without" value={`${formatNumber(c.qlooCells)} vs ${formatNumber(c.baselineCells)}`} />
            )}
            <Stat label="Cities only fan data found" value={`${c.qloo.filter((s) => s.onlyHere).length} of ${c.qloo.length}`} />
            <Stat
              label="Rooms picked from fan data, with vs without"
              value={`${c.qloo.filter((s) => s.venue).length} vs 0`}
            />
          </div>
          <div className="grid gap-4 @3xl:grid-cols-2">
            <Column
              title="With fan data"
              description="Cities ranked by where your fans are."
              stops={c.qloo}
            />
            <Column
              title="AI guess"
              description={firstLine(neutral(loaderData.baselineSummary) ?? "What an AI assistant guesses without fan data.")}
              stops={c.baseline}
              off
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("num mt-1 font-heading text-3xl", accent && "text-success")}>
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
            <li key={i} className={cn("rounded-lg p-2", stop.onlyHere && "bg-warning/10")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {i + 1}. {stop.city}
                </span>
                {stop.onlyHere && <Badge variant="outline">only {off ? "in the guess" : "with fan data"}</Badge>}
                <Hint text="why?" label={`Fan data for ${stop.city}`}>
                  {stop.cells === null ? "Not scored with fan data." : `Fan score ${stop.score ?? "n/a"} · fan areas ${formatNumber(stop.cells)} (fan data)`}
                </Hint>
              </div>
              <p className="mt-1 text-muted-foreground">
                {stop.venue ? <span className="font-semibold text-foreground">{stop.venue}</span> : "no venue"}
                {stop.opener && (
                  <>
                    {" · opener "}
                    <span className="font-semibold text-foreground">{stop.opener}</span>
                  </>
                )}
                {off && <span className="italic"> · unverified</span>}
              </p>
              {stop.note && <p className="mt-0.5 text-xs text-muted-foreground">{firstLine(neutral(stop.note))}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
