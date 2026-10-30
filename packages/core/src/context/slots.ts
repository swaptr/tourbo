import type { PerformerKind } from "../shared/types.ts";

// Slot context (PLAN §18 Q15): what kind of booking a night is, per discipline, with a typical
// length. Lengths are common norms from public sources (SLOT_SOURCES below), not rules: the act
// can always override minutes. Keyed by discipline key with a fallback for kinds added later.
// Client-safe (the set tab imports it).

// lead = the act's own show; support = before the main act; shared = co-bill / panel / group
// show (audiences overlap: local nods become shared-audience nods); guest = a few minutes inside
// someone else's show; host = MC between acts (talking to the room is the job); short = a spot
// under ~10 min (open mic, slam, showcase); long = multi-set or multi-hour (residency, workshop,
// walkaround); private = a booked event (wedding, corporate) where the client sets the tone.
export type SlotRole = "lead" | "support" | "shared" | "guest" | "host" | "short" | "long" | "private";
export type SlotUnit = "minutes" | "pieces" | "courses";
export type SlotDef = {
  key: string;
  label: string; // plain, short: "support", "tight five"
  role: SlotRole;
  unit: SlotUnit;
  size: number; // typical minutes / pieces on the wall / courses
  range: [number, number];
  note: string; // one plain line shown under the select
  src?: string[]; // keys into SLOT_SOURCES
};

const s = (key: string, label: string, role: SlotRole, size: number, range: [number, number], note: string, src?: string[], unit: SlotUnit = "minutes"): SlotDef => ({ key, label, role, unit, size, range, note, src });

const MUSIC: SlotDef[] = [
  s("headline", "headline", "lead", 60, [45, 90], "Your show: club headliners usually play 60–90 min.", ["music_sets"]),
  s("support", "support", "support", 30, [20, 45], "Opening for someone: about 30 min, mostly your strongest songs.", ["music_sets"]),
  s("co_bill", "co-bill", "shared", 45, [35, 60], "Equal billing: split the night, nod to what both crowds share.", ["music_sets"]),
  s("guest", "guest spot", "guest", 10, [4, 15], "A song or two inside another act's set.", ["music_sets"]),
  s("festival", "festival", "short", 40, [25, 60], "Festival slots are short and strict: hits first.", ["festival_sets"]),
  s("residency", "residency", "long", 120, [90, 180], "Several sets a night, same room each week: rotate the songs.", ["music_sets"]),
  s("private", "private event", "private", 120, [60, 180], "Weddings and parties: often 2–3 sets of 40–45 min; the client picks the tone.", ["wedding_sets"]),
];

const COMEDY: SlotDef[] = [
  s("open_mic", "open mic", "short", 5, [3, 7], "Usually 3–7 min: one tight idea.", ["comedy_slots"]),
  s("showcase", "showcase / tight five", "short", 7, [5, 10], "A tight five to ten: your best minutes only.", ["comedy_slots"]),
  s("host", "host / MC", "host", 12, [8, 20], "Open the night, then a few minutes between acts.", ["comedy_slots"]),
  s("support", "opener", "support", 15, [10, 20], "Warm the room for the headliner: about 15 min.", ["comedy_slots"]),
  s("feature", "feature", "support", 25, [20, 30], "The middle act: 20–30 min.", ["comedy_slots"]),
  s("headline", "headline", "lead", 45, [40, 60], "Your show: 45–60 min.", ["comedy_slots"]),
  s("hour", "full hour", "lead", 60, [55, 75], "A solo hour, like a festival or special hour.", ["comedy_slots", "fringe_slots"]),
  s("private", "private / corporate", "private", 30, [20, 45], "Corporate rooms run clean and short unless told otherwise.", ["comedy_slots"]),
];

const SPEAKER: SlotDef[] = [
  s("headline", "keynote", "lead", 45, [20, 60], "Keynotes run 20–60 min, most near 45.", ["speaker_slots"]),
  s("talk", "short talk", "short", 18, [10, 20], "A short talk: about 18 min, one idea.", ["ted_18"]),
  s("breakout", "breakout session", "lead", 45, [30, 60], "A session in a side room: talk plus questions.", ["speaker_slots"]),
  s("support", "panel", "shared", 10, [5, 15], "Panels run 45–60 min; you get an opening few minutes and questions.", ["panel_slots"]),
  s("workshop", "workshop", "long", 180, [90, 360], "Half day or full day, hands-on.", ["speaker_slots"]),
  s("host", "host / MC", "host", 15, [10, 30], "Keep the day moving between speakers.", ["speaker_slots"]),
];

const GALLERY: SlotDef[] = [
  s("headline", "solo show", "lead", 15, [8, 30], "Your work only, usually a 4–6 week run.", ["gallery_shows"], "pieces"),
  s("support", "group show", "shared", 4, [1, 8], "A few pieces next to other artists: fit the show's theme.", ["gallery_shows"], "pieces"),
  s("popup", "pop-up", "short", 8, [4, 15], "A few days in a cafe, shop or empty unit.", ["gallery_shows"], "pieces"),
  s("live", "live painting", "guest", 120, [60, 240], "Painting during someone else's night.", ["gallery_shows"]),
  s("commission", "mural / commission", "private", 1, [1, 3], "The client's wall and brief.", ["gallery_shows"], "pieces"),
];

// Photographers: prints on a wall, not a live slot (no "live painting").
const PHOTO: SlotDef[] = [
  s("headline", "solo show", "lead", 12, [6, 20], "Your prints only, usually a 5–6 week run.", ["photo_shows", "gallery_shows"], "pieces"),
  s("support", "group show", "shared", 4, [1, 8], "A few prints next to other photographers: fit the theme.", ["photo_shows", "gallery_shows"], "pieces"),
  s("popup", "pop-up", "short", 8, [4, 15], "A few days in a cafe, shop or empty unit.", ["gallery_shows"], "pieces"),
  s("talk", "artist talk / walk", "lead", 60, [30, 90], "Talk the room through the work, or a photo walk.", ["photo_shows"]),
  s("commission", "commission / shoot", "private", 1, [1, 3], "The client's brief.", ["photo_shows"], "pieces"),
];

const DANCE: SlotDef[] = [
  s("support", "single piece", "short", 10, [5, 20], "One piece on a mixed bill.", ["dance_slots"]),
  s("co_bill", "shared bill", "shared", 25, [15, 40], "Half an evening with another company.", ["dance_slots"]),
  s("headline", "full evening", "lead", 75, [60, 100], "Your whole programme, often with an interval.", ["dance_slots"]),
  s("workshop", "workshop", "long", 90, [60, 180], "Teach a class alongside the shows.", ["dance_slots"]),
  s("private", "private event", "private", 15, [5, 30], "A short set for a party or launch.", ["dance_slots"]),
];

const POETRY: SlotDef[] = [
  s("open_mic", "open mic", "short", 4, [3, 5], "One or two poems, about 3–5 min.", ["poetry_slots"]),
  s("slam", "slam round", "short", 3, [3, 3], "3 min per poem, with a short grace period.", ["slam_rules"]),
  s("feature", "feature", "lead", 20, [15, 30], "The featured reader at a poetry night.", ["poetry_slots"]),
  s("headline", "solo show", "lead", 50, [40, 70], "A full spoken-word show.", ["poetry_slots", "fringe_slots"]),
  s("host", "host", "host", 12, [8, 20], "Run the night and the sign-up list.", ["poetry_slots"]),
];

const DJ: SlotDef[] = [
  s("support", "warm-up", "support", 90, [60, 120], "Build the room slowly; don't play the headliner's records.", ["dj_slots"]),
  s("headline", "peak time", "lead", 120, [90, 150], "The main set when the room is full.", ["dj_slots"]),
  s("closing", "closing", "long", 120, [60, 180], "Take the room home.", ["dj_slots"]),
  s("co_bill", "back to back", "shared", 120, [60, 180], "Trading tracks with another DJ.", ["dj_slots"]),
  s("festival", "festival", "short", 60, [45, 90], "A fixed festival slot: tight and loud.", ["dj_slots", "festival_sets"]),
  s("residency", "residency", "long", 240, [120, 360], "The same night every week or month.", ["dj_slots"]),
];

const AUTHOR: SlotDef[] = [
  s("headline", "book event", "lead", 50, [40, 75], "Reading of 10–15 min, conversation, questions, signing.", ["author_events"]),
  s("support", "festival panel", "shared", 15, [10, 20], "Your share of a 45–60 min panel.", ["author_events", "panel_slots"]),
  s("co_bill", "in conversation", "shared", 45, [30, 60], "Talk with a host or another author.", ["author_events"]),
  s("short", "short reading", "short", 5, [3, 10], "A reading slot at a mixed night.", ["author_events"]),
];

const PODCAST: SlotDef[] = [
  s("headline", "live show", "lead", 75, [60, 90], "A live taping with the audience in it.", ["podcast_live"]),
  s("support", "guest spot", "guest", 20, [10, 30], "On someone else's show.", ["podcast_live"]),
  s("festival", "festival", "short", 45, [30, 60], "A festival slot with a hard stop.", ["podcast_live"]),
  s("co_bill", "panel", "shared", 15, [10, 20], "Your share of a panel.", ["panel_slots"]),
];

const MAGIC: SlotDef[] = [
  s("walkaround", "close-up / walkaround", "long", 120, [60, 180], "Short routines table to table, repeated.", ["magic_slots"]),
  s("parlour", "parlour show", "lead", 45, [30, 60], "A small room, seated.", ["magic_slots"]),
  s("headline", "stage show", "lead", 75, [60, 90], "Your full stage show.", ["magic_slots"]),
  s("support", "opener / cabaret spot", "support", 12, [7, 20], "A spot on a mixed bill.", ["magic_slots"]),
  s("private", "private event", "private", 45, [20, 60], "Parties and corporate: the client sets the tone.", ["magic_slots"]),
];

const THEATRE: SlotDef[] = [
  s("headline", "one-act / fringe slot", "lead", 55, [45, 60], "Fringe slots are about an hour, turnaround included.", ["fringe_slots", "theatre_lengths"]),
  s("full", "full-length", "lead", 120, [90, 150], "Two acts with an interval.", ["theatre_lengths"]),
  s("support", "short piece / scratch", "short", 10, [5, 20], "A short piece on a mixed night.", ["fringe_slots"]),
  s("co_bill", "shared improv bill", "shared", 25, [20, 40], "Half the night with another troupe.", ["fringe_slots"]),
];

const BUSK: SlotDef[] = [
  s("headline", "pitch", "lead", 40, [30, 45], "Busy pitches rotate every 30–45 min.", ["busking"]),
  s("circle", "circle show", "lead", 25, [15, 35], "One built show that ends with the hat.", ["busking"]),
  s("festival", "street festival", "short", 30, [20, 45], "A scheduled festival spot.", ["busking", "festival_sets"]),
  s("private", "private event", "private", 60, [30, 120], "A booked walkabout or set.", ["busking"]),
];

const CIRCUS: SlotDef[] = [
  s("support", "single act", "short", 7, [5, 10], "One act on a variety or cabaret bill.", ["circus_slots"]),
  s("guest", "cabaret spot", "guest", 10, [5, 15], "A spot inside someone else's show.", ["circus_slots"]),
  s("headline", "full show", "lead", 75, [60, 120], "Your whole show.", ["circus_slots"]),
  s("workshop", "workshop", "long", 120, [60, 180], "Teach a class alongside.", ["circus_slots"]),
];

const CHEF: SlotDef[] = [
  s("headline", "supper club", "lead", 5, [4, 7], "One long table, about 5 courses.", ["supper_club"], "courses"),
  s("popup", "pop-up service", "lead", 4, [3, 5], "Two seatings, a short menu.", ["supper_club"], "courses"),
  s("tasting", "tasting menu", "lead", 8, [6, 12], "Many small courses.", ["supper_club"], "courses"),
  s("support", "collab dinner", "shared", 3, [2, 4], "Your courses inside a shared menu.", ["supper_club"], "courses"),
  s("class", "cooking class", "long", 150, [90, 240], "Teach a dish, then eat.", ["supper_club"]),
];

const FILM: SlotDef[] = [
  s("headline", "screening + Q&A", "lead", 120, [90, 150], "Film plus 20–30 min of questions.", ["film_screenings"]),
  s("support", "shorts programme", "shared", 15, [5, 20], "One short inside a programme.", ["film_screenings"]),
  s("festival", "festival screening", "short", 110, [80, 140], "Fixed slot, short Q&A.", ["film_screenings"]),
  s("workshop", "workshop", "long", 180, [90, 360], "A making-of or craft session.", ["film_screenings"]),
];

const TEACHER: SlotDef[] = [
  s("headline", "class", "lead", 75, [60, 90], "A drop-in class.", ["teaching"]),
  s("workshop", "workshop", "long", 180, [120, 360], "A half or full day.", ["teaching"]),
  s("support", "guest class", "guest", 60, [45, 90], "Teaching in someone else's studio.", ["teaching"]),
  s("retreat", "intensive", "long", 360, [240, 480], "Several days, several sessions.", ["teaching"]),
];

const EXHIBIT_MAKER: SlotDef[] = [
  s("headline", "market stall", "long", 360, [240, 480], "A day at a market or fair.", ["maker_markets"]),
  s("popup", "pop-up shop", "short", 12, [6, 30], "A few days in a shop or cafe.", ["gallery_shows"], "pieces"),
  s("support", "group show", "shared", 4, [1, 10], "A few pieces next to other makers.", ["gallery_shows"], "pieces"),
  s("workshop", "workshop", "long", 120, [60, 180], "Make something with the room.", ["maker_markets", "teaching"]),
];

const FALLBACK: SlotDef[] = [
  s("headline", "your own show", "lead", 45, [30, 90], "Your own show.", []),
  s("support", "support", "support", 20, [10, 30], "Before the main act.", []),
  s("co_bill", "shared bill", "shared", 30, [20, 45], "Sharing the night with another act.", []),
  s("guest", "guest spot", "guest", 10, [5, 15], "A few minutes inside someone else's show.", []),
  s("private", "private event", "private", 45, [20, 90], "A booked event; the client sets the tone.", []),
];

// Keyed by discipline key; unknown kinds (added later) get FALLBACK.
export const SLOTS: Partial<Record<PerformerKind, SlotDef[]>> & Record<string, SlotDef[] | undefined> = {
  musician: MUSIC,
  comedian: COMEDY,
  dj: DJ,
  dancer: DANCE,
  poet: POETRY,
  visual_artist: GALLERY,
  author: AUTHOR,
  podcaster: PODCAST,
  speaker: SPEAKER,
  magician: MAGIC,
  theatre: THEATRE,
  photographer: PHOTO,
  maker: EXHIBIT_MAKER,
  busker: BUSK,
  circus: CIRCUS,
  chef: CHEF,
  filmmaker: FILM,
  teacher: TEACHER,
};

export const slotsFor = (kind: string): SlotDef[] => SLOTS[kind] ?? FALLBACK;

// Default slot per discipline: the act's own show.
export const defaultSlot = (kind: string) => slotsFor(kind).find((x) => x.key === "headline") ?? slotsFor(kind)[0];

// Resolve a slot by key. "headline" / "support" always resolve (older callers and the MCP tool
// send only those): "support" falls back to the first support/shared/guest slot.
export function slotFor(kind: string, key?: string, size?: number): SlotDef {
  const list = slotsFor(kind);
  const found =
    list.find((x) => x.key === key) ??
    (key === "support" ? list.find((x) => x.role === "support") ?? list.find((x) => x.role === "shared" || x.role === "guest") : undefined) ??
    defaultSlot(kind);
  return size && size > 0 ? { ...found, size } : found;
}

// Sources for the lengths above (checked 2026-10-30; the newer kinds' sources from web search
// results the same day). Norms vary by room and country.
export const SLOT_SOURCES: Record<string, { title: string; url: string }[]> = {
  music_sets: [
    { title: "Westword: support sets 25–45 min, at least 30", url: "https://www.westword.com/music/heres-how-long-your-set-should-be-5714040/" },
    { title: "Daysheets: support act 30–45 min", url: "https://www.daysheets.com/glossary/support-act" },
    { title: "Daysheets: headliner / co-headline", url: "https://www.daysheets.com/glossary/headliner" },
    { title: "Phoenix New Times: past 60 min is for established acts", url: "https://www.phoenixnewtimes.com/music/a-handy-guide-to-how-long-a-set-your-band-should-play-6600479" },
    { title: "CD Baby: don't overrun as support", url: "https://diymusician.cdbaby.com/?p=27310" },
    { title: "Wikipedia: concert residency", url: "https://en.wikipedia.org/wiki/Concert_residency" },
    // Covers: the venue's licence covers live covers (UK PRS; US: BMI suit held the venue liable).
    { title: "PRS: what licence covers live performances", url: "https://prsformusic.com/help/help-with-buying-a-licence/what-licence-covers-live-performances" },
    { title: "Cleveland Scene: BMI suit names the venue, not the cover band", url: "https://www.clevescene.com/news/copyright-lawsuit-against-medina-bar-unauthorized-show-by-local-classic-rock-cover-band-caused-great-and-incalculable-damage-4024767" },
  ],
  festival_sets: [{ title: "FestivalPro: headliners 60–90, support 45–60, newer acts ~20", url: "https://www.festivalpro.com/festival-management/3852/news/2025/6/30/What-is-the-Typical-Live-Music-Set-Duration.html" }],
  wedding_sets: [{ title: "Greenlight Booking: 2×60 or 3×40–45 min sets", url: "https://www.greenlightbooking.com/how-long-do-wedding-bands-play-for/" }],
  comedy_slots: [
    { title: "Arts DuPage: MC 10–15, feature 25–30, headliner longer", url: "https://www.artsdupage.org/print/venue/36024" },
    { title: "Axios: headliner 45–60 min, local openers shorter", url: "https://www.axios.com/local/charlotte/2025/01/07/duckworths-comedy-club-uptown" },
    { title: "Big Ben Comedy: emcee / opener / middle / headliner / guest spot", url: "https://www.bigbencomedy.com/archives/the-comedy-business-types-of-spots/" },
    { title: "Gold Comedy: the tight five", url: "https://goldcomedy.com/resources/put-together-five-minute-set" },
    { title: "WUNC/NPR: crowd work", url: "https://www.wunc.org/2026-08-12/comedian-jeff-arcuri-talks-about-the-art-of-crowd-work" },
  ],
  fringe_slots: [
    { title: "StarNow: Fringe hour slots ~50–55 min + turnaround", url: "https://www.starnow.com/magazine/article/how-to-perform-at-the-edinburgh-festival-fringe-80460/" },
    { title: "WhatsOnStage: Fringe shows 60–90 min", url: "https://whatsonstage.com/news/edinburgh-festival-fringe-2024-all-you-need-to-know_1613458" },
  ],
  speaker_slots: [
    { title: "BigSpeak: keynotes average 30–60 min", url: "https://www.bigspeak.com/how-long-should-a-keynote-speaker-speak/" },
    { title: "Eventible: keynote 30–60 min, ideal ~45", url: "https://www.eventible.com/learning/how-long-should-a-keynote-speech-be" },
    { title: "I Do Inspire: keynotes 45–60 min incl. Q&A (range 20–90)", url: "https://idoinspire.com/how-long-should-a-keynote-speaker-talk/" },
    { title: "Snapsight: session lengths across 10,000+ sessions", url: "https://web.snapsight.com/blog/ideal-conference-session-length/" },
    { title: "Speakers Canada: keynote / breakout / workshop formats", url: "https://speakerscanada.com/speaker-presentation-session-formats" },
    { title: "NALMS: half-day ≈ 3–3.5 h, full day ≈ 6–7 h", url: "https://www.nalms.org/?p=32577" },
  ],
  ted_18: [{ title: "Labnol: why TED talks are 18 minutes", url: "https://labnol.org/tech/ted-talk-18-minutes/12755" }],
  panel_slots: [
    { title: "Harvard IGLP: panel openings up to 10 min each", url: "https://iglp.law.harvard.edu/?p=226" },
    { title: "GovExec: panel openings overrun", url: "https://govexec.com/management/2019/07/how-not-run-panel/158817" },
  ],
  gallery_shows: [
    { title: "Brent Council: shows run 4–8 weeks", url: "https://www.brent.gov.uk/libraries-arts-and-heritage/willesden-gallery/hire-willesden-gallery" },
    { title: "City of Salisbury: 5–6 week exhibitions", url: "https://salisbury.sa.gov.au/activities/arts-and-culture/have-your-own-exhibition" },
    // Piece counts per show: no source found; sizes here are planning defaults.
  ],
  dance_slots: [{ title: "4dancers: mixed bills of 15–30 min works; full-length ≈ 2 h", url: "https://4dancers.org/tag/possokhov" }],
  poetry_slots: [
    { title: "ArtsKC: open mic 3–5 min, features ≈ 15 min", url: "https://www.artskcgo.com/print/event/23641" },
    { title: "Wombwell Rainbow: headline up to 30 min, ≈ 10 when sharing", url: "https://thewombwellrainbow.com/2020/09/15/applauding-between-poems/" },
  ],
  slam_rules: [{ title: "Oakland University slam rules: 3 min + 10 s grace", url: "https://library.oakland.edu/events/library_events/slamrules.html" }],
  dj_slots: [
    { title: "Digital DJ Tips: warm-up sets", url: "https://www.digitaldjtips.com/how-to-dj-warm-up-sets/" },
    { title: "Mixgraph: warm-up 1–2 h", url: "https://www.mixgraph.io/glossary/warm-up" },
    { title: "Dubspot: opening DJ etiquette", url: "https://blog.dubspot.com/tips-for-opening-djs" },
  ],
  author_events: [{ title: "Penguin Random House: reading 15–20, Q&A 10–15, signing", url: "https://authornews.penguinrandomhouse.com/what-to-expect-at-an-author-event/" }],
  podcast_live: [{ title: "Cohost: live podcasting formats", url: "https://cohostpodcasting.com/resources/live-podcasting" }],
  magic_slots: [
    { title: "Vanishing Inc: close-up vs parlour vs stage", url: "https://vanishingincmagic.com/stage-and-parlor-magic/articles/the-difference-between-stage-and-parlor-magic" },
    { title: "Magical Katrina: strolling magic usually 1–2 h", url: "https://magicalkatrina.com/magiciansblog/g34vunc2oid7yaly7fc0j32w89o7bo" },
    { title: "Goodman Theatre: The Magic Parlour, a ~90 min parlour show", url: "https://www.goodmantheatre.org/show/the-magic-parlour/" },
  ],
  theatre_lengths: [
    { title: "Letter Review: a play usually lasts 2–2.5 h", url: "https://letterreview.com/how-long-does-a-play-usually-last/" },
    { title: "Wikipedia: one-act play", url: "https://en.wikipedia.org/wiki/One-act_play" },
  ],
  busking: [
    { title: "Covent Garden: street performers", url: "https://www.coventgarden.london/street-performers" },
    { title: "Melksham Town Council: 45-min pitch rotation", url: "https://www.melksham-tc.gov.uk/wp-content/uploads/2025/06/Item-9-Buskers-Code-of-Practice.pdf" },
    { title: "Oxford City Council buskers code: 1 h per pitch", url: "https://www.oxford.gov.uk/downloads/file/742/oxford-city-council-buskers-code-of-practice" },
    { title: "Buskers Braunschweig: 1 h slots, circle shows 20–50 min", url: "https://www.buskers-braunschweig.de/kuenstler-faq/" },
  ],
  circus_slots: [
    { title: "Cirque Mechanics: ambient acts 4–6 min, repeated (weak source)", url: "https://dev.cirquemechanics.com/?p=309" },
    { title: "Totem at Royal Albert Hall: ~2 h 10 min incl. interval", url: "https://theatre.ticketmaster.co.uk/JYB2-totem-london-2019/" },
  ],
  supper_club: [
    { title: "FSR: supper clubs 4–8 courses, two seatings", url: "https://www.fsrmagazine.com/industry-news/supper-club-open-monthly-pop-heights-house-hotel-raleigh-north-carolina/" },
    { title: "Checkout Page: supper club set menus 4–7 courses", url: "https://checkoutpage.com/blog/how-to-start-a-supper-club" },
    { title: "Tasting Table: tasting menus 6–12 courses", url: "https://www.tastingtable.com/1773444/everything-to-know-tasting-menus" },
    { title: "Hudson Table: hands-on cooking classes ~3 h", url: "https://hudsontable.com/hoboken/public-hands-on-cooking-classes/" },
  ],
  film_screenings: [
    { title: "Mountainfilm: feature Q&As 10–15 min, shorts 5–10 min", url: "https://www.mountainfilm.org/submit-a-film/attending-filmmaker-expectations/" },
    { title: "NFB organizer guide: 15–20 min audience discussion", url: "https://events.nfb.ca/wp-content/uploads/2026/04/NFB_Impact_Organizer-Guide.pdf" },
    { title: "Academy rules: a short film runs 40 min or less", url: "https://www.oscars.org/sites/oscars/files/2024-04/97_animated_short_rules.pdf" },
  ],
  teaching: [
    { title: "NALMS: half-day / full-day workshop hours", url: "https://www.nalms.org/?p=32577" },
    { title: "Calgary Parks & Rec: adult dance classes 60–90 min", url: "https://calgary.ca/parks-rec-programs/dance-classes.html" },
    { title: "Yoga Journal: yoga classes run 60–90 min", url: "https://www.yogajournal.com/teach/how-long-should-a-yoga-class-last" },
    { title: "Triad Yoga: 5-day immersion, 27 h of teaching", url: "https://triadyoga.com/5-day-yoga-workshop-immersion-with-terry-brown-july-14th-19th/" },
  ],
  photo_shows: [
    { title: "Artnet: standard gallery runs 5–6 weeks or longer", url: "https://news.artnet.com/art-world/short-shows-new-york-3-2754197" },
    { title: "All About Photo: solo exhibitions of 6–14 photographs", url: "https://www.all-about-photo.com/all-about-photo-contest/248/solo-exhibition-november-2026" },
  ],
  // Stall-day hours: one fair's trading hours; no general source found.
  maker_markets: [
    { title: "Crux Craft Fair: trading 10am–5pm", url: "https://form.jotform.com/200464272349050" },
    { title: "Bradford on Avon: 2 h pottery taster workshop", url: "https://www.bradfordonavon.co.uk/events/event/pottery-wheel-taster-session-morning" },
  ],
};
