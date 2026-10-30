import { CheckCircle2, LoaderCircle, ShieldAlert, Sparkles, Users } from "lucide-react";
import { useFetcher } from "react-router";

import { RunTabs } from "~/components/run-tabs";
import { Chip } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { friendlyError } from "../../server/agent/errors";
import { getPreps, prepareShow, type ShowPrep } from "../../server/agent/prep.server";
import { rehearse, type Rehearsal } from "../../server/agent/rehearsal.server";
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
  const form = await request.formData();
  const stop = Number(form.get("stop"));
  try {
    if (form.get("intent") === "rehearse") return { stop, rehearsal: await rehearse(params.id, stop) };
    return { stop, prep: await prepareShow(params.id, stop) };
  } catch (error) {
    return { stop, error: friendlyError(error) };
  }
}

const STEP_LABEL: Record<string, string> = { mcp: "City brief", draft: "Drafted", contrast: "Without fan data", critic: "Critic", revise: "Revised" };

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
          For every night: {kind === "comedian" ? "an opener, local bit ideas and crowd-work topics" : kind === "musician" || !kind ? "an opening line, setlist nods to local acts, banter and a crowd moment" : "opening words, what to show and in what order, a local nod and a crowd moment"}, plus room setup and a sponsor ask. Tourbo
          writes from what that city's audience loves; a critic throws out anything it can't back with the fan data.
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
  const panel = useFetcher<typeof action>();
  const prep = (fetcher.data && "prep" in fetcher.data ? fetcher.data.prep : undefined) ?? saved;
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;
  const fresh = fetcher.data && "prep" in fetcher.data; // a rewrite clears the old rehearsal
  const rehearsal = (panel.data && "rehearsal" in panel.data ? panel.data.rehearsal : undefined) ?? (fresh ? undefined : saved?.rehearsal);
  const panelError = panel.data && "error" in panel.data ? panel.data.error : undefined;
  const rehearsing = panel.state !== "idle";
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
        <CardAction className="flex flex-wrap justify-end gap-2">
          {prep && (
            <panel.Form method="post">
              <input type="hidden" name="intent" value="rehearse" />
              <input type="hidden" name="stop" value={index} />
              <Button type="submit" size="sm" variant="outline" disabled={rehearsing || busy}>
                {rehearsing ? <LoaderCircle className="animate-spin" /> : <Users />}
                {rehearsing ? "Rehearsing…" : rehearsal ? "Rehearse again" : "Rehearse with fans"}
              </Button>
            </panel.Form>
          )}
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
        {prep && <PrepBody prep={prep} rehearsal={rehearsal} />}
        {panelError && <p className="text-destructive">{panelError}</p>}
        {rehearsing && !rehearsal && <p className="text-muted-foreground">Four simulated fans from {stop.city}'s fan data are reading your notes… (~15 s)</p>}
        {prep && rehearsal && <RehearsalPanel rehearsal={rehearsal} items={prep.final.items} />}
      </CardContent>
    </Card>
  );
}

function PrepBody({ prep, rehearsal }: { prep: ShowPrep; rehearsal?: Rehearsal }) {
  const sections = Object.keys(SECTION_LABEL).filter((k) => prep.final.items.some((i) => i.section === k));
  return (
    <>
      <ol className="flex flex-wrap gap-1.5 text-xs">
        {prep.steps.map((s, i) => (
          <li key={i}>
            <Chip className={s.kind === "critic" && prep.issues.length ? "bg-amber-100 text-amber-900" : ""}>
              {STEP_LABEL[s.kind]}: {s.message.replace(/^tourbo_city_brief: /, "").replace(/Qloo-off draft/, "draft").replace(/\bQloo /g, "")}
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
                .map((item, n) => ({ item, n }))
                .filter(({ item }) => item.section === k)
                .map(({ item, n }) => (
                  <dd key={n} className="mt-1">
                    {item.text}
                    {rehearsal && <Landed t={rehearsal.items[n]} />}
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
                  <li key={i}>{issue.replace(/\bQloo (brief|reference)/g, "fan-data $1")}</li>
                ))}
              </ul>
            )}
          </div>
          {prep.generic && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">Without fan data: same AI, guessing</summary>
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

function Landed({ t }: { t?: Rehearsal["items"][number] }) {
  if (!t || !t.hits.length) return null;
  const tone = t.misfire > t.loves ? "bg-red-100 text-red-900" : t.loves > 0 ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground";
  const label = [t.loves && `${t.loves} loved`, t.meh && `${t.meh} meh`, t.misfire && `${t.misfire} winced`].filter(Boolean).join(" · ");
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 align-middle text-xs ${tone}`}>{label}</span>;
}

const REACTION: Record<string, { label: string; className: string }> = {
  loves: { label: "loves it", className: "text-emerald-700" },
  meh: { label: "meh", className: "text-muted-foreground" },
  misfire: { label: "winces", className: "text-red-700" },
};

function RehearsalPanel({ rehearsal, items }: { rehearsal: Rehearsal; items: ShowPrep["final"]["items"] }) {
  const misfires = rehearsal.items.filter((t) => t.misfire > t.loves);
  const dropped = rehearsal.personas.reduce((n, p) => n + p.dropped, 0);
  return (
    <section className="space-y-3 rounded-xl border border-dashed p-3">
      <div>
        <p className="flex items-center gap-1.5 font-medium">
          <Users className="size-4 text-indigo-600" /> Rehearsal with simulated fans
        </p>
        <p className="text-xs text-muted-foreground">
          Built from this city's taste data, not real people and not a prediction. Every reaction has to point at something that persona cares
          about{dropped ? `; ${dropped} that couldn't ${dropped === 1 ? "was" : "were"} thrown out` : ""}.
          {misfires.length > 0 && ` ${misfires.length} line${misfires.length > 1 ? "s" : ""} winced more than landed: worth rewriting.`}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rehearsal.personas.map(({ persona, reactions }) => (
          <div key={persona.id} className="rounded-lg bg-muted/50 p-3">
            <p className="font-medium">{persona.name}</p>
            <p className="text-xs text-muted-foreground">{persona.who}</p>
            {!reactions.length && <p className="mt-2 text-xs text-muted-foreground">Nothing in the set spoke to them.</p>}
            <ul className="mt-2 space-y-1.5">
              {reactions.map((r, i) => (
                <li key={i} className="text-xs">
                  <span className={`font-medium ${REACTION[r.reaction].className}`}>{REACTION[r.reaction].label}</span>{" "}
                  <span className="text-muted-foreground">“{items[r.item]?.text.slice(0, 60)}{(items[r.item]?.text.length ?? 0) > 60 ? "…" : ""}”</span>
                  <br />
                  {r.why}
                </li>
              ))}
            </ul>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">why this persona?</summary>
              <ul className="mt-1 flex flex-wrap gap-1">
                {persona.slice.map((ref) => (
                  <li key={ref.name}>
                    <Chip>
                      {ref.name}
                      {ref.affinity !== undefined && ` · affinity ${ref.affinity.toFixed(2)}`}
                    </Chip>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}
