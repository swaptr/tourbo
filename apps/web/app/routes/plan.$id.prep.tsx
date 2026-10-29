import { CheckCircle2, LoaderCircle, ShieldAlert, Sparkles } from "lucide-react";
import { useFetcher } from "react-router";

import { RunTabs } from "~/components/run-tabs";
import { Chip } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { getPreps, prepareShow, type ShowPrep } from "../../server/agent/prep.server";
import { getRun } from "../../server/agent/runs.server";
import type { Route } from "./+types/plan.$id.prep";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName} show notes — Tourbo` : "Tourbo" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  const stops = (run.plan?.stops ?? []).map((s) => ({ city: s.city.name, date: s.date, venue: s.venue?.name }));
  return { id: run.id, artistName: run.plan?.artist.name ?? run.artistName, kind: run.params.kind, stops, preps: await getPreps(run.id) };
}

export async function action({ params, request }: Route.ActionArgs) {
  if (!UUID.test(params.id)) throw new Response("Not found", { status: 404 });
  const stop = Number((await request.formData()).get("stop"));
  try {
    return { stop, prep: await prepareShow(params.id, stop) };
  } catch (error) {
    return { stop, error: (error as Error).message };
  }
}

const STEP_LABEL: Record<string, string> = { mcp: "Qloo city brief", draft: "Claude drafted", contrast: "Without Qloo", critic: "Critic", revise: "Revised" };

const SECTION_LABEL: Record<string, string> = {
  opening: "Opening",
  setlist: "Setlist",
  material: "Material",
  banter: "Banter",
  crowd: "Crowd moment",
  staging: "Room setup",
  sponsor: "Sponsor ask",
  avoid: "Avoid",
};

export default function PrepView({ loaderData }: Route.ComponentProps) {
  const { id, artistName, kind, stops, preps } = loaderData;
  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{artistName}: show notes</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          For every night: {kind === "comedian" ? "an opener, local bit ideas and crowd-work topics" : "an opening line, setlist nods to local acts, banter and a crowd moment"}, plus room setup and a sponsor ask. Claude
          writes from what that city's audience loves (Qloo); a critic throws out anything it can't back with the data.
        </p>
      </div>
      <RunTabs runId={id} />
      {!stops.length && <p className="text-sm text-muted-foreground">The plan isn't ready yet.</p>}
      <div className="grid gap-4">
        {stops.map((s, i) => (
          <StopPrep key={i} index={i} stop={s} saved={preps[i]} />
        ))}
      </div>
    </main>
  );
}

function StopPrep({ index, stop, saved }: { index: number; stop: { city: string; date?: string; venue?: string }; saved?: ShowPrep }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const prep = (fetcher.data && "prep" in fetcher.data ? fetcher.data.prep : undefined) ?? saved;
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {index + 1}. {stop.city}
        </CardTitle>
        <CardDescription>
          {stop.date ?? "date tbd"}
          {stop.venue && ` · ${stop.venue}`}
        </CardDescription>
        <CardAction>
          <fetcher.Form method="post">
            <input type="hidden" name="stop" value={index} />
            <Button type="submit" size="sm" variant={prep ? "outline" : "default"} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {busy ? "Writing…" : prep ? "Rewrite" : "Write show notes"}
            </Button>
          </fetcher.Form>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {error && <p className="text-destructive">{error}</p>}
        {busy && !prep && <p className="text-muted-foreground">Reading the city, drafting, checking every reference… (~20 s)</p>}
        {prep && <PrepBody prep={prep} />}
      </CardContent>
    </Card>
  );
}

function PrepBody({ prep }: { prep: ShowPrep }) {
  const sections = Object.keys(SECTION_LABEL).filter((k) => prep.final.items.some((i) => i.section === k));
  return (
    <>
      <ol className="flex flex-wrap gap-1.5 text-xs">
        {prep.steps.map((s, i) => (
          <li key={i}>
            <Chip className={s.kind === "critic" && prep.issues.length ? "bg-amber-100 text-amber-900" : ""}>
              {STEP_LABEL[s.kind]}: {s.message.replace(/^tourbo_city_brief: /, "")}
            </Chip>
          </li>
        ))}
      </ol>
      <p className="border-l-2 border-indigo-300 pl-2 italic">{prep.final.hook}</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <dl className="space-y-3">
          {sections.map((k) => (
            <div key={k}>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{SECTION_LABEL[k]}</dt>
              {prep.final.items
                .filter((i) => i.section === k)
                .map((item, j) => (
                  <dd key={j} className="mt-1">
                    {item.text}
                    {item.refs.length > 0 && (
                      <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                        {item.refs.map((r) => (
                          <Chip key={r}>{r}</Chip>
                        ))}
                      </span>
                    )}
                  </dd>
                ))}
            </div>
          ))}
        </dl>
        <aside className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 font-medium">
              {prep.issues.length ? <ShieldAlert className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
              Critic {prep.issues.length ? `caught ${prep.issues.length} in the first draft` : "found nothing to fix"}
              {prep.remaining.length > 0 && <Badge variant="destructive">{prep.remaining.length} left</Badge>}
            </p>
            {prep.issues.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {prep.issues.slice(0, 8).map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
          {prep.generic && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">Qloo off: same model, no data</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {prep.generic.items.slice(0, 8).map((item, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">{SECTION_LABEL[item.section]}:</span> {item.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>
    </>
  );
}
