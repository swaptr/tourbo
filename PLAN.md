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
  vendor/                      # qloo-harness (MIT, reference for the port), qloo-hackathon-kit (submodule)
```
- Packages export TS source in-repo (`"exports": {".": "./src/index.ts"}`): Vite compiles it for the web app; Node's type stripping runs scripts (workspace symlinks resolve outside `node_modules`; verify). Keep erasable syntax only.
- `@tourbo/mcp` gets a `tsc` build to `dist/` + `publishConfig.exports` for npm; `@tourbo/core` is bundled into it or published alongside.
- `*.server.ts` naming stays inside `apps/web`; packages are server-only by construction (never imported by `app/` client code).

### Toolsets
1. **`qloo_*` — TS port of `@qloo/qloo-harness@0.1.26` workflows** (MIT; keep the copyright notice in the ported files). Same names and input shapes so prompts and docs carry over: `qloo_capabilities`, `qloo_recommend`, `qloo_rank`, `qloo_describe`, `qloo_where_popular`, `qloo_compare_audiences`, `qloo_entity_tags`, `qloo_audience_demographics`, `qloo_trends`, `qloo_find_tags`. Schemas rewritten in zod v4 (harness uses typebox); executed via `qlooGet()` instead of the harness's own client; no `@earendil-works/pi-coding-agent` dependency. Source of truth for schemas/behaviour: `vendor/qloo-harness/dist/chunks/chunk-MCLV3P4I.js` + `dist/qloo-tools.js`.
2. **`tourbo_*` — domain tools over `@tourbo/core`:** `tourbo_resolve_artist`, `tourbo_score_cities`, `tourbo_city_detail` (venue candidates, openers, angles, local scene for one city), `tourbo_route`, `tourbo_critique`, `tourbo_compare_plans`; later (§14) `tourbo_city_economics`, `tourbo_market_finder`, `tourbo_city_brief` (data for material prep), `tourbo_sponsors`.
- Tool results: compact `structuredContent` (zod `outputSchema`) + short text summary; every number keeps its Qloo source field so the critic and UI evidence chips still work.
- MCP prompts/resources (optional): `plan_tour` prompt for Claude Desktop users; `tourbo://cities/{region}` seed-city resource.

### Transports
| Mode | Transport | Credential | Who |
|---|---|---|---|
| Local | stdio (`npx @tourbo/mcp`) | user's own `QLOO_API_KEY` env | Claude Desktop / any MCP client |
| Hosted agent | in-process `InMemoryTransport` client ↔ server | server's key, never leaves the process | web app runs |
| Remote | Streamable HTTP `/mcp` on the web service (`NodeStreamableHTTPServerTransport`, stateless) | bearer token required; or caller's own Qloo key in a header | judges / other agents |

- Kit rules (`vendor/qloo-hackathon-kit/docs/API_ACCESS.md`): never put a credential in a public MCP config or share it. So `/mcp` is **never open**: tokens from `MCP_TOKENS` env (or BYO Qloo key), per-token rate limit, host/origin validation. Default off until configured.
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
- **B. Qloo toolset port.** 9 workflows + capabilities in `packages/mcp`. Contract test: same inputs through the vendored harness (`qloo mcp`, run from a temp dir with its deps) and ours → same result shape and comparable entities.
- **C. Domain toolset.** Wrap engine + critic as `tourbo_*`; stateless inputs; compact outputs.
- **D. Transports.** stdio bin; in-memory pair; `/mcp` HTTP behind tokens. Test with MCP Inspector and Claude Desktop.
- **E. Agent switch.** Orchestrator and workers use `mcpTools` via the in-memory client; delete `betaZodTool` wrappers in `agent/tools.ts`; trace via notifications. Parity check vs today: Japanese Breakfast NA 6 shows and Arijit Singh IN (cost, critic issues, plan quality).
- **F. Publish.** `@tourbo/mcp` on npm, README section with a Claude Desktop config (own key), MCP Inspector screenshot.
- **G. §14 features** land as new `tourbo_*` tools (data) + web-app agent loops (decisions).

### Open questions
- Publish `@tourbo/core` separately or bundle it into `@tourbo/mcp`? (Bundling keeps one public package.)
- Cache backend for stdio users: in-memory by default, optional `DATABASE_URL`/SQLite?
- Whether to keep harness-identical `qloo_*` names or prefix them (`tourbo_qloo_*`) to avoid clashing when a client also runs `qloo mcp`.

## 16. Any artist: a discipline-agnostic model (proposed, 2026-10-29)

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
