// Story 13: does Tourbo pick the cities experienced bookers picked? Real 2024+ tours of mid-size
// acts (public sources in backtest.json); Tourbo's Qloo top-N vs the real stops. No LLM here;
// the Claude-alone column comes from `npm run backtest`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { backtest, type KnownTour } from "@tourbo/core/engine/backtest.ts";

const root = new URL("../../", import.meta.url).pathname;
const data = JSON.parse(readFileSync(`${root}tests/stories/backtest.json`, "utf8")) as {
  tours: KnownTour[];
  summary?: { grounded: number; llmOnly?: number; chance: number; tours: number };
};
after(() => closeDb());

test("every tour cites a public source", () => {
  assert.ok(data.tours.length >= 5);
  for (const t of data.tours) assert.match(t.source, /^https:\/\//, t.tour);
});

test("Tourbo agrees with real bookers' picks at least as well as recorded, and well above chance", { timeout: 300_000 }, async () => {
  const run = await backtest(data.tours);
  assert.ok(run.grounded > run.chance * 1.5, `grounded ${run.grounded} vs chance ${run.chance}`);
  if (data.summary) assert.ok(run.grounded >= data.summary.grounded - 0.05, `grounded ${run.grounded} vs recorded ${data.summary.grounded}`);
});

test("the README table shows the recorded numbers", () => {
  if (!data.summary) return;
  const readme = readFileSync(`${root}README.md`, "utf8");
  assert.ok(readme.includes(`**${Math.round(data.summary.grounded * 100)}%**`), "README grounded mean matches backtest.json");
});
