# Submission kit

## Devpost

**Name:** Tourbo

**Tagline:** Give it an artist. It plans the tour that sells out, and emails the venues.

**Inspiration**
Independent artists route tours by gut feel: last year's cities, streaming counts, a booking agent's memory. Streams show where someone listened once, not where ticket buyers cluster or which room fits them. One wrong city is a half-empty room and a lost guarantee on a tour that already runs on thin margins.

**What it does**
Type an artist. Tourbo's agent scores every tour market in the region from the artist's Qloo fan heatmap, finds the fan hotspots in each city, picks venues near those hotspots that the artist's crowd likes, suggests a local opener who shares the audience, writes a promo angle from the city's own culture, routes the tour, and critiques its own plan before finalizing. You watch it work in a live trace next to a map. Every pick carries the Qloo evidence behind it.

Then it books: it drafts an inquiry per venue with the fan numbers, sends on approval (sandbox inbox), classifies replies, and when a venue passes it promotes the backup and drafts a new email. A Qloo-off tab shows the same model planning without Qloo: generic cities, unverifiable venues.

**How we built it**
- One TypeScript app: React Router v8 (SSR) on Express, Postgres, deployed on Render with Docker.
- Agent: Claude Haiku 5.5 via the Anthropic SDK tool runner. Six tools wrap a deterministic engine; parallel city workers return structured output where every claim cites a Qloo item; a deterministic critic sends it back to fix thin-data cities, missing backups and long legs.
- Qloo: heatmaps with geohash boundaries (city score = fan footprint + over-indexing, because affinity is percentile-normalised per request), place insights with a WKT point + radius + venue tags and a self-repairing search, artist insights for openers, location-only insights for local culture. All through one validated, cached, rate-limited client.
- Live trace over SSE, persisted so a share link replays the whole reasoning.
- Outreach on Resend: send API, `email.received` webhook with signature verification, reply tokens, Claude classification.

**Challenges**
- Heatmap affinity can't be compared across cities, so we built a score that blends footprint with over-indexing (this surfaces smaller cities that over-index).
- The documented `lat,lon` location form returned 400 for places; WKT `POINT(lon lat)` worked. 5-char geohash filters returned nothing, so venue search widens step by step and logs each step.
- Location signals barely move artist results (8/10 overlap), so openers are similar artists ranked by their own heatmap presence in each city.
- Qloo has no venue capacity; capacities are model estimates and always labelled as such.

**Accomplishments**
A full plan (6 cities, venues, backups, openers, angles, route, critique) in about a minute for about $0.015, with every number traceable to a Qloo call. For Arijit Singh in India, the Qloo plan's mean city score is 73 vs 66 for the LLM-only plan, which picked Delhi (43) and Chennai (34) over Ahmedabad (54) and Hyderabad (61).

**What we learned**
Taste data is most valuable when it's local: the same artist's audience looks different city by city, and that is what a tour plan needs.

**What's next**
Comedians and podcasters (heatmaps already work for `urn:entity:person`), per-city set notes from local culture, more regions (EU, LatAm), and an MCP server exposing `plan_tour`.

**Built with:** qloo, claude, anthropic, typescript, react-router, express, postgresql, maplibre, openfreemap, resend, render, docker

## Video script (~2 min)

| Time | Screen | Voice-over |
| --- | --- | --- |
| 0:00 | Home | "Indie tours get routed by gut. Tourbo routes them by fans." |
| 0:08 | Click "Try: Japanese Breakfast", Plan tour | "Give it an artist, a start date and a room size." |
| 0:15 | Trace streaming: heatmaps for 50 cities | "The agent pulls Qloo fan heatmaps for every market and scores them on footprint and over-indexing." |
| 0:30 | Trace: venue searches, a repair step, worker picks | "For the best cities it searches venues next to the fan hotspots, widens the search when data is thin, and a worker picks a room and a backup, citing Qloo numbers." |
| 0:45 | Critic issues, agent fixing | "A critic checks the plan, and the agent fixes what it flags." |
| 0:55 | Map + city cards, hover evidence chips | "The result: a routed tour, fan hotspots on the map, and every venue, opener and promo line backed by Qloo evidence." |
| 1:10 | Compare tab | "The same model without Qloo picks the obvious cities and venues it can't verify. Qloo finds the overlooked markets." |
| 1:25 | Outreach: draft all, review one, approve & send all | "Then it books. Drafts carry the fan numbers; nothing goes out without approval." |
| 1:40 | Simulate "pass" on one venue → backup appears in Drafted; trace shows the swap | "A venue passes, so the agent promotes the backup and drafts a new inquiry on its own." |
| 1:52 | Share link | "Every plan is a shareable link with the full reasoning. Tourbo: tours routed by fans." |

## Checklist

- [ ] Deploy on Render; put the live URL in README + Devpost
- [ ] `npm run qloo:prewarm` on Render before judging (cache TTL 7 days)
- [ ] Set repo variable `TOURBO_URL` so `.github/workflows/keepalive.yml` pings `/healthz` Nov 1–6
- [ ] Voice-over + trim the raw footage (`~/Videos/tourbo-demo-raw.webm`, or re-record against the live URL with `scripts/record-demo.cjs`), upload, link on Devpost
- [ ] Make the repo public (MIT `LICENSE` is in the root)
