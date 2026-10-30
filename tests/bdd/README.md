# BDD acceptance suite

Given/When/Then features in plain user language (`features/*.feature`): one per story in
`tests/stories/STORIES.md`, plus `every-kind-of-act.feature` (a Scenario Outline over all 18 kinds in
`packages/core/src/disciplines/index.ts`) and `plan-edits.feature`.

```
npm run test:bdd                 # everything (≈ 12 min + build)
npm run test:bdd:hobbies         # the 18-kind outline only
npx cucumber-js --config tests/bdd/cucumber.mjs --tags @story-7     # one story
npx cucumber-js --config tests/bdd/cucumber.mjs --name "A chef"     # one row
BDD_LLM=1 npm run test:bdd       # the app loads .env and uses the real AI key; runs @llm
```

## Runner: `@cucumber/cucumber` 13 + `playwright-core`
- Step and support files are plain `.ts` loaded through cucumber's `import` option; Node 24's
  built-in type stripping runs them. No build step, no loader, no codegen.
- `playwright-bdd` was the alternative: it needs `@playwright/test` and a `bddgen` step that
  generates spec files before every run. This repo already drives the system Chromium through
  `playwright-core` (`tests/stories/_browser.ts`), so cucumber reuses that and adds one dev dep.
- Native Gherkin: Scenario Outline, tags (`@pending`, `@llm`, `@no-ai`, `@story-N`, `@hobbies`).

## What runs where (`support/harness.ts`)
- **Fan data**: `support/fake-fan-data.ts`, a local HTTP double (port 3199) for `/search`,
  `/v2/insights` (heatmap, place, artist, person, tag, demographics, …), `/v2/tags`,
  `/v2/trending`, `/entities`, `/v2/audiences`, `/v2/analysis/compare`. Synthetic, seeded by the
  request: names like "Test Act 7", never a real response. Wired via `QLOO_BASE_URL`. Names
  starting "Unlisted" / "Nobody" are not in the data. Scenarios can make it answer 429.
- **App**: a production build (`npm run build -w @tourbo/web`, then `apps/web/server.js` with
  `NODE_ENV=production`) on port 3100, `CACHE_TIERS=none`. Log: `/tmp/tourbo-bdd-app.log`. Runs
  next to `npm run dev`. `BDD_SKIP_BUILD=1` serves the existing build; `BDD_DEV=1` (or a failed
  build) uses `support/app-server.ts`, the dev server with its own HMR port and Vite cache, which
  is restarted if it dies on the shared route-typegen folder.
- **DB**: a throwaway embedded Postgres on port 5435 in a temp dir, deleted afterwards
  (`BDD_KEEP_DB=1` keeps it). `.data/postgres` is never touched.
- **AI**: off by default (`ANTHROPIC_API_KEY` blanked for the app). The plan run then fails at
  the agent step, the suite checks the plain failure sentence + Retry, and finishes that same run
  with `support/planner.ts`: the deterministic engine + show economics (what `tourbo_plan_tour`
  does). Everything after "Plan" is then real app code on synthetic data.
- **Your own AI assistant** scenarios use an in-memory MCP client (`tests/stories/_mcp.ts`).

## Tags
- `@pending`: feature not built yet, or not testable on synthetic data; the reason is a comment
  above the scenario. Reported as pending, not failed (`strict: false`).
- `@llm`: needs `BDD_LLM=1`. `@no-ai`: checks the no-AI states, skipped with `BDD_LLM=1`.

Ports: `BDD_PORT`, `BDD_FAKE_PORT`, `BDD_PG_PORT`, `BDD_HMR_PORT`. HTML report:
`/tmp/tourbo-bdd-report.html` (screenshots of failures).
