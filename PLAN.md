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
   - optional 2-min video (not required; script in `SUBMISSION.md`)
   - the Devpost text
   - make the repo public; add an OSS `LICENSE` (MIT) if the rules still require it
10. **Stretch:** comedians (`urn:entity:person`) as a second demo; an MCP server exposing `plan_tour`; book tours (`urn:entity:book`).

## 12. Open items

- [ ] Hackathon Qloo API key (requested 2026-10-23; check spam). Nothing in M1+ is verifiable until it arrives.
- [ ] Anthropic API key / credits for the hosted demo.
- [x] Email provider: Resend (inbound via `email.received` webhook + `*.resend.app` domain), docs checked 2026-10-29.
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
| Outreach pipeline board (Drafted → Confirmed), reply handling | partial | `plan.$id.pipeline`; sends simulated until Resend account set (TODO.md) |
| Reverse mode (venue → acts) | built | `tourbo_acts_for_venue` |
| MCP server, local stdio | built | `packages/mcp`, `.mcp.json` |
| MCP server, remote `/mcp` | partial | bearer token only; not deployed |
| Remote MCP with OAuth sign-in (Claude/ChatGPT connector for non-coders) | later | needs public URL; Claude custom connectors take URL + browser OAuth |
| Connector directory listing (Claude / ChatGPT) | later | after OAuth + deploy |
| Hosted demo (Render) + public repo | not built | kept local for now (2026-10-30); `render.yaml` ready |
| Candidate cities: hand-picked seed list (97 cities, na/eu/in) | built | `engine/data/cities.json`; locality insights 400 with artist signal, so a list is required |
| Any city on the map (GeoNames dataset, top towns by population in circle) | built | 2026-10-30; `npm run cities:seed` loads GeoNames cities15000 (~34k cities, CC BY 4.0) into Postgres `cities`/`countries`; `ensureWorld()` + `citiesNear()` (largest in circle, suburbs merged within 25 km, cap 25); regions without seeds use their 20 largest cities; story 11. City brief on a map click: not built |
| Home examples data (Q7): 150+ acts × 3 decisions, worldwide fan density, why-numbers | building | 2026-10-30; `npm run examples:prewarm` (apps/web/scripts/prewarm-examples.ts) → `home_examples` (decision, route[], tourProfit, losingNight, compare chosen-vs-skipped, per-city `why` = 60% reach + 40% lean) + `home_fan_density` (per act ≤ 25k points: country heatmaps at 0.25°/0.5°, metro heatmaps at geohash 6–7; `_world` base layer); `headlineMismatch()` rejects "skip/loses" on profitable nights; `examples:fanmap` flat-map gap check; engine CityScore + MCP `scoreParts` expose reach/lean; venue headlines are decisions ("book X (~N seats) over Y"); export play order goes continent by continent (long hops only at 5 boundaries); globe hover needs intent (rest 220 ms / switch 450 ms, no takeover while tracing). 322 complete / 130 acts; gate blocked on dancer 2/3 until fan data quota clears. UI side: globe agent (test 14) |
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
| Autonomous background research (refresh upcoming stops' notes) | later | TODO.md |
| ~2 min demo video | later | optional; raw footage recorded 2026-10-29 |

### Next to build (recommended order, 2026-10-30)
Goal: make Tourbo worth returning to for non-coders (indie singers, comics), who will mostly use the website; MCP is the second door for power users and other agents. Pick freely; update the table above when done.
1. **Projects.** One per tour or show: notes, to-dos, setlist/joke drafts, saved city briefs; plan runs and show prep attach to it. Tables `projects` + `project_items` (kind: note | todo | setlist | brief, optional city). Same data in web pages and MCP tools (`tourbo_project_create`, `tourbo_project_get`, `tourbo_project_add`, `tourbo_project_list`). Why: gives a reason to come back and makes the MCP useful across chats.
2. **Any city on the map.** Swap hand-picked seeds for an open city dataset (e.g. GeoNames `cities15000`: name, lat/lon, population, country); take the 15–25 largest towns inside the circle and score as now. Add "What does this city love?" on a map click (city brief for any city). Why: "I want to play New Delhi" works anywhere, same Qloo call count.
3. **Rehearsal panel** (inside show prep). Personas built from the city's Qloo audience react to a draft set or setlist; each reaction cites a Qloo value; labelled a rehearsal, not a prediction. Why: most memorable demo, matches Qloo's synthetic-audience direction.
4. **Backtest.** 5–10 known tours/outcomes; grounded vs LLM-only hit rate in a small table in README. Why: backs the impact claim.
5. **Non-coder MCP access** (when deployed). OAuth sign-in on remote `/mcp` so "paste URL in Claude connectors" works; then directory listing. Bearer token stays for agents.
6. **Validate with real users.** Show story 1 to 3–5 indie musicians or comics; note where they get stuck; until then, a browser walkthrough as a first-time user.

### Test suite for the new features (story tests, 2026-10-30)
Every feature in "Next to build" ships with a story in `STORIES.md` and a test in `tests/stories/` (live Qloo, no LLM unless marked `STORY_LLM=1`). Follow the existing pattern: MCP calls through `_mcp.ts`; web checks skip when the app isn't running (`appUp()`); assertions state the user-visible promise, not internals. `npm run test:stories` must stay green after each feature; run `STORY_LLM=1` before calling a feature done.

| Story / test | Feature | Pass (what the test asserts) |
| --- | --- | --- |
| 10 `10-maya-project.test.ts` (exists, not yet in `STORIES.md`) | Projects | add story 10 text to `STORIES.md`; extend the test: a plan run and a show prep attach to the project and show up in `tourbo_project_get`; a to-do toggles done; deleting an item doesn't touch others |
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

### Q1. Rotating analytics globe home page + partner logos + analytics look
- **Note (2026-10-30):** visuals/palette/fonts/motion superseded by Q7; keep only the parts Q7 does not replace (data rules, perf budgets, failure states).
- **Feature:** redo the home page around a dense, always-rotating 3D globe with glowing fan hotspots; add SVG logos for Qloo, Claude, ChatGPT and Gemini; restyle the app as a data/analytics product that makes "this is the better location" obvious.
- **Why / user ask:** "add svg logos for qloo, claude, chatgpt, gemini, redo the home page with a globe with shining locations… like analytics highlighting this is a better location… dense analytics globe so it looks attractive and it keeps rotating." Judges' first impression (Design score).
- **Pass:**
  - Home: globe fills the hero, rotates slowly on its own (pauses on hover/drag, respects `prefers-reduced-motion`), dark theme, dense glowing points over real fan cities; top cities pulse brighter with a label ("Chicago · fan score 92"). One primary action stays: "Plan my tour".
  - Data is real: points come from Qloo city scores of a demo act (pre-warmed cache / stored runs), loaded at runtime, never committed (CLAUDE.md "never commit Qloo responses"). Empty/loading/failed states look intentional (static dim globe + plain sentence).
  - "Better location" visual language reused on plan pages: ranked city list with score bars, winner highlighted, "why?" folds out the Qloo numbers; Qloo-off vs Qloo-on contrast is visible at a glance.
  - Logos row ("Fan data by Qloo · Planned by Claude · Use it from Claude, ChatGPT or Gemini via MCP"): official SVGs from each brand's press/brand kit, used per their brand guidelines (nominative "works with" use only, unmodified, no implied endorsement), stored in `apps/web/app/assets/logos/`; on `/connect` each logo links to its setup steps. Note in UI where support is partial (ChatGPT custom MCP needs developer mode; Gemini via Gemini CLI); verify each client's current MCP support before writing copy.
  - Page stays fast: globe lazy-loads client-only, first paint < 2 s, no layout shift; works on mobile (smaller globe, no hover).
- **Approach (verify against current docs for pinned versions first):** `maplibre-gl` ^6 is already a dependency and supports globe projection: use it (no new globe lib) with a dark style, `heatmap` + glowing `circle` layers, auto-rotate by advancing the center each frame/`easeTo`. Only add a lib (e.g. `cobe`) if maplibre globe can't hit the look; note the reason here.
- **Story test:** extend `7-errors.test.ts` / add `14-home-globe.test.ts` (app running): home renders the globe container and the primary action; points endpoint returns ≥ 20 cities with scores; with the points endpoint failing, the page still shows the action and a plain sentence; logos present with alt text; reduced-motion disables rotation.
- **Likely files:** `apps/web/app/routes/home.tsx`, new `apps/web/app/components/globe.tsx`, new points loader/route, `apps/web/app/assets/logos/*.svg`, `apps/web/app/routes/connect.tsx`, `city-card.tsx`, `run-tabs.tsx`, `app.css` theme tokens.
- **Status:** superseded by Q7 (2026-10-30): the globe, data rules and perf budgets live in Q7; logos only on `/connect`.

### Q2. Playful "gig poster" design tokens + app-wide polish
- **Note (2026-10-30):** visuals/palette/fonts/motion superseded by Q7; keep only the parts Q7 does not replace (data rules, perf budgets, failure states).
- **Feature:** replace the stock monochrome shadcn tokens with a bold, fun, show-business identity, and raise visual quality across every screen.
- **Why / user ask:** "the monochromatic look does not suit our application as it is a fancy application not a serious Notion-like SaaS, so improve the design tokens to something fun and improve the quality of our app." Today `apps/web/app/app.css` is shadcn neutral: every token has chroma 0 (`--primary: oklch(0.205 0 0)`, charts all `oklch(0.87 0 0)`), Geist only.
- **Direction (starting point; tune by eye, keep AA contrast):**
  - Mood: backstage + gig poster + stage lights. Dark mode is the hero (matches the Q1 globe); light mode = cream poster paper, not white.
  - Palette (oklch, approx): ink background `0.17 0.03 285` · poster cream `0.97 0.03 90` · primary hot magenta `0.65 0.25 350` · secondary marquee yellow `0.88 0.17 95` · accent electric cyan `0.80 0.14 200` · success lime `0.85 0.20 135` · destructive tomato `0.65 0.22 30`. Charts: 5 vivid, distinct-hue categorical colors, plus one sequential ramp (cool → hot) for fan scores, shared with the globe glow.
  - Type: two fonts only, no monospace (see Q3 font suite): Bricolage Grotesque for title, headings and big numbers; Geist for body. Big, confident numbers (fan score, profit).
  - Shape: larger radius (`--radius` ~0.9rem), slight card tilt/sticker shadows on hover, ticket-stub cards for tour nights (perforated edge, date block), "stamp" badges ("Best night", "Sell-out risk", "Skip").
  - Motion: small, springy micro-interactions; confetti/spotlight sweep when a plan finishes; everything off under `prefers-reduced-motion`.
- **Quality pass (every screen in `STORIES.md` story 1–2 path + projects + connect):** consistent spacing scale, no unstyled default states; each of empty / loading (skeletons, not spinners) / partial / failed / done looks designed; playful microcopy in headings and empty states ("No cities in that circle yet: widen it a little"), while errors stay one plain sentence + next step (CLAUDE.md rule); charts use the new chart tokens, not inline colors.
- **Pass:** a screenshot of home, plan, a night card, show prep and a project page reads as one colourful, fun brand; no gray-on-gray screens left; all text meets WCAG AA (4.5:1 body, 3:1 large) in both modes; Maya can still finish story 1 from the screen alone.
- **Story test:** add `15-design.test.ts`: parse the tokens in `app.css` and assert primary/secondary/accent chroma > 0.1 and AA contrast for each foreground/background pair in both modes (no LLM, no app needed). With the app running: home, plan and prep render with no console errors and no hard-coded hex colors in `app/components` (grep check). Re-run all story tests.
- **Likely files:** `apps/web/app/app.css` (`:root`, `.dark`, `@theme`), `apps/web/app/root.tsx` (fonts, default dark), `apps/web/app/components/**` (cards, badges, run tabs, progress), `apps/web/app/routes/**`, `components/ui/*` variants only where tokens can't do it. Coordinate with Q1 (same palette for the globe).
- **Status:** superseded by Q7 for palette/fonts/motion (2026-10-30); `15-design.test.ts` built (Q7 tokens, AA both modes, two fonts, no mono, no hard-coded hex).

### Q3. Landing page: live Qloo data on show + catchy lines
- **Note (2026-10-30):** visuals/palette/fonts/motion superseded by Q7; keep only the parts Q7 does not replace (data rules, perf budgets, failure states).
- **Feature:** the landing page shows real Qloo data for a demo act (on the Q1 globe and in "fact cards"), framed by short, catchy copy in the Q2 voice.
- **Why / user ask:** "the data that Qloo gives will be shown on the demo, add catchy lines on the landing page."
- **Live data on the page (all fetched at runtime from Qloo / pre-warmed cache; nothing committed; every number labelled as Qloo data):**
  - Globe: fan hotspots of a rotating demo act (Japanese Breakfast → Zakir Khan → Arijit Singh), act name + photo chip in the corner, swaps every ~10 s.
  - Ticker / fact cards built from tool output, e.g. "{act} fans lean {x}× more toward {city} than {big city}" (heatmap over-index), "{city}'s crowd for {act} also loves {brand} and {show}" (city brief), "Best room in {city}: {venue}, a {room type} near the fan hotspot" (venues), "Surprise market: {city}, ranked #{n} for {act}" (a non-top-10 city in the top 5).
  - Qloo-off vs Qloo-on mini contrast: "An AI guess: NYC, LA, Austin" vs "Qloo-backed: {top 3 real cities}".
  - If data is missing for a card, hide that card (never show placeholders or invented numbers).
- **Copy (headline + subline options; pick one set, A/B by eye):**
  - "Your fans already picked your tour. We just read the map." / "Qloo knows where they live. Claude books the nights."
  - "Play where they're waiting." / "Fan heatmaps, rooms that fit, nights that make money."
  - "Stop touring by gut. Tour by fans."
  - "Too small for a booking agent? Now you have one." / "Tourbo plans the route, the rooms and the money for acts drawing 50 to 5,000."
  - "Every dot is a fan. Every route is a profit check."
  - Section lines: "Find the cities → pick the rooms → check the money → write the set → send the emails." · "Works with your Claude, ChatGPT or Gemini." · "Every number is an estimate, and every reference is a real Qloo fact."
  - Comedy flavour (for Rohan): "Know the crowd before the crowd knows you."
  - CTA: "Plan my tour" (primary, only one) · secondary text link "Try it with a demo act".
- **Rules:** catchy, not false: no "guaranteed sell-out", no invented stats; "Qloo", "MCP server" and "Claude" named per the "Who does what" wording in `STORIES.md`; mobile-first line lengths; still one primary action.
- **Pass:** a judge landing cold understands in 5 s what Tourbo does and sees at least 3 real Qloo facts and the Qloo-off contrast; every fact card traces to a tool response (hover/"why?" shows the Qloo value); page works with Qloo down (copy stays, data cards hide, one plain line: "Live fan data is taking a nap, try again in a minute").
- **Story test:** `14-home-globe.test.ts` (extend Q1's): facts endpoint returns ≥ 3 facts, each with source tool + Qloo value; every number on the page appears in that payload (no hard-coded stats in `home.tsx`, grep for digits in copy constants); with the facts endpoint failing, headline + CTA render and data cards are hidden.
- **Likely files:** `apps/web/app/routes/home.tsx`, new `apps/web/app/components/fact-ticker.tsx`, a facts loader/route reusing MCP tools via `connectMcp` (cached), `scripts/prewarm` demo-act list.
- **Fancy title + font suite (user: "with a fancy title and a fancy font suite the design tokens"):**
  - Wordmark/hero title "TOURBO" as a marquee sign: display face in the Q2 marquee yellow with a magenta neon glow (layered `text-shadow`), slight flicker-on animation at load (off under reduced motion), headline under it in the heading face.
  - Font suite = **two fonts only, no monospace** (user: "too many fonts, also avoid mono fonts in funny apps"): `--font-heading` = Bricolage Grotesque (variable; heavy weight + tight tracking for the "TOURBO" wordmark, hero, headings and big numbers), `--font-sans` = Geist (body, forms, errors; already installed). Numbers use `font-variant-numeric: tabular-nums` in the heading/body face, not a mono font. No Bungee/Monoton/Geist Mono. Check `@fontsource-variable/bricolage-grotesque` exists and is OFL before installing; self-host, `font-display: swap`.
  - Heavy Bricolage only for the wordmark, hero and big stat numbers; never for body or errors (readability). Test: exactly two font families loaded, no monospace family in `app.css`/components, no layout shift when fonts load.
- **Depends on:** Q2 (tokens/voice), Q1 (globe). Can build the facts endpoint in parallel.
- **Status:** superseded by Q7 (2026-10-30): decisions on real examples replace the facts ticker; contrast section in Q7.

### Q4. Auth + authz: guest-first with Better Auth, ownership, limits, safe emails
- **Feature:** add authentication and authorization without a sign-up wall: every visitor is a guest owner of their own runs and projects; strangers can't read, edit or spend on someone else's behalf.
- **Why / user ask:** "Yes do it, also use better-auth or the best library for authentication and authz." Gaps today: `/projects` lists everyone's projects; no web rate limits (anyone can burn Claude/Qloo spend); real venue email sending would be open to anyone; remote `/mcp` has only a static bearer token.
- **Library: Better Auth** (TS, self-hosted on our Postgres, framework-agnostic, Express via its Node handler, plugin model). Plugins to use (verify every name/option against the docs of the version installed; 1.7 notes checked 2026-10-30):
  - `anonymous()`: guest session on first visit, no form; when the guest later signs in, link and move their runs/projects to the real account (its account-linking hook).
  - `magicLink()`: optional "Save your work" by email (send via Resend once configured; until then, log the link in dev only).
  - Later, with deploy: `@better-auth/mcp` (`mcp()` turns the app into an OAuth 2.1 authorization server for MCP clients; needs the JWT plugin; DCR off by default, pair with `cimd()` for the MCP 2026-07-28 profile; don't also register `oauthProvider()`). Our MCP SDK is v2, which 1.7 supports. This is what lets non-coders paste `/mcp` into a Claude connector.
  - Schema via `npx auth migrate` / `generate` into the existing Postgres (`DATABASE_URL`); secrets via `getWebEnv()` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), added to `.env.example`, never committed.
- **Authorization (plain code, no RBAC lib needed):**
  - `owner_user_id` on `runs` and `projects` (backfill existing rows to a "demo" owner); every loader/action and MCP project tool checks it. Helper `requireOwner(userId, resource)` in one place.
  - Plans: view by link stays public read-only (shareable, unguessable UUIDs); edit, re-run, prep, rehearse, send = owner only. `/projects` shows only the caller's projects.
  - Remote `/mcp`: keep `MCP_TOKENS` for agents now; each token maps to an owner so `tourbo_project_*` only sees that owner's projects. OAuth via `mcp()` replaces it at deploy.
- **Limits:** per-guest and per-IP caps on plan runs (e.g. 5/hour) and AI actions (prep, rehearsal, drafts); a global daily spend cap from `usage.ts`. Over the limit = one plain sentence with when to retry, never a 500.
- **Emails:** real sending only from a signed-in user with a verified email (magic link proves it) and only after the existing approve click; guests stay in sandbox/simulated mode with a clear label.
- **Pass:** a new visitor plans a tour with no form; a second browser can open the plan link read-only but can't edit, prep, send or see the first visitor's projects; hitting the run cap shows the plain message; "Save your work" by email keeps everything; story 1 still runs from the screen alone.
- **Story test:** `16-auth.test.ts` (app running): two separate cookie jars → B gets 403-style friendly page on A's project and edit actions, read-only on A's plan; B's `/projects` is empty; run cap returns the plain sentence; an MCP token for owner A can't list owner B's projects; anonymous → magic-link sign-in keeps A's projects (log-the-link mode). Extend `7-errors.test.ts` for expired session and "not yours" pages. All existing stories still pass (they run as a guest).
- **Likely files:** new `apps/web/server/auth.server.ts` (Better Auth instance) + mount in `apps/web/server/app.ts`; `apps/web/server/env.server.ts`; `packages/core/src/db/schema.server.ts` (owner columns) + Better Auth tables; `packages/core/src/projects/*`; `apps/web/server/agent/runs.server.ts`; `apps/web/server/mcp.server.ts`; routes `projects*.tsx`, `plan.$id*.tsx`; a small "Save your work" UI in the header.
- **Status:** dropped (2026-10-30): hackathon organisers rejected adding authentication; no auth in the app.

### Q5. Vendor-neutral product: Qloo and Claude work under the hood; use Tourbo from any AI
- **Feature:** the product speaks as Tourbo. Primary UI stops naming Qloo or Claude; the data still comes from Qloo and the hosted agent is still Claude. The MCP side is presented as "use Tourbo from any AI assistant", not Claude-first.
- **Why / user ask:** "in the onboarding flow we mention Qloo by name, it's not good, we should keep it hidden and let it work under the hood, same for the footer" + "also not Claude-centric, it should be usable anywhere."
- **Copy rules:** "Tourbo" is the actor ("Tourbo is planning your tour", "How Tourbo decided"); data is "fan data" / "taste data"; the user's assistant is "your AI assistant". Vendor names allowed only on `/connect` (setup needs them), in README/Devpost, and in code/test names.
- **Onboarding (`apps/web/app/routes/start.tsx`):** `:427` subtitle → "Tourbo looks you up to see where your fans are. New or not listed yet? Tell us who you sound like instead." · `:435` "Looking you up on Qloo…" → "Looking you up…" · `:444` "On Qloo" → "Found you" · `:454` "…on Qloo." → "We couldn't find “{name}” yet." · `:62`, `:196` "your own Claude" → "your own AI assistant" · `:306` "Claude does these jobs for you…" → "Tourbo does these jobs for you…".
- **Footer (`components/footer.tsx:6`):** "Powered by Qloo + Claude" → e.g. "Tourbo · tour planning for small acts"; keep links.
- **Rest of primary UI:** `plan.$id.tsx:107,173` ("Claude is planning…", "How Claude decided") → Tourbo; `agent-progress.tsx` "who" labels → neutral ("fan data", "Tourbo tools", "Tourbo") or drop the who column; `plan.$id.pipeline.tsx:107`, `plan.$id.prep.tsx:40` step labels ("Qloo city brief", "Claude drafted", "Without Qloo") → "City brief", "Drafted", "Without fan data"; `projects.tsx:43`, `projects.$id.tsx:140` → "your AI assistant"; `home.tsx:22,44,132,239` and `fact-ticker.tsx:57` → neutral (e.g. "Your fans already picked your tour. Tourbo reads the map."); this overrides the vendor wording in Q1/Q3 (logos row → "Works with any AI assistant that supports MCP": show Claude, ChatGPT, Gemini, Cursor and others as equal examples on `/connect`, not as "powered by").
- **`/connect` (`routes/connect.tsx`):** title "Use Tourbo from your AI assistant (MCP)"; lead with the generic setup (stdio command + remote URL that any MCP client takes), then equal tabs per client (Claude, ChatGPT, Gemini CLI, Cursor/VS Code, others); drop "This site's planner is Claude…" from the lead.
- **Docs to align (building session, same change):** `STORIES.md` "Who does what (say it the same way everywhere in the UI)" → becomes internal/README wording and the UI rule above; stories 1/2 text ("watches Claude work") → "watches Tourbo work". CLAUDE.md north-star line "is it clear where Qloo, the MCP server and Claude come in" needs the user's OK to change (discussion session asking).
- **Decided (user, 2026-10-30):** keep the numbers behind "why?" and the contrast, labelled neutrally ("fan data", "with fan data vs AI guess"); hosted agent stays as is, and the UI never mentions the model provider or underlying tech. CLAUDE.md north star updated (vendor-neutral UI rule); STORIES.md heading updated by the building session.
- **Pass:** home → wizard → plan → prep → projects never shows "Qloo" or "Claude" in visible text; `/connect` reads as any-assistant; story 4 (Ana) reads naturally.
- **Story test:** new `17-neutral-copy.test.ts` (app running): fetch `/`, `/start`, a plan page, prep, `/projects`; strip tags/attributes; assert no "Qloo"/"Claude" in visible text (allowlist `/connect`); `/connect` lists ≥ 4 clients. Update `8-full-run.test.ts` if it waits on "Claude" copy.
- **Status:** built (2026-10-30): copy pass across home, wizard, plan, compare, projects; `lib/neutral.ts` for planner text; `17-neutral-copy.test.ts` passes.

### Q6. Landing page: extremely fancy and well optimized (builds on Q1–Q3, Q5)
- **Note (2026-10-30):** visuals/palette/fonts/motion superseded by Q7; keep only the parts Q7 does not replace (data rules, perf budgets, failure states).
- **Feature:** take the landing page from "nice" to showpiece while keeping it fast.
- **Why / user ask:** "make the landing page extremely fancy and well optimized." It's the judges' first screen.
- **Fancy (all in the Q2 palette + two fonts, vendor-neutral copy per Q5):**
  - Hero: marquee "TOURBO" wordmark with neon flicker-on, rotating globe with glowing fan cities and animated arcs drawing a sample tour route between the top cities, live counter ticking up ("38 cities scored · 5 nights · $4,180 est. profit") from the real demo plan.
  - Scroll story (sections reveal on scroll, one idea each): "Find the cities" (globe zooms to a region, cities light up by fan score) → "Pick the rooms" (venue cards flip in) → "Check the money" (ticket-stub cards with profit bars) → "Write the set" (show-note lines type out) → "Send the emails" (pipeline chips slide Drafted → Confirmed) → "Use it from your AI assistant" (one MCP snippet). End with the single CTA again.
  - Delight details: cursor spotlight on the hero, sticker hover on cards, subtle grain/noise texture over the dark stage, stamp badge "Best night" slamming onto the top card once.
  - Mobile: same story, simplified (static globe image fallback, no cursor effects).
- **Optimized (budgets the test enforces, prod build, mid-range mobile throttling):**
  - LCP < 2.0 s, CLS < 0.05, INP < 200 ms, Lighthouse performance ≥ 90 mobile, accessibility ≥ 95.
  - SSR the hero text + CTA (React Router loader); globe and scroll animations load client-only after first paint (`lazy` + idle/visibility), MapLibre chunk not in the initial bundle; initial JS for `/` ≤ 200 KB gzip (excluding the lazy globe).
  - Animations: CSS/transform/opacity only, `IntersectionObserver` for reveals, one rAF loop for the globe, paused when off-screen or tab hidden; everything off under `prefers-reduced-motion`.
  - Fonts: the two fonts self-hosted, subset, preloaded, `font-display: swap` with metric-matched fallback (no layout shift). Images/logos as inline or optimized SVG, AVIF/WebP for any raster, explicit width/height.
  - Data: landing facts endpoint cached (server memory + `qloo_cache`), `Cache-Control` for a few minutes, responds < 200 ms warm; page renders fully without it (Q3 failure state).
  - SEO/share: title, description, Open Graph + Twitter card image (static poster render of the globe), favicon set.
- **Pass:** feels like a launch page of a fun consumer product; budgets above met on `npm run build && npm start`; no console errors; reduced-motion and no-JS both show a complete, good-looking page with the CTA.
- **Story test:** extend `14-home-globe.test.ts`: SSR HTML contains headline + CTA before any JS; initial JS size for `/` under budget (read the Vite manifest); facts endpoint responds with cache headers. Add `npm run perf:home` (Lighthouse CI or Playwright + web-vitals against the prod build) that fails when a budget is broken; run it before calling Q6 done.
- **Likely files:** `apps/web/app/routes/home.tsx`, `components/globe.tsx`, `components/fact-ticker.tsx`, new `components/landing/*` sections, `app.css`, `root.tsx` (preloads, meta), facts route, `vite.config.ts` (chunking), `package.json` script.
- **Status:** superseded by Q7 (2026-10-30); its perf budgets are the `npm run perf:home` gate.

### Q7. Redo the UI: calm editorial theme, world-wide data, 50+ relatable examples (supersedes Q1/Q3/Q6 visuals and the Q2 palette/fonts)
- **Why / user ask (2026-10-30, after seeing the Q1–Q3/Q6 build):** "don't like the font, or the globe, the globe feels empty; the demo acts (Zakir Khan, Japanese Breakfast) are very niche, use something judges relate to, like AC/DC or a less famous comedian, lots of options; the page feels extremely shiny and poorly done; redo it in a better theme; the why section is poorly done; redo the app UI, make it fancy with lots of cases across the continents and the data as well; more cities, a really lot of cities, a script to seed almost all cities in existence, and at least 50 examples on the home page that change smoothly; not too many moving parts, just slowly fading to new information."
- **Problems seen in the screenshot (fix all):** vendor/tech names still visible ("Qloo:", "Qloo heatmap cells", "fan index 450", "`tourbo_score_cities` tool on the Tourbo MCP server", "Qloo-backed", "Claude alone vs Claude with Qloo fan data") → violates Q5/CLAUDE.md; "why?" dumps raw internals instead of explaining; "best room" was a festival ("Yerba Buena Gardens Festival"), not a bookable room → filter festivals/events out of venue picks; AI guess vs fan-data lists nearly identical → pick contrast examples where they differ, or show the reason, not just names; four same-size cards = flat and template-like; neon glow + magenta = cheap shine.
- **Theme (replaces Q2 neon palette + Q3 fonts):** calm, matte, editorial: a printed tour poster / festival programme, not a neon SaaS. Warm off-white paper and deep ink as the two modes, one strong accent (e.g. tomato or cobalt) + one secondary, no glows, no gradients-on-everything, generous whitespace, strong typographic hierarchy, thin rules, real photography of the act (from the entity image) as the hero visual. Two fonts, no monospace; before building, render the home hero in 2–3 font pairings (e.g. a characterful serif display like Fraunces or Instrument Serif + a clean sans like Inter/Geist; all OFL, fontsource) as screenshots for the user to pick. Remove Bricolage.
- **Hero visual (user, 2026-10-30, replaces the flat map idea): a dotted "quarter Earth" in the style of github.com's homepage globe.** Only the upper edge of the globe shows, rising from the bottom of the hero, revolving slowly (~1 rev / 2 min). Land drawn as small dots (dot-matrix, no textures). Each scored city is a thin glowing column (a "building") standing on its dot, height = fan strength, so the world reads as a skyline: taller towers where the act is stronger. The current example's tour cities are highlighted (accent colour) and joined by thin arcs drawn once in route order; a small label card floats next to the tallest tower ("Adelaide · fan strength 91 · est. profit $3,400"). Columns grow in over ~1 s when an example fades in; nothing else moves. Hover/tap a tower → its card. No cursor effects, flicker or glow bloom.
  - Tech (verify current docs before installing): `globe.gl` / `react-globe.gl` (three.js; hex/dot land via `hexPolygonsData`, columns via `pointsData` + `pointAltitude`, arcs via `arcsData`) or plain three.js / react-three-fiber if globe.gl can't do the cropped quarter-Earth framing. Lazy-load client-only after first paint (keeps the Q6 budget: three.js stays out of the initial bundle); pause when off-screen/tab hidden; reduced-motion = static frame; mobile = lighter dot density, no hover.
- **Decided after review (user, 2026-10-30):**
  - Fonts: **B, Instrument Serif (headings, wordmark, big numbers) + Geist (body)**; remove Bricolage/Fraunces/DM.
  - Globe still (`/tmp/tourbo-globe-still.png`) approved with fixes: towers stand upright (camera higher and further out, columns along the surface normal, thinner); max 5 route arcs, no stacked arcs; the label card is offset with a leader line and never covers towers; the headline is a decision, not "where fans are"; continents rotate with the examples (one US-only example is not the page).
  - **Fewer dots, aggregate by district and density** (user: "there are too many dots, do it by district and then density"): land = sparse dots (low hex resolution, about 1/3 of the mock's density, low contrast); fan data = **hex-bin districts**: aggregate the heatmap's geohash cells into hex bins (globe.gl `hexBinPointsData`, weight = affinity × popularity, `hexBinResolution` ~3–4 at world view; or H3 server-side), one column per district, height = summed fan density, colour ramp by density. Result: a few dozen meaningful "buildings" per example, not hundreds of thin sticks or neon blobs. Tour cities get the accent colour plus the arcs.
  - **Fallback if hex-bin districts don't look great (user, 2026-10-30): smooth "wave" density surface, no dots.** Drop the dotted land; render a plain, matte globe (ink land on paper ocean, or the reverse) that auto-revolves, with fan density drawn as a smooth, continuous raised surface: nearby districts/cities blend into soft hills and ridges ("wishy-washy waves"), height + colour = density. Use globe.gl's `heatmapsData` layer (Gaussian KDE rendered as an elevated surface: tune `heatmapBandwidth`, `heatmapBaseAltitude`/`heatmapTopAltitude`, `heatmapColorSaturation`; verify option names in the installed version's docs) fed with the same weighted points (affinity × popularity). Tour cities sit on top as small accent markers with arcs. Pick hex-bin vs wave by rendering both for the same example and letting the user choose from two stills.
  - **Data across every country (globe must look full worldwide, not one region lit):** per example act, collect fan points world-wide, cheapest first: (1) probe one heatmap with no location filter → if it returns global cells, use it (1 call per act); (2) else one heatmap per continent; (3) else one per country (~200 calls per act; prewarm offline through `qlooGet()` with the cache, concurrency 8, ~10 min for 20 acts). Store the aggregated, coarse points (district/hex level, not raw responses) in Postgres `home_examples`, never in git. Record what the probe found in §9 "Probe decisions".
  - **Globe vision (final, user picked "waves with fixes", 2026-10-30): build to this.**
    - **The story on screen:** one decision headline at a time, in the style the user liked: "AC/DC from Sydney: skip Perth, play Adelaide." Under it, 2–3 facts (est. profit of the tour, the night that loses money, one local-taste line). The globe turns to that act's region, its fan waves rise, the route draws, the skipped city greys out. After ~8 s everything fades to the next example.
    - **50–60 examples** across all continents and feature types (route + money, counter-offer, show prep line, rehearsal reaction, ticket pace, venue fit), shuffled per visit. Waves from examples already shown stay on the globe at low opacity, so the world fills up over time; the current example is at full strength.
    - **Coverage gaps are ours, not Qloo's (probe 2026-10-30, AC/DC, per-country heatmap cell counts):** US 6521 · Brazil 2919 · Canada 1249 · Russia 1124 · Australia 1018 · China 410 · South Africa 251 · UAE 168 · Nigeria 58 · Saudi Arabia 46 (Toronto alone 597, Calgary 128). Qloo returns data across Canada, South America, Russia and China; Africa and the Gulf are genuinely thinner. The empty areas on the globe come from `apps/web/scripts/prewarm-examples.ts` `fanPoints()`:
      1. weights normalised by the single global max, then `sqrt` → the US dominates and most other countries fall under the `> 0.02` filter;
      2. `.slice(0, 800)` keeps only the top 800 points world-wide (the US eats the budget);
      3. only `FAN_COUNTRIES = 60` countries (by number of seeded cities), so many countries are never asked;
      4. 1° grid rounding merges and drops detail.
      **Fix:** query every country (≈ 200 calls per act, cached; it's a one-off prewarm); aggregate to a 0.5° grid; normalise per country (or per continent) **and** keep a log-scaled global weight, blending them (e.g. 0.5/0.5) so every country with fans shows shape while big markets still read bigger; drop the hard 0.02 filter (fade very low values in the shader instead); no global top-N cap: cap per country (e.g. ≤ 150 points) so the budget is spread; store a per-country `coverage` (cell count) and visually mark truly thin countries (lighter, no fake waves). Check the result by rendering the full world flat (equirectangular) once and eyeballing gaps before the globe build.
    - **Example acts: as much real data as possible, every discipline we support (user, 2026-10-30).** Pull every useful signal per example through the MCP tools (heatmap points world-wide, city scores, venues, openers, city brief, economics, offer/counter, rehearsal slices, ticket pace) so each card has real numbers, not filler. Mix (resolve each in Qloo first; drop or swap any that don't resolve or have thin data, and record it):
      - Musicians: AC/DC (from Sydney), Muse (UK), Taylor Swift (US), Coldplay, Arctic Monkeys, Bad Bunny (San Juan), Shakira, BTS / BLACKPINK (Seoul), Burna Boy (Lagos), A.R. Rahman (Chennai), Tame Impala (Perth), Daft Punk / Stromae (Europe), Natalia Lafourcade (Mexico City).
      - Comedians: Jimmy Carr (London), Nate Bargatze, Taylor Tomlinson, Trevor Noah (Johannesburg), Ronny Chieng (Kuala Lumpur), Vir Das (Mumbai), Gad Elmaleh (Paris), Ali Wong.
      - DJs / electronic: David Guetta, Peggy Gou, Black Coffee.
      - Visual artists / exhibitions: Banksy, Yayoi Kusama, KAWS.
      - Authors (book tours): Haruki Murakami, Chimamanda Ngozi Adichie, Brandon Sanderson.
      - Podcasts (live shows): SmartLess, My Favorite Murder, The Rest Is History.
      - Poets / spoken word and dance: Rupi Kaur; a touring dance company that resolves (verify).
      - Target ≥ 50 examples total, ≥ 6 per continent, ≥ 3 per discipline; cards say what kind of act it is ("Book tour", "Exhibition", "Comedy run").
    - **More acts to fill the whole globe (user, 2026-10-30: "add at least 50 acts… acts across the globe").** Current seeds: 75 acts in 31 countries (US 15, GB 8, AU 6, IN 5, JP 4…); nothing in the Gulf/Middle East (except IL, EG), China, Russia, Central Asia, SE Asia (except TH, MY), Pakistan/Bangladesh, most of Africa and South America. Add ≥ 50 more (target ≥ 125 seeds, ≥ 60 countries), each from its home city, mixed disciplines; resolve in Qloo first, drop/swap thin ones and log them:
      - Middle East / Gulf / Turkey: Hussain Al Jassmi (Dubai), Mohammed Abdu (Riyadh), Nancy Ajram (Beirut), Fairuz (Beirut), Amr Diab (Cairo, if not already), Tarkan (Istanbul), Cem Yılmaz – comedian (Istanbul), Googoosh (Tehran).
      - Central Asia / Mongolia / Caucasus: Dimash Kudaibergen (Almaty), The HU (Ulaanbaatar).
      - China / Hong Kong: G.E.M. (Hong Kong), Faye Wong (Beijing), Joker Xue (Shanghai), Ai Weiwei – visual artist (Beijing).
      - Russia / Eastern Europe: Little Big (St Petersburg), Zemfira (Moscow), Okean Elzy (Kyiv), Dawid Podsiadło (Warsaw), Go_A or a Balkan act (verify).
      - SE Asia: NIKI or Rich Brian (Jakarta), Ben&Ben (Manila), Jo Koy – comedian (Manila), Sơn Tùng M-TP (Ho Chi Minh City), Yuna (Kuala Lumpur, if KL not already).
      - South Asia: Atif Aslam (Lahore), Ali Sethi (Lahore), Habib Wahid (Dhaka), Yohani (Colombo), Zakir Khan stays out of the hero unless asked.
      - Africa: Youssou N'Dour (Dakar), Diamond Platnumz (Dar es Salaam), Teddy Afro (Addis Ababa), Saad Lamjarred (Casablanca), Tyla (Johannesburg), Sauti Sol (Nairobi), Angélique Kidjo (Cotonou), Fally Ipupa (Kinshasa), Basketmouth – comedian (Lagos).
      - South America: Anitta (Rio de Janeiro), Ivete Sangalo (Salvador), Bizarrap (Buenos Aires), Karol G (Medellín), Mon Laferte (Santiago), Gian Marco (Lima), Paulo Coelho – author (Rio).
      - Canada: Drake (Toronto), Celine Dion (Montreal), Arcade Fire (Montreal), Russell Peters – comedian (Toronto), Cirque du Soleil – dance/circus (Montreal) (skip any already seeded).
      - Europe gaps: Måneskin (Rome), Stromae (Brussels), Rammstein (Berlin), Hardwell – DJ (Amsterdam), Mariza (Lisbon), Björk (Reykjavík, if IS slot free).
      - Oceania extra: Six60 (Auckland), Hilltop Hoods (Adelaide).
    - **Acceptance:** after the fanPoints fix, the flat-map check (`examples:fanmap`, all examples overlaid) shows signal on every inhabited continent incl. Canada, Brazil/Argentina, West/East/South Africa, the Gulf, Russia, China, Central and SE Asia; thin-coverage countries are visibly lighter, not empty.
    - **"Why here, not there?" in every card and popover (user, 2026-10-30).** Each example and each city popover explains the choice against the obvious alternative, in plain words with the numbers behind it, e.g. "Gold Coast over Perth: 1.8× more fans per head, the crowd leans to AC/DC more than any other Australian city, a 1,200-seat room fits the draw, and it's a 1-hour drive instead of a 4-hour flight. Perth on a Tuesday loses ~A$1,200." Ingredients (all from stored example data, never invented): fan strength vs the alternative, how much the city leans to this act (over-index), room fit (capacity vs expected tickets), est. profit or loss for that night, travel cost/time from the previous stop, one local-taste fact (what these fans also love). Layout: one-line answer first, then a compact comparison (two columns: chosen vs skipped, 3–5 rows with small fan-ramp bars), source line "Fan data · checked {date}". Same component in the home popovers, plan night cards and "why?" (one `WhyCompare` component). Prewarm must store the alternative city's numbers too.
    - **No repeats in a session; much more breadth (user saw Bad Bunny twice in one visit).** Cause right now: only 18 examples stored (prewarm still running). Rules: a shuffle bag without replacement, persisted in `sessionStorage`, so nothing repeats until every example has been shown; the same act never appears twice within any 20 consecutive examples, and the same continent never three times in a row. Breadth target: ≥ 125 acts (see "More acts…") **and** 2–3 examples per act covering different features (route, offer/counter, prep line, rehearsal, pace, venue fit, "why here not there"), so ≥ 300 distinct examples. If fewer than 60 are stored, the home page still never repeats within a visit (stop at the end and show "See more with your own act →" instead of looping).
    - **Polish round 2 (user, 2026-10-30: "better than before, but a lot can be improved").** Reference bar: the github.com homepage globe and stripe.com's globe, i.e. crisp lines, smooth motion and no visual noise.
      - **Zoom:** the globe must zoom. Pinch on touch; on desktop, ctrl/⌘ + wheel or wheel after the user clicks the globe (plain wheel keeps scrolling the page); +/− buttons and a "reset view" button, bottom right. Limits: from the quarter-Earth framing up to about city level (~300 km across); auto-rotate pauses while zoomed and resumes 5 s after reset. Detail increases with zoom (finer waves, city labels appear).
      - **Route arcs:** great-circle arcs whose height scales with distance (short hops low, long hops higher, never spiking); 2–2.5 px ink lines with a thin paper-coloured halo so they read over the waves; round caps; draw once in route order with a stroke-dash animation (~400 ms per leg, eased), small numbered stop markers (1, 2, 3…) with a white ring; no overlapping duplicate arcs; the skipped city gets a dotted grey stub, not an arc.
      - **Towers ("buildings"):** instanced, slim, rounded-top cylinders standing on the surface normal; height ∝ fan strength (clamped, ≤ 6% radius); colour along the fan ramp from base (gold) to tip (brick), soft contact shadow / base ring on the ground; rise with the wave fill; only for the current example's tour cities (5–8), each with its stop number.
      - **Fill animation:** when an example arrives, its fan surface grows from flat to full height over ~1.2 s with ease-out, rippling outward from the home city (stagger by distance), and the colour saturates as it rises; the previous example sinks to the faint "history" level over ~0.8 s in parallel. No popping, no sudden mesh swaps (morph or crossfade).
      - **Darkening / lighting:** soft directional light plus gentle ambient so the waves have relief; a subtle vignette at the globe's edge and a soft atmosphere rim; out-of-focus regions dim smoothly (focus falloff), never as a hard edge; optional faint day/night terminator only if it doesn't muddy the colours. Ocean stays the petrol teal; no pure black anywhere.
      - **Visual QA loop:** for each change, capture the same 3 stills (Oceania, West Africa, Europe), a 10 s recording and a zoomed-in still, and compare them with the previous round before reporting; fix aliasing (MSAA/FXAA), z-fighting between waves and land, and line jitter.
    - **Denser data in the US, Canada and everywhere (user, 2026-10-30: "information is very thin and very spread, so the animation is just moving around the globe").** Measured (AC/DC, `home_fan_density`): Qloo gave US 6521 / Canada 1249 / Australia 1018 cells, but we keep only US 1009 / Canada 51 / Australia 151 points; only 5 acts' density stored so far (run in progress). Causes: the 150-points-per-country cap (crushes Canada and even AC/DC's home country) and the 0.5° grid. Fix:
      - Per-country budget scales with Qloo's cell count (e.g. keep ~60% of cells, min 100, no flat 150 cap), total ≤ ~25k points per act; LOD in the client, not by dropping data at prewarm.
      - Finer grid where data is rich: 0.25° for countries with > 500 cells, 0.5° elsewhere.
      - City-level detail: extra heatmaps (geohash 6–7) for the ~40 biggest metros in the act's top 5 fan countries (US/Canada always included for Western acts), merged in at full resolution, so cities show neighbourhood shape when zoomed.
      - More North American breadth: ≥ 30 acts with a US/Canada home city across disciplines (add e.g. Chris Stapleton – Nashville, Kendrick Lamar – LA, Olivia Rodrigo – LA, Zach Bryan – Tulsa, Noah Kahan – Vermont, Hozier tours, Nate Bargatze – Nashville, John Mulaney – Chicago, Hasan Minhaj – NYC, Shane Gillis – Philadelphia, The Weeknd – Toronto, Shania Twain – Ontario, Tegan and Sara – Calgary, Simu Liu–style author/podcast picks: SmartLess – LA, Brené Brown – Houston, Banksy-style street art in NYC), and more examples per act in North America (2–3 features each).
    - **Less "flying around": stay in a region.** Order the shuffle bag in regional runs: show 3–5 examples in one region (nearest unshown first) before travelling, cap a travel leg at ~1.5 s, prefer the next region along the rotation direction, and keep the no-repeat rules. Dense regions (North America, Europe, South/East Asia) get proportionally more examples than sparse ones.
    - **The globe is never empty (user, 2026-10-30: "without the data, our globe looks empty; we want to avoid this").** Three always-on layers under the current example, so every frame has content even before or between examples:
      1. **Base "world of fans" layer:** the union of all acts' fan density (`home_fan_density`, summed and normalised once at prewarm into one stored world layer, a few k points), drawn as a faint, low wave everywhere there are fans. Present from the first frame.
      2. **City lights:** all seeded cities (`cities`, ~34k) as tiny soft dots sized by population, low contrast, so land never looks blank even where Qloo is thin (real geography, not invented fan data; labelled "cities" in the legend, never as fans).
      3. **History:** examples already shown stay at low opacity (as specified above).
      - Load order: layer 1 + 2 ship with the first globe payload (small, cached, served with long `Cache-Control`, embedded as a static asset built from the DB at deploy/prewarm), then examples stream in; a skeleton never shows an empty sphere.
      - Fallback chain if data is missing: no examples → layers 1 + 2 with a calm line "Live examples are warming up"; no fan layer either → city lights only; WebGL fails → a pre-rendered still of the full globe (built by the prewarm script from the same data).
      - Test: with `home_examples` empty, `/` still renders a globe with ≥ 1,000 visible points and no "empty" frame; with the fan layer missing, city lights still show.
    - **Landing page = static data only (user, 2026-10-30: "don't make it dynamic Qloo fetching; for the landing page use static data only").** The home page never calls Qloo or the agent at request time, and doesn't need the DB to render.
      - `npm run examples:export` (after the prewarm) writes one versioned static bundle: `home-examples.v{n}.json` (examples, compare, route, profits) + `world-layer.v{n}.bin/json` (world fan layer, city lights, per-act density at landing LOD) + the fallback still. Gzip/brotli, content-hashed filenames, served from `/static/landing/` with `Cache-Control: public, max-age=31536000, immutable`; a tiny manifest points to the current version.
      - Output goes to a git-ignored folder (`apps/web/public/landing/` in `.gitignore`), never committed (CLAUDE.md: never commit Qloo responses); it's generated locally/at deploy and baked into the Docker image or uploaded at deploy. README explains how to regenerate.
      - The home loader reads the manifest only; the globe fetches the bundle client-side, lazily, split by region so the first view loads only its region + the world layer (≤ ~300 KB compressed first fetch).
      - "Try it with your act" and "Plan my tour" are where live Qloo calls start, never on the landing view itself.
      - Test 14: with Qloo key unset and Postgres stopped, `/` renders fully with the globe and examples from the static bundle; no request to Qloo or `/api/*` data routes happens while on the landing page (assert via request log).
    - **One persistent info panel, never re-created (user, 2026-10-30).** The headline card, the marker popover and its expanded detail (and the mobile bottom sheet) are **one element** mounted once for the page's lifetime. Changing the example, hovering another marker or expanding to full detail only updates its content and animates its size/position: content crossfades (~250 ms) while the container smoothly resizes (measure the new content, animate width/height with FLIP / `transform` + a height transition, or the View Transitions API where supported); position eases to the new anchor. Only one piece of information is shown at a time. No unmount/remount per example, no stacking multiple popovers, no flash or layout jump; `key` must not change per example; focus stays in the panel when it updates; screen readers get a polite live-region update instead of a new dialog. Same rule for the "why?" comparison inside it. Test 14: switching examples 5 times keeps the same DOM node (assert identity) and never has more than one panel in the DOM. Only the panel's **size** changes with the amount of information (compact for hover, larger when expanded for more detail); measure the new content once per change (`ResizeObserver` on the inner content, not on every frame), animate with `transform`/`opacity` + one height transition, and re-render only the panel (content memoised; globe and page don't re-render on hover).
      - **Hover, optimised:** pointer moves never touch React state per event: one rAF-batched pointer handler on the canvas; marker hit-testing via a spatial index (grid/k-d tree in screen space, rebuilt only when the camera moves) or GPU colour picking, not a full three.js raycast over all objects; hover-in delay ~80 ms and hover-out ~150 ms to avoid flicker; the hover state is one ref + one CSS class swap on the single panel; markers drawn as one instanced layer (hover highlight = a uniform/instance attribute change, no new meshes). **Area hover, not pixel-perfect (user, 2026-10-30: "don't just activate it on a point; have an area where it starts to check that event… right now we have to take our cursor to that exact point, which is messy"):** each example owns a hover zone, not just its marker: (1) its fan area (the region its wave covers, as a simplified screen-space hull) and (2) a generous radius around its marker (~48 px desktop, ~64 px touch), whichever is larger; when zones overlap, the nearest marker wins (screen-space nearest-neighbour from the spatial index, effectively a Voronoi split), with switching hysteresis: change to another example only when it's ≥ 25% closer than the current one, so the panel doesn't hop between neighbours. Optional subtle "magnet": the marker under the zone gets a soft highlight ring before the panel opens, so users see what they're about to open. Zones recomputed only when the camera moves (same index). Test 14: hovering 40 px away from a marker opens its panel; moving between two close markers doesn't flip back and forth. Budget: hover handling < 1 ms per frame, no dropped frames while sweeping the cursor across the globe (check with the Performance panel).
    - **Both panels always open, fixed in place, only content changes (user, 2026-10-30: "combined with the rotation bits, everything is too much on the UI thread; keep both opened at all times and just change the content"). Supersedes the floating/gliding/sticky-open parts below; the separate-slices, versioning and rate-limit rules still apply.**
      - Layout: story card docked top-left, inspect panel docked bottom-right (desktop) or as a fixed bottom strip (mobile), both always visible, fixed size per breakpoint (compact height; "More" expands within a reserved max height, no reflow of the page). No following markers, no springs, no per-frame positioning on the main thread.
      - Default content: when nothing is hovered, the inspect panel shows the story example's details ("why here, not there", route, profit); hovering/tapping a marker swaps it to that example; leaving shows the story's details again after ~400 ms. A thin leader line from the hovered marker to the panel is drawn inside the WebGL scene (or skipped), not as DOM.
      - Content swap = cheap: fixed DOM structure per panel (same elements, only text/number/bar values change); update via memoised components or direct ref writes; crossfade by toggling an opacity class on an inner wrapper (compositor-only); bars animate with `transform: scaleX`. No mount/unmount, no measuring per swap (fixed sizes).
      - Main-thread budget: move the globe off the UI thread where supported: render three.js into an `OffscreenCanvas` in a Web Worker (rotation, waves, towers, arcs, hit-testing/spatial index all in the worker); the main thread only forwards pointer events and receives `{hoveredId}` messages (throttled to rAF). Fallback when OffscreenCanvas/worker WebGL isn't available: same code on the main thread at reduced detail. Verify the browser support matrix and the three.js/globe.gl worker story in current docs first; if globe.gl can't run in a worker, use plain three.js for the worker path.
      - Budgets (Performance panel, mid-range laptop, 4× CPU throttle): main-thread long tasks = 0 during rotation and hover sweeps; main-thread time per frame < 4 ms; globe 60 fps desktop / 30 fps throttled; panel swap < 2 ms scripting.
      - Tests: both panels present from first paint and never removed; their DOM nodes and sizes stay constant across 20 swaps; sweeping 8 markers in 1 s produces no long task (PerformanceObserver `longtask` = 0) and no empty frame.
    - **Contours dropped (user, 2026-10-30: "they provide no value").** The terrain keeps the 3D mountains with hypsometric tint (height = colour, sand → gold → amber → tomato → brick) and hillshade; the isoline shader, its uniforms, the every-5th line and the level-by-level build-up are removed. The build-up is just the height rising over ~1.2 s. The contour notes below are history.
    - **Contours instead of towers and shaded waves (user, 2026-10-30: "instead of these bars and the darker and lighter shade in the map, how about contours… a continuous figure… higher areas… between the locations in a particular tour, the locations could have those contours; render it cleanly").** Supersedes the towers ("buildings") and the colour-shaded wave surface; markers, arcs, pop-ups, dialogs and all performance rules stay.
      - Look: topographic **isolines of fan density**, like a hiking map: thin, continuous, smooth contour lines; peaks (closed rings tightening) at the strongest cities, lines flowing continuously between the tour's cities so the tour region reads as one landscape. Every 5th line slightly thicker ("index contour"); optional very faint fill between levels (≤ 8% opacity) for depth. Where there is no data, nothing is drawn (blank land is fine). Lines in ink on sand land, the current example's region in the accent colour; history examples' contours stay faint grey.
      - Rendering (cheap and clean): per region, a smooth density field (KDE / Gaussian-blurred grid of the act's fan points) baked at export into a small float or 16-bit texture (equirectangular tile per region + a low-res world tile); the globe's fragment shader draws isolines from it with `fract(density * levels)` and `fwidth`-based anti-aliasing (constant pixel width at any zoom, no geometry). One draw call, no per-frame CPU work, zoom-independent crispness, levels and colours as uniforms (focus falloff, fade-in by animating a "max level" uniform so contours grow upward from the base when an example arrives).
      - Fallback if shader isolines look wrong at extreme zoom: precomputed marching-squares polylines (simplified, per level) as instanced line strips.
      - Tour emphasis: the field is shaped so tour cities are peaks and the corridor between consecutive stops is continuous (small bridge weight along each route leg), so contours visibly connect the tour; skipped city = a lower, grey-ringed peak.
      - **3D "mountains" with contours (user, 2026-10-30, reference: UrbanFootprint "Map insights that pop: 3D data mapping": extruded data with a "build up" animation that makes cliffs and peaks readable; user: "sort of like this but with mountains").** The fan-density field becomes real relief: the region's surface is displaced upward by density (smooth terrain, not blocks or bars), the contour lines are drawn on that terrain, and soft hillshading (directional light from the north-west + ambient, shading from the field's gradient in the shader) makes slopes and peaks read. Tour cities sit on peaks; the corridor between stops is a continuous ridge; the skipped city is a lower peak with a grey ring.
        - Name and colouring (user: "taller at darker area, shorter at lighter area"): this is a **data heightmap / 3D density surface with hypsometric tinting**: height and colour encode the same value, so the darker the colour, the taller the terrain. Tint by height along the fan ramp (sand at the base → gold → amber → tomato → deep brick at the peaks), contours on top in a slightly darker shade of the local tint, hillshade for depth. Low-fan areas stay flat and pale.
        - Camera: when an example is focused, the camera tilts (~45–55° pitch) and zooms in on the region so the mountains are seen in 3D; between examples it eases back up to the globe view (one critically damped move per advance, no going back on hover). Zoomed-out globe = low relief (heights scaled down), focused = full relief.
        - Build-up animation (as in the reference): on arrival the terrain rises from flat to full height over ~1.2 s (animate a height uniform with ease-out), contours appear level by level as it rises; leaving example sinks back to the faint history level.
        - Rendering: one displaced mesh per focused region (a regular grid patch on the sphere, ~256×256 vertices, displacement + normals from the baked density texture in the vertex shader), contours + hillshade in the fragment shader; outside the focus only flat faint contours on the base globe. Still ≤ 10 draw calls; tier down by lowering patch resolution.
        - Labels and arcs ride on top of the terrain (sample the height at their position so nothing clips into a mountain).
      - Before building fully: render one still (AC/DC, Australia) and one (Burna Boy, West Africa) for the user to approve.
    - **Dialog model, final (user, 2026-10-30, after research): main dialog + 1–2 in-globe pop-ups; hover a pop-up → main dialog shows its full details.** Supersedes the separate docked "inspect panel" from the bullets below; their single-writer, versioning, rate-limit and stability rules still apply.
      - **Main dialog** (docked, top-left; mobile: fixed strip): one persistent element. Shows the story example by default; while a pop-up/marker is hovered (or tapped), it shows that location's full details (headline, facts, WhyCompare, route/profit); ~1 s after leaving it returns to the story. Only its content and size change.
      - **In-globe pop-ups: 1–2 at a time**, drawn **inside the WebGL scene** (SDF/MSDF text or pre-rasterised label sprites on billboarded quads, one instanced batch), anchored to locations: the current example's top city + at most one "surprise"/nearby city. Tiny content ("Gold Coast · fan strength 91"). Correctly hidden behind the globe by the depth buffer, fade near the horizon (normal·view falloff), never under the pointer's zone, never DOM, so no layout work and no flicker. They change only with the story (fade out/in, never jump); collisions resolved by priority (lower one hidden).
      - Hover/tap target = the pop-up's label quad + its marker zone (area hover rules apply). Hovering pauses rotation and story advance (single-writer rule).
    - **Performance plan from research (applied, 2026-10-30).** Sources: GitHub globe (quality tiers, instanced dots, raycast every N frames, antialias off + halo, SVG placeholder crossfade), Stripe globe (60 fps target with static-image fallback, antialias off, animations paused while scrolling), Shopify BFCM 2023 (tens of thousands of arcs in one draw call with Bezier in the vertex shader, instanced points, simple vertex-based globe shader, camera `up` recomputed per frame to avoid flips).
      - Automatic quality tiers: if < 55 fps over the last 50 frames, step down (DPR 2 → 1.5 → 1, wave resolution, history opacity layers, hit-test frequency, density LOD); step up again only after a stable period; mobile starts one tier down.
      - Single batches: land, waves (merged mesh), towers (instanced), arcs (one instanced draw, curve in the vertex shader, reveal by a time uniform), markers + pop-up labels (instanced quads). Target ≤ ~10 draw calls.
      - Antialias off on the WebGL renderer; hide the rim aliasing with the atmosphere/halo shader; MSAA/FXAA only on the top tier if it holds 60 fps.
      - Hit-testing: screen-space spatial index, queried at most every 2–3 frames (rebuilt on camera move), not per-event raycasts.
      - Pause rotation and animations while the page scrolls (resume ~150 ms after scroll stops); pause off-screen/hidden tab (already).
      - Camera travel: recompute the camera `up` vector every frame during travel to avoid the flip near the poles/antipodes.
      - Placeholder: static image of the globe shown instantly, crossfaded to WebGL on the first rendered frame (Web Animations API, no DOM changes during the fade).
      - OffscreenCanvas worker becomes **optional**: build and measure the main-thread version with tiers first; add the worker only if long tasks remain, keeping a main-thread fallback (Safari WebGL-in-worker support is limited; `@react-three/offscreen` is experimental). Verify current support before choosing.
    - **Optimisation gate before Q7 is "done" (user, 2026-10-30: "optimize everything extremely well").** Measure, don't guess: profile the prod build (`npm run build && npm start`) on a mid-range laptop and with Chrome 4× CPU / mid-tier mobile throttling, and record results in PLAN §9-style notes. All must hold together (rotation + story advance + hover sweep + zoom):
      - Frames: 60 fps desktop / ≥ 30 fps throttled; 0 long tasks (> 50 ms); main-thread scripting < 4 ms/frame; GPU frame < 8 ms desktop.
      - Draw calls ≤ 10; triangles and points within the tier budget; no per-frame allocations (reuse vectors/matrices; heap flat over 10 min, no GC sawtooth spikes > 2 ms).
      - React: only the main dialog commits on a content change (Profiler); no context re-renders; globe component never re-renders after mount (imperative updates).
      - Network: first landing fetch ≤ 300 KB compressed; globe chunk lazy; region bundles prefetched in idle time; everything immutable-cached; 0 requests on hover.
      - Load: LCP < 2.0 s, CLS = 0, INP < 200 ms, TTI not blocked by WebGL init (init after first paint / in idle).
      - Memory: GPU buffers/textures disposed on route change; no growth after cycling all examples.
      - Add these as automated checks in `perf:home` (Playwright + PerformanceObserver + `renderer.info`), fail the run on regression, and attach a short profile summary to the status message.
    - **Panel vs pointer, and no "go there and come back" (user, 2026-10-30: "when the popover is crossing our pointer, it breaks the flow"; "it reaches the location and then goes back, it looks tacky").**
      - Panels never sit under the pointer's working area: the docked panels' rects are excluded from globe hover zones and the globe is framed so no marker can be drawn under a panel (camera target offset so the focus region sits in the free area). If the pointer moves from the globe onto the inspect panel, that is `PANEL over=true` (keep the current example), never a hover-leave → re-hover loop. Panels never move toward or away from the pointer.
      - The camera never moves for hover/inspect: hovering only highlights (ring, route preview); the globe keeps its current view. The camera moves only on story `ADVANCE`, travels once to the new region with a critically damped ease (no overshoot, no bounce), and stays; auto-rotation then continues forward from that exact orientation (no snapping back to a previous longitude, no reverse rotation). Drag release coasts forward and settles; rotation never reverses direction on its own.
      - Test: hover a marker for 3 s then leave → camera orientation identical before/after (± 0.1°); after an advance, longitude only increases (monotonic) across 10 s; moving the pointer from a marker onto the inspect panel never toggles inspect off/on.
    - **Only one panel changes at a time + cards refactor (user, 2026-10-30: "when hovering tours, pause the change in the other one as well so only one is changed at a time; maybe a huge refactor and optimization is in cards").**
      - Single-writer rule: at any moment only one panel's content may be changing. While the inspect panel is active (hover/tap/focus, plus its ~400 ms leave grace), the story card is frozen: no `ADVANCE`, no content or highlight change, no dim/undim animation mid-swap. When the inspect panel is idle, only the story card changes. If both want to change in the same window, the reducer queues the second change until the first transition ends (one transition token; the latest pending target wins, older ones dropped).
      - Globe highlights follow the same rule: route/towers switch for whichever panel currently "owns" the change; never two route animations at once.
      - **Cards refactor:** one `ExampleCard` component with two variants (`story`, `inspect`), same fixed DOM skeleton (eyebrow, headline, 2–3 facts, WhyCompare bars, "More" area), driven by a precomputed, immutable `ExampleView` (built once per example when the bundle loads, in a worker or idle callback: formatted money, bar widths, labels, why-lines), so a swap is a single prop change with no formatting or data shaping at swap time. Strict memoisation (`React.memo` with id + version), no context that re-renders both cards, no inline objects/handlers recreated per render. Remove the old info-panel/inspect-panel duplication and any per-card effects/timers (timers live only in the playback slice).
      - Budget per swap: < 2 ms scripting, 0 layout (fixed sizes), compositor-only crossfade. Test: during a hover sweep the story card's content and DOM never change; an advance requested mid-hover runs only after the inspect panel goes idle; React Profiler shows only one card committing per swap.
    - **Two panels with separate jobs, no race (user, 2026-10-30: "there is a race condition between the main dialog and hover dialog, make it clean and separate so they don't break each other's behaviour").** Amends "One persistent info panel": one persistent element **per role**, two roles:
      - **Story card** (docked, top-left): shows the auto-advancing example. Only the playback timer changes it. It never moves, never follows markers, never opens on hover.
      - **Inspect panel** (floating near the hovered/tapped marker, bottom sheet on mobile): shows exactly the one example under the pointer/finger, compact → expanded. Only hover/tap/keyboard change it. It never changes because the story advanced.
      - **One state store, explicit ownership:** a single reducer (`globe-model.ts`) holds `{ story: {exampleId, version}, inspect: {exampleId | null, mode: compact|expanded, version}, playback }`; each panel subscribes only to its slice (selectors), so a story change never re-renders the inspect panel and vice versa. Transitions are events (`ADVANCE`, `HOVER_ENTER(id)`, `HOVER_LEAVE`, `EXPAND`, `CLOSE`, `TAB_HIDDEN`…), processed in order; no component sets the other's state.
      - **Race-proofing:** every async step (enter/leave delays, crossfades, glide, data load) carries the slice's `version`; callbacks with a stale version are dropped (generation tokens / `AbortController`), so a late hover-out can't close a newly opened panel and an advance firing mid-hover can't swap inspect content. One timer owner (playback) for auto-advance; hover delays live in the inspect slice only. Animations cancel and restart from the current visual state (no snap-back).
      - **Interplay rules:** inspect open → playback paused (story card dims slightly, content frozen); inspect closed → playback resumes after 3 s from the remaining time; if the inspected example is the story example, both show it, but each from its own slice. Story highlights on the globe (route, towers) follow the story; the inspected example gets only a highlight ring + its own route preview, which clears on close.
      - **Leaving hover must be calm, also in quick succession (user, 2026-10-30: "as soon as we leave the hover it has to render the other popover and it's not smooth at all if we do multiple tours in quick succession").**
        - Inspect mode is sticky: leaving a marker zone doesn't close the inspect panel at once. It waits ~400 ms; entering another zone within that window **morphs the same panel** to the new example (content crossfade + resize + glide), never close → reopen.
        - The story card never re-renders on hover changes: it stays mounted with its content; inspect open/close only animates its opacity/dim (CSS class), so leaving hover shows it instantly with zero render work. Its content changes only on `ADVANCE`.
        - Restore to story only when the pointer has left the globe area (or all zones) **and** ~1.2 s idle has passed; then playback resumes (3 s rule).
        - Sweeping fast across many markers: content swaps are rate-limited (at most one swap per ~150 ms, latest target wins; intermediate ones skipped), animations are interruptible springs that continue from the current visual state, so no stacking, snapping or flashing.
        - No data fetch on hover: everything the panel needs per example is already in the loaded static bundle; precompute the panel view-model for visible markers when the camera settles, so a swap is just a state change.
        - Test: sweep across 8 markers in 1 s and back → never more than one swap per 150 ms, no empty frame, story card never re-mounted, final panel shows the last marker; leave and re-enter within 300 ms → panel never closes.
      - **Tests (unit + story 14):** advance timer fires while inspect is open → inspect content unchanged; hover-out of A and hover-in of B within 50 ms → B shows, A's late leave callback ignored; rapid hover in/out across an advance boundary → no empty frame, no wrong example; closing inspect never moves or re-mounts the story card; each panel's DOM node is stable across 10 changes; no panel ever shows data from two examples (the BTS/G.E.M. mix-up).
    - **Stability and cleanliness, no flicker (user, 2026-10-30: "keep the landing page UI and especially the popovers extremely clean and extremely stable… not much flickering; the globe and the bars underneath should be extremely clean").**
      - Panel/popover: anchored to its marker with a damped follow (critically damped spring, no overshoot) and positions rounded to whole device pixels, so it never jitters while the globe turns; hover hysteresis (in ~80 ms / out ~150 ms, plus a few px of slack) so it doesn't toggle at marker edges; when the anchor goes behind the horizon the panel fades and parks at its last screen spot instead of jumping; content swaps crossfade inside the fixed container (no blank frame between old and new); no layout shift (reserved space, tabular numbers, fonts preloaded with metric-matched fallback).
      - Globe: fixed `renderOrder` and explicit `depthWrite/depthTest` per layer (land, waves, history, towers, arcs, markers) to kill z-fighting and transparency sort flicker; small polygon offset between land and waves; MSAA or FXAA on; arcs and labels never re-created per frame; no colour/opacity popping on example change (all transitions eased); DPR fixed per session (no resolution switching while visible); stable frame pacing (no setInterval timers, one rAF loop).
      - Bars (why?, city lists, compare): fixed track width and height, values animated with `transform: scaleX` from the left edge (no width reflow), same fan ramp and track colour everywhere, labels and numbers aligned on a grid with tabular numerals, no re-mount on data change.
      - Verification: a flicker check in test 14 or `perf:home`: record 10 s with the cursor resting on a marker and with the cursor sweeping, then assert (a) the panel's bounding box moves < 1 px between consecutive frames while the globe is paused, (b) no frame where the panel region is empty during an example swap, (c) zero layout-shift entries (CLS = 0) on the landing page; plus a visual review of the recording before reporting done.
    - **Rotation:** always auto-rotating, never stopped. Variable speed driven by data coverage, not land vs water: fast over open ocean **and over large land areas with little data** (e.g. Siberia, Sahara, interior Australia/Canada), slowing where data is dense (speed ∝ 1 / data density under the view centre, smoothed so it never jerks). Between examples it travels the short way to the next region. Pause on hover/drag, resume after 3 s; off-screen or hidden tab = stopped.
    - **Palette (one family, so map, waves, towers and the UI bars match; tune by eye, keep AA for text):**
      - Page: paper `#F4EFE6`; text ink `#1F2A44`.
      - Ocean: a deeper, muted teal/petrol (start ~`#5E8A90`, tune darker/lighter by eye against the sand land and the gold→brick ramp; user 2026-10-30: water "slightly darker"), with a faint lighter rim at the horizon (atmosphere `#DCE8E6`); not saturated blue. These are globe-theme values; tune them when designing the globe theme.
      - Land: warm sand `#E4D5BC`, coastlines a hair darker `#CDBB9C`; country borders off (or 10% ink).
      - Fan density ramp (waves, towers and every bar/chart in the app): pale gold `#F3D27A` → amber `#EE9A45` → tomato `#D8572F` → deep brick `#9E3324` at the peak.
      - Tour route arcs: ink `#1F2A44` at 80%, dashed while drawing, solid when done; played cities = tomato dot with a white ring; skipped city = grey `#8E8E8E` dot with a small ×, no arc to it.
      - Label card: paper with a 1 px `#CDBB9C` border, leader line in ink.
    - **Shapes:** waves are smooth (KDE / blurred density, no visible hexes), low and soft (max height ~4% of globe radius); towers only for tour cities, upright along the surface normal, thin and short (≤ 6%); data near the horizon fades out.
    - **Focus on the region in view (user, 2026-10-30):** when the globe settles on Australia, India or East Asia, everything else recedes: data outside the focus area is softened (lower opacity, desaturated toward sand, waves flattened and blurred), and it only sharpens as the rotation brings it into focus. Implement as a focus falloff from the view centre (angular distance → opacity/saturation/height/blur radius, smooth over ~25–35°), updated per frame as a shader uniform, not by rebuilding meshes. Real blur only if cheap: prefer a lower-resolution, pre-blurred version of each wave surface for the out-of-focus state, crossfaded with the sharp one; no full-screen depth-of-field post-processing on mobile. Labels, towers and arcs exist only for the focused example. This is also a performance win: full detail only for the region in focus (level of detail by focus).
    - **Build quality bar (user: "build it extremely cleanly, extremely well"):** one `Globe` component with a small typed API (`examples`, `activeIndex`, `onReady`), data shaping in a pure module with unit tests (focus falloff, speed-by-density, density precompute), no magic numbers (named constants for timing, falloff, palette from tokens), no layout shift, no console errors or warnings, clean teardown (dispose geometries/textures, cancel rAF, remove listeners on unmount and route change, no memory growth after 10 min on the page), and reviewed screenshots and a recording at desktop and mobile sizes before calling it done.
    - **Performance (must not lag on an average laptop or phone):** globe chunk lazy-loaded after first paint and only when the hero is visible; precompute each example's density surface server-side into a small mesh or texture (no per-frame KDE in the browser); one draw call per layer (instanced towers, merged wave mesh); device-pixel-ratio capped at 1.5 (1 on mobile); land polygons simplified (Natural Earth 110m); target 60 fps desktop / 30 fps mobile, falling back to a static image if the GPU is slow or WebGL fails (WebGL error seen with globe.gl `heatmapsData` in headless Chromium → don't rely on it); prefetch the next example's data during the current one.
    - **Bars elsewhere** (why?, city lists, night cards) use the same fan ramp and sand/teal neutrals, so the UI and the globe read as one product.
    - **Before wiring real data:** render one still and a 10 s screen recording from this spec for the user to approve.
  - Auto-rotation must actually run: the current live page (old neon build, checked 2026-10-30) does not rotate; it only jumps when an act tab changes. Rotate continuously (`controls.autoRotate`, slow), ease to the next example's continent on crossfade, pause on hover/drag/off-screen.
  - Bug in the current home: the "55 cities scored · 4 nights · $47,210 est. profit, a saved plan for Japanese Breakfast" stats stay put when another act is selected; stats must belong to the example on screen.
- **Motion:** few moving parts: the slow globe turn, columns growing on change, and one slow crossfade (~7 s per example, 600–800 ms fade) of the text panel. No flicker, spotlight, confetti, slamming stamps or cursor effects. Reduced-motion = static globe + manual "next".
- **Lead with decisions, not "where your fans are" (user: finding fans "is extremely simple and won't impress judges"):** each example is a judgement Tourbo made, shown as one headline + 2–3 supporting facts, e.g. "AC/DC from Sydney: skip Perth on a Tuesday (loses ~$1,200), play Adelaide instead"; "Jimmy Carr in Manchester: counter the £900 flat fee with a door split, here's the email"; "Burna Boy fans in Accra love X and Y: open with this line"; "Rehearsal: the Lisbon crowd laughs at bit 2, bit 4 misfires: swap it"; "Nate Bargatze: 6 nights, 4 profitable, total ~$18k, one support slot". Rotate across feature types (route + money, offer/counter, show prep, rehearsal, ticket pace, venue fit) so the home page demonstrates every feature, not one act per tab.
- **Remove the act tabs** (Japanese Breakfast / Zakir Khan / Arijit Singh): poor way to show features. Replace with the auto-advancing feature showcase above plus a small "Try it with any act" search box as the secondary action; primary stays "Plan my tour".
- **Cities: seed (almost) every city (do §17 #2 "any city" now, as part of this):**
  - Qloo publishes no city count; heatmaps take any location query/point, and coverage thins in small towns (other hackathon teams report weak heatmaps for small cities and name ambiguity, e.g. "Washington" → the state; query by coordinates + country).
  - `scripts/seed-cities.ts`: download GeoNames `cities15000` (~30k cities ≥ 15k people; CC BY 4.0, credit in README) or `cities5000`, at runtime/build time, into a Postgres `cities` table (name, ascii name, country, admin1, lat/lon, population, timezone, continent). Not committed as data; the script is.
  - Candidate selection: top N by population inside the circle (any continent), dedupe metro suburbs, query Qloo by coordinates + "city, country". Thin-data cities flagged, not hidden. Regions become continents/countries, not the fixed `na|eu|in`; currency by country.
  - Update story 1 test to read the new table; add the any-city cases to `11-any-city.test.ts` (Boise, Lucknow, Porto, Nairobi, Medellín, Perth).
- **50+ home examples, world-wide, relatable acts:**
  - `scripts/prewarm-examples.ts` builds ≥ 50 examples (act × home city × circle) through the same MCP tools, stores results in Postgres (`home_examples`), never in git; the home loader reads them (cached), so the page never calls Qloo live.
  - Mix (verify each resolves in Qloo; drop any that don't): legacy/global bands (AC/DC, ABBA, Queen, Coldplay, Metallica, Red Hot Chili Peppers, Arctic Monkeys, Daft Punk), current pop (Dua Lipa, Ed Sheeran, Billie Eilish, Bad Bunny, Rosalía, Shakira), regional stars (BTS/BLACKPINK in Asia, Burna Boy/Tems in Africa, A.R. Rahman/Diljit Dosanjh in India, Natalia Lafourcade in Latin America, Sigur Rós/Robyn in Europe, Tame Impala/Rüfüs Du Sol in Oceania), mid-size touring acts (Khruangbin, Japanese Breakfast as one of many), and comedians known but not superstar (Nate Bargatze, Taylor Tomlinson, Ronny Chieng, Jimmy Carr, Hasan Minhaj, Vir Das, Gad Elmaleh, Ali Wong, Trevor Noah as the one big name).
  - Every continent at least 6 examples; home cities across all of them (e.g. AC/DC from Sydney, Bad Bunny from San Juan, Burna Boy from Lagos, Jimmy Carr from London, Vir Das from Mumbai, Ronny Chieng from Kuala Lumpur).
  - Each example shows: act photo + name, home city, top 3–5 cities on the map, one "surprise city" line, best real room (no festivals), estimated night profit, one local-taste line. Crossfades every ~7 s; order shuffled per visit; small dots indicator, pause on hover/focus.
  - Framing line so big acts don't confuse the pitch: "See it on acts you know. Built for acts nobody's heard of yet."
- **"why?" redesign:** one plain sentence first ("More of this act's fans live here, and they lean toward this act more than most cities"), then a small horizontal bar chart: this city vs the next 4 and the median, labelled "fan strength" (0–100) and "how much the city leans to this act"; source line "Fan data · checked {date}". No tool names, no raw cell counts, no vendor names. Same component reused on plan pages and night cards.
- **Contrast section:** "Planned with fan data vs an AI's guess": show the cities where they differ, each with the one-line reason; pick examples from the backtest where the gap is real (backtest found city choice is roughly tied overall, so lead with venue, opener and local-taste differences, not only city lists).
- **Rest of the app:** apply the same theme to wizard, plan, night cards, prep, pipeline, projects, connect; every state designed; no neon leftovers.
- **Pass:** user approves a font pairing and a still of the quarter-Earth skyline from screenshots; home shows ≥ 50 decision examples across ≥ 6 continents and every feature type, fading calmly; no act tabs; no vendor/tech names in visible UI; map looks full; "why?" understandable by Maya; no festival as "best room"; perf budgets from Q6 still hold.
- **Story test:** `14-home-globe.test.ts` → rename/extend `14-home.test.ts`: ≥ 50 examples, ≥ 6 continents, each with ≥ 3 cities + a room + a profit; no vendor names in SSR HTML; reduced-motion = no auto-advance. `11-any-city.test.ts` as above. `15-design.test.ts` updated for the new tokens (no glow/neon tokens, two fonts, no mono).
- **Likely files:** `scripts/seed-cities.ts`, `scripts/prewarm-examples.ts`, `packages/core/src/engine/cities.ts`, `packages/core/src/db/schema.server.ts` (`cities`, `home_examples`), `packages/core/src/engine/venues.ts` (exclude festivals/events), `apps/web/app/app.css`, `root.tsx`, `routes/home.tsx`, `components/globe.tsx` → `components/world-map.tsx`, `components/fact-ticker.tsx`, new `components/why.tsx`, area picker, every route for the theme pass.
- **Status:** built (UI, 2026-10-30): landing globe, dialog, pop-ups, theme pass, perf gate, tests 14/15/17 (see §17). Since: terrain baked client-side from the JSON bundle (PNGs removed), bundle committed; globe final pass done (navigation overhaul, look, nearby examples as flat surfaces, CLS 0, story 14 22/22 ×3). Open: `examples:export` gate (dancer 2 of 3, blocked by the fan-data monthly quota); throttled long tasks ~12–18 per 20 s (startup hydration + warm-up, one ~50 ms show task per example).

### Q8. One cache layer (backend-agnostic) + a fully static landing page
- **Feature:** a single, storage-agnostic caching/snapshot layer for everything read-mostly (Qloo responses, MCP tool results, home examples, plan views), and a landing page that is prerendered static HTML + static data, so thousands of visitors cost nothing and see data instantly.
- **Why / user ask:** "add caching, basically create this as an agnostic layer… even static files could do… make the landing page fully static, so it doesn't cost anything to us even when hundreds and thousands of users browse it; it's fast and data is immediate." Today: only a Postgres `qloo_cache` (7-day TTL, `packages/core/src/qloo/cache.server.ts`) with an in-memory fallback; landing is SSR on every hit (`apps/web/react-router.config.ts`: `ssr: true`, no prerender).
- **Cache layer (`packages/core/src/cache/`):**
  - One API: `cached(key, fn, { ttl, swr, tiers, tags })` and `snapshot.get/put(key)`; keys = stable hash of the request; values JSON.
  - Pluggable tiers, read in order, written through: `memory` (LRU, per process) → `file` (local disk / baked static files, read-only in prod) → `postgres` (today's `qloo_cache`, generalised to a `cache` table with namespace, key, value, expires_at, tags) → optional `object store/CDN` later (S3/R2-compatible, behind an env var). Backends implement one small interface (`get`, `set`, `delete`, `deleteByTag`); choose tiers by config, not code changes.
  - Policies: TTL per namespace (Qloo 7 days, MCP tool results 1 day, examples until next export, plan views until the run changes); stale-while-revalidate for reads; request coalescing (one in-flight fetch per key); negative-caching off (null/empty Qloo responses are not cached, see the fix in `cache.server.ts`); size caps + LRU eviction for memory.
  - Migrate `qlooGet()` onto it (no behaviour change), wrap read-only MCP tools (`tourbo_score_cities`, `tourbo_city_brief`, venues, openers) and public plan views.
  - Observability: hit/miss/stale counters per namespace in `usage.ts` output and a dev-only `/healthz` field.
- **Fully static landing:**
  - Prerender `/` at build (React Router `prerender` in `react-router.config.ts`; verify the option for the pinned v8 first) to static HTML with the hero, headline, copy and the first example inlined (critical data in the HTML, so it's immediate, no fetch).
  - Static data bundle from Q7 "Landing page = static data only" (`examples:export` → content-hashed files + manifest, git-ignored, baked into the image/deploy); the globe streams the rest by region.
  - Serve HTML with `Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=604800`, hashed assets `immutable`; works behind any CDN (Render static/CDN, Cloudflare) with zero origin compute per visit. No cookies/session on `/` (so CDNs cache it; Q4 guest session starts on the first action, not on landing).
  - Refresh = re-run `examples:export` + rebuild/redeploy (or upload the new bundle and bump the manifest); no live Qloo/AI on the landing path ever.
- **Pass:** 1,000 concurrent landing visits produce 0 Qloo calls, 0 AI calls, 0 DB queries and ~0 origin CPU (load test against the prod build with the bundle); TTFB < 100 ms from cache, first example visible without any XHR; repeated Qloo-backed tool calls hit the cache (hit rate reported); switching the cache tier list via env works without code changes.
- **Minimum data before export (user, 2026-10-30: "make sure we have at least 100 events' data, including maps data and the density info"):** `examples:export` refuses to write the bundle unless there are ≥ 100 complete examples, where complete = decision headline + `route[]` with coordinates for every stop (map data) + `compare` + `tourProfit` + `losingNight` + a `home_fan_density` row for that act with ≥ 1,000 points and per-country `coverage`; plus ≥ 6 continents and ≥ 3 per discipline. It prints the counts and the missing fields per example. Status 2026-10-30 (prewarm v2 mid-run): 84 examples, 33 acts, 80 complete, 34 acts with density.
- **Story test:** `18-cache.test.ts`: same tool call twice → second is a cache hit (counter), null response not cached, SWR returns stale then refreshes, tier order respected (memory → file → postgres); landing HTML contains the first example inline; with Qloo key unset + Postgres stopped `/` still renders (shared with test 14); response headers on `/` and assets match the policy; `/` sets no cookie.
- **Likely files:** new `packages/core/src/cache/{index,memory,file,postgres}.ts`, `packages/core/src/qloo/client.server.ts` + `cache.server.ts` (migrate), `packages/core/src/db/schema.server.ts` (`cache` table), `packages/mcp/src/tourbo/tools.ts` (wrap read-only tools), `apps/web/react-router.config.ts` (prerender), `apps/web/app/routes/home.tsx` (static loader), `apps/web/server/app.ts` (cache headers, no cookie on `/`), `apps/web/scripts/prewarm-examples.ts` (`examples:export`), `.gitignore`, README.
- **Status:** done (2026-10-30): cache layer (`packages/core/src/cache`, tiers via `CACHE_TIERS`, qlooGet + read-only MCP tools on it, test 18-cache) + prerendered static `/` (first example inline, CDN headers, pre-compressed assets, test 18-landing-static, `landing:load` 1,000 visits: 0 DB / fan-data / AI calls). Production default: no cache (`CACHE_TIERS` unset + NODE_ENV=production → none; user: only the landing page is pre-baked, live app + MCP always fresh); the layer is for dev/prewarm. Not done: plan-view caching, object-store tier, expired-row cleanup.
