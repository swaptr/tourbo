---
version: 1
slug: "app-routes-projects-tsx"
primary_target: "app/routes/projects.tsx"
related_targets: ["app/routes/work.tsx","app/routes/material.tsx","app/routes/new.tsx","app/routes/start.tsx","app/routes/events.$id.tsx","app/components/header.tsx","app/root.tsx"]
---

# Workspace, forms and Library (Q21) — surface brief

Mode: **Operate**. Replaces the quick pre-review draft (2026-10-30). Grounded in tests/stories/STORIES.md, PLAN Q9/Q12/Q16/Q19–Q21, PRODUCT.md, idea_final.md judging criteria, and the app review in `.impeccable/review/app-review.md`.

## Job and audience
Working artists (18 kinds, draw ~100–1,000), most not in the fan data. Laptop: plan tours and one-off shows, keep their songs/bits/pieces. Phone, on the road: open tonight's show, its set, three local ideas, the room. Judges meet it once, in a few minutes, after the home globe. Return use is weekly; trust must be instant.

## Outcome and proof
- One primary action per screen. Workspace: open or start a tour/show. Library: add or find a piece. Forms: create the thing.
- Proof stays inline: each row carries one fan-data or money figure (labelled estimate); numbers behind "why?".
- Success = Maya finishes story 1 from the screen alone, and on the road Rohan reaches tonight's set in one tap from launch.

## App flow (first visit → a night on the road)
1. `/` globe showcase → "Start" (the one primary).
2. `/start` profile, 3 short steps: What do you do (multi chips; the main one is marked by a visible "Main" toggle, not click order) · Your name (lookup; when the lookup can't run or finds nothing, say so in one line and open the three ways in: sounds like / style / just my city; Continue is never silently disabled) · Home base (a searchable city field that accepts any town, not a fixed dropdown; story 11). "Skip for now" always visible → workspace. One name for skipping everywhere: "Skip for now".
3. `/work` workspace, default section Tours. A visitor with no profile who opens /work, /new or a shared link is never walled by onboarding: /work shows the empty state with "Finish your profile" as a quiet line; only New tour / New show gate. Empty: one sentence, "Plan your first tour" (primary) + "Try an example" (opens a landing example read-only).
4. New tour / New show. Missing required fields (tour: name + home base; show: name + city) re-open onboarding with only those steps, prefilled, one "why" line, then continue straight into the form (PLAN Q21, user-confirmed; do not inline into the form).
5. Plan runs with visible progress → tour workspace `/plan/:id` (see the tour brief).
6. On the road: when anything is on the road, the workspace pins a **Tonight** strip above the list (city, room, doors, "Open set"); on phone it is the first thing on screen. A night opens as its show page with Set · Ideas · Notes · Room.

## Shell and navigation (decided, replaces the left-rail draft; user constraints 2026-10-30)
- **App bar** (not sticky): wordmark · (spacer) · act chip (menu: Your act, Help, For venues, Use with your AI, theme). Ink band (DESIGN `ink` in paper mode, `ink-card` in dark) if the user says yes; otherwise paper with a hairline. No primary in the bar.
- **Section nav = horizontal tabs** Tours · Shows · Library (labels from the vocabulary table; today's code says Tours · Events · Material), directly under the app bar, **sticky at the top** while scrolling, h-8 tab height, active = ink text + 2 px tomato underline. On narrow screens the tab row may scroll horizontally (no clipping, fade edge, active tab scrolled into view). Same row on phone; no bottom tab bar. A **Tonight** tab appears first only while something is on the road.
- **FilterBar sticky right under the section tabs** (same paper ground + hairline, so the two read as one sticky block, total ≤ 96 px desktop, ≤ 88 px at 390).
- `/` uses the same ink app bar as the app (decided 2026-10-31 for one consistent shell; Help, For venues and Connect live in the "Your act" menu on every page). The globe hero below it stays the Persuade surface.
- Rejected: left rail (adds a fourth column beside nights · map · panel at 1440; three sections don't earn a rail); bottom tab bar (replaced by the sticky tab row); command-first shell (too hidden for first-timers).

## Shared components (one implementation, used by Tours, Shows and Library)
- **FilterBar**: search (flex) · Filter ▾ (popover of grouped options, active-count badge, Clear) · Sort ▾ (field + direction) · NewMenu · page ⋯. One line, never scrolls sideways; at 390 Filter/Sort collapse to icon buttons with the count. Props: query state (URL-held), filter groups, sort options, new items, page actions. Keys `/` search, `N` new.
- **NewMenu**: a dropdown (Tour / Show / Song… by section; single-item sections skip the dropdown) whose item opens a **popover form** anchored to the button (400–440 px; bottom sheet at 390). Enter submits, Esc closes, focus returns, the new row flashes in its group. The empty state's button opens the same popover.
- **RowActions**: the ⋯ menu on every row (open, rename, duplicate, archive/restore, delete with Undo; Library adds "Add to a show's set", "Edit"); `.` opens it from the keyboard; also the bulk menu when rows are multi-selected.
- Also shared: ListGroup (group heading + collapsible Past), ListRow (the row anatomy below), ListEmpty / ListSkeleton / ListError.

## One action, one name
"Plan a tour" everywhere (home hero, header, /help, empty state, More menu → /new). "Add a show" for events. Dates read "Mon 1 Mar" (locale), never ISO.

## Lists: one anatomy for Tours, Shows and Library (binding, user 2026-10-30)
- **Page body = the user's items only.** Title (serif 30 px) + one count line ("4 tours · 1 on the road"), the toolbar, the grouped list. No form cards, no explainer paragraphs, no sub-tab rows on the page; sections are switched by the sticky section tabs above, never by extra page-level tab rows.
- **Toolbar = FilterBar** (shared, sticky under the section tabs): search · Filter ▾ (count; status, kind, region, when, origin) · Sort ▾ · NewMenu · ⋯ (page actions: show past, export / import, select). All h-8; one line at every width.
- **Groups:** Tours and Shows by time: On the road · Next up · Drafts · Past (collapsed at the bottom, auto by end date, restorable). Library by origin: Yours · Covers · Local nods.
- **Row anatomy (programme listing):** left date column (serif tabular day + month; Library: length in minutes in the same slot) · title (sans 15 px medium) + one meta line (route "Chicago → Columbus → +2", or venue, or tags) · a 4-step fan-ramp strip (one tick per night; Library: shows it's in) · status pill · one figure right-aligned (profit estimate / nights / uses) · ⋯ row menu (open, rename, duplicate, archive/restore, delete with Undo; Library: add to a show's set, edit). 56 px rows desktop, 64 px phone, hairline rules, no card wall, no KPI tiles, one tomato on the page (New).
- **Add / New = NewMenu popover, never inline.** New ▾ (and the empty state's button) opens a popover anchored to it, 400–440 px, full-width bottom sheet at 390. One per entity: New tour, Add a show, Add a song (noun by kind). Enter submits, Esc closes, focus returns to New, the new row flashes in its group.
- **Power in the details:** "Paste a list" tab inside the Add-a-song popover (one per line → many items, type and origin defaulted from the act's kind); Shift-click multi-select with a ⋯ bulk menu (add to a show's set, archive, delete); drag rows into a set on the show page; keys `/` search, `N` new, `J/K` move, `Enter` open, `.` row menu, `Backspace` archive with Undo toast.
- Library noun adapts by kind ("Add a song" / "Add a bit" / "Add a piece"); nav word stays "Library".

## Forms
- Pattern for all: labels above, one hint line max, optional fields marked "(optional)", validation on blur with one plain sentence, focus to first error, primary button names the outcome.
- **Profile** (`/start`, a page): one question per screen, ≤3, "1 of 3", Back + Continue, "Skip for now". Re-entry shows only missing steps with "Tourbo needs your home base to plan the route."
- **New tour** (popover from New): What sort of show (kind chips, main pre-picked, "Something else") · Near (city field, any town; radius chips 100 / 300 / 600 / 1,000 km with a small map preview) · First date + nights stepper (2–12) · Room size (4 chips) · collapsed "Money and what Tourbo does" (promo budget, lowest fee, jobs on by default). Primary "Plan this tour". "Draw it on the map" opens the full-page `/new` map step for custom circles; the 3-step wizard page survives only as that advanced path.
- **Add a show** (popover): kind chips · City · Date (one date; "Runs more than one day" reveals end date) · Venue segmented: "Help me pick" (default, fills later) / "Suggested" (list with fit + money) / "My own" (name + optional address) · Name auto-filled, editable. Primary "Save show".
- **Add a song / bit / piece** (popover): Title · Length (min) · Origin segmented Yours / Cover / Local nod; type defaults from kind; Tags and Notes under "More details". Tab "Paste a list".
- **Set** (show page, Set tab): ordered list from the Library, drag handle + up/down buttons; "Add from Library" picker popover with search; "Paste" creates Library items and adds them; total length vs slot; "Order for this city" (Tourbo) gives a reason per move with a fan-data chip; local nods capped by the flavour setting. The tour's Set tab uses the same list, not a separate textarea.

## States
0–50 tours/shows, 0–300 Library items. Loading: skeleton rows in the row anatomy. Empty: one sentence + one primary. Failed: one sentence + Try again. Limits: the single page notice. Filter with no results: "Nothing matches" + Clear filters.

## Vocabulary (one label per concept; kind-aware nouns where marked)
| Concept | Label | Alternatives | Notes |
|---|---|---|---|
| Tours (nav) | Tours | — | keep |
| Events (nav) | Shows | Dates, Gigs | covers gigs, gallery shows, talks; "Gigs" is music-only |
| Material (nav) | Library | Repertoire, kind word ("Songs") | stable nav word; items adapt: songs · bits · pieces · talks · tracks · routines |
| Set | Set | — | kind-aware heading: Setlist (music) · Set (comedy) · Running order (talks, dance, theatre) · Hang list (exhibitions) |
| Night (one stop of a tour) | Night | Stop, Date | "Stop" for multi-day stays (exhibitions, residencies) |
| Profile | Your act | Profile, You | act chip shows the act's name |
| Ideas | Ideas | Local ideas | keep |
| Prep / Show notes | Notes | Prep, Show notes | per night |
| Insights | Numbers | Stats, Insights | question-titled charts |
| Venue emails / Pipeline | Booking | Emails | booking steps: Drafted · Sent · Replied · Holding the date · Booked · Said no |
| Ticket sales | Tickets | Sales | |
| With vs without fan data | Compare | — | page title keeps the long form |
| More | More | — | one per screen |
| Archived | Past | Archive | auto by end date |
| Drafts | Drafts | — | plus On the road · Next up |
| Origins | Yours · Cover · Local nod | Original · Cover · Local idea | Local nod says "seasoning" |
| Idea actions | Keep · Skip · More like this | Save · Not for me | |
| Levers | Tune | Adjust | |
| Chat | Ask Tourbo | — | |
| Plan action | Plan a tour | — | everywhere (was Plan my tour / Plan a run / Start) |
| Notebook / Projects | (retired) | Notes | a tour's notes and to-dos |
| Jargon to drop | "Critic", "fan score", "headline" chip, "best bet", "Jobs", "Find markets", "Act type", "Data provider limit", "250 steps", ISO dates | | see the tour brief for replacements |

## Constraints and open decisions
Reuse shadcn base-nova on Base UI (popover, dropdown-menu, toggle-group, sheet for 390 bottom sheets; native date inputs, no calendar dependency). Fix while building: 11 px text on prep and charts (DESIGN ramp floor 12 px), serif below 18 px (use Geist label), hard-coded amber/emerald/indigo/red classes in plan.$id.prep.tsx and plan.$id.set.tsx → tokens. Control heights xs h-6 / sm h-7 / default h-8 / lg h-9 / xl h-10. No new fonts or colours: the ink band uses existing `ink` tokens. Vendor-neutral. Owner keys only, no auth. Needs the user's yes: ink app bar; "Shows" and "Library" labels (tabs keep today's Events / Material until then); retiring Projects (fold notebooks into a tour's ⋯ → Notes); New tour as a popover with the map page as the advanced path.

## Visual world: keep and refine (the brief wins)
The paper/ink + Instrument Serif + tomato world is user-confirmed (PLAN Q7, PRODUCT.md). Keep it; to reach Design 4.5–5:
1. Commit colour in the shell: the ink app bar (and tour header band) so the app reads as a product, not a page of paper.
2. One signature move everywhere fans appear: the straw→oxblood ramp on the map route line, rail ticks, list strips, Numbers bars; tomato never used for fan or money meters.
3. One tomato per screen; selection = tomato ring only; badges outline.
4. Programme-listing rows (serif tabular date column) in all three lists.
5. Serif only ≥18 px; small heads in Geist 13 px medium; 12 px floor.
6. Peak-end: the Tonight view is the finest screen in the app.

## Alternatives considered (concept seed 72320372, operate)
Lead: grouped programme list (recommended, Impeccable's pick). Dealt alternates: map-led home (all tours as pins, list in a side panel; declined: the body must be the list only, map lives in the tour); command-first (one "Plan a tour near Chicago in March" bar; declined: hidden for first-timers, kept `/` and `N` keys); season timeline (tours as bars across months; declined for now: strong for 10+ items, empty for most users; kept the date column). Shell alternates: left rail (draft; declined, see above).

## Build order (deadline 2026-10-30 23:45 EDT)
P0: tour frame + one night-tab row + Ask composer + header figure (tour brief) · copy/leak fixes · app bar nav Tours · Shows · Library, Projects out of nav.
P1: Tonight view + Notes one night · Tours/Shows/Library one list anatomy with popover add and the one-line toolbar · home-base any-city field + name-step message · one-tomato and ramp fixes, 11 px and small-serif fixes, token colours.
P2: New tour popover (map page as advanced) · Set from Library with drag · keyboard map · /help rewrite to the new nouns · /explore checkboxes, /connect default tab and 390 overflow, `/` 390 overflow.

## Decisions (2026-10-30, decided under user's delegated authority)
All 7 open decisions approved: dark ink top bar; labels Tours · Shows · Library (items named by act); Projects retired as a section (notes/to-dos fold into tours/shows, old /projects links redirect); New tour opens as a popover (full-page map kept for custom areas); tour header shows one profit figure; Ask Tourbo docks at the bottom of the night panel; main tour tabs Plan · Ideas · Set · Notes · Booking, with Numbers · Tickets · Compare under More.
Analytics stay a mouse's end away: the header profit figure opens a popover breakdown (the old 4 tiles + a mini chart) on hover/click; every fan-data number has a "why?" popover; Numbers is one click from the figure. Evidence chips stay inline on ideas and nights.

## Refinement (user, 2026-10-30)
- Each section has its own title: "Your tours", "Your shows", "Your library" (never a shared "Your work").
- Similar, not identical: shared skeleton (sticky tabs, FilterBar, row anatomy, states), page-specific elements, filters and sorts. Tours: nights, route strip, profit, on-the-road progress. Shows: ticket-stub date chip, venue, city, status, month grouping / calendar toggle. Library: type filter, origin badge, length, "used in N sets", add to set, paste-a-list import.
- Tone: a real product, not a serious enterprise SaaS. Playful and warm, from the existing bright, fun palette; personality in the details (empty-state lines, kind icons, ticket-stub chips, hovers), still calm and legible.

## AI assists (user, 2026-10-30)
"Don't make it a boring application where the user has to do everything … fan data the star, smart insights, really good UI/UX, professional." The AI does the chores; fan data supplies the facts. Each assist is one ✦ button or an automatic suggestion, shows as an editable draft (never applied silently), cites its fan-data evidence, and is cached per input. When the AI is off or limited, a plain fallback stays usable.
- Library: paste anything (a setlist, notes) and get it parsed into items with type, length and origin; auto-tags (mood, tempo/energy, topic).
- Tours/Shows: auto title ("Texas spring run"); "Help me pick" venue; one-line smart insight per row (e.g. "Austin fans over-index 3.1× on your style"), from fan data.
- Sets: "Build my set" orders Library items for that night's city and slot length, with local nods from that city's fan data, originals first.
- Profile: suggest kinds and home base from the act lookup.
