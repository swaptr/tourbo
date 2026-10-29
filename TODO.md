# Tourbo — TODO

Stages follow PLAN.md §11. Deadline **2026-10-30 11:45pm EDT**. Stage 4 = minimum to submit.

## Blockers
- [x] Qloo API key in `.env` → `npm run qloo:ping` passes
- [ ] Anthropic API key / credits
- [ ] Email provider picked (inbound webhook + free tier, docs verified)

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
- [ ] Postgres client + `schema.sql` (runs, trace_events, qloo_cache, outreach)
- [ ] Cache: sha256(sorted query) → `qloo_cache`, TTL
- [x] `scripts/probe.ts` (`npm run qloo:probe`). Findings (Chicago):
  - [x] `/search` resolves big / mid / niche (Taylor Swift, Japanese Breakfast, Water From Your Eyes)
  - [x] heatmap works: 5255 / 1799 / 23 cells — niche artist sparse
  - [x] use `urn:tag:category:place:{live_music_venue,concert_hall,night_club,bar}`; works with `filter.location.query` (unlisted for place!), **empty with 5-char geohash** → try `filter.location` lat/lon + radius
  - [x] `signal.location.query` on artists: 8/10 overlap → weak/ignored → fallback: filter by heatmap presence
  - [x] locality insights: 400 with artist signal → seed city list only
  - [x] latency 0.3–1.7 s/call (first calls ~3.7 s); no 429 seen at 17 calls
- [ ] Decide fallbacks (PLAN §9) from probe results
- [ ] Pick 3 demo artists

## Stage 2 — Engine (`server/core/engine/`)
- [ ] Shared zod types: Plan, CityPlan, TraceEvent, Outreach
- [ ] `data/cities-na.json`: ~50 cities (name, lat, lon, region)
- [ ] Resolve artist → id, name, image, genre tags
- [ ] City scoring from heatmaps (score 0–100, top-3 hotspots)
- [ ] Shortlist top N×1.5
- [ ] Venues: place insights near hotspots, venue + backup
- [ ] Openers: local artists, exclude headliner + bigger acts
- [ ] Promo-angle facts (brands, places, shows)
- [ ] Empty-result repair chain (radius → next tag → city query → "thin data")
- [ ] Routing: haversine, nearest-neighbour + 2-opt, dates (≤500 km/day, day off every 4–5)
- [ ] CLI `node server/core/engine/demo.ts "<artist>"` prints plan JSON

## Stage 3 — Agent + trace (`server/core/agent/`)
- [ ] Trace emitter: in-process pub/sub + persist to `trace_events`
- [ ] Tools (`betaZodTool`): resolve_artist, score_cities, plan_city, route_tour, get_city_detail, finalize_plan
- [ ] Orchestrator: Opus `toolRunner`, adaptive thinking (summarized), budgets, `stop_reason` checks, fallbacks
- [ ] Per-city Haiku worker: structured output, every claim cites a Qloo field
- [ ] Critic pass (max 2 rounds)
- [ ] Prompt caching verified (`cache_read_input_tokens`)
- [ ] Detached run started from action; progress saved to DB
- [ ] SSE route `api.runs.$id.events`: replay from `Last-Event-ID`, then live

## Stage 4 — UI (minimum to submit)
- [ ] Home form: artist autocomplete (`api.search`), home base, dates, #shows, room size, "Try" button
- [ ] Home action starts run → redirect to `/plan/:id`
- [ ] Run view: live trace (Qloo numbers as chips)
- [ ] Map (MapLibre + OpenFreeMap, client-only): heatmap, route line, numbered stops
- [ ] City cards: score, venue + backup, opener, angle, evidence chips
- [ ] "Run interrupted — retry" state

## Stage 5 — Compare
- [ ] Baseline: Opus without Qloo tools
- [ ] Compare tab: side by side, highlight differences

## Stage 6 — Outreach
- [ ] Draft venue emails, approve flow
- [ ] Send via provider HTTP API (sandbox only, `OUTREACH_LIVE=false`)
- [ ] Inbound webhook `webhooks.email`: match reply token, Haiku classifies interested / hold / pass
- [ ] Pass → promote backup venue → new draft → trace event
- [ ] "Simulate venue reply" button
- [ ] Pipeline board (Drafted → Sent → Replied → Hold → Confirmed)

## Stage 7 — Polish
- [ ] Read-only share link `/plan/:id`
- [ ] Pre-warm cache for demo artists
- [ ] Empty / error states
- [ ] Mobile-acceptable layout

## Stage 8 — Submission
- [ ] README: what, architecture diagram, why it fails without Qloo, judging criteria, local run, env vars
- [ ] ~2 min video
- [ ] Devpost text
- [ ] Repo public + MIT `LICENSE` (if rules require)
- [ ] Render awake Nov 2–5 (uptime ping on `/healthz`)

## Stretch
- [ ] Comedians (`urn:entity:person`)
- [ ] MCP server exposing `plan_tour`
- [ ] Book tours (`urn:entity:book`)
