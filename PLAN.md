# Tourbo — Build Plan

> **Give it an artist. It plans the tour that sells out (cities, venues, openers) and emails the venues.**

Full product spec: `../jarwise/idea_final.md`. Qloo docs (offline copy): `../jarwise/qloo-docs/`.

**Deadline:** Qloo Agentic Hackathon, **2026-10-30 11:45pm EDT**. Judging runs Nov 2–5.
**Submission needs:**

- a hosted live demo (Render)
- a public repo (hackathon asks for an OSS license; add one at submission, M8)
- a Devpost description
- a ~2 min video

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

## 10. Render deploy

- `render.yaml`:
  - one web service, `runtime: docker` (same `Dockerfile` as local), health check `/healthz`, listens on `$PORT`
  - one Postgres (free)
- Env vars set in the Render dashboard: `QLOO_API_KEY`, `QLOO_BASE_URL`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `EMAIL_API_KEY`, `EMAIL_INBOUND_SECRET`, `OUTREACH_LIVE=false`.
- Free tier: sleeps after 15 min idle, takes ~1 min to wake. Keep it awake Nov 2–5 with an uptime ping on `/healthz` (~744 h < 750 free h/month), or upgrade for judging week. Free Postgres expires 30 days after creation, which is fine through judging.
- Pre-warm the cache for 2–3 demo artists so judges get fast first runs.

## 11. Milestones (in priority order; stop where time runs out)

1. **M0 Skeleton:**
   - ~~plain React Router app on custom Express server + shadcn~~ (done); add `/healthz` + skip compression for SSE in `server.js`
   - Render deploy working end to end (deploy early)
2. **M1 Qloo layer + probes:** client, param whitelist, cache, `probe.ts` run → decide the fallbacks.
3. **M2 Engine:** resolve → city scoring → per-city venue/opener → routing. CLI `node server/core/engine/demo.ts "<artist>"` prints the plan JSON.
4. **M3 Agent:** orchestrator + workers + critic, trace events over SSE.
5. **M4 UI:** run view with the map, trace and city cards. _This is the minimum to submit._
6. **M5 Compare:** the Qloo-OFF baseline + compare tab.
7. **M6 Outreach:** drafts → approve → sandbox send → simulated/real reply → backup re-plan → pipeline board.
8. **M7 Polish:** share link, pre-warmed demo artists, empty/error states, mobile-acceptable layout.
9. **M8 Submission:**
   - README: what it does, architecture diagram, "why it fails without Qloo", how each judging criterion is met, local run instructions, env vars
   - a 2-min video (script in `idea_final.md`)
   - the Devpost text
   - make the repo public; add an OSS `LICENSE` (MIT) if the rules still require it
10. **Stretch:** comedians (`urn:entity:person`) as a second demo; an MCP server exposing `plan_tour`; book tours (`urn:entity:book`).

## 12. Open items

- [ ] Hackathon Qloo API key (requested 2026-10-23; check spam). Nothing in M1+ is verifiable until it arrives.
- [ ] Anthropic API key / credits for the hosted demo.
- [ ] Email provider choice (inbound webhook + free tier), verified against the current docs.
- [ ] Demo artists: pick 3 (big / mid / niche), based on the probe results.
- [ ] Name check: `tourbo.onrender.com` for now; the domain comes later.

## 13. Extended scope (after core): all performers + "Muse"

Verified against the live API on 2026-10-29 (`npm run qloo:probe` + ad-hoc probes):
- Comedians resolve as `urn:entity:person` (Zakir Khan, Vir Das, Dave Chappelle, Cedric the Entertainer) and **heatmaps work for them** (Zakir: Mumbai 4620 cells, Indore 388, Chicago 124; Cedric: Chicago 1914, St. Louis 582).
- **City taste is distinctive**: `signal.location.query` on tv_show / podcast / brand / person returns local culture (Mumbai → Sacred Games, Sabyasachi, Virat Kohli; Chicago → The Chi, Cubs, Chance the Rapper; Austin → Joe Rogan, Austin FC, H-E-B; London → Top Boy, Stormzy).
- Performer audience profile works: `urn:tag` / tv / brand insights with `signal.interests.entities=<performer>` (Zakir fans → Kota Factory, Panchayat, satire, poetry).
- India coverage is strong (artists, heatmaps, venues in Mumbai/Bengaluru/Delhi/Pune/Hyderabad/Kolkata).
- Limits: no news/issues/topics (city `urn:tag` insights are generic); `filter.tags=urn:tag:occupation:wikidata:stand_up_comedian` on person and `urn:tag:good_for:qloo:stand_up_comedy` on place returned nothing.
- To verify: performer signal **+** city signal combined (references that land with *your* fans *there*).

Ideas:
- **All performers:** artist or comedian (later: podcasters, authors). Same engine; venue tags and opener logic switch by type.
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
