import { Check, ChevronRight, ListMusic, LoaderCircle, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRouteLoaderData, useSearchParams } from "react-router";
import { stopKey } from "@tourbo/core/engine/edit.ts";
import type { loader as layoutLoader } from "./plan.$id";

import { BoundaryChips, FlavourToggle, SlotHint, SlotSelect } from "~/components/context-controls";
import { Hint } from "~/components/hint";
import { ErrorLine } from "~/components/state";
import { Insight } from "~/components/insight";
import { RichLine } from "~/components/rich-line";
import { keepOnViewChange } from "~/lib/plan-nav";
import { ReadOnlyNote, useCanEdit } from "~/components/your-work";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { recordWork } from "~/lib/work";
import { addItem, getProject, projectOfRun } from "@tourbo/core/projects/projects.server.ts";
import { FLAVOURS, GUIDANCE_NOTE, defaultBoundaries, defaultSlot, isFlavour, localBudget, parseBoundaries, slotsFor, type Boundary, type Flavour } from "@tourbo/core/context/index.ts";
import { discipline, workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { setMoveItem } from "@tourbo/core/engine/explain-facts.ts";
import { segments } from "@tourbo/core/engine/ideas-rank.ts";
import { parseSetLines, setMarkdown, type CitySet, type SetTag } from "@tourbo/core/engine/set.ts";
import { apiError, PlainError } from "../../server/agent/errors";
import { AI_LIMIT } from "@tourbo/core/shared/errors.ts";
import { getRun } from "../../server/agent/runs.server";
import { leverDefaults } from "../../server/agent/ideas.server";
import { ownerHash } from "../../server/owner.server";
import { buildOrRestoreSet, savedSet, type CityWriting, type SetBuild } from "../../server/agent/set.server";
import { NightSet } from "~/components/kind-tabs/night-set";
import { fromMoves, SetShape } from "~/components/kind-tabs/set-shape";
import type { Route } from "./+types/plan.$id.set";

const UUID = /^[0-9a-f-]{36}$/i;
const TAGS: readonly SetTag[] = ["opener", "slow", "banger", "closer"]; // = SET_TAGS (set.ts is server-side)

const STYLE_DEFAULTS: Record<string, string[]> = {
  musician: ["Indie Pop", "Folk", "Rock", "Singer-Songwriter", "Hip Hop", "R&B", "Soul", "Country", "Electronic", "Jazz"],
  comedian: ["Stand-Up Comedy", "Observational Comedy", "Storytelling", "Satire", "Improv", "Sketch Comedy"],
};
const styleDefaults = (kind: string) =>
  STYLE_DEFAULTS[kind] ??
  discipline(kind as never)
    .scene.split(",")
    .map((x) => x.trim().replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter(Boolean);

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName}: your set — Tourbo` : "Tourbo" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  const plan = run.plan;
  const kind = plan?.artist.kind ?? run.params.kind;
  const project = await projectOfRun(run.id).catch(() => undefined);
  // Prefill from a project's setlist item ("Build my set" on the project page).
  const itemId = new URL(request.url).searchParams.get("item");
  const saved = project && itemId ? (await getProject(project.id).catch(() => undefined))?.items.find((i) => i.id === itemId && i.kind === "setlist")?.text : undefined;
  // A set saved from this tab: keep only the user's own lines ("1. Title (4 min)" → "Title, 4").
  const ordered = (saved ?? "")
    .split("\n")
    .map((l) => l.match(/^\d+\.\s+(.+?)\s+\((\d+(?:\.\d+)?) min\)$/))
    .filter((m): m is RegExpMatchArray => !!m && !/^(Cover|Crowd work|Local tag):/.test(m[1]))
    .map((m) => `${m[1]}, ${m[2]}`);
  const prefill = ordered.length ? ordered.join("\n") : saved;
  const actStyles = (plan?.artist.styles?.length ? plan.artist.styles : (plan?.artist.tags ?? [])).map((t) => t.name);
  const styles = [...new Set([...actStyles.slice(0, 6), ...styleDefaults(kind)])].slice(0, 12);
  const cities = [...new Set((plan?.stops ?? []).map((s) => s.city.name))];
  const d = discipline(kind);
  // Support night on the plan → default to the support slot.
  const support = (plan?.stops ?? []).some((s) => s.money?.verdict === "support slot") && (plan?.stops ?? []).every((s) => s.money?.verdict === "support slot");
  const slots = slotsFor(kind).map((s) => ({ key: s.key, label: s.label, size: s.size, unit: s.unit, note: s.note, local: Object.fromEntries(FLAVOURS.map((f) => [f, localBudget(s, f).max])) as Record<Flavour, number> }));
  const slot = support ? (slots.find((s) => s.key === "support")?.key ?? defaultSlot(kind).key) : defaultSlot(kind).key;
  // The last built set and its inputs come back as they were: no rebuild on revisit.
  const last = itemId ? undefined : await savedSet(run.id).catch(() => undefined);
  // The plan's Tune levers (local flavour, edginess, era) are the defaults here; a set built before
  // they changed is shown with a note to rebuild.
  const lever = await leverDefaults(run.id, kind).catch(() => undefined);
  const tuneChanged = !!last && !!lever && (last.inputs.skew ?? null) !== (lever.skew ?? null);
  const builtFor = new Set((last?.build.result.cities ?? []).map((c) => c.city.toLowerCase().split(",")[0]));
  const tourChanged = !!last && (plan?.stops ?? []).slice(0, 6).some((s) => !builtFor.has(s.city.name.toLowerCase().split(",")[0]));
  const staleNote = tuneChanged ? "You changed Tune since this set was built. Build it again to follow it." : tourChanged ? "The tour changed since this set was built. Build it again: cities still on the tour keep their order." : undefined;
  return {
    lever: lever && { flavour: lever.flavour, boundaries: lever.boundaries, skew: lever.skew },
    stale: tuneChanged,
    staleNote,
    last: last && { inputs: last.inputs, build: { ...last.build, savedAt: last.savedAt } },
    id: run.id,
    artistName: plan?.artist.name ?? run.artistName,
    kind,
    crowd: d.crowdWork,
    noun: workspaceFor(kind).item[1], // the kind's Library noun: songs, bits, pieces, dishes…
    heading: workspaceFor(kind).set.heading,
    cities,
    styles,
    slots,
    slot,
    boundaries: lever?.boundaries ?? defaultBoundaries(kind),
    project: project && { id: project.id, title: project.title },
    prefill,
    owned: Boolean(await ownerHash("run", run.id).catch(() => null)),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  if (!UUID.test(params.id)) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  try {
    if (form.get("intent") === "save") {
      const project = await projectOfRun(params.id);
      if (!project) throw new PlainError("This plan isn't in a project yet. Add it to one from the Tour tab, then save.");
      const city = JSON.parse(String(form.get("city"))) as CitySet;
      await addItem(project.id, { kind: "setlist", text: setMarkdown(city), city: city.city });
      return { saved: city.city };
    }
    const items = parseSetLines(String(form.get("text") ?? ""));
    const picks = JSON.parse(String(form.get("picks") ?? "[]")) as { style?: string; tag?: SetTag }[];
    items.forEach((it, i) => {
      const p = picks[i];
      if (p?.tag) it.tag = p.tag;
      if (p?.style) it.styles = [...new Set([p.style, ...(it.styles ?? [])])].slice(0, 2);
    });
    const slot = String(form.get("slot") || "headline").slice(0, 40);
    const flavour = isFlavour(form.get("flavour")) ? (form.get("flavour") as Flavour) : "touch";
    const boundaries = parseBoundaries(String(form.get("boundaries") ?? ""));
    const run = await getRun(params.id);
    const skew = (await leverDefaults(params.id, run?.plan?.artist.kind ?? run?.params.kind ?? "musician").catch(() => undefined))?.skew;
    const inputs = { text: String(form.get("text") ?? ""), picks, slot, flavour, boundaries, ...(skew && skew !== "even" ? { skew } : {}) };
    return { build: await buildOrRestoreSet(params.id, inputs, items, form.get("force") === "1") };
  } catch (error) {
    return apiError(error, "set");
  }
}

// Client mirror of parseSetLines for the per-line pickers (the server re-parses on submit).
function previewLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ""))
    .filter(Boolean)
    .slice(0, 40)
    .map((line) => {
      const [title, ...rest] = line.split(/\s*[|,;]\s*|\s+[—–]\s+/);
      const parts = rest.map((r) => r.trim()).filter(Boolean);
      const tag = parts.map((r) => r.toLowerCase()).find((r): r is SetTag => (TAGS as readonly string[]).includes(r));
      const style = parts.find((r) => !(TAGS as readonly string[]).includes(r.toLowerCase()) && !/^\d+(\.\d+)?\s*(m|min|mins|minutes)?$/i.test(r));
      return { title, tag, style };
    });
}

const MOVE_LABEL: Record<string, string> = { open: "Open", keep: "Keep", build: "Build", breather: "Breather", nod: "Local nod", peak: "Peak", close: "Close", crowd: "Crowd work" };

export const shouldRevalidate = keepOnViewChange;

export default function SetView({ loaderData }: Route.ComponentProps) {
  const { id, artistName, kind, crowd, noun, cities, styles, project, prefill, last } = loaderData;
  const init = last?.inputs;
  const fetcher = useFetcher<typeof action>();
  const form = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";
  const [text, setText] = useState(prefill ?? init?.text ?? "");
  const [slot, setSlot] = useState(init?.slot ?? loaderData.slot);
  const fromTune = !init || loaderData.stale;
  const [flavour, setFlavour] = useState<Flavour>((fromTune ? loaderData.lever?.flavour : init?.flavour) ?? init?.flavour ?? "touch");
  const [bounds, setBounds] = useState<Boundary[]>((fromTune ? undefined : init?.boundaries) ?? loaderData.boundaries);
  const [picks, setPicks] = useState<Record<number, { style?: string; tag?: SetTag }>>(() => Object.fromEntries(((init?.picks ?? []) as unknown as { style?: string; tag?: SetTag }[]).map((p, i) => [i, p])));
  const rows = useMemo(() => previewLines(text), [text]);
  const fresh: (SetBuild & { savedAt?: string }) | undefined = fetcher.data && "build" in fetcher.data ? fetcher.data.build : undefined;
  const build = fresh ?? (prefill ? undefined : last?.build);
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;
  const pick = (i: number, p: { style?: string; tag?: SetTag }) => setPicks((cur) => ({ ...cur, [i]: { ...cur[i], ...p } }));
  // Share links (no owner key here): the saved set read-only; building would be refused.
  const canEdit = useCanEdit(id, loaderData.owned);
  // "Build my set" from the Library for the night picked in the rail (its show keeps the set).
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/plan.$id");
  const [search] = useSearchParams();
  const night = useMemo(() => {
    const plan = layout?.run.plan;
    const stop = plan?.stops[(Number(search.get("night")) || 1) - 1];
    const index = (Number(search.get("night")) || 1) - 1;
    return stop && stop.money?.verdict !== "skip" ? { stop, index, show: layout?.ws?.shows?.[stopKey(stop)]?.id } : undefined;
  }, [layout, search]);

  useEffect(() => {
    if (fresh) recordWork({ id, kind: "set", title: `${artistName}: your set`, status: "saved", href: `/plan/${id}/set` });
  }, [fresh, id, artistName]);
  const rebuild = () => {
    if (!form.current) return;
    const data = new FormData(form.current);
    data.set("force", "1");
    fetcher.submit(data, { method: "post" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg tracking-tight">Your {loaderData.heading.toLowerCase()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your {noun} for each night, in order. Your material leads; Tourbo adds a few local touches.</p>
        </div>
      </div>
      {night && <NightSet runId={id} kind={kind} stop={night.stop} index={night.index} showId={night.show} canEdit={canEdit} currency={layout?.run.plan?.money?.currency ?? night.stop.money?.currency} />}
      {!cities.length ? (
        <p className="text-sm text-muted-foreground">The plan isn't ready yet. Come back when the tour has its nights.</p>
      ) : !canEdit ? (
        <ReadOnlyNote what="set" />
      ) : (
        // Pasting is the second way in: folded unless there's a pasted list or a built order already.
        <details className="group space-y-3" open={!!build || !!text || !night?.show}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-9 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform duration-150 group-open:rotate-90" aria-hidden />
            Or paste a list and order every night at once
          </summary>
        <Card className="mt-3">
          <CardContent>
            <fetcher.Form ref={form} method="post" className="grid gap-3">
              <input type="hidden" name="intent" value="build" />
              <input type="hidden" name="picks" value={JSON.stringify(rows.map((_, i) => picks[i] ?? {}))} />
              <Textarea
                name="text"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label={`Your ${noun}`}
                placeholder={crowd ? "Airport security, opener, 5\nMy landlord\nDating apps, closer" : "Golden Hour, opener, 4\nSlow River, slow\nNight Drive, banger\nGoodbye Song, closer, 5"}
              />
              {rows.length > 0 && (
                <ul className="grid gap-1.5 text-sm" aria-label="Tags per line">
                  {rows.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <NativeSelect aria-label={`Style for ${r.title}`} value={picks[i]?.style ?? r.style ?? ""} onChange={(e) => pick(i, { style: e.target.value || undefined })}>
                        <NativeSelectOption value="">Style: auto</NativeSelectOption>
                        {(r.style && !styles.includes(r.style) ? [r.style, ...styles] : styles).map((s) => (
                          <NativeSelectOption key={s} value={s}>
                            {s}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <NativeSelect aria-label={`Energy for ${r.title}`} value={picks[i]?.tag ?? r.tag ?? ""} onChange={(e) => pick(i, { tag: (e.target.value || undefined) as SetTag | undefined })}>
                        <NativeSelectOption value="">Energy: any</NativeSelectOption>
                        {TAGS.map((t) => (
                          <NativeSelectOption key={t} value={t}>
                            {t}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <SlotSelect name="slot" kind={kind} value={slot} onChange={setSlot} />
                <FlavourToggle name="flavour" value={flavour} onChange={setFlavour} />
                <SlotHint kind={kind} slot={slot} flavour={flavour} />
              </div>
              {crowd && <BoundaryChips name="boundaries" value={bounds} onChange={setBounds} />}
              <div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="outline" disabled={busy || !rows.length}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <ListMusic />}
                  {busy ? "Ordering…" : "Order every night"}
                </Button>
                {!rows.length && !busy && <span className="text-xs text-muted-foreground">Add a few of your own pieces above first; Tourbo orders them.</span>}
              </div>
              </div>
            </fetcher.Form>
          </CardContent>
        </Card>
        </details>
      )}
      <ErrorLine message={error} retry={fetcher.data && "retry" in fetcher.data ? fetcher.data.retry : false} onRetry={() => form.current && fetcher.submit(form.current, { method: "post" })} />
      {busy && (
        <div className="grid gap-4 @3xl:grid-cols-2" aria-busy="true" aria-label="Building your set">
          {cities.slice(0, 2).map((c) => (
            <div key={c} className="space-y-2 rounded-xl border p-4">
              <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ))}
        </div>
      )}
      {!busy && !build && !error && cities.length > 0 && !canEdit && <p className="text-sm text-muted-foreground">The set shows here once the tour's owner builds it.</p>}
      {build && !busy && (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {(build.aiNote && build.aiNote.replace(AI_LIMIT, "").trim()) || (build.savedAt ? `Saved ${new Date(build.savedAt).toLocaleDateString()}.` : "")}
            {!fresh && loaderData.staleNote && <span className="text-foreground" data-testid="set-stale">{loaderData.staleNote}</span>}
            {canEdit && (
              <Button type="button" size="sm" variant="ghost" onClick={rebuild}>
                Rebuild
              </Button>
            )}
          </p>
          <div className="grid gap-4 @3xl:grid-cols-2">
            {build.result.cities.map((c, i) => (
              <CitySetCard key={c.city} kind={kind} runId={id} set={c} writing={build.writing[i]} crowd={crowd} canSave={!!project && canEdit} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CitySetCard({ kind, runId, set, writing, crowd, canSave }: { kind: string; runId: string; set: CitySet; writing?: CityWriting; crowd: boolean; canSave: boolean }) {
  const save = useFetcher<typeof action>();
  const saved = save.data && "saved" in save.data;
  const saveError = save.data && "error" in save.data ? save.data.error : undefined;
  const len = set.length;
  const names = [set.city, ...set.facts.map((f) => f.name), ...set.coverIdeas.map((c) => c.artist), ...set.crowdWork];
  const rich = (text: string) => <RichLine parts={segments(text, names)} />;
  const advice = set.avoid?.advice ?? [];
  const notes = set.avoid?.notes ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{set.city}</CardTitle>
        <CardDescription>
          <Badge variant={len.verdict === "over" ? "destructive" : "secondary"}>{len.verdict === "ok" ? `${len.total} min` : len.verdict === "over" ? `${len.total - len.target} min over` : `${len.target - len.total} min short`}</Badge> {len.note}
          {set.local && <span className="block">{set.local.budget.note}</span>}
        </CardDescription>
        <CardAction>
          {canSave && (
            <save.Form method="post">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="city" value={JSON.stringify(set)} />
              <Button type="submit" size="sm" variant="outline" disabled={save.state !== "idle" || saved}>
                {saved ? <Check /> : <Save />}
                {saved ? "Saved" : "Save to project"}
              </Button>
            </save.Form>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ErrorLine message={saveError} />
        {/* The kind's shape of this order (energy curve, opener-to-closer, class timeline). */}
        {["setlist", "bits", "class"].includes(workspaceFor(kind).set.style) && <SetShape kind={kind} items={fromMoves(set.order)} />}
        <ol className="space-y-2">
          {set.order.map((e, pos) => {
            const w = writing?.moves[pos];
            const weak = set.weakSpot && e.item === set.weakSpot.item;
            return (
              <li key={pos} data-testid="set-move" data-move-kind={e.move} className={cn("rounded-lg px-3 py-2", e.item === undefined ? "border border-dashed" : "bg-muted/50", weak && "ring-1 ring-warning/60")}>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{MOVE_LABEL[e.move]}</span>
                  <span className="font-medium">{e.title}</span>
                  <span className="text-xs text-muted-foreground">{e.minutes} min</span>
                  {weak && <span className="text-xs text-warning">weak spot</span>}
                </p>
                <Insight item={setMoveItem(set, pos)} runId={runId} suggestion={<p className="text-muted-foreground">{rich(w?.reason ?? e.reason)}</p>} />
                {w?.transition && <p className="mt-0.5 border-l-2 pl-2 italic">{rich(w.transition)}</p>}
              </li>
            );
          })}
        </ol>
        {set.weakSpot && <p className="text-xs text-muted-foreground">Weak spot: {rich(set.weakSpot.reason)}</p>}
        {!crowd && set.coverIdeas.length > 0 && (
          <div>
            <p className="font-medium">Cover ideas (pick one, keep the rest of your set)</p>
            <ul className="mt-1 space-y-1">
              {set.coverIdeas.map((c) => (
                <li key={c.artist}>
                  <strong className="font-semibold">{c.artist}</strong>: {c.angle}{" "}
                  <Hint text="why?">
                    fan data: {c.why}
                    {c.affinity !== undefined && `, affinity ${c.affinity}`}
                  </Hint>
                </li>
              ))}
            </ul>
          </div>
        )}
        {crowd && set.crowdWork.length > 0 && (
          <p>
            <span className="font-medium">Crowd-work topics:</span>{" "}
            {set.crowdWork.map((t, i) => (
              <span key={t}>
                {i > 0 && ", "}
                <strong className="font-semibold">{t}</strong>
              </span>
            ))}
          </p>
        )}
        {(advice.length > 0 || notes.length > 0) && (
          <p className="text-xs text-muted-foreground">
            {advice[0] ?? "Local rules apply on some topics."}{" "}
            <Hint text="why?">
              <ul className="list-disc space-y-1 pl-4">
                {advice.slice(1).map((a) => (
                  <li key={a}>{a}</li>
                ))}
                {notes.map((n) => (
                  <li key={n.source.url}>
                    {n.text}{" "}
                    <a href={n.source.url} target="_blank" rel="noreferrer" className="underline">
                      {n.source.title}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-1">{set.avoid?.disclaimer ?? GUIDANCE_NOTE}</p>
            </Hint>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          <Hint text="why?">
            <ul className="list-disc space-y-0.5 pl-4">
              {set.facts.map((f) => (
                <li key={f.name}>
                  <strong className="font-semibold">{f.name}</strong>: fan data, {f.detail}
                </li>
              ))}
              {(set.audience?.why ?? []).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {!!writing?.dropped && <p className="mt-1">{writing.dropped} written reason{writing.dropped > 1 ? "s" : ""} dropped: not backed by this city's fan data or on the avoid list.</p>}
          </Hint>
        </p>
      </CardContent>
    </Card>
  );
}
