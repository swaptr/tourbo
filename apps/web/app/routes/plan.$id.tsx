import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LoaderCircle, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useFetcher, useLocation, useNavigate, useNavigation } from "react-router";

import { formatMoney } from "~/components/city-card";
import { AssistantPanel } from "~/components/assistant/assistant-panel";
import { AssistButton, InsightLine, type TitleDraft } from "~/components/assist";
import { DecisionPrompts } from "~/components/assistant/decision-prompts";
import { Levers } from "~/components/assistant/levers";
import { Hint } from "~/components/hint";
import { PlanWorkspace } from "~/components/plan-workspace";
import { ErrorLine } from "~/components/state";
import { formatNumber } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { IdeasTuneSection } from "~/components/ideas/ideas-tune";
import { Skeleton } from "~/components/ui/skeleton";
import { ReadOnlyNote, useCanEdit } from "~/components/your-work";
import { LABELS } from "~/lib/labels";
import { keepOnViewChange } from "~/lib/plan-nav";
import { TAB_LABEL, TAB_PATH, dateRange, played, roadNight, shortDate, tabOf, type TourTab } from "~/lib/tour-tabs";
import { cn } from "~/lib/utils";
import { recordWork, rememberRun } from "~/lib/work";
import { startRun } from "../../server/agent/orchestrator.server";
import { runLimit } from "../../server/limits.server";
import { ownerHash } from "../../server/owner.server";
import { getRun, type RunStatus } from "../../server/agent/runs.server";
import { basePlan, changeEdits, editState, loadPool } from "@tourbo/core/runs/edits.server.ts";
import { nightExtras, tabCounts, type NightSetLine } from "../../server/agent/nights.server";
import { traceHistory } from "../../server/agent/trace.server";
import { db } from "@tourbo/core/db/client.server.ts";
import { syncTourNights } from "@tourbo/core/events/events.server.ts";
import { getEventSet } from "@tourbo/core/material/material.server.ts";
import { cityMetrics } from "@tourbo/core/engine/compare.ts";
import { preferences, preferredRooms, stopKey } from "@tourbo/core/engine/edit.ts";
import { basisLine } from "@tourbo/core/engine/basis.ts";
import { discipline, tabLabel, workspaceFor, workspaceTabs } from "@tourbo/core/disciplines/index.ts";
import { REGION_NAMES, TourParams, type Plan } from "@tourbo/core/shared/types.ts";
import { attachRun, createProject, projectOfRun } from "@tourbo/core/projects/projects.server.ts";
import { apiError } from "../../server/agent/errors";
import type { Route } from "./+types/plan.$id";

const UUID = /^[0-9a-f-]{36}$/i;
// Older saved plans may lack fields the basis line reads: no line beats a broken page.
const safe = <T,>(f: () => T) => {
  try {
    return f();
  } catch {
    return undefined;
  }
};
const today = () => new Date().toISOString().slice(0, 10);

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.run.artistName} tour — Tourbo` : "Tourbo" }];
}

// The tour workspace layout (surface brief "the tour book, open on the map"): the tour header, one
// row of tour tabs and, once the plan is done, the workspace itself (nights rail, map, night panel):
// its run candidates, edits and per-night saves load here once and stay while the tabs change.
// DB only: no fan-data or AI calls.
export async function loader({ params, request }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  const q = new URL(request.url).searchParams; // the Ideas context (?slot=&b=), for its counts and the night panel
  if (!run) throw new Response("Not found", { status: 404 });
  const done = Boolean(run.plan && run.status === "done");
  const [project, owner, counts, ws] = await Promise.all([
    // Projects are optional: a DB hiccup here never breaks the plan page.
    projectOfRun(run.id).catch(() => undefined),
    // Made with an owner key: only the browser holding it may edit (share links stay read-only).
    ownerHash("run", run.id).catch(() => null),
    run.plan ? tabCounts(run, q).catch(() => undefined) : undefined,
    done ? workspaceData(run, q) : undefined,
  ]);
  return {
    run: { id: run.id, artistName: run.artistName, params: run.params, status: run.status, plan: run.plan },
    basis: run.plan ? safe(() => basisLine(run.plan!)) : undefined,
    project,
    owned: Boolean(owner),
    counts,
    hasBaseline: Boolean(run.baseline),
    road: roadNight(run.plan, today()),
    ws,
  };
}

// Your plan, your call (PLAN Q19): the run's candidates (no fan-data calls), the act's edits and
// what's saved per night; the fan scores come from the run's own trace.
async function workspaceData(run: NonNullable<Awaited<ReturnType<typeof getRun>>>, q?: URLSearchParams) {
  const events = await traceHistory(run.id).catch(() => []);
  const [pool, state, base, nights, shows] = await Promise.all([loadPool(run, events).catch(() => undefined), editState(run.id), basePlan(run.id), nightExtras(run, q).catch(() => undefined), nightShows(run.id).catch((): Awaited<ReturnType<typeof nightShows>> => ({}))]);
  return {
    pool,
    edits: { version: state.version, count: state.edits.length, prefs: preferences(state.edits, state.dismissed) },
    baseProfit: base?.money?.profit,
    nights,
    scores: [...cityMetrics(events).scores],
    shows, // night key → its show (event) id, where a set from the Library is saved
  };
}

// Each tour night is a show (events.tour_id + stop_key); sync once if this tour has none yet.
async function nightShows(runId: string): Promise<Record<string, { id: string; set: NightSetLine[] }>> {
  const sql = await db();
  const read = () => sql<{ id: string; stop_key: string }[]>`select id, stop_key from events where tour_id = ${runId} and stop_key is not null`;
  let rows = await read();
  if (!rows.length) {
    await syncTourNights(runId);
    rows = await read();
  }
  const sets = await Promise.all(rows.map((r) => getEventSet(r.id).catch(() => [])));
  return Object.fromEntries(rows.map((r, i) => [r.stop_key, { id: r.id, set: sets[i].map((m) => ({ title: m.title, minutes: Math.round(m.lengthMin ?? 0), local: m.origin !== "original", details: m.details })) }]));
}

export const shouldRevalidate = keepOnViewChange;

// Plan-page edits (the root middleware has already checked the owner key): add to a project,
// drop a night, or re-plan with adjusted settings. Retry goes through /api/runs/:id/resume.
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
    } catch (error) {
      return apiError(error, "plan project", "Couldn't add it. Try again.");
    }
  }
  if (form.get("intent") === "drop") {
    const stop = run.plan?.stops[Number(form.get("stop"))];
    if (!stop) return { error: "Couldn't drop that night. Reload and try again." };
    const r = await changeEdits(run.id, { kind: "apply", edit: { op: "dropNight", night: stopKey(stop) } });
    return r.ok ? { ok: true } : { error: r.error };
  }
  if (form.get("intent") === "adjust") {
    const params = adjusted(run.params, form);
    if (!params.success) return { error: params.error.issues[0]?.message ? `Check the numbers: ${params.error.issues[0].message}.` : "Check the numbers and try again." };
    const limited = runLimit(request);
    if (limited) return { error: limited };
    const id = await startRun(params.data, { ownerFrom: run.id });
    const project = await projectOfRun(run.id).catch(() => undefined);
    if (project) await attachRun(project.id, id).catch(() => {});
    return { adjusted: id };
  }
  return { error: "Nothing to do." };
}

// Same request, with the fields the re-plan form changes.
function adjusted(params: TourParams, form: FormData) {
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v === "" ? undefined : Number(v);
  };
  const radius = num("radiusKm");
  return TourParams.safeParse({
    ...params,
    shows: num("shows") ?? params.shows,
    startDate: String(form.get("startDate") || params.startDate),
    endDate: undefined,
    roomMin: num("roomMin") ?? params.roomMin,
    roomMax: num("roomMax") ?? params.roomMax,
    area: params.area && radius ? { ...params.area, radiusKm: radius } : params.area,
    money: { ...params.money, ticketPrice: num("ticketPrice"), promoBudget: num("promoBudget"), minGuarantee: num("minGuarantee") },
  });
}

const STATUS: Record<RunStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Starting", variant: "outline" },
  running: { label: "Planning", variant: "outline" },
  done: { label: "Done", variant: "secondary" },
  failed: { label: "Didn't finish", variant: "destructive" },
  interrupted: { label: "Interrupted", variant: "destructive" },
};

type Data = Route.ComponentProps["loaderData"];
type Tab = { id: TourTab; badge?: ReactNode; note?: string; label?: string };

// The tour's tabs: only Plan while it's planning; then Plan · Ideas · Set · Notes · Booking with
// Numbers · Tickets · Compare under More. On the road, Tonight leads and Tickets takes Booking's
// slot. Tabs with nothing yet stay (their page says what they'll hold); counts are quiet badges.
function tourTabs({ run, counts, hasBaseline, road }: Data): { main: Tab[]; more: Tab[] } {
  const plan = run.plan;
  if (!plan || run.status !== "done") return { main: [{ id: "plan" }], more: [] };
  // Which tabs, their names and order come from the kind's workspace (disciplines/index.ts); a
  // kind tab (Covers, Crowd, Sales…) shows only when the plan or saved ideas have something for it.
  const w = workspaceFor(plan.artist.kind);
  const c = counts;
  const nights = plan.stops.filter(played).length;
  const e = c?.emails;
  const extra: Partial<Record<TourTab, Partial<Tab>>> = {
    ideas: { badge: c?.ideas || undefined, note: c?.ideas ? `${c.ideas} ideas across the tour` : undefined },
    set: { badge: c?.set ? `${Math.min(c.set, nights)}/${nights}` : undefined, note: c?.set ? `built for ${c.set} of ${nights} nights` : undefined },
    prep: { badge: c?.prep ? `${Math.min(c.prep, nights)}/${nights}` : undefined, note: c?.prep ? `notes for ${c.prep} of ${nights} nights` : undefined },
    pipeline: { badge: e?.replies ? `${e.replies} replied` : e?.drafts ? `${e.drafts} to send` : undefined },
  };
  const { main, more } = workspaceTabs(w, { plan, counts: c, hasBaseline, onRoad: road.onRoad });
  const tab = (id: TourTab): Tab => ({ id, label: tabLabel(w, id), ...extra[id] });
  return { main: main.map(tab), more: more.map(tab) };
}

export default function PlanLayout({ loaderData }: Route.ComponentProps) {
  const { run, ws } = loaderData;
  const plan = run.plan;
  const canEdit = useCanEdit(run.id, loaderData.owned);
  const location = useLocation();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const base = `/plan/${run.id}`;
  const here = location.pathname.replace(/\/$/, "");
  const tab = tabOf(here, base);
  const tabs = tourTabs(loaderData);
  const done = run.status === "done" && !!plan;
  // Another tab of this tour is loading: a skeleton in the main pane; header, tabs and nights stay.
  const next = navigation.state === "loading" ? navigation.location.pathname.replace(/\/$/, "") : undefined;
  const switching = !!next && next !== here && (next === base || next.startsWith(`${base}/`));

  // Tune (levers) is a view on top of the saved plan; it re-applies when the plan changes.
  const [tuned, setTuned] = useState<Plan>();
  useEffect(() => setTuned(undefined), [plan]);
  const view = tuned ?? plan ?? undefined;
  const scores = useMemo(() => new Map(ws?.scores ?? []), [ws?.scores]);

  // On the road, a phone opens on Tonight.
  useEffect(() => {
    if (loaderData.road.onRoad && done && tab === "plan" && !location.search.includes("night=") && window.matchMedia("(max-width: 639px)").matches) navigate(`${base}/tonight`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pane = switching ? <PaneSkeleton /> : <Outlet />;
  const workspace = done && view && ws && tab !== "tonight";

  // The workspace fills the viewport below whatever sits above it (top bar, notices), so the
  // page itself never scrolls at desktop sizes.
  const mainRef = useRef<HTMLElement>(null);
  const [above, setAbove] = useState(56);
  useEffect(() => {
    const measure = () => mainRef.current && setAbove(Math.round(mainRef.current.getBoundingClientRect().top + window.scrollY));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
  return (
    <main ref={mainRef} style={workspace ? ({ "--above": `${above}px` } as React.CSSProperties) : undefined} className={cn("w-full px-4 pt-4 pb-6 xl:px-6", workspace && "xl:flex xl:h-[calc(100dvh-var(--above,3.5rem))] xl:flex-col xl:pb-4")}>
      <TourHeader data={loaderData} view={view} tab={tab} canEdit={canEdit} onTuned={setTuned} />
      <TourTabs base={base} main={tabs.main} more={tabs.more} />
      {workspace ? (
        <PlanWorkspace
          runId={run.id}
          plan={view}
          tab={tab}
          pool={ws.pool}
          version={ws.edits.version}
          edits={ws.edits.count}
          prefs={ws.edits.prefs}
          baseProfit={ws.baseProfit}
          canEdit={canEdit}
          scores={scores}
          support={workspaceFor(plan.artist.kind).support && discipline(plan.artist.kind).support}
          nights={ws.nights}
          shows={ws.shows}
          prompts={canEdit ? <DecisionPrompts runId={run.id} plan={plan} /> : undefined}
          assistant={(close) => <AssistantPanel runId={run.id} plan={plan} onClose={close} className="h-full" />}
        >
          {pane}
        </PlanWorkspace>
      ) : (
        <div className="pt-4">{pane}</div>
      )}
    </main>
  );
}

// Compact tour header: serif act name, one meta line (dates · nights · from) with the one profit
// figure (its popover holds the breakdown and a chart), then Tune, the next step and More.
function TourHeader({ data, view, tab, canEdit, onTuned }: { data: Data; view?: Plan; tab: TourTab; canEdit: boolean; onTuned: (p: Plan) => void }) {
  const { run, counts, road } = data;
  const plan = run.plan;
  const base = `/plan/${run.id}`;
  const live = run.status === "pending" || run.status === "running";
  const done = run.status === "done" && !!plan;
  const status = STATUS[run.status];
  const dates = plan?.stops.filter(played).map((s) => s.date).filter((d): d is string => !!d).sort() ?? [];
  const shows = plan ? plan.stops.filter(played).length : run.params.shows;
  const from = run.params.homeBase ? `from ${run.params.homeBase}` : REGION_NAMES[run.params.region];
  const nights = shows;
  // The one next step (the only tomato on the Plan tab): notes, then booking; on the road, tonight.
  const nextStep = !done || !canEdit || tab !== "plan" ? undefined : road.onRoad ? { to: `${base}/tonight`, label: "Open tonight" } : (counts?.prep ?? 0) < nights ? { to: `${base}/prep`, label: "Write show notes" } : { to: `${base}/pipeline`, label: "Send booking emails" };
  const [replan, setReplan] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3">
      {plan?.artist.image && <img src={plan.artist.image} alt="" className="hidden size-11 rounded-lg object-cover sm:block" />}
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-x-2.5">
          <h1 className="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">{plan?.artist.name ?? run.artistName}</h1>
          {!done && (
            <Badge variant={status.variant}>
              {live && <LoaderCircle className="animate-spin" />}
              {status.label}
            </Badge>
          )}
          {done && !canEdit && <span className="text-xs text-muted-foreground">Shared plan</span>}
          {done && canEdit && (
            <AssistButton<TitleDraft>
              task="title"
              input={{ runId: run.id, ai: true }}
              scope={{ runId: run.id }}
              label="Name this tour"
              heading="A name for this tour"
              variant="ghost"
              size="sm"
              className="[&_svg]:text-foreground"
              keepLabel="Use this name"
              render={(d) => (
                <div className="space-y-1">
                  <p className="font-heading text-xl">{d.title}</p>
                  {d.alternatives.length > 0 && <p className="text-xs text-muted-foreground">Or: {d.alternatives.slice(0, 3).join(" · ")}</p>}
                </div>
              )}
              onKeep={(d) => recordWork({ id: run.id, kind: "plan", title: d.title, status: run.status })}
            />
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
          <span className="num">{dateRange(dates) ?? `starts ${shortDate(run.params.startDate)}`}</span>
          <span aria-hidden>·</span>
          <span className="num">
            {shows} {shows === 1 ? "night" : "nights"}
          </span>
          <span aria-hidden>·</span>
          <span>{from}</span>
          {view?.money && (
            <>
              <span aria-hidden>·</span>
              <MoneyFigure plan={view} base={base} />
            </>
          )}
          {/* One meta line: the basis in plain words; the fan facts behind "why?". */}
          {data.basis && (
            <>
              <span aria-hidden className="max-lg:hidden">·</span>
              <span className="min-w-0 max-w-80 truncate max-lg:hidden" title={data.basis} data-testid="basis-line">
                {data.basis}
              </span>
            </>
          )}
          {done && (
            <Hint text="why?" label="What the fan data says about this tour">
              <InsightLine runId={run.id} chips className="text-sm" fallback={<p className="text-sm">Each night's fan facts sit in its panel: pick a night, then "why?".</p>} />
            </Hint>
          )}
        </div>
      </div>
      {done && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontal /> Tune
            </PopoverTrigger>
            <PopoverContent keepMounted align="end" className="max-h-[calc(100dvh-7rem)] w-[min(34rem,calc(100vw-1rem))] overflow-y-auto p-4">
              {plan && <Levers runId={run.id} plan={plan} onChange={(t) => onTuned(t)} bare />}
              {tab === "ideas" && <IdeasTuneSection canEdit={canEdit} />}
            </PopoverContent>
          </Popover>
          {nextStep && (
            <Button size="sm" data-primary nativeButton={false} render={<Link to={nextStep.to} />}>
              {nextStep.label}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger ref={moreRef} render={<Button variant="ghost" size="icon-sm" aria-label="More tour actions" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-52">
              <DropdownMenuItem onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}${base}`)}>Copy share link</DropdownMenuItem>
              {canEdit && <DropdownMenuItem onClick={() => setReplan(true)}>Re-plan with new settings…</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <Menu.LinkItem closeOnClick render={<Link to="/start" />} className="flex cursor-default items-center rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground">
                {LABELS.planTour}
              </Menu.LinkItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canEdit && (
            <Popover open={replan} onOpenChange={setReplan}>
              <PopoverContent anchor={moreRef} align="end" className="w-[min(36rem,calc(100vw-1rem))] p-4">
                <Replan runId={run.id} title={plan?.artist.name ?? run.artistName} params={run.params} prefs={data.ws?.edits.prefs ?? []} />
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
      {done && !canEdit && tab === "plan" && <ReadOnlyNote what="plan" />}
    </header>
  );
}

// The header's one money figure; hover or click opens the breakdown: profit, ticket sales, costs and
// travel, a per-night profit chart, and the way to the full Numbers tab.
function MoneyFigure({ plan, base }: { plan: Plan; base: string }) {
  const m = plan.money!;
  const fmt = (n: number) => formatMoney(n, m.currency);
  const short = (n: number) => (Math.abs(n) >= 10_000 ? `${n < 0 ? "−" : ""}${fmt(Math.abs(n) / 1000).replace(/(\.\d)?$/, "")}k` : fmt(n));
  const nights = plan.stops.map((s, i) => ({ i, city: s.city.name, profit: s.money && played(s) ? s.money.profit : undefined }));
  const top = Math.max(1, ...nights.map((n) => Math.abs(n.profit ?? 0)));
  const losses = nights.some((n) => (n.profit ?? 0) < 0);
  const tiles = [
    { label: "Tour profit", value: fmt(m.profit), tone: m.profit >= 0 ? "text-success" : "text-destructive" },
    { label: "Ticket sales", value: fmt(m.gross) },
    { label: "Your costs", value: fmt(m.costs + (m.promoBudget ?? 0)) },
    { label: "Travel", value: `${formatNumber(plan.totalKm)} km` },
  ];
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        data-testid="tour-profit"
        data-value={Math.round(m.profit)}
        className={cn("num inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 font-medium underline decoration-dotted underline-offset-4 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", m.profit >= 0 ? "text-success" : "text-destructive")}
      >
        ~{short(m.profit)} profit
        <span className="sr-only"> (estimate; open the breakdown)</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1rem))] gap-3 p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {tiles.map((t) => (
            <div key={t.label}>
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className={cn("num font-heading text-2xl leading-tight", t.tone)}>{t.value}</dd>
            </div>
          ))}
        </dl>
        <figure className="space-y-1.5">
          <figcaption className="text-xs text-muted-foreground">Profit by night</figcaption>
          <div className="relative flex h-16 items-stretch gap-1" role="img" aria-label={nights.map((n) => `Night ${n.i + 1} ${n.city}: ${n.profit === undefined ? "dropped" : fmt(n.profit)}`).join("; ")}>
            {nights.map((n) => {
              const h = n.profit === undefined ? 0 : (Math.abs(n.profit) / top) * (losses ? 50 : 100);
              return (
                <div key={n.i} className="relative flex-1" title={`${n.i + 1}. ${n.city}: ${n.profit === undefined ? "dropped" : fmt(n.profit)}`}>
                  <span
                    className={cn("absolute inset-x-0 rounded-[3px]", n.profit === undefined ? "bg-muted" : n.profit >= 0 ? "bg-[var(--viz-2)]" : "bg-destructive/70")}
                    style={losses ? (n.profit !== undefined && n.profit < 0 ? { top: "50%", height: `${h}%` } : { bottom: "50%", height: `${Math.max(h, 2)}%` }) : { bottom: 0, height: `${Math.max(h, 3)}%` }}
                  />
                </div>
              );
            })}
            <span className={cn("pointer-events-none absolute inset-x-0 h-px bg-border", losses ? "top-1/2" : "bottom-0")} aria-hidden />
          </div>
          <div className="flex gap-1 text-xs text-muted-foreground" aria-hidden>
            {nights.map((n) => (
              <span key={n.i} className="num flex-1 truncate text-center">
                {n.i + 1}
              </span>
            ))}
          </div>
        </figure>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            All estimates
            <Hint text="why?" label="How the money is estimated">
              Your typical draw, scaled by fan demand in each city, with regional costs. Room sizes are estimates too.
            </Hint>
          </span>
          <Button size="xs" variant="outline" nativeButton={false} render={<Link to={`${base}/insights`} />}>
            All the numbers
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Tour tabs: links (deep-linkable, active = URL path) that keep ?night. "More" sits outside the
// scroller so it's always reachable; on a phone only the first four show and the rest move into
// More, so no label is ever clipped.
function TourTabs({ base, main, more }: { base: string; main: Tab[]; more: Tab[] }) {
  const { pathname, search } = useLocation();
  const night = new URLSearchParams(search).get("night");
  const keep = night ? `?night=${night}` : "";
  const here = pathname.replace(/\/$/, "");
  const PHONE = 4;
  const overflow = main.slice(PHONE);
  const activeMore = more.find((t) => here === base + TAB_PATH[t.id]);
  const activeOverflow = overflow.find((t) => here === base + TAB_PATH[t.id]);
  const tabClass = (active: boolean) =>
    cn(
      "-mb-px inline-flex h-8 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-sm whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
      active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
    );
  const item = (t: Tab, active: boolean, className?: string) => (
    <Menu.LinkItem
      key={t.id}
      closeOnClick
      render={<Link to={`${base}${TAB_PATH[t.id]}${keep}`} />}
      className={cn("flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground", active && "font-medium", className)}
    >
      {t.label ?? TAB_LABEL[t.id]}
      {t.badge !== undefined && (
        <Badge variant="secondary" className="num ml-auto h-4 px-1.5 text-xs">
          {t.badge}
        </Badge>
      )}
    </Menu.LinkItem>
  );
  const moreActive = activeMore ?? activeOverflow;
  return (
    <nav aria-label="Tour" className="flex shrink-0 items-end border-b">
      <div className="flex min-w-0 flex-1">
        {main.map((t, i) => (
          <NavLink
            key={t.id}
            to={`${base}${TAB_PATH[t.id]}${keep}`}
            end
            className={({ isActive }) => cn(tabClass(isActive), i >= PHONE && "max-sm:hidden")}
            aria-describedby={t.note ? `tab-note-${t.id}` : undefined}
          >
            {t.label ?? TAB_LABEL[t.id]}
            {t.badge !== undefined && (
              <span aria-hidden title={t.note} className="num rounded-full bg-muted px-1.5 text-xs leading-4 font-normal text-muted-foreground max-sm:hidden">
                {t.badge}
              </span>
            )}
            {t.note && (
              <span id={`tab-note-${t.id}`} hidden>
                {t.note}
              </span>
            )}
          </NavLink>
        ))}
      </div>
      {(more.length > 0 || overflow.length > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={cn(tabClass(!!moreActive), !activeMore && activeOverflow && "sm:border-transparent sm:font-normal sm:text-muted-foreground")} />}>
            {activeMore ? (activeMore.label ?? TAB_LABEL[activeMore.id]) : activeOverflow ? <span className="sm:hidden">{activeOverflow.label ?? TAB_LABEL[activeOverflow.id]}</span> : null}
            {!activeMore && <span className={cn(activeOverflow && "max-sm:hidden")}>More</span>}
            <ChevronDown className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            {overflow.map((t) => item(t, t === activeOverflow, "sm:hidden"))}
            {overflow.length > 0 && <DropdownMenuSeparator className="sm:hidden" />}
            {more.map((t) => item(t, t === activeMore))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}

// More → "Re-plan with new settings": change the circle, nights, room size, dates or money and
// make a new plan (this one stays). Posts to this layout route (intent "adjust").
function Replan({ runId, title, params, prefs }: { runId: string; title: string; params: TourParams; prefs: { id: string; text: string }[] }) {
  // A noticed preference (PLAN Q19) nudges the room range, shown so the act can change it back.
  const rooms = preferredRooms(prefs as Parameters<typeof preferredRooms>[0], params.roomMin, params.roomMax);
  const nudged = rooms.roomMin !== params.roomMin || rooms.roomMax !== params.roomMax;
  const f = useFetcher<{ error?: string; adjusted?: string }>();
  const navigate = useNavigate();
  // The new plan shares this one's owner key; remember it in this browser, then open it.
  useEffect(() => {
    if (!f.data?.adjusted) return;
    rememberRun(f.data.adjusted, `${title} tour`, runId);
    navigate(`/plan/${f.data.adjusted}`);
  }, [f.data?.adjusted]);
  const busy = f.state !== "idle";
  const field = "grid gap-1 text-xs text-muted-foreground";
  return (
    <f.Form method="post" action={`/plan/${runId}`} className="grid gap-3 sm:grid-cols-3" data-testid="adjust-panel">
      <p className="text-sm font-medium sm:col-span-full">Re-plan with new settings</p>
      <input type="hidden" name="intent" value="adjust" />
      {params.area && (
        <label className={field}>
          Circle size (km)
          <Input name="radiusKm" type="number" min={50} max={5000} step={50} defaultValue={params.area.radiusKm} />
        </label>
      )}
      <label className={field}>
        Shows
        <Input name="shows" type="number" min={2} max={20} defaultValue={params.shows} />
      </label>
      <label className={field}>
        Start date
        <Input name="startDate" type="date" defaultValue={params.startDate} />
      </label>
      <label className={field}>
        Smallest room
        <Input name="roomMin" type="number" min={1} defaultValue={rooms.roomMin} />
      </label>
      <label className={field}>
        Biggest room
        <Input name="roomMax" type="number" min={1} defaultValue={rooms.roomMax} />
      </label>
      <label className={field}>
        Ticket price
        <Input name="ticketPrice" type="number" min={1} placeholder="best" defaultValue={params.money?.ticketPrice} />
      </label>
      <label className={field}>
        Promo budget
        <Input name="promoBudget" type="number" min={0} defaultValue={params.money?.promoBudget} />
      </label>
      <label className={field}>
        Lowest fee a show
        <Input name="minGuarantee" type="number" min={0} defaultValue={params.money?.minGuarantee} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-full">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />} Re-plan
        </Button>
        <span className="text-xs text-muted-foreground">
          Makes a new plan; this one stays.
          {nudged && ` Room sizes follow what Tourbo noticed (${prefs.find((p) => p.id.endsWith("_rooms"))?.text}).`}
        </span>
        <ErrorLine message={f.data?.error} />
      </div>
    </f.Form>
  );
}

function PaneSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
