# Design checkpoints

Short dated checks against `PRODUCT.md`, the surface briefs in `.impeccable/surfaces/` and the baseline `app-review.md` (/40 scores converted to /5 as score ÷ 8).

## 2026-10-30 — checkpoint 1

Method: single-context critique (degraded: no isolated sub-agents for a checkpoint; visual review was finished before the detector ran). Evidence: Playwright at 1440×900 and 390×844, light and dark, for `/`, `/start`, `/work` (Tours), `/work?show=events` (Shows), `/material` (Library), `/plan/32e2510c…` (Plan, Ideas, Covers, Set, Notes, Booking, Numbers, Tonight, night panel) and `/help`; shots in `/tmp/tourbo-ckpt/` (not committed). The fan-data limit notice was showing, as expected. Partway through, the dev server briefly threw a Vite parse error in `app/routes/new.tsx` (another agent was mid-edit); those pages were captured again once it compiled cleanly. Lists were judged from their empty and loading states only: there was no owner key, so no populated rows could be seen.

### Scores (/5, delta vs baseline)
| Surface | Now | Baseline | Δ |
|---|---|---|---|
| Home `/` | 4.0 | 3.9 (31/40) | +0.1 |
| `/start` | 3.8 | 3.3 (26) | +0.5 |
| Workspace lists (Tours · Shows · Library) | 3.4 | 2.8 (projects 21 · material 22 · new event 24) | +0.6 |
| Tour page (header, rail · main · night panel, tabs) | 3.4 | 2.9 (workspace 24 · sub-tabs 23) | +0.5 |
| Ideas + kind tabs (Covers) | 3.2 | 3.6 (ideas tab 29) | −0.4 |
| `/help` | 3.8 | 2.8 (22) | +1.0 |
| Whole app | 3.4 | 2.6 (21/40) | +0.8 |

Fixed since the baseline: the ink app bar, sticky Tours · Shows · Library tabs and the shared FilterBar/NewMenu; Projects now redirects; there is a single header profit figure (no KPI tiles); Tune is in the header; the rail · main · panel frame is in place and the panel follows the tour tab; Ask Tourbo is docked; the Tonight view on the phone has a ticket-stub date; "Fan data is paused for now." replaces the old limit wording. The checks found no text under 12 px, no serif under 18 px, no horizontal overflow at 390, no hard-coded amber/emerald classes and no vendor names. `/help` uses the new nouns and "Plan a tour". The home base field accepts any town, and re-entering `/start` shows only the missing step.

### Top 5 issues
1. **P1 The map can't be trusted.** At 1440 light the main Plan map rendered with no tiles and no markers after 5 s. In dark mode it stays a bright paper map. The 160 px mini-map over the rail zooms out to the whole world (Africa/Atlantic), with every marker stacked on the Midwest. Likely cause: the fixed padding in `fitBounds` is larger than the mini-map can hold. Files: `app/components/workspace-map.tsx:228`, `app/components/tour-map.tsx`. Owner: **tour page**.
2. **P1 First-time visitors are walled off.** `/work` with no profile and no work redirects to `/start` (`app/routes/work.tsx:181`). The brief says /work is never walled and should show the empty state plus a quiet "Finish your profile" line. When a profile exists, the nudge is a full-width banner, and on Shows it talks about planning a tour. Owner: **workspace**.
3. **P1 Covers repeats Ideas.** The musician's Covers tab lists the same covers as Ideas and the night panel's Ideas, which breaks the Tab map rule that each block has one home. The template copy reads badly: "Take their usa into your Dream Pop style", "old school thrash metal into your Dream Pop style". Files: `app/components/kind-tabs/covers.tsx`, `packages/core/src/disciplines/index.ts:250` (musician `main`). Owner: **kind-tabs**.
4. **P2 More than one tomato, and fan meters in tomato.** The Ideas tab shows the "Write promo lines" primary, the "A touch" toggle and solid tomato grid squares together. The empty Tours list shows two tomato buttons (New + Plan a tour). The night panel's "100% full" and "fans 100" meters and the map's route line are flat tomato rather than the ramp. Files: `app/routes/plan.$id.ideas.tsx`, `app/components/city-card.tsx`, `app/components/workspace-map.tsx`, `app/routes/work.tsx` (empty state). Owners: **tour page** (meters, route, Ideas tab) and **workspace** (empty Tours list).
5. **P2 Copy and behaviour still off-brief.** Booking columns say Interested/Hold/Passed instead of Replied/Holding the date/Said no (`app/routes/plan.$id.pipeline.tsx:30-37`). The Numbers tab's page is titled "Insights" (`app/routes/plan.$id.insights.tsx`). The slot picker says "headline · 60 min" (`packages/core/src/context/slots.ts:29`). Set is still a paste textarea, not a list built from the Library, and offers three "Build my set" buttons (`app/routes/plan.$id.set.tsx`). Notes appears in full in both the main pane and the panel. Owner: **tour page**.

### Drift from the briefs
- The briefs have no `## Tabs by kind` section, even though `packages/core/src/disciplines/index.ts:123` cites one as its spec. Per-kind tabs have shipped without a written brief: add one, or re-point the comment.
- Tab map: Covers duplicates Ideas (issue 3). The panel's Notes repeats the whole main pane instead of a summary.
- App flow: /work redirects to onboarding (issue 2). `/start` says "The first one is your main thing" (click order), not the visible "Main" toggle the brief asks for.
- List anatomy: the explainer subtitle ("Runs of nights, planned around your fans.") replaces the count line. The Library empty state has no action, though the brief asks for one sentence + one primary. The fan-data notice spans 96–1344 px while the content column is 224–1216 px.
- One voice / ramp (issue 4). Vocabulary: Hold/Passed/Interested, "Insights", "headline".
- AI assists: ✦ buttons are present (Name this tour, Build my set, Write promo lines, Rewrite). The per-row smart insight and paste-a-list import were not checked: the lists were empty.

### Detector
`impeccable detect --json app`: exit 0, 11 advisory findings (baseline 18). There are 9 `design-system-font-size`: `app.css:301,406,508,529,663`, `components/kind-tabs/set-shape.tsx:117` (an 11 px literal, new), and the 0.8rem size in `ui/button.tsx:25`, `ui/input.tsx:14` and `ui/toggle.tsx:17`. There are 2 `design-system-radius` (`app.css:404,518`). No slop or contrast rules fired.

### Direction
On course. The frame and shell set out in both briefs now exist. What remains is fidelity: a reliable map, one tomato per screen with the ramp for fan meters, kind tabs that add a view instead of repeating Ideas, and an open door for first-time visitors.

## 2026-10-30 — checkpoint 2

Method: single-context critique (degraded: a sequential checkpoint run, no isolated sub-agents). The visual review was finished before the detector ran. Evidence: Playwright at 1440×900 and 390×844, light and dark, with the demo act "Juniper Lane" (profile and owner key in `tourbo:profile`, its work in `tourbo:work`). Pages: `/`, `/start`, `/work`, `/work?show=events`, `/material`, `/events/c58b5c67…`, demo tour `/plan/bf687b05…` (Tonight, Plan, Plan with night 2, Ideas, Covers, Set, Notes, Booking, Numbers) and `/help`. Shots are in `/tmp/tourbo-ckpt2/shots/` (not committed). The fan-data pause notice showed, as expected. The dev server took 40–60 s to hydrate each page with two browsers running, so the `/start` shots are of the server-rendered first-run form; the returning-user path there was not judged.

### Scores (/5, delta vs checkpoint 1)
| Surface | Now | CP1 | Δ |
|---|---|---|---|
| Home `/` | 4.0 | 4.0 | 0 |
| `/start` | 3.8 | 3.8 | 0 |
| Workspace lists (Tours · Shows · Library) | 3.6 | 3.4 | +0.2 |
| Tour page (header, rail · main · night panel, tabs) | 3.8 | 3.4 | +0.4 |
| Ideas + kind tabs (Covers) | 3.3 | 3.2 | +0.1 |
| `/help` | 4.1 | 3.8 | +0.3 |
| Whole app | 3.7 | 3.4 | +0.3 |

Fixed since CP1:
- The main map now renders in both themes, with dark tiles in dark mode. The route and the rail ticks use the ramp.
- Booking columns read Drafted · Sent · Replied · Holding the date · Said no · Confirmed. The Numbers tab is titled "Numbers".
- Set is now built from the Library (search + Add per song). Notes shows one night at a time.
- On a phone the tour opens on Tonight (ticket-stub date, room, address, Directions).
- Covers is now its own view: lift rank chip, "Add to <city>'s set", next best.
- Shows rows use the ticket-stub date and are grouped by month. Library is grouped Yours · Covers and has a ✦ "Tag these" assist.
- Every page has one h1. No text is under 12 px, no serif is under 18 px, nothing overflows sideways at 390, and no vendor names show.

All five issues below are still open.

### Top 5 issues
1. **P1 The evidence copy contradicts itself and leaks jargon.**
   - The tour header says "Chicago fans over-index 8.2×; Columbus is the softest (37)". On the same screen, the night panel for Columbus says "Columbus is your strongest night, with fan strength at 37". That is a claim the facts don't support, which breaks "AI only writes on top of facts".
   - "over-index" and raw "(37)" sit in primary UI: the tour header and every Tours row.
   - Map labels read "Celeste ±0" and "Rumba Café ±0".
   - Files: `packages/core/src/assist/assist.ts:359-378`, `app/routes/plan.$id.tsx:336`, `app/routes/work.tsx:738`, night-panel summary via `app/components/why-line.tsx`.
   - Owner: **tour page**.
2. **P1 Ideas still repeats Covers and is mostly controls.**
   - Ideas, the panel's Ideas and Tonight's "Three ideas" all list the same covers (Caamp, Corrupt) that the Covers tab owns.
   - At 390, the first Ideas screen holds no ideas at all: it is a tomato "Write promo lines", the slot select, the flavour toggle, a budget line, Refresh and Tell Tourbo.
   - Copy leaks: "headline: Keep your set…" (lowercase slot id), then "Keep your set; add one or two of these." two lines later, and the template line "Take their old school thrash metal into your Dream Pop style". Covers says "Their wisconsin, played your Dream Pop way.": a place tag is being used as a genre.
   - Files: `app/routes/plan.$id.ideas.tsx:191-209,265`, `app/components/context-controls.tsx:121`, `packages/core/src/engine/ideas-rank.ts:222-223`, `app/components/kind-tabs/covers.tsx:15`.
   - Owner: **kind tabs** (copy) and **tour page** (Ideas layout).
3. **P1 List rows don't follow the brief's row anatomy.**
   - Rows sit in ringed card groups instead of on hairlines (`app/components/list/list.tsx:107`).
   - Tours lead with a kind icon rather than the serif date column, with no ramp strip. Rows are about 110 px tall (brief: 56).
   - At 390 the Tours row wraps the title to two lines, truncates the insight and drops the profit figure.
   - There is no Tonight strip even though a tour is on the road (day 3 of 7).
   - The explainer line still comes before the count (`app/routes/work.tsx:290`).
   - Library's toolbar has no ⋯ and sits 12 px higher than the Tours/Shows toolbar.
   - Owner: **workspace**.
4. **P2 The mini-map is unreliable.**
   - In light mode on Set and Notes it stayed blank (no tiles) after about 40 s.
   - When a night is picked it zooms to street level (Numbers: just the Chicago marker), so the tour's shape leaves the screen. That breaks the brief's "the place never leaves the screen".
   - Files: `app/components/workspace-map.tsx:267-269` (city zoom on `sel` for mini), `app/components/plan-workspace.tsx:320`.
   - Owner: **tour page**.
5. **P2 The tour header is too tall, and night-tab targets may be too small.**
   - The header has three meta lines: dates · nights · profit, then "Planned from your fans" (`packages/core/src/engine/basis.ts:29`), then the insight line. The brief asks for one.
   - At 390 the header plus tabs use about 270 px before any content.
   - The night-panel tabs (Room · Ideas · Set · Notes) were flagged under 24 px by the target scan (`app/components/plan-workspace.tsx:579`). The brief asks for h-7, and the UI standard for 24 px minimum. Measure and fix.
   - Owners: **tour page** (header) and **a11y** (targets).

### Drift from the briefs
- App flow / shell:
  - `/` now carries the ink app bar; the brief says marketing keeps its own light header.
  - No Tonight strip on `/work` while on the road.
  - The fan-data notice still spans 96–1344 px against a 224–1216 content column.
- List anatomy: the explainer subtitle is still there, rows are cards (not hairlines), Tours have no date column or ramp strip, and Library's FilterBar has no ⋯ (issue 3).
- Tab map:
  - Ideas still hosts covers (issue 2).
  - The night panel's Set empty state offers "Add to your Library", not "Add from Library".
  - `?night=` is kept between tabs as asked.
- One voice:
  - Ideas pairs the tomato "Write promo lines" with solid oxblood grid squares.
  - Notes shows a disabled tomato "Add" next to the header's "Open tonight".
  - The Set tab's primary is "Order every night", competing with "Build my set".
- Vocabulary: "headline:", "over-index", "±0" and "(37)" are in primary UI.
- Header: three meta lines instead of one (issue 5).

### Detector
`impeccable detect --json app`: exit 0, 10 advisory findings (CP1: 11):
- 8 × `design-system-font-size`: `app.css:312,433,535,556,690` and the 0.8rem in `ui/button.tsx:26`, `ui/input.tsx:14` and `ui/toggle.tsx:17`.
- 2 × `design-system-radius`: `app.css:431,545`.

The 11 px literal in `set-shape.tsx` is gone. No slop or contrast rules fired. The review and the detector agree that type and radius tokens are the only mechanical debt left. Every issue above is copy, IA or behaviour, which the detector cannot see.

### Direction
On course, and moving up: both briefs' structure now exists and works with real data in both themes. The app is not yet at the 4.5 target. The gap is truth and fidelity, not layout:
- one honest evidence voice: no contradicting summary, no "over-index" or raw scores in primary UI;
- Ideas trimmed to ideas, with covers left to Covers;
- list rows rebuilt to the programme-listing anatomy, with a Tonight strip;
- a mini-map that keeps the tour in view.

Do not add surfaces until these four land.

## 2026-10-31 — checkpoint 3

Method: single-context critique (degraded: a sequential checkpoint run, no isolated sub-agents). The visual review was finished before the detector ran. Evidence: Playwright at 1440×900 and 390×844, light and dark, with the demo act "Juniper Lane" (`tourbo:profile` and `tourbo:work` from `/tmp/tourbo-demo.json`). Pages: `/` (without a profile; with one it redirects to `/work`), `/start`, `/work`, `/work?show=events`, `/material`, `/help`, run `/plan/32e2510c…` and demo tour `/plan/bf687b05…` (Tonight, Plan, Ideas, Covers, Set, Notes, Booking, Numbers, night panel). Shots are in `/tmp/tourbo-ckpt3/shots/` (not committed). The fan-data pause notice showed, as expected. The work entries in `/tmp/tourbo-demo.json` have no `updatedAt`. Injected as they are, every app page froze (see issue 1), so the review used copies with `updatedAt` added.

### Scores (/5, delta vs checkpoint 2)
| Surface | Now | CP2 | Δ |
|---|---|---|---|
| Home `/` | 4.0 | 4.0 | 0 |
| `/start` | 4.0 | 3.8 | +0.2 |
| Workspace lists (Tours · Shows · Library) | 3.9 | 3.6 | +0.3 |
| Tour page (header, rail · main · night panel, tabs) | 4.1 | 3.8 | +0.3 |
| Ideas + kind tabs (Covers) | 3.9 | 3.3 | +0.6 |
| `/help` | 4.2 | 4.1 | +0.1 |
| Whole app | 4.0 | 3.7 | +0.3 |

Fixed since CP2:
- Lists:
  - Rows sit on hairlines with a serif date column (Library shows minutes there) and a ramp strip.
  - A Tonight strip shows while a tour is on the road.
  - Library has a ⋯ menu and its toolbar is aligned with the other lists.
- Tour header: one meta line (dates · nights · from · ~profit · why?).
- Mini-map: it keeps the whole tour in view.
- Ideas: it no longer repeats covers. It points to Covers with one action, and the night panel does the same.
- Covers: shows rank chips ("#1 here") on the ramp, a plain "Their hip-hop, played your dream pop way" line, and the next best options.
- `/start`: has a visible "Main:" toggle.
- Run-wide checks: no text under 12 px, no sideways overflow at 390, no vendor names, one h1 per page, and dark tiles on the main map.

### Top 5 issues
1. **P1 A malformed work index freezes every app page.**
   - What happens: a `tourbo:work` entry without `updatedAt` makes `/help`, `/work` and the tour page stop rendering. The main thread stayed blocked for more than 60 s, and the page could not even be screenshotted.
   - Cause: `readWork` sorts with `b.updatedAt.localeCompare` and never checks for the field (`app/lib/work.ts:23-34`). The app bar calls it on every page (`app/components/header.tsx:81`).
   - Fix: `valid()` should drop or default entries without the field. Bad local data must degrade to one sentence, never a hang.
   - Owner: **workspace**.
2. **P1 Evidence copy still breaks "AI only writes on top of facts".**
   - Every Tours row (1440 and 390) still reads "Chicago fans over-index 8.2×; Columbus is the softest (37)". The row line is rendered as stored (`app/components/assist/insight-line.tsx:15`), even though `ROWS_SYSTEM` (`server/agent/assist.server.ts:303`) bans that wording.
   - The demo tour for Juniper Lane says "Japanese Breakfast at the Studebaker…" in its angle line (`app/components/city-card.tsx:98`). Its Notes say "Japanese Breakfast songs". So the demo data was cloned from another act's run.
   - The angle is cut mid-clause ("Chance the Rapper's city a stone's…").
   - Owner: **tour page** (demo seed, angle) and **workspace** (row line).
3. **P2 More than one tomato on Notes, and controls outside the design system.**
   - The Notes tab shows the tomato "Write show notes" next to a disabled tomato "Add" (`app/components/tour-notes.tsx:97`).
   - Its "To-do" control is a bare 13 px native checkbox (`tour-notes.tsx:95`), under the 24 px target.
   - Covers and Openers set `data-primary` on outline buttons (`components/kind-tabs/night-action.tsx:47`, `kind-tabs/openers.tsx:52`), so each page reports 4 "primaries".
   - The why?/help triggers measure 20 px tall.
   - Owners: **tour page**, **kind tabs**, **a11y**.
4. **P2 The maps miss the brief's signature.**
   - The route line is grey dashed foreground (`app/components/workspace-map.tsx:109`); the brief asks for the fan ramp through the numbered markers.
   - Markers sit on top of their own city labels ("Mi④olis", "Co②us").
   - In dark mode the Numbers map keeps light positron tiles (`app/components/tour-map.tsx:8`).
   - Owner: **tour page**.
5. **P2 Lists at 390 and the list head.**
   - At 390, Tours rows are about 190 px tall (the brief says 64). The title wraps to two lines and the insight truncates.
   - The search placeholder is clipped ("Search tours a").
   - The explainer sentence still comes before the count line (`app/routes/work.tsx:230,290`).
   - The fan-data notice spans 96–1344 px, while the content column is 224–1216 px.
   - On tour tabs, the main-pane titles ("Covers", "Your setlist", "Venue emails") are 18 px serif butted against the tab rule with no top gap (`components/kind-tabs/frame.tsx:17`, `routes/plan.$id.set.tsx:203`, `routes/plan.$id.pipeline.tsx:106`).
   - Owners: **workspace** (lists) and **tour page** (pane titles).

### Drift from the briefs
- Shell:
  - `/` still carries the ink app bar; the brief says marketing keeps its own light header.
  - The fan-data notice width is unchanged since CP1.
- One voice / DESIGN:
  - Notes has two tomato buttons (issue 3).
  - On a phone, Tonight's ticket-stub date is a large solid tomato block. DESIGN says tomato is "never a background fill for large areas". It is the only tomato on that screen, so either accept it as the signature in DESIGN.md or make it an outline.
- Ramp: the route line is not on the ramp (issue 4). The rail ticks and the panel's fan bars are on the ramp.
- Tab map: the night panel's Set empty state still offers "Add to your Library", not "Add from Library".
- Vocabulary: "over-index", "8.2×" and "(37)" are still in primary UI on Tours rows. The night panel keeps "fans 8.2× more concentrated" as a chip, which is the allowed place for it.
- List anatomy: the explainer line comes before the count, and phone rows are too tall (issue 5).

### Detector
`impeccable detect --json app`: exit 0, 1 advisory finding (CP2: 10): `design-system-radius` at `app.css:404` (0.25rem). The font-size and the other radius findings are gone. No slop or contrast rules fired. Every issue above is robustness, copy, data truth or map styling, which the detector cannot see.

### Direction
On course. The app is at 4.0, half a point under the 4.5 target. Both briefs' structure is now built and faithful: the programme-listing rows, one-line header, mini-map and Covers-owned covers all landed. What is left is trust, not layout:
- harden local data so it can never freeze a page;
- one honest evidence voice in list rows, and a demo tour that only names its own act;
- one tomato per screen, with real design-system controls;
- the ramp route and clean marker labels on the maps.

Do not add surfaces until issues 1 and 2 land.

## 2026-10-31: target change

The user lowered the target to every surface ≥ 4.0/5. Checkpoint 3 had the app at 4.0, with surfaces from 3.7 to 4.3. Bring the surfaces under 4.0 (the Ideas tab, /ideas, /connect and home) up to it, then stop polishing.
