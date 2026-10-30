import { classifyError, logError } from "./errors.ts";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { findCity } from "@tourbo/core/engine/cities.ts";
import { numbersIn } from "@tourbo/core/engine/explain.ts";
import { isTicketed, leverContext, repriceStop, wanted, type Levers } from "@tourbo/core/engine/levers.ts";
import { EditError, type Constraint, type PlanEdit, type Proposal } from "@tourbo/core/engine/proposals.ts";
import { haversineKm } from "@tourbo/core/engine/routing.ts";
import { PerformerKind, Region, type Plan } from "@tourbo/core/shared/types.ts";

import { connectMcp } from "../mcp.server.ts";
import { WORKER_MODEL } from "./models.ts";
import { alternativesFor, getConstraints, getLevers, proposeConstraints, proposeEdits } from "./proposals.server.ts";
import { getRun, getSteps, saveStep, type Run } from "./runs.server.ts";
import { recordUsage } from "./usage.ts";

// Ask Tourbo (PLAN §18 Q20): a short back-and-forth about one plan (or one city on /ideas). The
// assistant reads the saved plan, the run's other scored cities (trace) and the MCP tools (fan data
// stays the source); it never edits: changes come back as proposal cards the owner applies.
// Grounding critic: every number and name in a reply must appear in the plan facts, tool results or
// the conversation; one rewrite, then the offending sentences are dropped. History per run in
// run_steps ("chat", "history"); writes are owner-only (api.chat.ts). Token care: the cheap model,
// low effort, cached system prompt + tools, at most MAX_ITER model calls per question and a daily cap.

export const CHAT_LIMITS = { perRunPerDay: 30, perIpPerDay: 15, maxIter: 6, history: 12, maxChars: 500, maxTokens: 4000 } as const;
const DEBUG = false; // log rejected replies and why (server log only)
const MODEL = WORKER_MODEL; // claude-haiku-5-5 (models.ts: the user chose cost)

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; at: string; proposals?: string[] };
export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; message: ChatMessage; left: number }
  | { type: "error"; text: string; retry: boolean };

export const AI_OFF = "Ask Tourbo is off on this server. The levers and questions above still work.";
const CAP = "That's today's questions for this plan. The levers still work; ask again tomorrow.";
const NO_ANSWER = "I couldn't answer that from this plan's data. Ask about a night, a city, the money or the ideas.";

let client: Anthropic | undefined;
let offKnown = false;
const ai = () => (client ??= new Anthropic({ maxRetries: 1 }));
// No key on this server: the panel says so up front (levers and questions still work).
export const aiReady = () => !offKnown && !!(ai().apiKey || ai().authToken);

// ---------- History ----------

const STEP = "chat";
const KEY = "history";
type Saved = { messages: ChatMessage[] };

export async function chatHistory(runId: string): Promise<ChatMessage[]> {
  return (await getSteps<Saved>(runId, STEP).catch(() => new Map<string, Saved>())).get(KEY)?.messages ?? [];
}
const saveHistory = (runId: string, messages: ChatMessage[]) => saveStep(runId, STEP, KEY, { messages: messages.slice(-80) } satisfies Saved);

const today = () => new Date().toISOString().slice(0, 10);
export const askedToday = (h: ChatMessage[]) => h.filter((m) => m.role === "user" && m.at.startsWith(today())).length;
const ipCount = new Map<string, { day: string; n: number }>();
export function ipLeft(ip: string) {
  const c = ipCount.get(ip);
  return CHAT_LIMITS.perIpPerDay - (c?.day === today() ? c.n : 0);
}
function countIp(ip: string) {
  const c = ipCount.get(ip);
  ipCount.set(ip, { day: today(), n: (c?.day === today() ? c.n : 0) + 1 });
}

// ---------- Prompt (byte-stable: no dates, ids or plan data) ----------

const SYSTEM = `You are Tourbo, the assistant inside a tour-planning app for small touring acts (musicians, comedians, speakers, artists). You talk with the act about their tour plan, or about one city when there is no plan, and suggest changes. You never change the plan yourself: changes go through propose_change (plan edits) or save_preferences (covers, topics, tone, local flavour), which show the act a card with what changes and the money, distance and ticket deltas; the act decides.

Grounding: use only names and numbers that appear in the plan facts, tool results or the conversation. Never name cities, venues, acts, places, songs or numbers from your own knowledge; do no arithmetic of your own (tools give differences). If the data doesn't cover something, say so in one sentence and suggest what the act can do.
Money is always an estimate: put "about" before amounts.
Style: 1–3 short sentences, plain words, no markdown, no lists, no headings. Talk to the act ("your fans"). Say "fan data", never name a data provider, an AI model or a tool.
Off-topic (anything not about this tour, its cities, shows, money, route, set or ideas): one sentence saying you can only help with the tour.

Common asks:
- "Why not <city>?": other_cities with city=<city>; compare its fan score and distance with the nights in the plan.
- "Make it cheaper" / "more profit" / "less risk": savings_options, then propose_change with the best one or two options (copy their edits).
- "Add a night near <city>": other_cities with near=<city>; propose_change with add_night for the strongest one close by.
- "Swap <city>" / "drop night 3" / a room or price change: propose_change.
- Covers, topics, tone or local flavour ("more 90s covers", "no politics in <city>"): save_preferences with structured constraints.
- What to play or talk about in a city: city_ideas.
After a proposal, say in one sentence what it does; the card shows the numbers.`;

// ---------- Tools ----------

const NightEdit = z.object({
  op: z.enum(["drop_night", "restore_night", "set_price", "set_room", "swap_venue", "set_date", "swap_city", "add_night"]),
  night: z.number().int().min(1).max(30).optional().describe("Night number as shown in the plan facts (1 = first night). Omit for add_night, or for set_price on every night."),
  city: z.string().max(80).optional().describe("swap_city / add_night: a city name from other_cities"),
  capacity: z.number().int().min(10).max(100000).optional().describe("set_room: seats"),
  price: z.number().positive().max(100000).optional().describe("set_price: ticket price in the plan currency"),
  date: z.iso.date().optional().describe("set_date"),
});
const ConstraintIn = z.object({
  kind: z.enum(["era", "avoid", "more", "less"]),
  from: z.number().int().min(1900).max(2100).optional().describe("era: first year, e.g. 1990 for the 90s"),
  to: z.number().int().min(1900).max(2100).optional().describe("era: last year, e.g. 1999"),
  topic: z.string().max(60).optional().describe("avoid: the topic, e.g. politics, religion"),
  what: z.string().max(60).optional().describe("more / less: what, e.g. local food references"),
  city: z.string().max(80).optional().describe("Only for this city; omit for the whole tour"),
});

const TOOLS_IN = {
  other_cities: z.object({
    city: z.string().max(80).optional().describe("A city the act asks about"),
    near: z.string().max(80).optional().describe("List scored cities closest to this city"),
  }),
  night_detail: z.object({ night: z.number().int().min(1).max(30) }),
  savings_options: z.object({}),
  propose_change: z.object({ title: z.string().max(120).describe("Short plain title, e.g. 'Smaller room in Detroit'"), edits: z.array(NightEdit).min(1).max(4) }),
  save_preferences: z.object({ title: z.string().max(120), constraints: z.array(ConstraintIn).min(1).max(4) }),
  city_ideas: z.object({ city: z.string().max(80) }),
};
type ToolName = keyof typeof TOOLS_IN;

const DESCRIPTIONS: Record<ToolName, string> = {
  other_cities: "Cities this tour's fan data scored but didn't pick, with fan score (0–100) and km to the nearest night (or to `near`), plus the plan's own nights with their scores. No new fan-data calls.",
  night_detail: "One night's numbers: room, ticket price, deal, tickets, sell-through, gross, costs, profit, break-even price, backup venue.",
  savings_options: "Deterministic ways to raise tour profit or cut risk (drop a losing night, a room that fills, a price change), each with its profit change and the edits to propose.",
  propose_change: "Show the act a card with these plan edits and their deltas (money, km, tickets). Nothing changes until the act presses Apply.",
  save_preferences: "Show the act a card that saves preferences for ideas, sets and show notes (era of covers, topics to avoid, more or less of something), for the tour or one city.",
  city_ideas: "Grounded ideas for one city from fan data: covers or local topics, each with its reference name and why.",
};

const STATUS: Record<ToolName, string> = {
  other_cities: "Comparing cities…",
  night_detail: "Reading the night…",
  savings_options: "Looking for savings…",
  propose_change: "Pricing the change…",
  save_preferences: "Noting that…",
  city_ideas: "Checking the fan data…",
};

const schemaOf = (t: z.ZodObject): Anthropic.Tool.InputSchema => {
  const { $schema: _, ...rest } = z.toJSONSchema(t, { target: "draft-2020-12" }) as Record<string, unknown>;
  return rest as Anthropic.Tool.InputSchema;
};

// Sorted, fixed order + no volatile text: the tool list is part of the cached prefix.
const TOOLS: Anthropic.Tool[] = (Object.keys(TOOLS_IN) as ToolName[]).sort().map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  input_schema: schemaOf(TOOLS_IN[name]),
  eager_input_streaming: true,
}));
TOOLS[TOOLS.length - 1] = { ...TOOLS[TOOLS.length - 1], cache_control: { type: "ephemeral" } };

// ---------- Scope: a plan, or one city ----------

export type Scope = { run?: Run & { plan: Plan }; city?: string; kind: PerformerKind; region: Region; act?: string; facts?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

function digest(scope: Scope, levers?: Levers, constraints: Constraint[] = []): string {
  const plan = scope.run?.plan;
  if (!plan) return JSON.stringify({ scope: "one city, no tour plan", city: scope.city, kind: scope.kind, act: scope.act || undefined, shown_on_screen: scope.facts ? safeJson(scope.facts) : undefined });
  const cur = plan.money?.currency ?? "";
  return JSON.stringify({
    act: plan.artist.name,
    kind: plan.artist.kind,
    region: plan.params.region,
    currency: cur,
    nights: plan.stops.map((s, i) => ({
      night: i + 1,
      city: s.city.name,
      date: s.date,
      venue: s.venue?.name,
      fan_score: Math.round(s.score),
      thin_fan_data: s.thinData || undefined,
      // Place features: only the surfaced ones (they changed a suggestion), as plain sentences.
      ...(s.place?.surfaced.length ? { local_notes: Object.fromEntries(s.place.surfaced.filter((k) => s.place!.changes[k]).map((k) => [k, s.place!.changes[k]])) } : {}),
      ...(s.money && {
        status: s.money.verdict === "skip" ? "dropped" : s.money.verdict,
        room: s.money.capacity,
        ticket: s.money.price,
        tickets: s.money.tickets,
        sold_pct: Math.round(s.money.sellThrough * 100),
        profit: s.money.profit,
      }),
    })),
    legs_km: plan.legs.map((l) => `${l.from}→${l.to} ${l.km}`),
    total_km: plan.totalKm,
    tour_profit: plan.money?.profit,
    tour_costs: plan.money?.costs,
    tune: levers,
    saved_preferences: constraints.length ? constraints : undefined,
  });
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s.slice(0, 4000);
  }
};

function edits(plan: Plan, input: z.infer<typeof NightEdit>[]): PlanEdit[] {
  return input.map((e) => {
    const n = e.night !== undefined ? e.night - 1 : undefined;
    const need = () => {
      if (n === undefined || !plan.stops[n]) throw new EditError(`Night ${e.night ?? "?"} isn't in the plan.`);
      return n;
    };
    switch (e.op) {
      case "drop_night": return { op: e.op, night: need() };
      case "restore_night": return { op: e.op, night: need() };
      case "set_price": if (!e.price) throw new EditError("set_price needs a price."); return { op: e.op, price: e.price, ...(n !== undefined ? { night: need() } : {}) };
      case "set_room": if (!e.capacity) throw new EditError("set_room needs a capacity."); return { op: e.op, night: need(), capacity: e.capacity };
      case "swap_venue": return { op: e.op, night: need(), venue: "backup" };
      case "set_date": if (!e.date) throw new EditError("set_date needs a date."); return { op: e.op, night: need(), date: e.date };
      case "swap_city": if (!e.city) throw new EditError("swap_city needs a city."); return { op: e.op, night: need(), city: e.city };
      case "add_night": if (!e.city) throw new EditError("add_night needs a city."); return { op: e.op, city: e.city, ...(n !== undefined ? { after: need() } : {}) };
    }
  });
}

function savings(plan: Plan) {
  const region = plan.params.region;
  const kind = plan.artist.kind;
  const out: { night: number; city: string; option: string; profit_change: number; edits: z.infer<typeof NightEdit>[] }[] = [];
  plan.stops.forEach((s, i) => {
    const m = s.money;
    if (!m || m.verdict === "skip") return;
    if (m.profit < 0) out.push({ night: i + 1, city: s.city.name, option: "drop this losing night", profit_change: -m.profit, edits: [{ op: "drop_night", night: i + 1 }] });
    if (isTicketed(m)) {
      const w = wanted(s, region, kind);
      const cap = w ? Math.max(30, Math.round(w / 0.9)) : undefined;
      if (cap && cap < m.capacity * 0.9) {
        const next = repriceStop(s, region, kind, { capacity: cap });
        out.push({ night: i + 1, city: s.city.name, option: `room of ${cap} that fills (now ${m.capacity})`, profit_change: next.money!.profit - m.profit, edits: [{ op: "set_room", night: i + 1, capacity: cap }] });
      }
      for (const f of [0.85, 1.15]) {
        const price = Math.round(m.price * f);
        const next = repriceStop(s, region, kind, { price });
        const d = next.money!.profit - m.profit;
        if (d > 0) out.push({ night: i + 1, city: s.city.name, option: `ticket ${price} (now ${m.price})`, profit_change: d, edits: [{ op: "set_price", night: i + 1, price }] });
      }
    }
  });
  return out.sort((a, b) => b.profit_change - a.profit_change).slice(0, 6);
}

async function runTool(name: ToolName, input: unknown, scope: Scope, send: (e: ChatEvent) => void, made: Proposal[]): Promise<unknown> {
  const parsed = TOOLS_IN[name].safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.issues[0]?.message ?? "check the fields"}` };
  const args = parsed.data as Record<string, unknown>;
  const plan = scope.run?.plan;
  const runId = scope.run?.id;
  const needPlan = () => {
    if (!plan || !runId) throw new EditError("There's no tour plan open here; I can only talk about this city.");
    return { plan, runId };
  };
  try {
    switch (name) {
      case "other_cities": {
        const { plan, runId } = needPlan();
        const alts = await alternativesFor(runId, plan);
        const region = plan.params.region;
        const near = typeof args.near === "string" ? findCity(region, args.near) : undefined;
        const played = plan.stops.filter((s) => s.money?.verdict !== "skip");
        const dist = (a: { lat?: number; lon?: number }) => {
          if (a.lat === undefined || a.lon === undefined) return {};
          const at = { name: "", region, lat: a.lat, lon: a.lon };
          if (near) return { km_from_near: Math.round(haversineKm(near, at)) };
          const best = played.map((s) => ({ s, km: haversineKm(s.city, at) })).sort((x, y) => x.km - y.km)[0];
          return best ? { km_to_nearest_night: Math.round(best.km), nearest_night: best.s.city.name } : {};
        };
        const asked = typeof args.city === "string" ? args.city.toLowerCase() : undefined;
        let others = alts.map((a) => ({ city: a.city, fan_score: Math.round(a.score), ...dist(a) }));
        if (near) others = others.sort((a, b) => ((a as { km_from_near?: number }).km_from_near ?? 1e9) - ((b as { km_from_near?: number }).km_from_near ?? 1e9));
        const hit = asked ? others.find((o) => o.city.toLowerCase() === asked) : undefined;
        return {
          plan_nights: plan.stops.map((s, i) => ({ night: i + 1, city: s.city.name, fan_score: Math.round(s.score), dropped: s.money?.verdict === "skip" || undefined })),
          ...(asked ? { asked: hit ?? { city: args.city, note: "Not among the cities this tour's fan data scored." } } : {}),
          others: others.slice(0, 8),
          ...(near ? { near: near.name } : typeof args.near === "string" ? { near_note: `${args.near} isn't a known city in this region.` } : {}),
        };
      }
      case "night_detail": {
        const { plan } = needPlan();
        const i = (args.night as number) - 1;
        const s = plan.stops[i];
        if (!s) return { error: `There's no night ${i + 1}.` };
        const m = s.money;
        return {
          night: i + 1, city: s.city.name, date: s.date, venue: s.venue?.name, backup_venue: s.backupVenue?.name, fan_score: Math.round(s.score), thin_fan_data: s.thinData,
          ...(s.place?.surfaced.length ? { local_notes: s.place.surfaced.map((k) => s.place!.changes[k]).filter(Boolean) } : {}),
          ...(m?.priceNudge ? { price_nudge: m.priceNudge.note } : {}),
          ...(m && { status: m.verdict === "skip" ? "dropped" : m.verdict, deal: m.deal.replace("_", " "), room: m.capacity, ticket: m.price, tickets: m.tickets, sold_pct: Math.round(m.sellThrough * 100), gross: m.gross, act_take: m.artistTake, costs: m.costs, profit: m.profit, break_even_ticket: m.breakEvenPrice, demand_vs_tour_median: r2(m.relDemand), currency: m.currency, why: m.why }),
        };
      }
      case "savings_options": {
        const { plan } = needPlan();
        const list = savings(plan);
        return list.length ? { currency: plan.money?.currency, options: list } : { note: "No clear savings: every night already fills its room at a profit." };
      }
      case "propose_change": {
        const { plan, runId } = needPlan();
        const p = await proposeEdits(runId, String(args.title), edits(plan, args.edits as z.infer<typeof NightEdit>[]));
        made.push(p);
        send({ type: "proposal", proposal: p });
        return { shown_to_act: true, changes: p.changes, deltas: p.diff?.lines };
      }
      case "save_preferences": {
        const { runId } = needPlan();
        const list = (args.constraints as z.infer<typeof ConstraintIn>[]).flatMap((c): Constraint[] => {
          const city = c.city ? { city: c.city } : {};
          if (c.kind === "era") return [{ kind: "era", ...(c.from ? { from: c.from } : {}), ...(c.to ? { to: c.to } : {}), ...city }];
          if (c.kind === "avoid" && c.topic) return [{ kind: "avoid", topic: c.topic, ...city }];
          if ((c.kind === "more" || c.kind === "less") && c.what) return [{ kind: c.kind, what: c.what, ...city }];
          return [];
        });
        const p = await proposeConstraints(runId, String(args.title), list);
        made.push(p);
        send({ type: "proposal", proposal: p });
        return { shown_to_act: true, saves: p.changes };
      }
      case "city_ideas": {
        const city = String(args.city);
        const levers = runId ? await getLevers(runId) : undefined;
        const ctx = levers ? leverContext(levers, scope.kind) : undefined;
        const mcp = await connectMcp(() => {}, ["tourbo"]);
        try {
          const res = await mcp.call<{ cities: { city: string; ideas: { idea: string; category: string; ref: string; why?: string }[] }[] }>("tourbo_ideas", {
            cities: [city],
            region: scope.region,
            kind: scope.kind,
            ...(plan ? { act_id: plan.artist.id, peer_ids: plan.artist.peers.map((p) => p.id), act_name: plan.artist.name } : scope.act ? { act_name: scope.act } : {}),
            budget: 6,
            ...(ctx ? { flavour: ctx.flavour, boundaries: ctx.boundaries } : {}),
          });
          const c = res.cities?.[0];
          return c?.ideas?.length ? { city: c.city, ideas: c.ideas.slice(0, 6).map((x) => ({ idea: x.idea, category: x.category, ref: x.ref, why: x.why })) } : { note: `No fan-data ideas for ${city} right now.` };
        } finally {
          await mcp.close().catch(() => {});
        }
      }
    }
  } catch (error) {
    if (error instanceof EditError) return { error: error.message };
    return { error: "That data isn't available right now." };
  }
}

// ---------- Grounding critic ----------

const SAFE_WORDS = new Set(
  ("I Tourbo OK Safe Bold Balanced Apply Discard Undo Tune " +
    "January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec " +
    "Monday Tuesday Wednesday Thursday Friday Saturday Sunday USD EUR INR AUD CAD GBP").split(" "),
);
const VENDOR = /\b(qloo|claude|anthropic|openai|gpt|llm|language model|heatmap|fan ?index|tourbo_\w+|other_cities|night_detail|savings_options|propose_change|save_preferences|city_ideas)\b/i;

export function groundReply(text: string, corpus: string): { ok: boolean; problems: string[]; kept: string } {
  const lower = corpus.toLowerCase();
  const nums = numbersIn(corpus);
  const allowed = new Set<number>();
  for (const n of nums) {
    allowed.add(n);
    if (n > 0 && n <= 1) allowed.add(Math.round(n * 100));
  }
  const close = (n: number) => n <= 31 || [...allowed].some((v) => Math.abs(n - v) <= Math.max(0.051 * Math.abs(v), 0.5));
  const problems: string[] = [];
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const bad = new Set<number>();
  sentences.forEach((s, k) => {
    if (VENDOR.test(s)) {
      problems.push("names the underlying tech");
      bad.add(k);
    }
    for (const n of numbersIn(s.replace(/\b(19|20)\d{2}-\d{2}-\d{2}\b/g, (d) => (lower.includes(d) ? "" : d)))) {
      if (!close(n)) {
        problems.push(`number ${n} isn't in the data`);
        bad.add(k);
      }
    }
    s.split(/\s+/).forEach((w, i) => {
      const word = w.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, "").replace(/['’]s$/u, "");
      if (i === 0 || !word || !/^\p{Lu}/u.test(word) || SAFE_WORDS.has(word)) return;
      if (!new RegExp(`(?<![\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu").test(lower)) {
        problems.push(`name "${word}" isn't in the data`);
        bad.add(k);
      }
    });
  });
  return { ok: problems.length === 0, problems: [...new Set(problems)], kept: sentences.filter((_, k) => !bad.has(k)).join(" ") };
}

// ---------- One turn ----------

export async function loadScope(opts: { runId?: string; city?: string; kind?: string; region?: string; act?: string; facts?: string }): Promise<Scope | undefined> {
  if (opts.runId) {
    const run = await getRun(opts.runId);
    if (!run?.plan) return undefined;
    return { run: run as Run & { plan: Plan }, kind: run.plan.artist.kind, region: run.plan.params.region };
  }
  if (!opts.city) return undefined;
  return {
    city: opts.city.slice(0, 80),
    kind: PerformerKind.catch("musician").parse(opts.kind),
    region: Region.catch("na").parse(opts.region),
    act: opts.act?.slice(0, 120),
    facts: opts.facts?.slice(0, 6000),
  };
}

export async function chatTurn(scope: Scope, question: string, ip: string, send: (e: ChatEvent) => void): Promise<void> {
  const runId = scope.run?.id;
  const history = runId ? await chatHistory(runId) : [];
  const left = runId ? CHAT_LIMITS.perRunPerDay - askedToday(history) : ipLeft(ip);
  if (left <= 0) return send({ type: "error", text: CAP, retry: false });
  if (!aiReady()) return send({ type: "error", text: AI_OFF, retry: false });

  const text = question.replace(/\s+/g, " ").trim().slice(0, CHAT_LIMITS.maxChars);
  const userMsg: ChatMessage = { id: randomUUID(), role: "user", text, at: new Date().toISOString() };
  if (!runId) countIp(ip);

  const [levers, constraints] = runId ? await Promise.all([getLevers(runId), getConstraints(runId)]) : [undefined, []];
  const facts = digest(scope, levers, constraints);
  const prior = history.slice(-CHAT_LIMITS.history);
  const messages: Anthropic.MessageParam[] = [];
  for (const m of prior) {
    // Alternate roles; the first must be a user turn.
    if (!messages.length && m.role !== "user") continue;
    const last = messages.at(-1);
    if (last && last.role === m.role) last.content = `${last.content as string}\n${m.text}`;
    else messages.push({ role: m.role, content: m.text });
  }
  if (messages.at(-1)?.role === "user") messages.push({ role: "assistant", content: "OK." });
  messages.push({ role: "user", content: [{ type: "text", text: `Plan facts (current):\n${facts}` }, { type: "text", text }] });

  const corpus: string[] = [facts, text, ...prior.map((m) => m.text)];
  const made: Proposal[] = [];
  let reply = "";
  try {
    for (let iter = 0; iter < CHAT_LIMITS.maxIter; iter++) {
      const stream = ai().messages.stream({
        model: MODEL,
        max_tokens: CHAT_LIMITS.maxTokens,
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        cache_control: { type: "ephemeral" },
        messages,
      });
      stream.on("text", (delta) => send({ type: "delta", text: delta }));
      const msg = await stream.finalMessage();
      recordUsage(MODEL, msg.usage);
      if (msg.stop_reason === "refusal") {
        reply = "I can't help with that one. Ask me about the tour, its cities or the money.";
        break;
      }
      messages.push({ role: "assistant", content: msg.content });
      const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || !calls.length) {
        reply = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
        break;
      }
      if (msg.stop_reason === "tool_use" && msg.content.some((b) => b.type === "text")) send({ type: "reset" });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const name = call.name as ToolName;
        if (!(name in TOOLS_IN)) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: "Unknown tool.", is_error: true });
          continue;
        }
        send({ type: "status", text: STATUS[name] });
        const out = await runTool(name, call.input, scope, send, made);
        const json = JSON.stringify(out);
        corpus.push(json);
        results.push({ type: "tool_result", tool_use_id: call.id, content: json, ...(out && typeof out === "object" && "error" in out ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }

    // Critic: one rewrite with the problems listed, then drop what still fails.
    let check = groundReply(reply, corpus.join("\n"));
    if (reply && !check.ok) {
      if (DEBUG) console.warn(`chat critic: ${check.problems.join("; ")} :: ${reply}`);
      send({ type: "reset" });
      send({ type: "status", text: "Checking the numbers…" });
      messages.push({ role: "user", content: `Rewrite your last reply using only names and numbers from the plan facts and tool results. Problems: ${check.problems.join("; ")}. Reply with the rewritten text only.` });
      const fix = await ai().messages.create({ model: MODEL, max_tokens: CHAT_LIMITS.maxTokens, output_config: { effort: "low" }, system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], tools: TOOLS, tool_choice: { type: "none" }, messages });
      recordUsage(MODEL, fix.usage);
      const again = fix.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
      check = groundReply(again, corpus.join("\n"));
      reply = check.ok ? again : check.kept;
    }
    if (!reply) reply = made.length ? "Here's what that would change. Apply it if it looks right." : NO_ANSWER;
  } catch (error) {
    const c = classifyError(error);
    logError("chat", error, c.kind);
    if (c.kind === "ai_off") {
      offKnown = true;
      return send({ type: "error", text: AI_OFF, retry: false });
    }
    return send({ type: "error", text: c.message, retry: c.retry });
  }

  const answer: ChatMessage = { id: randomUUID(), role: "assistant", text: reply, at: new Date().toISOString(), ...(made.length ? { proposals: made.map((p) => p.id) } : {}) };
  if (runId) await saveHistory(runId, [...history, userMsg, answer]).catch(() => {});
  send({ type: "done", message: answer, left: left - 1 });
}

