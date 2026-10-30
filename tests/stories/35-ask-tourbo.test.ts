// Story 35 (PLAN §18 Q20): back-and-forth with Tourbo. Three ways in, one engine: Ask Tourbo (chat),
// Tune levers (instant, no AI) and Tourbo's questions. Suggestions are cards, never applied edits;
// Apply / levers / answers need the plan's owner key; shared links read only.
// Uses a copy of an existing finished plan (no fan-data calls). Needs `npm run dev`
// (STORY_BASE_URL for another port). STORY_LLM=1 adds two real chat turns.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { proposeEdits } from "../../apps/web/server/agent/proposals.server.ts";
import { groundReply } from "../../apps/web/server/agent/chat.server.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { appUp, BASE } from "./_mcp.ts";

const LLM = process.env.STORY_LLM === "1";
const PLAIN = /^[^\n]{10,200}$/;
const VENDOR = /qloo|claude|anthropic|haiku|heatmap|fan ?index|tourbo_/i;

let up = false;
let id: string | undefined;
let key = "";
let plan: Plan | undefined;

const headers = (withKey: boolean) => ({ "Content-Type": "application/json", ...(withKey ? { "X-Owner-Key": key } : {}) });
const post = (body: Record<string, unknown>, withKey = true) => fetch(`${BASE}/api/chat`, { method: "POST", headers: headers(withKey), body: JSON.stringify({ runId: id, ...body }) });
const savedPlan = async () => {
  const sql = await db();
  const [row] = await sql<{ plan: Plan }[]>`select plan from runs where id = ${id!}`;
  return row.plan;
};

type Ev = { type: string; text?: string; proposal?: { id: string; status: string; diff?: { lines: string[] } }; message?: { text: string } };
async function ask(message: string): Promise<Ev[]> {
  const res = await post({ intent: "ask", message });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /event-stream/);
  const text = await res.text();
  return text.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)) as Ev);
}

before(async () => {
  up = await appUp();
  const sql = await db();
  const [src] = await sql<{ id: string; plan: Plan; params: unknown; baseline: unknown }[]>`
    select id, plan, params, baseline from runs
    where status = 'done' and plan is not null and jsonb_array_length(plan->'stops') >= 3
    order by created_at desc limit 1`;
  if (!src) return;
  key = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(key).digest("hex");
  const [row] = await sql<{ id: string }[]>`
    insert into runs (artist_name, params, status, plan, baseline, owner_hash)
    values ('Story 35 act', ${sql.json(src.params as never)}, 'done', ${sql.json(src.plan as never)}, ${sql.json(src.baseline as never)}, ${hash})
    returning id`;
  id = row.id;
  plan = src.plan;
  // The run's trace (other scored cities) comes along so questions and "why not" can use it.
  await sql`insert into trace_events (run_id, seq, kind, payload) select ${id}, seq, kind, payload from trace_events where run_id = ${src.id}`;
});
after(async () => {
  if (id) {
    const sql = await db();
    await sql`delete from runs where id = ${id}`;
  }
  await closeDb();
});

test("Ask Tourbo: the state loads for a shared link, with at most 2 questions", async (t) => {
  if (!up || !id) return t.skip("needs the app running and one finished plan");
  const res = await fetch(`${BASE}/api/chat?runId=${id}`);
  assert.equal(res.status, 200);
  const s = await res.json();
  assert.equal(s.owned, true);
  assert.ok(Array.isArray(s.history));
  assert.ok(s.prompts.length <= 2);
  for (const p of s.prompts) {
    assert.match(p.question, /\?$/);
    assert.ok(p.options.length >= 2);
    assert.doesNotMatch(`${p.question} ${p.detail}`, VENDOR);
  }
  assert.deepEqual(s.levers, { flavour: "touch", risk: "balanced", edge: "as_is", era: "mix" });
  if (!s.ai) assert.match(s.off, PLAIN, "AI off: one plain sentence");
});

test("Ask Tourbo: without the owner key, asking, levers, answers and Apply are refused", async (t) => {
  if (!up || !id) return t.skip("needs the app running and one finished plan");
  const proposal = await proposeEdits(id, "Drop the first night", [{ op: "drop_night", night: 0 }]);
  assert.equal(proposal.status, "pending");
  assert.equal((await savedPlan()).stops[0].money?.verdict, plan!.stops[0].money?.verdict, "a proposal changes nothing");
  for (const body of [{ intent: "apply", proposalId: proposal.id }, { intent: "levers", levers: { risk: "safe" } }, { intent: "ask", message: "Make it cheaper" }, { intent: "answer", promptId: "x", optionId: "keep" }]) {
    const res = await post(body, false);
    assert.equal(res.status, 403, body.intent);
    assert.match((await res.json()).error, PLAIN);
  }
  assert.equal((await savedPlan()).stops[0].money?.verdict, plan!.stops[0].money?.verdict, "still unchanged");

  // With the key: Apply commits it, Undo restores it.
  const ok = await post({ intent: "apply", proposalId: proposal.id });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).proposal.status, "applied");
  assert.equal((await savedPlan()).stops[0].money?.verdict, "skip");
  const undo = await post({ intent: "undo", proposalId: proposal.id });
  assert.equal(undo.status, 200);
  assert.equal((await savedPlan()).stops[0].money?.verdict, plan!.stops[0].money?.verdict);
});

test("Tune: levers save for the owner and come back with a diff; the plan itself is untouched", async (t) => {
  if (!up || !id) return t.skip("needs the app running and one finished plan");
  const res = await post({ intent: "levers", levers: { risk: "safe", flavour: "lots", feeFloor: 1 } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.levers.risk, "safe");
  assert.ok(Array.isArray(body.diff.lines));
  assert.deepEqual((await savedPlan()).stops, plan!.stops, "levers are a view, not an edit");
  const s = await (await fetch(`${BASE}/api/chat?runId=${id}`)).json();
  assert.equal(s.levers.flavour, "lots");
  await post({ intent: "levers", levers: {} });
});

test("Ask Tourbo (AI): a question gets a short grounded reply", { skip: !LLM && "set STORY_LLM=1" }, async (t) => {
  if (!up || !id) return t.skip("needs the app running and one finished plan");
  const first = plan!.stops[0].city.name;
  const events = await ask(`Why is ${first} in the plan?`);
  const err = events.find((e) => e.type === "error");
  if (err && /off on this server/.test(err.text ?? "")) return t.skip("no AI key on this server");
  const done = events.find((e) => e.type === "done");
  assert.ok(done, `no answer: ${JSON.stringify(events.slice(-2))}`);
  const reply = done!.message!.text;
  assert.ok(reply.length > 10 && reply.split(/(?<=[.!?])\s+/).length <= 4, reply);
  assert.doesNotMatch(reply, VENDOR);
  const sql = await db();
  const trace = await sql<{ payload: unknown }[]>`select payload from trace_events where run_id = ${id!}`;
  const g = groundReply(reply, `${JSON.stringify(plan)} ${JSON.stringify(trace)} Why is ${first} in the plan?`);
  assert.ok(g.ok, `ungrounded: ${g.problems.join("; ")} — ${reply}`);
  const s = await (await fetch(`${BASE}/api/chat?runId=${id}`)).json();
  assert.equal(s.history.length, 2, "saved with the plan");
});

test("Ask Tourbo (AI): \"make it cheaper\" returns a proposal card, not an applied edit", { skip: !LLM && "set STORY_LLM=1" }, async (t) => {
  if (!up || !id) return t.skip("needs the app running and one finished plan");
  const before = await savedPlan();
  const events = await ask("Make it cheaper");
  const err = events.find((e) => e.type === "error");
  if (err && /off on this server/.test(err.text ?? "")) return t.skip("no AI key on this server");
  const cards = events.filter((e) => e.type === "proposal");
  assert.ok(cards.length >= 1, `no proposal: ${JSON.stringify(events.filter((e) => e.type !== "delta"))}`);
  assert.equal(cards[0].proposal!.status, "pending");
  assert.deepEqual((await savedPlan()).stops, before.stops, "nothing applied");
  const refused = await post({ intent: "apply", proposalId: cards[0].proposal!.id }, false);
  assert.equal(refused.status, 403);
  assert.deepEqual((await savedPlan()).stops, before.stops);
});
