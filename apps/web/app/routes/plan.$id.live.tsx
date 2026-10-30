import { tabLabel, workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { shortDate } from "~/lib/tour-tabs";
import { ErrorLine, LoadingLines } from "~/components/state";
import { LoaderCircle } from "lucide-react";
import { Link, useFetcher } from "react-router";

import { keepOnViewChange } from "~/lib/plan-nav";
import { formatNumber } from "~/components/trace";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import type { Pace } from "@tourbo/core/engine/pace.ts";
import { apiError } from "../../server/agent/errors";
import { liveState, recordCheckin, recordResult } from "../../server/agent/live.server";
import { getRun } from "../../server/agent/runs.server";
import type { Route } from "./+types/plan.$id.live";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName} ${loaderData.unit.toLowerCase()} — Tourbo` : "Tourbo" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  const stops = (run.plan?.stops ?? []).map((s) => ({
    city: s.city.name,
    date: s.date,
    venue: s.venue?.name,
    expected: s.money?.tickets,
    capacity: s.money?.capacity ?? s.capacity?.max,
    skip: s.money?.verdict === "skip",
  }));
  // What this tab counts for the kind ("Tickets", "Seats"): the copy follows the tab's name.
  const unit = tabLabel(workspaceFor(run.plan?.artist.kind), "live");
  return { id: run.id, artistName: run.plan?.artist.name ?? run.artistName, unit, stops, ...(await liveState(run.id).catch(() => ({ checkins: {} as Awaited<ReturnType<typeof liveState>>["checkins"], results: {} as Awaited<ReturnType<typeof liveState>>["results"] }))) };
}

export async function action({ params, request }: Route.ActionArgs) {
  if (!UUID.test(params.id)) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const stop = Number(form.get("stop"));
  const num = (k: string) => (form.get(k) ? Number(form.get(k)) : undefined);
  try {
    if (form.get("intent") === "checkin") {
      const sold = num("sold");
      if (sold === undefined || sold < 0) return { stop, error: "Enter how many are sold so far, as a number." };
      return { stop, pace: await recordCheckin(params.id, stop, sold) };
    }
    const attendance = num("attendance");
    if (!attendance) return { stop, error: "Enter how many people came." };
    await recordResult(params.id, { stopIndex: stop, attendance, gross: num("gross"), notes: String(form.get("notes") ?? "") || undefined });
    return { stop, saved: true };
  } catch (error) {
    return { stop, ...apiError(error, "live") };
  }
}

const STATUS_STYLE: Record<Pace["status"], string> = {
  ahead: "bg-success/15 text-success",
  "on track": "bg-info/15 text-info",
  behind: "bg-warning/15 text-warning",
  "well behind": "bg-destructive/15 text-destructive",
};

export const shouldRevalidate = keepOnViewChange;

export default function Live({ loaderData }: Route.ComponentProps) {
  const { id, artistName, stops, checkins, results, unit } = loaderData;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg tracking-tight">After booking</h2>
        <p className="mt-1 text-sm text-muted-foreground">Enter {unit.toLowerCase()} sold so far; Tourbo says if each show is on track.</p>
      </div>
      {!stops.length && (
        <p className="text-sm text-muted-foreground">
          The plan isn't ready yet. Check back once it's done. <Link to="/help" className="underline underline-offset-4">Need help?</Link>
        </p>
      )}
      <div className="grid gap-4 @xl:grid-cols-2">
        {stops.map((s, i) =>
          s.skip ? null : (
            <StopLive key={i} unit={unit} index={i} stop={s} last={checkins[i]} result={results[s.city]} primary={i === stops.findIndex((x) => !x.skip)} />
          ),
        )}
      </div>
    </div>
  );
}

function StopLive({
  unit,
  index,
  stop,
  last,
  result,
  primary,
}: {
  unit: string;
  primary?: boolean;
  index: number;
  stop: { city: string; date?: string; venue?: string; expected?: number; capacity?: number };
  last?: { sold: number; at: string };
  result?: { attendance: number; gross?: number; notes?: string };
}) {
  const pace = useFetcher<typeof action>();
  const log = useFetcher<typeof action>();
  const p = pace.data && "pace" in pace.data ? pace.data.pace : undefined;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          {index + 1}. {stop.city}
        </CardTitle>
        <CardDescription>
          {shortDate(stop.date, true)}
          {stop.venue && ` · ${stop.venue}`}
          {stop.expected && ` · plan: ~${formatNumber(stop.expected)} of ${formatNumber(stop.capacity ?? 0)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <pace.Form method="post" className="flex items-end gap-2">
          <input type="hidden" name="intent" value="checkin" />
          <input type="hidden" name="stop" value={index} />
          <label className="grid flex-1 gap-1">
            <span className="text-xs text-muted-foreground">{unit} sold so far{last && ` (last: ${last.sold})`}</span>
            <Input name="sold" type="number" min={0} required />
          </label>
          <Button type="submit" size="sm" variant={primary ? "default" : "outline"} data-primary={primary || undefined} disabled={pace.state !== "idle"}>
            {pace.state !== "idle" && <LoaderCircle className="animate-spin" />} Check pace
          </Button>
        </pace.Form>
        {pace.state !== "idle" && <LoadingLines lines={2} label="Checking the pace…" />}
        {pace.state === "idle" && pace.data && "error" in pace.data && <ErrorLine message={pace.data.error} />}
        {p && (
          <div className="space-y-1.5 rounded-lg bg-muted/50 p-2.5">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status}</span>
              <span>
                ~{formatNumber(p.projected)} on the night at this pace (expected {formatNumber(p.expectedByNow)} by now)
              </span>
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {p.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{p.basis}</p>
          </div>
        )}
        <details className="rounded-lg border p-2.5" open={Boolean(result)}>
          <summary className="cursor-pointer font-medium">{result ? `Logged: ${formatNumber(result.attendance)} people` : "After the show: how did it go?"}</summary>
          <log.Form method="post" className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="intent" value="result" />
            <input type="hidden" name="stop" value={index} />
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">People who came</span>
              <Input name="attendance" type="number" min={1} defaultValue={result?.attendance} required />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Door takings (optional)</span>
              <Input name="gross" type="number" min={0} defaultValue={result?.gross} />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">What landed, what didn't (optional)</span>
              <Input name="notes" defaultValue={result?.notes} />
            </label>
            <Button type="submit" size="sm" variant="outline" className="sm:col-span-2" disabled={log.state !== "idle"}>
              Save result
            </Button>
          </log.Form>
          {log.data && "saved" in log.data && <p className="mt-1.5 text-xs text-success">Saved. Your next plan calibrates your draw from it.</p>}
          {log.data && "error" in log.data && <ErrorLine message={log.data.error} />}
        </details>
      </CardContent>
    </Card>
  );
}
