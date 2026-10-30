# Tourbo — nice to have

Things we could build next. None of them block the submission. Required work lives in `TODO.md`; the build queue is in `PLAN.md` §18.

## Once fan-data quota returns
- Re-prewarm the home examples with a stricter room fit, so no stadium act lands in a jazz club. Bring the dancer gate and thin kinds back to the landing page.
- Live story tests 1–4, 6, 9, 11, 12, 19–26 and 33; probes for the 10 newer kinds; an audience demographics probe (then turn the demographics fetch on).
- Use `/v2/trending` momentum in city scoring. The `qloo_trends` tool exists; scoring does not use it yet.

## Planning
- Book tours (`urn:entity:book`): readings and signings for authors and poets.
- Date clash check: festivals, holidays, and other acts on the same night in the same city.
- Venue access from open data (OSM/GTFS): airport, train or bus, transit and load-in notes per room.
- Latin America seed cities (`latam`); wider venue tags for thin-venue cities (Lagos, Delhi, Mexico City, Barcelona); filter hotel banquet halls out of India venues.
- A city brief on a map click: any city on the map opens a short "what this crowd is into" card.
- Multi-act bills: plan a co-headline or a package tour across two acts' fan maps.
- Budget mode: set a target profit or a max travel day and let the planner fit the route to it.

## Keeps-working loop
- Background research: refresh upcoming nights' notes (trending, new local references) a few days before each show.
- Ticket-pace alerts: nudge when a night is behind pace, with one suggested fix (promo, smaller room, support slot).
- Post-show calibration across tours: learn the act's real draw per city from logged results.

## Sharing and export
- Shareable read-only plan links with a clean public view.
- PDF export of a tour (route, money, set per night), plus a one-page "tour poster".
- Calendar sync: `tourbo_export_ics` exists; add a subscribe URL.
- Press kit per city: a short local angle and the fan-data facts, ready for a promoter.

## Outreach
- A real email send through Resend (needs the account) with reply threading; follow-up reminders.
- Offer comparison: line up several venue offers side by side with the money verdict.

## MCP and agents
- Publish `@tourbo/mcp` to npm, with a Claude Desktop config in the README.
- More MCP prompts (for example "plan my spring run", "prep tonight").
- ChatGPT and Gemini setup checks on `/connect` as their MCP support matures.

## Design and quality
- Bring every surface from ≥ 4.0 toward 4.5 on the Impeccable critique (Ideas tab, `/ideas`, `/connect`, home).
- Home card: size it to the tallest example; smoother rapid Next clicks.
- Throttled-CPU home performance: fewer long tasks at startup.
- Tone guard: tighten the copy critic so AI text never embellishes ("comes home to Capitol Hill").
- A narrated ~2 min demo video (the raw footage exists).

## Dev tooling
- `mock/`: record real responses on demand into a local fixture set (never committed) to speed up offline dev; real `/v2/audiences` and compare shapes once quota returns.
