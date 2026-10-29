# Tourbo

Plain React Router v8 (framework mode) app on a custom Express server (`server.js`). Plan: `PLAN.md`.

## Code layout
- All core (non-UI) code goes in `server/core/` (qloo client, engine, agent, db, outreach, shared zod types).
- `app/` is UI only: routes, components. Routes/loaders/actions call into `server/core/`; never put business logic in route files.
- shadcn components: `pnpm dlx shadcn@latest add <name>` → `app/components/ui/`. Import via `~/components/ui/...`.

## Commands
- `pnpm dev` — dev server (Vite middleware) on http://localhost:3000
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm typecheck`

## Rules
- Speed over ceremony: no workspace/packages split, no premature abstraction.
- Check current official docs for the pinned version before using any library API.
