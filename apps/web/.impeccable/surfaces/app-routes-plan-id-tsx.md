---
version: 1
slug: "app-routes-plan-id-tsx"
primary_target: "app/routes/plan.$id.tsx"
related_targets: ["app/components/plan-workspace.tsx","app/routes/plan.$id._index.tsx","app/routes/plan.$id.ideas.tsx","app/routes/plan.$id.set.tsx","app/routes/plan.$id.prep.tsx","app/routes/plan.$id.insights.tsx","app/routes/plan.$id.pipeline.tsx","app/routes/plan.$id.live.tsx"]
---

# Tour workspace — surface brief

Mode: **Operate**. Target `app/routes/plan.$id.tsx` (layout) with its tabs and `components/plan-workspace.tsx`. Grounded in PLAN Q12, Q19–Q21, STORIES 1, 2, 24–27 and the app review (`.impeccable/review/app-review.md`).

## Job and audience
Laptop: shape a tour on the map (swap city, room, date; see money and route change), then per night pick ideas, build the set, write notes, book. Phone on the road: tonight's set, three ideas, the room. Judges: see in one viewport that every suggestion is a fan-data relation.

## Outcome and proof
Primary task: pick a night and act on it. The map and the nights are the first viewport, not KPI tiles. Every idea, room and city shows its fan-data chip inline; money is one labelled estimate; detail behind "why?".

## Selected direction: "the tour book, open on the map"
- **Frame (desktop ≥1024):** compact tour header (serif act name, one meta line: dates · nights · from Chicago · ~$29k profit est. with "why?", status, one primary, Tune, More) → tour tabs → three columns: **nights rail** (15 rem: numbered nights with date, city, room, ramp tick, money) · **main pane** (the active tab) · **night panel** (24 rem, the selected night). Map lives in the main pane on Plan and as a 160 px mini-map at the top of the rail on every other tab, so the place never leaves the screen.
- **Tour tabs:** Plan · Ideas · Set · Notes · Booking, then More (Numbers, Tickets, Compare). On the road, Tickets takes Booking's slot. Numbers keeps its question-titled charts but drops the KPI tiles the header already shows; its fan bars use the ramp, never flat tomato. Counts as quiet badges ("12", "4/4"); tabs with nothing yet stay visible but say what they'll hold. Active tab in the URL, `?night=` kept across tabs.
- **Tabs used smartly:** the night panel's tabs (Room · Ideas · Set · Notes) follow the tour tab (Ideas tab → panel opens on Ideas). Main pane = across the tour (idea × city grid, all sets, all notes); panel = this night. Picking a night never resets the tab.
- **Steering:** "Tune" (levers: local flavour, safe/bold, fee floor, max drive, recent/classic) is a popover from the header with inline diff + Undo. "Ask Tourbo" is a composer docked at the bottom of the night panel with decision chips above it, opening into a taller chat; proposals arrive as cards with Apply / Discard. Adjust-and-re-plan moves under More → "Re-plan with new settings".
- **One voice:** the single tomato element is the header's next-step button ("Write show notes" → "Send booking emails" → on the road "Open tonight's set"). Night numbers are ink circles; selection is the tomato ring; "best bet" becomes an outline badge; idea-card city pills go neutral; fan bars stay on the ramp.
- **Signature moment:** choosing a night (rail or map) flies the map to it and slides the panel in already showing that city's top idea with its evidence chip; the route line is drawn in ramp colour through the numbered markers, matching the rail ticks and the home globe.

## States and ranges
1–20 nights. Planning: rail shows nights as they resolve, main shows the progress steps (plain words), panel waits. Partial fan data: one inline line + Try again in the tab, never per card. Failed / interrupted: one sentence + Resume. Map tiles failing: rail and panel still work; map pane says "Map didn't load. Try again." Read-only share link: no edit controls, a quiet "Shared plan" label.

## Phone (390)
Compact header (act name, meta, primary). Tour tabs scroll with More pinned; no clipped labels. Map is a 30 vh strip that expands on tap. Nights list below; a night opens as a full-height sheet with Room · Ideas · Set · Notes and the Ask composer at its foot. While on the road (show date today or tomorrow) the tour opens on **Tonight**: city, room address and doors, set in order, opening line, three ideas with chips; everything else one tap away.

## Constraints and open decisions
shadcn base-nova on Base UI; MapLibre stays. Controls on the h-6…h-10 scale; tab bars h-8 (night panel h-7). No KPI tile row, no second primary, no serif below 18 px (small section heads use sans 13 px medium). Vendor-neutral. Needs the user's yes: KPI tiles → one header figure; Ask Tourbo as docked composer (not a tab); Booking in main tabs, Numbers/Tickets/Compare in More.

## Copy and leaks to fix with this surface
"Critic caught 2" → "Checked: 2 lines fixed"; "fan score 100" → "fans 100" chip with why?; "headline" chip → "Headline set"; "best bet" → outline "Strongest"; "Hold / Passed" → "Holding the date / Said no"; "How Tourbo decided · 250 steps" → "How Tourbo decided"; hide the email test-mode address outside dev; remove test names ("Story test spring tour", "Fakeband") from demo data; "Data provider limit reached" → "Fan data is paused for now. Saved work still opens."

## Notes tab
One night at a time (the selected night), opening line and set first, the other sections collapsed under their titles; rehearsal results as a compact tally with details on tap. Never the four-night wall.

## Decisions (2026-10-30, decided under user's delegated authority)
All 7 open decisions approved: dark ink top bar; labels Tours · Shows · Library (items named by act); Projects retired as a section (notes/to-dos fold into tours/shows, old /projects links redirect); New tour opens as a popover (full-page map kept for custom areas); tour header shows one profit figure; Ask Tourbo docks at the bottom of the night panel; main tour tabs Plan · Ideas · Set · Notes · Booking, with Numbers · Tickets · Compare under More.
Analytics stay a mouse's end away: the header profit figure opens a popover breakdown (the old 4 tiles + a mini chart) on hover/click; every fan-data number has a "why?" popover; Numbers is one click from the figure. Evidence chips stay inline on ideas and nights.

## Tab map
Five main tabs plus More (three rarely used views). Each block lives in ONE place; other tabs show at most a small linked summary. The night panel (Room · Ideas · Set · Notes) is the per-night view of the same tabs and follows the tour tab.

| Block (old pages) | Home | Elsewhere (linked summary only) |
|---|---|---|
| Summary tiles (profit, sales, costs, travel) | Header profit figure → popover (tiles + profit-by-night chart) | "All the numbers" link → Numbers |
| Map, route, nights, add/drop/reorder/swap | Plan (map in main pane, nights rail) | Mini-map over the rail on every other tab |
| Venue, capacity, opener, angle, fan chip | Plan → night panel Room | Tonight (room + address) |
| Night money and deal (profit, price, tickets) | Night panel Room (one line + "why?") | Booking uses it for offers |
| Levers | Header "Tune" popover | — |
| Re-plan with new settings | Header More menu | — |
| Ask Tourbo chat + Tourbo's questions | Docked at the night panel's foot | — |
| How Tourbo decided (trace) | Plan, folded under the map | — |
| Covers, topics, subjects, idea × city grid | Ideas | Night panel Ideas (top ideas + chips); Tonight (top 3) |
| Set builder, running order | Set | Night panel Set; Tonight |
| Show notes + rehearsal | Notes (one night at a time, sections folded) | Night panel Notes; Tonight (opening line + folded rest) |
| Venue emails, offers, replies | Booking | Tab badge ("4 to send") |
| Fan, money, travel, audience charts | More → Numbers | Header popover chart |
| Ticket check-ins and pace | More → Tickets (on the road: main tab, Booking moves to More) | — |
| With vs without fan data | More → Compare (only when a baseline exists) | — |
| Show day (one night on a phone) | Tonight: first tab while on the road | "Show day" link in the night panel header otherwise |

## Tabs by kind
Data, not branches: `WORKSPACES` / `workspaceFor(kind)` in `packages/core/src/disciplines/index.ts` (each Discipline record holds its `workspace`). Two tiers: **shared tabs** (Plan · Ideas · Set · Notes · Booking, More: Numbers · Tickets · Compare) with a kind-tuned name and interior, and **kind tabs** (Covers · Openers · Crowd · Tone · Sales · Sessions · Pitches, `components/kind-tabs/`, one route module `plan.$id.kind.tsx`) that exist only for the kinds listed and open only when the plan or saved ideas hold something for them (`tabHasData`); otherwise they're hidden, never empty. Labels are one plain word. Tonight is added in front on the road; the kind's road tab takes Booking's slot. Night panel: Room · Ideas · Set · Notes, renamed per kind. "—" = hidden.

| Kind | Per tour / per night it needs | Main row | More | Set tab → heading (interior) | Tickets | Booking | Room (night) | Support act | Library item · types | Show form dates · venue |
|---|---|---|---|---|---|---|---|---|---|---|
| musician | Cities with fans, a room, a cover per city, a local opener, setlist | Plan · Ideas · **Covers** · Set · Notes · Booking | **Openers** · Numbers · Tickets · Compare | Set → Setlist (songs in order) | Tickets | Booking | Room | opener | song · Song, Other | First/Last day · Venue |
| comedian | Clubs, local premises, crowd-work, what not to say | Plan · Ideas · **Crowd** · Set · Notes · Booking | **Tone** · Numbers · Tickets · Compare | Set → Set (bits) | Tickets | Booking | Room | opener | bit · Bit, Other | First/Last day · Venue |
| dj | Clubs, local warm-up DJ, tracks the city plays | Plan · Ideas · Set · Notes · Booking | **Openers** · Numbers · Tickets · Compare | Set → Setlist | Tickets | Booking | Room | warm-up DJ | track · Track, Other | First/Last day · Venue |
| dancer | Theatres/studios, 2-night run, workshops | default | **Sessions** · Numbers · Tickets · Compare | Programme → Running order | Tickets | Booking | Room | co-bill | piece · Piece, Solo, Other | Opening/Closing night · Venue |
| poet | Bookshops/cafés, reading order, book sales | default | Numbers · Tickets · Compare | Set → Running order | Tickets | Booking | Room | local poet | poem · Poem, Other | First/Last day · Venue |
| visual_artist | Galleries for ~2 weeks, pieces hung, visitors and sales | Plan · Ideas · Hang · Notes · Booking | **Sales** · Numbers · Compare | Hang → Hang list (wall order) | — (entry often free) | Booking | Space | — | piece · Piece, Other | Opening/Closing day · Space |
| author | Bookshops/libraries, reading + Q&A, book sales | default | Numbers · Tickets · Compare | Reading → Running order | Tickets | Booking | Room | in-conversation host | reading · Reading, Excerpt, Other | First/Last day · Venue |
| podcaster | Theatres, live rundown, local guest, crowd | default | **Crowd** · **Tone** · Numbers · Tickets · Compare | Rundown → Rundown | Tickets | Booking | Room | local guest | segment · Segment, Bit, Other | First/Last day · Venue |
| speaker | Halls/hotels, talk outline, Q&A, sensitivities | default | **Crowd** · **Tone** · Numbers · Tickets · Compare | Talk → Running order | Tickets | Booking | Room | local host | talk · Talk, Other | First/Last day · Venue |
| magician | Theatres/lounges, tricks in order, volunteers | default | **Crowd** · Numbers · Tickets · Compare | Set → Set | Tickets | Booking | Room | opener | trick · Trick, Other | First/Last day · Venue |
| theatre | 3-night run, scenes, audience suggestions | default | **Crowd** · Numbers · Tickets · Compare | Programme → Running order | Tickets | Booking | Room | local improv team | scene · Scene, Other | Opening/Closing night · Venue |
| photographer | Galleries ~1 week, prints hung, print sales, workshops | Plan · Ideas · Hang · Notes · Booking | **Sales** · Numbers · Compare | Hang → Hang list | — | Booking | Space | — | print · Print, Other | Opening/Closing day · Space |
| maker | Weekend pop-up/market, stall, workshops | default (Set = Stall) | **Sessions** · **Sales** · Numbers · Compare | Stall → On the stall | — | Booking | Space | — | piece · Piece, Other | First/Last day · Space |
| busker | Pitches in squares/streets, permits, hat per pitch | Plan · Ideas · **Pitches** · Set · Notes | **Crowd** · Permits · Numbers · Compare | Set → Setlist | — (no tickets) | Permits (pitch permits) | Pitch | — | song · Song, Act, Other | First/Last day · Pitch |
| circus | 3-night run, acts in order, workshops | default | **Sessions** · Numbers · Tickets · Compare | Programme → Running order | Tickets | Booking | Room | co-bill | routine · Act, Other | Opening/Closing night · Venue |
| chef | Supper clubs, 2 seatings, menu, cooking class | default (Set = Menu) | **Sessions** · Numbers · Seats · Compare | Menu → Menu (courses) | Seats | Booking | Room | — (the chef is the guest) | dish · Dish, Other | First/Last seating · Kitchen |
| filmmaker | Cinemas, screening + Q&A | default | Numbers · Tickets · Compare | Programme → Programme | Tickets | Booking | Room | Q&A host | film · Film, Q&A, Other | First/Last day · Venue |
| teacher | Studios, sessions × seats, class plan | Plan · Ideas · Class · **Sessions** · Notes · Booking | Numbers · Compare | Class → Class plan | — (Sessions holds seats) | Booking | Studio | — | lesson · Lesson, Exercise, Other | First/Last class · Studio |

"default" = Plan · Ideas · Set · Notes · Booking (Set renamed as the column says).

**Kind tabs: built** (each from fan data or the engine's own output, one shared anatomy: title + one line, then the tour's nights as numbered rows, the picked night ringed):
- **Covers** (musician): per night the top pick ranked by over-index (how far above your fans elsewhere this city's fans rank the artist), chip "#3 here · #14 elsewhere" with the lift bar scaled to the tour's strongest, "Lands hardest here / harder in X", a your-way line from real tags (artist genre, your style), one "Add to <city>'s set" (keeps it in the Library, appends to the night's show set), 2 next-best. Ideas links here instead of repeating it.
- **Openers** (musician, dj): the picked local act with its fan-data chip, plus up to 3 local alternates. Opens when the plan has openers or local acts.
- **Crowd** (comedian, podcaster, speaker, magician, theatre, busker): crowd-work questions hung on what the city ranks high, with the ref and why?. Opens once saved ideas hold questions.
- **Tone** (comedian, podcaster, speaker): Loose / Careful / Clean per place from local data, topics to leave out, crowd age skew, why? with the points. Opens when the plan has place tone.
- **Sales** (visual_artist, photographer, maker): visitors over the stay, entry, take, left after costs; tour total in the corner. Opens when a stop is an exhibition or commission.
- **Sessions** (teacher, maker, dancer, circus, chef): seats filled of capacity, % full bar, seat fee, left after costs. Opens when a stop is booked as a class.
- **Pitches** (busker): the spot and address, people who stop over N pitches, hat and merch, transit stops close by, date risk; link to Permits.

**Set interiors (built, `components/kind-tabs/set-shape.tsx`, on the show's set):** from the act's own Library details (`material.details`, optional; fields per kind = `workspace.fields`):
- setlist (musician, dj, busker): key and bpm chips per song; an energy curve (1–5) across the set with one plain caption ("peaks at #2, ends near the top").
- bits (comedian, magician): opener / callback / closer chips; a crowd-work slot after the opener (crowdWork kinds); one line on the shape ("Your closer isn't last.").
- hang / stall (painter, photographer, maker): the wall (or table) as a numbered grid with size and price; "3 priced, 1,350 if all sell".
- menu (chef): the menu card by course (snack → drink); dishes without a course listed last.
- class (teacher): a timeline bar by part (warm-up, teach, practice, cool-down, neutral steps, not the fan ramp) and start times per segment; order kinds (dance, theatre, talks, readings) get start times.
Shows for classes (teacher, maker, dancer, circus, chef) take sessions and seats (`events.classes`; chef: Seatings). Tickets copy follows the tab name (Seats for chef).

**Proposed, not built:** the same interiors on the tour-wide Set tab (`plan.$id.set.tsx`, built sets carry only title and minutes) and the night panel's Set; details in the new-show form (`new.tsx`, Q21 builder); busker permit email templates.
