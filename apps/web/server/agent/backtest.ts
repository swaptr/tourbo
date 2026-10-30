// Usage: npm run backtest   (writes tests/stories/backtest.json results + prints the README table)
// Grounded (Qloo heatmap scoring, no LLM) vs LLM-only (same model, same seed list, no data):
// agreement with the cities experienced bookers actually picked for real tours.
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { closeDb } from "@tourbo/core/db/client.server.ts";
import { agreement, backtest, type KnownTour } from "@tourbo/core/engine/backtest.ts";
import { seedCities } from "@tourbo/core/engine/cities.ts";
import { WORKER_MODEL } from "./models.ts";

const FILE = new URL("../../../../tests/stories/backtest.json", import.meta.url);
const data = JSON.parse(readFileSync(FILE, "utf8")) as { tours: KnownTour[]; results?: unknown };

const Pick = z.object({ cities: z.array(z.string()) });
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : undefined;

async function llmOnly(t: KnownTour, n: number) {
  if (!client || !n) return undefined;
  const list = seedCities(t.region).map((c) => c.name);
  const res = await client.messages.parse({
    model: WORKER_MODEL,
    max_tokens: 1000,
    output_config: { effort: "low", format: zodOutputFormat(Pick) },
    system: "You are a tour booker. Use only your own knowledge; no data is provided.",
    messages: [{ role: "user", content: `Pick the ${n} best cities for a headline ${t.kind === "comedian" ? "stand-up" : "club/theatre"} tour by ${t.act}, from this list only: ${list.join(", ")}. Return exactly ${n} names copied from the list.` }],
  });
  return (res.parsed_output?.cities ?? []).filter((c) => list.includes(c)).slice(0, n);
}

const run = await backtest(data.tours);
const rows = [];
for (const r of run.results) {
  const tour = data.tours.find((t) => t.tour === r.tour)!;
  const llm = await llmOnly(tour, r.matched.length).catch(() => undefined);
  rows.push({ ...r, llmPicked: llm, llmAgree: llm ? Math.round(agreement(llm, r.matched) * 100) / 100 : undefined });
}
const scored = rows.filter((r) => r.found && r.matched.length);
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : undefined);
const summary = {
  ranAt: new Date().toISOString().slice(0, 10),
  tours: scored.length,
  grounded: run.grounded,
  llmOnly: mean(scored.flatMap((r) => (r.llmAgree === undefined ? [] : [r.llmAgree]))),
  chance: run.chance,
  model: client ? WORKER_MODEL : undefined,
};
// Stored: tour names, public-source cities, picks and rates. No Qloo responses.
writeFileSync(FILE, JSON.stringify({ tours: data.tours, summary, results: rows.map(({ act, tour, matched, picked, agree, llmPicked, llmAgree, chance }) => ({ act, tour, matched, picked, agree, llmPicked, llmAgree, chance })) }, null, 2) + "\n");

const pct = (x?: number) => (x === undefined ? "–" : `${Math.round(x * 100)}%`);
console.log("| Tour | Real stops in our city list | Tourbo (Qloo) | Claude alone | Random pick |\n| --- | --- | --- | --- | --- |");
for (const r of scored) console.log(`| ${r.act}, ${r.tour} | ${r.matched.length} | ${pct(r.agree)} | ${pct(r.llmAgree)} | ${pct(r.chance)} |`);
console.log(`| **Mean (${summary.tours} tours)** | | **${pct(summary.grounded)}** | **${pct(summary.llmOnly)}** | ${pct(summary.chance)} |`);
for (const r of rows.filter((x) => !x.found || !x.matched.length)) console.error(`skipped: ${r.act} (${r.found ? "no stops in seed list" : "not found in Qloo"})`);
await closeDb();
