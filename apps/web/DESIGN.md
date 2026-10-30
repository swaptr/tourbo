---
name: Tourbo
description: A printed tour programme that answers back; fan data first, AI light.
colors:
  paper: "oklch(0.954 0.013 82.4)"
  paper-card: "oklch(0.988 0.007 85)"
  paper-muted: "oklch(0.935 0.014 85)"
  ink: "oklch(0.288 0.05 265.9)"
  ink-card: "oklch(0.22 0.025 265)"
  ink-muted: "oklch(0.47 0.02 265)"
  rule: "oklch(0.875 0.016 85)"
  rule-input: "oklch(0.85 0.018 85)"
  tomato: "oklch(0.52 0.17 35)"
  cobalt: "oklch(0.45 0.13 262)"
  sand-accent: "oklch(0.92 0.035 60)"
  success-sage: "oklch(0.46 0.1 155)"
  warning-ochre: "oklch(0.5 0.11 70)"
  destructive-brick: "oklch(0.5 0.18 25)"
  score-1-straw: "oklch(0.873 0.114 89.4)"
  score-2-amber: "oklch(0.756 0.141 62.8)"
  score-3-rose: "oklch(0.58 0.16 350)"
  score-4-plum: "oklch(0.44 0.14 315)"
  globe-ocean: "oklch(0.604 0.049 206.6)"
  globe-land: "oklch(0.879 0.037 80.6)"
  globe-coast: "oklch(0.799 0.047 81.3)"
  dark-ink-ground: "oklch(0.2 0.02 265)"
  dark-ink-card: "oklch(0.235 0.022 265)"
  dark-paper-text: "oklch(0.94 0.012 85)"
  dark-tomato: "oklch(0.7 0.15 38)"
  dark-cobalt: "oklch(0.72 0.11 262)"
typography:
  display:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.375
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
  pill: "9999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "2rem"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "2rem"
  button-secondary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.lg}"
    height: "2rem"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "2rem"
  card:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink-card}"
    rounded: "{rounded.xl}"
    padding: "16px"
  card-sm:
    backgroundColor: "{colors.paper-card}"
    rounded: "{rounded.xl}"
    padding: "12px"
  fact-chip:
    backgroundColor: "{colors.paper-muted}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  why-trigger:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "1.25rem"
    padding: "0 8px"
  badge:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.pill}"
    height: "1.25rem"
---

# Design System: Tourbo

## Overview

**Creative North Star: "The Printed Programme"**

Tourbo looks like a well-set tour programme: warm paper, deep blue-black ink, one tomato accent for the thing to do and the thing that matters, cobalt as the quiet second voice. Dark mode is "the same programme printed on ink", not a different product. Headings and big numbers are set in a high-contrast serif the way a concert bill would set them; everything you operate is a plain, compact sans.

The app is a working tool first (nights, money, sets, emails), so density is moderate-to-high and the world shows up only through type, palette, the fan ramp and one signature move: fan strength drawn as a ramp from straw through amber and rose to plum, kept clear of the tomato accent so fan strength never reads as an action that appears identically on the home globe, every bar, meter and chip. The home page is the showcase: a turning globe of real decisions with one fixed example card.

Fan data is the hero and is drawn, not decorated: a fact chip with a tiny meter sits inline with each suggestion; the full numbers sit one tap away behind a small outlined "why?" pill.

**Key Characteristics:**
- Warm paper / ink, one tomato accent, cobalt second; no gradients, no glow, no glass beyond the header's light blur.
- Two faces only: Instrument Serif (wordmark, headings, big figures) and Geist (everything else). No monospace anywhere.
- Tabular numerals for every figure (`num` utility).
- One control height scale shared by buttons, inputs, selects, toggles and tabs.
- Evidence inline, details behind "why?" popovers that never shift layout.

## Colors

A warm, low-chroma paper/ink neutral pair with a single saturated tomato accent and a cobalt second voice; the fan ramp is the only multi-step hue scale.

### Primary
- **Tomato** (`tomato` / dark `dark-tomato`): the one primary button per screen, focus rings, the "best bet" ring, active markers and the example card's dot. Never a background fill for large areas.

### Secondary
- **Cobalt** (`cobalt` / dark `dark-cobalt`): secondary buttons, opener avatars, info state, the "profit / sold" data series. Quiet, structural.

### Tertiary
- **Fan ramp** (`score-1-straw` → `score-4-oxblood`): fan strength only. Globe waves, towers, every bar and meter. Not for status or decoration.

### Neutral
- **Paper** (`paper`, `paper-card`, `paper-muted`): page ground, raised card, muted wells. Dark: `dark-ink-ground`, `dark-ink-card`.
- **Ink** (`ink`, `ink-card`, `ink-muted`): text. Muted ink is for secondary text and must keep 4.5:1 on paper.
- **Rule** (`rule`, `rule-input`): hairline borders and input strokes; in dark mode white at 12% / 16%.
- **Globe** (`globe-ocean`, `globe-land`, `globe-coast`): the home globe and the example card's frame only.

### Named Rules
**The One Voice Rule.** Tomato marks the single primary action (and, on the tour page, the selected night's ring). Night numbers are ink circles, "Strongest" is an outline badge, idea city pills and icons are neutral. If two things are tomato, one of them is wrong.

**The Ramp Is Fans Rule.** The straw-to-oxblood ramp always means fan strength. Money uses success/destructive text colour; status uses the semantic tokens.

**No Hard-Coded Colours.** Components reference tokens (`bg-primary`, `text-muted-foreground`, `bg-score-3`, `var(--viz-1)`); no hex or raw oklch in TSX.

## Typography

**Display Font:** Instrument Serif (with ui-serif, Georgia)
**Body Font:** Geist Variable (with ui-sans-serif, system-ui)

**Character:** A bill-poster serif for names and numbers against a neutral, compact grotesque for work. The serif is always regular weight (400); hierarchy comes from size, never from faux bold.

### Hierarchy
- **Display** (400, 2.25–3rem, 1.1): home hero and plan titles.
- **Headline** (400, 1.875rem, 1.15): page titles (`h1` on /help, /ideas, /connect).
- **Title** (400, 1.25rem, 1.375): card titles, section heads (`h2`, `CardTitle`).
- **Body** (400, 0.875rem, 1.5): all working text; long prose capped near 65ch.
- **Label** (500, 0.75rem): chips, badges, form labels, meta lines.

### Named Rules
**The Serif Is Regular Rule.** Headings use `font-heading font-normal`; never `font-semibold` on Instrument Serif.

**The 18 px Serif Floor.** The serif is for 18 px and up. An `h1`–`h3` set at `text-xs`/`text-sm`/`text-base` falls back to the sans automatically (base rule in `app.css`). No text below 12 px anywhere (`text-xs` is the floor; no `text-[10px]`/`text-[11px]`).

**The Tabular Figures Rule.** Any number that may sit above or beside another number uses `num`.

## Layout

Centered `container` with `px-4`; reading pages cap at `max-w-4xl`/`max-w-5xl`. Header and footer are both 56px (`h-14`) bars with a hairline rule. Vertical rhythm on content pages is `py-8`/`py-10` with `space-y-6` between blocks; inside cards `gap-3` (sm) / `gap-4`. Grids collapse to one column below `sm` (640px); the plan workspace is map-first on desktop (nights list + map + side panel) and stacks on mobile. Everything must work by touch at 390px.

## Elevation & Depth

Flat by default: depth comes from paper tone steps (paper → paper-card) and a 1px ink ring at 10% (`ring-foreground/10`). Shadows appear only on response or on floating layers.

### Shadow Vocabulary
- **Sticker lift** (`0 1px 0 0 var(--border), 0 8px 24px -12px color-mix(foreground 25%)`): hover on cards that open something (`sticker` utility).
- **Popover** (`shadow-md` + 1px ring): "why?" popovers, menus.
- **Example card** (`0 1px 2px rgb(0 0 0 / 0.05)`): the fixed home card over the globe.

### Named Rules
**The Flat-At-Rest Rule.** Nothing casts a shadow at rest except floating layers.

## Shapes

Gently rounded (`--radius` 0.5rem): controls `rounded-lg`, cards `rounded-xl`, chips, badges and "why?" triggers are full pills. Circles carry night numbers and opener initials. No sharp corners, no blobs, no decorative masks.

## Components

### Buttons
- **Shape:** gently rounded (`rounded-lg`), 1px transparent border.
- **Sizes:** xs h-6, sm h-7, default h-8, lg h-9, xl h-10; icons scale 12/14/16px. Inputs, selects, toggles and tabs share the same heights.
- **Primary:** tomato on paper text; one per screen, marked `data-primary`. The header's "Plan a tour" is outline so each page's own action stays the only primary.
- **Outline / Ghost / Secondary / Link:** outline for alternates, ghost for toolbar icons, cobalt secondary sparingly, link for inline actions.
- **Focus:** ring-3 at ring/50 plus ring-coloured border; pressed nudges 1px down.

### Chips
- **Fact chip:** muted pill, 12px medium text, optional 32px fan-ramp meter; hedged evidence uses a dashed border and muted text.
- **Badge:** 20px pill; default tomato, outline for "your pick", secondary for verdicts.

### Cards / Containers
- **Corner Style:** `rounded-xl`.
- **Background:** paper-card on paper, 1px ink ring at 10%.
- **Internal Padding:** 16px default, 12px `size="sm"` (night cards, help cards).

### Inputs / Fields
- **Style:** 1px input stroke, transparent fill (dark: input at 30%), `rounded-lg`, h-8.
- **Focus:** ring-coloured border + ring-3 at 50%. **Error:** destructive border + ring.

### Navigation
- Header: serif wordmark left; muted text links that turn ink when active; theme toggle; outline "Plan a tour". On mobile, links collapse into one "Menu".
- Workspace app shell (surface brief `.impeccable/surfaces/app-routes-projects-tsx.md`, "a tour book, not a dashboard"): slim left rail (Tours · Events · Material · Profile) on desktop, bottom tab bar on mobile; calm grouped lists, not card walls; new tour/event in a right-side sheet, not a modal; the tour opens as nights rail · map · night panel.

### Night Card (signature)
Numbered circle (tomato, or ink for "your pick"), city name, date, money verdict badge; a fan-score bar on the ramp; room with capacity; profit in success/destructive; opener avatar; one italic angle line; "why?" opens the full evidence.

### Why? popover (signature)
A 20px outlined pill reading "why?" (or a "?" icon) that opens a portal popover on hover/tap; content never shifts layout and stays inside the viewport.

### States
Loading = skeleton lines shaped like the content plus one status line; failed = one plain sentence and "Try again" when it helps; provider limits = one muted page notice under the header, not per widget.

## Do's and Don'ts

### Do:
- **Do** keep exactly one tomato primary button per screen, and call the plan action "Plan a tour" everywhere.
- **Do** draw every fan meter (bars, chip meters, "Fans by city") with `rampClass()` from `why-compare.tsx`.
- **Do** put the fan-data fact chip inline with the suggestion and the numbers behind "why?".
- **Do** use the shared control height scale (h-6/7/8/9/10) for every interactive control in a row.
- **Do** set headings in Instrument Serif at weight 400 and figures with tabular numerals.
- **Do** design both paper and ink themes and check 4.5:1 for muted text in each.

### Don't:
- **Don't** name the data or AI vendors in UI outside `/connect`.
- **Don't** use monospace, gradient text, glow, or colored side-stripe borders thicker than 1px.
- **Don't** use the fan ramp for anything other than fan strength.
- **Don't** hard-code colours in components; use tokens.
- **Don't** show raw jargon ("fanIndex", "heatmap cells") in primary UI.

## UI standard (binding for every screen, 2026-10-30)
Target: every surface ≥ 4.0/5 (lowered from 4.5 by the user, 2026-10-31) on the Impeccable critique, zero automated a11y violations.

**Accessibility: WCAG 2.2 AA is the floor; take AAA where it costs nothing.**
- Contrast: text ≥ 4.5:1 (AAA 7:1 for body text where the palette allows), large text and UI parts/focus rings ≥ 3:1, in light and dark.
- Targets: ≥ 24×24 px (2.5.8 AA); ≥ 44×44 px for primary touch actions at 390 px (2.5.5 AAA).
- Focus: always visible, ≥ 2 px ring at 3:1, never hidden under sticky bars (2.4.11 Focus Not Obscured); logical order; no keyboard traps; Esc closes overlays.
- Keyboard: every action reachable; composite widgets follow WAI-ARIA APG patterns (tabs: arrows + Home/End; menus; listbox; accordion; dialog). Base UI primitives provide these: never hand-roll them.
- Semantics: one h1 per page, ordered headings, landmarks (header/nav/main), labelled controls, `aria-live` for async status, `role="alert"` for errors only.
- Motion: state only, 150–250 ms, `prefers-reduced-motion` respected everywhere (globe, map, sheets).
- Forms: visible labels (no placeholder-only), errors inline and linked via `aria-describedby`, no time limits, redundant entry avoided (3.3.7), accessible auth not applicable (no auth).
- Text: min 12 px, body 15–16 px, line length ≤ 75ch, reflow at 320 px without horizontal scroll (1.4.10), text spacing tolerant (1.4.12).
- Automated gate: axe-core (WCAG 2.2 A/AA tags) runs in the BDD suite on every main route, light + dark, 1440 + 390; any violation fails.

**Craft (Impeccable craft floor + Operate mode).**
- Tokens only: no hard-coded colours, sizes or radii in components; one tomato accent per screen; fan colour ramp for every fan quantity.
- Type: Instrument Serif ≥ 18 px only (titles), Geist for all UI; tight 1.125–1.2 scale; tabular numbers for money and counts.
- Spacing: 4 px base, consistent rhythm; controls on the h-6/7/8/9/10 scale; rows aligned.
- Components: every interactive part has default, hover, focus, active, disabled, loading, error. Skeletons, not spinners. Empty states teach + one action. Overlays portal out of containers.
- Evidence: fan-data numbers inline as chips; detail one hover/click away ("why?" popover); AI drafts editable, never silent.
- Tone: playful, warm, professional; personality in details, never clutter.
- Exception: code and config blocks (e.g. /connect setup JSON) use the system monospace stack so indentation lines up; nowhere else.
