# Tourbo — TODO

Stages follow PLAN.md §11. Deadline **2026-10-30 11:45pm EDT**. Stage 4 = minimum to submit.

## Blockers
- [x] Qloo API key in `.env` → `npm run qloo:ping` passes
- [ ] Anthropic API key / credits
- [x] Email provider: Resend (send `POST /emails`; inbound `email.received` webhook, svix-signed, body via `GET /emails/receiving/{id}`, `<id>.resend.app` receiving domain). Docs checked 2026-10-29
- [ ] Resend account: `RESEND_API_KEY`, receiving domain → `OUTREACH_REPLY_DOMAIN`, webhook `/webhooks/email` → `RESEND_WEBHOOK_SECRET` (until then sends are simulated)

## Stage 0 — Skeleton
- [x] React Router v8 SSR app on custom Express server
- [x] shadcn (base-nova), header + footer, blank home
- [x] `.env` handling: zod `getEnv()`, `.env.example`, git/docker ignore
- [x] `/healthz` route in `server.js`
- [x] Skip compression for `text/event-stream` in `server.js`
- [x] `render.yaml`: Docker web service + free Postgres
- [x] Dockerfile on npm, builds + serves locally (no `.env` in image)
- [ ] First Render deploy end to end

## Stage 1 — Qloo layer + probes
- [x] `qlooGet()`: GET, `X-Api-Key`, retries 429/5xx, p-limit 8, call count
- [x] `params.ts`: per-`filter.type` param whitelist (generated from docs), unknown params rejected; `allowUnlisted` escape hatch
- [x] `api.server.ts`: `searchEntities`, `searchTags`, `insights`, `heatmap`
- [ ] `api.server.ts`: `compare`, `trending` (if needed)
- [x] Postgres client + schema (runs, trace_events, qloo_cache, outreach); dev Postgres via `compose.yaml` on :5433
- [x] Cache: sha256(sorted query) → `qloo_cache`, 7-day TTL, best-effort (probe rerun 17 s → 2.5 s)
- [x] `scripts/probe.ts` (`npm run qloo:probe`). Findings (Chicago):
  - [x] `/search` resolves big / mid / niche (Taylor Swift, Japanese Breakfast, Water From Your Eyes)
  - [x] heatmap works: 5255 / 1799 / 23 cells — niche artist sparse
  - [x] use `urn:tag:category:place:{live_music_venue,concert_hall,night_club,bar}`; works with `filter.location.query` (unlisted for place!), **empty with 5-char geohash** → try `filter.location` lat/lon + radius
  - [x] `signal.location.query` on artists: 8/10 overlap → weak/ignored → fallback: filter by heatmap presence
  - [x] locality insights: 400 with artist signal → seed city list only
  - [x] latency 0.3–1.7 s/call (first calls ~3.7 s); no 429 seen at 17 calls
- [x] Decide fallbacks (PLAN §9 "Probe decisions"): venues via WKT point + radius repair chain
- [x] Pick 3 demo artists: Japanese Breakfast (mid), Arijit Singh (India), Water From Your Eyes (niche, thin data); comedian later: Zakir Khan

## Stage 2 — Engine (`server/core/engine/`)
- [x] Shared zod types (`server/core/shared/types.ts`): TourParams, Artist, City, CityScore, Venue, Opener, CityPlan, Plan, TraceEvent (Outreach later)
- [x] `data/cities.json`: 52 NA + 17 India seed cities; `seedCities(region)`
- [x] Resolve artist → id, name, image, genre tags (`engine/resolve.ts`)
- [x] City scoring from heatmaps (`engine/score.ts`): footprint + over-index blend, top-3 spread hotspots, thin < 50 cells; 52 NA cities in ~7 s
- [x] Shortlist top N×1.5 (thin-data cities last)
- [x] Venues (`engine/venues.ts`): place insights near top hotspot (WKT point), up to 5 candidates; final venue + backup picked by worker (Stage 3), default top 2
- [x] Openers (`engine/openers.ts`): similar artists ≤ headliner popularity, ranked per city by heatmap lift (varies per city)
- [x] Angle facts (`engine/angles.ts`): fan taste (artist), city culture (location-only), local spots (place + artist). Artist+city combined signal ≈ same across cities
- [x] Repair chain in venue search: 1500 → 3000 → 6000 m → geohash-4 → city, per tag; each step emits `repair`
- [x] Routing (`engine/routing.ts`): haversine, NN from home base + 2-opt, dates (≤500 km/drive day, >1200 km = fly day, day off every 4)
- [x] `buildPlan()` (`engine/plan.ts`) + CLI `npm run plan:demo -- "<artist>" [na|in] [shows]`: 6-stop Japanese Breakfast plan in 12.5 s

## Stage 3 — Agent + trace (`server/core/agent/`)
- [x] Trace (`trace.server.ts`): in-process pub/sub + persisted `trace_events` (ordered writes, best-effort)
- [x] Runs (`runs.server.ts`): pending → running → done/failed; "interrupted" when not owned by this process
- [x] Tools (`tools.ts`, `betaZodTool`): resolve_artist, score_cities, plan_city, route_tour, critique_plan, finalize_plan (per-run context; compact tool results)
- [x] Orchestrator (`orchestrator.server.ts`): Haiku 5.5 tool runner (Opus dropped for cost), effort medium, adaptive thinking (summarized), max 30 iterations, refusal / max_tokens checks, stable cached system prompt
- [x] Haiku 5.5 worker (`worker.ts`): structured output; venue + backup, exclusions (festivals/arenas/restaurants), capacity estimate, fit, angle, evidence refs
- [x] Critic (`critic.ts`): deterministic, max 2 rounds; flags ungrounded refs, missing venues, thin data, capacity mismatch, long legs (tested on a seeded bad plan)
- [x] `startRun()`: detached run, status + trace persisted
- [x] SSE route `api/runs/:id/events`: replay after `Last-Event-ID`, then live, heartbeat, `end` / `interrupted` events (tested: replay, resume, interrupted, 404, no compression)
- [x] `npm run agent:demo -- "<artist>" [na|in] [shows]`; fails cleanly without credentials
- [x] Live runs (2026-10-29): Japanese Breakfast NA 6 shows → critic 2 issues, all backups, $0.017, 78 s; Arijit Singh IN 5 shows → no issues, $0.013, 38 s; prompt cache reads > 0. (Opus orchestrator was $0.18/run → switched to Haiku 5.5.)
- [x] Fixed: critic ref matching ("Name (type)"), ambiguous seed cities (`query`: Washington → D.C., New York → NYC, Richmond → Virginia; Shillong dropped; all 68 verified within ~1 km), venue pool (all 4 tags per step, 12 candidates, parallel)
- [ ] Known quality gaps: India venues include hotel banquet halls (thin venue data); LLM copy occasionally embellishes ("comes home to Capitol Hill"); default room size 200–800 is wrong for arena-level artists (UI should set it)
- [x] Wire `startRun()` into the home action (Stage 4)

## Stage 4 — UI (minimum to submit)
- [x] Home form: artist autocomplete (`api.search`), home base, dates, #shows, room size presets, "Try" buttons
- [x] Home action starts run → redirect to `/plan/:id`
- [x] Run view: live trace (SSR history + SSE `?after=`; Qloo numbers as chips), revalidates on end
- [x] Map (MapLibre 6 + OpenFreeMap positron, lazy import, worker via `setWorkerUrl`): hotspot heatmap, route line, numbered stops
- [x] City cards: score, venue + backup, opener, angle, evidence chips
- [x] "Run interrupted / failed — retry" state (same params, new run)
- [x] Verified live (2026-10-29): Arijit Singh IN 6 shows end to end in browser, 236 trace events

## Stage 5 — Compare
- [x] Baseline (`agent/baseline.ts`): same model, plain prompt, no tools, structured output; runs alongside the agent, stored in `runs.baseline` (~$0.001)
- [x] Compare tab `/plan/:id/compare` (`engine/compare.ts`): both plans scored with the run's own city scores + heatmap cells (from trace, no extra Qloo calls); highlights cities only in one plan; baseline venues marked unverified
- [x] Verified (2026-10-29): Arijit Singh IN → mean city score 73 (on) vs 66 (off); off picked Delhi 43 + Chennai 34

## Stage 6 — Outreach
- [x] Draft venue emails (Haiku, cites Qloo numbers; template fallback), edit + approve flow
- [x] Send via Resend HTTP API to `OUTREACH_INBOX` only (sandbox; `reply_to` = `reply+<token>@OUTREACH_REPLY_DOMAIN`); simulated without a key. Real send untested (no key yet)
- [x] Inbound webhook `webhooks.email`: svix signature verified (tested valid / tampered / stale), reply token from `to`, quoted text stripped, Haiku classifies interested / hold / pass
- [x] Pass → promote backup venue (plan updated) → new draft → trace event (appended after the run's last seq; SSE replay now covers events after "done")
- [x] "Simulate venue reply" buttons (interested / hold / pass), same handler as the webhook
- [x] Pipeline board `/plan/:id/pipeline` (Drafted → Sent → Interested / Hold / Passed → Confirmed); verified end to end on Arijit Singh run

## Stage 7 — Polish
- [x] Read-only share link `/plan/:id` (SSR, Share button copies URL); recent finished tours on home
- [x] Pre-warm cache for demo artists: `npm run qloo:prewarm` (top 12 cities each, ~55 s cold). Cache TTL 7 days → rerun on Render before judging (Nov 2)
- [x] Empty / error states: styled 404/error boundary, plan-not-ready states on compare + pipeline, interrupted/failed retry
- [x] Mobile-acceptable layout (no horizontal overflow at 390 px on plan / compare / pipeline)

## Stage 8 — Submission
- [ ] README: what, architecture diagram, why it fails without Qloo, judging criteria, local run, env vars
- [ ] ~2 min video
- [ ] Devpost text
- [ ] Repo public + MIT `LICENSE` (**required**, file visible in repo About)
- [ ] Render awake Nov 2–5 (uptime ping on `/healthz`)

## Stretch
- [ ] Comedians (`urn:entity:person`)
- [ ] MCP server exposing `plan_tour`
- [ ] Book tours (`urn:entity:book`)

## Extended scope — all performers + Muse (PLAN §13)
- [x] Verify performer + city combined signal → weak (Chicago ≈ Austin); use city-only culture + artist-weighted local places
- [ ] Performer type: artist | comedian (person); per-type venue tags + opener logic
- [ ] Per-city set notes: local references with Qloo scores; LLM drafts bits/banter citing them
- [ ] Qloo-off comparison for set notes (generic vs grounded)
- [ ] Muse mode: city/tour cultural brief + draft material to rehearse
- [ ] Autonomous background research: refresh upcoming stops' notes (trending, new references)

## Local scene (from 20-city survey, PLAN §13)
- [ ] Seed cities: `eu` region (UK + mainland), `latam`; add Texas mid-markets (San Antonio, Fort Worth, El Paso)
- [ ] Openers v2: union of similar artists + city's local artists (`signal.location.query`), rank by audience overlap × local lift
- [ ] "Local scene" panel per city: local artists, teams/brands, people, TV (podcasts are weakly local)
- [ ] Filter noise: non-artists in artist results, duplicate names
- [ ] Thin-venue cities (Lagos, Delhi, Mexico City, Barcelona): widen venue tags
