import { ArrowRight, Check, Info, LoaderCircle, RotateCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import { discipline, workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { EMPTY_FEEDBACK, shownCity, type FeedbackChange, type ShownCity } from "@tourbo/core/engine/idea-feedback.ts";
import { contextParams } from "~/components/context-controls";
import { IdeasError, IdeasLoading, type IdeasData } from "~/components/ideas-board";
import { IdeasTourGrid } from "~/components/ideas/tour-grid";
import { neutral } from "~/lib/neutral";

type Result = { ideas?: IdeasData; error?: string; retry?: boolean };
type RefreshResult = { refreshed?: boolean; refreshError?: string; refreshRetry?: boolean };
import { keepOnViewChange, pickNight, usePickedNight } from "~/lib/plan-nav";
import { ErrorLine, useLimits } from "~/components/state";
import { Button } from "~/components/ui/button";
import { ReadOnlyNote, useCanEdit } from "~/components/your-work";
import {
  changeIdeasFeedback,
  feedbackState,
  ideasError,
  ideasForPlan,
  ideasInputs,
  ideasInputsFor,
  leverDefaults,
  parseNote,
  refreshCities,
  saveIdeas,
  savedIdeas,
  staleCities,
  withFresh,
  writeAngles,
  type FeedbackState,
} from "../../server/agent/ideas.server";
import { getRun } from "../../server/agent/runs.server";
import { apiError } from "../../server/agent/errors";
import { ownerHash } from "../../server/owner.server";
import type { Route } from "./+types/plan.$id.ideas";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `Ideas for ${loaderData.artistName}'s tour — Tourbo` : "Tourbo" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  // Performance context from the URL (?slot=&flavour=&b=): saved ideas are per context.
  const url = new URL(request.url);
  const kind = run.plan?.artist.kind ?? "musician";
  const inputs = await ideasInputsFor(run.id, kind, url.searchParams);
  // Saved ideas (and written angles) for the plan as it is now; none → the page makes them once.
  const [saved, feedback, owner] = await Promise.all([savedIdeas(run.id, inputs).catch(() => undefined), feedbackState(run.id).catch(() => undefined), ownerHash("run", run.id).catch(() => null)]);
  const cities = (run.plan?.stops ?? []).map((s) => s.city.name);
  const dates = (run.plan?.stops ?? []).map((s) => s.date);
  const data = (saved?.angles ?? saved?.ideas)?.data as IdeasData | undefined;
  return {
    feedback: feedback ?? ({ feedback: EMPTY_FEEDBACK, fresh: {}, version: 0 } satisfies FeedbackState),
    // Cities whose note (era / clean) changes the fan-data ask and that weren't asked again yet.
    stale: feedback ? staleCities(kind, inputs, feedback, cities) : [],
    owned: Boolean(owner),
    id: run.id,
    kind,
    crowd: !!discipline(kind).crowdWork,
    inputs,
    artistName: run.plan?.artist.name ?? run.artistName,
    cities,
    dates,
    saved: data && feedback ? withFresh(data, kind, inputs, feedback) : data,
    savedAt: (saved?.angles ?? saved?.ideas)?.savedAt,
    anglesWritten: !!saved?.angles,
  };
}

// intent=ideas: deterministic ideas (fan data, no AI). intent=angles: the AI writes the lines on
// top of the ideas it is sent; the critic keeps only lines that name one of that city's refs.
export async function action({ params, request }: Route.ActionArgs) {
  if (!UUID.test(params.id)) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const run = await getRun(params.id);
  const kind = run?.plan?.artist.kind ?? "musician";
  const lever = await leverDefaults(params.id, kind);
  const inputs = ideasInputs(kind, { slot: form.get("slot") ?? undefined, flavour: form.get("flavour") ?? lever.flavour, boundaries: form.get("b") ?? lever.boundaries, skew: lever.skew });
  const intent = form.get("intent");
  // The act's feedback (root middleware already checked the owner key for this POST).
  if (intent === "feedback" || intent === "note") {
    try {
      const version = form.get("version") ? Number(form.get("version")) : undefined;
      let notice: string | undefined;
      let change: FeedbackChange;
      if (intent === "note") {
        const note = String(form.get("note") ?? "").slice(0, 200);
        const parsed = await parseNote(params.id, note, (run?.plan?.stops ?? []).map((s) => s.city.name));
        notice = parsed.notice;
        change = { op: "note", note, constraints: parsed.constraints, parsedBy: parsed.parsedBy };
      } else change = JSON.parse(String(form.get("change"))) as FeedbackChange;
      const r = await changeIdeasFeedback(params.id, change, version);
      return r.ok ? { feedbackOk: true, affected: r.affected, notice } : { feedbackError: r.error };
    } catch (error) {
      const e = apiError(error, "ideas feedback");
      return { feedbackError: e.error };
    }
  }
  if (intent === "refresh-cities") {
    try {
      await refreshCities(params.id, inputs, JSON.parse(String(form.get("cities") ?? "[]")) as string[]);
      return { refreshed: true };
    } catch (error) {
      const e = ideasError(error);
      return { refreshError: `${e.error} Your saved ideas stay, with your choices applied.`, refreshRetry: e.retry };
    }
  }
  try {
    if (intent === "angles") {
      const ideas = await writeAngles(JSON.parse(String(form.get("payload"))));
      if (!ideas.note) await saveIdeas(params.id, "ideas_angles", ideas);
      return { ideas: ideas as IdeasData };
    }
    // reuse: an edited plan keeps saved ideas for cities still in it and asks only for new ones.
    const ideas = await ideasForPlan(params.id, inputs, { reuse: form.get("reuse") === "1" });
    await saveIdeas(params.id, "ideas", ideas);
    return { ideas: ideas as IdeasData };
  } catch (error) {
    return ideasError(error);
  }
}

// Each context (slot / flavour / boundaries) is its own saved set of ideas: changing a control
// moves the URL, the loader brings that context's saved ideas, and the view remounts (fresh fetchers).
export const shouldRevalidate = keepOnViewChange;

export default function PlanIdeas(props: Route.ComponentProps) {
  const i = props.loaderData.inputs;
  return <PlanIdeasView key={[i.slot, i.flavour, ...i.boundaries].join(":")} {...props} />;
}

const cityName = (c: string) => c.split(",")[0].trim();

// The Ideas tab compares the tour: the top idea per kind for every night (fan-data chips). Picking
// one opens that night in the panel, where its cards are kept or dropped. Slot, note and refresh
// live in the header's Tune (one place to tune); "Write promo lines" is the one primary action.
function PlanIdeasView({ loaderData }: Route.ComponentProps) {
  const { id, cities, dates, saved, anglesWritten, kind, inputs, feedback: fbState, stale, owned } = loaderData;
  const canEdit = useCanEdit(id, owned);
  const limits = useLimits();
  // Share links (no owner key here): saved ideas read-only, never a POST (the server refuses it).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const viewer = hydrated && !canEdit;
  const regen = useFetcher<RefreshResult>();
  const ask = (list: string[]) => list.length && regen.submit({ intent: "refresh-cities", cities: JSON.stringify(list), ...contextParams(inputs) }, { method: "post" });
  const [search] = useSearchParams();
  const load = useFetcher<Result>();
  const write = useFetcher<Result>();
  const ctx = contextParams(inputs);
  const fetchIdeas = () => load.submit({ intent: "ideas", ...ctx }, { method: "post" });
  useEffect(() => {
    if (canEdit && cities.length && !saved && load.state === "idle" && !load.data) load.submit({ intent: "ideas", reuse: "1", ...ctx }, { method: "post" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);
  const fresh = load.data?.ideas; // made (or refreshed) on this visit
  const base = fresh ?? saved;
  const written = write.data?.ideas ?? (!fresh && anglesWritten ? saved : undefined);
  const raw = written ?? base;
  // One source with the night panel and the tab badge (shownCity): the act's Keep / Not for me /
  // More like this / note applied; kinds with a Covers tab leave covers there.
  const coversTab = workspaceFor(kind).main.includes("covers");
  const ideas = useMemo(() => (raw ? { ...raw, cities: raw.cities.map((c) => shownCity(c, fbState.feedback, coversTab)) } : undefined), [raw, fbState.feedback, coversTab]);
  const selected = Math.min(Math.max(usePickedNight(search.get("night")), 1), Math.max(cities.length, 1));
  const nights = cities.map((c, i) => ({ city: c, date: dates[i], ideas: ideas?.cities.find((x) => cityName(x.city).toLowerCase() === cityName(c).toLowerCase()) as ShownCity | undefined }));
  const total = nights.reduce((a, n) => a + (n.ideas?.ideas.length ?? 0), 0);
  const covers = nights.reduce((a, n) => a + (n.ideas?.covers ?? 0), 0);
  const error = load.data?.error ? { error: load.data.error, retry: !!load.data.retry } : undefined;
  const writeError = write.data?.error;
  const writing = write.state !== "idle";
  const looking = load.state !== "idle";
  const canWrite = canEdit && !!base && total > 0;
  const coversHref = `/plan/${id}/covers?night=${selected}`;
  const [picked, setPicked] = useState<string>();
  const writeForm = (className?: string) =>
    canWrite && (
      <write.Form method="post" className={className}>
        <input type="hidden" name="intent" value="angles" />
        <input type="hidden" name="payload" value={JSON.stringify(base)} />
        <Button type="submit" variant={written ? "outline" : "default"} data-primary={!written || undefined} className="max-sm:h-11 max-sm:w-full" disabled={writing || !!written}>
          {writing ? <LoaderCircle className="animate-spin" /> : written ? <Check /> : <Sparkles />}
          {writing ? "Writing…" : written ? "Promo lines written" : "Write promo lines"}
        </Button>
      </write.Form>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-x-4 gap-y-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl tracking-tight">Ideas across the tour</h2>
          {cities.length > 0 && (
            <p className="num mt-0.5 text-sm text-pretty text-muted-foreground">
              {total > 0 ? `${total} pick${total === 1 ? "" : "s"} for ${cities.length} night${cities.length === 1 ? "" : "s"}. Pick one to keep or drop it on that night.` : `${cities.length} night${cities.length === 1 ? "" : "s"}`}
            </p>
          )}
        </div>
        {/* Phone: the action sits under the nights list (the list comes first). */}
        {writeForm("shrink-0 max-sm:hidden")}
      </div>
      {viewer && cities.length > 0 && <ReadOnlyNote what="tour's ideas" />}
      {!cities.length && (
        <p className="rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
          The plan isn't ready yet. Ideas appear once the nights are in. <Link to="/help" className="text-foreground underline underline-offset-4">Need help?</Link>
        </p>
      )}
      {cities.length > 0 && !ideas && !error && !viewer && <IdeasLoading />}
      {viewer && cities.length > 0 && !ideas && <p className="text-sm text-muted-foreground">Ideas show here once the tour's owner opens this tab.</p>}
      {error && <IdeasError message={error.error} retry={error.retry} onRetry={fetchIdeas} busy={looking} />}
      <ErrorLine message={writeError} retry={write.data?.retry} onRetry={() => base && write.submit({ intent: "angles", payload: JSON.stringify(base) }, { method: "post" })} />
      {writing && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Your AI assistant is writing one line per idea for every night, and Tourbo checks each against the fan data (about 15 s).
        </p>
      )}
      {regen.state !== "idle" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Looking again for {stale.join(", ") || "those cities"}…
        </p>
      )}
      {regen.state === "idle" && regen.data?.refreshError && <ErrorLine message={regen.data.refreshError} retry={regen.data.refreshRetry} onRetry={() => ask(stale)} />}
      {regen.state === "idle" && !regen.data?.refreshError && canEdit && stale.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Your note changes what Tourbo looks for in {stale.join(", ")}.
          <Button type="button" size="xs" variant="outline" onClick={() => ask(stale)}>
            Look again
          </Button>
        </p>
      )}
      {ideas && (
        <>
          <p className="max-w-prose text-sm text-pretty text-muted-foreground" data-testid="ideas-basis">
            {total > 0 && <span className="font-medium text-foreground">{neutral(ideas.frame)} </span>}
            {neutral(ideas.basisLine)}
            {coversTab && total > 0 && (
              <>
                {" "}Covers have{" "}
                <Link to={coversHref} className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
                  their own tab
                </Link>
                .
              </>
            )}
          </p>
          {ideas.note && <p className="text-sm text-muted-foreground">{neutral(ideas.note)}</p>}
          {/visual|photo|film|maker/.test(kind) && <p className="text-xs text-muted-foreground">{neutral(ideas.label)}</p>}
          {ideas.partial && !limits.data && (
            <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <Info className="size-4 shrink-0" aria-hidden />
              <span>Some fan data didn't load, so a few ideas may be missing.</span>
              {canEdit && (
                <Button type="button" size="xs" variant="outline" onClick={fetchIdeas} disabled={looking}>
                  Try again
                </Button>
              )}
            </p>
          )}
          {total > 0 ? (
            <>
              <IdeasTourGrid
                nights={nights}
                selected={selected}
                picked={picked}
                onPick={(night, category, open) => {
                  setPicked(category);
                  pickNight({ night, category, open });
                }}
              />
              {writeForm("sm:hidden")}
            </>
          ) : (
            <div className="space-y-3 rounded-xl border border-dashed px-4 py-4 text-sm" data-testid="ideas-empty">
              <p className="max-w-prose text-pretty text-muted-foreground">
                {coversTab && covers > 0
                  ? "So far the fan data has only covers for this tour, and they're on the Covers tab. Local topics, places and food each crowd leans to show here once the fan data has some."
                  : (nights.find((n) => n.ideas?.empty)?.ideas?.empty ?? "The fan data has nothing for these nights yet.")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {coversTab && covers > 0 && (
                  <Button data-primary className="max-sm:h-11" nativeButton={false} render={<Link to={coversHref} />}>
                    See the covers <ArrowRight />
                  </Button>
                )}
                {canEdit && !limits.data && (
                  <Button type="button" variant="outline" className="max-sm:h-11" onClick={fetchIdeas} disabled={looking}>
                    {looking ? <LoaderCircle className="animate-spin" /> : <RotateCw />} {looking ? "Looking…" : "Look again"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
