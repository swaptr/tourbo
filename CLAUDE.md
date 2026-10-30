# Tourbo

Recommendation engine for touring artists, grounded in Qloo taste data: per city, what to perform or make there (covers, local topics, painting subjects, set order), on top of a tour plan (cities, rooms, money, route, emails). Qloo has the relations, the Tourbo MCP server turns them into tools, Claude decides and writes. Product vision + user stories: `tests/stories/STORIES.md`. Architecture plan: `PLAN.md`.

## North star (re-check after every major change)
- Read `tests/stories/STORIES.md` before UI/UX or flow changes. After each major change, answer its checklist: can Maya finish story 1 from the screen alone; does the UI speak only as Tourbo; does every state (empty, loading, partial, failed, done) look intentional; do the story tests pass.
- Simple beats complete: one primary action per screen, advanced options collapsed, plain words (no "fanIndex", "heatmap cells" in primary UI; put numbers behind "why?").
- Vendor-neutral UI: never name Qloo, Claude/Anthropic or the underlying tech in visible UI; say "Tourbo", "fan data", "your AI assistant". Keep the numbers (labelled "fan data") behind "why?". Vendor and client names only on `/connect` (setup) and in README/Devpost.
- Fan data is the hero, AI is light: every suggestion shows its evidence inline (a fact chip or mini-visual from fan data) when the evidence is strong, a hedged chip when it's weak, and nothing extra when there is none. AI only writes short summaries on top of those facts (batched, cached per run, critic-checked), never new claims. Local ideas season the act's own material; they never replace it.
- Every error: one plain sentence with what to do next, plus retry where sensible. Never a stack trace or blank page.

## Code layout (npm workspaces)
- `packages/core` (`@tourbo/core`): Qloo client, engine (scoring, venues, economics, routing, negotiation), db, critic, shared zod types. No LLM calls.
- `packages/mcp` (`@tourbo/mcp`): MCP server (tools + Qloo workflow port). Stateless, no inference. stdio bin `src/bin/stdio.ts`.
- `apps/web` (`@tourbo/web`): React Router app + Express server. `app/` is UI only; `server/` holds the hosted agent (Claude, an in-process MCP client), outreach, show prep, remote `/mcp`.
- Packages export TS source (`"exports": {"./*": "./src/*"}`); Vite bundles them (`ssr.noExternal`).
- Server-only files are named `*.server.ts`; React Router fails the build if the client imports one.
- Env: core reads only via `getEnv()` (`packages/core/src/env.server.ts`); web adds `getWebEnv()` (`apps/web/server/env.server.ts`). Never use `process.env` directly or `VITE_`-prefix secrets.
- Qloo: call only through `qlooGet()` (`packages/core/src/qloo/client.server.ts`): GET, `X-Api-Key` header, retries 429/5xx, concurrency 8.
- The hosted agent reaches Qloo-backed logic through MCP tools (`connectMcp`), same as external agents.
- shadcn components: `npx shadcn@latest add <name>` (run in `apps/web`) → `apps/web/app/components/ui/`. Import via `~/components/ui/...`.

## Commands (repo root)
- `npm run dev` — dev server on http://localhost:3000 (no Docker; see Database)
- `npm run build` / `npm start` — production build / serve
- `npm run typecheck`
- `npm run test:stories` — all story tests (live Qloo, no LLM); `STORY_LLM=1 npm run test:stories` adds full Claude runs. One file: `node --env-file-if-exists=.env --test tests/stories/<file>` (the npm script always runs every file)
- `npm run mcp` — Tourbo MCP server on stdio (Claude Code picks it up from `.mcp.json`)
- `npm run test -w @tourbo/mcp` — MCP smoke test
- `npm run qloo:ping` / `qloo:probe` (raw output in /tmp only) / `qloo:prewarm`
- `npm run examples:export` — DB → static landing bundle (`apps/web/public/landing/`); run before `build`/Docker. `npm run landing:load` — load check of the prerendered `/`
- `npm run kinds:list` — kind-of-act labels, hints, order, on/off (DB `act_kinds`, seeded from `packages/core/src/disciplines/index.ts`)
- `npm run kinds:set -- <kind> [--label X] [--hint Y] [--sort N] [--enable|--disable]` — change one kind's display; wizard shows the first 6 by sort; no deploy needed
- `npm run plan:demo -- "<artist>" [na|eu|in] [shows] [kind] [peers]` — deterministic engine, plan JSON
- `npm run agent:demo -- "<artist>" [na|eu|in] [shows] [kind] [peers] [promo]` — full agent run (needs `ANTHROPIC_API_KEY`)
- Scripts run with Node's built-in TS support: relative imports need `.ts` extensions; erasable syntax only (no enums/parameter properties)

## Database
- `DATABASE_URL` set: that Postgres. Unset: `db()` starts embedded Postgres 17 (`embedded-postgres`, `packages/core/src/db/embedded.server.ts`) on 127.0.0.1:5434, data in `.data/postgres` (git/docker-ignored); the first process to need it stops it on exit, others reuse it. Schema auto-applies on first use.
- `npm run db:import -- [source-url] [--replace]` — copy another Postgres (default the old Docker one on :5433) into the active DB; source is read-only.
- No npm script calls Docker.

## Docker (optional)
- `compose.yaml` holds every service: `postgres` (127.0.0.1:5433, user/pass/db `tourbo`) and `web` (profile `app`: `docker compose --profile app up -d --build web`). Add new services there, not as ad-hoc containers. Use the compose Postgres from npm scripts via `DATABASE_URL=postgres://tourbo:tourbo@localhost:5433/tourbo`.

## Secrets
- `.env` (git- and docker-ignored) loaded via `node --env-file-if-exists`. Template: `.env.example`. Never commit keys or raw Qloo responses (the processed landing bundle `apps/web/public/landing/` from `examples:export` is committed; it is what the deployed home page serves). Never put a Qloo key or MCP token in a published MCP config.

## Rules
- Speed over ceremony: no premature abstraction.
- Check current official docs for the pinned version before using any library API.
- Production: no fan-data or tool-result cache (`CACHE_TIERS` unset + `NODE_ENV=production` = none); the live app and MCP always call fresh. Only the landing page is pre-baked (static bundle).
- No auth: the hackathon organisers rejected adding authentication (PLAN Q4 dropped).
