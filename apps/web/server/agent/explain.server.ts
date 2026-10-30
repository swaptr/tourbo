import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { cityMetrics } from "@tourbo/core/engine/compare.ts";
import { finish, groundCheck, itemHash, type Explained, type ExplainItem, type ExplainKind } from "@tourbo/core/engine/explain.ts";
import { dealItems, nightItems } from "@tourbo/core/engine/explain-facts.ts";
import { WORKER_MODEL } from "./models.ts";
import { getRun, getSteps, saveStep } from "./runs.server.ts";
import { traceHistory } from "./trace.server.ts";
import { recordUsage } from "./usage.ts";

// One shared grounded-explanation service. Items carry their facts; only "strong" items get a
// sentence (the rest show the fact chip or nothing). The AI assistant writes all pending sentences
// of a batch in one call; each must pass groundCheck() (every number and name from the facts), the
// failures get one retry with the problems listed, then the deterministic template. Results are
// saved per run + item hash (run_steps, step "explain"), so revisits and resumes never pay twice.
// No AI key or any error: template sentences, never a blank.

const BATCH = 25;
const STEP = "explain";
const DEBUG = false; // true: log rejected AI lines and why (server log only)

const Lines = z.object({
  lines: z.array(z.object({ id: z.string().describe("the item's id, copied exactly"), text: z.string().describe("1–2 short plain sentences") })),
});

// Byte-stable (no dates or ids) so it can be cached.
const SYSTEM = `You explain a touring act's plan in plain words. Each item is one suggestion (a city, a room or deal, a cover or local topic, a set move, a chart) with its facts.
For each item write 1–2 short sentences (max 35 words) saying why it is the better pick, in the voice of Tourbo talking to the act ("your fans").
- compare: "{subject} over {other}: …" and say what makes the difference (fans, room fit, money, distance, local taste).
- pick: why this one, here.
- takeaway: the one thing to notice in the chart.
Rules: use ONLY numbers and names that appear in that item's facts (you may round: 2.06 → 2.1, 612 → ~600). Never invent places, people, venues, shows or numbers. Money is always an estimate: write "about" before any amount (never "about ~"), with its currency symbol and thousands separators (about $6,900). Compare only with what the item itself names; no claims about other cities or items. Prefer plain comparisons ("twice as many fans") over raw scores. Say "fan data", never the names of any data provider, AI, model or tool. No markdown, no lists.`;

let client: Anthropic | undefined;
function ai(): Anthropic | undefined {
  try {
    client ??= new Anthropic({ maxRetries: 1 });
    return client;
  } catch {
    return undefined; // no AI credentials on this server
  }
}

const payloadOf = (i: ExplainItem, problems?: string[]) => ({
  id: i.id,
  kind: i.kind,
  subject: i.subject,
  ...(i.other ? { other: i.other } : {}),
  ...(i.currency ? { currency: i.currency } : {}),
  facts: i.facts.map((f) => ({ label: f.label, value: f.value, ...(f.unit && f.unit !== "plain" ? { unit: f.unit } : {}) })),
  ...(problems?.length ? { fix: `Your last line was rejected: ${problems.join("; ")}.` } : {}),
});

async function write(items: ExplainItem[], problems?: Map<string, string[]>): Promise<Map<string, string>> {
  const c = ai();
  const out = new Map<string, string>();
  if (!c || !items.length) return out;
  const res = await c.messages.parse({
    model: WORKER_MODEL,
    max_tokens: Math.min(16000, 2000 + items.length * 200), // room for thinking + the lines
    output_config: { effort: "low", format: zodOutputFormat(Lines) },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify({ items: items.map((i) => payloadOf(i, problems?.get(i.id))) }) }],
  });
  recordUsage(WORKER_MODEL, res.usage);
  if (res.stop_reason === "refusal") return out;
  for (const l of res.parsed_output?.lines ?? []) out.set(l.id, l.text);
  return out;
}

// Write + critic + one retry for a batch of strong items. Never throws.
// answered: the AI call came back (so a template here is final and worth saving).
async function writeGrounded(items: ExplainItem[]): Promise<{ good: Map<string, string>; answered: boolean }> {
  const good = new Map<string, string>();
  let first: Map<string, string>;
  try {
    first = await write(items);
  } catch {
    return { good, answered: false }; // no key, network, quota: template now, try again next visit
  }
  const retry: ExplainItem[] = [];
  const problems = new Map<string, string[]>();
  for (const i of items) {
    const t = first.get(i.id);
    const check = t ? groundCheck(t, i) : undefined;
    if (t && check?.ok) good.set(i.id, t);
    else (retry.push(i), problems.set(i.id, check?.problems ?? ["missing"]));
    if (t && !check?.ok && DEBUG) console.warn(`[explain] rejected ${i.id}: ${check?.problems.join("; ")} | ${t}`);
  }
  if (retry.length) {
    const second = await write(retry, problems).catch((error: Error) => {
      if (DEBUG) console.warn(`[explain] retry failed: ${error.message.slice(0, 200)}`);
      return new Map<string, string>();
    });
    for (const i of retry) {
      const t = second.get(i.id);
      const check = t ? groundCheck(t, i) : undefined;
      if (t && check?.ok) good.set(i.id, t);
      else if (DEBUG) console.warn(`[explain] retry rejected ${i.id}: ${check?.problems.join("; ") ?? "missing"} | ${t ?? ""}`);
    }
  }
  return { good, answered: !!ai() };
}

const inflight = new Map<string, Promise<Explained>>();

// Many items, one call per BATCH of uncached strong items. runId enables persistence.
export async function explainMany(items: ExplainItem[], opts: { runId?: string } = {}): Promise<Explained[]> {
  const keyOf = (i: ExplainItem) => `${i.id}:${itemHash(i)}`;
  const saved = opts.runId ? await getSteps<Explained>(opts.runId, STEP).catch(() => new Map<string, Explained>()) : new Map<string, Explained>();
  const result = new Map<string, Explained | Promise<Explained>>();
  const todo: ExplainItem[] = [];
  for (const i of items) {
    const k = `${opts.runId ?? "-"}:${keyOf(i)}`;
    if (i.evidence !== "strong") result.set(i.id, finish(i));
    else if (saved.has(keyOf(i))) result.set(i.id, saved.get(keyOf(i))!);
    else if (inflight.has(k)) result.set(i.id, inflight.get(k)!);
    else todo.push(i);
  }
  for (let b = 0; b < todo.length; b += BATCH) {
    const chunk = todo.slice(b, b + BATCH);
    const written = writeGrounded(chunk);
    for (const i of chunk) {
      const k = `${opts.runId ?? "-"}:${keyOf(i)}`;
      const p = written.then(async (w) => {
        const e = finish(i, w.good.get(i.id));
        // Persist only when the AI answered (a template from a missing key may improve later).
        if (opts.runId && w.answered) await saveStep(opts.runId, STEP, keyOf(i), e).catch(() => {});
        return e;
      });
      inflight.set(k, p);
      p.finally(() => inflight.delete(k)).catch(() => {});
      result.set(i.id, p);
    }
  }
  return Promise.all(items.map((i) => result.get(i.id)!));
}

// The single-item form: explain({ kind, subject, facts, … }).
export async function explain(item: Omit<ExplainItem, "id"> & { id?: string; kind: ExplainKind }, opts: { runId?: string } = {}): Promise<Explained> {
  const [e] = await explainMany([{ id: item.id ?? "item", ...item }], opts);
  return e;
}

// Server-built items for a run: "night:<i>" and "deal:<i>" (from the saved plan + its trace).
export async function itemsForRun(runId: string, ids: string[]): Promise<ExplainItem[]> {
  const run = await getRun(runId);
  if (!run?.plan) return [];
  const want = new Set(ids);
  const out: ExplainItem[] = [];
  if (ids.some((id) => id.startsWith("night:"))) {
    const { scores } = cityMetrics(await traceHistory(runId).catch(() => []));
    out.push(...nightItems(run.plan, scores).filter((i) => want.has(i.id)));
  }
  if (ids.some((id) => id.startsWith("deal:"))) out.push(...dealItems(run.plan).filter((i) => want.has(i.id)));
  return out;
}
