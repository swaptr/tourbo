# Tourbo — TODO

Stages follow PLAN.md §11. Deadline **2026-10-30 11:45pm EDT**. Stage 4 = minimum to submit.

## Blockers
- [x] Qloo API key in `.env` → `npm run qloo:ping` passes
- [x] Anthropic API key / credits
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
- [x] ~~`api.server.ts`: `compare`, `trending`~~ not needed (compare tab uses the run's own scores)
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
- [x] Fixed: worker `messages.parse` threw on unparseable output (seen as SF/Chicago/Portland dropped); now max_tokens 8000, one retry, then top-ranked venue fallback
- [ ] Known quality gaps: India venues include hotel banquet halls (thin venue data); LLM copy occasionally embellishes ("comes home to Capitol Hill"); room size now set in the UI (club / theater / amphitheater / arena presets)
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
- [x] README: what, architecture diagram, why it fails without Qloo, judging criteria, local run, env vars (live URL added at deploy)
- [ ] Optional (not required by Devpost): ~2 min video (script in `SUBMISSION.md`). Raw silent footage recorded 2026-10-29 (`~/Videos/tourbo-demo-raw.webm`, 2:27, 1440×900, via `scripts/record-demo.cjs`); needs voice-over + trim
- [x] Devpost text (`SUBMISSION.md`)
- [x] MIT `LICENSE` + `license` in package.json
- [ ] Repo public (user)
- [ ] Render awake Nov 2–5: `.github/workflows/keepalive.yml` pings `/healthz` every 10 min Nov 1–6 once repo variable `TOURBO_URL` is set
- [x] Docker image ships `scripts/` + `server/` so `npm run qloo:prewarm` runs from the Render shell (tested in container)

## Stretch
- [x] Comedians (`urn:entity:person`)
- [x] MCP server exposing `plan_tour`
- [ ] Book tours (`urn:entity:book`)

## Extended scope — all performers + Muse (PLAN §13)
- [x] Verify performer + city combined signal → weak (Chicago ≈ Austin); use city-only culture + artist-weighted local places
- [x] Performer type: artist | comedian (person); per-type venue tags + opener logic
- [x] Per-city set notes: local references with Qloo scores; LLM drafts bits/banter citing them
- [x] Qloo-off comparison for set notes (generic vs grounded)
- [x] Muse mode: city/tour cultural brief + draft material to rehearse
- [ ] Autonomous background research: refresh upcoming stops' notes (trending, new references)

## Local scene (from 20-city survey, PLAN §13)
- [x] Seed cities: `eu` region (26 cities, UK + mainland; Glasgow / Brighton / Copenhagen need qualified queries), Texas mid-markets (San Antonio, Fort Worth, El Paso). All verified: heatmap centroid within ~4 km (Bristol 19, Lisbon 9). Japanese Breakfast EU plan: London 100, Paris, Berlin, Amsterdam, Glasgow, Dublin
- [ ] Seed cities: `latam` (optional)
- [x] Openers v2: city's local acts (`signal.location.query`, kept only if in ≤ 1/3 of tour cities' lists, ≤ headliner popularity) scored against the headliner with `filter.results.entities`; wins if affinity ≥ similar-shortlist min − 0.05, else similar artist by heatmap lift. Verified: Hyderabad → Chinmayi, Bengaluru → Benny Dayal, Portland → Haley Heynderickx
- [x] "Local scene" panel per city card (TV, brands & teams, people, fans' local spots) + "local favourite" opener badge
- [x] Filter noise (`isMusician`: no instruments + non-performer description, "ambiguous artist name"; `dedupeArtists`: aliases + edit distance ≤ 1). Verified: drops BVG, Wolfgang Tillmans, Charlotte Roche; dedupes Marsimoto, Trae, Jassie Gill, 宇多田ヒカル
- [ ] Thin-venue cities (Lagos, Delhi, Mexico City, Barcelona): widen venue tags

## Small-act direction (PLAN §14, proposed; agentic first)
- [x] Profit-seeking loop: alternatives (city, room type, price, deal, support/headline/skip), re-score, stop on flat gains, explain; venue-type fit lever; comedy-room workaround
- [x] Promo spend decision: budget split by hotspot, geo-ad drafts, re-allocate on ticket pace
- [x] Outreach negotiation: counter guarantee vs door split within limits, accept/decline, re-plan on pass
- [x] Local sponsor matching → asks; accepted deals as revenue
- [x] Material prep critic loop (Qloo city brief → drafts → grounding critic → revise); Qloo-off contrast. Not done: web search, rehearsal panel
- [x] "Acts like you" market finder: performer type, comparable-act blend, genre-tag heatmaps, act × city fit score. Not done: own-data upload
- [x] Keeps working after the plan: pre-stop refresh, ticket pace → actions
- [x] MCP server: `plan_tour` (tool + prompt), `prep_city` as `tourbo_city_brief`
- [x] Post-show learning loop
- [ ] Lower (done: local opener, reverse mode `tourbo_acts_for_venue`, venue access `tourbo_venue_access`; open: date clash, GTFS load-in): show setup (local opener, date clash), reverse mode; after the Qloo layer: venue access (airport, train/bus, transit, load-in) via OSM/GTFS

## Architecture v2: MCP server + hosted web app (PLAN §15, proposed)
- [x] A. npm workspaces: `packages/core`, `packages/mcp`, `apps/web`; imports, scripts, Dockerfile, render.yaml, CLAUDE.md
- [x] B. TS port of the 9 harness Qloo workflows (+ capabilities) on `qlooGet()`; harness copy removed from repo (port carries its MIT notice)
- [x] C. `tourbo_*` domain tools over core (stateless, compact structured output)
- [x] D. Transports: stdio bin, in-memory (hosted), Streamable HTTP `/mcp` behind tokens; MCP Inspector + Claude Desktop test
- [x] E. Agent on `mcpTools()` via in-memory client; trace via MCP notifications; parity check
- [ ] F. Publish `@tourbo/mcp`; README Claude Desktop config

## Home page, cache, local dev (PLAN §18 Q7/Q8, 2026-10-30)
- [x] Home examples data: 322 complete examples, 130 acts, 6 continents (`examples:prewarm` → `examples:export`); honest compare pairs + `exampleProblem()` checks; venue headlines are decisions ("book X over Y")
- [x] Globe home page: one docked dialog (‹ Prev · All · Next ›), virtualised "All" list, hover intent (no flip while tracing), continent-by-continent play order, terrain relief with land clip, pop-ups on peaks
- [x] Terrain baked in the browser from the JSON bundle (worker, prebake next 3, LRU, cancel stale, 128 on phones, main-thread fallback in slices); PNGs removed; bundle 9.2 → 5.0 MB
- [x] Landing bundle committed (`apps/web/public/landing/`); raw fan-data responses still never committed
- [x] Q8 cache layer (`packages/core/src/cache`, tiers via `CACHE_TIERS`); production default = no cache (live app + MCP always fresh, only the landing page is pre-baked)
- [x] Q8 static landing: `/` prerendered with the first example inline, CDN cache headers, pre-compressed assets; 1,000-visit load test = 0 DB / fan-data / AI calls
- [x] npm scripts without Docker: local Postgres (`embedded-postgres`, `.data/postgres`) when `DATABASE_URL` is unset; `npm run db:import` copies the old Docker DB (done, verified)
- [x] ~~Q4 auth (Better Auth)~~ dropped: hackathon organisers rejected adding authentication
- [x] Globe final pass: slow-drag fix (MSAA only below DPR 1.75, zoom-patch repaint after 180 ms still), drag/zoom overhaul (grab-follow, zoom to cursor, clamps, keyboard, ctrl+scroll hint, never stuck), look (softer shadows, crisp coast), up to 6 nearby examples as flat surfaces (no extra draw call), CLS 0; story 14 22/22 ×3
- [ ] Dance gate: 2 of 3 dancer acts (Dance Theatre of Harlem, Pilobolus) blocked by the fan-data monthly quota (0 left, resets ~Nov 28; raise requested on Discord); home bundle status stays "incomplete" until then
- [ ] Perf: desktop 60 fps, 0 long tasks, 3.2 ms main thread; GPU 7.4–8.9 ms (target 8); 4× throttled long tasks

## Any artist (PLAN §16, built 2026-10-30)
- [x] Discipline registry `packages/core/src/disciplines/`: entity types, space tags, peer type + filter, prices, per-head sales, stay length, prep prompt, room rules, verified probe note
- [x] `PerformerKind` widened to 8 disciplines (field name stays `kind`, so old runs load unchanged)
- [x] Musician + comedian moved into the registry; no behaviour change (`plan:demo` Japanese Breakfast + Zakir Khan: same cities and openers)
- [x] `resolve.ts`: entity types from profile; `artistById` infers discipline
- [x] `venues.ts`: space tags + room labels + default capacities from profile
- [x] `openers.ts`: peer type + filter (occupation tags) from profile; card label uses the discipline's support name
- [x] Act-less mode: comparable acts as peers (resolve) or scene tags (`tourbo_find_markets`); `basis: "scene"` label not added
- [x] Economics: per-discipline prices (`ticketFactor`) + per-head sales (books, prints, workshops); `exhibition` (visitors over the stay, entry split, sales net of commission) and `commission` (flat fee, 3 days on site) deals for visual artists
- [x] Routing: stay length per stop (`stayDays`, painters 14, dancers 2)
- [x] Worker + show notes: per-discipline room rules and prep prompt (music and comedy prompts unchanged)
- [x] MCP: `kind` enum from the registry; `tourbo_disciplines` tool + `tourbo://disciplines` resource; `plan_tour` prompt covers every discipline
- [x] `DEMO_DISCIPLINES` env (default `musician,comedian`, `all` for every one); onboarding tiles from it, others pointed to MCP
- [x] Probe DJs: night_club / lounge 20/20/20 rooms, Peggy Gou resolves, techno tag heatmap ranks cities (one sample DJ, not two)
- [x] Probe dancers: performing_arts_theater 20/20/18, dance_school 10/16/11; contemporary tag heatmap
- [x] Probe poets/theatre: book_store / cafe 20/20/20, poetry tag heatmap
- [x] Probe visual artists: art_gallery 20/20/16, museum 20/20/9, street_art tag + Banksy as a peer
- [x] Probe authors: book heatmap (Normal People 1/26 EU cities thin) beats the author as a person (22/26 thin): add the book as a peer; book_store / library tags
- [x] Probe podcasters: podcast heatmaps (My Favorite Murder, Call Her Daddy: 0/55 NA cities thin), theatre tags
- [x] Demo: painter run (act-less, Banksy as peer) via `plan:demo`, `agent:demo` (Claude picks Hayward Gallery, De Hallen, Belvedere) and story test 9

## UX v2: stories-first (2026-10-29)
- [x] `STORIES.md` (7 user stories + per-change checklist); CLAUDE.md north-star section
- [x] Landing page: outcome-first, "who does what" (Qloo / Tourbo MCP / Claude)
- [x] `/start` onboarding wizard: discipline → Qloo match ("is this you?" / sounds-like) → map area picker → dates/size/money → agent jobs
- [x] Area (`TourParams.area`) → candidate cities (`citiesNear`), MCP `tourbo_score_cities.near`
- [x] Agent jobs after the plan: show notes per night, venue email drafts
- [x] Plan page: progress checklist while running, plain failure panel + retry, stats + map + simple night cards ("why?" details)
- [x] Strict act resolution (no silent fuzzy matches); friendly error mapping
- [x] Negotiation: `tourbo_assess_offer` + reply term extraction + counter draft in Venue emails
- [x] `.mcp.json` (Claude Code picks up Tourbo in the repo); Connect page = 3 paths
- [x] `npm run test:stories` (stories 1–7, live Qloo, no LLM; `STORY_LLM=1` full run)
- [x] Ticket sales tab: check-ins → `tourbo_ticket_pace` advice; post-show results → draw calibration
- [x] Copy buttons on Connect snippets; mobile pass (390px: home, wizard, plan, notes, emails)
- [ ] Render deploy (owner sets keys; `render.yaml` ready)
