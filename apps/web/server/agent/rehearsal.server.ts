import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { db } from "@tourbo/core/db/client.server.ts";
import { discipline } from "@tourbo/core/disciplines/index.ts";
import { groundReactions, personas, tally, type Persona, type Reaction } from "@tourbo/core/engine/rehearsal.ts";
import { stopKey } from "@tourbo/core/engine/edit.ts";
import { PlainError } from "./errors.ts";
import { WORKER_MODEL } from "./models.ts";
import { getPreps, type ShowPrep } from "./prep.server.ts";
import { getRun } from "./runs.server.ts";
import { recordUsage } from "./usage.ts";

// Rehearsal panel for one night's show notes: each persona (a slice of the city's Qloo brief)
// reacts to the set in one worker call, in parallel; reactions that can't cite the persona's
// slice are dropped. Saved inside the show_prep row (prep.rehearsal).

const Reactions = z.object({
  reactions: z
    .array(
      z.object({
        item: z.number().int().describe("index of the set item, from the input"),
        reaction: z.enum(["loves", "meh", "misfire"]),
        why: z.string().describe("one sentence, in the persona's voice"),
        refs: z.array(z.string()).describe("exact names from YOUR slice that explain the reaction"),
      }),
    )
    .max(12),
});

export type Rehearsal = {
  personas: { persona: Persona; reactions: Reaction[]; dropped: number }[];
  items: ReturnType<typeof tally>;
  createdAt: string;
};

let client: Anthropic | undefined;

const system = (kind: string, persona: Persona) => `You are one audience member at a ${kind} in a rehearsal panel. ${persona.who}
What you care about (from Qloo taste data for this city): ${persona.slice.map((r) => r.name).join("; ")}.

React to the items of the draft set that you'd actually notice (4 to 8 of them): loves, meh or misfire, one sentence why in your own voice, and refs: exact names from the list above that explain your reaction. If you can't tie a reaction to the list, skip that item. Be honest: a reference you don't care about is meh, a reference that feels fake or pandering is a misfire.`;

async function react(kind: string, persona: Persona, set: { item: number; section: string; text: string }[]) {
  client ??= new Anthropic();
  const call = () =>
    client!.messages.parse({
      model: WORKER_MODEL,
      max_tokens: 3000,
      output_config: { effort: "low", format: zodOutputFormat(Reactions) },
      system: system(kind, persona),
      messages: [{ role: "user", content: JSON.stringify({ set }) }],
    });
  const res = await call().catch(() => call());
  recordUsage(WORKER_MODEL, res.usage);
  return res.parsed_output?.reactions ?? [];
}

export async function rehearse(runId: string, stopIndex: number): Promise<Rehearsal> {
  const [run, preps] = await Promise.all([getRun(runId), getPreps(runId)]);
  const prep: ShowPrep | undefined = preps[stopIndex];
  if (!run?.plan || !prep) throw new PlainError("Write the show notes for this night first, then rehearse them.");
  const panel = personas(prep.brief, prep.city);
  if (!panel.length) throw new PlainError("The fan data has too little taste data for this city to build a panel. Rehearse another night.");
  const set = prep.final.items.map((it, item) => ({ item, section: it.section, text: it.text }));
  const noun = discipline(run.plan.artist.kind).noun;
  const results = await Promise.all(
    panel.map(async (persona) => {
      const { kept, dropped } = groundReactions(await react(noun, persona, set), persona, set.length);
      return { persona, reactions: kept, dropped };
    }),
  );
  const rehearsal: Rehearsal = { personas: results, items: tally(results, set.length), createdAt: new Date().toISOString() };
  const sql = await db();
  await sql`
    update show_prep set prep = jsonb_set(prep, '{rehearsal}', ${sql.json(rehearsal as never)}), updated_at = now()
    where run_id = ${runId} and (stop_key = ${stopKey(run.plan.stops[stopIndex])} or (stop_key is null and stop_index = ${stopIndex}))`;
  return rehearsal;
}
