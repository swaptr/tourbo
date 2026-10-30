import type { PerformerKind } from "../shared/types.ts";

// One record per discipline (PLAN §16). The engine reads these instead of branching on kind.
// Client-safe: no server imports. Tag ids and counts come from probes run 2026-10-30
// (Chicago / London / Mumbai, raw output in /tmp only).

export type EntityType = "urn:entity:artist" | "urn:entity:person" | "urn:entity:book" | "urn:entity:podcast";
export type Space = { tag: string; label: string; capacity: number };

export type Discipline = {
  key: PerformerKind;
  label: string; // "Singer / band"
  noun: string; // "concert", used in prompts
  hint: string; // onboarding tile
  entityTypes: EntityType[]; // resolve order
  spaces: Space[];
  peerType: EntityType; // who the "support" act is
  musicFilter: boolean; // drop non-performers from artist results (isMusician)
  peerPattern?: RegExp; // person peers must match this in their description (drops actors, politicians)
  localScene: boolean; // look for a local-scene opener among the city's own artists
  support: string; // "opener", "support act", "co-exhibitor"
  ticketFactor: number; // reference price vs the musician price for the region
  perHeadSales: number; // extra take per attendee (merch, books, prints, workshops) as share of the reference price
  stayDays: number; // 1 = one night per city; exhibitions run longer
  deals?: ("door_split" | "guarantee" | "versus" | "bar_deal" | "exhibition" | "commission")[]; // default: the four ticketed deals
  commission?: number; // flat fee for a mural / live-painting commission, as a multiple of the reference price
  revenue: string[];
  prep: string; // show-notes system prompt (sections fixed in prep.server.ts)
  rooms: string; // worker guidance: which spaces to keep or exclude
  example: string; // placeholder act name
  scene: string; // example genre/scene tags for act-less mode
  verified: string;
};

const MUSIC_SPACES: Space[] = [
  { tag: "urn:tag:category:place:live_music_venue", label: "music venue", capacity: 500 },
  { tag: "urn:tag:category:place:concert_hall", label: "hall / theatre", capacity: 1200 },
  { tag: "urn:tag:category:place:night_club", label: "club", capacity: 400 },
  { tag: "urn:tag:category:place:bar", label: "bar", capacity: 120 },
];
const THEATRE: Space = { tag: "urn:tag:genre:place:performing_arts_theater", label: "hall / theatre", capacity: 600 };
const BAR = MUSIC_SPACES[3];
const CAFE: Space = { tag: "urn:tag:category:place:cafe", label: "cafe", capacity: 60 };
const BOOKSTORE: Space = { tag: "urn:tag:category:place:book_store", label: "bookstore", capacity: 80 };
const GALLERY: Space = { tag: "urn:tag:category:place:art_gallery", label: "gallery", capacity: 150 };

const SECTIONS_NOTE = "Sections: opening, setlist, material, banter, crowd, staging, sponsor, avoid; leave a section empty when it doesn't apply.";

export const DISCIPLINES: Record<PerformerKind, Discipline> = {
  musician: {
    key: "musician",
    label: "Singer / band",
    noun: "concert",
    hint: "Solo artist, band, singer-songwriter",
    entityTypes: ["urn:entity:artist"],
    spaces: MUSIC_SPACES,
    peerType: "urn:entity:artist",
    musicFilter: true,
    localScene: true,
    support: "opener",
    ticketFactor: 1,
    perHeadSales: 0,
    stayDays: 1,
    revenue: ["ticketed", "bar deal"],
    prep: `You prepare one night of a touring musician's show. Sections: opening (first words on stage), setlist (where to place songs, a cover or nod to a local act, encore idea), banter (between-song lines), crowd (a call-and-response or moment with the room), staging (room setup: stage, sound, merch table, door time, sized to the venue and expected crowd), sponsor (a concrete co-promo ask to one sponsor candidate), avoid (what not to do or say here).`,
    rooms: "Only bookable rooms where the artist would headline: clubs, theatres, music halls. Exclude festivals, outdoor parks or shells, arenas and stadiums far above the requested room size, restaurants and cafes that only host background music.",
    example: "Japanese Breakfast",
    scene: "indie pop, shoegaze",
    verified: "2026-10-29: artist search + heatmaps; 4 place tags ≥ 8 rooms in 68 seed cities",
  },
  comedian: {
    key: "comedian",
    label: "Comedian",
    noun: "stand-up comedy",
    hint: "Stand-up, storyteller, host",
    entityTypes: ["urn:entity:person"],
    spaces: [
      { tag: "urn:tag:category:place:comedy_club", label: "comedy club", capacity: 200 },
      { tag: "urn:tag:genre:place:comedy_club", label: "comedy club", capacity: 200 },
      BAR,
      MUSIC_SPACES[1],
    ],
    peerType: "urn:entity:person",
    musicFilter: false,
    localScene: false,
    support: "opener",
    ticketFactor: 1.15,
    perHeadSales: 0,
    stayDays: 1,
    revenue: ["ticketed", "bar deal"],
    prep: `You prepare one night of a touring stand-up comedian's show. Sections: opening (first 30 seconds, a local hook), material (premises or angles for new local bits, not finished jokes), crowd (crowd-work topics likely to land with this audience), banter (tag lines between bits), staging (room setup: mic, lights, seating, door time, opener slot length, sized to the venue and expected crowd), sponsor (a concrete co-promo ask to one sponsor candidate), avoid (topics likely to fall flat or offend here).`,
    rooms: "Only rooms where a comedian can headline a ticketed set: comedy clubs, theatres, bars or lounges with a stage or event space. Exclude festivals, outdoor parks, restaurants without a stage, academies, offices, hotels' banquet halls unless clearly an event venue, and arenas far above the requested room size. Prefer comedy clubs.",
    example: "Zakir Khan",
    scene: "stand-up comedy",
    verified: "2026-10-29: person search + heatmaps; comedy_club tag (Chicago 8+, Mumbai thin)",
  },
  dj: {
    key: "dj",
    label: "DJ / producer",
    noun: "club night",
    hint: "Club nights, b2b sets, raves",
    entityTypes: ["urn:entity:artist"],
    spaces: [
      MUSIC_SPACES[2],
      { tag: "urn:tag:category:place:lounge", label: "lounge", capacity: 150 },
      BAR,
      MUSIC_SPACES[0],
    ],
    peerType: "urn:entity:artist",
    musicFilter: true,
    localScene: true,
    support: "warm-up DJ",
    ticketFactor: 0.9,
    perHeadSales: 0,
    stayDays: 1,
    revenue: ["ticketed", "bar deal"],
    prep: `You prepare one club night for a touring DJ. ${SECTIONS_NOTE} Use: opening (first track idea and mic line if any), setlist (set arc by hour, a local artist or track to nod to), crowd (a peak moment for this crowd), staging (booth, sound, lights, door and curfew, sized to the room), sponsor (one co-promo ask), avoid (what not to play or do here).`,
    rooms: "Only clubs, lounges and bars with a booth or dance floor where a DJ can headline a night. Exclude restaurants, festivals, arenas and daytime-only cafes.",
    example: "Peggy Gou",
    scene: "techno, house",
    verified: "2026-10-30: artist search (Peggy Gou); night_club and lounge 20/20/20 rooms; techno tag heatmap ranks cities",
  },
  dancer: {
    key: "dancer",
    label: "Dancer / company",
    noun: "dance performance",
    hint: "Solo, company, workshops",
    entityTypes: ["urn:entity:person", "urn:entity:artist"],
    spaces: [
      THEATRE,
      { tag: "urn:tag:category:place:dance_school", label: "dance studio", capacity: 60 },
      MUSIC_SPACES[1],
    ],
    peerType: "urn:entity:person",
    musicFilter: false,
    localScene: false,
    support: "co-bill",
    peerPattern: /\b(danc\w*|choreograph\w*|ballet|ballerina)\b/i,
    ticketFactor: 1.2,
    perHeadSales: 0.15, // workshop seats sold alongside shows
    stayDays: 2,
    revenue: ["ticketed", "workshop"],
    prep: `You prepare one performance and workshop stop for a touring dancer or company. ${SECTIONS_NOTE} Use: opening (how the piece starts and the first words to the room), setlist (order of pieces, a local music or motif nod), material (a short workshop plan for local dancers), crowd (a moment with the audience), staging (floor, stage size, lights, sound, changing space), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only theatres, performing-arts halls and dance studios with a usable floor. Exclude bars without a stage, restaurants, arenas and outdoor parks.",
    example: "Akram Khan",
    scene: "contemporary dance, kathak",
    verified: "2026-10-30: person search (Akram Khan); performing_arts_theater 20/20/18, dance_school 10/16/11; contemporary tag heatmap ranks cities",
  },
  poet: {
    key: "poet",
    label: "Poet / spoken word",
    noun: "spoken-word show",
    hint: "Readings, slams, theatre",
    entityTypes: ["urn:entity:person"],
    spaces: [THEATRE, BOOKSTORE, CAFE, BAR],
    peerType: "urn:entity:person",
    musicFilter: false,
    localScene: false,
    support: "local poet",
    peerPattern: /\b(poet|poetry|spoken[- ]word|writer|author|lyricist)\b/i,
    ticketFactor: 0.7,
    perHeadSales: 0.2, // books and zines
    stayDays: 1,
    revenue: ["ticketed", "book sales"],
    prep: `You prepare one evening for a touring poet or spoken-word artist. ${SECTIONS_NOTE} Use: opening (first lines to the room), setlist (order of pieces, one local reference or dedication), banter (between-piece lines), crowd (an open-mic slot or call-and-response), staging (mic, seating, book table, door time), sponsor (one co-promo ask), avoid (topics likely to fall flat here).`,
    rooms: "Only theatres, bookstores, cafes and bars that host readings or events. Exclude arenas, clubs that only do dance nights, restaurants and outdoor parks.",
    example: "Rupi Kaur",
    scene: "poetry, poetry slam",
    verified: "2026-10-30: person search (Rupi Kaur); book_store and cafe 20/20/20; poetry tag heatmap ranks cities",
  },
  visual_artist: {
    key: "visual_artist",
    label: "Painter / visual artist",
    noun: "exhibition",
    hint: "Shows, pop-ups, live painting",
    entityTypes: ["urn:entity:person"],
    spaces: [
      GALLERY,
      { tag: "urn:tag:category:place:museum", label: "museum", capacity: 400 },
      CAFE,
      BAR,
    ],
    peerType: "urn:entity:person",
    musicFilter: false,
    localScene: false,
    support: "co-exhibitor",
    peerPattern: /\b(artist|painter|sculptor|illustrator|photographer|muralist|graffiti|printmaker|designer)\b/i,
    ticketFactor: 0.4, // entry or opening-night ticket
    perHeadSales: 0.8, // print and original sales net of commission, per visitor
    stayDays: 14,
    deals: ["exhibition", "commission", "door_split"],
    commission: 60,
    revenue: ["entry", "sales commission", "workshop"],
    prep: `You prepare one city's exhibition for a touring visual artist. ${SECTIONS_NOTE} Use: opening (opening-night remarks), setlist (which pieces to hang and in what order, one piece or motif tied to the city), material (a live-painting or mural idea), crowd (an interactive moment), staging (hanging, lighting, wall space, shipping and insurance notes), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only galleries, museums, and cafes or bars that hang work or host pop-ups. Exclude arenas, clubs, restaurants without wall space and outdoor parks.",
    example: "your name",
    scene: "street art, contemporary art",
    verified: "2026-10-30: art_gallery 20/20/16, museum 20/20/9; street_art tag + Banksy as a peer ranks cities; most painters are not Qloo entities, so plan from peers",
  },
  author: {
    key: "author",
    label: "Author",
    noun: "book event",
    hint: "Readings, signings, festivals",
    entityTypes: ["urn:entity:person", "urn:entity:book"],
    spaces: [BOOKSTORE, { tag: "urn:tag:category:place:library", label: "library", capacity: 100 }, CAFE, THEATRE],
    peerType: "urn:entity:person",
    musicFilter: false,
    localScene: false,
    support: "in-conversation host",
    peerPattern: /\b(author|writer|novelist|poet|journalist|essayist)\b/i,
    ticketFactor: 0.6,
    perHeadSales: 0.5, // signed copies
    stayDays: 1,
    revenue: ["ticketed", "book sales"],
    prep: `You prepare one book event for a touring author. ${SECTIONS_NOTE} Use: opening (first words, a local angle), setlist (which excerpt to read and why it fits this city), material (Q&A questions to expect and short answers), crowd (an audience moment), staging (seating, mic, signing table, door time), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only bookstores, libraries, cafes and theatres that host readings. Exclude clubs, arenas, restaurants and outdoor parks.",
    example: "Sally Rooney",
    scene: "literary fiction",
    // Book heatmaps are far richer than the author's person entity (Normal People: 1/26 EU cities thin;
    // Sally Rooney as a person: 22/26 thin), so authors should add their book as a peer.
    verified: "2026-10-30: person + book search; book heatmap (Normal People) ranks London, Amsterdam, Bristol with 1/26 thin vs 22/26 for the author as a person: add your book as a peer; book_store 20/20/20, library 5/20/5",
  },
  podcaster: {
    key: "podcaster",
    label: "Podcaster",
    noun: "live podcast show",
    hint: "Live tapings, Q&As",
    entityTypes: ["urn:entity:podcast", "urn:entity:person"],
    spaces: [THEATRE, MUSIC_SPACES[1], { tag: "urn:tag:category:place:comedy_club", label: "comedy club", capacity: 200 }],
    peerType: "urn:entity:podcast",
    musicFilter: false,
    localScene: false,
    support: "local guest",
    ticketFactor: 1.4,
    perHeadSales: 0.1,
    stayDays: 1,
    revenue: ["ticketed", "merch"],
    prep: `You prepare one live taping for a touring podcast. ${SECTIONS_NOTE} Use: opening (cold open with a local hook), setlist (episode segments in order), material (local topics and a local guest idea), crowd (an audience Q&A or game), staging (mics, seating, recording setup, door time), sponsor (one live-read idea), avoid (topics likely to fall flat here).`,
    rooms: "Only theatres, halls and comedy clubs with seating and a stage. Exclude clubs that only do dance nights, restaurants, arenas far above the room size and outdoor parks.",
    example: "My Favorite Murder",
    scene: "true crime",
    verified: "2026-10-30: podcast heatmaps (My Favorite Murder, Call Her Daddy) 0/55 NA cities thin, Chicago top for both; performing_arts_theater 20/20/18",
  },
};

export const discipline = (kind: PerformerKind = "musician") => DISCIPLINES[kind] ?? DISCIPLINES.musician;

// Room label → default capacity, across every discipline.
export const ROOM_CAPACITY: Record<string, number> = Object.fromEntries(
  Object.values(DISCIPLINES).flatMap((d) => d.spaces.map((s) => [s.label, s.capacity])),
);

// Room label for a place tag; music labels as before.
export function spaceLabel(tag: string) {
  for (const d of Object.values(DISCIPLINES)) for (const s of d.spaces) if (s.tag === tag) return s.label;
  if (tag.includes("comedy_club")) return "comedy club";
  if (tag.endsWith(":bar")) return "bar";
  if (tag.endsWith(":night_club")) return "club";
  if (tag.endsWith(":concert_hall")) return "hall / theatre";
  return "music venue";
}
