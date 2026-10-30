// Insights (PLAN §18 Q17): pure transforms from data the plan already has into chart rows plus a
// one-line takeaway each. No fetches, no React; unit-tested in tests/unit/analytics.test.ts.
// Relative/type-only imports so Node's TS support runs it directly.
import type { CityPlan, Outreach, OutreachStatus, Plan } from "@tourbo/core/shared/types.ts";
import type { RegionIdea, CityIdeas } from "@tourbo/core/engine/ideas-rank.ts";
import type { AudienceProfile, AudienceSide } from "@tourbo/core/context/audience.ts";

const DAY = 86_400_000;
const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function money(n: number, currency = "USD", compact = false) {
  const opts: Intl.NumberFormatOptions = { maximumFractionDigits: compact && Math.abs(n) >= 10_000 ? 1 : 0, notation: compact && Math.abs(n) >= 10_000 ? "compact" : "standard" };
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency || "USD", ...opts }).format(n);
  } catch {
    return `${new Intl.NumberFormat("en", opts).format(n)} ${currency}`;
  }
}
export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const signed = (n: number, currency?: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n), currency)}`;

const played = (s: CityPlan) => s.money?.verdict !== "skip";

// --- Where are your fans strongest? (ranked bars, one hue; dropped nights greyed) ---
export type FanBar = { city: string; score: number; fanIndex?: number; dropped: boolean; thin: boolean };
export function fansByCity(plan: Pick<Plan, "stops">) {
  const bars: FanBar[] = plan.stops
    .map((s) => ({ city: s.city.name, score: Math.round(s.score), fanIndex: s.fanIndex, dropped: !played(s), thin: s.thinData }))
    .sort((a, b) => b.score - a.score);
  if (!bars.length) return { bars, takeaway: "" };
  const [top, low] = [bars[0], bars.at(-1)!];
  const ratio = low.score > 0 ? top.score / low.score : 0;
  const takeaway =
    bars.length === 1 ? `${top.city}: fan strength ${top.score} of 100.`
    : ratio >= 1.5 ? `${top.city} has the most fans, about ${ratio.toFixed(1)}× ${low.city}.`
    : `Fans are spread evenly; ${top.city} leads by a little.`;
  return { bars, takeaway };
}

// --- Map: fans (size) × money (colour) in one line ---
export function mapTakeaway(plan: Pick<Plan, "stops">) {
  const fans = fansByCity(plan).bars.filter((b) => !b.dropped);
  const m = moneyByNight(plan).bars.filter((b) => !b.dropped);
  if (!fans.length) return "";
  const topFans = fans[0].city;
  if (!m.length) return `${topFans} has the most fans; no money estimate yet.`;
  const topMoney = [...m].sort((a, b) => b.profit - a.profit)[0].city;
  const losing = m.filter((b) => b.profit < 0).map((b) => b.city);
  const lead = topFans === topMoney ? `${topFans} has the most fans and makes the most money` : `${topFans} has the most fans; ${topMoney} makes the most money`;
  return `${lead}${losing.length ? `; ${and(losing)} ${losing.length === 1 ? "loses" : "lose"} money.` : "."}`;
}

// --- Which nights make money? (diverging bars around zero, in tour order) ---
export type MoneyBar = { city: string; date?: string; profit: number; verdict: string; dropped: boolean };
export function moneyByNight(plan: Pick<Plan, "stops">) {
  const withMoney = plan.stops.filter((s) => s.money);
  const currency = withMoney[0]?.money?.currency ?? "";
  const bars: MoneyBar[] = withMoney.map((s) => ({ city: s.city.name, date: s.date, profit: s.money!.profit, verdict: s.money!.verdict, dropped: !played(s) }));
  const live = bars.filter((b) => !b.dropped);
  const total = live.reduce((n, b) => n + b.profit, 0);
  const losing = live.filter((b) => b.profit < 0);
  const best = [...live].sort((a, b) => b.profit - a.profit)[0];
  const takeaway = !live.length
    ? ""
    : losing.length === 0
      ? `Every night makes money; ${best.city} makes the most (${signed(best.profit, currency)}).`
      : losing.length === live.length
        ? `Every night loses money as planned. Try a smaller room or a support slot.`
        : `${plural(live.length - losing.length, "night")} make money; ${and(losing.map((b) => b.city))} ${losing.length === 1 ? "loses" : "lose"} money.`;
  return { bars, total, currency, losing: losing.length, takeaway };
}

// --- How much of what you take do costs eat? (meter: costs / takings) ---
export function takings(plan: Pick<Plan, "stops">) {
  const live = plan.stops.filter((s) => s.money && played(s));
  if (!live.length) return undefined;
  const currency = live[0].money!.currency;
  const take = live.reduce((n, s) => n + s.money!.artistTake + (s.money!.sponsor ?? 0), 0);
  const costs = live.reduce((n, s) => n + s.money!.costs, 0);
  const sponsor = live.reduce((n, s) => n + (s.money!.sponsor ?? 0), 0);
  const tickets = live.reduce((n, s) => n + s.money!.tickets, 0);
  const share = take > 0 ? costs / take : 1;
  const pct = Math.round(share * 100);
  const takeaway =
    take <= 0 ? "These nights bring in nothing for you yet; costs are all out of pocket."
    : share > 1 ? `Costs are ${pct}% of what you take: you pay ${money(costs - take, currency)} more than you earn.`
    : `Costs eat ${pct}% of what you take; you keep ${money(take - costs, currency)}.`;
  return { take, costs, sponsor, tickets, share, currency, takeaway };
}

// --- How far is each drive? (bars per leg; the longest emphasised) ---
export type LegBar = { from: string; to: string; km: number; days?: number; perDay?: number; longest: boolean };
export function legs(plan: Pick<Plan, "stops" | "legs" | "totalKm">) {
  const dateOf = new Map(plan.stops.map((s) => [s.city.name, s.date]));
  const max = Math.max(0, ...plan.legs.map((l) => l.km));
  const bars: LegBar[] = plan.legs.map((l) => {
    const a = dateOf.get(l.from);
    const b = dateOf.get(l.to);
    const days = a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY)) : undefined;
    return { from: l.from, to: l.to, km: Math.round(l.km), days, perDay: days ? Math.round(l.km / days) : undefined, longest: l.km === max && max > 0 };
  });
  const top = bars.find((b) => b.longest);
  const total = Math.round(plan.totalKm || bars.reduce((n, b) => n + b.km, 0));
  const tight = bars.filter((b) => b.days !== undefined && (b.days === 0 || (b.perDay ?? 0) > 600));
  const takeaway = !top
    ? ""
    : `${num(total)} km in all; the longest hop is ${top.from} → ${top.to} (${num(top.km)} km${top.days !== undefined ? `, ${plural(top.days, "day")}` : ""}).${tight.length ? ` ${plural(tight.length, "hop")} ${tight.length === 1 ? "is" : "are"} a long day.` : ""}`;
  return { bars, total, takeaway };
}

// --- Are ticket sales on pace? (plan curve vs check-ins, per show) ---
// Same rule of thumb as engine/pace.ts soldShare: half of small-show tickets sell in the last ~10 days.
export const soldShare = (d: number) => 1 / (1 + Math.max(0, d) / 10);
export type Checkin = { stopIndex: number; sold: number; at: string };
export type PaceShow = {
  stopIndex: number;
  city: string;
  date: string;
  expected: number;
  capacity: number;
  curve: { days: number; tickets: number }[]; // plan: tickets sold by `days` before the show
  sold: { days: number; tickets: number }[]; // check-ins
  status: "ahead" | "on track" | "behind" | "well behind";
  expectedNow: number;
  last: number;
};
export function pace(plan: Pick<Plan, "stops">, checkins: Checkin[]) {
  const shows: PaceShow[] = [];
  plan.stops.forEach((s, i) => {
    const mine = checkins.filter((c) => c.stopIndex === i).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (!mine.length || !s.date || !played(s)) return;
    const show = Date.parse(`${s.date}T20:00:00`);
    const capacity = s.money?.capacity ?? s.capacity?.max ?? Math.max(...mine.map((c) => c.sold), 1);
    const expected = s.money?.tickets ?? Math.round(capacity * 0.8);
    const sold = mine.map((c) => ({ days: Math.max(0, Math.round((show - Date.parse(c.at)) / DAY)), tickets: c.sold }));
    const from = Math.max(30, ...sold.map((p) => p.days + 5));
    const steps = 24;
    const curve = Array.from({ length: steps + 1 }, (_, k) => {
      const days = Math.round(from - (from * k) / steps);
      return { days, tickets: Math.round(expected * soldShare(days)) };
    });
    const lastPt = sold.at(-1)!;
    const expectedNow = Math.max(1, Math.round(expected * soldShare(lastPt.days)));
    const ratio = lastPt.tickets / expectedNow;
    const status = ratio >= 1.3 ? "ahead" : ratio >= 0.8 ? "on track" : ratio >= 0.5 ? "behind" : "well behind";
    shows.push({ stopIndex: i, city: s.city.name, date: s.date, expected, capacity, curve, sold, status, expectedNow, last: lastPt.tickets });
  });
  const behind = shows.filter((s) => s.status === "behind" || s.status === "well behind");
  const takeaway = !shows.length
    ? ""
    : behind.length
      ? `${and(behind.map((s) => s.city))} ${behind.length === 1 ? "is" : "are"} behind the plan; see Ticket sales for what to do.`
      : `${shows.length === 1 ? shows[0].city : "Every show you checked"} is on or ahead of the plan.`;
  return { shows, takeaway };
}

// --- How are the venue emails going? (funnel, ordinal steps) ---
export const FUNNEL = [
  { key: "drafted", label: "Written" },
  { key: "sent", label: "Sent" },
  { key: "replied", label: "Replied" },
  { key: "confirmed", label: "Confirmed" },
] as const;
const REACHED: Record<OutreachStatus, number> = { drafted: 0, sent: 1, interested: 2, hold: 2, passed: 2, confirmed: 3 };
export function funnel(rows: Pick<Outreach, "status" | "city">[]) {
  const stages = FUNNEL.map((f, i) => ({ ...f, count: rows.filter((r) => REACHED[r.status] >= i).length }));
  const passed = rows.filter((r) => r.status === "passed").length;
  const [all, sent, , confirmed] = stages.map((s) => s.count);
  const unsent = all - sent;
  const takeaway = !all
    ? ""
    : `${confirmed} of ${plural(all, "venue")} confirmed${passed ? `, ${passed} said no` : ""}${unsent ? `; ${unsent} ${unsent === 1 ? "email isn't" : "emails aren't"} sent yet.` : "."}`;
  return { stages, passed, takeaway };
}

// --- Idea × city heat grid (Ideas): every idea's fit in every city ---
export type GridRow = { ref: string; idea: string; category: string; cells: (number | undefined)[]; best: number; short?: string; detail?: string };
export function ideaGrid(data: { cities: Pick<CityIdeas, "city" | "ideas">[]; region: RegionIdea[] }, maxRows = 8) {
  const cities = data.cities.map((c) => c.city);
  const norm = (s: string) => s.toLowerCase().trim();
  const valueIn = (ref: string, city: string) => data.cities.find((c) => c.city === city)?.ideas.find((i) => norm(i.ref) === norm(ref))?.value;
  const rows: GridRow[] = data.region.slice(0, maxRows).map((r) => {
    const cells = cities.map((c) => r.fit?.find((f) => f.city === c)?.value ?? (r.fitFrom === "map" ? undefined : (r.best.find((b) => b.city === c)?.value ?? valueIn(r.ref, c))));
    const vals = cells.filter((v): v is number => v !== undefined);
    return { ref: r.ref, idea: r.idea, category: r.category, cells, best: vals.length ? cells.indexOf(Math.max(...vals)) : -1, short: r.short, detail: r.detail };
  });
  const all = rows.flatMap((r) => r.cells.filter((v): v is number => v !== undefined));
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const top = rows[0];
  const takeaway = top && top.best >= 0 ? top.short ?? `${top.ref} fits ${cities[top.best]} best.` : "";
  return { cities, rows, lo, hi, takeaway };
}
// 0–1 position of a value on the grid's own scale (so small spreads still read).
export const heat = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 1);

// --- Who are your fans? (age over/under-index, from the audience profile when present) ---
export const AGE_ORDER = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
const AGE_TEXT: Record<(typeof AGE_ORDER)[number], string> = {
  "24_and_younger": "under 25",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};
export function ageBars(side: AudienceSide) {
  const bars = AGE_ORDER.map((k) => ({ key: k, label: AGE_TEXT[k], value: side.age[k] ?? 0 }));
  const top = [...bars].sort((a, b) => b.value - a.value)[0];
  const g = side.gender;
  const gender = g.female - g.male > 0.05 ? "more women than usual" : g.male - g.female > 0.05 ? "more men than usual" : "about as many men as women";
  const takeaway = `Most over-represented: ${top.label}; ${gender}.`;
  return { bars, takeaway, gender };
}
export function audienceOf(plan: unknown): AudienceProfile | undefined {
  const a = (plan as { audience?: AudienceProfile } | undefined)?.audience;
  return a && (a.act || a.city) ? a : undefined;
}

// --- Headline numbers for the KPI row ---
export function headline(plan: Pick<Plan, "stops" | "totalKm">) {
  const live = plan.stops.filter(played);
  const m = live.filter((s) => s.money);
  return {
    nights: live.length,
    profit: m.length ? m.reduce((n, s) => n + s.money!.profit, 0) : undefined,
    tickets: m.length ? m.reduce((n, s) => n + s.money!.tickets, 0) : undefined,
    currency: m[0]?.money?.currency ?? "",
    km: Math.round(plan.totalKm ?? 0),
  };
}
