import { segments, type Part } from "./ideas-rank.ts";

// Grounded "why" lines (PLAN user ask 2026-10-30): the fan data is the hero. Every suggestion gets
// an evidence grade from its facts; strong → a fact chip + one short sentence, some → the chip only
// (hedged), none → nothing (no "why", no AI call, no fake precision). The sentence is written by the
// AI assistant in batches (apps/web/server/agent/explain.server.ts) and must pass groundCheck():
// every number and proper noun in it appears in the facts. Otherwise templateLine() writes it.
// Client-safe: no node imports.

export type { Part };
export type ExplainKind = "compare" | "takeaway" | "pick";
export type Unit = "score" | "x" | "pct" | "money" | "km" | "count" | "rank" | "plain";
// say: a short deterministic phrase for the template sentence, built only from this fact.
export type Fact = { key: string; label: string; value: number | string; unit?: Unit; say?: string };
export type Evidence = "strong" | "some" | "none";
// The data itself, first: "fans 2.1× more concentrated", with an optional 0–1 meter.
export type Chip = { text: string; meter?: number; hedged?: boolean };
export type ExplainItem = {
  id: string; // stable within the run, e.g. "night:2", "idea:Columbus:Caamp"
  kind: ExplainKind;
  subject: string; // the pick (city, cover, deal, chart)
  other?: string; // what it beat (compare)
  facts: Fact[];
  names?: string[]; // proper nouns the sentence may use (besides subject / other / string facts)
  currency?: string; // money facts' currency, e.g. "USD"
  evidence: Evidence;
  chip?: Chip;
};
export type Explained = { id: string; evidence: Evidence; chip?: Chip; text?: string; parts?: Part[]; refs: string[]; source: "ai" | "template" | "none" };

// ---------- Evidence: thresholds in one place ----------

export const EVIDENCE = {
  strongMargin: 0.15, // ≥ 15% ahead of the comparison point
  someMargin: 0.05, // < 5% ahead = no real difference: say nothing
} as const;

// margin: relative advantage over the comparison point (0.2 = 20% ahead).
// alternative: there is a real comparison point (next-best city, overall rank, break-even, other bars).
// thin: little fan data here; fallback: the basis is weaker (city-only, style, comparable acts).
export function grade(s: { margin?: number; alternative?: boolean; thin?: boolean; fallback?: boolean }): Evidence {
  if (s.margin === undefined || !Number.isFinite(s.margin) || s.margin < EVIDENCE.someMargin) return "none";
  if (!s.alternative || s.thin || s.fallback) return "some";
  return s.margin >= EVIDENCE.strongMargin ? "strong" : "some";
}

// ---------- Formatting (shared by builders, templates and the critic) ----------

const SYMBOL: Record<string, string> = { USD: "$", AUD: "A$", CAD: "C$", EUR: "€", GBP: "£", INR: "₹", NZD: "NZ$" };
export const money = (n: number, currency = "USD") => {
  const a = Math.abs(n);
  const body = a >= 10_000 ? `${(a / 1000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k` : Math.round(a).toLocaleString("en-US");
  return `${n < 0 ? "-" : ""}${SYMBOL[currency] ?? `${currency} `}${body}`;
};
export const times = (x: number) => `${x >= 10 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, "")}×`;
export const fmt = (f: Fact, currency?: string): string => {
  if (typeof f.value === "string") return f.value;
  if (f.unit === "money") return `~${money(f.value, currency)}`;
  if (f.unit === "x") return times(f.value);
  if (f.unit === "pct") return `${Math.round(f.value)}%`;
  if (f.unit === "km") return `${Math.round(f.value).toLocaleString("en-US")} km`;
  if (f.unit === "rank") return `#${Math.round(f.value)}`;
  return Math.round(f.value).toLocaleString("en-US");
};

// Stable key for persisting a result: same facts → same hash → never paid twice.
export function itemHash(i: Pick<ExplainItem, "kind" | "subject" | "other" | "facts" | "currency">): string {
  const s = JSON.stringify([i.kind, i.subject, i.other ?? "", i.currency ?? "", i.facts.map((f) => [f.key, f.value, f.unit ?? ""])]);
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// ---------- Template (deterministic, grounded by construction) ----------

export function templateLine(i: ExplainItem): string {
  const used = i.facts.filter((f) => f.say).slice(0, 3);
  const shown = used.length ? used : i.facts.slice(0, 2);
  const body = used.length ? used.map((f) => f.say!).join(", ") : shown.map((f) => `${f.label} ${fmt(f, i.currency)}`).join(", ");
  const head = i.kind === "compare" && i.other ? `${i.subject} over ${i.other}` : i.subject;
  const est = shown.some((f) => f.unit === "money") && !/estimate/.test(body) ? " (estimate)" : "";
  return `${head}: ${body}${est}.`;
}

// ---------- Grounding critic ----------

const VENDOR = /\b(qloo|claude|anthropic|openai|gpt|llm|language model|heatmap|fan ?index|api|tourbo_\w+)\b/i;
const ESTIMATE = /~|\babout\b|\baround\b|\broughly\b|\bestimat|\best\.|\bcould\b|\blikely\b/i;
// Sentence openers that aren't names. Anything else capitalized must be in the facts.
const OPENERS = new Set(
  ("a about after all also although an and as at because before both break-even but by compared each estimated even expect expected fans for from given here however if in it its it's just more most much nearly not of on one only over pick play playing plenty profit room same seats selling sells since so than that the their then there these they this those though tickets to two unlike up what when where while with yes you your yours " +
    "fan strength cover covers bigger smaller stronger higher lower almost twice double half deal ticket price local locals expected open close start keep try add going").split(" "),
);
const ALWAYS_OK = new Set(["I", "Tourbo"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plainText = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();

// Numbers a fact allows, in display units (k-suffixed money expands; pct as 0–100).
function allowedNumbers(i: ExplainItem): number[] {
  const out: number[] = [];
  for (const f of i.facts) {
    if (typeof f.value === "number") {
      out.push(f.value, Math.abs(f.value));
      if (f.unit === "pct" && f.value <= 1) out.push(f.value * 100);
    }
    for (const n of numbersIn(`${typeof f.value === "string" ? f.value : ""} ${f.say ?? ""} ${f.label}`)) out.push(n);
  }
  return out;
}

export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?(?![\p{L}])/gu)) {
    let n = Number(m[1].replace(/,/g, ""));
    if (m[2]) n *= /k/i.test(m[2]) ? 1000 : 1_000_000;
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// Rounding / unit tolerance: 2.1 ≈ 2.06, 600 ≈ 612, 82% ≈ 0.82 (handled above), 1.2k ≈ 1,240.
const close = (n: number, v: number) => Math.abs(n - v) <= Math.max(0.051 * Math.abs(v), Math.abs(v) < 10 ? 0.06 : 0.5);

export type GroundCheck = { ok: boolean; problems: string[]; refs: string[] };

export function groundCheck(raw: string, i: ExplainItem): GroundCheck {
  const text = plainText(raw);
  const problems: string[] = [];
  if (!text) return { ok: false, problems: ["empty"], refs: [] };
  if (VENDOR.test(text)) problems.push("names the underlying tech");
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 2) problems.push("more than 2 sentences");
  if (text.split(/\s+/).length > 45) problems.push("too long");

  const names = allowedNames(i);
  let rest = text;
  const refs = new Set<string>();
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, "giu");
    if (re.test(rest)) {
      rest = rest.replace(re, " ¶ ");
      for (const f of i.facts) if (typeof f.value === "string" && f.value.toLowerCase() === n.toLowerCase()) refs.add(f.key);
    }
  }
  // Numbers: each must match a fact value (after the names, which may hold digits, are removed).
  const allowed = allowedNumbers(i);
  for (const n of numbersIn(rest)) {
    const hit = i.facts.find((f) => typeof f.value === "number" && (close(n, f.value) || close(n, Math.abs(f.value)) || (f.unit === "pct" && f.value <= 1 && close(n, f.value * 100))));
    if (hit) refs.add(hit.key);
    else if (!allowed.some((v) => close(n, v))) problems.push(`number ${n} not in the facts`);
  }
  // Money: any currency amount must be labelled as an estimate.
  if (/[$€£₹]\s?\d|\b[A-Z]{3}\s?\d/.test(rest) && !ESTIMATE.test(text)) problems.push("money not labelled as an estimate");
  // Proper nouns: capitalized words that aren't sentence openers must be allowed names.
  const labelWords = new Set(i.facts.flatMap((f) => f.label.toLowerCase().split(/[^\p{L}'-]+/u)).filter(Boolean));
  for (const s of rest.split(/(?<=[.!?:;])\s+/)) {
    const words = s.split(/\s+/).filter(Boolean);
    words.forEach((w, k) => {
      const word = w.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, "");
      if (!word || !/^\p{Lu}/u.test(word) || ALWAYS_OK.has(word)) return;
      if (k === 0 && (OPENERS.has(word.toLowerCase()) || labelWords.has(word.toLowerCase()))) return;
      problems.push(`name "${word}" not in the facts`);
    });
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)], refs: [...refs] };
}

export function allowedNames(i: ExplainItem): string[] {
  const out = [i.subject, i.other, ...(i.names ?? []), ...i.facts.map((f) => (typeof f.value === "string" ? f.value : undefined))];
  return [...new Set(out.filter((n): n is string => !!n && n.trim().length > 1))];
}

// Bold proper nouns: only names from the item's facts (never guessed from prose).
export const toParts = (text: string, i: ExplainItem): Part[] => segments(plainText(text), allowedNames(i));

// Final result for one item: AI text if it passed, else the template; nothing when evidence isn't strong.
export function finish(i: ExplainItem, ai?: string): Explained {
  if (i.evidence !== "strong") return { id: i.id, evidence: i.evidence, chip: i.evidence === "none" ? undefined : i.chip, refs: [], source: "none" };
  const check = ai ? groundCheck(ai, i) : undefined;
  const text = check?.ok ? plainText(ai!) : templateLine(i);
  const refs = check?.ok ? check.refs : groundCheck(text, i).refs;
  return { id: i.id, evidence: i.evidence, chip: i.chip, text, parts: toParts(text, i), refs, source: check?.ok ? "ai" : "template" };
}
