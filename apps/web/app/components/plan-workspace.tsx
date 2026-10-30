import { ArrowDown, ArrowUp, ArrowLeftRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, LoaderCircle, MessageCircle, Plus, RotateCcw, Sparkles, Store, Ticket, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useRevalidator, useSearchParams } from "react-router";

import { applyEdit, cityOptions, diff, nearbyVenues, rankWithPrefs, stopKey, venueOptions, type Edit, type Pool, type Preference } from "@tourbo/core/engine/edit.ts";
import { dealItems, nightItems } from "@tourbo/core/engine/explain-facts.ts";
import type { CityPlan, Plan } from "@tourbo/core/shared/types.ts";
import type { NightExtras, NightSetLine } from "../../server/agent/nights.server";
import { fromMoves, SetRowMeta, SetShape } from "~/components/kind-tabs/set-shape";
import { CityCard, formatMoney } from "~/components/city-card";
import { Hint } from "~/components/hint";
import { useInertOutside } from "~/lib/a11y";
import { Insight } from "~/components/insight";
import { ErrorLine } from "~/components/state";
import { formatNumber } from "~/components/trace";
import { rampClass } from "~/components/why-compare";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceMap, type MapPick } from "~/components/workspace-map";
import { NightSetAssist } from "~/components/night-set-assist";
import { forgetRowInsight } from "~/components/assist";
import { ownerHeaders } from "~/lib/work";
import { PLAN_CHANGED } from "~/components/assistant/store";
import { nightTabLabel, tabLabel, workspaceFor, type Workspace } from "@tourbo/core/disciplines/index.ts";
import { PREP_LABEL, PREP_ORDER, TAB_PATH, panelFor, played, shortDate, type NightTab, type TourTab } from "~/lib/tour-tabs";
import { announceNight, onPickNight } from "~/lib/plan-nav";
import { NightIdeas } from "~/components/ideas/night-ideas";
import { cn } from "~/lib/utils";

// The tour workspace (surface brief "the tour book, open on the map"; PLAN Q19 + Q21).
// Desktop (≥1280): nights rail · the tour tab's main pane · the selected night's panel, all inside
// one viewport. The map is the main pane on Plan and a mini-map over the rail on every other tab
// (same map instance: only its grid area changes). Phone/tablet: map strip, nights list (chips on
// the other tabs), and the night panel as a full-height sheet with the same tabs. Picking a night
// (rail, map or arrow keys) flies the map there and keeps the panel's tab, which follows the tour
// tab (Ideas → this night's ideas) unless ?panel= says otherwise. Edits: a confirm card shows what a
// swap does to money, fans and travel; Undo / Reset bring Tourbo's plan back.

type Pending = { edit: Edit; title: string; deltas: { profit: number; km: number; fans?: number }; focus?: { type: "city"; name: string } | { type: "venue"; id: string } };

export type WorkspaceProps = {
  runId: string;
  plan: Plan;
  pool?: Pool;
  version: number;
  edits: number;
  prefs: Preference[];
  baseProfit?: number; // Tourbo's own plan, for "vs Tourbo's plan"
  canEdit: boolean;
  scores: Map<string, number>;
  support: string | false; // the support act's name ("opener"), false when the kind has none
  tab: TourTab;
  prompts?: ReactNode; // Tourbo's questions, above the Ask composer
  assistant?: (close: () => void) => ReactNode; // the Ask Tourbo chat, docked at the panel's foot
  nights?: NightExtras; // what's saved per night (ideas, set, show notes), by index
  shows?: Record<string, { id: string; set: NightSetLine[] }>; // night key → its show and Library set
  children?: ReactNode; // the tour tab's main pane
};

// Test hook (data-verdict): within 2% of the gross (min 10) counts as break-even.
const moneyVerdict = (s: CityPlan) => {
  const m = s.money;
  if (!m) return undefined;
  return Math.abs(m.profit) <= Math.max(10, 0.02 * m.gross) ? "break-even" : m.profit > 0 ? "profit" : "loss";
};
const compact = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches;

export function PlanWorkspace(props: WorkspaceProps) {
  const { runId, plan, pool, canEdit, tab } = props;
  const onPlan = tab === "plan";
  const currency = plan.money?.currency ?? plan.stops.find((s) => s.money)?.money?.currency ?? "USD";
  const fmt = (n: number) => formatMoney(n, currency);
  const signed = (n: number) => (n === 0 ? "±0" : `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`);
  const [search, setSearch] = useSearchParams();
  const [selected, setSelected] = useState<string | undefined>(() => {
    const s = plan.stops[Number(search.get("night")) - 1] ?? plan.stops.find(played);
    return s && stopKey(s);
  });
  const panelParam = search.get("panel") as NightTab | null;
  const ws = workspaceFor(plan.artist.kind); // the night panel's tabs and names for this kind
  const panel: NightTab = panelParam && ws.night.includes(panelParam) ? panelParam : panelFor(tab);
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Preference>();
  const [sheet, setSheet] = useState(false); // phone / tablet: the night panel as a sheet
  const sheetRef = useRef<HTMLElement>(null);
  useInertOutside(sheetRef, sheet && compact()); // the open sheet is modal: Tab stays inside it
  const [asking, setAsking] = useState(false); // Ask Tourbo opened into the taller chat
  const revalidator = useRevalidator();
  const railRef = useRef<HTMLOListElement>(null);
  // Ask Tourbo / Tourbo's questions applied or undid something: drop any open confirm, reframe the map.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ runId?: string }>).detail?.runId && (e as CustomEvent<{ runId?: string }>).detail.runId !== runId) return;
      setPending(undefined);
      setTick((n) => n + 1);
    };
    window.addEventListener(PLAN_CHANGED, on);
    return () => window.removeEventListener(PLAN_CHANGED, on);
  }, [runId]);

  // A night that changed key (its city or room was swapped) stays selected at the same position.
  const lastIndex = useRef(0);
  useEffect(() => {
    const i = plan.stops.findIndex((s) => stopKey(s) === selected);
    if (i >= 0) lastIndex.current = i;
    else if (plan.stops.length) setSelected(stopKey(plan.stops[Math.min(lastIndex.current, plan.stops.length - 1)]));
  }, [plan, selected]);

  const ctx = useMemo(() => (pool ? { pool } : undefined), [pool]);
  const cityOpts = useMemo(() => (ctx && selected ? cityOptions(plan, selected, ctx, props.prefs) : []), [plan, selected, ctx, props.prefs]);
  const venueOpts = useMemo(() => (ctx && selected ? rankWithPrefs(venueOptions(plan, selected, ctx).map((o) => ({ ...o, km: 0, fans: 1 })), props.prefs) : []), [plan, selected, ctx, props.prefs]);
  const why = useMemo(() => nightItems(plan, props.scores), [plan, props.scores]);
  const deals = useMemo(() => dealItems(plan), [plan]);
  const selIndex = plan.stops.findIndex((s) => stopKey(s) === selected);
  const sel = selIndex >= 0 ? plan.stops[selIndex] : undefined;
  const best = Math.max(...plan.stops.filter(played).map((x) => x.score));
  // A night with no room (a city the run didn't check rooms in): rooms the run found close by.
  const nearby = useMemo(
    () =>
      ctx && sel && !sel.venue
        ? nearbyVenues(ctx.pool, sel.city)
            .slice(0, 5)
            .map((n) => ({ ...n, profit: diff(plan, applyEdit(plan, { op: "swapVenue", night: stopKey(sel), venueId: n.venue.id }, ctx).plan).totals.profit }))
        : [],
    [ctx, sel, plan],
  );
  const [menu, setMenu] = useState<"city" | "room">();

  // The selected night (and an explicit panel tab) live in the URL (replace, no reload), so switching
  // tour tabs keeps them. The layout's shouldRevalidate skips loaders for these params.
  const setView = (night: number | undefined, nextPanel: NightTab) => {
    const want = { night: night ? String(night) : null, panel: nextPanel === panelFor(tab) ? null : nextPanel };
    if (search.get("night") === want.night && search.get("panel") === want.panel) return;
    setSearch(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(want)) v ? p.set(k, v) : p.delete(k);
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  useEffect(() => {
    if (selIndex >= 0) setView(selIndex + 1, panel);
    if (selIndex >= 0) announceNight(selIndex + 1);
  }, [selIndex]);
  // The URL picked another night (a link in the main pane, back/forward): follow it.
  const urlNight = Number(search.get("night"));
  useEffect(() => {
    const s = plan.stops[urlNight - 1];
    if (s && urlNight !== selIndex + 1) setSelected(stopKey(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlNight]);

  // A night (and idea category) picked in the main pane (the Ideas tab's tour grid).
  const [focus, setFocus] = useState<string>();
  useEffect(
    () =>
      onPickNight(({ night, category, open }) => {
        const s = plan.stops[night - 1];
        if (!s) return;
        setFocus(category);
        choose(stopKey(s), open);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan],
  );
  const choose = (key: string, open = true) => {
    setSelected(key);
    setPending(undefined);
    setMenu(undefined);
    if (open && compact() && tab !== "prep") setSheet(true);
  };
  const step = (by: number, focus = false) => {
    const n = plan.stops.length;
    if (!n) return;
    const i = ((selIndex < 0 ? 0 : selIndex) + by + n) % n;
    choose(stopKey(plan.stops[i]), false);
    if (focus) requestAnimationFrame(() => railRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus());
  };
  const onRailKey = (e: ReactKeyboardEvent) => {
    const horizontal = !onPlan && compact();
    const prev = horizontal ? "ArrowLeft" : "ArrowUp";
    const next = horizontal ? "ArrowRight" : "ArrowDown";
    if (e.key === prev || e.key === next) {
      e.preventDefault();
      step(e.key === next ? 1 : -1, true);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      step(e.key === "Home" ? -selIndex : plan.stops.length - 1 - selIndex, true);
    }
  };

  // Esc: the chat first, then the sheet. Popovers and menus close themselves before this sees it.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (asking) setAsking(false);
      else if (pending) setPending(undefined);
      else if (sheet) setSheet(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [asking, sheet, pending]);
  // The sheet covers the page on phones: no page scroll behind it.
  useEffect(() => {
    if (!sheet || !compact()) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/plan/${runId}/edits`, { method: "POST", headers: { "Content-Type": "application/json", ...ownerHeaders(runId) }, body: JSON.stringify({ ...body, version: props.version }) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; notice?: Preference };
      if (!res.ok) {
        setError(out.error ?? "That change didn't save. Try again in a moment.");
        return;
      }
      setPending(undefined);
      setNotice(out.notice);
      forgetRowInsight(runId);
      await revalidator.revalidate();
      window.dispatchEvent(new CustomEvent("tourbo:edits", { detail: { runId } }));
    } catch {
      setError("That change didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const apply = (edit: Edit) => send({ action: "apply", edit });

  const askCity = (name: string, venueId?: string) => {
    if (!sel || !canEdit) return;
    const o = cityOpts.find((c) => c.city.name === name);
    if (!o) return;
    const edit: Edit = { op: "swapCity", night: stopKey(sel), city: name, ...(venueId ? { venueId } : {}) };
    const d = venueId && ctx ? diff(plan, applyEdit(plan, edit, ctx).plan).totals : { profit: o.profit, km: o.km };
    setPending({ edit, title: `Swap night ${selIndex + 1} to ${name}`, deltas: { profit: d.profit, km: d.km, fans: o.fans }, focus: venueId ? { type: "venue", id: venueId } : { type: "city", name } });
  };
  const askVenue = (id: string) => {
    if (!sel || !canEdit) return;
    const o = venueOpts.find((v) => v.venue.id === id);
    const n = !o ? nearby.find((v) => v.venue.id === id) : undefined;
    if (n) return setPending({ edit: { op: "swapVenue", night: stopKey(sel), venueId: id }, title: `Play ${n.venue.name} (${n.city}) on night ${selIndex + 1}`, deltas: { profit: n.profit, km: 0 }, focus: { type: "venue", id } });
    if (!o || o.current) return;
    setPending({ edit: { op: "swapVenue", night: stopKey(sel), venueId: id }, title: `Play ${o.venue.name} on night ${selIndex + 1}`, deltas: { profit: o.profit, km: 0 }, focus: { type: "venue", id } });
  };
  const onPick = (p: MapPick) => {
    if (p.type === "night") {
      choose(p.key, !onPlan || compact());
      railRef.current?.querySelector(`[data-night="${CSS.escape(p.key)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      return;
    }
    if (!onPlan) return; // the mini-map only picks nights
    if (p.type === "city") return askCity(p.name);
    if (sel && (p.city === sel.city.name || nearby.some((n) => n.venue.id === p.id))) return askVenue(p.id);
    const night = plan.stops.find((s) => played(s) && s.city.name === p.city);
    if (night) return choose(stopKey(night), false);
    askCity(p.city, p.id);
  };

  const vsTourbo = props.baseProfit !== undefined && plan.money ? plan.money.profit - props.baseProfit : undefined;
  const extras = props.nights;

  const confirm = (className: string) =>
    pending && (
      <div className={cn("space-y-2 bg-popover p-4 ring-1 ring-border", className)} role="dialog" aria-label={pending.title} data-testid="confirm-edit">
        <p className="font-medium">{pending.title}?</p>
        <p className="flex flex-wrap gap-x-3 text-sm" data-testid="plan-diff">
          <span className={cn("num font-semibold", pending.deltas.profit >= 0 ? "text-success" : "text-destructive")}>{signed(pending.deltas.profit)} tour profit</span>
          {pending.deltas.fans !== undefined && <span className="text-muted-foreground">fans {pending.deltas.fans}×</span>}
          {pending.deltas.km !== 0 && <span className="num text-muted-foreground">{pending.deltas.km > 0 ? "+" : "−"}{formatNumber(Math.abs(pending.deltas.km))} km</span>}
        </p>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => apply(pending.edit)}>
            {busy && <LoaderCircle className="animate-spin" />} {pending.edit.op === "swapVenue" ? "Use this room" : "Swap"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending(undefined)}>
            Cancel
          </Button>
        </div>
        <ErrorLine message={error} />
      </div>
    );

  const railFoot = (
    <div className="space-y-2">
      {canEdit && props.edits > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/60 px-2.5 py-2 text-xs" data-testid="edit-bar">
          <p>
            {props.edits} change{props.edits > 1 ? "s" : ""}
            {vsTourbo !== undefined && (
              <span className="text-muted-foreground">
                {" "}
                · <span className={cn("num font-medium", vsTourbo >= 0 ? "text-success" : "text-destructive")}>{signed(vsTourbo)}</span> vs Tourbo's plan
              </span>
            )}
          </p>
          <span className="flex flex-wrap gap-1">
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => send({ action: "undo" })}>
              <Undo2 /> Undo
            </Button>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => send({ action: "reset" })}>
              <RotateCcw /> Reset
            </Button>
          </span>
        </div>
      )}
      {canEdit && (notice ?? props.prefs[0]) && <Noticed pref={notice ?? props.prefs[0]} fresh={!!notice} busy={busy} onUndo={(id) => send({ action: "dismiss", pref: id })} />}
      {!pending && <ErrorLine message={error} />}
      {canEdit && ctx && <AddNight plan={plan} ctx={ctx} busy={busy} signed={signed} prefs={props.prefs} onAdd={(city) => apply({ op: "addNight", city })} />}
    </div>
  );

  const chips = !onPlan; // phone / tablet on a non-Plan tab: nights as a chip strip

  return (
    <div
      data-testid="plan-workspace"
      data-tab={tab}
      className={cn(
        "flex flex-col gap-3 xl:grid xl:min-h-0 xl:flex-1 xl:grid-cols-[15rem_minmax(0,1fr)_24rem] xl:gap-4",
        onPlan ? "xl:grid-rows-[minmax(0,1fr)_auto] xl:[grid-template-areas:'rail_map_panel'_'rail_main_panel']" : "xl:grid-rows-[9rem_minmax(0,1fr)] xl:[grid-template-areas:'map_main_panel'_'rail_main_panel']",
      )}
    >
      <section aria-label="Tour map" className={cn("relative overflow-hidden rounded-xl ring-1 ring-border xl:[grid-area:map]", onPlan ? "h-[30vh] min-h-44 xl:h-auto xl:min-h-0" : "hidden xl:block")}>
        <WorkspaceMap plan={plan} pool={pool} selected={selected} cityOptions={onPlan ? cityOpts : []} venueOptions={onPlan ? venueOpts : []} focus={pending?.focus} fmt={fmt} onPick={onPick} reframe={tick} mini={!onPlan} />
      </section>

      <nav aria-label="Nights" className={cn("min-w-0 xl:flex xl:min-h-0 xl:flex-col xl:gap-3 xl:[grid-area:rail]", chips && "max-xl:-mx-4")}>
        <ol
          ref={railRef}
          aria-busy={busy}
          onKeyDown={onRailKey}
          className={cn(
            "xl:min-h-0 xl:flex-1 xl:space-y-1 xl:overflow-y-auto xl:p-0.5",
            chips ? "relative flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] xl:block xl:px-0.5" : "space-y-1.5",
          )}
        >
          {plan.stops.map((s, i) => (
            <NightRow key={`${stopKey(s)}-${i}`} stop={s} index={i} on={stopKey(s) === selected} chip={chips} best={played(s) && s.score === best} fmt={fmt} panel={panelParam} onPick={() => choose(stopKey(s))} />
          ))}
        </ol>
        <div className={cn("pt-3 xl:pt-0", chips && "max-xl:hidden")}>{railFoot}</div>
      </nav>

      <div className={cn("@container min-w-0 xl:[grid-area:main]", !onPlan && "xl:min-h-0 xl:overflow-y-auto xl:pr-1")} data-testid="tour-pane">
        {props.children}
      </div>

      {confirm("fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl shadow-2xl xl:hidden")}

      {sheet && <div className="fixed inset-0 z-40 bg-foreground/20 max-md:hidden xl:hidden" aria-hidden data-inert-keep onClick={() => setSheet(false)} />}
      <aside
        ref={sheetRef}
        tabIndex={-1}
        aria-label={sel ? `Night ${selIndex + 1}: ${sel.city.name}` : "Night"}
        data-open={sheet || undefined}
        className={cn(
          "flex min-h-0 flex-col overflow-hidden bg-card ring-1 ring-border outline-none",
          // Phone: full-height sheet from below; tablet: from the right; desktop: the third column.
          "max-xl:fixed max-xl:inset-0 max-xl:z-50 md:max-xl:left-auto md:max-xl:w-[26rem] md:max-xl:shadow-2xl",
          sheet ? "max-xl:animate-in max-xl:duration-200 max-xl:ease-out max-xl:fade-in-0 max-xl:slide-in-from-bottom-12 md:max-xl:slide-in-from-right-12 md:max-xl:slide-in-from-bottom-0 motion-reduce:animate-none" : "max-xl:hidden",
          "xl:rounded-xl xl:[grid-area:panel]",
        )}
      >
        {sel && (
          <>
            <header className="flex items-start gap-2 border-b px-3 pt-3 pb-2.5">
              <NightNumber index={selIndex} stop={sel} className="mt-0.5 size-7 text-sm" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-heading text-xl leading-tight">{sel.city.name}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {shortDate(sel.date, true)}
                  {sel.venue ? ` · ${sel.venue.name}` : ""}
                  {!played(sel) && " · dropped"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {tab !== "tonight" && played(sel) && (
                  <Button size="icon-sm" variant="ghost" aria-label="Show day: this night on one page" title="Show day" nativeButton={false} render={<Link to={`/plan/${runId}${TAB_PATH.tonight}?night=${selIndex + 1}`} />}>
                    <Ticket />
                  </Button>
                )}
                <Button size="icon-sm" variant="ghost" aria-label="Previous night" aria-keyshortcuts="ArrowUp" disabled={plan.stops.length < 2} onClick={() => step(-1)}>
                  <ChevronLeft />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Next night" aria-keyshortcuts="ArrowDown" disabled={plan.stops.length < 2} onClick={() => step(1)}>
                  <ChevronRight />
                </Button>
                <Button size="icon-sm" variant="ghost" className="xl:hidden" aria-label="Close" aria-keyshortcuts="Escape" onClick={() => setSheet(false)}>
                  <X />
                </Button>
              </div>
            </header>
            <div className="hidden xl:block">{confirm("rounded-none border-b ring-0")}</div>
            <div data-selected-night={stopKey(sel)} className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col">
                <NightPanel
                  ws={ws}
                  kind={plan.artist.kind ?? "musician"}
                  currency={currency}
                  build={tab !== "set"}
                  runId={runId}
                  index={selIndex}
                  stop={sel}
                  panel={panel}
                  onPanel={(p) => setView(selIndex + 1, p)}
                  extras={extras}
                  focus={focus}
                  show={props.shows?.[stopKey(sel)]}
                  canEdit={canEdit}
                  busy={busy}
                  venue={
                    <CityCard
                      stop={sel}
                      index={selIndex}
                      support={props.support}
                      best={played(sel) && sel.score === best}
                      bare
                      why={why[selIndex] && <Insight item={why[selIndex]} runId={runId} />}
                      dealWhy={deals.find((d) => d.id === `deal:${selIndex}`) && <Insight item={deals.find((d) => d.id === `deal:${selIndex}`)!} runId={runId} why={false} />}
                      noRoom={
                        !sel.venue && played(sel) ? (
                          <NoRoom
                            city={sel.city.name}
                            rooms={venueOpts.filter((v) => !v.current).map((v) => ({ id: v.venue.id, title: v.venue.name, sub: `${v.venue.roomType} · ~${formatNumber(v.capacity)}`, delta: v.profit }))}
                            nearby={nearby.map((n) => ({ id: n.venue.id, title: n.venue.name, sub: `${n.city} · ${n.km} km away · ~${formatNumber(n.venue.capacity)}`, delta: n.profit }))}
                            canEdit={canEdit}
                            busy={busy}
                            signed={signed}
                            onPick={askVenue}
                            onChange={cityOpts.length ? () => setMenu("city") : undefined}
                          />
                        ) : undefined
                      }
                      footer={
                        <NightControls
                          menu={menu}
                          setMenu={setMenu}
                          stop={sel}
                          index={selIndex}
                          count={plan.stops.length}
                          canEdit={canEdit}
                          busy={busy}
                          fmt={fmt}
                          signed={signed}
                          cityOpts={cityOpts}
                          venueOpts={venueOpts}
                          onCity={(name) => askCity(name)}
                          onVenue={askVenue}
                          onEdit={apply}
                        />
                      }
                    />
                  }
                />
              </div>
            </div>
            {props.assistant && (
              <AskDock city={sel.city.name} open={asking} onOpen={setAsking} prompts={props.prompts}>
                {props.assistant(() => setAsking(false))}
              </AskDock>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function NightNumber({ index, stop, className }: { index: number; stop: CityPlan; className?: string }) {
  // Ink circles; "your pick" is the outlined one. Tomato is kept for the selection ring.
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        !played(stop) ? "bg-muted text-muted-foreground" : stop.yours ? "bg-background text-foreground ring-1 ring-foreground" : "bg-foreground text-background",
        className,
      )}
      aria-hidden
    >
      {index + 1}
    </span>
  );
}

// One night in the rail: number, city, date · room, a fan-ramp tick, the night's money. The rows are
// links (?night=N) so a click before the script loads still opens the night; after that, no reload.
// Arrow keys move between nights (roving focus: only the selected row is in the tab order).
function NightRow({ stop: s, index: i, on, chip, best, fmt, panel, onPick }: { stop: CityPlan; index: number; on: boolean; chip: boolean; best: boolean; fmt: (n: number) => string; panel: string | null; onPick: () => void }) {
  const money = s.money && played(s) ? s.money.profit : undefined;
  return (
    <li id={`night-${i + 1}`} data-night={stopKey(s)} data-testid="night" className={cn("scroll-m-2", chip && "shrink-0 xl:shrink")}>
      <a
        href={`?night=${i + 1}${panel ? `&panel=${panel}` : ""}`}
        data-index={i}
        data-testid="night-row"
        data-verdict={moneyVerdict(s)}
        tabIndex={on ? 0 : -1}
        aria-current={on ? "true" : undefined}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onPick();
        }}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg text-left text-sm ring-1 transition-[background-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          chip ? "h-8 px-2 xl:h-auto xl:w-full xl:px-2.5 xl:py-2" : "w-full px-2.5 py-2",
          on ? "bg-card ring-2 ring-foreground" : "ring-border hover:bg-card",
          // Skipped: muted text, never faded (faded text fails 1.4.3).
          !played(s) && "text-muted-foreground [&_.text-success]:text-muted-foreground [&_.text-destructive]:text-muted-foreground",
        )}
      >
        <NightNumber index={i} stop={s} />
        <span className={cn("min-w-0", !chip && "flex-1", chip && "xl:flex-1")}>
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{s.city.name}</span>
            {best && <span className="sr-only">(strongest fans)</span>}
          </span>
          <span className={cn("truncate text-xs text-muted-foreground", chip ? "hidden xl:block" : "block")}>
            {shortDate(s.date, true)}
            {!played(s) ? " · dropped" : s.venue ? ` · ${s.venue.name}` : ""}
          </span>
          <span className={cn("mt-1 h-1 w-full overflow-hidden rounded-full bg-muted", chip ? "hidden xl:block" : "block")} title={`Fans ${s.score} of 100`} aria-hidden>
            <span className={cn("block h-full origin-left rounded-full", rampClass(s.score))} style={{ transform: `scaleX(${Math.max(0.04, s.score / 100)})` }} />
          </span>
        </span>
        {money !== undefined && <span className={cn("num shrink-0 text-xs font-semibold", money >= 0 ? "text-success" : "text-destructive", chip && "hidden xl:inline")}>{fmt(money)}</span>}
      </a>
    </li>
  );
}

// Ask Tourbo, docked at the night panel's foot: Tourbo's questions and a composer-looking button;
// opening it grows the dock into the chat (Esc or the chevron folds it back).
function AskDock({ city, open, onOpen, prompts, children }: { city: string; open: boolean; onOpen: (o: boolean) => void; prompts?: ReactNode; children: ReactNode }) {
  // Focus follows the dock: into the composer on open, back to the Ask button on close (2.4.3).
  const dock = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    const id = requestAnimationFrame(() => dock.current?.querySelector<HTMLElement>(open ? "textarea, input:not([type=hidden]), button, [href]" : "[data-ask-open]")?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);
  return (
    <div ref={dock} className={cn("flex shrink-0 flex-col border-t bg-card transition-[height] duration-200 ease-out motion-reduce:transition-none", open ? "h-[65%]" : "h-auto")} data-testid="ask-dock">
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">{children}</div>
      ) : (
        <div className="space-y-2 p-3">
          {prompts && <div className="max-h-44 overflow-y-auto">{prompts}</div>}
          <button
            type="button"
            onClick={() => onOpen(true)}
            data-ask-open
            className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground ring-1 ring-field transition-colors outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Ask Tourbo about {city} or the tour…</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Noticed({ pref, fresh, busy, onUndo }: { pref: Preference; fresh: boolean; busy: boolean; onUndo: (id: string) => void }) {
  return (
    <div className={cn("space-y-1 rounded-lg px-2.5 py-2 text-xs ring-1", fresh ? "bg-info/10 ring-info/30" : "ring-border")} data-testid="noticed">
      <p className="flex items-start gap-1.5">
        <Lightbulb className="mt-px size-3.5 shrink-0 text-info" aria-hidden />
        <span>
          Tourbo noticed: {pref.text}. <span className="text-muted-foreground">Suggestions lean that way now.</span>
        </span>
      </p>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => onUndo(pref.id)}>
        <X /> Not really
      </Button>
    </div>
  );
}

// The selected night's own tabs: Room · Ideas · Set · Notes, always all four (an empty one says what
// it will hold and where to make it). The tab follows the tour tab; picking another night keeps it.
function NightPanel({ ws, kind, currency, build, runId, index, stop, panel, onPanel, extras, show, canEdit, venue, busy, focus }: { focus?: string; ws: Workspace; build: boolean; runId: string; index: number; stop: CityPlan; panel: NightTab; onPanel: (p: NightTab) => void; extras?: NightExtras; show?: { id: string; set: NightSetLine[] }; canEdit: boolean; venue: ReactNode; busy: boolean; kind: string; currency: string }) {
  const ideas = extras?.ideas[index];
  // The night's set from the Library (kept from "Build my set"), else the last built set.
  const set = show?.set.length ? show.set : extras?.set[index];
  const prep = extras?.prep[index];
  const count: Partial<Record<NightTab, number | undefined>> = { ideas: ideas?.length, set: set?.length };
  const to = (t: TourTab) => `/plan/${runId}${TAB_PATH[t]}?night=${index + 1}`;
  return (
    <Tabs value={panel} onValueChange={(v, d) => d.reason === "none" && onPanel(v as NightTab)} className="min-h-0 flex-1 gap-0" data-testid="night-panel">
      <div className="px-3 pt-2.5">
        <TabsList className="w-full" aria-label={`Night ${index + 1}`}>
          {ws.night.map((t) => (
            <TabsTrigger key={t} value={t} className="px-2">
              {nightTabLabel(ws, t)}
              {count[t] !== undefined && <span className="num text-xs font-normal text-muted-foreground">{count[t]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4 transition-opacity duration-150", busy && "pointer-events-none opacity-60")}>
        <TabsContent value="venue">{busy ? <NightSkeleton /> : venue}</TabsContent>
        <TabsContent value="ideas" className="space-y-3">
          {/* This night's idea cards, to act on (Keep / More like this / Not for me); the Ideas tab compares the tour. */}
          {extras?.cards?.[index] ? (
            <NightIdeas
              key={stop.city.name}
              runId={runId}
              kind={kind}
              city={extras.cards[index]}
              more={extras.cards[index].more}
              canEdit={canEdit}
              focus={focus}
              empty={
                extras.covers?.[index] && ws.main.includes("covers")
                  ? { text: `So far the fan data has only covers for ${stop.city.name}, and they're on the Covers tab.`, action: <PanelLink to={`/plan/${runId}/covers?night=${index + 1}`}>See {stop.city.name}'s covers</PanelLink> }
                  : undefined
              }
            />
          ) : (
            <Empty text={`No ideas for ${stop.city.name} yet. Ideas are local nods and topics this crowd's fans lean to.`} to={to("ideas")} action="Find ideas" />
          )}
        </TabsContent>
        <TabsContent value="set" className="space-y-3">
          {set?.length ? (
            <>
              {/* The kind's shape of tonight's set: Library details, else the built order's moves. */}
              <SetShape kind={kind} currency={currency} items={set.map((x) => (x.details ? { title: x.title, lengthMin: x.minutes, details: x.details } : fromMoves([x])[0]))} />
              <ol className="space-y-0.5 text-sm">
                {set.map((x, k) => (
                  <li key={k} className="flex items-center gap-2 rounded-md px-1.5 py-1 odd:bg-muted/40">
                    <span className="num w-5 shrink-0 text-right text-xs text-muted-foreground">{k + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    {x.details && <SetRowMeta kind={kind} item={{ title: x.title, details: x.details }} />}
                    {x.local && <Badge variant="outline">local</Badge>}
                    <span className="num shrink-0 text-xs text-muted-foreground">{x.minutes} min</span>
                  </li>
                ))}
              </ol>
              <p className="num px-1 text-xs text-muted-foreground">{set.reduce((a, x) => a + x.minutes, 0)} min in all</p>
              <div className="flex flex-wrap items-center gap-2">
                {build && canEdit && played(stop) && <NightSetAssist runId={runId} city={stop.city.name} showId={show?.id} size="sm" />}
                <PanelLink to={to("set")}>Change the order</PanelLink>
              </div>
            </>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
              <p>No set for {stop.city.name} yet. Tourbo puts your own material first, with a local nod or two.</p>
              {build && canEdit && played(stop) ? <NightSetAssist runId={runId} city={stop.city.name} showId={show?.id} size="sm" /> : !build ? <PanelLink to="/material">Add from Library</PanelLink> : <PanelLink to={to("set")}>Open the {tabLabel(ws, "set")} tab</PanelLink>}
            </div>
          )}
        </TabsContent>
        <TabsContent value="prep" className="space-y-3">
          {prep ? <NotesSections prep={prep} /> : <Empty text={`No notes for ${stop.city.name} yet: an opening line, set order and what to say, from what this city loves.`} to={to("prep")} action="Write notes" />}
          {prep && <PanelLink to={to("prep")}>Rewrite or rehearse</PanelLink>}
        </TabsContent>
      </div>
    </Tabs>
  );
}

// Show notes, grouped: the opening line and set order open, the rest folded under their titles.
export function NotesSections({ prep, open = ["opening", "setlist"] }: { prep: NonNullable<NightExtras["prep"][number]>; open?: string[] }) {
  const groups = PREP_ORDER.map((k) => ({ k, items: prep.items.filter((x) => x.section === k) }))
    .concat([{ k: "other", items: prep.items.filter((x) => !PREP_ORDER.includes(x.section)) }])
    .filter((g) => g.items.length);
  return (
    <div className="space-y-2">
      {prep.hook && <p className="text-sm leading-relaxed italic">{prep.hook}</p>}
      <div className="divide-y rounded-lg ring-1 ring-border">
        {groups.map((g) => (
          <details key={g.k} open={open.includes(g.k)} className="group/notes">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3.5 -rotate-90 text-muted-foreground transition-transform duration-150 group-open/notes:rotate-0" aria-hidden />
              {PREP_LABEL[g.k] ?? "More"}
              <span className="num ml-auto text-xs font-normal text-muted-foreground">{g.items.length}</span>
            </summary>
            <ul className="space-y-1.5 px-3 pb-3 pl-8 text-sm leading-relaxed">
              {g.items.map((x, i) => (
                <li key={i}>{x.text}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      {children} <ChevronRight className="size-3" aria-hidden />
    </Link>
  );
}

function Empty({ text, to, action, ai }: { text: string; to: string; action: string; ai?: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
      <p>{text}</p>
      <Button size="xs" variant="outline" nativeButton={false} render={<Link to={to} />}>
        {ai && <Sparkles />}
        {action}
      </Button>
    </div>
  );
}

function NightSkeleton() {
  return (
    <div className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border" aria-label="Updating the plan">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

type Controls = {
  menu?: "city" | "room";
  setMenu: (m?: "city" | "room") => void;
  stop: CityPlan;
  index: number;
  count: number;
  canEdit: boolean;
  busy: boolean;
  fmt: (n: number) => string;
  signed: (n: number) => string;
  cityOpts: ReturnType<typeof cityOptions>;
  venueOpts: ReturnType<typeof venueOptions>;
  onCity: (name: string) => void;
  onVenue: (id: string) => void;
  onEdit: (e: Edit) => void;
};

// Compact controls on the selected night: change city or room (lists with deltas), date, order, drop.
function NightControls({ menu, setMenu, stop, index, count, canEdit, busy, fmt, signed, cityOpts, venueOpts, onCity, onVenue, onEdit }: Controls) {
  const key = stopKey(stop);
  const suggested = stop.yours?.suggested;
  // What going back to Tourbo's pick would do to the tour (it's one of the options again).
  const back =
    suggested && suggested.city !== stop.city.name ? cityOpts.find((o) => o.city.name === suggested.city)?.profit
    : suggested?.venue && suggested.venue !== stop.venue?.name ? venueOpts.find((o) => o.venue.name === suggested.venue)?.profit
    : undefined;
  const off = !played(stop);
  const hint = suggested && (suggested.city !== stop.city.name || suggested.venue !== stop.venue?.name) && (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="suggested">
      Tourbo suggested {suggested.city !== stop.city.name ? suggested.city : suggested.venue}
      {back !== undefined && ` (${signed(back)} for the tour)`}
      <Hint label="About Tourbo's suggestion">
        Your pick stays. Tourbo's suggestion{suggested.venue ? ` was ${suggested.venue} in ${suggested.city}` : ""}
        {suggested.profit !== undefined ? `, about ${fmt(suggested.profit)} profit that night` : ""}. Undo brings it back.
      </Hint>
    </p>
  );
  if (!canEdit) return hint || null;
  const rooms = venueOpts.filter((v) => !v.current);
  return (
    <div className="space-y-2 border-t pt-3">
      {hint}
      <div className="flex flex-wrap gap-1.5">
        {!off && (
          <Popover open={menu === "city"} onOpenChange={(o) => setMenu(o ? "city" : undefined)}>
            <PopoverTrigger render={<Button size="xs" variant="outline" disabled={busy || !cityOpts.length} data-testid="change-city" />}>
              <ArrowLeftRight /> Change city
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-1">
              <OptionList
                label="Other cities Tourbo checked"
                optionTestId="city-option"
                items={cityOpts.map((o) => ({
                  id: o.city.name,
                  title: o.city.name,
                  sub: `fans ${o.fans}× · ${o.km === 0 ? "same travel" : `${o.km > 0 ? "+" : "−"}${formatNumber(Math.abs(o.km))} km`}${o.known ? "" : " · rooms not checked"}`,
                  delta: o.profit,
                }))}
                signed={signed}
                onPick={(id) => {
                  setMenu(undefined);
                  onCity(id);
                }}
              />
            </PopoverContent>
          </Popover>
        )}
        {!off && rooms.length > 0 && (
          <Popover open={menu === "room"} onOpenChange={(o) => setMenu(o ? "room" : undefined)}>
            <PopoverTrigger render={<Button size="xs" variant="outline" disabled={busy} />}>
              <Store /> Change room
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-1">
              <OptionList
                label={`Rooms in ${stop.city.name}`}
                items={rooms.map((o) => ({
                  id: o.venue.id,
                  title: o.venue.name,
                  sub: `${o.venue.roomType} · ~${formatNumber(o.capacity)}${o.hotspotKm !== undefined ? ` · ${o.hotspotKm} km from fans` : ""}`,
                  delta: o.profit,
                }))}
                signed={signed}
                onPick={(id) => {
                  setMenu(undefined);
                  onVenue(id);
                }}
              />
            </PopoverContent>
          </Popover>
        )}
        {!off && (
          <label className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs ring-1 ring-field focus-within:ring-2 focus-within:ring-ring">
            <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="sr-only">Date for night {index + 1}</span>
            <input
              type="date"
              defaultValue={stop.date}
              key={stop.date}
              disabled={busy}
              className="bg-transparent text-xs outline-none"
              onChange={(e) => e.currentTarget.value && e.currentTarget.value !== stop.date && onEdit({ op: "setDate", night: key, date: e.currentTarget.value })}
            />
          </label>
        )}
        <Button size="icon-xs" variant="ghost" aria-label="Move earlier" disabled={busy || index === 0} onClick={() => onEdit({ op: "reorder", night: key, to: index - 1 })}>
          <ArrowUp />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="Move later" disabled={busy || index === count - 1} onClick={() => onEdit({ op: "reorder", night: key, to: index + 1 })}>
          <ArrowDown />
        </Button>
        <Button size="xs" variant="ghost" className="ml-auto" disabled={busy} onClick={() => onEdit({ op: off ? "restoreNight" : "dropNight", night: key })}>
          {off ? "Bring this night back" : "Drop this night"}
        </Button>
      </div>
    </div>
  );
}

// Never a dead end: the city's own rooms, else rooms the run found nearby, else one plain sentence
// and a way to change the night.
function NoRoom({ city, rooms, nearby, canEdit, busy, signed, onPick, onChange }: { city: string; rooms: OptionItem[]; nearby: OptionItem[]; canEdit: boolean; busy: boolean; signed: (n: number) => string; onPick: (id: string) => void; onChange?: () => void }) {
  const list = rooms.length ? rooms : nearby;
  if (list.length && canEdit)
    return (
      <div className="space-y-1.5" data-testid="no-room">
        <p className="text-muted-foreground">{rooms.length ? `Pick a room in ${city}; the money assumes a typical room until you do.` : `No rooms saved for ${city} yet. These rooms nearby are ones Tourbo checked:`}</p>
        <div className="rounded-lg ring-1 ring-border">
          <OptionList label={rooms.length ? `Rooms in ${city}` : `Rooms near ${city}`} items={list} signed={signed} onPick={(id) => !busy && onPick(id)} />
        </div>
      </div>
    );
  return (
    <p className="flex flex-wrap items-center gap-2 text-muted-foreground" data-testid="no-room">
      No rooms saved for {city} yet. Pick one on the map or try again when fan data is back; the money assumes a typical room.
      {canEdit && onChange && (
        <Button size="xs" variant="outline" disabled={busy} onClick={onChange}>
          <ArrowLeftRight /> Change
        </Button>
      )}
    </p>
  );
}

type OptionItem = { id: string; title: string; sub: string; delta: number };

function OptionList({ label, items, signed, onPick, optionTestId }: { label: string; items: { id: string; title: string; sub: string; delta: number }[]; signed: (n: number) => string; onPick: (id: string) => void; optionTestId?: string }) {
  return (
    <div role="listbox" aria-label={label}>
      <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">{label}</p>
      {items.map((o) => (
        <button
          key={o.id}
          type="button"
          role="option"
          aria-selected={false}
          data-testid={optionTestId}
          onClick={() => onPick(o.id)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{o.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{o.sub}</span>
          </span>
          <span className={cn("num shrink-0 text-xs font-semibold", o.delta >= 0 ? "text-success" : "text-destructive")}>{signed(o.delta)}</span>
        </button>
      ))}
    </div>
  );
}

function AddNight({ plan, ctx, busy, signed, prefs, onAdd }: { plan: Plan; ctx: { pool: Pool }; busy: boolean; signed: (n: number) => string; prefs: Preference[]; onAdd: (city: string) => void }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => {
    if (!open) return [];
    const taken = new Set(plan.stops.filter(played).map((s) => s.city.name));
    return rankWithPrefs(
      ctx.pool.cities
        .filter((c) => !taken.has(c.name))
        .map((c) => {
          const after = applyEdit(plan, { op: "addNight", city: c.name }, ctx).plan;
          const d = diff(plan, after).totals;
          return { name: c.name, profit: d.profit, km: d.km, fans: 1 };
        }),
      prefs,
    );
  }, [open, plan, ctx, prefs]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" variant="outline" className="w-full" disabled={busy || plan.stops.filter(played).length >= 20} />}>
        <Plus /> Add a night
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-1">
        <OptionList
          label="Cities Tourbo checked (best spot in the route)"
          items={items.map((o) => ({ id: o.name, title: o.name, sub: `+${formatNumber(Math.max(0, o.km))} km`, delta: o.profit }))}
          signed={signed}
          onPick={(c) => {
            setOpen(false);
            onAdd(c);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
