import type { CityPlan, Plan } from "../shared/types.ts";
import { grade, money, times, type Chip, type Evidence, type ExplainItem, type Fact } from "./explain.ts";
import type { CityIdeas, Idea } from "./ideas-rank.ts";
import type { CitySet, SetEntry } from "./set.ts";

// Facts builders for grounded "why" lines: plan nights, deals, ideas, set moves, chart takeaways.
// Pure and client-safe; every fact is a number or name already in the plan / ideas / set data.

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => Math.round(n * 100);
const key = (s: string) => s.toLowerCase().split(",")[0].replace(/[^a-z]/g, "");
const chipFor = (e: Evidence, strong: string, hedged: string, meter?: number): Chip | undefined =>
  e === "none" ? undefined : e === "strong" ? { text: strong, meter } : { text: hedged, meter, hedged: true };

// ---------- Place features: open-data facts that changed a suggestion (PLAN §18 Q18) ----------

// Short phrases a why-line may cite ("lower local incomes", "holiday weekend"); only surfaced
// place features, after the fan-data facts (fan data is the hero).
export function placeFacts(s: Pick<CityPlan, "place" | "money">, only?: string[]): Fact[] {
  const p = s.place;
  if (!p) return [];
  const out: Fact[] = [];
  const on = (k: string) => p.surfaced.includes(k) && (!only || only.includes(k));
  const text = (k: string) => p.facts.find((f) => f.id === `place.${k}`)?.text ?? p.changes[k] ?? "";
  const n = p.priceNudge;
  if (n && on("priceNudge")) {
    const pct = Math.round(Math.abs(n.factor - 1) * 100);
    out.push({ key: "place.priceNudge", label: text("priceNudge"), value: n.factor < 1 ? -pct : pct, unit: "pct", say: s.money?.priceNudge?.note ?? (n.factor < 1 ? `price nudged −${pct}% for lower local incomes` : `price nudged +${pct}% for higher local incomes`) });
  }
  const r = p.dateRisk;
  if (r && on("dateRisk")) {
    const hol = r.holidays[0];
    out.push({ key: "place.dateRisk", label: text("dateRisk"), value: hol?.name ?? r.level, say: hol ? `a public holiday around the date (${hol.name})` : (r.reasons[0] ?? "").replace(/\.$/, "").toLowerCase() });
  }
  const y = p.youngerCrowd;
  if (y && on("youngerCrowd")) out.push({ key: "place.youngerCrowd", label: text("youngerCrowd"), value: y.skew, say: `a ${y.skew} crowd` });
  const t = p.tone;
  if (t && on("tone")) out.push({ key: "place.tone", label: text("tone"), value: t.strictness, say: `local rules call for a ${t.strictness} tone` });
  const h = p.spendHeadroom;
  if (h && on("spendHeadroom")) out.push({ key: "place.spendHeadroom", label: text("spendHeadroom"), value: h.level, say: h.level === "tight" ? "a night out is a big spend here" : "a night out is a small spend here" });
  return out;
}

// ---------- Plan nights: why this city over the next-best one it beat ----------

// scores: city → 0–100 fan strength from the run's trace (cityMetrics(...).scores); the best
// city not in the plan is "the next-best alternative".
export function nightItems(plan: Plan, scores: Map<string, number> = new Map()): ExplainItem[] {
  const picked = new Set(plan.stops.map((s) => key(s.city.name)));
  // A city the act swapped out (Tourbo's own pick) is compared on that night, not used as "the
  // next-best city" for every other night.
  const swappedOut = (s: CityPlan) => (s.yours?.changed.includes("city") && s.yours.suggested && key(s.yours.suggested.city) !== key(s.city.name) ? s.yours.suggested.city : undefined);
  const theirs = new Set(plan.stops.map(swappedOut).filter((c): c is string => !!c).map(key));
  const skipped = [...scores].filter(([c]) => !picked.has(key(c)) && !theirs.has(key(c))).sort((a, b) => b[1] - a[1])[0];
  const scoreOf = (city: string) => [...scores].find(([c]) => key(c) === key(city))?.[1];
  const cur = plan.money?.currency ?? plan.stops.find((s) => s.money)?.money?.currency;
  return plan.stops.map((s, i): ExplainItem => {
    const city = s.city.name;
    const score = Math.round(s.score);
    const facts: Fact[] = [{ key: "fan", label: `fan strength in ${city}`, value: score, unit: "score" }];
    const names: string[] = [];
    // The act's pick: the fan data against Tourbo's suggestion for that night, stated plainly either
    // way (never a "why this pick" claim; no written line).
    const tourbo = swappedOut(s);
    const theirScore = tourbo !== undefined ? scoreOf(tourbo) : undefined;
    if (tourbo && theirScore !== undefined) {
      const o = Math.round(theirScore);
      facts.push({ key: "fanTourbo", label: `fan strength in ${tourbo} (Tourbo's suggestion)`, value: o, unit: "score" });
      facts[0].say = `fan strength ${score} vs ${o} in ${tourbo}`;
      if (s.money) facts.push({ key: "profit", label: "estimated profit", value: s.money.profit, unit: "money" });
      const text = score === o ? `fans ${score}, same as ${tourbo}` : `fans ${score} here vs ${o} in ${tourbo}`;
      return { id: `night:${i}`, kind: "compare", subject: city, other: tourbo, facts, names, currency: cur, evidence: "some", chip: { text, meter: score / 100, hedged: score < o } };
    }
    let margin: number | undefined;
    const other = skipped && skipped[1] < s.score ? skipped[0] : undefined;
    if (other) {
      const o = Math.round(skipped![1]);
      margin = (score - o) / Math.max(o, 1);
      facts.push({ key: "fanOther", label: `fan strength in ${other}`, value: o, unit: "score" });
      facts[0].say = `fan strength ${score} vs ${o}`;
      if (o > 0 && score / o >= 1.3) facts.push({ key: "fanRatio", label: `times stronger than ${other}`, value: r1(score / o), unit: "x", say: `${times(r1(score / o))} the fans` });
    }
    const lean = s.fanIndex && plan.medianFanIndex ? r1(s.fanIndex / plan.medianFanIndex) : undefined;
    if (lean && lean >= 1.1) {
      facts.push({ key: "lean", label: "fans more concentrated than a typical city", value: lean, unit: "x", say: `fans ${times(lean)} more concentrated than a typical city` });
      if (margin === undefined) margin = lean - 1;
    }
    if (margin === undefined) margin = score >= 60 ? score / 100 : undefined;
    const m = s.money;
    if (m) {
      facts.push({ key: "tickets", label: "expected tickets", value: m.tickets, unit: "count" });
      facts.push({ key: "capacity", label: "room capacity", value: m.capacity, unit: "count" });
      if (s.venue?.name) {
        names.push(s.venue.name);
        facts.push({ key: "venue", label: "room", value: s.venue.name, say: `${s.venue.name} fits ~${m.tickets.toLocaleString("en-US")} expected` });
      }
      facts.push({ key: "profit", label: "estimated profit", value: m.profit, unit: "money", say: `${m.profit < 0 ? "loses" : "earns"} ~${money(Math.abs(m.profit), m.currency)} (estimate)` });
    }
    const taste = s.facts?.cityCulture?.[0]?.name ?? s.facts?.localSpots?.[0]?.name;
    if (taste) facts.push({ key: "taste", label: "something fans here love", value: taste });
    const leg = plan.legs.find((l) => key(l.to) === key(city));
    if (leg) facts.push({ key: "km", label: "drive or flight in", value: Math.round(leg.km), unit: "km" });
    facts.push(...placeFacts(s, ["dateRisk", "youngerCrowd", "tone"]));
    const evidence = grade({ margin, alternative: !!other || !!lean, thin: s.thinData, fallback: plan.artist.basis === "city" });
    const chip = other
      ? chipFor(evidence, `fans ${score} vs ${Math.round(skipped![1])} in ${other}`, `a bit more fans than ${other}`, score / 100)
      : lean
        ? chipFor(evidence, `fans ${times(lean)} more concentrated`, "fans a bit more concentrated here", Math.min(1, lean / 3))
        : chipFor(evidence, `fan strength ${score}`, "a solid fan base", score / 100);
    return { id: `night:${i}`, kind: other ? "compare" : "pick", subject: city, other, facts, names, currency: cur, evidence, chip };
  });
}

// ---------- Deals: why this deal / price for the room ----------

export function dealItems(plan: Plan): ExplainItem[] {
  return plan.stops.flatMap((s, i): ExplainItem[] => {
    const m = s.money;
    if (!m) return [];
    const deal = m.deal.replace(/_/g, " ");
    const facts: Fact[] = [
      { key: "deal", label: "deal", value: deal },
      { key: "price", label: "ticket price", value: m.price, unit: "money" },
      { key: "sell", label: "of the room sold", value: pct(m.sellThrough), unit: "pct", say: `${pct(m.sellThrough)}% of ${m.capacity.toLocaleString("en-US")} seats sold` },
      { key: "capacity", label: "seats", value: m.capacity, unit: "count" },
      { key: "profit", label: "estimated profit", value: m.profit, unit: "money", say: `~${money(m.profit, m.currency)} profit (estimate)` },
    ];
    let margin: number | undefined;
    if (m.breakEvenPrice && m.price > 0) {
      margin = (m.price - m.breakEvenPrice) / m.breakEvenPrice;
      facts.push({ key: "breakEven", label: "break-even ticket price", value: m.breakEvenPrice, unit: "money", say: `break-even at ~${money(m.breakEvenPrice, m.currency)}` });
    } else if (m.costs > 0) margin = m.profit / m.costs;
    facts.push(...placeFacts(s, ["priceNudge", "spendHeadroom"]));
    const evidence = grade({ margin, alternative: !!m.breakEvenPrice, thin: s.thinData });
    const chip = chipFor(evidence, `${pct(m.sellThrough)}% full, ~${money(m.profit, m.currency)}`, `likely profitable (estimate)`, Math.min(1, m.sellThrough));
    return [{ id: `deal:${i}`, kind: "pick", subject: `${deal} in ${s.city.name}`, facts, names: [s.city.name], currency: m.currency, evidence, chip }];
  });
}

// ---------- Ideas: why this cover / topic here and not elsewhere ----------

// Ranks inside the idea's own why line ("#2 with your fans in Columbus, vs #11 … overall").
const ranks = (why: string) => [...why.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));

export function ideaItem(city: string, idea: Idea, basis: "act" | "city" = "act"): ExplainItem {
  const [here, overall] = ranks(idea.why);
  const facts: Fact[] = [{ key: "ref", label: idea.category, value: idea.ref }];
  let margin: number | undefined;
  let chipText = "";
  if (idea.category === "cover" && here !== undefined) {
    facts.push({ key: "rankHere", label: `rank with fans in ${city}`, value: here, unit: "rank", say: `#${here} with your fans in ${city}` });
    if (overall !== undefined) {
      facts.push({ key: "rankOverall", label: "rank with your fans overall", value: overall, unit: "rank", say: `vs #${overall} with your fans overall` });
      margin = (overall - here) / overall;
      chipText = `#${here} here vs #${overall} overall`;
    } else {
      margin = here <= 10 ? 0.2 : 0.05;
      chipText = `#${here} with your fans here`;
    }
  } else {
    margin = idea.value;
    facts.push({ key: "value", label: `how much more ${city} likes it than the other cities`, value: Math.round(idea.value * 100), unit: "pct", say: `${city} leans to it more than the other cities here` });
    chipText = `${city} over-indexes +${Math.round(idea.value * 100)}%`;
  }
  if (idea.cities?.length) facts.push({ key: "alsoIn", label: "also ranks in", value: idea.cities.join(", ") });
  const alternative = idea.category === "cover" ? overall !== undefined : margin !== undefined && idea.value > 0;
  const evidence = grade({ margin, alternative, fallback: basis === "city" && idea.category === "cover" });
  const chip = chipFor(evidence, chipText, idea.category === "cover" ? "a bit more popular with your fans here" : `a bit more popular in ${city}`, margin !== undefined ? Math.max(0, Math.min(1, margin)) : undefined);
  return { id: `idea:${city}:${idea.ref}`, kind: "pick", subject: idea.ref, facts, names: [city, ...(idea.names ?? [])], evidence, chip };
}

export const ideaItems = (cities: CityIdeas[], basis: "act" | "city" = "act") => cities.flatMap((c) => c.ideas.map((i) => ideaItem(c.city, i, basis)));

// ---------- Set moves: why this song / bit goes here ----------

export function setMoveItem(c: CitySet, pos: number, e: SetEntry = c.order[pos]): ExplainItem {
  const used = c.facts.filter((f) => e.refs.some((r) => r.toLowerCase() === f.name.toLowerCase()));
  const facts: Fact[] = [{ key: "move", label: "slot", value: e.move }];
  for (const [k, f] of used.entries()) {
    facts.push({ key: `ref${k}`, label: f.detail, value: f.name, say: `${f.name}: ${f.detail}` });
    if (typeof f.value === "number") facts.push({ key: `val${k}`, label: `${f.name} weight`, value: f.value, unit: f.kind === "cover" ? "rank" : "plain" });
  }
  if (e.fit !== undefined) facts.push({ key: "fit", label: `fit with ${c.city}`, value: Math.round(e.fit * 100), unit: "pct" });
  const margin = e.fit !== undefined ? e.fit : used.length ? 0.1 : undefined;
  const evidence = grade({ margin, alternative: used.length > 0 });
  const chip = used[0] ? chipFor(evidence, `${c.city} loves ${used[0].name}`, `fits ${c.city}`, e.fit) : chipFor(evidence, `fits ${c.city}`, `fits ${c.city}`, e.fit);
  return { id: `set:${c.city}:${pos}`, kind: "pick", subject: e.title, facts, names: [c.city, ...used.map((f) => f.name)], evidence, chip };
}

export const setItems = (cities: CitySet[]) => cities.flatMap((c) => c.order.map((e, pos) => setMoveItem(c, pos, e)));

// ---------- Chart takeaways: the leader against the runner-up ----------

export function takeawayItem(opts: { id: string; title: string; series: { label: string; value: number }[]; unit?: Fact["unit"]; currency?: string; measure?: string }): ExplainItem {
  const sorted = [...opts.series].sort((a, b) => b.value - a.value);
  const [top, next] = sorted;
  const measure = opts.measure ?? "value";
  const facts: Fact[] = top ? [{ key: "top", label: `${measure} for ${top.label}`, value: top.value, unit: opts.unit, say: `${top.label} leads` }] : [];
  let margin: number | undefined;
  if (top && next) {
    facts.push({ key: "next", label: `${measure} for ${next.label}`, value: next.value, unit: opts.unit, say: `ahead of ${next.label}` });
    margin = next.value > 0 ? (top.value - next.value) / next.value : top.value > 0 ? 1 : undefined;
  }
  const evidence = grade({ margin, alternative: !!next });
  const chip = top && chipFor(evidence, `${top.label} leads`, `${top.label} slightly ahead`);
  return { id: opts.id, kind: "takeaway", subject: opts.title, other: next?.label, facts, names: sorted.slice(0, 3).map((s) => s.label), currency: opts.currency, evidence, chip };
}
