# Submission kit

## Devpost

**Name:** Tourbo

**Tagline:** What to play, say or paint in each city on your tour, backed by real taste data.

**Inspiration**
Touring acts play the same set everywhere because they don't know what each city likes. Big acts have promoters and local crews who do. A singer with a 300-person draw or a comic playing bars guesses. Ask an LLM and you get generic advice ("play a classic", "joke about the traffic"). We wanted ideas a local would give, backed by numbers.

**What it does**
Tourbo is a recommendation engine for touring artists. For each city on a tour, it gives several ideas, each backed by a Qloo number:
- **Musicians:** cover ideas. A band whose fans in Brisbane or Austin over-index on AC/DC gets "play an AC/DC song your way" there, and something else where AC/DC doesn't stand out.
- **Comics and speakers:** local topics (TV, teams, food, places, people, trends) turned into bit premises and crowd-work questions.
- **Painters:** subjects and themes from the city's landmarks and taste, labelled as ideas, not sales predictions.
- **Everyone:** a set order per city, with a reason for each move.

Acts that aren't in the fan data still get ideas, from acts they sound like, a style they pick, or just the city. The screen says what the ideas are based on.

Under the ideas sits the tour plan: cities scored on where the act's fans cluster, rooms near those fans, a local opener, the money for each night, a route, show notes, and venue emails with offer checks and counter-offers. Nothing is sent without the artist's approval.

The same tools are an MCP server. Use the hosted endpoint, or run it yourself with your own Qloo key, from Claude Code, Claude Desktop or any MCP client.

**How we built it**
- npm workspaces: `@tourbo/core` (Qloo client and deterministic engine, no LLM), `@tourbo/mcp` (stateless MCP server), `apps/web` (React Router + Express, Postgres, all inference).
- Qloo: artist insights for the act's fans in a city vs elsewhere (covers), location-only insights across TV, films, podcasts, brands, places, people and trends (topics and subjects), heatmaps with geohash boundaries (city scores), place insights with tags (rooms), similar acts ranked by local heatmap presence (openers), genre tags (acts not in the data). One client: GET, retries, concurrency limit, parameter whitelist.
- Agent: Claude via the Anthropic SDK tool runner, calling the MCP tools through an in-process client, the same tools external assistants get. A critic drops any idea or local reference it can't match to that city's data, and Claude revises.
- Story tests run every user story against live Qloo.

**Challenges**
- Heatmap affinity is normalised per request, so it can't be compared across cities. City scores blend fan footprint with over-indexing, which surfaces smaller cities.
- The fan data has no songs, only artists, so set order and covers work at artist and genre level.
- Most small acts aren't Qloo entities. Sounds-like acts, style tags and city-only taste give them a path with no dead end.
- Qloo has no venue capacity or ticket data. Capacities and profit are estimates and are labelled that way.

**Accomplishments**
Every idea and every local reference points at a Qloo value for that city. The same server runs inside our app, in a user's own assistant, and self-hosted. On eight real 2024–25 tours, Tourbo's top cities matched the bookers' real stops 68% of the time (Claude alone: 67%, random pick: 42%). The difference is that Tourbo explains each pick with numbers and also works for acts an LLM has never heard of.

**What we learned**
Taste data is most useful when it's local and relative: not "what do people like" but "what do *your* fans in *this* city like more than your fans elsewhere".

**What's next**
More idea types (merch, local collaborators), more disciplines on the website, and OAuth for the hosted MCP endpoint.

**Built with:** qloo, claude, anthropic, mcp, typescript, react-router, express, postgresql, maplibre, openfreemap, resend, docker

## Video script (~2 min)

| Time | Screen | Voice-over |
| --- | --- | --- |
| 0:00 | Home globe | "Touring acts play the same set in every city. Tourbo tells them what each city wants." |
| 0:08 | `/start`: pick musician, type the band, click Austin, size the circle | "Tell it who you are and where you're going." |
| 0:18 | Progress list while it works | "It checks where your fans are and what they like, city by city." |
| 0:28 | Ideas tab for Austin: cover ideas, open "why?" | "In Austin, your fans over-index on AC/DC. So: play an AC/DC song your way. Here's the number." |
| 0:42 | Ideas for another city on the run | "In the next city the idea is different, because the crowd is different." |
| 0:52 | Switch discipline: a comic not in the data, "My style is…", local topics | "A local comic who isn't in any database picks a style and still gets local topics, bit premises and crowd-work questions." |
| 1:08 | Set order for one night | "Paste your set. Tourbo orders it for this city and says why." |
| 1:18 | Tour tab: map, night cards, money verdict | "Underneath is the tour: rooms near your fans, an opener, the money for each night." |
| 1:30 | Compare tab | "The same AI without the fan data gives generic advice it can't back up." |
| 1:40 | Venue email, an offer, the counter-offer draft | "It writes to venues and checks offers. You approve every send." |
| 1:50 | `/connect` | "Use it here, from your own AI assistant, or run the server yourself. Tourbo." |

## Checklist

- [ ] Deploy on Render; put the live URL in README + Devpost
- [ ] `npm run qloo:prewarm` on Render before judging (cache TTL 7 days)
- [ ] Set repo variable `TOURBO_URL` so `.github/workflows/keepalive.yml` pings `/healthz` Nov 1–6
- [ ] Optional (Devpost doesn't require a video): voice-over + trim the raw footage (`~/Videos/tourbo-demo-raw.webm`, or re-record against the live URL with `scripts/record-demo.cjs`), upload, link on Devpost
- [ ] Make the repo public (MIT `LICENSE` is in the root)
