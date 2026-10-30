# Tourbo app review (Impeccable critique, 2026-10-30)

Method: dual-agent (A: design review, B: detector + browser), synthesised by the design director. Evidence: every route at 1440 and 390, light and dark (`/tmp/tourbo-review/`, not committed), plan 32e2510c (Japanese Breakfast, 4 nights), live clicks. Fan-data quota exhausted (the limit notice is expected). `/work` and `/events/:id` were mid-build; judged from source + PLAN Q21.

## Scores
Nielsen, whole app: **21/40** (Status 2 · Real world 2 · Control 3 · Consistency 1 · Error prevention 2 · Recognition 2 · Flexibility 3 · Minimalism 2 · Recovery 3 · Help 2).
Per surface (/40): home 31 · ideas tab 29 · connect 27 · start 26 · new tour 25 · plan workspace 24 · /ideas 24 · new event 24 · plan sub-tabs 23 · explore 23 · material 22 · help 22 · projects 21 · work n/a (stub).
Cognitive load: 5/8 checklist items fail (high). Design (judging criterion) today ≈ 3/5; target 4.5–5.
Detector: CLI clean except 18 advisory `design-system-font-size` (11 px literals). Browser: prep tab 26× tiny-text (11 px) + 40 nested cards; `/` intermittent 24 px overflow at 390 (rotating card); `/connect` text past viewport edge at 390; plan labels occluded ("Promo budget", "Circle size"). False positives: cream-palette (the brief's paper), theater-slop (real venue names), dark-glow (shadow token), home card occlusion (intended).

## Verdict
Specific where it matters (globe, fan ramp, "why?" chips, ideas fit grid, Compare), generic elsewhere (Material, Projects, Explore, Ticket sales are CRUD forms). The plan page stacks generic parts (KPI tiles, three tab rows, accordion, kanban) on the best data.

## Priority issues
1. **P0 Tour workspace has no single focus.** Three tab rows at once (tour tabs · Nights/Ask · Venue/Ideas/Show notes), KPI tiles push the map below the fold, map blank until tiles load. Fix: tour brief frame (rail · main · night panel, one night-tab row, Ask as docked composer, header figure instead of tiles).
2. **P0 No "Tonight" on a phone.** Set, opening line and room are spread across three tabs; Notes is 10,000+ px at 390; tour tabs clip at "Insigh". Fix: Tonight view, Notes one night at a time.
3. **P1 One action, four names; two homes.** "Plan my tour / Plan a tour / Plan a run / Plan a different tour"; Projects duplicates the workspace; Material unreachable from nav; Tours/Events/Notebook nouns. Fix: app bar Tours · Shows · Library, vocabulary table, retire Projects.
4. **P1 Leaks.** "Test mode … resend.dev" (plan.$id.pipeline.tsx:116), "Critic caught 2" (plan.$id.prep.tsx:48,216), "Data provider limit", test names ("Story test spring tour", "Fakeband"), ISO dates.
5. **P2 Forms dead-end.** Name step disables Continue silently when lookup fails; home base is a fixed dropdown (start.tsx:242, new.tsx:302; breaks story 11); Material leads with a 6-field form, defaults to "Piece"; Set tab is a textarea separate from the Library.

System violations: >1 tomato per screen (plan: primary + "best bet" + number circles + ring; help's "Plan a run"); tomato used for non-fan meters ("100% full", city pills; Numbers fan bars flat tomato instead of the ramp); hard-coded amber/emerald/indigo/red in plan.$id.prep.tsx:167–277 and plan.$id.set.tsx:323,328; serif under 18 px ("Your library", "Add piece", "Cover ideas", kanban columns, connect badges); 11 px text; browser-default checkboxes on /explore.

## Personas
Maya (laptop): can't find Material; "Next: show notes" skips booking; route doubles back with no comment. Rohan (phone, road): clipped tabs, sideways grid, 10k px notes, "More 90s covers" chip for a comic, "Piece" default. Judge: home excellent, then onboarding wall on /work and /new, blank map, test data visible. Power user: no night keys, two "More" menus, no bulk actions.

## What's working
Evidence inline (fact chips, "why?", fit grid with best city ringed); disciplined serif/palette in both themes; plain microcopy ("Nothing is sent until you approve it").

Direction and build order: `.impeccable/surfaces/app-routes-projects-tsx.md` (workspace, lists, forms, vocabulary) and `.impeccable/surfaces/app-routes-plan-id-tsx.md` (tour workspace).
