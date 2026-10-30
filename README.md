# Tourbo

> **A recommendation engine for touring artists, grounded in real taste data.** For every city you play or show in, Tourbo suggests what to perform or make *there*: covers that crowd over-indexes on, local topics to joke or talk about, subjects to paint, the order of your set. Several ideas per city, each backed by a Qloo number. The tour plan (cities, rooms, money, route, venue emails) is the map underneath.

Qloo Agentic Hackathon 2026 entry. Live demo: _link added at deploy_.

A band that plays AC/DC its own way in Brisbane or Austin, because its fans there over-index on AC/DC, gets a better night than one that plays the same set everywhere. A comic who opens with the local team, a painter who shows the city's own landmarks: the same idea. Big acts have people who know each city. A singer with a 300-person draw, or a comic playing bars, guesses. Tourbo replaces the guess with Qloo's taste and location data and shows the number behind each idea.

**Who does what**

- **Qloo** knows taste: where an act's fans cluster, which acts those fans over-index on in each city, what each city loves (TV, teams, food, places, people, trends), which rooms and local acts fit.
- **Tourbo MCP server** (`packages/mcp`) turns those relations into tools: ideas per city, score cities, find rooms, openers, show economics, routing, offer assessment, plan critic. No AI inside; every number is reproducible. Use it hosted or run your own.
- **Claude** is the agent. On the website it calls those tools, picks the ideas and cities worth it, writes the angle for each idea, show notes and venue emails, and negotiates. In your own Claude Code, Claude Desktop or other MCP client, your assistant calls the same tools.
- **You** decide. Nothing goes to a venue without a click; every money figure is labelled an estimate.

## What it does (the stories in [`STORIES.md`](STORIES.md))

1. **Ideas for a city:** the first tab of every plan, and available for any city you click on the map. Several ideas, each with a "why?" fan-data number and a one-line angle. Ideas that can't point at that city's data are dropped.
   - **Musicians:** cover ideas: well-known acts your fans in that city over-index on compared with your fans elsewhere ("play it your way"). Across a run, a cover goes to the cities where it over-indexes most, not everywhere.
   - **Comics and speakers:** local topics from the city's own taste data (TV, films, podcasts, teams, brands, food, places, people, trending), turned into bit premises, crowd-work questions and local examples.
   - **Painters and gallery shows:** subjects and themes (landmarks, places, the region's taste themes, artists and films its gallery-goers love). Taste-based ideas, not sales predictions.
   - **Set order:** paste your songs or bits; Tourbo orders them per city, with a reason for each move and a slot for a local nod.
2. **Not in the fan data? Still works.** Most local acts aren't Qloo entities. Pick acts you sound like, a style (e.g. "observational comedy", "qawwali"), or just the city. The screen says in one line what the ideas are based on.
3. **The tour underneath:** click the map, size a circle, set dates and shows. You get a route, and for each night the room, opener, deal, ticket price, expected tickets and profit. Nights that lose money are dropped or turned into support slots.
4. **Show notes and rehearsal:** per night, an opening line, local nods, banter and a sponsor ask, checked by a critic against that city's data. "Rehearse with fans" runs the notes past four simulated audience members built from the city's data.
5. **Venue emails:** one inquiry per venue with the fan numbers. Replies are classified; a pass promotes the backup room. An offer is checked against your lowest fee, then Claude drafts an accept, a counter or a walk-away for you to send.
6. **Ticket sales:** enter tickets sold; Tourbo says whether the show is on track and what to change. Logged attendance calibrates your next plan.
7. **For venues** (`/explore`): a bar enters its name and gets acts its crowd likes that are small enough to book.
8. **Your own assistant** (`/connect`): use Tourbo's hosted MCP endpoint, or run the same server yourself with your own Qloo key (see below).

## Why it fails without Qloo

An LLM alone can suggest "play a classic rock cover" or "joke about the weather". It can't know which covers your fans in Brisbane over-index on compared with your fans in Sydney, which TV show or team Austin over-indexes on this year, or which landmarks a city's gallery-goers care about. It also can't say where *your* fans cluster or which rooms they like. Those are measured relations, not general knowledge, and Qloo has them. The "With vs without Qloo" tab shows the same model working blind; the show-notes page shows the generic draft next to the grounded one.

## Backtest: agreement with real bookers' picks

Eight real 2024–25 tours of mid-size acts (city lists from setlist.fm, Songkick or the tour announcement; sources in `tests/stories/backtest.json`). For each, N = the real stops that are in Tourbo's city list; the score is how many of Tourbo's top N cities by Qloo fan score were real stops. It measures agreement with experienced bookers, not accuracy: a real route isn't proof of the best cities. "Claude alone" is the same model picking N cities from the same list with no data.

| Tour | Real stops in our city list | Tourbo (Qloo) | Claude alone | Random pick |
| --- | --- | --- | --- | --- |
| MJ Lenderman, Manning Fireworks Tour 2024-25 (North American dates) | 27 | 74% | 70% | 49% |
| Wednesday, Bleeds Tour 2025 (fall North American leg) | 15 | 47% | 53% | 27% |
| Jessica Pratt, Here in the Pitch Tour 2024 (summer North American leg) | 14 | 57% | 50% | 25% |
| Joe Pera, The PERAs Tour 2024 | 21 | 67% | 57% | 38% |
| Black Country, New Road, Forever Howlong Tour 2025 (autumn UK/Ireland/Europe leg) | 17 | 71% | 82% | 65% |
| English Teacher, 2025 UK + Ireland Tour | 7 | 86% | 57% | 27% |
| Prateek Kuhad, Silhouettes India Tour 2024 | 10 | 70% | 70% | 63% |
| Samay Raina, Still Alive & Unfiltered India Tour 2025 | 7 | 71% | 100% | 44% |
| **Mean (8 tours)** | | **68%** | **67%** | 42% |

Read plainly: on *which* cities, Qloo scoring agrees with bookers about as often as Claude's own knowledge of these well-known acts, and far above chance. Its edge is elsewhere: it works for acts Claude has never heard of (story 4, act-less painters), explains each pick with numbers, and the rooms, openers and show notes come from the same data. Small sample; `npm run backtest` re-runs it (`npm run test:stories` checks the Qloo column hasn't regressed).

## How it uses Qloo

One client (`packages/core/src/qloo/client.server.ts`): GET with `X-Api-Key`, retries on 429/5xx, concurrency 8, a per-type parameter whitelist (Qloo silently ignores unknown params) and a Postgres response cache (memory fallback).

| Job | Qloo call |
| --- | --- |
| Resolve act (strict name match; unknown acts plan from "sounds like" peers) | `/search` (`urn:entity:artist` / `urn:entity:person` for comedians) |
| City scores + fan hotspots | `/v2/insights` `urn:heatmap`, act + peer signal, `filter.location.query`, geohash boundary |
| Rooms | `urn:entity:place` near the top hotspot with place tags (live music, concert hall, club, bar, comedy club, theatre), act signal, widening search |
| Openers | similar artists / people no bigger than the act, ranked by local heatmap presence |
| City brief (show notes) | city culture via `signal.location.query` (TV, brands, people, podcasts), local artists, local spots weighted by the act's fans, fan tags |
| Sponsors | city brands re-ranked by the act's fans (`filter.results.entities`) |
| Markets for new acts | heatmaps from comparable acts or genre tags (`signal.interests.tags`) across regions |
| Acts for a venue | artists/people with the venue as the signal, plus local heatmap presence |

Plus the nine Qloo hackathon-harness workflows (recommend, rank, describe, where_popular, compare_audiences, entity_tags, audience_demographics, trends, find_tags), ported to TypeScript as `qloo_*` MCP tools.

## Architecture

```mermaid
flowchart LR
  subgraph web [apps/web]
    UI[React Router UI<br/>start · plan · notes · emails · sales] --> Agent[Claude agent<br/>toolRunner + jobs]
    Agent --> Client[In-process MCP client]
    Remote["/mcp (token-gated HTTP)"]
  end
  subgraph mcp [packages/mcp]
    Server[Tourbo MCP server<br/>tourbo_* + qloo_* tools]
  end
  subgraph core [packages/core]
    Engine[Engine: score · venues · openers · brief<br/>economics · routing · negotiate · pace · critic]
  end
  Client --> Server
  Remote --> Server
  Stdio[stdio: Claude Code / Desktop] --> Server
  Server --> Engine --> Qloo[(Qloo API)]
  Engine --> PG[(Postgres: cache · runs · trace<br/>prep · outreach · checkins · results)]
  Agent -->|trace SSE| UI
```

- npm workspaces: `packages/core` (no LLM), `packages/mcp` (no LLM, stateless), `apps/web` (all inference).
- Agent: `@anthropic-ai/sdk` tool runner (Claude Haiku 5.5), adaptive thinking summaries in the trace, prompt caching, structured outputs for workers, show notes and email drafts. A full plan costs about $0.02; show notes about $0.004 per night.
- MCP: `@modelcontextprotocol/server` v2; progress notifications carry trace events so the hosted UI streams tool internals.
- Map: MapLibre GL + OpenFreeMap. Email: Resend (sandbox inbox only in the demo).

## Judging criteria

- **Technological implementation:** per-city ideas from Qloo relations (fans-in-city vs fans-elsewhere artist insights for covers, location-only insights across TV, films, podcasts, brands, places, people and trends for topics and subjects), heatmaps, place/tag insights and genre-tag markets, all through one validated client. One MCP server serves the hosted agent, external assistants, and self-hosters. A tool-using agent with critic loops that drop ungrounded ideas, deterministic economics and negotiation, and story tests against live Qloo.
- **Design:** ideas first, the tour second. A few ideas per city, each with its number behind "why?". Short forms, a path for acts not in the fan data, one primary action per screen, plain-language errors with retry.
- **Potential impact:** most touring acts are small and many aren't in any taste database. Tourbo gives them what a local promoter knows (what this crowd likes, what to play or say here) plus the money check on each night.
- **Quality of idea:** a recommendation engine where every suggestion is a measured Qloo relation, not an LLM guess. The Qloo-off comparisons make the difference visible.

## Use the MCP server

Same tools three ways; details and every flag in [`packages/mcp/README.md`](packages/mcp/README.md). Never put a real key or token in a shared config: `<your-key>` / `<your-token>` are placeholders.

**Hosted (ours):** paste `https://<host>/mcp` into your assistant with `Authorization: Bearer <your-token>` (tokens from whoever runs the deployment, `MCP_TOKENS`). Tourbo's own key stays on the server; each token and IP gets 60 tool calls per 10 minutes.

```bash
claude mcp add --transport http tourbo https://<host>/mcp --header "Authorization: Bearer <your-token>"
```

**Self-hosted (your own Qloo key, Node 22+):**

```bash
QLOO_API_KEY=<your-key> npx -y @tourbo/mcp                                            # stdio
QLOO_API_KEY=<your-key> MCP_TOKENS=<your-token> npx -y @tourbo/mcp --http --port 8787   # own endpoint, /healthz
docker run --rm -p 8787:8787 -e QLOO_API_KEY=<your-key> -e MCP_TOKENS=<your-token> ghcr.io/<owner>/tourbo-mcp
claude mcp add --env QLOO_API_KEY=<your-key> --transport stdio tourbo -- npx -y @tourbo/mcp  # Claude Code
```

Claude Desktop (`claude_desktop_config.json`), Cursor (`.cursor/mcp.json`) and most stdio clients:

```json
{ "mcpServers": { "tourbo": { "command": "npx", "args": ["-y", "@tourbo/mcp"], "env": { "QLOO_API_KEY": "<your-key>" } } } }
```

VS Code (`.vscode/mcp.json`) uses `"servers"` with `"type": "stdio"` and the same command; see the package README. Inside this repo, Claude Code picks the server up from `.mcp.json`.

- `npm run mcp:build`: bundles `packages/mcp/dist/bin/tourbo-mcp.js` (one ESM file, `@tourbo/core` inlined). `docker compose --profile mcp up -d --build mcp`: the self-host image on 127.0.0.1:8787. Publishing (`npm publish -w @tourbo/mcp`, image push) is manual; CI (`.github/workflows/mcp.yml`) checks build, smoke, pack contents and size.

## Run locally

Node 22+. No Docker needed: without `DATABASE_URL`, the app starts a local Postgres 17 itself (data in `.data/postgres`, git-ignored, port 5434) and stops it on exit.

```bash
npm install
cp .env.example .env     # set QLOO_API_KEY and ANTHROPIC_API_KEY
npm run dev              # http://localhost:3000
```

- `npm run test:stories`: the user stories against live Qloo (no LLM); `STORY_LLM=1` adds a full Claude run (app must be running).
- `npm run mcp`: the MCP server on stdio. `npm run test -w @tourbo/mcp`: MCP smoke test.
- `npm run plan:demo -- "<artist>" [na|eu|in] [shows] [musician|comedian]`: engine only. `npm run agent:demo -- …`: full agent in the terminal.
- `npm run cities:seed`: loads the world city table (GeoNames, ~34k cities) so any circle on the map works; without it the hand-picked seed list is used.
- `npm run examples:prewarm`: builds the home-page examples (150+ acts, every continent) into Postgres (`--dry-run` estimates the fan-data calls first; `--rebuild` redoes them from the cache).
- `npm run examples:export`: writes the landing page's static bundle to `apps/web/public/landing/`. The landing page reads only these files. The bundle is committed, so a deploy from git serves it as is; re-run and commit after the examples change.
- `npm run db:import -- [source-url] [--replace]`: one-off copy of another Postgres (default: the old Docker one, `postgres://tourbo:tourbo@localhost:5433/tourbo`) into the local one. Reads the source only.
- Docker (optional): `docker compose --profile app up -d --build web` runs the production image with Postgres. To use the compose Postgres from npm scripts, set `DATABASE_URL=postgres://tourbo:tourbo@localhost:5433/tourbo`.

| Variable | Required | Notes |
| --- | --- | --- |
| `QLOO_API_KEY` | yes | |
| `ANTHROPIC_API_KEY` | yes (website agent) | not needed for the MCP server |
| `DATABASE_URL` | no | your own Postgres; unset = the local one in `.data/postgres` |
| `MCP_TOKENS` | no | comma-separated bearer tokens; enables `/mcp` |
| `PUBLIC_URL` | no | shown in the Connect page snippets |
| `DEMO_DISCIPLINES` | no | disciplines the website offers (default `all`; e.g. `musician,comedian` to narrow) |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `OUTREACH_*` | no | email; sends are simulated without a key |

## Limits

- Qloo has no capacity, price or sales data: capacities, draw and profit are estimates (formula shown on each card), calibrated once you log past shows.
- Disciplines: one registry (`packages/core/src/disciplines/`) covers 18 kinds of act: singers, comedians, DJs, dancers, poets, visual artists, authors, podcasters, speakers, magicians, theatre troupes, photographers, makers, buskers, circus acts, chefs (supper clubs), filmmakers and teachers: Qloo entity types, spaces, support act, prices, extra sales per head, stay length and show-notes prompt. The website and MCP offer all of them (`DEMO_DISCIPLINES` narrows the website); the 10 newest are built from the Qloo docs and not yet probed live. Most painters, dancers and poets aren't Qloo entities, so they plan from comparable acts.
- Runs are in-process: a restart mid-run shows "interrupted" with a retry button.

## License

MIT. Qloo responses are cached server-side only and never committed. City data: [GeoNames](https://www.geonames.org/), CC BY 4.0.
