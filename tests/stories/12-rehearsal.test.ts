// Story 12: Maya rehearses a night's notes in front of simulated fans built from that city's
// Qloo data. No-LLM part: the panel is built only from the city's brief and differs by city.
// STORY_LLM=1 part: Claude role-plays the panel and every kept reaction cites its persona's data.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { normalizeRef } from "@tourbo/core/engine/brief.ts";
import { groundReactions } from "@tourbo/core/engine/rehearsal.ts";
import { mcp } from "./_mcp.ts";

let m: Awaited<ReturnType<typeof mcp>>;
before(async () => (m = await mcp()));
after(async () => {
  await m.close();
  await closeDb();
});

type Panel = { personas: { id: string; slice: { name: string }[] }[]; label: string; instructions: string };
let chicago: Panel;

test("Maya: the panel is a few personas, each from Chicago's own Qloo brief, labelled a rehearsal", async () => {
  const act = await m.call("tourbo_resolve_act", { name: "Japanese Breakfast" });
  const args = { act_id: act.id, kind: "musician", region: "na" };
  chicago = await m.call("tourbo_rehearsal_panel", { ...args, city: "Chicago" });
  assert.ok(chicago.personas.length >= 3);
  for (const p of chicago.personas) assert.ok(p.slice.length >= 2, p.id);
  assert.match(chicago.label, /rehearsal/i);
  assert.match(chicago.label, /not a prediction/i);
  const brief = await m.call("tourbo_city_brief", { ...args, city: "Chicago" });
  const names = new Set(Object.values(brief).flatMap((v) => (Array.isArray(v) ? v.map((r: { name: string }) => normalizeRef(r.name)) : [])));
  for (const p of chicago.personas) for (const r of p.slice) assert.ok(names.has(normalizeRef(r.name)), `${r.name} is in the Chicago brief`);

  const austin: Panel = await m.call("tourbo_rehearsal_panel", { ...args, city: "Austin" });
  const local = (p: Panel) => p.personas.find((x) => x.id === "local")?.slice.map((r) => r.name).join("|");
  assert.notEqual(local(chicago), local(austin), "the born-and-raised local differs by city");
});

test("Maya: a reaction that can't point at the persona's data is thrown out", () => {
  const persona = { id: "local", name: "x", who: "x", slice: chicago.personas[0].slice.map((r) => ({ ...r, type: "x" })) };
  const good = { item: 0, reaction: "loves" as const, why: "yes", refs: [persona.slice[0].name] };
  const made_up = { item: 1, reaction: "loves" as const, why: "yes", refs: ["Some Bar That Isn't In Qloo"] };
  const no_ref = { item: 2, reaction: "misfire" as const, why: "no", refs: [] };
  const { kept, dropped } = groundReactions([good, made_up, no_ref], persona, 6);
  assert.deepEqual(kept, [good]);
  assert.equal(dropped, 2);
});

const llm = process.env.STORY_LLM === "1" && !!process.env.ANTHROPIC_API_KEY;

test("Maya: Claude rehearses saved notes; every kept reaction cites its persona", { skip: !llm && "set STORY_LLM=1", timeout: 180_000 }, async () => {
  const sql = await db();
  const [row] = await sql<{ run_id: string; stop_index: number }[]>`select run_id, stop_index from show_prep order by updated_at desc limit 1`;
  if (!row) return; // no saved show notes yet (story 8 makes some)
  const { rehearse } = await import("../../apps/web/server/agent/rehearsal.server.ts");
  const r = await rehearse(row.run_id, row.stop_index);
  assert.ok(r.personas.length >= 3);
  assert.ok(r.personas.some((p) => p.reactions.length > 0), "someone reacted");
  for (const { persona, reactions } of r.personas) {
    const known = new Set(persona.slice.map((s) => normalizeRef(s.name)));
    for (const x of reactions) for (const ref of x.refs) assert.ok(known.has(normalizeRef(ref)), `${persona.name}: ${ref}`);
  }
  const [saved] = await sql<{ has: boolean }[]>`select prep ? 'rehearsal' as has from show_prep where run_id = ${row.run_id} and stop_index = ${row.stop_index}`;
  assert.equal(saved.has, true, "rehearsal saved with the notes");
});
