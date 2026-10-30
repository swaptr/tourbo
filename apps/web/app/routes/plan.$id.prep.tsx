import { ErrorLine, LoadingLines } from "~/components/state";
import { Hint } from "~/components/hint";
import { CheckCircle2, ChevronDown, LoaderCircle, ShieldAlert, Sparkles, Users } from "lucide-react";
import { Link, useFetcher, useSearchParams } from "react-router";

import { keepOnViewChange } from "~/lib/plan-nav";
import { ReadOnlyNote, useCanEdit } from "~/components/your-work";
import { Chip } from "~/components/trace";
import { TourNotes } from "~/components/tour-notes";
import { neutral } from "~/lib/neutral";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { apiError } from "../../server/agent/errors";
import { getPreps, prepareShow, stalePreps, type ShowPrep } from "../../server/agent/prep.server";
import { rehearse, type Rehearsal } from "../../server/agent/rehearsal.server";
import { getRun } from "../../server/agent/runs.server";
import { ownerHash } from "../../server/owner.server";
import type { Route } from "./+types/plan.$id.prep";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName} show notes — Tourbo` : "Tourbo" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  const stops = (run.plan?.stops ?? []).map((s) => ({ city: s.city.name, date: s.date, venue: s.venue?.name }));
  const preps = await getPreps(run.id);
  const stale = await stalePreps(run.id, run.plan?.artist.kind ?? run.params.kind, preps).catch((): number[] => []);
  const owned = Boolean(await ownerHash("run", run.id).catch(() => null));
  return { id: run.id, artistName: run.plan?.artist.name ?? run.artistName, kind: run.params.kind, stops, preps, stale, owned };
}

export async function action({ params, request }: Route.ActionArgs) {
  if (!UUID.test(params.id)) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const stop = Number(form.get("stop"));
  try {
    if (form.get("intent") === "rehearse") return { stop, rehearsal: await rehearse(params.id, stop) };
    return { stop, prep: await prepareShow(params.id, stop) };
  } catch (error) {
    return { stop, ...apiError(error, "prep") };
  }
}

const STEP_LABEL: Record<string, string> = { mcp: "City brief", draft: "Drafted", contrast: "Without fan data", critic: "Checked", revise: "Revised" };

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

export const shouldRevalidate = keepOnViewChange;

export default function PrepView({ loaderData }: Route.ComponentProps) {
  const { id, artistName, kind, stops, preps, stale, owned } = loaderData;
  // Share links (no owner key here): saved notes read-only; writing them would be refused.
  const canEdit = useCanEdit(id, owned);
  // One primary button: the first night without notes.
  const firstMissing = stops.findIndex((_, i) => !preps[i]);
  // One night at a time (the selected night from the rail); the others are a tap away.
  const [search] = useSearchParams();
  const asked = Number(search.get("night")) - 1;
  const at = asked >= 0 && asked < stops.length ? asked : Math.max(0, firstMissing);
  const written = stops.filter((_, i) => preps[i]).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-heading text-xl tracking-tight">
          Show notes <span className="num font-sans text-xs font-normal text-muted-foreground">{written} of {stops.length} written</span>
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          Notes for each night, written from what that city loves.
          <Hint label="What's in them?">
            {kind === "comedian" ? "An opener, local bit ideas and crowd-work topics" : kind === "musician" || !kind ? "An opening line, setlist nods to local acts, banter and a crowd moment" : "Opening words, what to show and in what order, a local nod and a crowd moment"}, plus room setup and a sponsor ask.
            A checker throws out anything the fan data can't back.
          </Hint>
        </p>
      </div>
        {stops.length > 0 && firstMissing < 0 && (
          <Button size="sm" data-primary nativeButton={false} render={<Link to={`/plan/${id}/pipeline`} />}>
            Next: venue emails
          </Button>
        )}
      </div>
      {!stops.length && (
        <p className="text-sm text-muted-foreground">
          The plan isn't ready yet. <Link to="/help" className="underline underline-offset-4">Need help?</Link>
        </p>
      )}
      <section aria-labelledby="tour-notes-h" className="space-y-2 rounded-xl border bg-card p-4">
        <h3 id="tour-notes-h" className="font-heading text-lg tracking-tight">
          Tour notes &amp; to-dos <span className="font-sans text-xs font-normal text-muted-foreground">for the whole run</span>
        </h3>
        <TourNotes runId={id} compact />
      </section>
      {!canEdit && stops.length > 0 && <ReadOnlyNote what="tour's show notes" />}
      {stops[at] && <StopPrep key={at} index={at} stop={stops[at]} saved={preps[at]} primary={at === firstMissing} stale={stale.includes(at)} canEdit={canEdit} />}
    </div>
  );
}

function StopPrep({ index, stop, saved, primary, stale, canEdit }: { index: number; stop: { city: string; date?: string; venue?: string }; saved?: ShowPrep; primary?: boolean; stale?: boolean; canEdit: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const panel = useFetcher<typeof action>();
  const prep = (fetcher.data && "prep" in fetcher.data ? fetcher.data.prep : undefined) ?? saved;
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data : undefined;
  const fresh = fetcher.data && "prep" in fetcher.data; // a rewrite clears the old rehearsal
  const rehearsal = (panel.data && "rehearsal" in panel.data ? panel.data.rehearsal : undefined) ?? (fresh ? undefined : saved?.rehearsal);
  const panelError = panel.data && "error" in panel.data ? panel.data : undefined;
  const rehearsing = panel.state !== "idle";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {stop.city}
        </CardTitle>
        <CardDescription>
          {stop.date ? new Date(`${stop.date}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) : "date to set"}
          {stop.venue && ` · ${stop.venue}`}
        </CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          {prep && canEdit && (
            <panel.Form method="post">
              <input type="hidden" name="intent" value="rehearse" />
              <input type="hidden" name="stop" value={index} />
              <Button type="submit" size="sm" variant="outline" disabled={rehearsing || busy}>
                {rehearsing ? <LoaderCircle className="animate-spin" /> : <Users />}
                {rehearsing ? "Rehearsing…" : rehearsal ? "Rehearse again" : "Rehearse with fans"}
              </Button>
            </panel.Form>
          )}
          {canEdit && (
          <fetcher.Form method="post">
            <input type="hidden" name="stop" value={index} />
            <Button type="submit" size="sm" variant={primary && !prep ? "default" : "outline"} data-primary={(primary && !prep) || undefined} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {busy ? "Writing…" : prep ? "Rewrite" : "Write show notes"}
            </Button>
          </fetcher.Form>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {error && !busy && <ErrorLine message={error.error} retry={error.retry} busy={busy} onRetry={() => fetcher.submit({ stop: String(index) }, { method: "post" })} />}
        {busy && !prep && <LoadingLines lines={4} label="Writing and checking… (~20 s)" />}
        {!canEdit && !prep && <p className="text-muted-foreground">Notes for this night show here once the tour's owner writes them.</p>}
        {canEdit && stale && !fresh && prep && !busy && (
          <p className="text-muted-foreground" data-testid="prep-stale">
            You changed Tune since these notes were written. Rewrite to follow it.
          </p>
        )}
        {prep && <PrepBody prep={prep} rehearsal={rehearsal} />}
        {panelError && !rehearsing && <ErrorLine message={panelError.error} retry={panelError.retry} onRetry={() => panel.submit({ intent: "rehearse", stop: String(index) }, { method: "post" })} />}
        {rehearsing && !rehearsal && <LoadingLines lines={3} label={`Four simulated ${stop.city} fans are reading your notes… (~15 s)`} />}
        {prep && rehearsal && <RehearsalPanel rehearsal={rehearsal} items={prep.final.items} />}
      </CardContent>
    </Card>
  );
}

function PrepBody({ prep, rehearsal }: { prep: ShowPrep; rehearsal?: Rehearsal }) {
  const sections = Object.keys(SECTION_LABEL).filter((k) => prep.final.items.some((i) => i.section === k));
  return (
    <>
      <p className="border-l-2 border-foreground/20 pl-2.5 italic">{prep.final.hook}</p>
      {prep.sensitivity && (prep.sensitivity.advice.length > 0 || prep.sensitivity.notes.length > 0) && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="prep-sensitivity">
          <ShieldAlert className="size-3.5 text-warning" />
          Local sensitivities for {prep.city}.
          <Hint text="Guidance, not legal advice">
            {prep.sensitivity.advice.map((a) => (
              <p key={a}>{a}</p>
            ))}
            {prep.sensitivity.notes.map((n) => (
              <p key={n.text} className="mt-1">
                {n.text}{" "}
                <a href={n.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {n.source.title}
                </a>
              </p>
            ))}
            <p className="mt-1 text-muted-foreground">{prep.sensitivity.disclaimer}</p>
          </Hint>
        </p>
      )}
      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="divide-y rounded-lg ring-1 ring-border">
          {sections.map((k) => (
            <details key={k} open={k === "opening" || k === "setlist"} className="group/sec">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 -rotate-90 text-muted-foreground transition-transform duration-150 group-open/sec:rotate-0" aria-hidden />
                {SECTION_LABEL[k]}
              </summary>
              <dl className="space-y-2 px-3 pb-3 pl-8">
              <dt className="sr-only">{SECTION_LABEL[k]}</dt>
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
                          <Chip key={r}>{refLabel(r)}</Chip>
                        ))}
                      </span>
                    )}
                  </dd>
                ))}
              </dl>
            </details>
          ))}
        </div>
        <aside className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 font-medium">
              {prep.issues.length ? <ShieldAlert className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />}
              {prep.issues.length ? `Checked: ${prep.issues.length} line${prep.issues.length === 1 ? "" : "s"} fixed` : "Checked: nothing to fix"}
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
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">How it was written</summary>
            <ol className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {prep.steps.map((s, i) => (
                <li key={i}>
                  <Chip className={s.kind === "critic" && prep.issues.length ? "bg-warning/15 text-warning" : ""}>
                    {STEP_LABEL[s.kind]}: {neutral(s.message.replace(/^tourbo_city_brief: /, "").replace(/Qloo-off draft/, "draft"))}
                  </Chip>
                </li>
              ))}
            </ol>
          </details>
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
  const tone = t.misfire > t.loves ? "bg-destructive/10 text-destructive" : t.loves > 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground";
  const label = [t.loves && `${t.loves} loved`, t.meh && `${t.meh} meh`, t.misfire && `${t.misfire} winced`].filter(Boolean).join(" · ");
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 align-middle text-xs ${tone}`}>{label}</span>;
}

const REACTION: Record<string, { label: string; className: string }> = {
  loves: { label: "loves it", className: "text-success" },
  meh: { label: "meh", className: "text-muted-foreground" },
  misfire: { label: "winces", className: "text-destructive" },
};

function RehearsalPanel({ rehearsal, items }: { rehearsal: Rehearsal; items: ShowPrep["final"]["items"] }) {
  const misfires = rehearsal.items.filter((t) => t.misfire > t.loves);
  const dropped = rehearsal.personas.reduce((n, p) => n + p.dropped, 0);
  return (
    <section className="space-y-3 rounded-xl border border-dashed p-3">
      <div>
        <p className="flex items-center gap-1.5 font-medium">
          <Users className="size-4 text-secondary" /> Rehearsal with simulated fans
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {misfires.length > 0 ? `${misfires.length} line${misfires.length > 1 ? "s" : ""} winced more than landed: worth rewriting.` : "A rehearsal, not a prediction."}
          <Hint label="Who are these fans?">
            Built from this city's taste data, not real people and not a prediction. Every reaction has to point at something that persona cares
            about{dropped ? `; ${dropped} that couldn't ${dropped === 1 ? "was" : "were"} thrown out` : ""}.
          </Hint>
        </p>
      </div>
      <details className="group/reh">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm select-none [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-3.5 -rotate-90 text-muted-foreground transition-transform duration-150 group-open/reh:rotate-0" aria-hidden />
          <span className="num">
            {rehearsal.items.filter((t) => t.loves > t.misfire).length} landed · {rehearsal.items.filter((t) => t.meh > 0 && t.loves <= t.misfire && t.misfire === 0).length} meh · {misfires.length} winced
          </span>
          <span className="text-xs text-muted-foreground">· {rehearsal.personas.length} fans' reactions</span>
        </summary>
      <div className="mt-3 grid gap-3 @2xl:grid-cols-2">
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
            <Hint text="why this persona?" className="mt-2">
              <ul className="flex flex-wrap gap-1">
                {persona.slice.map((ref) => (
                  <li key={ref.name}>
                    <Chip>
                      {ref.name}
                      {ref.affinity !== undefined && ` · affinity ${ref.affinity.toFixed(2)}`}
                    </Chip>
                  </li>
                ))}
              </ul>
            </Hint>
          </div>
        ))}
      </div>
      </details>
    </section>
  );
}

// "Search Party (tv_show)" → "Search Party (TV show)": data type tags read as plain words.
function refLabel(ref: string) {
  return ref.replace(/\(([a-z]+(?:_[a-z]+)+)\)$/, (_, t: string) => `(${t.replace(/_/g, " ").replace(/^tv\b/, "TV")})`);
}
