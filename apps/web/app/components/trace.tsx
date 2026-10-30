import { useVirtualizer } from "@tanstack/react-virtual";
import { Banknote, Brain, Building2, ChevronDown, Flame, LifeBuoy, ListChecks, MapPinned, Route as RouteIcon, ShieldCheck, Sparkles, Ticket, TriangleAlert, UserRound, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { TraceEvent } from "@tourbo/core/shared/types.ts";
import { neutral } from "~/lib/neutral";
import { cn } from "~/lib/utils";

// "How Tourbo decided": every step of a run as a plain-words row (icon, title, result, time),
// collapsed; a row opens to a short summary, key numbers as chips and, behind one more toggle, the
// raw data. Runs have hundreds of steps, so the list is virtualized (rows measured as they open).
// Arrow keys move between rows, Enter / Space opens one. Tool names never show in a row.

type Step = { icon: LucideIcon; tone?: string; title: string; result?: string; summary?: string; chips: string[]; tool?: string; error: boolean };

const TOOL: Record<string, { title: string | ((city?: string) => string); icon: LucideIcon }> = {
  resolve_act: { title: "Looked up the act", icon: UserRound },
  score_cities: { title: "Scored cities by fans", icon: Flame },
  city_detail: { title: (c) => (c ? `Looked closer at ${c}` : "Looked closer at a city"), icon: MapPinned },
  show_economics: { title: (c) => (c ? `Worked out the money in ${c}` : "Worked out the money"), icon: Banknote },
  city_brief: { title: (c) => (c ? `Read what ${c} loves` : "Read what a city loves"), icon: Sparkles },
  venue_access: { title: (c) => (c ? `Checked getting to the room in ${c}` : "Checked getting to the room"), icon: Building2 },
  openers: { title: "Looked for openers", icon: UserRound },
  route: { title: "Planned the route", icon: RouteIcon },
  plan_city: { title: (c) => (c ? `Planned ${c}` : "Planned a night"), icon: MapPinned },
  plan_tour: { title: "Planned the tour", icon: RouteIcon },
  critique_plan: { title: "Checked the plan", icon: ShieldCheck },
  find_markets: { title: "Looked for places with fans", icon: Flame },
  promo_plan: { title: "Planned promo", icon: Sparkles },
  ticket_pace: { title: "Checked ticket pace", icon: Ticket },
  assess_offer: { title: "Weighed an offer", icon: Banknote },
  acts_for_venue: { title: "Matched acts to a room", icon: Building2 },
  rehearsal_panel: { title: "Rehearsed with fans", icon: UserRound },
  disciplines: { title: "Read the kinds of act", icon: ListChecks },
};

const words = (s: string) => s.replace(/_/g, " ");
const cityOf = (input: Record<string, unknown> | undefined) => {
  const c = input?.city ?? input?.city_name ?? input?.name_of_city;
  return typeof c === "string" ? c : undefined;
};

// Plain words for one trace event. Pure: no fan-data or AI calls.
function describe(e: TraceEvent): Step {
  const d = e.data ?? {};
  const msg = neutral(e.message);
  const error = d.error === true;
  const chips: string[] = [];
  for (const [k, label] of [["cells", "fan areas"], ["results", "results"], ["popularity", "popularity"]] as const) if (typeof d[k] === "number") chips.push(`${label} ${formatNumber(d[k] as number)}`);
  const issues = Array.isArray(d.issues) ? (d.issues as { city?: string; detail: string }[]) : [];

  if (e.kind === "tool_call") {
    const name = e.message.replace(/^mcp\s+/, "").replace(/^(tourbo|qloo)_/, "").trim();
    const input = d.input as Record<string, unknown> | undefined;
    const t = TOOL[name];
    const city = cityOf(input);
    const title = t ? (typeof t.title === "function" ? t.title(city) : t.title) : `${words(name).replace(/^./, (c) => c.toUpperCase())}`;
    const summary = input && Object.keys(input).length ? inputSummary(input) : undefined;
    return { icon: t?.icon ?? Wrench, title, result: error ? "didn't work" : undefined, summary, chips, tool: name, error };
  }
  if (e.kind === "qloo_call") {
    const heat = e.message.match(/^Heatmap (.+?): (\d+) cells/);
    if (heat) return { icon: Flame, tone: "text-score-3", title: `Mapped fans in ${heat[1]}`, result: `${formatNumber(Number(heat[2]))} fan areas`, chips: [], error };
    const rooms = e.message.match(/^(.+?): (\d+) venues \(([^,)]+)/);
    if (rooms) return { icon: Building2, tone: "text-score-3", title: `Found rooms in ${rooms[1]}`, result: `${rooms[2]} ${words(rooms[3])}${rooms[2] === "1" ? "" : "s"}`, summary: msg, chips, error };
    return { icon: Flame, tone: "text-score-3", title: "Read fan data", result: clip(msg, 48), summary: msg, chips, error };
  }
  if (e.kind === "decision") {
    const opener = msg.match(/^(.+?): opener (.+?) \(/);
    if (opener) return { icon: UserRound, tone: "text-secondary", title: `Picked an opener for ${opener[1]}`, result: opener[2], summary: msg, chips, error };
    if (/^Shortlist:/.test(msg)) return { icon: ListChecks, tone: "text-secondary", title: "Made the shortlist", result: clip(msg.replace(/^Shortlist:\s*/, "").replace(/\s\d+(?=,|$)/g, ""), 48), summary: msg, chips, error };
    const resolved = msg.match(/^Resolved (.+)$/);
    if (resolved) return { icon: UserRound, tone: "text-secondary", title: `Found ${resolved[1]}`, chips, error };
    return { icon: Sparkles, tone: "text-secondary", title: clip(msg, 64), summary: msg.length > 64 ? msg : undefined, chips, error };
  }
  if (e.kind === "critic")
    return { icon: ShieldCheck, tone: "text-success", title: "Checked the work", result: issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} fixed` : "all clear", summary: [msg, ...issues.map((i) => `${i.city ? `${i.city}: ` : ""}${neutral(i.detail)}`)].join("\n"), chips, error };
  if (e.kind === "repair") return { icon: LifeBuoy, tone: "text-warning", title: "Fixed a step", result: clip(msg, 48), summary: msg, chips, error };
  return { icon: Brain, title: "Thought it through", result: undefined, summary: msg, chips, error };
}

// A tool's input in a few words: "city Columbus · price 30 · 4 nights" (arrays and objects counted).
function inputSummary(input: Record<string, unknown>) {
  return Object.entries(input)
    .filter(([k, v]) => !/(^|_)id$|Id$/.test(k) && v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
    .slice(0, 6)
    .map(([k, v]) => `${words(k)} ${Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : typeof v === "object" ? "…" : neutral(String(v))}`)
    .join(" · ");
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// One line over the list: what the run did, in counts.
export function traceSummary(events: TraceEvent[]) {
  const fan = events.filter((e) => e.kind === "qloo_call").length;
  const picks = events.filter((e) => e.kind === "decision").length;
  const checks = events.filter((e) => e.kind === "critic").length;
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  return [fan && n(fan, "fan-data read", "fan-data reads"), picks && n(picks, "pick", "picks"), checks && n(checks, "check", "checks")].filter(Boolean).join(" · ");
}

export function Trace({ events, live, className }: { events: TraceEvent[]; live: boolean; className?: string }) {
  const steps = useMemo(() => events.map(describe), [events]);
  const start = events[0] ? Date.parse(events[0].at) : 0;
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [raw, setRaw] = useState<Set<number>>(() => new Set());
  const [focus, setFocus] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: events.length, getScrollElement: () => scroller.current, estimateSize: () => 40, overscan: 8, getItemKey: (i) => `${events[i]?.seq ?? ""}-${i}` });

  useEffect(() => {
    if (live && events.length) v.scrollToIndex(events.length - 1, { align: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length, live]);

  const toggle = (set: Set<number>, put: (s: Set<number>) => void, seq: number) => {
    const next = new Set(set);
    next.has(seq) ? next.delete(seq) : next.add(seq);
    put(next);
  };
  const move = (i: number) => {
    const n = Math.max(0, Math.min(events.length - 1, i));
    setFocus(n);
    v.scrollToIndex(n, { align: "auto" });
    requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>(`[data-row="${n}"]`)?.focus());
  };
  const onKey = (e: KeyboardEvent) => {
    const k = { ArrowDown: focus + 1, ArrowUp: focus - 1, Home: 0, End: events.length - 1, PageDown: focus + 10, PageUp: focus - 10 }[e.key];
    if (k === undefined) return;
    e.preventDefault();
    move(k);
  };

  if (!events.length) return <p className="px-4 py-3 text-sm text-muted-foreground">Nothing to show yet. Steps appear here as Tourbo works.</p>;
  return (
    <div ref={scroller} className={cn("max-h-[45vh] overflow-y-auto overscroll-contain", className)} onKeyDown={onKey}>
      <ol role="list" aria-label="Steps" className="relative w-full" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((item) => {
          const ev = events[item.index];
          const s = steps[item.index];
          const isOpen = open.has(item.index);
          const Icon = s.error ? TriangleAlert : s.icon;
          const secs = Math.max(0, Math.round((Date.parse(ev.at) - start) / 1000));
          const detail = !!(s.summary || s.chips.length || ev.data);
          return (
            <li key={item.key} data-index={item.index} ref={v.measureElement} className="absolute top-0 left-0 w-full border-b border-border/60 last:border-b-0" style={{ transform: `translateY(${item.start}px)` }}>
              <button
                type="button"
                data-row={item.index}
                tabIndex={item.index === focus ? 0 : -1}
                aria-expanded={detail ? isOpen : undefined}
                onFocus={() => setFocus(item.index)}
                onClick={() => detail && toggle(open, setOpen, item.index)}
                className="flex h-10 w-full items-center gap-2.5 px-4 text-left text-sm transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <Icon className={cn("size-4 shrink-0", s.error ? "text-destructive" : (s.tone ?? "text-muted-foreground"))} aria-hidden />
                <span className="min-w-0 truncate">{s.title}</span>
                {s.result && <span className={cn("min-w-0 shrink truncate text-xs", s.error ? "text-destructive" : "text-muted-foreground")}>· {s.result}</span>}
                <span className="num ml-auto shrink-0 text-xs text-muted-foreground">{secs >= 60 ? `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s` : `${secs}s`}</span>
                {detail && <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150", !isOpen && "-rotate-90")} aria-hidden />}
              </button>
              {isOpen && (
                <div className="space-y-2 px-4 pb-3 pl-11 text-sm">
                  {s.summary && <p className="whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{s.summary}</p>}
                  {s.chips.length > 0 && (
                    <p className="flex flex-wrap gap-1">
                      {s.chips.map((c) => (
                        <Chip key={c}>{c}</Chip>
                      ))}
                    </p>
                  )}
                  {ev.data && (
                    <div className="space-y-1.5">
                      <button type="button" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" aria-expanded={raw.has(item.index)} onClick={() => toggle(raw, setRaw, item.index)}>
                        {raw.has(item.index) ? "Hide raw data" : "Show raw data"}
                      </button>
                      {raw.has(item.index) && (
                        <div className="space-y-1">
                          {s.tool && <p className="text-xs text-muted-foreground">Step: {words(s.tool)}</p>}
                          <pre className="max-h-56 overflow-auto rounded-md bg-muted/60 p-2.5 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{neutral(JSON.stringify(ev.data, null, 2))}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground num",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function formatNumber(n: number) {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2);
}
