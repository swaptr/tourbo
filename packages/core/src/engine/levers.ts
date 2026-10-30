import { FLAVOURS, FLAVOUR_LABEL, type Flavour } from "../context/budget.ts";
import { defaultBoundaries, type Boundary } from "../context/sensitivity.ts";
import type { Skew } from "../context/audience.ts";
import type { CityPlan, PerformerKind, Plan, Region, ShowMoney } from "../shared/types.ts";
import { evaluate, priceNudgeNote, REGION_DEFAULTS, type Deal, type PriceAdjust } from "./economics.ts";
import { money as fmtMoney } from "./explain.ts";

// "Tune" levers (PLAN §18 Q20): instant, deterministic, no AI and no fan-data calls. Each lever maps
// to recompute inputs the engine already has: room size and price (economics.evaluate on the night's
// saved demand), a profit floor (drop nights below it), drive distance per day (dates + lodging), and
// context keys for ideas / sets / show notes (flavour, boundaries, era skew; context/ module).
// The stored plan is never changed here: applyLevers(plan, levers) is a view the workspace renders,
// and the lever state is saved per run (run_steps "levers"). Client-safe.

export const RISKS = ["safe", "balanced", "bold"] as const;
export type Risk = (typeof RISKS)[number];
export const EDGES = ["cleaner", "as_is", "edgier"] as const;
export type Edge = (typeof EDGES)[number];
export const ERAS = ["recent", "mix", "classic"] as const;
export type Era = (typeof ERAS)[number];

export type Levers = {
  flavour: Flavour; // local touches in sets / ideas: a touch / some / lots
  risk: Risk; // safe = rooms you'll fill; bold = bigger rooms, more upside, lower sell-out odds
  feeFloor?: number; // minimum estimated profit per night (plan currency); nights below are dropped
  maxDriveKm?: number; // per travel day (the planner assumes 500)
  edge: Edge; // comics / speakers: how edgy the material may go
  era: Era; // covers and references: recent vs classic
};

export const DEFAULT_LEVERS: Levers = { flavour: "touch", risk: "balanced", edge: "as_is", era: "mix" };
export const PLANNER_DRIVE_KM = 500; // routing.ts MAX_DRIVE_KM
const FLY_KM = 1200; // routing.ts FLY_KM

export const LEVER_LABEL = {
  flavour: FLAVOUR_LABEL,
  risk: { safe: "Safe", balanced: "Balanced", bold: "Bold" } satisfies Record<Risk, string>,
  edge: { cleaner: "Cleaner", as_is: "As is", edgier: "Edgier" } satisfies Record<Edge, string>,
  era: { recent: "Recent", mix: "Mix", classic: "Classic" } satisfies Record<Era, string>,
};

const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : d);
const posNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && Number(v) > 0 ? Number(v) : undefined);

// Tolerant: anything missing or odd falls back to the default.
export function parseLevers(v: unknown): Levers {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const floor = posNum(o.feeFloor);
  const drive = posNum(o.maxDriveKm);
  return {
    flavour: pick(FLAVOURS, o.flavour, DEFAULT_LEVERS.flavour),
    risk: pick(RISKS, o.risk, DEFAULT_LEVERS.risk),
    edge: pick(EDGES, o.edge, DEFAULT_LEVERS.edge),
    era: pick(ERAS, o.era, DEFAULT_LEVERS.era),
    ...(floor ? { feeFloor: Math.round(floor) } : {}),
    ...(drive ? { maxDriveKm: Math.max(100, Math.min(1500, Math.round(drive))) } : {}),
  };
}

export const isDefault = (l: Levers) => JSON.stringify(parseLevers(l)) === JSON.stringify(DEFAULT_LEVERS);

// ---------- Money recompute for one night (no fan-data calls) ----------

const NO_COSTS = { travelKm: 0, flights: 0, nights: 0, crew: 0, opener: false };
const TICKETED: Deal[] = ["door_split", "guarantee", "versus", "bar_deal", "supper_club", "workshop"];
export const isTicketed = (m?: ShowMoney) => !!m && TICKETED.includes(m.deal as Deal);

function verdictOf(m: Pick<ShowMoney, "profit" | "sellThrough" | "relDemand" | "deal">): ShowMoney["verdict"] {
  if (m.profit >= 0 && (m.sellThrough >= 0.6 || ["exhibition", "commission", "tips"].includes(m.deal))) return "headline";
  if (m.profit >= 0) return "co-headline";
  return m.relDemand >= 0.5 ? "support slot" : "skip";
}

// The night's local price nudge (place features, PLAN Q18). Same rule as places/hooks.server.ts
// priceAdjust (kept inline: that file is server-only): only a surfaced nudge changes the price.
export function stopAdjust(stop: Pick<CityPlan, "place">): PriceAdjust {
  const p = stop.place?.priceNudge;
  if (!p || !stop.place?.surfaced.includes("priceNudge")) return {};
  return { priceFactor: p.factor, elasticity: p.elasticity };
}

// The night's saved demand (draw, relDemand) re-run through evaluate() with a new room or price.
// Revenue changes; costs (travel, lodging, promo) stay as planned unless extraCost is given.
export function repriceStop(stop: CityPlan, region: Region, kind: PerformerKind, patch: { capacity?: number; price?: number; extraCost?: number; reason?: string }): CityPlan {
  const m = stop.money;
  if (!m) return stop;
  const demand = { typicalDraw: m.draw, relDemand: m.relDemand, draw: m.draw, basis: m.basis };
  const scenario = { deal: m.deal as Deal, price: patch.price ?? m.price, capacity: Math.max(10, Math.round(patch.capacity ?? m.capacity)), guarantee: m.guarantee, promo: m.promo, sponsor: m.sponsor };
  const adj = stopAdjust(stop);
  const o = evaluate(region, kind, demand, scenario, NO_COSTS, adj);
  const nudge = priceNudgeNote(adj);
  const costs = Math.round(m.costs + (patch.extraCost ?? 0));
  const profit = Math.round(o.profit + o.costs - costs); // o.costs = promo only; planned costs already hold it
  const next: ShowMoney = {
    ...m,
    price: scenario.price,
    capacity: scenario.capacity,
    tickets: o.tickets,
    sellThrough: o.sellThrough,
    gross: o.gross,
    artistTake: o.artistTake,
    costs,
    profit,
    ...(nudge ? { priceNudge: nudge } : {}),
    ...(patch.reason ? { reason: patch.reason } : {}),
  };
  return { ...stop, money: { ...next, verdict: m.verdict === "skip" ? "skip" : verdictOf(next) } };
}

// Tickets wanted at this price with no room limit (what a room of any size would sell).
export function wanted(stop: CityPlan, region: Region, kind: PerformerKind): number | undefined {
  const m = stop.money;
  if (!m || !isTicketed(m)) return undefined;
  const demand = { typicalDraw: m.draw, relDemand: m.relDemand, draw: m.draw, basis: m.basis };
  return evaluate(region, kind, demand, { deal: m.deal as Deal, price: m.price, capacity: 1_000_000, guarantee: m.guarantee, promo: m.promo, sponsor: m.sponsor }, NO_COSTS, stopAdjust(stop)).tickets;
}

// Same as the planner's tourPnl (apps/web/server/agent/tools.ts): totals over nights that are played.
export function retotal(plan: Plan, stops: CityPlan[] = plan.stops): Plan {
  const played = stops.filter((s) => s.money && s.money.verdict !== "skip");
  const sum = (k: "gross" | "artistTake" | "costs" | "profit") => played.reduce((a, s) => a + (s.money?.[k] ?? 0), 0);
  const currency = played[0]?.money?.currency ?? plan.money?.currency ?? "";
  return { ...plan, stops, money: { currency, gross: sum("gross"), artistTake: sum("artistTake"), costs: sum("costs"), profit: sum("profit"), promoBudget: plan.money?.promoBudget } };
}

// ---------- Dates for a different drive limit ----------

const travelDays = (km: number, maxDrive: number) => (km > FLY_KM ? 1 : Math.max(1, Math.ceil(km / maxDrive)));
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function redrive(plan: Plan, maxDrive: number, crew: number): { stops: CityPlan[]; moved: number } {
  const lodging = REGION_DEFAULTS[plan.params.region]?.lodging ?? 0;
  let shift = 0;
  let moved = 0;
  const stops = plan.stops.map((s, i) => {
    if (i === 0) return s;
    const leg = plan.legs[i - 1];
    const km = leg?.km ?? 0;
    const extra = travelDays(km, maxDrive) - travelDays(km, PLANNER_DRIVE_KM);
    shift += extra;
    let next = s;
    if (extra !== 0 && s.money) next = repriceStop(next, plan.params.region, plan.artist.kind, { extraCost: extra * lodging * crew });
    if (shift !== 0 && s.date) {
      next = { ...next, date: addDays(s.date, shift) };
      moved++;
    }
    return next;
  });
  return { stops, moved };
}

// ---------- Apply all levers ----------

export type PlanDiff = {
  currency: string;
  profit: number; // tour profit change (estimate)
  km: number;
  tickets: number; // expected tickets change ("fans in the room")
  nightsChanged: number;
  dropped: number;
  restored: number;
  datesMoved: number;
  lines: string[]; // plain one-liners, e.g. "profit +$310", "1 night changed"
};

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
export const signedMoney = (n: number, currency: string) => `${sign(n)}${fmtMoney(Math.abs(n), currency)}`;

export function diffPlans(before: Plan, after: Plan): PlanDiff {
  const currency = after.money?.currency || before.money?.currency || "USD";
  const played = (p: Plan) => p.stops.filter((s) => s.money?.verdict !== "skip");
  const tickets = (p: Plan) => played(p).reduce((a, s) => a + (s.money?.tickets ?? 0), 0);
  const profit = Math.round((after.money?.profit ?? 0) - (before.money?.profit ?? 0));
  const km = Math.round((after.totalKm ?? 0) - (before.totalKm ?? 0));
  const dt = tickets(after) - tickets(before);
  const key = (s?: CityPlan) => (s ? JSON.stringify([s.city.name, s.date, s.venue?.id, s.money?.capacity, s.money?.price, s.money?.verdict, s.money?.profit]) : "");
  const n = Math.max(before.stops.length, after.stops.length);
  let nightsChanged = 0;
  let dropped = 0;
  let restored = 0;
  let datesMoved = 0;
  for (let i = 0; i < n; i++) {
    const a = before.stops[i];
    const b = after.stops[i];
    if (key(a) !== key(b)) nightsChanged++;
    if (a?.money?.verdict !== "skip" && b?.money?.verdict === "skip") dropped++;
    if (a?.money?.verdict === "skip" && b && b.money?.verdict !== "skip") restored++;
    if (a?.date && b?.date && a.city.name === b.city.name && a.date !== b.date) datesMoved++;
  }
  const lines: string[] = [];
  if (profit) lines.push(`profit ${signedMoney(profit, currency)}`);
  if (dt) lines.push(`${dt > 0 ? "+" : "−"}${Math.abs(dt).toLocaleString("en-US")} tickets`);
  if (km) lines.push(`${km > 0 ? "+" : "−"}${Math.abs(km).toLocaleString("en-US")} km`);
  if (dropped) lines.push(`${dropped} night${dropped > 1 ? "s" : ""} dropped`);
  if (restored) lines.push(`${restored} night${restored > 1 ? "s" : ""} back in`);
  if (datesMoved) lines.push(`${datesMoved} date${datesMoved > 1 ? "s" : ""} moved`);
  const other = nightsChanged - dropped - restored;
  if (other > 0 && !datesMoved) lines.push(`${other} night${other > 1 ? "s" : ""} changed`);
  return { currency, profit, km, tickets: dt, nightsChanged, dropped, restored, datesMoved, lines };
}

// Risk → room size per ticketed night. Safe: a room you'll fill (~90% of what this price sells,
// never bigger than planned). Bold: a third bigger (more upside if it sells, lower sell-out odds).
function roomFor(stop: CityPlan, risk: Risk, region: Region, kind: PerformerKind): number | undefined {
  const m = stop.money;
  if (!m || risk === "balanced" || !isTicketed(m) || m.verdict === "skip") return undefined;
  if (risk === "bold") return Math.round(m.capacity * 1.35);
  const w = wanted(stop, region, kind);
  if (!w) return undefined;
  const cap = Math.min(m.capacity, Math.max(30, Math.round(w / 0.9)));
  return cap < m.capacity ? cap : undefined;
}

export const RISK_REASON: Record<Risk, string> = {
  safe: "Room sized so it sells out (your Safe setting).",
  balanced: "",
  bold: "Bigger room: more upside, lower sell-out odds (your Bold setting).",
};

// The plan as the levers would have it, plus the inline diff against the stored plan.
export function applyLevers(plan: Plan, input: Partial<Levers>): { plan: Plan; diff: PlanDiff; context: LeverContext } {
  const levers = parseLevers({ ...DEFAULT_LEVERS, ...input });
  const region = plan.params.region;
  const kind = plan.artist.kind;
  let stops = plan.stops;
  let moved = 0;
  if (levers.maxDriveKm && levers.maxDriveKm !== PLANNER_DRIVE_KM) {
    const r = redrive(plan, levers.maxDriveKm, plan.params.money?.crew ?? 3);
    stops = r.stops;
    moved = r.moved;
  }
  stops = stops.map((s) => {
    const cap = roomFor(s, levers.risk, region, kind);
    return cap ? repriceStop(s, region, kind, { capacity: cap, reason: RISK_REASON[levers.risk] }) : s;
  });
  if (levers.feeFloor) {
    const floor = levers.feeFloor;
    const currency = plan.money?.currency ?? "USD";
    stops = stops.map((s) =>
      s.money && s.money.verdict !== "skip" && s.money.profit < floor
        ? { ...s, money: { ...s.money, verdict: "skip" as const, reason: `Below your floor of about ${fmtMoney(floor, currency)} a night.` } }
        : s,
    );
  }
  const next = retotal(plan, stops);
  const diff = diffPlans(plan, next);
  if (moved && !diff.datesMoved) diff.datesMoved = moved;
  return { plan: next, diff, context: leverContext(levers, kind) };
}

// ---------- Context keys for ideas / sets / show notes (context/ module types) ----------

export type LeverContext = {
  flavour: Flavour; // performanceContext({ flavour })
  boundaries: Boundary[]; // performanceContext({ boundaries }) / avoidList
  skew?: Skew; // eraRerank(list, skew) / audienceParams bias: recent → "younger", classic → "older"
};

export function leverContext(levers: Partial<Levers>, kind: string): LeverContext {
  const l = parseLevers({ ...DEFAULT_LEVERS, ...levers });
  const base = defaultBoundaries(kind);
  const boundaries: Boundary[] =
    l.edge === "cleaner" ? ["clean"]
    : l.edge === "edgier" ? [...new Set<Boundary>([...base.filter((b) => b !== "clean"), "edgy", "dark"])]
    : base;
  return { flavour: l.flavour, boundaries, ...(l.era === "recent" ? { skew: "younger" as const } : l.era === "classic" ? { skew: "older" as const } : {}) };
}

// Which levers mean something for this act (edginess: comics, speakers, poets, theatre, podcasters;
// era: acts that play covers or references).
export function leversFor(kind: string): (keyof Levers)[] {
  const talk = ["comedian", "speaker", "poet", "theatre", "podcaster", "author", "magician"].includes(kind);
  const covers = ["musician", "dj", "busker", "dancer"].includes(kind);
  return ["flavour", "risk", "feeFloor", "maxDriveKm", ...(talk ? (["edge"] as const) : []), ...(covers || talk ? (["era"] as const) : [])];
}
