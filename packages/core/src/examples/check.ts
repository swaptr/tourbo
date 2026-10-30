import { discipline } from "../disciplines/index.ts";
import { ticketPace } from "../engine/pace.ts";
import type { PerformerKind } from "../shared/types.ts";
import type { CompareCity, HomeExample } from "./types.ts";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The words must match the numbers: "skip/cut <city>" or "<city> loses" only when that night
// actually loses money. Returns the problem, or undefined when the example is consistent.
export function headlineMismatch(ex: HomeExample): string | undefined {
  const c = ex.compare;
  if (!c || c.skipped.profit < 0) return undefined;
  const name = esc(c.skipped.name);
  const text = [ex.decision.headline, ...ex.decision.lines, c.line].join(" ");
  if (new RegExp(`\\b(skip|cut|drop)\\s+${name}\\b|\\b${name}\\b[^.;]*\\bloses?\\b`, "i").test(text)) return `says skip/loses ${c.skipped.name}, but that night makes ${c.skipped.profit} ${c.currency}`;
  return undefined;
}

// Money words must match money numbers: no "$-…" strings, no negative delta called "more", and a
// chosen city that earns less than the skipped one needs a stated reason.
export function compareMismatch(ex: HomeExample): string | undefined {
  const text = [ex.decision.headline, ...ex.decision.lines, ex.compare?.line ?? "", ex.losingNight?.line ?? ""].join(" ");
  if (/[$€£₹]\s?-|\b[A-Z]{2,3}\$?\s?-\d|~-\d/.test(text)) return `negative amount written as "-": ${text.match(/.{0,20}[$€£₹]\s?-.{0,10}/)?.[0] ?? ""}`;
  const c = ex.compare;
  if (!c) return undefined;
  const delta = c.chosen.profit - c.skipped.profit;
  if (delta < 0 && /more per night/.test(text)) return `says "more per night" but ${c.chosen.name} earns ${-delta} less than ${c.skipped.name}`;
  const wash = -delta <= 0.05 * Math.abs(c.skipped.profit) && /about the same money/.test(text);
  if (delta < 0 && !c.reason && !wash) return `${c.chosen.name} earns less than ${c.skipped.name} and no reason is given`;
  return undefined;
}

// A rehearsal card needs listeners' reactions (the card shows them by their own words; it quotes
// line 1 only when someone reacted to it, and never names a line it can't show).
export function rehearsalProblem(ex: HomeExample): string | undefined {
  if (ex.feature !== "rehearsal") return undefined;
  if (!ex.decision.lines.some((l) => / line \d+: “.+”$/.test(l))) return "no listener reactions";
  return undefined;
}

// The act must be an act: a misresolved entity (a book's reader's guide, "Title: Subtitle (Series)")
// never headlines a card.
export function actProblem(ex: HomeExample): string | undefined {
  const n = ex.act.name;
  if (/[:()]/.test(n) || n.length > 70 || /\b(guide|edition|vol\.|chronicle)\b/i.test(n)) return `"${n}" doesn't read as an act's name`;
  return undefined;
}

export const exampleProblem = (ex: HomeExample) => actProblem(ex) ?? headlineMismatch(ex) ?? compareMismatch(ex) ?? rehearsalProblem(ex) ?? numbersProblem(ex);

// ---- Numbers that must agree (the landing gate) ----
// Root cause of the "~5,600 expected in a ~400-seat room" cards: the engine's expected tickets
// for a multi-day stay (an exhibition) or a multi-show run are the whole run's total (capacity ×
// days or shows), while the card printed them next to the room's per-day capacity as "seats". The
// pace check then capped its projection at one day's capacity ("on pace for ~400 of 5,600"). The
// route's nights and the city-vs-city table also came from two money runs (leg km vs home km), so
// one panel could show two profits for the same night. reconcileExample rewrites stored examples
// from their own numbers (no new data); numbersProblem rejects anything still inconsistent.

export const money = (n: number, cur: string) => `${n < 0 ? "−" : ""}${cur === "USD" ? "$" : cur === "AUD" ? "A$" : cur === "EUR" ? "€" : cur === "INR" ? "₹" : `${cur} `}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const count = (n: number) => Math.round(n).toLocaleString("en-US");
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
const ROUTE_ROOM = 500; // the engine's standard room when a night has no named one (economics.ts ROOM_DEFAULT_CAPACITY["music venue"])
// The engine's room-fit rule (edit.ts bestVenue): a room fits from 0.8 × roomMin to 1.2 × roomMax.
// The examples were planned with roomMin 800 / roomMax 3000, and a city's draw is
// √(roomMin × roomMax) × √(its lean), so the floor is 0.8 × √(roomMin / roomMax) of the draw.
const ROOM_MIN = 800, ROOM_MAX = 3000;
export const ROOM_FIT_FLOOR = 0.8 * Math.sqrt(ROOM_MIN / ROOM_MAX);
const WASH = 0.05; // nights within 5% earn "about the same"
const ROUND1 = (x: number) => Math.round(x * 10) / 10;

// How many days or shows one stop's expected tickets cover (1 = a single night).
export function runOf(kind: string, deal?: string): { n: number; unit?: "days" | "shows" } {
  const d = discipline(kind as PerformerKind);
  const stay = d.stayDays > 1 && (deal ? deal === "exhibition" : d.deals?.includes("exhibition"));
  if (stay) return { n: d.stayDays, unit: "days" };
  return (d.shows ?? 1) > 1 ? { n: d.shows!, unit: "shows" } : { n: 1 };
}
const dealOf = (ex: HomeExample) => ex.decision.lines.map((l) => l.match(/^Best deal: (\w+) at /)?.[1]).find(Boolean);

// The pull ratio a reader can check against the "Fan pull for its size" row (1-decimal, capped).
const leanShown = (l: number) => (l > 0.05 && l <= 10 ? ROUND1(l) : undefined);
function pullPhrase(c: CompareCity, s: CompareCity) {
  const a = leanShown(c.lean), b = leanShown(s.lean);
  const r = a && b ? ROUND1(a / b) : 0;
  if (r >= 1.15) return r > 10 ? "over 10× the fan pull for its size" : `${r.toFixed(1)}× the fan pull for its size`;
  return `fan strength ${Math.round(c.fanStrength)} vs ${Math.round(s.fanStrength)}`;
}
const PULL = /(?:over 10×|\d+(?:\.\d+)?×) the fan pull for its size|fan strength \d+(?:\.\d+)? vs \d+(?:\.\d+)?/;

export function reconcileExample(src: HomeExample): HomeExample {
  const ex: HomeExample = structuredClone(src);
  const cur = ex.tourProfit?.currency ?? ex.profit?.currency ?? ex.compare?.currency ?? "USD";
  const swap = (from: string, to: string) => {
    if (from === to) return;
    ex.decision = { headline: ex.decision.headline.split(from).join(to), lines: ex.decision.lines.map((l) => l.split(from).join(to)) };
    if (ex.compare) ex.compare.line = ex.compare.line.split(from).join(to);
  };
  const route = ex.route ?? [];

  // 1. Tour total = its paying nights.
  if (route.length && ex.tourProfit) {
    const paying = route.filter((r) => r.profit > 0);
    const amount = paying.reduce((n, r) => n + r.profit, 0);
    if (ex.feature === "route") swap(money(ex.tourProfit.amount, cur), money(amount, cur));
    ex.tourProfit = { ...ex.tourProfit, amount, nights: paying.length };
  }

  // 2. The chosen city's night profit is its night on the route; the "more per night" follows.
  const c = ex.compare;
  if (c) {
    const night = route.find((r) => r.name === c.chosen.name);
    if (night && night.profit !== c.chosen.profit) {
      const before = c.chosen.profit - c.skipped.profit;
      c.chosen.profit = night.profit;
      const after = c.chosen.profit - c.skipped.profit;
      // A flip within a few percent is a wash, said as such (the pick then rests on the fan rows).
      if (before >= 0 && after >= 0) swap(`~${money(before, c.currency)} more per night`, `~${money(after, c.currency)} more per night`);
      else if (before >= 0 && after < 0 && !c.reason && -after <= WASH * Math.abs(c.skipped.profit)) {
        swap(`, ~${money(before, c.currency)} more per night`, ", about the same money per night");
        swap(`; ~${money(before, c.currency)} more per night.`, `; about the same money per night (~${money(-after, c.currency)} apart).`);
      }
    }
    // 3. The "×" in the line is the ratio of the two rows the table shows.
    const old = c.line.match(PULL)?.[0];
    if (old) swap(old, pullPhrase(c.chosen, c.skipped));
  }

  // 4. Weakest night: a night on the route is its route profit, and "thinnest" is the real minimum.
  const ln = ex.losingNight;
  if (ln && route.length) {
    // An off-route city only when the card's own table shows it (the route card's skipped city);
    // otherwise the weakest night is the route's own thinnest, which the "why?" lists.
    const shownOff = ex.feature === "route" && ex.compare?.skipped.name === ln.city;
    const offRoute = route.some((r) => r.name === ln.city) || !shownOff ? [] : [{ name: ln.city, profit: -ln.amount, date: "" }];
    const worst = [...route, ...offRoute].reduce((a, b) => (b.profit < a.profit ? b : a));
    const p = worst.profit;
    const onRoute = !!worst.date && route.includes(worst as (typeof route)[number]);
    const day = onRoute ? new Date(`${worst.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "";
    const line =
      p < 0
        ? onRoute ? `${worst.name} on a ${day} loses ~${money(-p, cur)}: move it to a weekend or a smaller room.` : `${worst.name} would lose ~${money(-p, cur)}, so it's left out.`
        : `Every nearby night pays; the thinnest is ${worst.name} at ~${money(p, cur)}.`;
    if (line !== ln.line) swap(ln.line, line);
    ex.losingNight = { ...ln, city: worst.name, amount: -p, loses: p < 0, line };
  }

  // 5. Runs (exhibitions, multi-night runs): the expected count covers the run, the room holds one
  // day's or one show's worth. Only where the count is bigger than the room (the evidence of a run).
  const cap = ex.room?.capacity;
  const run = runOf(ex.act.kind, dealOf(ex));
  if (cap && run.unit) {
    const per = run.unit === "days" ? "at a time" : "a show";
    const over = `over ${run.n} ${run.unit}`;
    const who = run.unit === "days" ? "visitors" : "tickets";
    const venue = ex.decision.lines[0]?.match(/^Right size for ~(\d[\d,]*) expected \((.+?), ~(\d[\d,]*) seats\)$/);
    if (venue && num(venue[1]) > num(venue[3])) {
      ex.decision = {
        headline: ex.decision.headline.replace(`(~${venue[3]} seats)`, `(~${venue[3]} ${per})`),
        lines: [`Right size for ~${venue[1]} ${who} ${over} (${venue[2]}, ~${venue[3]} ${per})`, ...ex.decision.lines.slice(1)],
      };
    }
    if (ex.compare)
      for (const side of [ex.compare.chosen, ex.compare.skipped]) {
        const m = side.roomFit.match(/^(.*?)~?(\d[\d,]*)(-cap room| seats) for ~(\d[\d,]*) expected$/);
        if (m && num(m[4]) > num(m[2])) side.roomFit = `${m[1]}~${m[2]} ${per} for ~${m[4]} ${over}`;
      }
    const h = ex.feature === "pace" && ex.decision.headline.match(/(\d[\d,]*) of (\d[\d,]*) sold with (\d+) days to go/);
    if (h && num(h[2]) > cap) {
      const p = ticketPace({ expectedTickets: num(h[2]), capacity: cap * run.n, sold: num(h[1]), daysToShow: Number(h[3]), promoLeft: 1500, hasSmallerRoom: true, currency: cur });
      const actions = p.actions.slice(0, 2).map((a) => (run.unit === "days" ? a.replace("ask the venue about a second night", "ask the space to extend the run") : a));
      ex.decision = { headline: ex.decision.headline.replace(/: (ahead|on track|behind|well behind),/, `: ${p.status},`), lines: [`On pace for ~${count(p.projected)} of ${h[2]} planned`, ...actions] };
    }
  }
  // 6. One room per card: an offer is for its own room (name and size on the card), so its "plan
  // expects" isn't compared with the route's night in that city, which is costed in the route's
  // standard room; and the route table's room column names that standard room, not the offer's.
  if (ex.feature === "offer" && ex.room?.capacity) {
    const size = `~${count(ex.room.capacity)} ${ex.room.type === "bar" || ex.room.type === "cafe" ? "capacity" : "seats"}`;
    ex.decision = {
      ...ex.decision,
      lines: ex.decision.lines.map((l, i) => (i === 0 ? l.replace(/^(.+?) offered (.+?) flat$/, (m, who: string, amt: string) => (who.includes("(~") ? m : `${who} (${size}) offered ${amt} flat`)) : l.replace("; the plan expects ", "; the plan for this room expects "))),
    };
  }
  if (ex.compare && ex.feature === "route") {
    const side = ex.compare.chosen;
    if (route.some((r) => r.name === side.name) && !/-cap room/.test(side.roomFit)) {
      const t = ex.decision.lines.map((l) => l.match(new RegExp(`^${esc(side.name)}: [^,]+, ([\\d,]+) tickets$`))?.[1]).find(Boolean);
      side.roomFit = `${count(ROUTE_ROOM)}-cap room${t ? ` for ~${t} expected` : ""}`;
    }
  }

  // 7. An offer's net counts the artist's merch and sales on top of the fee: say so when the net
  // is more than the fee.
  if (ex.feature === "offer") {
    const fee = num(ex.decision.lines[0]?.match(/offered (.+?) flat$/)?.[1] ?? "");
    ex.decision = {
      ...ex.decision,
      lines: ex.decision.lines.map((l) => {
        const m = l.match(/^That nets ~?([^;]+);/);
        return m && fee && num(m[1]) > fee && !/merch/.test(l) ? l.replace(/^That nets /, "With merch and sales on top of the fee, that nets ") : l;
      }),
    };
  }
  // 8. A local-taste line only where the card's "why?" shows it: on route cards when it's the
  // table's own city line; never on rehearsals (their "why?" is the listeners).
  if (ex.localTaste && ((ex.feature === "route" && ex.compare?.chosen.localTaste !== ex.localTaste.line && ex.compare?.skipped.localTaste !== ex.localTaste.line) || ex.feature === "rehearsal")) ex.localTaste = undefined;

  // 10. Show notes: a line may name only what its "why?" shows (the city, the room, the local-taste
  // and surprise facts); lines naming anything else are dropped (the AI adds no new claims).
  if (ex.feature === "prep") {
    const city = ex.decision.headline.match(/^Show notes for (.+)$/)?.[1] ?? "";
    const ev = [city, ex.act.name, ex.home.city, ex.localTaste?.city === city ? ex.localTaste.line : "", ex.surprise?.city === city ? ex.surprise.line : "", ex.room?.city === city ? ex.room.name : ""].join(" ");
    ex.decision = { ...ex.decision, lines: ex.decision.lines.filter((l) => !unbacked(l, ev).length) };
  }

  // 9. Engine shorthand "1500 USD" → "$1,500".
  ex.decision = { ...ex.decision, lines: ex.decision.lines.map((l) => l.replace(/\b(\d+) (USD|AUD|EUR|INR|[A-Z]{3})\b/g, (_, n: string, c: string) => money(Number(n), c))) };
  return ex;
}

// Every figure a card or its "why?" shows must agree with the others. Returns the first problem.
export function numbersProblem(ex: HomeExample): string | undefined {
  const L = ex.decision.lines;
  const route = ex.route ?? [];
  const cap = ex.room?.capacity;
  const run = runOf(ex.act.kind, dealOf(ex));
  const room = (expected: number, seats: number, where: string) => (expected > seats * run.n ? `${where}: ~${expected} expected but ~${seats} × ${run.n} fit` : undefined);
  if (ex.tourProfit && route.length) {
    const paying = route.filter((r) => r.profit > 0);
    if (Math.abs(paying.reduce((n, r) => n + r.profit, 0) - ex.tourProfit.amount) > 1 || paying.length !== ex.tourProfit.nights) return `tour total ${ex.tourProfit.amount} over ${ex.tourProfit.nights} nights ≠ its paying route nights`;
  }
  if (ex.feature === "route") {
    const h = ex.decision.headline.match(/^(\d+) nights, \D*?([\d,]+) estimated profit/);
    if (h && (Number(h[1]) !== route.length || num(h[2]) !== Math.round(ex.tourProfit?.amount ?? -1))) return `headline "${ex.decision.headline}" ≠ route`;
  }
  const c = ex.compare;
  if (c && ex.feature === "route") {
    const night = route.find((r) => r.name === c.chosen.name);
    if (night && night.profit !== c.chosen.profit) return `${c.chosen.name}: night profit ${c.chosen.profit} in the table, ${night.profit} on the route`;
    if (ex.skipped && ex.skipped.name !== c.skipped.name) return `the map's × is ${ex.skipped.name}, the table's skipped city is ${c.skipped.name}`;
    const more = [ex.decision.headline, ...L, c.line].join(" ").match(/~([^\s~]+) more per night/);
    if (more && Math.abs(num(more[1]) - (c.chosen.profit - c.skipped.profit)) > 1) return `says ${more[1]} more per night, the table says ${c.chosen.profit - c.skipped.profit}`;
    const pull = c.line.match(/(over 10|\d+(?:\.\d+)?)× the fan pull/);
    if (pull) {
      const a = leanShown(c.chosen.lean), b = leanShown(c.skipped.lean);
      const r = a && b ? ROUND1(a / b) : 0;
      if (!r || (pull[1] === "over 10" ? r <= 10 : Math.abs(r - Number(pull[1])) > 0.05)) return `"${pull[0]}" is not the ratio of the rows (${a ?? "—"}× vs ${b ?? "—"}×)`;
    }
    for (const side of [c.chosen, c.skipped]) {
      const m = side.roomFit.match(/~?(\d[\d,]*)(-cap room| seats| at a time| a show) for ~(\d[\d,]*)/);
      const p = m && room(num(m[3]), num(m[1]), `${side.name} room fit`);
      if (p) return p;
      if (m && num(m[3]) > num(m[1]) && !/ over \d+ (days|shows)$/.test(side.roomFit)) return `${side.name} room fit hides a run: ${side.roomFit}`;
    }
  }
  if (c && ex.feature === "route" && route.some((r) => r.name === c.chosen.name) && !/-cap room/.test(c.chosen.roomFit)) return `${c.chosen.name}: the table names a card room (${c.chosen.roomFit}) next to the route night's profit`;
  const ln = ex.losingNight;
  if (ln && route.length && ex.feature === "route") {
    const on = route.find((r) => r.name === ln.city);
    if (on && on.profit !== -ln.amount) return `weakest night ${ln.city} ${-ln.amount}, its route night ${on.profit}`;
    if (route.some((r) => r.profit < -ln.amount)) return `"${ln.line}" but a route night makes less`;
  }
  if (ex.feature === "venue") {
    const m = L[0]?.match(/^Right size for ~(\d[\d,]*) .*?~(\d[\d,]*) (?:seats|at a time|a show)\)$/);
    if (!m) return `venue line not understood: ${L[0]}`;
    if (cap && num(m[2]) !== cap) return `venue line says ~${m[2]}, the room holds ${cap}`;
    const head = ex.decision.headline.match(/\(~(\d[\d,]*) /);
    if (head && num(head[1]) !== num(m[2])) return `headline room ~${head[1]} ≠ why? ~${m[2]}`;
    const p = room(num(m[1]), num(m[2]), "venue");
    if (p) return p;
    if (num(m[1]) > num(m[2]) && !/ over \d+ (days|shows) /.test(L[0])) return `venue line hides a ${run.n}-${run.unit} run: ${L[0]}`;
  }
  if (ex.feature === "pace") {
    const h = ex.decision.headline.match(/(\d[\d,]*) of (\d[\d,]*) sold with (\d+) days to go/);
    const p = L[0]?.match(/On pace for ~?(\d[\d,]*) of (\d[\d,]*) planned/);
    if (!h || !p) return `pace lines not understood`;
    const sold = num(h[1]), planned = num(h[2]), proj = num(p[1]);
    if (num(p[2]) !== planned) return `headline plans ${planned}, why? plans ${p[2]}`;
    if (sold > planned * 1.5) return `sold ${sold} of ${planned} planned`;
    if (proj < sold) return `on pace for ${proj} but ${sold} already sold`;
    if (cap) {
      const q = room(planned, cap, "pace") ?? room(proj, cap, "pace projection");
      if (q) return q;
    }
  }
  if (ex.feature === "offer") {
    const m = L.join("|").match(/the plan (?:for this room )?expects ~([^|;\s]+)/);
    if (ex.room?.capacity && !/\(~[\d,]+ (seats|capacity)\) offered /.test(L[0] ?? "")) return "offer card doesn't name its room's size";
    if (m && ex.profit && Math.abs(num(m[1]) - Math.round(Math.abs(ex.profit.amount))) > 1) return `offer: plan expects ${m[1]}, the plan's night is ${ex.profit.amount}`;
    const fee = num(L[0]?.match(/offered (.+?) flat$/)?.[1] ?? "");
    const net = L.map((l) => l.match(/that nets ~?([^;]+);/i)?.[1]).find(Boolean);
    if (fee && net && num(net) > fee && !L.some((l) => /merch/.test(l))) return `a ${fee} flat fee nets ${net} with no extras listed`;
  }
  return undefined;
}

// Room fit (the engine's own band): a card that names a room needs one the act could plausibly
// play: capacity ≥ ROOM_FIT_FLOOR × the city's draw. Metallica in a 120-seat diner fails.
export function roomFitProblem(ex: HomeExample): string | undefined {
  if (ex.feature === "route" || !ex.room?.capacity) return undefined;
  const c = ex.cities.find((x) => x.name === ex.room!.city);
  if (!c) return undefined;
  const draw = Math.sqrt(ROOM_MIN * ROOM_MAX) * Math.sqrt(Math.max(c.lean, 0.1));
  const ratio = ex.room.capacity / draw;
  return ratio < ROOM_FIT_FLOOR ? `${ex.room.name} holds ~${ex.room.capacity}, ${Math.round(ratio * 100)}% of the ~${Math.round(draw)} draw in ${c.name} (fit floor ${Math.round(ROOM_FIT_FLOOR * 100)}%)` : undefined;
}

// Offers repeating another act's (room size, offer, counter guarantee, split): one per set.
export const offerKey = (ex: HomeExample) => {
  if (ex.feature !== "offer") return undefined;
  const offered = ex.decision.lines[0]?.match(/offered (.+?) flat$/)?.[1];
  const counter = ex.decision.headline.match(/^Counter: (.+?) vs (\d+)% of the door$/);
  return [ex.room?.capacity, offered, counter?.[1] ?? ex.decision.headline, counter?.[2]].join("|");
};

// ---- Proper nouns: every name a card says must be in what its "why?" shows ----
const PLAIN = new Set("I A An The This That These Those It Its My Our We You Your They Their He She His Her Fans Fan Every Best Ask Lowest Plan Seats Expected Sold Days On Ahead Behind Likely Spend Talk Consider Keep Hold Move Right With Night Nights Tour Rehearsal Show Notes Counter Walk Accept Open Opening Close Closing Start End Do Don't Before After Then Here There Tonight Tomorrow Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Mon Tue Wed Thu Fri Sat Sun Jan Feb Mar Apr Jun Jul Aug Sep Oct Nov Dec If When Why What How Thank Thanks Hello Hi Okay OK Yes No Not And Or But So Let Let's Mention Name Nod Shout Call Give Bring Play Skip Pick Book Tell Say".split(" "));
export function properNouns(text: string): string[] {
  const out: string[] = [];
  for (const sent of text.split(/(?<=[.!?:;—–“”"(])\s*/)) {
    const words = sent.split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      const t = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/['’]s$/, "");
      if (i === 0 || !t || PLAIN.has(t) || /\d/.test(t)) return;
      if (/^\p{Lu}/u.test(t)) out.push(t);
    });
  }
  return out;
}
export const unbacked = (text: string, evidence: string) => {
  const ev = evidence.toLowerCase();
  return properNouns(text).filter((n) => !ev.includes(n.toLowerCase()));
};
