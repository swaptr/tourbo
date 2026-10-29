# Tourbo

Plain React Router v8 (framework mode) app on a custom Express server (`server.js`). Plan: `PLAN.md`.

## Code layout
- All core (non-UI) code goes in `server/core/` (qloo client, engine, agent, db, outreach, shared zod types).
- `app/` is UI only: routes, components. Routes/loaders/actions call into `server/core/`; never put business logic in route files.
- Server-only files in `server/core/` are named `*.server.ts`; React Router fails the build if the client imports one.
- Env: read only via `getEnv()` (`server/core/env.server.ts`, zod-validated). Never use `process.env` directly or `VITE_`-prefix secrets.
- Qloo: call only through `qlooGet()` (`server/core/qloo/client.server.ts`): GET, `X-Api-Key` header, retries 429/5xx, concurrency 8.
- shadcn components: `npx shadcn@latest add <name>` → `app/components/ui/`. Import via `~/components/ui/...`.

## Commands
- `npm run dev` — dev server (Vite middleware) on http://localhost:3000
- `npm run build` / `npm start` — production build / serve
- `npm run typecheck`
- `npm run qloo:ping` — check Qloo key + connectivity
- `npm run qloo:probe` — probe Qloo capabilities (raw output in /tmp only)
- Scripts run with Node's built-in TS support: relative imports need `.ts` extensions; erasable syntax only (no enums/parameter properties)

## Secrets
- `.env` (git- and docker-ignored) loaded via `node --env-file-if-exists`. Template: `.env.example`. Never commit keys or Qloo responses.

## Rules
- Speed over ceremony: no workspace/packages split, no premature abstraction.
- Check current official docs for the pinned version before using any library API.
