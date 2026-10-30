import type { NightTabId, TourTabId } from "@tourbo/core/disciplines/index.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { LABELS } from "~/lib/labels";

// The tour workspace's tabs (surface brief "the tour book, open on the map"): one row for the
// tour; the night panel's own tabs follow it. Paths stay the old sub-routes so links keep working.
// Which tabs a kind shows and what they're called: workspaceFor(kind) (disciplines/index.ts).
export type TourTab = TourTabId;
export type NightTab = NightTabId;

export const TAB_PATH: Record<TourTab, string> = {
  tonight: "/tonight",
  plan: "",
  ideas: "/ideas",
  set: "/set",
  prep: "/prep",
  pipeline: "/pipeline",
  insights: "/insights",
  live: "/live",
  compare: "/compare",
  // Kind tabs (only some kinds; one route module, components/kind-tabs/).
  covers: "/covers",
  openers: "/openers",
  crowd: "/crowd",
  tone: "/tone",
  sales: "/sales",
  sessions: "/sessions",
  pitches: "/pitches",
};

// Default names; a kind's own names come from tabLabel(workspaceFor(kind), tab).
export const TAB_LABEL: Record<TourTab, string> = {
  tonight: "Tonight",
  plan: "Plan",
  ideas: "Ideas",
  set: LABELS.set,
  prep: LABELS.notes,
  pipeline: "Booking",
  insights: "Numbers",
  live: "Tickets",
  compare: "Compare",
  covers: "Covers",
  openers: "Openers",
  crowd: "Crowd",
  tone: "Tone",
  sales: "Sales",
  sessions: "Sessions",
  pitches: "Pitches",
};

export const NIGHT_TAB_LABEL: Record<NightTab, string> = { venue: "Room", ideas: "Ideas", set: LABELS.set, prep: LABELS.notes };
export const NIGHT_TABS: NightTab[] = ["venue", "ideas", "set", "prep"];

export function tabOf(pathname: string, base: string): TourTab {
  const rest = pathname.replace(/\/$/, "").slice(base.length);
  return (Object.entries(TAB_PATH).find(([, p]) => p === rest)?.[0] as TourTab | undefined) ?? "plan";
}

// The night panel opens on the tab that matches the tour tab (Ideas → this night's ideas).
export const panelFor = (tab: TourTab): NightTab => (tab === "ideas" || tab === "set" || tab === "prep" ? tab : "venue");

export const played = (s: Plan["stops"][number]) => s.money?.verdict !== "skip";

const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const DAY = 86_400_000;

// On the road: today is within the tour's dates (from the day before the first show). Returns the
// night to show on Tonight: today's show, else the next one (1-based), else undefined.
export function roadNight(plan: Plan | null | undefined, today: string): { onRoad: boolean; night?: number } {
  const dated = (plan?.stops ?? []).map((s, i) => ({ s, i })).filter((x) => x.s.date && played(x.s));
  if (!dated.length) return { onRoad: false };
  const t = day(today);
  const first = Math.min(...dated.map((x) => day(x.s.date!)));
  const last = Math.max(...dated.map((x) => day(x.s.date!)));
  const next = dated.filter((x) => day(x.s.date!) >= t).sort((a, b) => day(a.s.date!) - day(b.s.date!))[0];
  return { onRoad: t >= first - DAY && t <= last, night: next ? next.i + 1 : undefined };
}

export const shortDate = (iso?: string, weekday = false) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en", { ...(weekday ? { weekday: "short" } : {}), month: "short", day: "numeric" }) : "date to set";

export function dateRange(dates: string[]) {
  if (!dates.length) return undefined;
  const a = new Date(`${dates[0]}T12:00:00`);
  const b = new Date(`${dates.at(-1)}T12:00:00`);
  const md = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
  if (dates[0] === dates.at(-1)) return `${md(a)}, ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${md(a)}, ${a.getFullYear()} – ${md(b)}, ${b.getFullYear()}`;
  return `${md(a)} – ${a.getMonth() === b.getMonth() ? b.getDate() : md(b)}, ${b.getFullYear()}`;
}

// A saved idea's fan-data line ("#3 of the artists Chicago over-indexes on (fan data, local lift
// 0.95).") as a short inline chip: rank and lift when the line has them, hedged otherwise.
export function ideaChip(why: string): { text: string; meter?: number; hedged: boolean } {
  const rank = why.match(/#(\d+)/)?.[1];
  const lift = Number(why.match(/lift\s+([\d.]+)/)?.[1]);
  if (rank) return { text: `#${rank} here`, meter: Number.isFinite(lift) && lift > 0 ? Math.min(1, lift) : undefined, hedged: false };
  if (Number.isFinite(lift) && lift > 0) return { text: `lift ${lift.toFixed(2)}`, meter: Math.min(1, lift), hedged: lift < 0.5 };
  return { text: "fan data", hedged: true };
}

// Google Maps search link for a room (or the city when there's no room yet).
export function mapLink(stop: Plan["stops"][number]) {
  const v = stop.venue;
  const q = v ? [v.name, v.address, stop.city.name].filter(Boolean).join(", ") : stop.city.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export const PREP_LABEL: Record<string, string> = { opening: "Opening line", setlist: "Set order", material: "Material", banter: "Banter", crowd: "Crowd moment", staging: "Room setup", sponsor: "Sponsor ask", avoid: "Avoid" };
export const PREP_ORDER = ["opening", "setlist", "material", "banter", "crowd", "staging", "sponsor", "avoid"];
