// Usage: npm run examples:export [-- --still <png>] [--out <dir>]
// --out writes the bundle elsewhere (check it with STORY_LANDING_DIR=<dir> before replacing the committed one).
// Writes the landing page's static bundle to apps/web/public/landing/ (committed): content-hashed
// JSON files plus manifest.json. Data only: the browser bakes the globe's terrain itself. The
// landing page reads only these files, never Qloo, the agent or the DB. Refuses to write unless
// the stored examples clear the minimum (≥ 60 complete examples, every number agreeing (reconcileExample + exampleProblem), ≥ 6 continents, ≥ 3 acts per
// discipline, night counts spread over 3–8 with none on > 50%) and prints what's missing. Fan points per continent are
// in our compact format (LandingRegionFile in @tourbo/core/examples/types.ts), thin-data countries
// flagged. The fan-vs-guess contrast comes from stored runs, no AI calls.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { DISCIPLINES } from "@tourbo/core/disciplines/index.ts";
import type { Continent, FanDensity, HomeExample } from "@tourbo/core/examples/types.ts";
import { encodeAct, encodeRegion } from "@tourbo/core/examples/landing-format.ts";
import type { Baseline, Plan } from "@tourbo/core/shared/types.ts";
import { exampleProblem, money, offerKey, reconcileExample, roomFitProblem, unbacked } from "@tourbo/core/examples/check.ts";
import { buildExampleView, completeLine } from "../app/lib/example-view.ts";
import { distanceKm } from "@tourbo/core/shared/geo.ts";

const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? process.argv[outArg + 1].replace(/\/?$/, "/") : new URL("../public/landing/", import.meta.url).pathname;
const MIN_EXAMPLES = 60; // trust beats count: one wrong fact costs more than 200 examples (story 14 needs ≥ 50)
const MIN_CONTINENTS = 6;
const MIN_PER_DISCIPLINE = 3;
const MIN_NIGHTS = 3;
const MAX_NIGHTS = 8;
const MAX_NIGHT_SHARE = 0.5; // no single night count on more than half the examples (PLAN Q11)
const MIN_DENSITY_POINTS = 1000;
const LANDING_POINTS = 1500; // per act at landing level of detail (strongest points kept); full detail stays in Postgres
const FIRST_FETCH_GZ = 300 * 1024;

const sql = await db();
// Stored examples are reconciled from their own numbers first (run totals vs per-room capacity,
// route vs table profits, the "×" ratio; see reconcileExample), then gated by exampleProblem:
// anything that still contradicts itself stays off the landing.
const examples = (await sql<{ example: HomeExample }[]>`select example from home_examples order by id`).map((r) => reconcileExample(r.example));
const densities = new Map((await sql<{ fan_key: string; density: FanDensity }[]>`select fan_key, density from home_fan_density`).map((r) => [r.fan_key, r.density]));
const cities = await sql<{ name: string; lon: number; lat: number; population: number; country: string }[]>`select name, lon, lat, population, country from cities order by population desc`;
const runs = await sql<{ id: string; plan: Plan; baseline: Baseline }[]>`
  select id, plan, baseline from runs
  where status = 'done' and baseline is not null and plan is not null and jsonb_array_length(plan->'stops') >= 3
  order by created_at desc limit 50`;
await closeDb();

// "Fan data vs an AI's guess" from stored runs (no new AI calls): the run whose two plans differ most.
type ContrastRow = { city: string; side: "fan" | "guess" | "both"; line: string };
const bare = (city: string) => city.replace(/,.*$/, "").trim().toLowerCase();
function contrastOf(run: (typeof runs)[number]): { act: string; runId: string; rows: ContrastRow[] } {
  const guess = new Map(run.baseline.stops.map((s) => [bare(s.city), s]));
  const fan = new Map(run.plan.stops.map((s) => [bare(s.city.name), s]));
  const rows: ContrastRow[] = [];
  for (const [key, s] of fan) {
    const g = guess.get(key);
    if (!g) {
      // No opener here: stored openers carry no home city, so "a local opener" can't be checked.
      const bits = [`fan strength ${s.score} of 100`, s.venue && `a room near the fans (${s.venue.name})`].filter(Boolean);
      rows.push({ city: s.city.name, side: "fan", line: `Fan data found it: ${bits.join(", ")}.` });
    } else if (s.venue && g.venue && bare(g.venue) !== bare(s.venue.name)) {
      rows.push({ city: s.city.name, side: "both", line: `Both picked it. Fan data chose ${s.venue.name}, near where the fans live; the guess was ${g.venue}.` });
    }
  }
  for (const [key, g] of guess) if (!fan.has(key)) rows.push({ city: g.city.replace(/,.*$/, ""), side: "guess", line: g.why });
  return { act: run.plan.artist.name, runId: run.id, rows: rows.slice(0, 6) };
}
// Story-test fixtures ("… Fakeband", "Test …") never reach the public home page.
const contrast = runs.map(contrastOf).filter((c) => !/fake|\btest\b/i.test(c.act)).sort((a, b) => b.rows.filter((r) => r.side !== "both").length - a.rows.filter((r) => r.side !== "both").length)[0];

// Point → country via the nearest big city in the same 1° cell (or a neighbour), to flag points in
// thin-data countries ([lat, lon, w, 1]) so the globe can draw them lighter.
const cellCountry = new Map<string, string>();
for (const c of cities) {
  const k = `${Math.round(c.lat)},${Math.round(c.lon)}`;
  if (!cellCountry.has(k)) cellCountry.set(k, c.country);
}
function countryAt(lat: number, lon: number) {
  const la = Math.round(lat), lo = Math.round(lon);
  for (const [dy, dx] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const c = cellCountry.get(`${la + dy},${lo + dx}`);
    if (c) return c;
  }
  return undefined;
}

// The city that names the card must be the place a reader knows at those coordinates: a geocoder
// slip labels Visakhapatnam's fans "Rasapūdipalem" and a Chennai club follows it there. Reject
// when a much bigger, differently named city sits within ~15 km, or when the city's fan data is
// a copy of the next city's (same clusters and reach: a country-wide fallback, not a city).
const biggestNear = (lat: number, lon: number) => cities.find((c) => Math.abs(c.lat - lat) < 0.15 && Math.abs(c.lon - lon) < 0.15);
const misplaced = (ex: HomeExample) => {
  const name = ex.room?.city ?? ex.cities[0]?.name;
  const c = ex.cities.find((x) => x.name === name);
  if (!c) return false;
  const big = biggestNear(c.lat, c.lon);
  const own = cities.find((x) => x.name === c.name && Math.abs(x.lat - c.lat) < 0.15 && Math.abs(x.lon - c.lon) < 0.15);
  if (big && big.name !== c.name && big.population > 5 * Math.max(own?.population ?? 0, 1) && big.population >= 100_000) return true;
  return ex.cities.some((o) => o !== c && o.why && c.why && o.why.hotspots === c.why.hotspots && o.why.reach === c.why.reach && c.why.hotspots > 0);
};
// An offer card that repeats another act's room word for word (a comparable-act run landing on the
// same room and the same figures, e.g. two Chicago comics at The Chicago Theatre) reads as a
// template: keep the first.
const seenRooms = new Set<string>();
const copied = (ex: HomeExample) => {
  if (ex.feature !== "offer") return false;
  const key = ex.decision.lines[0] ?? ex.id;
  if (seenRooms.has(key)) return true;
  seenRooms.add(key);
  return false;
};

// ---- Trust filters (on by default): the card must name a real room in its own city, priced in
// that country's money, and quote only what it shows. Each drop is counted in the log.
const bigCities = cities.filter((c) => c.population >= 200_000);
const cityRow = (name: string, lat: number, lon: number) => cities.find((x) => x.name === name && Math.abs(x.lat - lat) < 0.3 && Math.abs(x.lon - lon) < 0.3);
const cardCity = (ex: HomeExample) => ex.cities.find((x) => x.name === (ex.room?.city ?? ex.cities[0]?.name)) ?? ex.cities[0];
const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A venue named after another big city of the same country ("ICEBAR Stockholm" for a Gothenburg
// night; "Paris Texas" in Toronto is a bar's name, not a place).
const venueElsewhere = (ex: HomeExample) => {
  const r = ex.room;
  const country = cardCity(ex)?.country;
  if (!r) return false;
  return bigCities.some((c) => c.country === country && c.name.length > 3 && c.name !== r.city && !r.city.includes(c.name) && new RegExp(`(^|[\\s,(])${escRe(c.name)}($|[\\s,)])`).test(r.name));
};
// The card's city must be a town of real size under its own name (not a locality label).
const MIN_CARD_CITY = 100_000;
const tinyCity = (ex: HomeExample) => {
  const c = cardCity(ex);
  return !!c && (cityRow(c.name, c.lat, c.lon)?.population ?? 0) < MIN_CARD_CITY;
};
// Money in the country's own currency (USD stands in only where the engine has no local currency).
const EURO = new Set("AT BE CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES HR".split(" "));
const OWN: Record<string, string> = { US: "USD", AU: "AUD", IN: "INR", CA: "CAD", GB: "GBP", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RS: "RSD" };
const wrongMoney = (ex: HomeExample) => {
  const cur = ex.profit?.currency ?? ex.tourProfit?.currency;
  const c = cardCity(ex)?.country;
  if (!cur || !c) return false;
  if (EURO.has(c)) return cur !== "EUR";
  if (OWN[c]) return cur !== OWN[c];
  return cur !== "USD";
};
// Bookable stages only: per kind, the room type must be one of that kind's spaces (disciplines
// config), and the name must not be a business that isn't a stage.
// Hotels, escape rooms, pools and the like never; a restaurant or grill only when it's also a club,
// a bar or a live room ("Andy's Jazz Club & Restaurant").
const NOT_A_STAGE = /\b(escape|hotel|casino|resort|drive-in|shop|store|boutique|office|mall|hostel|pool|gym|spa|salon|airport|station|hospital|school|university|church|temple|mosque|sports grounds)\b|\p{Extended_Pictographic}|, [a-zäöå-]+ ja /iu;
const FOOD = /\b(restaurant|ristorante|trattoria|pizzeria|bistro|diner|kitchen|grill|steakhouse|sushi|bakery)\b/i;
const STAGE_WORD = /\b(club|bar|jazz|live|music|hall|theat(re|er)|venue|lounge|stage)\b/i;
const SPACE_LABELS = (kind: string) => new Set([...((DISCIPLINES as Record<string, { spaces?: { label: string }[] }>)[kind]?.spaces ?? []).map((sp) => sp.label), "bar", "club", "music venue", "hall / theatre", "comedy club"]);
const notAStage = (ex: HomeExample) => !!ex.room && (NOT_A_STAGE.test(ex.room.name) || (FOOD.test(ex.room.name) && !STAGE_WORD.test(ex.room.name.replace(FOOD, ""))) || (!!ex.room.type && !SPACE_LABELS(ex.act.kind).has(ex.room.type)));
// Rehearsal reactions may only lean on the quoted line: keep reactions to line 1 whose names are
// all in that line; the card is dropped only when none are left.
const COMMON = new Set("I A The This That It My We You".split(" "));
const keptReactions = (ex: HomeExample) => {
  // Evidence is only what the card shows: the line's complete sentences (none when it was cut).
  const line = completeLine(ex.decision.headline) ?? "";
  const words = new Set(line.split(/[^\p{L}\p{N}'’-]+/u).map((w) => w.toLowerCase()));
  return ex.decision.lines.filter((l) => {
    if (!/ line 1: “/.test(l)) return false;
    const q = l.match(/: “(.+)”$/)?.[1] ?? "";
    return !q.split(/(?<=[.!?] )/).some((sent) => sent.split(/\s+/).slice(1).some((w) => {
      const t = w.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, "").replace(/['’]s$/, "");
      return /^\p{Lu}/u.test(t) && !COMMON.has(t) && t !== ex.room?.city && !words.has(t.toLowerCase());
    }));
  });
};
examples.forEach((ex, i) => {
  if (ex.feature === "rehearsal") examples[i] = { ...ex, decision: { ...ex.decision, lines: keptReactions(ex) } };
});
const unseenQuote = (ex: HomeExample) => ex.feature === "rehearsal" && !ex.decision.lines.length;

// Names on the card must be in its "why?": every proper noun in the headline and facts appears in
// what the "why?" panel (and its route list) shows, or in the byline.
const namesUnbacked = (ex: HomeExample) => {
  const v = buildExampleView(ex);
  const evidence = [JSON.stringify(v.why ?? {}), v.byline, JSON.stringify(v.details.route), ex.compare ? `${ex.compare.chosen.name} ${ex.compare.skipped.name}` : ""].join(" ");
  return unbacked([v.headline, ...v.facts].join(". "), evidence);
};
// Cities the card names must be on its route (or be the tour's home, or the table's skipped city).
const offRouteCity = (ex: HomeExample) => {
  const v = buildExampleView(ex);
  const text = [v.headline, ...v.facts].join(" ");
  const ok = new Set([...(ex.route ?? []).map((r) => r.name), ex.home.city, ...(ex.feature === "route" && ex.compare ? [ex.compare.skipped.name] : [])]);
  const country = cardCity(ex)?.country;
  const names = new Set([...ex.cities.map((c) => c.name), ...bigCities.filter((c) => c.country === country && c.name.length > 3).map((c) => c.name)]);
  const said = [...names].filter((n) => new RegExp(`(^|[^\\p{L}])${escRe(n)}($|[^\\p{L}])`, "u").test(text));
  const bad = said.filter((n) => !ok.has(n));
  const city = ex.room?.city ?? ex.cities[0]?.name;
  if (ex.feature !== "route" && city && !ok.has(city)) bad.push(city);
  return bad;
};
// GeoNames locality labels that carry a metro's population (so the size test can't catch them).
const DENY_CITIES = new Set(["Rasapūdipalem", "New South Memphis", "Meads"]);
const deniedCity = (ex: HomeExample) => [ex.room?.city, ex.compare?.skipped.name, ex.skipped?.name, ...ex.cities.slice(0, 1).map((c) => c.name), ...(ex.route ?? []).map((r) => r.name)].some((n) => n && n !== ex.home.city && DENY_CITIES.has(n));

// Compared cities: only the tour home bases we seed (well-known cities), never a conflict-zone or
// otherwise sensitive pairing.
const SEED_CITIES = new Set(examples.map((e) => e.home.city));
const SENSITIVE = new Set(["Kabul", "Aleppo", "Damascus", "Baghdad", "Mosul", "Moscow", "Kyiv", "Kharkiv", "Gaza", "Sanaa", "Mogadishu", "Khartoum", "Tripoli", "Tehran", "Pyongyang", "Kandahar", "Homs"]);
const badComparison = (ex: HomeExample) => {
  if (ex.feature !== "route" || !ex.compare) return false;
  const n = ex.compare.skipped.name;
  return !SEED_CITIES.has(n) || SENSITIVE.has(n) || SENSITIVE.has(ex.compare.chosen.name);
};
// A route card whose comparison can't show keeps its route and money and drops the comparison:
// "6 nights, $76,700 estimated profit", explained by the route list.
examples.forEach((ex, i) => {
  if (!badComparison(ex) || !ex.tourProfit || !ex.route) return;
  const line = ex.compare!.line;
  examples[i] = reconcileExample({
    ...ex,
    compare: undefined,
    skipped: undefined,
    decision: { headline: `${ex.route.length} nights, ${money(ex.tourProfit.amount, ex.tourProfit.currency)} estimated profit`, lines: ex.decision.lines.filter((l) => l !== line) },
  });
});
// Ticket-pace snapshots are seeded per act name; two acts can land on the same one: keep the first.
const seenPace = new Set<string>();
const repeatedPace = (ex: HomeExample) => {
  if (ex.feature !== "pace") return false;
  const k = ex.decision.headline.match(/(\d[\d,]*) of (\d[\d,]*) sold with (\d+) days/)?.slice(1).join("|") ?? ex.id;
  if (seenPace.has(k)) return true;
  seenPace.add(k);
  return false;
};

// Offers repeating another act's (room size, offer, counter guarantee, split): keep the first.
const seenOfferKeys = new Set<string>();
const repeatedOffer = (ex: HomeExample) => {
  const k = offerKey(ex);
  if (!k) return false;
  if (seenOfferKeys.has(k)) return true;
  seenOfferKeys.add(k);
  return false;
};
// Room fit: the engine's band when enough examples survive it, else only the worst cases
// (a draw over 10× the room). Decided below from the counts.
const ROOM_FIT_SOFT = 5; // a draw over 5× the room never shows (Taylor Swift at a jazz club)
// Only cards whose figures rest on the room (room pick, offer, ticket pace) are judged; show notes
// and rehearsals don't use its size, so an unfit room's size is just left off them.
const ROOM_CARDS = new Set(["venue", "offer", "pace"]);
const drawRatio = (ex: HomeExample) => {
  const c = ex.cities.find((x) => x.name === ex.room?.city);
  return c && ex.room?.capacity ? (Math.sqrt(800 * 3000) * Math.sqrt(Math.max(c.lean, 0.1))) / ex.room.capacity : 0;
};
const drawOver = (ex: HomeExample) => (ROOM_CARDS.has(ex.feature) ? drawRatio(ex) : 0);
// Cards that don't rest on the room (route, show notes, rehearsal) lose a room that fails a room
// check instead of the whole card; show notes then keep only lines that don't name it.
examples.forEach((ex, i) => {
  if (ROOM_CARDS.has(ex.feature) || !ex.room) return;
  if (notAStage(ex) || venueElsewhere(ex)) examples[i] = reconcileExample({ ...ex, room: undefined });
  else if (ex.room.capacity && drawRatio(ex) > ROOM_FIT_SOFT) examples[i] = { ...ex, room: { ...ex.room, capacity: undefined } };
});

// Completeness: every field the landing page shows, plus the act's map data.
function missing(ex: HomeExample): string[] {
  const d = densities.get(ex.fanKey);
  return [
    !ex.decision?.headline && "headline",
    !(ex.route?.length && ex.route.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))) && "route",
    !ex.compare && ex.feature !== "route" && "compare",
    !ex.tourProfit && "tourProfit",
    !ex.losingNight && "losingNight",
    !(d && d.fanPoints.length >= MIN_DENSITY_POINTS) && "density",
    !(d && Object.keys(d.coverage).length) && "coverage",
    !((ex.route?.length ?? 0) >= MIN_NIGHTS && (ex.route?.length ?? 0) <= MAX_NIGHTS) && "nights",
    exampleProblem(ex) && "numbers-agree",
    misplaced(ex) && "card-city-mislabelled",
    copied(ex) && "same-room-as-another-act",
    ROOM_CARDS.has(ex.feature) && venueElsewhere(ex) && "venue-in-another-city",
    tinyCity(ex) && "card-city-not-a-real-town",
    ex.feature !== "prep" && ex.feature !== "rehearsal" && wrongMoney(ex) && "currency-not-the-country's",
    ROOM_CARDS.has(ex.feature) && notAStage(ex) && "room-is-not-a-stage",
    unseenQuote(ex) && "quote-leans-on-unshown-text",
    repeatedOffer(ex) && "offer-repeats-another-act",
    namesUnbacked(ex).length && "names-not-in-why",
    offRouteCity(ex).length && "city-not-on-route",
    deniedCity(ex) && "city-on-deny-list",
    badComparison(ex) && "comparison-city-not-a-seed",
    repeatedPace(ex) && "pace-repeats-another-act",
    !ex.decision.lines.length && "no-lines-left",
  ].filter((x): x is string => !!x);
}

const gaps = new Map<string, number>();
const passed = examples.filter((ex) => {
  const m = missing(ex);
  for (const f of m) gaps.set(f, (gaps.get(f) ?? 0) + 1);
  return !m.length;
});
// Room fit: strict (the engine's band) if ≥ MIN_EXAMPLES survive it on every continent, else soft.
const strictFit = passed.filter((e) => !roomFitProblem(e));
const strictOk = strictFit.length >= MIN_EXAMPLES && new Set(strictFit.map((e) => e.home.continent)).size >= MIN_CONTINENTS;

const allComplete = strictOk ? strictFit : passed.filter((e) => drawOver(e) <= ROOM_FIT_SOFT);
const fitDropped = passed.length - allComplete.length;
if (fitDropped) gaps.set(strictOk ? "room-fit (engine band)" : `room-fit (draw > ${ROOM_FIT_SOFT}× the room)`, fitDropped);
console.log(`room fit: engine band keeps ${strictFit.length} of ${passed.length}; applied ${strictOk ? "strict" : `soft (> ${ROOM_FIT_SOFT}×)`}`);
// A kind that shows on the landing must show at least MIN_PER_DISCIPLINE acts; thinner kinds
// (e.g. new kinds before their examples are prewarmed) stay off it until they have enough.
const kindActs = new Map<string, Set<string>>();
for (const e of allComplete) kindActs.set(e.act.kind, (kindActs.get(e.act.kind) ?? new Set()).add(e.fanKey));
const thinKinds = [...kindActs].filter(([, acts]) => acts.size < MIN_PER_DISCIPLINE).map(([k]) => k);
if (thinKinds.length) console.warn(`kept off the landing (under ${MIN_PER_DISCIPLINE} acts): ${thinKinds.join(", ")}`);
const complete = allComplete.filter((e) => !thinKinds.includes(e.act.kind));
const continents = new Set(complete.map((e) => e.home.continent));
const actsByKind = new Map<string, Set<string>>();
for (const e of complete) actsByKind.set(e.act.kind, (actsByKind.get(e.act.kind) ?? new Set()).add(e.fanKey));
console.log(`${examples.length} examples, ${complete.length} complete, ${new Set(complete.map((e) => e.fanKey)).size} acts, ${densities.size} densities, ${continents.size} continents`);
console.log(`per discipline: ${Object.keys(DISCIPLINES).map((k) => `${k} ${actsByKind.get(k)?.size ?? 0}`).join(", ")}`);
const nightCounts = new Map<number, number>();
for (const e of complete) nightCounts.set(e.route!.length, (nightCounts.get(e.route!.length) ?? 0) + 1);
const nightSpread = [...nightCounts].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n} ×${k}`).join(", ");
const crowded = [...nightCounts].filter(([, k]) => k > complete.length * MAX_NIGHT_SHARE);
console.log(`nights per example: ${nightSpread}`);
console.log(`per continent: ${[...continents].map((c) => `${c} ${complete.filter((e) => e.home.continent === c).length}`).join(", ")}`);
if (gaps.size) console.log(`missing fields: ${[...gaps].map(([f, n]) => `${f} ×${n}`).join(", ")}`);
for (const ex of examples) {
  const p = exampleProblem(ex);
  if (p) console.log(`dropped ${ex.id}: ${p}`);
}

// Content-hashed files; the manifest is the only un-hashed name.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const sizes: Record<string, number> = {};
function write(name: string, data: unknown) {
  const body = JSON.stringify(data);
  const file = `${name}.${createHash("sha256").update(body).digest("hex").slice(0, 10)}.json`;
  writeFileSync(OUT + file, body);
  sizes[file] = gzipSync(body).length;
  return file;
}
// Landing level of detail: the act's strongest LANDING_POINTS points, 0.01° / 0.01 weight steps.
const lod = (d: FanDensity) => encodeAct(d, (p) => !!d.coverage[countryAt(p[0], p[1]) ?? ""]?.thin, LANDING_POINTS);

// World layer (first fetch): the "_world" fan wave + the bigger city lights as a flat int array
// [lon×10, lat×10, size bucket 2–4, …]. The ~25k small towns (bucket 1) are a second, lazy file.
const bucket = (p: number) => (p >= 1_000_000 ? 4 : p >= 250_000 ? 3 : p >= 50_000 ? 2 : 1);
const packCities = (list: { lon: number; lat: number; population: number }[]) => list.flatMap((c) => [Math.round(c.lon * 10), Math.round(c.lat * 10), bucket(c.population)]);
const world = write("world", {
  fan: (densities.get("_world")?.fanPoints ?? []).map((p) => [Math.round(p[0]), Math.round(p[1]), p[2]]),
  cities: packCities(cities.filter((c) => bucket(c.population) >= 2)),
});
const towns = write("towns", { cities: packCities(cities.filter((c) => bucket(c.population) === 1)) });
const failures = [
  complete.length < MIN_EXAMPLES && `${complete.length} complete examples (need ${MIN_EXAMPLES})`,
  continents.size < MIN_CONTINENTS && `${continents.size} continents (need ${MIN_CONTINENTS})`,
  crowded.length && `night counts too uniform (${crowded.map(([n, k]) => `${n} nights on ${k}`).join(", ")} of ${complete.length}; need ≤ ${MAX_NIGHT_SHARE * 100}% each)`,
].filter(Boolean);
// Gate failed: still ship the always-on layers so the landing shows "warming up" over a full
// globe (world fan wave + city lights), never a blank page. Exit non-zero so CI notices.
if (failures.length && !process.argv.includes("--ignore-gate")) {
  writeFileSync(OUT + "manifest.json", JSON.stringify({ version: new Date().toISOString(), status: "warming", files: { world, towns } }, null, 2));
  console.error(`examples not exported (world layer only): ${failures.join("; ")}`);
  process.exit(1);
}
if (failures.length) console.warn(`--ignore-gate: exporting anyway (${failures.join("; ")}); not for production`);

// Play order: one geographic path through every example, so the camera hops to a neighbour (US →
// US → Canada …) instead of across the world. Hop cost = great-circle km, ×1.3 when it steps west
// (against the globe's eastward spin, so the path mostly runs with the rotation). Built greedily
// from the far west with the same act kept ≥ ACT_GAP steps apart, then shortened by 2-opt passes
// that keep that gap. The client starts at a random point and walks it (wrapping); the camera
// always takes the short way (≤ 180°), so a near neighbour is never a whole turn away.
const ACT_GAP = 20;
const WEST_PENALTY = 1.3;
const focusOf = (e: HomeExample) => e.route?.[0] ?? e.cities[0] ?? e.home;
const lonStep = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
const hop = (a: HomeExample, b: HomeExample) => {
  const p = focusOf(a), q = focusOf(b);
  return distanceKm(p, q) * (lonStep(p.lon, q.lon) < 0 ? WEST_PENALTY : 1);
};
// One continent at a time, in a fixed loop that keeps the jumps between them short (Americas →
// Europe → Africa → Asia → Oceania, wrapping back across the Pacific). Each continent is entered at
// the example nearest to where the last one ended, so the long hops are only these few boundaries.
const CONTINENT_LOOP: Continent[] = ["north_america", "south_america", "europe", "africa", "asia", "oceania"];

function nearestPath(list: HomeExample[], start: { lat: number; lon: number }, gap: number): HomeExample[] {
  const left = [...list];
  let path: HomeExample[] = [];
  let from = start;
  while (left.length) {
    const recent = new Set(path.slice(-gap).map((e) => e.fanKey));
    const pool = left.filter((e) => !recent.has(e.fanKey));
    const cost = (e: HomeExample) => distanceKm(from, focusOf(e)) * (lonStep(from.lon, focusOf(e).lon) < 0 ? WEST_PENALTY : 1);
    const next = (pool.length ? pool : left).reduce((b, e) => (cost(e) < cost(b) ? e : b));
    path.push(next);
    left.splice(left.indexOf(next), 1);
    from = focusOf(next);
  }
  // 2-opt within the continent; the first stop stays (it's the entry nearest the last continent).
  const okGap = (p: HomeExample[], i: number, j: number) => {
    for (let k = Math.max(0, i - gap); k <= Math.min(p.length - 1, j + gap); k++)
      for (let m = k + 1; m <= Math.min(p.length - 1, k + gap); m++) if (((k >= i && k <= j) || (m >= i && m <= j)) && p[k].fanKey === p[m].fanKey) return false;
    return true;
  };
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    for (let i = 0; i < path.length - 2; i++)
      for (let j = i + 2; j < path.length - 1; j++) {
        const next = [...path.slice(0, i + 1), ...path.slice(i + 1, j + 1).reverse(), ...path.slice(j + 1)];
        let before = 0, after = 0;
        for (let k = i; k <= j; k++) (before += hop(path[k], path[k + 1])), (after += hop(next[k], next[k + 1]));
        if (after >= before - 1 || !okGap(next, i + 1, j)) continue;
        path = next;
        improved = true;
      }
  }
  return path;
}

function playOrder(list: HomeExample[]): HomeExample[] {
  const out: HomeExample[] = [];
  let at = { lat: 49, lon: -125 }; // start on the Pacific coast of North America
  for (const c of CONTINENT_LOOP) {
    const part = list.filter((e) => e.home.continent === c);
    if (!part.length) continue;
    // Same act ≥ ACT_GAP apart, or as far apart as the continent's act count allows.
    const gap = Math.max(1, Math.min(ACT_GAP, new Set(part.map((e) => e.fanKey)).size - 1));
    const path = nearestPath(part, at, gap);
    out.push(...path);
    at = focusOf(path[path.length - 1]);
  }
  return out;
}
const ordered = playOrder(complete);
const hops = ordered.slice(1).map((e, k) => distanceKm(focusOf(ordered[k]), focusOf(e)));
const sortedHops = [...hops].sort((a, b) => a - b);
console.log(`play order: median hop ${Math.round(sortedHops[Math.floor(hops.length / 2)] ?? 0).toLocaleString("en-US")} km, ${hops.filter((h) => h > 4000).length} hops over 4,000 km, ${hops.filter((h) => h > 6000).length} over 6,000 km (${hops.map((h, k) => (h > 6000 ? k + 1 : -1)).filter((k) => k >= 0).join(", ")})`);
const exampleFile = write("examples", ordered.map((e) => ({ ...e, fanPoints: undefined, coverage: undefined })));

// Fan points split by the example's home continent, so the globe fetches one region at a time.
// One entry per act (shared by its examples); each example's terrain is baked in the browser from
// these points and the example's own route, cities and skipped city.
const regions: Partial<Record<Continent, string>> = {};
for (const c of continents) {
  const keys = new Set(complete.filter((e) => e.home.continent === c).map((e) => e.fanKey));
  regions[c] = write(`density-${c}`, encodeRegion(Object.fromEntries([...keys].map((k) => [k, lod(densities.get(k)!)]))));
}

let still: string | undefined;
const stillArg = process.argv.indexOf("--still");
if (stillArg > 0 && existsSync(process.argv[stillArg + 1])) {
  still = "globe-still.png";
  copyFileSync(process.argv[stillArg + 1], OUT + still);
}

const manifest = {
  version: new Date().toISOString(),
  counts: { examples: complete.length, acts: new Set(complete.map((e) => e.fanKey)).size, continents: continents.size },
  status: failures.length ? "incomplete" : "ready",
  files: { examples: exampleFile, world, towns, regions, still, contrast: contrast?.rows.length ? write("contrast", contrast) : undefined },
};
writeFileSync(OUT + "manifest.json", JSON.stringify(manifest, null, 2));
const firstFetch = sizes[exampleFile] + sizes[world];
console.log(readdirSync(OUT).map((f) => `${f}${sizes[f] ? ` ${Math.round(sizes[f] / 1024)} KB gz` : ""}`).join("\n"));
console.log(`first fetch (examples + world): ${Math.round(firstFetch / 1024)} KB gz${firstFetch > FIRST_FETCH_GZ ? ` — over the ${FIRST_FETCH_GZ / 1024} KB budget` : ""}`);
