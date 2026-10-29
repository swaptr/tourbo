# Tourbo

Tour manager for small acts: Qloo finds the fans, the Tourbo MCP server turns that into tour tools, Claude decides and writes. Product vision + user stories: `STORIES.md`. Architecture plan: `PLAN.md`.

## North star (re-check after every major change)
- Read `STORIES.md` before UI/UX or flow changes. After each major change, answer its checklist: can Maya finish story 1 from the screen alone; is it clear where Qloo, the MCP server and Claude come in; does every state (empty, loading, partial, failed, done) look intentional; do the story tests pass.
- Simple beats complete: one primary action per screen, advanced options collapsed, plain words (no "fanIndex", "heatmap cells" in primary UI; put numbers behind "why?").
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
- `npm run dev` — starts Postgres (docker compose) + dev server on http://localhost:3000
- `npm run build` / `npm start` — production build / serve
- `npm run typecheck`
- `npm run test:stories` — story tests (live Qloo, no LLM); `STORY_LLM=1 npm run test:stories` adds full Claude runs
- `npm run mcp` — Tourbo MCP server on stdio (Claude Code picks it up from `.mcp.json`)
- `npm run test -w @tourbo/mcp` — MCP smoke test
- `npm run qloo:ping` / `qloo:probe` (raw output in /tmp only) / `qloo:prewarm`
- `npm run plan:demo -- "<artist>" [na|eu|in] [shows] [kind] [peers]` — deterministic engine, plan JSON
- `npm run agent:demo -- "<artist>" [na|eu|in] [shows] [kind] [peers] [promo]` — full agent run (needs `ANTHROPIC_API_KEY`)
- Scripts run with Node's built-in TS support: relative imports need `.ts` extensions; erasable syntax only (no enums/parameter properties)

## Docker
- `compose.yaml` holds every service: `postgres` (127.0.0.1:5433, user/pass/db `tourbo`) and `web` (profile `app`: `docker compose --profile app up -d --build web`). Add new services there, not as ad-hoc containers.
- `DATABASE_URL` defaults to that Postgres; schema auto-applies on first use.

## Secrets
- `.env` (git- and docker-ignored) loaded via `node --env-file-if-exists`. Template: `.env.example`. Never commit keys or Qloo responses. Never put a Qloo key or MCP token in a published MCP config.

## Rules
- Speed over ceremony: no premature abstraction.
- Check current official docs for the pinned version before using any library API.
