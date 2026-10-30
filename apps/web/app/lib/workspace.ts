import type { PerformerKind, Region } from "@tourbo/core/shared/types.ts";

// Workspace list logic (PLAN Q21), pure and client-safe: phase (draft / planned / on the road /
// past), automatic archive, and the sort / filter / search the URL carries. Unit-tested in
// tests/unit/workspace.test.ts; rows come from server/workspace.server.ts.

export type WorkType = "tour" | "event" | "project";
export type WorkRow = {
  type: WorkType;
  id: string;
  title: string;
  kind?: PerformerKind;
  region?: Region;
  homeBase?: string;
  status: string; // run: pending | running | done | failed | interrupted; project: saved
  firstDate?: string; // YYYY-MM-DD
  lastDate?: string;
  nights: number;
  profit?: number;
  currency?: string;
  cities: string[];
  fans?: number[]; // fan strength per night, 0–100 (fan data), in play order
  tonight?: { city: string; venue?: string }; // a tour on the road: tonight's stop, when there is one
  notes?: number; // projects: notes and to-dos
  venue?: string; // events
  tourId?: string; // events that are a tour's night
  runId?: string; // a one-off show's helper plan (suggested rooms), when it has one
  tourTitle?: string;
  archived: boolean | null; // null = automatic
  createdAt: string;
  projectId?: string;
  owned: boolean;
};

export type Phase = "draft" | "planned" | "on_the_road" | "past";
export const PHASES: Phase[] = ["draft", "planned", "on_the_road", "past"];
export const PHASE_LABEL: Record<Phase, string> = { draft: "Draft", planned: "Planned", on_the_road: "On the road", past: "Past" };

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

// Draft until the plan is ready; then by its dates. Projects follow their plans' dates.
export function phaseOf(r: WorkRow, day = today()): Phase {
  // Events: a draft until they have a date; tours: until the plan is ready. The end date decides
  // "past" (a 3-day event is on until its last day is over).
  if (r.type === "tour" && r.status !== "done") return "draft";
  if (!r.firstDate || !r.lastDate) return r.type === "tour" ? "planned" : "draft";
  if (r.lastDate < day) return "past";
  if (r.firstDate <= day) return "on_the_road";
  return "planned";
}

// Past items archive themselves; a hand choice (archive / restore) wins.
export const isArchived = (r: WorkRow, day = today()) => r.archived ?? phaseOf(r, day) === "past";

export type Sort = "date" | "name" | "profit" | "nights";
export const SORTS: Sort[] = ["date", "name", "profit", "nights"];
export const SORT_LABEL: Record<Sort, string> = { date: "Date", name: "Name", profit: "Profit", nights: "Nights" };

export type Section = "tours" | "events";
export type Query = {
  section: Section; // Tours (tours + their notebooks) · Events (one-offs + tour nights)
  view: "active" | "archived";
  q: string;
  phase?: Phase;
  type?: WorkType;
  kind?: PerformerKind;
  region?: Region;
  when?: "upcoming" | "past";
  sort: Sort;
  dir: "asc" | "desc";
};

// Newest first by default for names that read A→Z, soonest first for dates.
const defaultDir = (sort: Sort): Query["dir"] => (sort === "name" ? "asc" : sort === "date" ? "asc" : "desc");
export const DEFAULT_QUERY: Query = { section: "tours", view: "active", q: "", sort: "date", dir: "asc" };

const pick = <T extends string>(v: string | null, options: readonly T[]): T | undefined => (v && (options as readonly string[]).includes(v) ? (v as T) : undefined);

export function parseQuery(params: URLSearchParams): Query {
  const sort = pick(params.get("sort"), SORTS) ?? "date";
  return {
    section: params.get("show") === "events" ? "events" : "tours",
    view: params.get("view") === "archived" ? "archived" : "active",
    q: (params.get("q") ?? "").slice(0, 80),
    phase: pick(params.get("status"), PHASES),
    type: pick(params.get("type"), ["tour", "event", "project"] as const),
    kind: (params.get("kind") || undefined) as PerformerKind | undefined,
    region: (params.get("region") || undefined) as Region | undefined,
    when: pick(params.get("when"), ["upcoming", "past"] as const),
    sort,
    dir: pick(params.get("dir"), ["asc", "desc"] as const) ?? defaultDir(sort),
  };
}

// Only what differs from the defaults goes in the URL.
export function queryToParams(q: Query): URLSearchParams {
  const p = new URLSearchParams();
  if (q.section !== "tours") p.set("show", q.section);
  if (q.view !== "active") p.set("view", q.view);
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.phase) p.set("status", q.phase);
  if (q.type) p.set("type", q.type);
  if (q.kind) p.set("kind", q.kind);
  if (q.region) p.set("region", q.region);
  if (q.when) p.set("when", q.when);
  if (q.sort !== "date") p.set("sort", q.sort);
  if (q.dir !== defaultDir(q.sort)) p.set("dir", q.dir);
  return p;
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const inSection = (r: WorkRow, s: Section) => (s === "events" ? r.type === "event" : r.type !== "event");

export function matches(r: WorkRow, q: Query, day = today()): boolean {
  if (!inSection(r, q.section)) return false;
  if ((q.view === "archived") !== isArchived(r, day)) return false;
  if (q.phase && phaseOf(r, day) !== q.phase) return false;
  if (q.type && r.type !== q.type) return false;
  if (q.kind && r.kind !== q.kind) return false;
  if (q.region && r.region !== q.region) return false;
  if (q.when === "upcoming" && !(r.lastDate && r.lastDate >= day)) return false;
  if (q.when === "past" && !(r.lastDate && r.lastDate < day)) return false;
  const words = norm(q.q).split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = norm([r.title, r.homeBase, r.venue, r.tourTitle, ...r.cities].filter(Boolean).join(" "));
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

// Missing values (no dates, no profit yet) always sort last; ties fall back to newest first.
export function compare(a: WorkRow, b: WorkRow, sort: Sort, dir: Query["dir"]): number {
  const value = (r: WorkRow): string | number | undefined =>
    sort === "date" ? r.firstDate : sort === "name" ? norm(r.title) : sort === "profit" ? r.profit : r.type === "project" ? undefined : r.nights;
  const x = value(a);
  const y = value(b);
  if (x === undefined && y === undefined) return b.createdAt.localeCompare(a.createdAt);
  if (x === undefined) return 1;
  if (y === undefined) return -1;
  const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
  return c === 0 ? b.createdAt.localeCompare(a.createdAt) : dir === "asc" ? c : -c;
}

export function applyQuery(rows: WorkRow[], q: Query, day = today()): WorkRow[] {
  return rows.filter((r) => matches(r, q, day)).sort((a, b) => compare(a, b, q.sort, q.dir));
}

export const counts = (rows: WorkRow[], section: Section, day = today()) => {
  const mine = rows.filter((r) => inSection(r, section));
  return { active: mine.filter((r) => !isArchived(r, day)).length, archived: mine.filter((r) => isArchived(r, day)).length };
};

// Filters actually in use (the "Clear" button shows only then).
export const filtered = (q: Query) => !!(q.q.trim() || q.phase || q.type || q.kind || q.region || q.when);
