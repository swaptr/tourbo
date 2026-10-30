# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Working artists of every kind (singers, bands, comics, speakers, painters, dancers, poets, DJs and more; 18 kinds), mostly small to mid-size acts (draw ~100–1,000), many not listed in any fan database. They plan tours and one-off events on a laptop and check a night's set, ideas and venue on a phone while on the road. Hackathon judges are a secondary audience, meeting the product first on the home page.

## Product Purpose
Tourbo is a recommendation engine for touring artists, grounded in real fan data. For every place an act plays or shows in, it recommends what to perform or make there (covers that city's crowd loves, local topics, painting subjects, set order) on top of a tour plan (cities, rooms, money, route, venue emails). Success: an artist finishes a profitable plan and a set for each night from the screen alone, and trusts every suggestion because its evidence is visible.

## Positioning
Every recommendation is a fan-data relation made useful ("your fans in Austin over-index on AC/DC"), shown with its number; AI only writes short summaries on top of those facts, never new claims. The act's own material comes first; local ideas season it, never replace it.

## Operating Context
- Flow: a short profile (who you are, what you do, home base) captured once and skippable; then a workspace of tours, events and material. Required info is asked only when an action needs it.
- A tour opens as a map-first workspace: nights list + map + side panel, with tour-level and night-level tabs; edits (swap city/venue/date) recompute money and route instantly with undo.
- Chat ("Ask Tourbo"), levers and one-tap prompts steer the plan; nothing is sent to a venue without a click.
- No accounts: work is owned by a browser key; links can be shared read-only.
- Home page is a static, prerendered showcase of real decisions on a turning globe.

## Capabilities and Constraints
- Entities: profile (multi-select kinds), tours, events (date range, venue, kind per event), material library (songs, bits, talks, pieces; original / cover / local idea), sets as ordered material.
- Fan data can be missing or rate-limited: every screen must degrade to one plain sentence plus what to do; never a stack trace or blank page.
- Money figures are estimates and labelled so.
- Terminology: "fan data", "your AI assistant", "night", "set", "material", "ideas". Avoid jargon in primary UI (no "fanIndex", "heatmap cells"); numbers live behind "why?".

## Brand Commitments
- Name: Tourbo. The UI speaks only as Tourbo; never names the data or AI vendor except on `/connect` (setup).
- Plain, short words; one primary action per screen; advanced options collapsed.
- Existing rules: one strong accent, two fonts, no monospace, no glow, no hard-coded colours in components, light ("paper") and dark modes.

## Evidence on Hand
- Static landing bundle: `apps/web/public/landing/` (103 real examples, 64 acts, fan maps; every number and place cross-checked at export, quality over quantity).
- Stories with tests: `STORIES.md`, `tests/stories/`, `tests/bdd/`.
- No testimonials, customers or usage metrics exist; never fabricate them.

## Product Principles
1. Fan data is the hero, AI is light: evidence inline when strong, hedged when weak, absent when none.
2. The artist's originality first; local flavour is a few brushes.
3. Simple beats complete: one primary action, plain words, the rest one tap away.
4. Never a dead end: unlisted acts, missing data and limits all still lead somewhere.
5. The artist decides: Tourbo suggests, the user's edits win and re-plan without asking why.

## Accessibility & Inclusion
WCAG 2.2 AA: contrast in both themes, keyboard access, visible focus, reduced-motion respected, usable by touch at 390 px.
