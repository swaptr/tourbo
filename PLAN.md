# Tourbo — Build Plan

> **Give it an artist. It plans the tour that sells out (cities, venues, openers) and emails the venues.**

Full product spec: `../jarwise/idea_final.md`. Qloo docs (offline copy): `../jarwise/qloo-docs/`.

**Deadline:** Qloo Agentic Hackathon, **2026-10-30 11:45pm EDT**. Judging runs Nov 2–5.
**Submission needs:**

- a hosted live demo (Render)
- a public repo (hackathon asks for an OSS license; add one at submission, M8)
- a Devpost description
- a ~2 min video is **not required** (Devpost: "we're requiring something judges can actually use"); the live demo is what counts

---

## 1. Stack

One plain TypeScript React Router app (no workspace, no packages). No separate backend; core logic lives in `server/core/`, shared Zod types end to end.

| Layer                | Choice                                                                                                                                          | Why                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language             | TypeScript, Node 22 LTS, npm, single app                                                                                                        | One language, shared types between engine, agent, DB and UI; fast iteration                                                                        |
| Web framework        | React Router v8 framework mode (`react-router@8.5.x`, Remix successor), SSR, Vite                                                               | Stable; loaders/actions for pages, resource routes for SSE + webhooks                                                                              |
| Server               | Custom Express server (`node-custom-server` template) running the React Router request handler                                                  | One long-lived process: background agent runs survive the request; room for `/healthz`. **No compression on `text/event-stream`** (it buffers SSE) |
| Agent                | `@anthropic-ai/sdk@1.3.x`, `client.beta.messages.toolRunner()` + `betaZodTool`                                                                  | Custom tools only, we host the loop, per-turn hooks for the trace                                                                                  |
| Models               | `claude-haiku-5-5` for orchestrator (effort `medium`) and city workers (effort `low`)                                                          | Cheapest current model ($0.10/$0.50 per MTok). Opus 5.5 orchestrator measured ~$0.16/run, dropped for cost                                       |
| Safety               | Always check `stop_reason` (`refusal`, `max_tokens`); Haiku 5.5 has no server-side fallback, so a refusal fails the run / falls back to top venues | Per the claude-api skill                                                                                                                           |
| Validation           | `zod@4`                                                                                                                                         | Tool input schemas, worker structured output, env, API payloads                                                                                    |
| Streaming            | SSE: resource route `loader` returns `new Response(ReadableStream)`; browser `EventSource`                                                      | One-way trace stream; no websockets                                                                                                                |
| DB                   | Render Postgres (free tier); `postgres` (porsager) + plain SQL                                                                                  | Holds runs, trace events, Qloo cache, outreach state; filesystem is wiped on restart                                                               |
| UI                   | Tailwind v4 + shadcn/ui (`base-nova` preset, Base UI, lucide); add components with `npx shadcn@latest add <name>`                               | Fast, consistent UI; components land in `app/components/ui`                                                                                        |
| Map                  | MapLibre GL JS (`maplibre-gl@6`) + OpenFreeMap tiles, client-only (lazy import)                                                                 | No map API key; route lines, heatmap layer, markers                                                                                                |
| Email                | Transactional provider with an HTTP send API + inbound webhook (Resend or Postmark; **verify inbound support and free limits first**)           | Render free tier blocks SMTP ports                                                                                                                 |
| Deploy               | Single Render web service (Docker: `npm run build`, `node server.js`) + Render Postgres, `render.yaml` blueprint                                           | Free tier allows web services only, no free workers or cron jobs                                                                                   |

Docs-first rule: before writing each integration, check the current official docs against the pinned version (Anthropic TS SDK, React Router, MapLibre, the email provider). Qloo: trust `qloo-docs/` + live probes over memory.

## 2. Repo layout

```
tourbo/
  PLAN.md  CLAUDE.md  README.md  render.yaml  .env.example
  package.json  components.json  vite.config.ts  react-router.config.ts
  server.js                   # Express entry: compression (skip SSE), static build/client, /healthz
  server/
    app.ts                    # React Router request handler (Express)
    core/                     # ALL core (non-UI) code
      shared/                 # zod schemas + types: Plan, CityPlan, TraceEvent, Outreach
      db/                     # postgres client, schema.sql, queries (runs, trace, cache, outreach)
      qloo/
        client.ts             # fetch client, X-Api-Key, retries, p-limit concurrency, cache
        params.ts             # allowed params per filter.type (from available-parameters-by-entity-type.md)
        api.ts                # searchEntity, tags, insights, heatmap, compare, trending
      engine/
        cities.ts             # seed city list + city scoring from heatmaps
        venues.ts             # venue tag discovery + place insights near hotspots
        openers.ts            # similar local artists
        routing.ts            # haversine, nearest-neighbour + 2-opt, date spacing
        angles.ts             # promo angle facts (cross-domain insights)
        baseline.ts           # Qloo-OFF plan (LLM only) for the comparison
        data/cities-na.json   # ~50 tour-market cities: name, lat, lon, region
      agent/
        tools.ts              # betaZodTool wrappers over engine + qloo
        orchestrator.ts       # toolRunner loop, critic pass, trace emission
        worker.ts             # per-city Haiku worker
        prompts.ts
        trace.ts              # trace event emitter: in-process pub/sub + persist
      outreach/               # drafts.ts  send.ts  inbound.ts — draft → approve → send → webhook → re-plan
  app/                        # UI only; routes call into server/core (via .server modules / loaders)
    routes.ts
    routes/
      home.tsx                # artist input, params form; action starts a run
      plan.$id.tsx            # run view (trace, map, city cards); SSR loader = share link
      plan.$id.compare.tsx    # Qloo ON vs OFF
      plan.$id.pipeline.tsx   # outreach board
      api.runs.$id.events.ts  # SSE resource route
      api.search.ts           # artist autocomplete
      webhooks.email.ts       # inbound email resource route (action)
    components/               # Map (client-only), Trace, CityCard, Compare, Pipeline
    components/ui/            # shadcn components
    lib/utils.ts              # shadcn cn()
  scripts/probe.ts            # `npm run qloo:probe` (Node native TS)
  test/                       # vitest
```

## 3. Qloo client layer (build first)

- Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`, **GET only**, query-string parameters. Never `/recommendations` or `/recs`.
- `params.ts`: a whitelist of parameters for each `filter.type` (artist, place, heatmap, tag, …). Reject unknown parameters _before_ sending, because Qloo silently ignores invalid ones.
- **Empty-result repair** (each repair step is emitted as a trace event so the self-correction is visible):
  1. widen `filter.location.radius`
  2. try the next venue tag
  3. drop to the city-level `filter.location.query`
  4. mark the city as "thin data"
- **Cache:** key = sha256 of the sorted query string, stored in the `qloo_cache` table with a TTL. Allowed server-side; **never commit Qloo responses to the repo**.
- **Concurrency:** `p-limit` (start at 8) plus backoff on 429. Log the call count per run.
- **Probe script** `scripts/probe.ts` (`npm run qloo:probe`), the first thing to run when the key arrives. It answers:
  1. Does `/search` resolve 3 test artists (one big, one mid, one niche)?
  2. Does `urn:heatmap` + `signal.interests.entities=<artist>` + `filter.location.query=<city>` + `output.heatmap.boundary=urn:geohash` return points? How dense?
  3. Do `/v2/tags` queries ("live music", "music venue", "concert", "nightclub", "bar") give place tag IDs, and do `urn:entity:place` insights with those tags + `filter.location.geohash` return real venues?
  4. Does `urn:entity:artist` with `signal.location` give plausible local openers?
  5. Does `urn:entity:locality` with the artist signal work (it's only partly supported)?
  6. Rough latency and rate limits.
     Decide the fallbacks (§9) from these results.

## 4. Engine (code-controlled pipeline)

The plan is built by **code-controlled steps that the agent drives**. The heavy lifting is deterministic and parallel; the LLM makes the choices, writes the copy, and critiques.

1. **Resolve** the artist → entity ID, name, image, genre tags (`/search`, then tag insights).
2. **City scoring.** For each seed city (filtered by region and tour window), call the heatmap and get the geohash cells.
   Heatmap `affinity` is percentile-normalized per request (median 0.5), so it can't compare cities (verified 2026-10-29). Instead:
   `city_score = 0.6 × norm(log1p(Σ affinity × popularity)) + 0.4 × norm(mean affinity_rank)`, scaled to 0–100 (footprint + over-indexing; surfaces small cities that over-index, e.g. Boise).
   Keep the top 3 cells by affinity × popularity (distinct 5-char geohash prefixes) as **fan hotspots**; < 50 cells = thin data. (Locality insights don't work with an artist signal.)
3. **Shortlist:** top N×1.5 cities (N = number of shows).
4. **Per-city worker** (parallel, Haiku):
   - venue candidates: place insights near the hotspots with venue tags, filtered by popularity
   - capacity: ask the LLM to estimate the room-size fit, flagged as an estimate, because Qloo has no capacity field
   - pick a venue + a backup
   - openers: artist insights with `signal.location` = the city; exclude the headliner and any act bigger than the headliner (by popularity)
   - promo-angle facts: the top brands, places and shows for (artist + city)
   - the worker returns JSON (structured output) where **every claim cites a Qloo field**
5. **Route.** Choose N cities (score + geography), order them with nearest neighbour + 2-opt on haversine distance, and assign dates (max ~500 km/day drive, a day off after every 4–5 shows). Return total km plus the legs.
6. **Critic (deterministic code).** Checks: every pick backed by a Qloo number? Any thin-data city? Is the routing zig-zagging? Requests targeted fixes (re-run a worker, or swap a city), at most 2 rounds.
7. **Baseline (Qloo OFF).** The same prompt to the same model with no Qloo tools: "plan an N-city tour for <artist>". Shown side by side, with the differences highlighted (cities only in one plan, generic venues).

## 5. Agent + trace

- **Orchestrator `toolRunner`** with tools: `resolve_artist`, `score_cities`, `plan_city` (spawns a worker), `route_tour`, `critique_plan` (deterministic critic, max 2 rounds), `finalize_plan`. `max_iterations: 30`. (`get_city_detail` dropped: `plan_city` returns the summary.)
- **Trace events** go to the SSE stream and to the `trace_events` table:
  - kinds: `thinking_summary`, `tool_call` (name, args), `qloo_call` (endpoint, params, n_results, cached?), `repair`, `critic`, `decision`
  - shown on the UI as a live log; Qloo numbers render as chips
- Set `thinking: {type: "adaptive", display: "summarized"}` (or `updates`, beta) so the trace shows reasoning summaries instead of a long silence.
- **Prompt caching:** keep the system prompt + tool list byte-identical across runs (no timestamps); put volatile content after the cache breakpoint. Verify with `usage.cache_read_input_tokens`.
- Each run is a detached promise inside the web service process (started by the `home` action, not awaited), with progress saved to the DB. The SSE route replays stored `trace_events` from `Last-Event-ID`, then subscribes to the in-process emitter. If the instance restarts, the UI shows "run interrupted — retry" (acceptable for a hackathon).

## 6. Outreach (Should, after the core works)

- Per venue: a drafted inquiry email (artist pitch, the date, the fan-density evidence) is shown for approval.
- **Approve** → send through the email provider's HTTP API **to a sandbox / test inbox only** in the demo (config flag `OUTREACH_LIVE=false` by default).
- The inbound webhook `/webhooks/email` (resource route `action`) parses each reply, matches it to the run + venue via a plus-address or a reply token, and has Haiku classify it as interested / hold / pass.
  - **pass** → promote the backup venue → draft a new email → trace event.
  - **hold / interested** → update the pipeline board.
- Demo seed: a "simulate venue reply" button that posts to the same handler (so a live inbox isn't needed on camera).

## 7. Data model (Postgres)

```
runs(id, artist_name, artist_id, params jsonb, status, plan jsonb, baseline jsonb, created_at)
trace_events(id, run_id, seq, kind, payload jsonb, created_at)
qloo_cache(key pk, url, response jsonb, fetched_at)
outreach(id, run_id, city, venue_id, venue_name, status, draft text, thread_token, last_reply text, updated_at)
```

## 8. UI

- **Home:** artist input (autocomplete via `/search`), home base, date window, number of shows, room size. A "Try: <demo artist>" quick button.
- **Run view:**
  - left: the live trace
  - right: the map (heatmap per city on hover, route polyline, numbered stops)
  - bottom: city cards (score, venue + backup, opener, angle, evidence chips)
- **Compare tab:** Qloo ON vs Qloo OFF.
- **Pipeline tab:** outreach board (Drafted → Sent → Replied → Hold → Confirmed).
- **Share link:** `/plan/<run_id>` (read-only). Optional PDF export.

## 9. Fallbacks if the probes disappoint

| Problem                       | Fallback                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artist heatmap sparse         | Heatmap on the artist's top genre tag(s) blended with the artist signal; label as "genre-weighted"                                                                   |
| No music venues in places     | `urn:entity:place` with bar/nightclub/live-music tags near the hotspots; else name the **neighbourhood** + let the LLM suggest venues, clearly labelled "unverified" |
| Locality insights unsupported | Seed city list only                                                                                                                                                  |
| Openers weak                  | Artist insights without location, then filter by heatmap presence in the city                                                                                        |
| Rate limits                   | Smaller seed list (25), cache aggressively, pre-warm demo artists                                                                                                    |

### Probe decisions (2026-10-29, live API)

- **Venues near a hotspot:** `urn:entity:place` + `filter.location=POINT(<lon> <lat>)` (WKT; the documented `lat,lon` form returns 400) + `filter.location.radius` + `filter.tags=urn:tag:category:place:{live_music_venue,concert_hall,night_club,bar}` + artist signal. 5-char geohash prefixes return nothing.
- **Repair chain:** radius 1500 → 3000 → 6000 m → 4-char geohash → `filter.location.query=<city>` (works for place though not in the guide) → mark "thin data".
- **Sparse artist heatmap** (niche: 23 cells in Chicago): use the genre-weighted fallback.
- **Openers:** `signal.location.query` barely changes artist results (8/10 overlap), so take similar artists and keep those with heatmap presence in the city.
- **Locality insights:** 400 with an artist signal, so use the seed city list only.
- **Rate limits:** none hit; 0.3–1.7 s per call. Cache cuts a repeat probe from 17 s to 2.5 s.
- **Worldwide heatmaps (2026-10-30, for the Q7 globe):** `urn:heatmap` needs a signal plus a location; a bare global call returns nothing. Continent names in `filter.location.query` return 0 cells or the wrong place; country names work (Australia 1018 cells, Brazil 2919; 4-char geohash cells). `filter.location.radius` caps at 800000 m. So the examples prewarm queries the ~60 countries with the most cities per act, aggregates to a 1° grid (weight = Σ affinity × popularity, normalised) and stores only those coarse points in `home_examples`.

## 10. Render deploy

- `render.yaml`:
  - one web service, `runtime: docker` (same `Dockerfile` as local), health check `/healthz`, listens on `$PORT`
  - one Postgres (free)
- Env vars set in the Render dashboard: `QLOO_API_KEY`, `QLOO_BASE_URL`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `OUTREACH_REPLY_DOMAIN` (sends go only to `OUTREACH_INBOX`).
- Free tier: sleeps after 15 min idle, takes ~1 min to wake. Keep it awake Nov 2–5 with an uptime ping on `/healthz` (~744 h < 750 free h/month), or upgrade for judging week. Free Postgres expires 30 days after creation, which is fine through judging.
- Pre-warm the cache for 2–3 demo artists so judges get fast first runs.


## 13. Extended scope (after core): all performers + "Muse"

Verified against the live API on 2026-10-29 (`npm run qloo:probe` + ad-hoc probes):
- Comedians resolve as `urn:entity:person` (Zakir Khan, Vir Das, Dave Chappelle, Cedric the Entertainer) and **heatmaps work for them** (Zakir: Mumbai 4620 cells, Indore 388, Chicago 124; Cedric: Chicago 1914, St. Louis 582).
- **City taste is distinctive**: `signal.location.query` on tv_show / podcast / brand / person returns local culture (Mumbai → Sacred Games, Sabyasachi, Virat Kohli; Chicago → The Chi, Cubs, Chance the Rapper; Austin → Joe Rogan, Austin FC, H-E-B; London → Top Boy, Stormzy).
- Performer audience profile works: `urn:tag` / tv / brand insights with `signal.interests.entities=<performer>` (Zakir fans → Kota Factory, Panchayat, satire, poetry).
- India coverage is strong (artists, heatmaps, venues in Mumbai/Bengaluru/Delhi/Pune/Hyderabad/Kolkata).
- Limits: no news/issues/topics (city `urn:tag` insights are generic); `filter.tags=urn:tag:occupation:wikidata:stand_up_comedian` on person and `urn:tag:good_for:qloo:stand_up_comedy` on place returned nothing.
- To verify: performer signal **+** city signal combined (references that land with *your* fans *there*).

Ideas:
- **All performers:** artist or comedian (later: podcasters, authors). Same engine; venue tags and opener logic switch by type. Generalised to any discipline in §16.
- **Per-city set notes:** what your fans in that city watch, listen to, buy, follow and go to, each with its Qloo score; LLM drafts bits / banter / callbacks that must cite those references. Qloo-off comparison shows generic vs. grounded material.
- **Muse mode:** standalone "inspiration + prep" app — pick a city (or a whole tour), get a grounded cultural brief and draft material to rehearse.
- **Autonomous background research:** the agent keeps researching upcoming tour stops (trending shifts, new local references) and refreshes each city's notes before the show.
- Judge fit: Cedric the Entertainer (comedy) and Live Nation (touring) are both on the panel.

### Local-scene survey (2026-10-29, 20 cities, location-only signal)

- **Works globally:** India, Texas/US mid-markets, UK, EU, LatAm, Lagos, Tokyo, Sydney all return clearly local TV, brands (sports teams, local food/fashion), people (incl. local comedians and politicians) and artists.
- **Localness** (share of a city's items not in any other city's list): US 38–55% (shared national TV), non-English cities 63–93%. Podcasts are the least local (global English shows dominate); TV, brands, people and artists carry the local flavour.
- **Local artists = local scene:** `urn:entity:artist` + `signal.location.query` gives a city's own scene (Houston → Slim Thug / Paul Wall / Bun B; New Orleans → Big Freedia / Trombone Shorty; Bengaluru → Anirudh; Barcelona → Rosalía / Txarango). Better opener candidates than similarity alone: pick local acts that also overlap the headliner's audience.
- **Venue coverage:** 50+ live-music venues in most US/EU/Tokyo/Sydney/São Paulo; thin in Lagos (2), Delhi (9), Mexico City (11), Barcelona (16) → widen tags (bar, night club, concert hall) there.
- **Noise to filter:** non-artists in artist results (actors, "BVG" transit, models), duplicates (Jassie Gill / Jassi Gill, Utada / 宇多田ヒカル).
- **Next regions:** add seed lists for `eu` (UK + mainland) and `latam`; Texas mid-markets (San Antonio, El Paso, Fort Worth) to the NA list.

## 14. Small-act direction (proposed, 2026-10-29)

**Pitch:** *the tour manager, booking agent and writers' room a small act can't afford.* Back to the `idea_final.md` primary user (indie, comedy and foreign acts, ~5k–500k listeners, no agency). Routing alone is what labels and promoters already do for big acts. A small act asks: is this city worth it, which room, what to charge, what to say on stage.

**Design rule (agentic first):** every feature feeds a decision the agent makes, explains and acts on. A brief, calculator or content pack on its own doesn't count.

### Grounding (jarwise research + 2025 gallery, 2026-10-29)
- Qloo's framing for this hackathon (scout.db, 2026-09-30): *"agents can reason, plan & execute. The next frontier is judgment: what to choose, and why… genuinely useful, personalized decisions."* Calacanis: *"maybe your next company."*
- 2025 Qloo LLM Hackathon (287 projects, `qloo-hackathon.devpost.com`): ~70% were consumer recommenders/travel planners; none won. 3 of 4 winners replaced a costly gut-feel decision for a business buyer (GeoTaste: SMB sites; Alloy: M&A culture fit, ReAct + web search; Resonance AI: per-location political messaging); Zesty won on one sharp concept. All had shallow agent loops.
- Closest prior entry, **Espionage** (not a winner): reference artist + city → heatmap hotspots + demographics → AI-written geo-targeted ad campaigns. Single pass, content only; "one-click launch" was future work. Lesson: the music idea alone isn't enough; decide, act and loop.
- 2026 agentic bar: own identity acting in the world, keeps working while you're away, plan → act → observe → critique.
- Judges: Live Nation (touring), Cedric the Entertainer (comedy) (§13).

### Features, by agentic value
1. **Profit-seeking loop.** Goal: maximise tour profit within the act's risk limit. The agent tries alternatives (swap a city, room type, ticket price, deal type: door split / guarantee / ticketed vs free + bar, support slot vs headline vs skip), re-scores, stops when gains flatten, and explains each choice with Qloo evidence + estimates. Inputs: costs (travel km from routing, lodging, venue fee, opener), estimated draw from hotspot density, promo spend and sponsor revenue (items 2, 4). Venue-type fit (bar / club / concert hall / hotel or event space) from Qloo place tags + fan affinity is one of the levers; comedy rooms need a workaround (stand-up place/person tags returned nothing). Qloo has no capacity/price/sales data → draw and profit are labelled estimates, calibrated by the act's past shows where uploaded.
2. **Promo spend as a decision** (from Espionage, made agentic). Split a promo budget across cities and hotspot neighbourhoods by expected ticket gain; draft geo-targeted ads + poster copy; after approval, re-allocate on ticket pace.
3. **Outreach + negotiation with its own identity.** Builds on Stage 6: evidence-pack inquiries, read replies, counter on guarantee vs door split within user-set limits, accept/decline, re-plan the leg on a pass.
4. **Local sponsor matching** (from CollabScope / AudienceIQ). Local brands and bars the act's fans in that city like → drafted sponsorship / co-promo / after-party asks; accepted deals count as revenue in item 1.
5. **Material prep as a critic loop** (lead demo feature; Resonance-shaped but decision-led). Per-city brief from Qloo city taste (local TV, brands, teams, people, local artists with scores, §13 survey) + web search for current topics (Qloo has no news) → drafts: comedians get bits/banter/callbacks + sensitivity check; musicians get setlist order, local cover/shout-out, banter → grounding critic rejects any reference without a Qloo value → revise. Optional rehearsal panel: persona agents built from that city's Qloo audience react to the set (simulation idea from `jarwise/idea.md`), labelled a rehearsal, not a prediction. Qloo-off contrast: generic vs grounded material. Songs: Qloo works at artist/album/genre level, not tracks → song picks inferred, labelled.
6. **"Tour where acts like you already win"** (market finder; Espionage's playbook clone). Performer type (musician, comedian, DJ, podcaster); unknown/thin acts blend 2–3 comparable acts' heatmaps ("estimated"); optional own-data upload (Spotify-for-Artists city export, past ticket sales). Genre-tag heatmaps across cities pick markets for foreign acts (e.g. Mumbai/Bengaluru vs qawwali in tier-2 cities; verify with a probe before pitching). One act × city fit score (fans, genre fit, culture match) the agent reasons over (Alloy-style).
7. **Keeps working after the plan.** Before each stop: refresh the city's notes and trending shifts, watch ticket pace (user-entered), then act: push promo, suggest a smaller room, swap the opener.
8. **MCP server** exposing `plan_tour` / `prep_city` ("wire Qloo into an agent you already have"; matches Qloo's harness/MCP push).
9. **Post-show learning loop.** Log attendance, takings and what landed → recalibrate the draw model and material per act.

### Lower priority (inputs to item 1, not features of their own)
- Show setup: opener from the local scene (overlap with headliner audience), weekday choice + clash check (needs an events API).
- Reverse mode: venues/bars ask "which local acts fill my room on a Tuesday?" (second buyer).
- **Getting there (only after the Qloo layer is worthwhile):** with several candidate venues in a city, factor distance from the airport, train/bus stations and public transport (stops, late-night service), plus load-in/parking. Feeds venue choice, travel cost and fan reach (transit-reachable from hotspots). Needs OSM/GTFS; not in Qloo.

## 15. Architecture v2: MCP server + hosted web app (proposed, 2026-10-29)

Goal: one Qloo-grounded **MCP server** that any agent can plug into (Claude Desktop, other MCP clients), and the **web app** as hosted inference: its agent is just another MCP client. Replaces the "no workspace" rule in `CLAUDE.md` once adopted (update it in step A).

### Principles
- **MCP server = no inference.** Deterministic, Qloo-grounded data and calculations only: Qloo workflows, city scoring, venues, openers, local scene, routing, critic, later economics and market finder. No `ANTHROPIC_API_KEY` needed, so stdio users run it with their own model.
- **Web app = inference.** Orchestrator, per-city workers, baseline, material drafting, outreach and negotiation: everything that calls Claude. It reaches tools only through MCP.
- **Stateless tools.** Each call carries its inputs (artist id, city, params); repeated work is cheap because of the Qloo cache. No per-run server state, so the same tools work from Claude Desktop and the hosted agent. Run state (runs, trace, outreach) stays in the web app's DB.
- **One Qloo path.** All Qloo calls still go through `qlooGet()` (whitelist, retries, concurrency, cache).

### Workspace layout (npm workspaces)
```
tourbo/
  package.json                 # "workspaces": ["packages/*", "apps/*"]; root scripts delegate with -w
  packages/
    core/                      # @tourbo/core  (today's server/core minus agent/ and run DB)
      src/qloo/                # client, params whitelist, cache (Postgres if DATABASE_URL, else in-memory)
      src/engine/              # resolve, score, venues, openers, angles, routing, plan, compare
      src/critic/              # deterministic critic (moved from agent/)
      src/shared/              # zod types
      src/env.ts               # getEnv(): only QLOO_* required here
    mcp/                       # @tourbo/mcp  (publishable: npx @tourbo/mcp)
      src/server.ts            # createTourboMcpServer({ toolsets }) -> McpServer
      src/toolsets/qloo/       # TS port of the 9 harness workflows (see below)
      src/toolsets/tourbo/     # domain tools over @tourbo/core
      src/bin/stdio.ts         # StdioServerTransport; reads the user's own QLOO_API_KEY
  apps/
    web/                       # today's app/ + server.js + server/app.ts
      app/                     # React Router UI (unchanged rules: UI only)
      server/agent/            # orchestrator, worker, baseline, usage, trace, runs (MCP client)
      server/outreach/
      server/db/               # runs, trace_events, outreach (+ qloo_cache schema)
      server/mcp-http.ts       # mounts Streamable HTTP /mcp on the Express server
```
- Packages export TS source in-repo (`"exports": {".": "./src/index.ts"}`): Vite compiles it for the web app; Node's type stripping runs scripts (workspace symlinks resolve outside `node_modules`; verify). Keep erasable syntax only.
- `@tourbo/mcp` gets a `tsc` build to `dist/` + `publishConfig.exports` for npm; `@tourbo/core` is bundled into it or published alongside.
- `*.server.ts` naming stays inside `apps/web`; packages are server-only by construction (never imported by `app/` client code).

### Toolsets
1. **`qloo_*` — TS port of `@qloo/qloo-harness@0.1.26` workflows** (MIT; keep the copyright notice in the ported files). Same names and input shapes so prompts and docs carry over: `qloo_capabilities`, `qloo_recommend`, `qloo_rank`, `qloo_describe`, `qloo_where_popular`, `qloo_compare_audiences`, `qloo_entity_tags`, `qloo_audience_demographics`, `qloo_trends`, `qloo_find_tags`. Schemas rewritten in zod v4 (harness uses typebox); executed via `qlooGet()` instead of the harness's own client; no `@earendil-works/pi-coding-agent` dependency. Ported from the npm package `@qloo/qloo-harness@0.1.26` (`dist/chunks/chunk-MCLV3P4I.js`, `dist/qloo-tools.js`); no copy kept in the repo.
2. **`tourbo_*` — domain tools over `@tourbo/core`:** `tourbo_resolve_artist`, `tourbo_score_cities`, `tourbo_city_detail` (venue candidates, openers, angles, local scene for one city), `tourbo_route`, `tourbo_critique`, `tourbo_compare_plans`; later (§14) `tourbo_city_economics`, `tourbo_market_finder`, `tourbo_city_brief` (data for material prep), `tourbo_sponsors`.
- Tool results: compact `structuredContent` (zod `outputSchema`) + short text summary; every number keeps its Qloo source field so the critic and UI evidence chips still work.
- MCP prompts/resources (optional): `plan_tour` prompt for Claude Desktop users; `tourbo://cities/{region}` seed-city resource.

### Transports
| Mode | Transport | Credential | Who |
|---|---|---|---|
| Local | stdio (`npx @tourbo/mcp`) | user's own `QLOO_API_KEY` env | Claude Desktop / any MCP client |
| Hosted agent | in-process `InMemoryTransport` client ↔ server | server's key, never leaves the process | web app runs |
| Remote | Streamable HTTP `/mcp` on the web service (`NodeStreamableHTTPServerTransport`, stateless) | bearer token required; or caller's own Qloo key in a header | judges / other agents |

- Kit rules (https://github.com/qloo/qloo-hackathon-kit `docs/API_ACCESS.md`): never put a credential in a public MCP config or share it. So `/mcp` is **never open**: tokens from `MCP_TOKENS` env (or BYO Qloo key), per-token rate limit, host/origin validation. Default off until configured.
- Public MCP (stdio) users bring their own Qloo key; the README says so.

### Hosted inference (web app)
- Orchestrator keeps `client.beta.messages.toolRunner()`; tools come from MCP: `mcpTools(tools, mcpClient)` (`@anthropic-ai/sdk/helpers/beta/mcp`, present in the pinned 1.3.0). Filter the tool list per role: orchestrator gets `tourbo_*`; city workers get `tourbo_city_detail` + selected `qloo_*` (e.g. `qloo_recommend` with location for material prep).
- Workers stay in the web app (they're inference). The orchestrator's `plan_city` becomes a local runner tool that spawns a worker which itself calls MCP tools.
- **Trace:** `tool_call` events are recorded client-side when the runner invokes an MCP tool; `qloo_call` / `repair` events come from the server as MCP logging/progress notifications tied to the request, forwarded into `trace_events`. Verify the v2 notification API before building.
- Keep prompt caching: stable tool list order and descriptions (sorted, no volatile text).
- Alternative considered: the Messages API MCP connector (Claude calls a remote `/mcp` URL directly). Rejected for the hosted path: loses the live trace, per-call control and in-process key isolation. Fine for third parties.

### Versions (checked 2026-10-29; re-verify at implementation)
- `@modelcontextprotocol/server` 2.4.0 (v2 stable, MCP spec 2026-07-28; `McpServer.registerTool` with zod v4 schemas, `StdioServerTransport`, `InMemoryTransport`), `@modelcontextprotocol/client` 2.4.0, `@modelcontextprotocol/node` 2.1.2 (`NodeStreamableHTTPServerTransport`), `@modelcontextprotocol/express` 2.0.2 (`createMcpExpressApp`, `hostHeaderValidation`, `requireBearerAuth`). The v1 `@modelcontextprotocol/sdk` 1.32.x (used by the kit's starter) is the old line.
- MCP v2 needs zod ^4.2 (we pin 4.6.7). TS ≥6 needs `"types": ["node"]` (we're on 5.9).
- `@anthropic-ai/sdk` 1.3.0: `mcpTool` / `mcpTools` / `mcpResourceToContent` helpers.

### Migration (each step leaves the app working)
- **A. Workspace move.** `git mv server/core` → `packages/core` (agent + run DB → `apps/web/server`), `app/` + `server.js` + `server/app.ts` → `apps/web`. Update imports (`@tourbo/core/...`), scripts (root delegates with `-w`), `Dockerfile` (`npm ci` at root, build `-w apps/web`), `render.yaml`, `compose.yaml` paths, `CLAUDE.md` layout + rules. Check: typecheck, `plan:demo`, `agent:demo`, Docker build + smoke.
- **B. Qloo toolset port.** 9 workflows + capabilities in `packages/mcp`. Contract test: same inputs through the npm harness (`npx @qloo/qloo-harness@0.1.26 mcp`, from a temp dir) and ours → same result shape and comparable entities.
- **C. Domain toolset.** Wrap engine + critic as `tourbo_*`; stateless inputs; compact outputs.
- **D. Transports.** stdio bin; in-memory pair; `/mcp` HTTP behind tokens. Test with MCP Inspector and Claude Desktop.
- **E. Agent switch.** Orchestrator and workers use `mcpTools` via the in-memory client; delete `betaZodTool` wrappers in `agent/tools.ts`; trace via notifications. Parity check vs today: Japanese Breakfast NA 6 shows and Arijit Singh IN (cost, critic issues, plan quality).
- **F. Publish.** `@tourbo/mcp` on npm, README section with a Claude Desktop config (own key), MCP Inspector screenshot.
- **G. §14 features** land as new `tourbo_*` tools (data) + web-app agent loops (decisions).

### Open questions
- Publish `@tourbo/core` separately or bundle it into `@tourbo/mcp`? (Bundling keeps one public package.)
- Cache backend for stdio users: in-memory by default, optional `DATABASE_URL`/SQLite?
- Whether to keep harness-identical `qloo_*` names or prefix them (`tourbo_qloo_*`) to avoid clashing when a client also runs `qloo mcp`.

## 16. Any artist: a discipline-agnostic model (built 2026-10-30; field name stays `kind`)

Goal: the same agent loop manages a tour for any working artist (singer, DJ, comic, dancer, poet, painter, author, podcaster). The hosted demo stays pinned to one discipline; core and MCP accept all of them. Replaces the `musician | comedian` enum (`PerformerKind`, `packages/core/src/shared/types.ts`) and the per-kind `if`s in `engine/resolve.ts`, `engine/venues.ts`, `engine/openers.ts`, `engine/economics.ts` and `apps/web/server/agent/worker.ts`.

### Discipline profile (one registry, `packages/core/src/disciplines/`)
Each discipline is a data record, not a code branch:
- `entityTypes`: Qloo types to resolve the act, in order (fallback when not found: act-less mode below).
- `signal`: how fan demand is built: act entity heatmap, peer blend (2–3 comparable acts), genre/scene tags (`signal.interests.tags`), or a mix with weights.
- `spaceTags`: Qloo place tags for venues/spaces, plus `roomType()` labels and default capacities.
- `peerType` + `peerFilter`: the "opener" equivalent and how to find it (replaces `isMusician` / the comedian branch).
- `revenue`: economics model (below) + per-region reference prices (replaces `REGION_DEFAULTS.ticket[kind]`).
- `run`: one-night shows vs multi-day/week stays; routing unit (days vs weeks).
- `prep`: what "material prep" means; worker + drafting prompt fragment.
- `verified`: date + probe summary; unverified disciplines can't be enabled.

### Disciplines (Qloo fit is honest; "verify" = needs a `/v2/tags` + insights probe)
| Discipline | Resolve as | Demand signal | Spaces (place tags) | Peer / "opener" | Revenue | Run | Prep |
|---|---|---|---|---|---|---|---|
| Singers / bands | `artist` (verified) | act heatmap; peers for thin acts | live_music_venue, concert_hall, night_club, bar (verified) | support act (similar + local scene, done) | ticketed: door split / guarantee / versus / bar deal; merch | 1 night | setlist order, local cover / shout-out, banter |
| DJs / producers | `artist` | act heatmap + genre tags (techno, house) | night_club, bar (verified); lounge, rooftop (verify) | guest / warm-up DJ from local scene | club fee or door split, bar deal | 1 night, late | set arc, local tracks/artists to nod to |
| Comedians | `person` (verified) | act heatmap (verified) | comedy_club (verified; Mumbai thin), bar, concert_hall | similar people, local comics (needs person noise filter) | ticketed; bar deal | 1 night, often 2 shows | bits, banter, callbacks, sensitivity check |
| Dancers / companies | `person` / `artist` if famous; else none | genre tags (kathak, ballet, contemporary, hip hop) + peers | concert_hall, night_club (verified); theatre, dance_studio, performing_arts_center (verify) | co-bill company, local dance school | ticketed + workshops (per head) | 1–3 nights + workshop day | piece order, music choices, local motif / collab |
| Theatre / spoken word / poets | `person` | tags (poetry, slam, theatre) + peers | theatre, bar, cafe, bookstore (verify) | local poets / open-mic host | ticketed or door split; book/zine sales | 1 night to short run | set list of pieces, local references |
| Painters / visual artists | rarely in Qloo; famous ones as `person` | genre/scene tags (street art, contemporary art) + comparable well-known artists as peers + brand/place affinity | art_gallery, museum (verify); cafe, bar, hotel lobby as pop-up (verify) | co-exhibitors, local artists, live-painting slot at a music/club night | sales commission (gallery 40–60%), entry fee, live-painting fee, murals/commissions, workshops, prints | 1–6 weeks per city | show theme, local motifs, piece selection per city, mural brief |
| Authors | `book` + `author` (search) / `person` | book entity heatmap (verify), genre tags | bookstore, library, cafe, theatre (verify) | in-conversation host, local author | book sales cut, event fee, festival fee | 1 evening | reading excerpt, local angle, Q&A prep |
| Podcasters | `podcast` | podcast heatmap (verify); global English shows dominate (§13 survey) | theatre, comedy_club, concert_hall | local guest (from `signal.location.query` people) | ticketed live show; sponsor reads; merch | 1 night | episode outline, local guest, local topics (web search) |

Weak signal, stated plainly: most painters, dancers, poets and small DJs are not Qloo entities. Their demand comes from tags + peers + place affinity and is labelled "estimated from comparable acts / scene"; own-data upload (past sales, followers by city) calibrates it (§14 item 6). Qloo has no art-market, gallery capacity or book sales data.

### Act-less mode (act not in Qloo)
- Inputs: discipline, 2–5 genre/scene tags (picked via `tourbo_find_tags` / `qloo_find_tags`), 1–3 comparable acts (any Qloo type).
- City demand = weighted blend of tag heatmaps (verified for genre tags, e.g. qawwali) and peer heatmaps; scores flagged `basis: "scene"`.
- Spaces: place tags near the scene's hotspots; galleries/studios re-ranked by peer audience affinity (same as brands-by-city re-ranked by fans, verified).

### Economics revenue models (`engine/economics.ts`)
- `ticketed` (today): deals door_split / guarantee / versus / bar_deal; price × elastic draw.
- `exhibition`: footfall from demand × days; entry fee (often 0) + `sales = buyers × avg price × (1 − commission)`; costs add shipping/crating, framing, space rent per week, insurance; lodging per week.
- `workshop`: per-head fee × class size × sessions; add-on to any discipline.
- `commission`: fixed fee (mural, live painting, private event); no draw model.
- `merch` / `sales_table`: per-head spend × attendance (books, prints, records).
- A city's outcome = sum of the models the discipline enables; the profit loop (§14 item 1) searches over them like it does deals today. All numbers stay labelled estimates.

### Same agent loop, per discipline
score markets → pick spaces → economics + verdict → route → promo → prep → outreach → check-ins → post-show learning. What changes:
- **Exhibitions / residencies:** fewer cities (2–4), longer stays, routing by weeks (no drive-day rule; shipping lead time instead), outreach to galleries/cafes with a portfolio + Qloo audience pack, check-ins track footfall and sales not ticket pace, post-show logs pieces sold and price.
- **Dance / theatre:** small runs, tech/space needs (stage size, floor) noted by the worker; workshops booked alongside shows.
- **Authors / podcasters:** one-evening stops, partner-led (bookstore, festival); promo leans on the partner's audience.
- **Music / comedy / DJ:** unchanged from today.

### Demo scope
- `DEMO_DISCIPLINES` env (via `getEnv()`, default `musician`): the hosted app offers only these; the home form shows a discipline picker only when more than one is enabled.
- MCP tools and core accept every discipline in the registry with `verified` set; others return "not verified yet" plus what's missing.
- Demo story: singer end to end; one slide/CLI run shows the same tools on a painter (act-less mode) to prove it's agnostic.

### Schema + code changes
- `PerformerKind` → `Discipline` (`z.enum` built from the registry keys); `TourParams.kind` / `Artist.kind` → `discipline` (keep `kind` as an accepted alias for old runs in the DB).
- `Artist.id` optional (act-less); add `Artist.tags` input + `Artist.peers` as the demand basis.
- `engine/resolve.ts`: `ENTITY_TYPE` → `profile.entityTypes`; `artistById` infers discipline from entity type.
- `engine/venues.ts`: `VENUE_TAGS` / `COMEDY_TAGS` / `roomType()` → `profile.spaceTags` (tag → label → default capacity).
- `engine/openers.ts`: `isMusician` / comedian branch → `profile.peerType` + `peerFilter`; rename "opener" to "support" in the UI copy where it isn't music.
- `engine/economics.ts`: `REGION_DEFAULTS.ticket[kind]` → per-discipline price table; revenue models above; `ROOM_DEFAULT_CAPACITY` from the profile.
- `engine/routing.ts`: `run.unit = "day" | "week"`; stay length per stop.
- `apps/web/server/agent/worker.ts`: `SYSTEM` / `COMEDY_SYSTEM` → base prompt + `profile.prep` fragment (exclusions per discipline, e.g. galleries reject arenas, musicians reject restaurants).
- MCP (`packages/mcp/src/tourbo/tools.ts`): `kind` param → `discipline` (enum from registry); new `tourbo_disciplines` tool + `tourbo://disciplines` resource (profile, verified status, revenue models); `plan_tour` prompt takes `discipline`.

### Verification before enabling a discipline
- `/v2/tags` search for each space tag; place insights return ≥ 5 places in 3+ seed cities (one NA, one EU, one IN).
- Resolve 2–3 sample acts per entity type (e.g. a DJ, a dance company, an author, a podcast); heatmap cell counts recorded.
- Act-less: 2 genre/scene tags → heatmap top cities make sense (e.g. street art, kathak).
- Record results in `profile.verified` and in §13-style notes here; raw output in /tmp only.

## 17. Feature status (spec `../jarwise/idea_final.md` + later ideas; keep current)
Update this table whenever a feature is built, changed or dropped: set Status, add the date and the main file. Status: built · partial · not built · later · dropped.

| Feature | Status | Notes |
| --- | --- | --- |
| Fan city scoring (heatmaps, footprint + over-index) | built | `engine/score.ts` |
| Venues near fan hotspots (repair chain) | built | `engine/venues.ts` |
| Local openers | built | `engine/openers.ts` |
| Routing + dates from home base | built | `engine/routing.ts` |
| Promo angle / city brief (fan taste, city taste, sponsors) | built | `engine/angles.ts`, `tourbo_city_brief`; no news (needs web search) |
| Show economics, offer assessment, negotiation, ticket pace | built | `engine/economics.ts`, `negotiate.ts`, `pace.ts` |
| Live agent trace + critic loop + grounding rule | built | `apps/web/server/agent/` |
| Qloo-off comparison | built | `run-tabs.tsx`, `orchestrator.server.ts` |
| Outreach pipeline board (Drafted → Confirmed), reply handling | partial | `plan.$id.pipeline`; sends simulated until Resend account set |
| Reverse mode (venue → acts) | built | `tourbo_acts_for_venue` |
| MCP server, local stdio | built | `packages/mcp`, `npm run mcp` |
| MCP server, remote `/mcp` | built | 2026-10-31; deployed on Render; shared demo token `MCP_PUBLIC_TOKEN` (per-IP limit) on README + `/connect`, private `MCP_TOKENS` |
| MCP distribution: hosted `/mcp` + self-host (`npx @tourbo/mcp`, `--http`, Docker) (Q10) | built | 2026-10-30; `packages/mcp/build.mjs`, `src/bin/cli.ts`, `src/http.ts`, `packages/mcp/Dockerfile`, `/connect` tabs; npm publish + image push by owner |
| "Ideas for this place": covers, local topics, painting subjects per city, region ranking, `tourbo_ideas` (Q12) | built | 2026-10-30; `engine/ideas.ts` + `ideas-rank.ts`, `plan.$id.ideas.tsx`, `/ideas`, saved per plan, Keep / Not for me / Tell Tourbo; live checks pending (quota) |
| Clean MCP toolset on latest spec: annotations, output schemas, resources, prompts, extra open-data artist tools (Q13) | built | 2026-10-30 (spec 2026-07-28): hints + output schemas on every tool, plain errors (`packages/mcp/src/errors.ts`), trimmed outputs, `tourbo_export_ics` / `tourbo_export_markdown`, 3 resource templates, 4 prompts with completions, localhost host check + constant-time tokens; `tourbo_plan_edit` built 2026-10-31: edit store moved to core (`packages/core/src/runs/edits.server.ts` + `steps.server.ts`, web routes call it), tool in `packages/mcp/src/extra/plan-edit.ts` (view / apply / undo / reset / dismiss / restorePref, same ops as the web, version guard, money + route summary, optional candidates); run id is the capability like `tourbo_project_update`; tests: MCP smoke + `npm run test -w @tourbo/core` |
| Every kind of act on the website (18 kinds, ideas per kind) (Q14) | built | 2026-10-30; `disciplines/index.ts`; 10 newest from docs, not probed live |
| One-word kind labels, editable in the DB | built | 2026-10-30; table `act_kinds` (label, hint, sort, enabled; seeded from the registry, edits survive), `disciplines/labels.server.ts` `actKinds()`, `npm run kinds:set` / `kinds:list`; wizard tiles, explore, ideas, MCP catalog; `tests/unit/kinds.test.ts` |
| Performance context: slots, originality budget, audience, sensitivity (Q15) | built | 2026-10-30; `packages/core/src/context/` |
| Your work without accounts: owner keys, continue, resume, delete, export (Q16) | built | 2026-10-30; `components/your-work.tsx`, `lib/work.ts`, `server/owner.server.ts` |
| Insights charts + BDD suite for every kind of act (Q17) | built | 2026-10-30; `plan.$id.insights.tsx`, `components/charts/`, `tests/bdd/` (`npm run test:bdd`) |
| Place features from open data (Q18) | built | 2026-10-30; `packages/core/src/places/`, `tourbo_place_features` |
| Map-first editable plan, stable night ids, feedback loop (Q19) | built | 2026-10-30; `engine/edit.ts`, `components/plan-workspace.tsx`, `workspace-map.tsx`, `server/agent/edits.server.ts` |
| Ask Tourbo chat, levers, decision prompts (Q20) | built | 2026-10-30; `server/agent/chat.server.ts`, `engine/levers.ts`, `engine/prompts.ts`, `components/assistant/` |
| Profile once + workspace: Tours · Shows · Library, events + material entities (Q21) | built | 2026-10-30; `core/profiles/`, `core/events/`, `core/material/`, `/start`, `/work`, `/new`, `/events/:id`, `/material`, `components/list/` (FilterBar, NewMenu, RowActions), `lib/labels.ts`; AI assist blocks built (`core/assist/assist.ts`, `server/agent/assist.server.ts`, `/api/assist`, `components/assist/`, `tests/unit/assist.test.ts`), mounting + Projects retirement pending |
| Tour workspace shell: nights rail · map · night panel, one tab row + More, header profit popover, Tune popover, docked Ask, Tonight (show day) | built | 2026-10-30; `routes/plan.$id.tsx`, `plan.$id.road.tsx` (/tonight), `components/plan-workspace.tsx`, `workspace-map.tsx`, `lib/tour-tabs.ts`; tab map in `.impeccable/surfaces/app-routes-plan-id-tsx.md`; AssistButton/InsightLine pending components/assist |
| Tabs by kind: per-kind tab set, single-word names, night-panel names, Library nouns/types, show-form hints; kind tabs Covers · Openers · Crowd · Tone · Sales · Sessions · Pitches (data-gated, never empty) | built | 2026-10-30; `WORKSPACES`/`workspaceFor`/`workspaceTabs` in `packages/core/src/disciplines/index.ts`, `routes/plan.$id.kind.tsx`, `components/kind-tabs/`; table in `.impeccable/surfaces/app-routes-plan-id-tsx.md` "Tabs by kind"; Set interiors per kind on the show set (`components/kind-tabs/set-shape.tsx`: energy curve, bit markers + crowd slot, wall grid, menu by course, class timeline), Library details (`material.details`), show sessions/seats (`events.classes`), Tickets copy per kind; same interiors in the night panel and pasted sets, wall prices in the plan's currency; Ideas leaves covers to Covers (musicians), controls folded under "Tune these ideas"; place-name genre tags dropped (`engine/places.ts`) |
| Grounded "why" lines + inline evidence (strong / some / none) | built | 2026-10-30; `engine/explain.ts`, `explain-facts.ts`, `server/agent/explain.server.ts`, `components/insight.tsx` |
| Remote MCP with OAuth sign-in (Claude/ChatGPT connector for non-coders) | later | needs public URL; Claude custom connectors take URL + browser OAuth |
| Connector directory listing (Claude / ChatGPT) | later | after OAuth + deploy |
| Hosted demo (Render) + public repo | not built | kept local for now (2026-10-30); `render.yaml` ready |
| Candidate cities: hand-picked seed list (97 cities, na/eu/in) | built | `engine/data/cities.json`; locality insights 400 with artist signal, so a list is required |
| Any city on the map (GeoNames dataset, top towns by population in circle) | built | 2026-10-30; `npm run cities:seed` loads GeoNames cities15000 (~34k cities, CC BY 4.0) into Postgres `cities`/`countries`; `ensureWorld()` + `citiesNear()` (largest in circle, suburbs merged within 25 km, cap 25); regions without seeds use their 20 largest cities; story 11. City brief on a map click: not built |
| Home examples data (Q7, nights now 3–8 per example, Q11): 150+ acts × 3 decisions, worldwide fan density, why-numbers | building | 2026-10-30; `npm run examples:prewarm` (apps/web/scripts/prewarm-examples.ts) → `home_examples` (decision, route[], tourProfit, losingNight, compare chosen-vs-skipped, per-city `why` = 60% reach + 40% lean) + `home_fan_density` (per act ≤ 25k points: country heatmaps at 0.25°/0.5°, metro heatmaps at geohash 6–7; `_world` base layer); `headlineMismatch()` rejects "skip/loses" on profitable nights; `examples:fanmap` flat-map gap check; engine CityScore + MCP `scoreParts` expose reach/lean; venue headlines are decisions ("book X (~N seats) over Y"); export play order goes continent by continent (long hops only at 5 boundaries); globe hover needs intent (rest 220 ms / switch 450 ms, no takeover while tracing). 322 complete / 130 acts; gate blocked on dancer 2/3 until fan data quota clears. UI side: globe agent (test 14) |
| Landing globe (Q7 UI): terrain mountains, in-globe pop-ups, geographic play order, one dialog, perf gate | built | 2026-10-30; `lib/globe-scene.ts` (DOM-free three.js scene: baked fan terrain with hypsometric tint + stronger hillshade + baked lee shadow/AO (`reliefShade`), peaks 0.1 × region height, clipped to land with a short coastal fade (`rasterLand`/`coastFade`, land-110m), contours dropped; terrain baked in the browser only (2026-10-30: pre-baked PNGs and `server/terrain-png.ts` dropped, export ships data only; before the look change the client bake matched the old PNGs pixel for pixel on all 322): `lib/bake.worker.ts` queue ("now" before "idle" prebakes, newer "now" cancels older, points as transferred Float64Array, 8-bit + half-float heights back), next 3 examples prebaked on idle (LRU of 8 baked maps; ~51 of 50 Next swaps hit it), 128² on phones/canvas < 600 px, sliced (8 ms) main-thread fallback when the worker fails; bake look ("hazy" feedback): adaptive radial quartic kernels (6th-neighbour spacing, no rims), stop summits lifted from their own fan data, smooth segment ridges, crisp coast with land-side fade; bake 256² ~7–10 ms + shade ~3 ms in Node unloaded (was 29 + 18); stop badges, names, skipped × and 1–2 pop-ups on the peaks (top city + surprise; hidden behind the globe by normal·view, horizon fade, hidden under the dialog, while a marker is hovered, or when they overlap) in one instanced atlas draw; render on demand; quality tiers 50↓/58↑ fps (waves, hit cadence, terrain mesh only; DPR fixed per session ≤ 2, follows display changes, so no blur and no mid-frame relink); 4× MSAA only when DPR < 1.75; zoom patch (50m land) painted in `lib/land.worker.ts`, repaint and fine grid wait for a settled view (no uploads while dragging); navigation: grab-and-follow drag, zoom to cursor (wheel deltaMode normalised, trackpad pinch, touch pinch, double click/tap), ctrl + scroll hint without intent, focusable globe (arrows, +/−, Esc), input cancelled on lost capture/blur/hidden tab; per-pixel terrain normals, crisp ramp edge, soft low ground, terrain and waves clipped at the coast; up to 6 nearest examples as flat sibling-ramp surfaces in one atlas sampled by the Earth pass (no extra draw call), hover/tap on them works, promote/demote crossfade; bake in `lib/bake.worker.ts`; shader links waited out with a polled GPU fence behind the still; hover zones rebuilt ≤ every 120 ms while the camera moves; context loss → `/globe-still.webp`), `lib/landing-data.ts` (manifest `status` ready/incomplete/warming; flat city lights, towns fetched when idle; region files in our `LandingRegionFile` format: per act columnar ints ×100, delta weights, thin indexes; 1006 → 814 KB gz over 6 regions, decoded exactly per act), `lib/home-store.ts` (event-driven clock), `lib/showcase.ts` (play order = export order; random start per session, wrap); `npm run perf:home` (Playwright gate on the prod build); test 14 (22 checks incl. pop-ups, 20 list picks, short-way travel, all controls, drag/zoom/never-stuck/wheel-hint/auto-travel, full DPR after 30 s + tab switch, neighbour surfaces); Lighthouse desktop 99, mobile 84–91 |
| App-wide calm theme + neutral copy (Q7 rest of app, Q2/Q5 tests) | built | 2026-10-30; theme pass over wizard, plan, compare, pipeline, live, projects, connect, cards (no gradients, no mono, serif numbers); `lib/neutral.ts` rewrites planner text that names the vendor before display; tests 15 (tokens, AA, fonts, no hex) and 17 (no vendor names outside /connect, ≥ 4 clients) |
| One wide heatmap over the circle → cluster hotspots into towns | later | untested: cell detail at 600 km radius unknown |
| Projects: one per tour/show; notes, to-dos, setlist/joke drafts, saved briefs; runs + show prep attach | built | 2026-10-30; `packages/core/src/projects/`, `/projects`, `/projects/:id`, "Add to project" on the plan page, wizard `?project=`; MCP `tourbo_project_create/list/get/add/update` (get returns markdown); story 10. Show prep reached through the attached plan, not copied |
| Send project to Notion / Asana via their hosted MCP (`mcp.notion.com/mcp`, `mcp.asana.com/v2/mcp`, OAuth) | later | free path first: user adds Tourbo + Notion connectors in their own Claude and Claude bridges them; hosted-agent export needs per-user OAuth (Asana needs a registered client) |
| Rehearsal panel: persona agents from a city's Qloo audience react to a draft set/setlist | built | 2026-10-30; `engine/rehearsal.ts` (4 personas = slices of the city brief, grounding check, tally), `apps/web/server/agent/rehearsal.server.ts` (one worker call per persona, parallel; saved in `show_prep.prep.rehearsal`), "Rehearse with fans" on the show-notes page; MCP `tourbo_rehearsal_panel` returns personas + role-play instructions (no inference); story 12. Not done: punch-up revise pass on misfires; comic-vs-singer reaction level not asserted |
| Backtest: known real tours/outcomes, grounded vs LLM-only hit rate | built | 2026-10-30; `engine/backtest.ts`, `npm run backtest` (`apps/web/server/agent/backtest.ts`), 8 tours in `tests/stories/backtest.json` with sources; README table. Result: agreement with bookers 68% Qloo vs 67% Claude alone vs 42% random — a tie on cities, not a win; story 13 |
| Shareable plan link / PDF export | not built | spec "Should" |
| Momentum weighting via `/v2/trending` | partial | `qloo_trends` MCP tool exists; not used in scoring |
| Book tours / live podcasts (`urn:entity:book`, `urn:entity:podcast`) | built | 2026-10-30; author + podcaster disciplines; podcast heatmaps rich (0/55 NA thin); authors add their book as a peer (book 1/26 thin vs person 22/26) |
| Any artist: discipline registry (singer, comedian, DJ, dancer, poet, visual artist, author, podcaster) | built | 2026-10-30; `packages/core/src/disciplines/index.ts`; `tourbo_disciplines` + `tourbo://disciplines`; website offers `DEMO_DISCIPLINES` (default musician,comedian), MCP all; story 9 |
| Exhibition + commission money models (visual artists, multi-day stays) | built | 2026-10-30; `engine/economics.ts` `evaluateStay`; `stayDays` routing in `engine/routing.ts` |
| Act-less mode (act not in Qloo → peers or scene tags) | built | 2026-10-30; `resolvePerformer` peers, `tourbo_find_markets` tags; no `basis: "scene"` label |
| One cache layer (Q8 cache half) | built | 2026-10-30; `packages/core/src/cache/` (`cached(key, fn, {ns, ttl, swr, tiers, tags, cacheable})` + `snapshot.get/put`; tiers memory LRU → file (read-only in prod) → postgres via `CACHE_TIERS`, default from `QLOO_CACHE`; written through + backfill, SWR, one in-flight load per key, null/undefined/thrown never stored); `cache` table (namespace, key, value, stored_at, expires_at, tags) with `qloo_cache` kept and read through for the `qloo` ns (no migration, nothing dropped); `qlooGet()` on it (7 days, no SWR); MCP `tourbo_score_cities` / `city_detail` / `openers` / `city_brief` cached 1 day per input (skipped when a Qloo call failed during the run); hit/stale/miss/coalesced per ns in `cacheSummary()` (`usage.ts`, demo + prewarm output) and dev `/healthz?cache`; test 18 (9 offline checks). Not done: public plan views, object-store tier |
| Fully static landing (Q8 landing half) | built | 2026-10-30; `/` prerendered at build (`react-router.config.ts` `prerender: ["/"]`; `server/app.ts` also re-exports the server build for the prerender step) with the hero and the first example in play order inline (`server/home.server.ts` `landingFirstExample()` reads the bundle on disk; `home.tsx` seeds the store with it, a fresh session starts the walk there, so no random first example); `server.js` serves `index.html` / `_.data` as files (`public, max-age=300, s-maxage=86400, stale-while-revalidate=604800`, no cookie; `?live=off` still SSRs), hashed `/assets` + `/landing/*.<hash>.*` immutable, manifest 60 s; `scripts/precompress.ts` (part of `build`) writes .br/.gz served as-is (on-the-fly compression was ~3.7 ms CPU per request); Docker image carries the bundle (not docker-ignored); `npm run landing:load` (sinks for DB / fan data / AI): 1,000 visits × 20 requests, 0 failed, 0 DB / 0 fan-data / 0 AI, TTFB `/` p50 26 ms / p95 45 ms at concurrency 10 (server 8 / 17 ms), p50 122 / p95 171 ms at 50 (client-bound, same box); test 18-landing-static (4 checks) |
| Run without Docker (embedded Postgres) | built | 2026-10-30; no npm script calls Docker (`predev` removed); `DATABASE_URL` set = that Postgres, unset = `db()` starts `embedded-postgres` 17.10 (`packages/core/src/db/embedded.server.ts`, 127.0.0.1:5434, data `.data/postgres`, git/docker-ignored; first process stops it on exit, others reuse it); `npm run db:import -- [url] [--replace]` copies another Postgres in (source read-only); Docker DB imported 2026-10-30 (all tables, counts + content checked). compose.yaml/Dockerfile kept as the optional path |
| Autonomous background research (refresh upcoming stops' notes) | later | NICE_TO_HAVE.md |
| ~2 min demo video | later | optional; raw footage recorded 2026-10-29 |
| Plain UI + unlisted acts (sounds-like / style / city-only) + "Build my set" + /help (Q9) | built | 2026-10-30; `start.tsx`, `engine/resolve.ts` + `basis.ts`, `engine/set.ts`, `plan.$id.set.tsx`, `routes/help.tsx`, `components/hint.tsx`; live fan-data checks pending (quota) |

### Next to build (recommended order, 2026-10-30)
Goal: make Tourbo worth returning to for non-coders (indie singers, comics), who will mostly use the website; MCP is the second door for power users and other agents. Pick freely; update the table above when done.
1. **Projects.** One per tour or show: notes, to-dos, setlist/joke drafts, saved city briefs; plan runs and show prep attach to it. Tables `projects` + `project_items` (kind: note | todo | setlist | brief, optional city). Same data in web pages and MCP tools (`tourbo_project_create`, `tourbo_project_get`, `tourbo_project_add`, `tourbo_project_list`). Why: gives a reason to come back and makes the MCP useful across chats.
2. **Any city on the map.** Swap hand-picked seeds for an open city dataset (e.g. GeoNames `cities15000`: name, lat/lon, population, country); take the 15–25 largest towns inside the circle and score as now. Add "What does this city love?" on a map click (city brief for any city). Why: "I want to play New Delhi" works anywhere, same Qloo call count.
3. **Rehearsal panel** (inside show prep). Personas built from the city's Qloo audience react to a draft set or setlist; each reaction cites a Qloo value; labelled a rehearsal, not a prediction. Why: most memorable demo, matches Qloo's synthetic-audience direction.
4. **Backtest.** 5–10 known tours/outcomes; grounded vs LLM-only hit rate in a small table in README. Why: backs the impact claim.
5. **Non-coder MCP access** (when deployed). OAuth sign-in on remote `/mcp` so "paste URL in Claude connectors" works; then directory listing. Bearer token stays for agents.
6. **Validate with real users.** Show story 1 to 3–5 indie musicians or comics; note where they get stuck; until then, a browser walkthrough as a first-time user.

### Test suite for the new features (story tests, 2026-10-30)
Every feature in "Next to build" ships with a story in `tests/stories/STORIES.md` and a test in `tests/stories/` (live Qloo, no LLM unless marked `STORY_LLM=1`). Follow the existing pattern: MCP calls through `_mcp.ts`; web checks skip when the app isn't running (`appUp()`); assertions state the user-visible promise, not internals. `npm run test:stories` must stay green after each feature; run `STORY_LLM=1` before calling a feature done.

| Story / test | Feature | Pass (what the test asserts) |
| --- | --- | --- |
| 10 `10-maya-project.test.ts` (exists, not yet in `tests/stories/STORIES.md`) | Projects | add story 10 text to `tests/stories/STORIES.md`; extend the test: a plan run and a show prep attach to the project and show up in `tourbo_project_get`; a to-do toggles done; deleting an item doesn't touch others |
| 11 `11-any-city.test.ts` | Any city on the map | a circle around a city not in the old seed list (e.g. Boise, Lucknow, Porto) yields ≥ shows candidate cities, all inside the circle; city brief works for a clicked city; a circle over open sea gives the plain "no cities" error. Update story 1 to read coordinates from the new dataset, not `seedCities()` |
| 12 `12-rehearsal.test.ts` | Rehearsal panel | no-LLM part: persona slices for a city are non-empty, each built only from that city's brief, and differ between two cities. `STORY_LLM=1` part: every kept reaction cites a ref from its persona's slice (deterministic check, like `critique()`); the panel is labelled a rehearsal; a set with an ungrounded line gets it flagged; Rohan (comic) gets joke-level reactions, Maya (singer) setlist-level |
| 13 `13-backtest.test.ts` | Backtest | runs the engine on the fixed list of known tours (no LLM); Qloo-grounded hit rate ≥ the recorded baseline in `tests/stories/backtest.json`; the README table matches the latest run |
| 7 `7-errors.test.ts` (extend) | all new features | a bad project id, a city with no Qloo data, a rehearsal with the AI key missing and an empty project each give one plain sentence and a next step, never a stack trace |
| 8 `8-full-run.test.ts` (extend, `STORY_LLM=1`) | end to end | wizard → plan → save to project → show prep → rehearse → result visible on the project page |
| 5 `5-dev-claude-code.test.ts` (extend) | MCP | new tools (`tourbo_project_*`, rehearsal persona tool if added) are listed, read-only flags are correct, and outputs are clean markdown/JSON a user's own Claude can paste into Notion |

Rules: one test file per story; no Qloo responses committed (`backtest.json` stores only tour names, expected cities and hit rates); keep each no-LLM story under ~60 s with the Qloo cache warm; when a feature changes, update its story text, its test and its row in the status table in the same change.

## 18. Build queue (from the discussion session)
The discussion session writes no code. Each feature the user asks for there is appended below; the building session takes the next `queued` entry, builds it (split across parallel agents where the parts are independent), then sets its status here and in the §17 table, with its story test per "Test suite for the new features". Entries are appended only, never reordered; status: queued · building · done · dropped.

Entry format:
- **Feature:** one line
- **Why / user ask:** the user's words or reason
- **Pass:** what the user sees when it works
- **Story test:** file and assertions
- **Likely files:** paths
- **Status:** queued (date)

Finished entries (Q1–Q20) were removed on 2026-10-31; they are in git history (`git show 54d6198:PLAN.md`) and their results are in the §17 table.

### Q21. Profile once, then a workspace of tours and events
- **Feature:** The form only learns who the user is: name/act (listed or not), kind of act, home base, style; saved as an **act profile** in the browser (owner key, no account) and the DB. After that the user lives in a **workspace**: a list of their tours and one-off events (gigs, gallery shows, talks), each with status (draft, planned, on the road, past). Past items move to **Archived** automatically (last date passed) and can be restored. Sorting (date, name, profit, nights), filtering (status, kind, region, upcoming/past) and search are built in. "New tour" and "New event" start from the profile (no re-asking who you are); opening one lands in the Q19 plan workspace (map + nights + side panel). **Tabs stay, used smartly** (user, 2026-10-30: "I like the tabs, but I would prefer a workspace like layout where tabs are also used smartly"): tour-level tabs (Plan, Ideas, Set, Insights, Prep, More) switch the main pane inside the workspace without leaving the map/night list; the side panel has its own tabs scoped to the selected night (Ideas, Set, Venue, Prep) so picking a night keeps the current tab; tabs show counts/badges (e.g. 3 new ideas, 1 failed), hide when empty, and the active tab persists in the URL. Existing "Your work" and projects fold into this list.
- **Skippable onboarding, required info gated (user, 2026-10-30):** "We should be able to skip the onboarding … if that information about the user is missing, then it will again trigger the onboarding when we are creating a tour … certain information is needed for the app to get started, and getting that information is very important." Onboarding has a "Skip for now" that lands on the workspace (browse examples, open saved/shared plans). One shared definition of required profile fields per action (e.g. a tour needs act name + kind + home base; an event needs act + kind + city). Any action that needs a missing field ("New tour", "New event", ideas for my act) opens the onboarding again, pre-filled, showing only the missing steps with one plain line why ("Tourbo needs your home base to plan the route"), then continues straight into the action the user started. The workspace shows a small "Finish your profile" prompt while required fields are missing. Pass: skip → workspace; New tour with no profile → only the missing steps → tour created without re-clicking; complete profile → never asked again; required-field rules unit-tested.
- **Multi-talented acts, kind lives on the event (user, 2026-10-30):** "one single user might be multi-talented, so make this a multi-select … bake it in into the event itself … so we don't have to worry about onboarding again … even if we want to start from scratch, like what sort of event should it be?" Profile "What do you do?" is multi-select (`kinds[]`, first = main). Every tour/event stores its own `kind`: the New tour/event form opens with "What sort of show is this?" pre-picked to the main kind, chips for the user's other kinds, and "Something else" for any kind (start from scratch). Kind is therefore never a reason to re-open onboarding; the required-fields rule drops kind (tour: act name + home base; event: act name + city), and that rule stays the only gate. Ideas, set, prep and the engine use the event's kind, not the profile's. Pass: profile with comedian + singer → New tour offers both, picks comedian; picking singer makes a singer plan; "Something else" → dancer works with no onboarding; old single-kind profiles/plans migrate (kind → kinds[0]).
- **Event dates + venue (user, 2026-10-30: "also let events have a date range and venue"):** an event has a start and end date (one day or a range, e.g. a 3-week gallery show or a weekend residency) and a venue: pick from Tourbo's suggested rooms in that city (saved runs / venue engine, fit + money shown) or type your own name + address (unlisted venue, no fan-data lookup needed). Venue is optional at creation ("Help me pick" fills it later); dates are optional for drafts. Status and auto-archive use the end date; sort by start date; filter by upcoming/past uses the range. Pass: create a 3-day event at a typed venue → it shows the range and venue in the workspace, moves to Archived the day after the end date; switching to a suggested venue updates money.
- **Events and material are their own entities (user, 2026-10-30: "events and material can be separate entities so we can access it as well"):** DB tables, not blobs inside a run. **Event** (id, owner, kind, title, start/end, city, venue, status, optional `tour_id`): a tour's nights are events linked to it, and a one-off event has no tour; each has its own page `/events/:id` and shows in the workspace list. **Material** (id, owner, kind, title, type: song, bit, talk, piece, routine…, length, notes, tags, original vs cover/local idea): the act's library at `/material`, reusable across events. An event's set is an ordered list of material refs; saving a Tourbo idea ("Keep") adds it to the library marked as a local idea, so originals stay first. Workspace navigation: Tours · Events · Material. Pass: add 5 songs to Material, build a set for an event from them, reuse 3 in another event; deleting an event leaves material intact; a tour night opens as its event page; existing runs/sets migrate into events + material.
- **Why / user ask (2026-10-30):** "once you get a basic work started, like ask who the user is, what does it do, then you can have like events or tours … in a workspace like feature … various tours … some of them might have passed, so those are archived, and you have sorting, filtering … the form should just do the bare minimum of knowing the user, and then the workspace should take on from there."
- **Pass:** a first-time user answers ≤ 3 short steps, then sees an empty workspace with one primary action; a returning user lands on the workspace with tours listed; a tour whose last date passed shows under Archived; sort/filter/search work and persist in the URL; creating a second tour never asks who they are again; editing the profile is one place; deleting works; no auth (owner key only); every state (empty, loading, failed) intentional.
- **Story test:** new `tests/stories/36-workspace.test.ts`; BDD scenarios "I set up my profile once", "I archive a past tour", "I filter my tours".
- **AI assists (user, 2026-10-30):** AI does the chores, fan data supplies the facts: paste-to-Library parsing + auto-tags, auto titles, one-line smart insights per tour/show row, "Build my set" per night, profile suggestions; editable drafts with evidence, cached, fallback when AI is off. See `apps/web/.impeccable/surfaces/app-routes-projects-tsx.md`.
- **Status:** built (2026-10-30): profiles (`kinds[]`, skippable, gated per action via `REQUIRED`), workspace `/work` (Tours · Shows tabs + `/material` Library on the shared `components/list` kit; sort/filter/search in the URL; auto-archive by last date; ⋯ row menus; popover New forms), events with date range + venue (own or suggested) and tour nights synced as events, material library + per-show sets, ink app bar with act menu. Tests: `36-workspace`, `tests/unit/{profile,workspace,material}`, BDD `workspace.feature` + `material.feature`. Also: AI assists wired (paste, tags, show title, Build my set, profile suggest, row insights); any-town home base / start-near search (`/api/towns`, local GeoNames table); New tour popover (`components/new-tour.tsx`, `/new` stays for drawing an area); Projects retired (`/projects*` redirect to the tour or `/work`; notes and to-dos per tour via `/api/tours/:id/notes` + `components/tour-notes.tsx`); Main toggle on kinds; ink app bar h-14 on every page.
