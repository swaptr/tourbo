import type { IdeaCategory } from "../engine/ideas-rank.ts";
import type { DetailField, MaterialType } from "../material/material.ts";
import type { PerformerKind } from "../shared/types.ts";

// One record per discipline (PLAN §16). The engine reads these instead of branching on kind.
// Client-safe: no server imports. Tag ids and counts for the first eight come from probes run
// 2026-10-30 (Chicago / London / Mumbai, raw output in /tmp only). The later ten (speaker…teacher)
// were added with the fan-data quota exhausted: their tags are the ones above plus ids printed in
// qloo-docs schema-taxonomy.md (place genres, restaurant / hotel subgenres), not probed.

export type EntityType = "urn:entity:artist" | "urn:entity:person" | "urn:entity:book" | "urn:entity:podcast" | "urn:entity:movie";
export type Space = { tag: string; label: string; capacity: number };

// "Ideas for this place" (PLAN §18 Q12): which idea categories a discipline gets per city.
// engine/ideas.ts `ideaPlan()` reads these. `types` overrides the category's entity types for
// location-only insights (`signal.location.query`); `tags` are place tags (`urn:entity:place` +
// `filter.location.query` + `filter.tags`). Types are Qloo insights types from
// available-parameters-by-entity-type.md; "urn:tag" = tag insights (taste-analysis.md).
export type IdeaType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:tag";
export type IdeaSpec = { category: IdeaCategory; take?: number; types?: IdeaType[]; tags?: string[] };

// Money for per-head classes (yoga, pottery, aerial). Fee and materials are multiples of the
// region's musician reference ticket, so they follow local price levels.
export type Workshop = {
  fee: number; // seat price
  classSize: number; // seats per session (caps the room)
  sessions: number; // per stop
  takeUp: number; // share of the act's draw that books a seat (1 = the class is the show)
  materials?: number; // per seat
};

export type Discipline = {
  key: PerformerKind;
  label: string; // one word, "Musician"; DB act_kinds overrides it (labels.server.ts)
  noun: string; // "concert", used in prompts
  hint: string; // onboarding tile hint line, "Bands, singers, songwriters"; DB act_kinds overrides it
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
  shows?: number; // ticketed performances (or seatings) per stop over the stay; default 1
  deals?: ("door_split" | "guarantee" | "versus" | "bar_deal" | "exhibition" | "commission" | "workshop" | "tips" | "supper_club")[]; // default: the four ticketed deals
  commission?: number; // flat fee for a mural / live-painting commission, as a multiple of the reference price
  workshop?: Workshop; // needed when deals include "workshop"
  perHeadCost?: number; // the act's own cost per guest (supper-club food), share of the reference price
  tipsPerHead?: number; // street shows: hat / tips per person who stops, share of the reference price
  revenue: string[];
  ideas: IdeaSpec[]; // idea categories per city, in display order
  setOrder: boolean; // "Build my set" applies (songs / bits / pieces in a running order)
  crowdWork: boolean; // ideas come with crowd-work questions
  prep: string; // show-notes system prompt (sections fixed in prep.server.ts)
  rooms: string; // worker guidance: which spaces to keep or exclude
  example: string; // placeholder act name
  scene: string; // example genre/scene tags for act-less mode
  verified: string;
  workspace: Workspace; // tabs, labels, Library nouns and show-form hints for this kind (WORKSPACES)
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
const MUSEUM: Space = { tag: "urn:tag:category:place:museum", label: "museum", capacity: 400 };
const LIBRARY: Space = { tag: "urn:tag:category:place:library", label: "library", capacity: 100 };
const COMEDY_CLUB: Space = { tag: "urn:tag:category:place:comedy_club", label: "comedy club", capacity: 200 };
const LOUNGE: Space = { tag: "urn:tag:category:place:lounge", label: "lounge", capacity: 150 };
const STUDIO: Space = { tag: "urn:tag:category:place:dance_school", label: "dance studio", capacity: 60 };
const RESTAURANT: Space = { tag: "urn:tag:category:place:restaurant", label: "restaurant", capacity: 50 }; // as engine/angles.ts
// Ids below are from qloo-docs schema-taxonomy.md (Places taxonomy tables), not probed.
const HOTEL: Space = { tag: "urn:tag:genre:place:hotel", label: "hotel event room", capacity: 300 };
const WELLNESS: Space = { tag: "urn:tag:genre:place:hotel:wellness", label: "wellness hotel", capacity: 40 };
const FINE_DINING: Space = { tag: "urn:tag:genre:place:restaurant:fine_dining", label: "dining room", capacity: 40 };
const PARK: Space = { tag: "urn:tag:genre:place:park", label: "park", capacity: 80 };
const ATTRACTION: Space = { tag: "urn:tag:genre:place:tourist_attraction", label: "landmark square", capacity: 100 };
const MALL: Space = { tag: "urn:tag:genre:place:shopping_mall", label: "shopping centre", capacity: 60 };

// Idea presets (see IdeaSpec). Landmark tags: tourist_attraction (ideas.ts default), plus
// historical_landmark and park from schema-taxonomy.md.
const LANDMARK_TAGS = ["urn:tag:genre:place:tourist_attraction", "urn:tag:genre:place:historical_landmark", "urn:tag:genre:place:park"];
const TALK_IDEAS: IdeaSpec[] = [
  { category: "trending", take: 2 },
  { category: "screen", take: 3 },
  { category: "brands", take: 2 },
  { category: "food_places", take: 2 },
  { category: "people", take: 2 },
  { category: "themes", take: 2 },
];
const SUBJECT_IDEAS: IdeaSpec[] = [
  { category: "landmarks", take: 3, tags: LANDMARK_TAGS },
  { category: "themes", take: 3 },
  { category: "artists_films", take: 3 },
  { category: "food_places", take: 1 },
  { category: "people", take: 1 },
];
const MOVEMENT_IDEAS: IdeaSpec[] = [
  { category: "music", take: 3 }, // music the city loves: pieces to move to
  { category: "themes", take: 2 },
  { category: "landmarks", take: 2, tags: LANDMARK_TAGS },
  { category: "people", take: 1, types: ["urn:entity:person"] },
];
// ── Workspace per kind (surface brief app-routes-plan-id-tsx.md "## Tabs by kind") ──────────────
// What a tour of this kind shows: which tabs (shared ones with a kind-tuned name, plus tabs only
// some kinds get), their single-word labels, the night panel's tabs, the Library's item noun and
// types, and the show form's date / venue hints. Data, not branches: the tour page reads it via
// workspaceFor(kind). Kind tabs are also gated on data (tabHasData) so none ever opens empty.

// Shared tabs (most kinds) and kind tabs (only where the config lists them).
export const SHARED_TABS = ["tonight", "plan", "ideas", "set", "prep", "pipeline", "insights", "live", "compare"] as const;
export const KIND_TABS = ["covers", "openers", "crowd", "tone", "sales", "sessions", "pitches"] as const;
export const TOUR_TAB_IDS = [...SHARED_TABS, ...KIND_TABS] as const;
export type TourTabId = (typeof TOUR_TAB_IDS)[number];
export type KindTabId = (typeof KIND_TABS)[number];
export const NIGHT_TAB_IDS = ["venue", "ideas", "set", "prep"] as const;
export type NightTabId = (typeof NIGHT_TAB_IDS)[number];

// How the Set tab's interior reads: a setlist, a run of bits, a running order, a hang list, a
// menu in courses, a class plan, a stall.
export type SetStyle = "setlist" | "bits" | "order" | "hang" | "menu" | "class" | "stall";

export type Workspace = {
  main: TourTabId[]; // the tab row, in order (Plan first); Tonight is added in front on the road
  more: TourTabId[]; // under More
  road?: TourTabId; // on the road this tab swaps places with Booking (default Tickets when shown)
  labels: Partial<Record<TourTabId, string>>; // single plain words; default names in TAB_NAMES
  night: NightTabId[]; // the night panel's tabs
  nightLabels: Partial<Record<NightTabId, string>>;
  set: { heading: string; style: SetStyle }; // heading over the set ("Setlist", "Hang list", "Menu")
  support: boolean; // show the support act (opener, co-bill, host) on the night's Room
  item: [string, string]; // one item of the act's Library: singular, plural
  types: MaterialType[]; // Library types offered, first = default
  typeLabels?: Partial<Record<MaterialType, string>>; // "song" shown as "Track" for a DJ
  fields: DetailField[]; // optional Library details this kind fills (key, tempo, size, course…); the Set shows them
  event: { start: string; end: string; hint: string; venue: string; classes?: { sessions: string; seats: string } }; // the show form's fields
};

export const TAB_NAMES: Record<TourTabId, string> = {
  tonight: "Tonight",
  plan: "Plan",
  ideas: "Ideas",
  set: "Set",
  prep: "Notes",
  pipeline: "Booking",
  insights: "Numbers",
  live: "Tickets",
  compare: "Compare",
  covers: "Covers",
  openers: "Openers",
  crowd: "Crowd",
  tone: "Tone",
  sales: "Sales",
  sessions: "Sessions",
  pitches: "Pitches",
};
export const NIGHT_TAB_NAMES: Record<NightTabId, string> = { venue: "Room", ideas: "Ideas", set: "Set", prep: "Notes" };

const MORE: TourTabId[] = ["insights", "live", "compare"];
const NIGHT_EVENT = { start: "First day", end: "Last day", hint: "One night, or a few in a row. Dates and venue can wait.", venue: "Venue" };
const RUN_EVENT = { start: "Opening night", end: "Closing night", hint: "A run of nights in one place, Thursday to Saturday say.", venue: "Venue" };
const SHOW_EVENT = { start: "Opening day", end: "Closing day", hint: "Shows usually hang two to six weeks. Dates and space can wait.", venue: "Space" };
const NIGHT_TABS: NightTabId[] = ["venue", "ideas", "set", "prep"];
// Library details per set style: what the Set's interior shows for each item.
const FIELDS: Record<SetStyle, DetailField[]> = {
  setlist: ["key", "bpm", "energy"], // energy curve across the set
  bits: ["marker"], // opener / callback / closer
  order: [], // timed: each item gets its start time
  class: ["part"],
  hang: ["size", "price"], // the wall, in order
  stall: ["size", "price"],
  menu: ["course", "price"], // courses
};
const CLASSES = { sessions: "Sessions", seats: "Seats per session" };

function ws(w: Partial<Workspace> & Pick<Workspace, "item" | "types" | "set">): Workspace {
  const labels = { ...w.labels };
  return {
    main: w.main ?? ["plan", "ideas", "set", "prep", "pipeline"],
    more: w.more ?? MORE,
    road: w.road,
    labels,
    night: w.night ?? NIGHT_TABS,
    nightLabels: { set: labels.set, ...w.nightLabels },
    set: w.set,
    support: w.support ?? true,
    item: w.item,
    types: w.types,
    typeLabels: w.typeLabels,
    fields: w.fields ?? FIELDS[w.set.style],
    event: w.event ?? NIGHT_EVENT,
  };
}

const EXHIBIT = (item: [string, string], typeLabels?: Workspace["typeLabels"]) =>
  ws({
    main: ["plan", "ideas", "set", "prep", "pipeline"],
    more: ["sales", "insights", "compare"], // no ticket check-ins: entry is often free
    road: "sales",
    labels: { set: "Hang", tonight: "Today" },
    nightLabels: { venue: "Space" },
    set: { heading: "Hang list", style: "hang" },
    support: false, // no opener at an exhibition
    item,
    types: ["piece", "other"],
    typeLabels,
    event: SHOW_EVENT,
  });

export const WORKSPACES: Record<PerformerKind, Workspace> = {
  musician: ws({ main: ["plan", "ideas", "covers", "set", "prep", "pipeline"], more: ["openers", ...MORE], set: { heading: "Setlist", style: "setlist" }, item: ["song", "songs"], types: ["song", "other"] }),
  comedian: ws({ main: ["plan", "ideas", "crowd", "set", "prep", "pipeline"], more: ["tone", ...MORE], set: { heading: "Set", style: "bits" }, item: ["bit", "bits"], types: ["bit", "other"] }),
  dj: ws({ more: ["openers", ...MORE], set: { heading: "Setlist", style: "setlist" }, item: ["track", "tracks"], types: ["song", "other"], typeLabels: { song: "Track" } }),
  dancer: ws({ more: ["sessions", ...MORE], labels: { set: "Programme" }, set: { heading: "Running order", style: "order" }, item: ["piece", "pieces"], types: ["routine", "piece", "other"], typeLabels: { routine: "Piece", piece: "Solo" }, event: { ...RUN_EVENT, classes: CLASSES } }),
  poet: ws({ set: { heading: "Running order", style: "order" }, item: ["poem", "poems"], types: ["piece", "other"], typeLabels: { piece: "Poem" } }),
  visual_artist: EXHIBIT(["piece", "pieces"]),
  author: ws({ labels: { set: "Reading" }, set: { heading: "Running order", style: "order" }, item: ["reading", "readings"], types: ["talk", "piece", "other"], typeLabels: { talk: "Reading", piece: "Excerpt" } }),
  podcaster: ws({ more: ["crowd", "tone", ...MORE], labels: { set: "Rundown" }, set: { heading: "Rundown", style: "order" }, item: ["segment", "segments"], types: ["talk", "bit", "other"], typeLabels: { talk: "Segment" } }),
  speaker: ws({ more: ["crowd", "tone", ...MORE], labels: { set: "Talk" }, set: { heading: "Running order", style: "order" }, item: ["talk", "talks"], types: ["talk", "other"] }),
  magician: ws({ more: ["crowd", ...MORE], set: { heading: "Set", style: "bits" }, item: ["trick", "tricks"], types: ["routine", "other"], typeLabels: { routine: "Trick" } }),
  theatre: ws({ more: ["crowd", ...MORE], labels: { set: "Programme" }, set: { heading: "Running order", style: "order" }, item: ["scene", "scenes"], types: ["piece", "other"], typeLabels: { piece: "Scene" }, event: RUN_EVENT }),
  photographer: EXHIBIT(["print", "prints"], { piece: "Print" }),
  maker: ws({
    more: ["sessions", "sales", "insights", "compare"],
    road: "sales",
    labels: { set: "Stall", tonight: "Today" },
    nightLabels: { venue: "Space" },
    set: { heading: "On the stall", style: "stall" },
    support: false,
    item: ["piece", "pieces"],
    types: ["piece", "other"],
    event: { start: "First day", end: "Last day", hint: "A weekend market or a pop-up week. Dates and space can wait.", venue: "Space", classes: { sessions: "Workshops", seats: "Seats per workshop" } },
  }),
  busker: ws({
    // No tickets and no venue booking: the pitch is the room, permits replace booking emails.
    main: ["plan", "ideas", "pitches", "set", "prep"],
    more: ["crowd", "pipeline", "insights", "compare"],
    labels: { pipeline: "Permits", tonight: "Today" },
    nightLabels: { venue: "Pitch" },
    set: { heading: "Setlist", style: "setlist" },
    support: false,
    item: ["song", "songs"],
    types: ["song", "routine", "other"],
    typeLabels: { routine: "Act" },
    event: { start: "First day", end: "Last day", hint: "A few days on the street. The pitch can wait.", venue: "Pitch" },
  }),
  circus: ws({ more: ["sessions", ...MORE], labels: { set: "Programme" }, set: { heading: "Running order", style: "order" }, item: ["routine", "routines"], types: ["routine", "other"], typeLabels: { routine: "Act" }, event: { ...RUN_EVENT, classes: CLASSES } }),
  chef: ws({
    more: ["sessions", ...MORE],
    labels: { set: "Menu", live: "Seats" },
    set: { heading: "Menu", style: "menu" },
    support: false, // the chef is the guest
    item: ["dish", "dishes"],
    types: ["piece", "other"],
    typeLabels: { piece: "Dish" },
    event: { start: "First seating", end: "Last seating", hint: "One or two seatings, or a residency of a few nights.", venue: "Kitchen", classes: { sessions: "Seatings", seats: "Seats per seating" } },
  }),
  filmmaker: ws({ labels: { set: "Programme" }, set: { heading: "Programme", style: "order" }, item: ["film", "films"], types: ["piece", "talk", "other"], typeLabels: { piece: "Film", talk: "Q&A" } }),
  teacher: ws({
    // Seats per session replace ticket check-ins.
    main: ["plan", "ideas", "set", "sessions", "prep", "pipeline"],
    more: ["insights", "compare"],
    labels: { set: "Class", tonight: "Today" },
    nightLabels: { venue: "Studio" },
    set: { heading: "Class plan", style: "class" },
    support: false,
    item: ["lesson", "lessons"],
    types: ["talk", "routine", "other"],
    typeLabels: { talk: "Lesson", routine: "Exercise" },
    event: { start: "First class", end: "Last class", hint: "A day, a weekend, or a week of classes. Dates and studio can wait.", venue: "Studio", classes: CLASSES },
  }),
};

export const workspaceFor = (kind?: PerformerKind | string | null): Workspace => WORKSPACES[kind as PerformerKind] ?? WORKSPACES.musician;
export const tabLabel = (w: Workspace, tab: TourTabId) => w.labels[tab] ?? TAB_NAMES[tab];
export const nightTabLabel = (w: Workspace, tab: NightTabId) => w.nightLabels[tab] ?? NIGHT_TAB_NAMES[tab];
export const isKindTab = (t: string): t is KindTabId => (KIND_TABS as readonly string[]).includes(t);

// Saved-idea counts a kind tab needs (from the layout's tab counts).
export type KindTabCounts = { covers?: number; questions?: number };
type PlanLike = { stops: { venue?: unknown; opener?: unknown; localArtists?: unknown[]; money?: { deal: string; verdict: string }; place?: { tone?: unknown } }[] };

// A kind tab shows only when there's something in it: fan data or the engine's own output.
export function tabHasData(tab: TourTabId, plan: PlanLike | null | undefined, counts: KindTabCounts = {}): boolean {
  const stops = plan?.stops.filter((s) => s.money?.verdict !== "skip") ?? [];
  const deal = (...d: string[]) => stops.some((s) => s.money && d.includes(s.money.deal));
  switch (tab) {
    case "covers":
      return (counts.covers ?? 0) > 0;
    case "crowd":
      return (counts.questions ?? 0) > 0;
    case "openers":
      return stops.some((s) => s.opener || s.localArtists?.length);
    case "tone":
      return stops.some((s) => s.place?.tone);
    case "sales":
      return deal("exhibition", "commission");
    case "sessions":
      return deal("workshop");
    case "pitches":
      return deal("tips");
    default:
      return true;
  }
}

// The tour's tab row and More menu for a finished plan: the kind's tabs, minus kind tabs with
// nothing in them and Compare without a baseline. On the road the kind's road tab (Tickets by
// default) takes Booking's slot and Tonight leads.
export function workspaceTabs(w: Workspace, o: { plan: PlanLike; counts?: KindTabCounts; hasBaseline?: boolean; onRoad?: boolean }): { main: TourTabId[]; more: TourTabId[] } {
  const show = (id: TourTabId) => (id !== "compare" || !!o.hasBaseline) && tabHasData(id, o.plan, o.counts);
  const main = w.main.filter(show);
  const more = w.more.filter(show);
  if (o.onRoad) {
    const i = main.indexOf("pipeline");
    const j = more.indexOf(w.road ?? "live");
    if (i >= 0 && j >= 0) [main[i], more[j]] = [more[j], main[i]];
    main.unshift("tonight");
  }
  return { main, more };
}

const UNVERIFIED = "not probed (quota), tags from docs 2026-10-30";

const SECTIONS_NOTE = "Sections: opening, setlist, material, banter, crowd, staging, sponsor, avoid; leave a section empty when it doesn't apply.";

export const DISCIPLINES: Record<PerformerKind, Discipline> = {
  musician: {
    key: "musician",
    workspace: WORKSPACES.musician,
    label: "Musician",
    noun: "concert",
    hint: "Bands, singers, songwriters",
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
    ideas: [{ category: "cover", take: 3 }, { category: "banter", take: 2 }],
    setOrder: true,
    crowdWork: false,
    prep: `You prepare one night of a touring musician's show. Sections: opening (first words on stage), setlist (where to place songs, a cover or nod to a local act, encore idea), banter (between-song lines), crowd (a call-and-response or moment with the room), staging (room setup: stage, sound, merch table, door time, sized to the venue and expected crowd), sponsor (a concrete co-promo ask to one sponsor candidate), avoid (what not to do or say here).`,
    rooms: "Only bookable rooms where the artist would headline: clubs, theatres, music halls. Exclude festivals, outdoor parks or shells, arenas and stadiums far above the requested room size, restaurants and cafes that only host background music.",
    example: "Japanese Breakfast",
    scene: "indie pop, shoegaze",
    verified: "2026-10-29: artist search + heatmaps; 4 place tags ≥ 8 rooms in 68 seed cities",
  },
  comedian: {
    key: "comedian",
    workspace: WORKSPACES.comedian,
    label: "Comedian",
    noun: "stand-up comedy",
    hint: "Stand-up, storytellers, hosts",
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
    ideas: TALK_IDEAS,
    setOrder: true,
    crowdWork: true,
    prep: `You prepare one night of a touring stand-up comedian's show. Sections: opening (first 30 seconds, a local hook), material (premises or angles for new local bits, not finished jokes), crowd (crowd-work topics likely to land with this audience), banter (tag lines between bits), staging (room setup: mic, lights, seating, door time, opener slot length, sized to the venue and expected crowd), sponsor (a concrete co-promo ask to one sponsor candidate), avoid (topics likely to fall flat or offend here).`,
    rooms: "Only rooms where a comedian can headline a ticketed set: comedy clubs, theatres, bars or lounges with a stage or event space. Exclude festivals, outdoor parks, restaurants without a stage, academies, offices, hotels' banquet halls unless clearly an event venue, and arenas far above the requested room size. Prefer comedy clubs.",
    example: "Zakir Khan",
    scene: "stand-up comedy",
    verified: "2026-10-29: person search + heatmaps; comedy_club tag (Chicago 8+, Mumbai thin)",
  },
  dj: {
    key: "dj",
    workspace: WORKSPACES.dj,
    label: "DJ",
    noun: "club night",
    hint: "DJs, producers, club nights",
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
    ideas: [{ category: "cover", take: 3 }, { category: "music", take: 2 }],
    setOrder: true,
    crowdWork: false,
    prep: `You prepare one club night for a touring DJ. ${SECTIONS_NOTE} Use: opening (first track idea and mic line if any), setlist (set arc by hour, a local artist or track to nod to), crowd (a peak moment for this crowd), staging (booth, sound, lights, door and curfew, sized to the room), sponsor (one co-promo ask), avoid (what not to play or do here).`,
    rooms: "Only clubs, lounges and bars with a booth or dance floor where a DJ can headline a night. Exclude restaurants, festivals, arenas and daytime-only cafes.",
    example: "Peggy Gou",
    scene: "techno, house",
    verified: "2026-10-30: artist search (Peggy Gou); night_club and lounge 20/20/20 rooms; techno tag heatmap ranks cities",
  },
  dancer: {
    key: "dancer",
    workspace: WORKSPACES.dancer,
    label: "Dancer",
    noun: "dance performance",
    hint: "Solo dancers and companies",
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
    ideas: MOVEMENT_IDEAS,
    setOrder: true,
    crowdWork: false,
    prep: `You prepare one performance and workshop stop for a touring dancer or company. ${SECTIONS_NOTE} Use: opening (how the piece starts and the first words to the room), setlist (order of pieces, a local music or motif nod), material (a short workshop plan for local dancers), crowd (a moment with the audience), staging (floor, stage size, lights, sound, changing space), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only theatres, performing-arts halls and dance studios with a usable floor. Exclude bars without a stage, restaurants, arenas and outdoor parks.",
    example: "Akram Khan",
    scene: "contemporary dance, kathak",
    verified: "2026-10-30: person search (Akram Khan); performing_arts_theater 20/20/18, dance_school 10/16/11; contemporary tag heatmap ranks cities",
  },
  poet: {
    key: "poet",
    workspace: WORKSPACES.poet,
    label: "Poet",
    noun: "spoken-word show",
    hint: "Spoken word, slams, readings",
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
    ideas: [{ category: "themes", take: 3 }, { category: "trending", take: 2 }, { category: "screen", take: 2, types: ["urn:entity:book", "urn:entity:tv_show"] }, { category: "landmarks", take: 2, tags: LANDMARK_TAGS }, { category: "people", take: 1 }],
    setOrder: true,
    crowdWork: false,
    prep: `You prepare one evening for a touring poet or spoken-word artist. ${SECTIONS_NOTE} Use: opening (first lines to the room), setlist (order of pieces, one local reference or dedication), banter (between-piece lines), crowd (an open-mic slot or call-and-response), staging (mic, seating, book table, door time), sponsor (one co-promo ask), avoid (topics likely to fall flat here).`,
    rooms: "Only theatres, bookstores, cafes and bars that host readings or events. Exclude arenas, clubs that only do dance nights, restaurants and outdoor parks.",
    example: "Rupi Kaur",
    scene: "poetry, poetry slam",
    verified: "2026-10-30: person search (Rupi Kaur); book_store and cafe 20/20/20; poetry tag heatmap ranks cities",
  },
  visual_artist: {
    key: "visual_artist",
    workspace: WORKSPACES.visual_artist,
    label: "Painter",
    noun: "exhibition",
    hint: "Painters, illustrators, muralists",
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
    ideas: SUBJECT_IDEAS,
    setOrder: false,
    crowdWork: false,
    prep: `You prepare one city's exhibition for a touring visual artist. ${SECTIONS_NOTE} Use: opening (opening-night remarks), setlist (which pieces to hang and in what order, one piece or motif tied to the city), material (a live-painting or mural idea), crowd (an interactive moment), staging (hanging, lighting, wall space, shipping and insurance notes), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only galleries, museums, and cafes or bars that hang work or host pop-ups. Exclude arenas, clubs, restaurants without wall space and outdoor parks.",
    example: "your name",
    scene: "street art, contemporary art",
    verified: "2026-10-30: art_gallery 20/20/16, museum 20/20/9; street_art tag + Banksy as a peer ranks cities; most painters are not Qloo entities, so plan from peers",
  },
  author: {
    key: "author",
    workspace: WORKSPACES.author,
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
    ideas: [{ category: "screen", take: 3, types: ["urn:entity:book", "urn:entity:movie"] }, { category: "themes", take: 2 }, { category: "people", take: 2 }, { category: "landmarks", take: 2, tags: LANDMARK_TAGS }],
    setOrder: false,
    crowdWork: false,
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
    workspace: WORKSPACES.podcaster,
    label: "Podcaster",
    noun: "live podcast show",
    hint: "Live tapings and Q&As",
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
    ideas: TALK_IDEAS,
    setOrder: true,
    crowdWork: true,
    prep: `You prepare one live taping for a touring podcast. ${SECTIONS_NOTE} Use: opening (cold open with a local hook), setlist (episode segments in order), material (local topics and a local guest idea), crowd (an audience Q&A or game), staging (mics, seating, recording setup, door time), sponsor (one live-read idea), avoid (topics likely to fall flat here).`,
    rooms: "Only theatres, halls and comedy clubs with seating and a stage. Exclude clubs that only do dance nights, restaurants, arenas far above the room size and outdoor parks.",
    example: "My Favorite Murder",
    scene: "true crime",
    verified: "2026-10-30: podcast heatmaps (My Favorite Murder, Call Her Daddy) 0/55 NA cities thin, Chicago top for both; performing_arts_theater 20/20/18",
  },
  speaker: {
    key: "speaker",
    workspace: WORKSPACES.speaker,
    label: "Speaker",
    noun: "talk",
    hint: "Talks, keynotes, storytelling",
    entityTypes: ["urn:entity:person"],
    spaces: [THEATRE, HOTEL, LIBRARY, BOOKSTORE],
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(speaker|storytell\w*|lecturer|motivational|author|writer|journalist|broadcaster|presenter|host|historian|scientist)\b/i,
    localScene: false,
    support: "local host",
    ticketFactor: 1.2,
    perHeadSales: 0.3, // signed books at the table
    stayDays: 1,
    deals: ["guarantee", "door_split", "versus"], // guarantee = a speaking fee
    revenue: ["speaking fee", "ticketed", "book sales"],
    ideas: TALK_IDEAS,
    setOrder: true,
    crowdWork: true,
    prep: `You prepare one talk or storytelling night for a touring speaker. ${SECTIONS_NOTE} Use: opening (first 30 seconds, a local hook), setlist (order of stories or sections, where the local example goes), material (local examples, numbers or stories that make the point here), crowd (a show-of-hands or Q&A moment), staging (stage, mic, screen, seating, book table, door time), sponsor (one co-promo ask), avoid (topics or examples likely to fall flat here).`,
    rooms: "Only theatres, hotel event rooms, libraries and bookstores that host talks with seating. Exclude clubs, bars without a seated room, arenas far above the room size and outdoor parks.",
    example: "Brené Brown",
    scene: "self-help, storytelling",
    verified: UNVERIFIED,
  },
  magician: {
    key: "magician",
    workspace: WORKSPACES.magician,
    label: "Magician",
    noun: "magic show",
    hint: "Close-up, stage magic, mentalism",
    entityTypes: ["urn:entity:person"],
    spaces: [THEATRE, COMEDY_CLUB, LOUNGE, BAR],
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(magician|magic|illusionist|mentalist|escapologist|card ?sharp)\b/i,
    localScene: false,
    support: "opener",
    ticketFactor: 1.1,
    perHeadSales: 0.05, // trick kits and posters
    stayDays: 1,
    revenue: ["ticketed", "bar deal"],
    ideas: TALK_IDEAS,
    setOrder: true,
    crowdWork: true,
    prep: `You prepare one night of a touring magician's show. ${SECTIONS_NOTE} Use: opening (first effect and first line, a local hook), setlist (order of effects, where a local reference fits), material (patter angles built on local names), crowd (who to bring on stage and a question to ask them), staging (sightlines, table, lights, mic, seating, door time), sponsor (one co-promo ask), avoid (references likely to fall flat here).`,
    rooms: "Only theatres, comedy clubs, lounges and bars with a stage and clear sightlines. Exclude dance clubs, restaurants without a stage, arenas far above the room size and outdoor parks.",
    example: "Derren Brown",
    scene: "magic, mentalism",
    verified: UNVERIFIED,
  },
  theatre: {
    key: "theatre",
    workspace: WORKSPACES.theatre,
    label: "Actor",
    noun: "theatre run",
    hint: "Plays, improv, sketch troupes",
    entityTypes: ["urn:entity:person"],
    spaces: [THEATRE, COMEDY_CLUB, BAR, CAFE],
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(actor|actress|improv\w*|playwright|theat(?:re|er)|sketch|comedian|director)\b/i,
    localScene: false,
    support: "local improv team",
    ticketFactor: 1,
    perHeadSales: 0.05,
    stayDays: 3,
    shows: 3, // a three-night run
    deals: ["door_split", "guarantee", "versus"],
    revenue: ["ticketed"],
    ideas: TALK_IDEAS,
    setOrder: true,
    crowdWork: true, // audience suggestions
    prep: `You prepare one short run for a touring theatre or improv company. ${SECTIONS_NOTE} Use: opening (curtain speech with a local hook), setlist (scene or game order), material (suggestions to ask the audience for, local references to have ready), crowd (how to take suggestions or bring someone up), staging (stage size, lights, sound, get-in and get-out, seating), sponsor (one co-promo ask), avoid (references likely to fall flat here).`,
    rooms: "Only theatres, comedy clubs and bars or cafes with a stage and seating. Exclude dance clubs, arenas, restaurants without a stage and outdoor parks.",
    example: "your company",
    scene: "improv, theatre",
    verified: UNVERIFIED,
  },
  photographer: {
    key: "photographer",
    workspace: WORKSPACES.photographer,
    label: "Photographer",
    noun: "photo exhibition",
    hint: "Exhibitions, photo walks",
    entityTypes: ["urn:entity:person"],
    spaces: [GALLERY, MUSEUM, CAFE, BOOKSTORE],
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(photograph\w*|photojournalist|filmmaker|artist|visual artist)\b/i,
    localScene: false,
    support: "co-exhibitor",
    ticketFactor: 0.3, // entry, often free
    perHeadSales: 0.6, // prints and photobooks per visitor, net of the space's cut
    stayDays: 7,
    deals: ["exhibition", "workshop", "commission"],
    commission: 20, // a commissioned local shoot
    workshop: { fee: 2, classSize: 12, sessions: 2, takeUp: 0.1 }, // photo walks
    revenue: ["entry", "print sales", "workshop", "commission"],
    ideas: [{ category: "landmarks", take: 3, tags: LANDMARK_TAGS }, ...SUBJECT_IDEAS.filter((i) => i.category !== "landmarks")],
    setOrder: false,
    crowdWork: false,
    prep: `You prepare one city's exhibition for a touring photographer. ${SECTIONS_NOTE} Use: opening (opening-night remarks), setlist (which images to hang and in what order, one shot or series tied to the city), material (a photo-walk route or a local series to shoot while here), crowd (an interactive moment), staging (hanging, lighting, print sizes, wall space), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only galleries, museums, and cafes or bookstores that hang work. Exclude arenas, clubs, restaurants without wall space and outdoor parks.",
    example: "your name",
    scene: "photography, street photography",
    verified: UNVERIFIED,
  },
  maker: {
    key: "maker",
    workspace: WORKSPACES.maker,
    label: "Maker",
    noun: "pop-up",
    hint: "Ceramics, crafts, markets",
    entityTypes: ["urn:entity:person"],
    spaces: [GALLERY, CAFE, MALL, BOOKSTORE], // no market or studio tag in the docs
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(potter|ceramic\w*|craft\w*|maker|designer|artisan|jewel\w*|textile|weaver|woodwork\w*|illustrator|artist)\b/i,
    localScene: false,
    support: "stall neighbour",
    ticketFactor: 0.3, // entry, usually free
    perHeadSales: 0.7, // pieces sold per visitor
    stayDays: 3, // a weekend pop-up
    deals: ["exhibition", "workshop"],
    workshop: { fee: 2, classSize: 10, sessions: 2, takeUp: 0.08, materials: 0.4 }, // clay, glaze, firing
    revenue: ["sales", "workshop"],
    ideas: [
      { category: "brands", take: 3 },
      { category: "themes", take: 3 },
      { category: "landmarks", take: 2, tags: LANDMARK_TAGS },
      { category: "cuisines", take: 1 },
    ],
    setOrder: false,
    crowdWork: false,
    prep: `You prepare one pop-up or market stop for a touring craft maker. ${SECTIONS_NOTE} Use: opening (how to greet browsers), setlist (which pieces to bring and how to lay out the table, one piece or glaze tied to the city), material (a short workshop plan), crowd (a demo moment), staging (table, display, lighting, card reader, packing), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only galleries, cafes, shops and shopping centres that host pop-ups or markets. Exclude clubs, arenas, theatres and restaurants without space for a stall.",
    example: "your studio",
    scene: "ceramics, handmade",
    verified: UNVERIFIED,
  },
  busker: {
    key: "busker",
    workspace: WORKSPACES.busker,
    label: "Busker",
    noun: "street show",
    hint: "Street shows, pub sets",
    entityTypes: ["urn:entity:artist", "urn:entity:person"],
    spaces: [ATTRACTION, PARK, MALL, BAR],
    peerType: "urn:entity:artist",
    musicFilter: false,
    localScene: false,
    support: "pitch partner",
    ticketFactor: 0.5, // no ticket: scales tips and merch to local prices
    perHeadSales: 0.04, // CDs, stickers
    tipsPerHead: 0.1, // into the hat per person who stops
    stayDays: 2,
    shows: 6, // ~3 pitches a day
    deals: ["tips"], // pub sets are pass-the-hat too
    revenue: ["tips", "merch"],
    ideas: [
      { category: "cover", take: 3 },
      { category: "landmarks", take: 2, tags: LANDMARK_TAGS }, // pitches people already gather at
      { category: "banter", take: 3 }, // crowd-work kinds keep ≥ 8 topics per city (story 25)
    ],
    setOrder: true,
    crowdWork: true,
    prep: `You prepare one city's street shows for a touring busker or street performer. ${SECTIONS_NOTE} Use: opening (how to stop people walking past), setlist (a short set built to loop, a local cover or nod), banter (lines to keep the circle), crowd (the hat line and a moment with a passer-by), staging (pitch, amp or no amp, permits, time of day), sponsor (one co-promo ask), avoid (what not to do here).`,
    rooms: "Only public squares, landmarks, parks, shopping streets and pubs where street performance or free sets are allowed; note permits. Exclude ticketed venues, arenas, private clubs and restaurants.",
    example: "your name",
    scene: "acoustic, folk",
    verified: UNVERIFIED,
  },
  circus: {
    key: "circus",
    workspace: WORKSPACES.circus,
    label: "Acrobat",
    noun: "circus show",
    hint: "Circus, aerial, juggling",
    entityTypes: ["urn:entity:person"],
    spaces: [THEATRE, MUSIC_SPACES[1], PARK, STUDIO],
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(circus|acrobat\w*|aerialist|aerial|juggler|clown|trapeze|cirque|contortionist|stunt\w*)\b/i,
    localScene: false,
    support: "co-bill",
    ticketFactor: 1.3,
    perHeadSales: 0.1,
    stayDays: 3,
    shows: 3,
    deals: ["door_split", "guarantee", "versus", "workshop"],
    workshop: { fee: 1.5, classSize: 12, sessions: 2, takeUp: 0.05 },
    revenue: ["ticketed", "workshop"],
    ideas: MOVEMENT_IDEAS,
    setOrder: true,
    crowdWork: false,
    prep: `You prepare one stop for a touring circus or aerial act. ${SECTIONS_NOTE} Use: opening (how the show starts, first words to the room), setlist (order of acts, music choices the city knows, one local motif), material (a short workshop plan), crowd (a volunteer or audience moment), staging (rigging points, ceiling height, floor, mats, lights, sound, safety), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only theatres, halls, parks with space for a tent or outdoor show, and studios with rigging for classes. Exclude bars, restaurants, clubs without height and arenas far above the room size.",
    example: "your company",
    scene: "circus, acrobatics",
    verified: UNVERIFIED,
  },
  chef: {
    key: "chef",
    workspace: WORKSPACES.chef,
    label: "Chef",
    noun: "supper club",
    hint: "Supper clubs, pop-up dinners",
    entityTypes: ["urn:entity:person"],
    spaces: [RESTAURANT, FINE_DINING, CAFE, BAR],
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(chef|cook\w*|restaurateur|baker|pastry|culinary|food (?:writer|critic)|sommelier)\b/i,
    localScene: false,
    support: "guest chef",
    ticketFactor: 2.4, // a dinner, not a show
    perHeadCost: 0.4, // ingredients per guest
    perHeadSales: 0.05, // sauces, cookbooks
    stayDays: 2,
    shows: 2, // two seatings
    deals: ["supper_club", "guarantee", "workshop"], // guarantee = a guest-chef fee
    workshop: { fee: 2.4, classSize: 12, sessions: 1, takeUp: 0.1, materials: 0.6 }, // cooking class
    revenue: ["ticketed dinner", "guest-chef fee", "cooking class"],
    ideas: [
      { category: "cuisines", take: 3 },
      { category: "food_places", take: 3 },
      { category: "brands", take: 2 },
      { category: "people", take: 1 },
    ],
    setOrder: true, // the menu, course by course
    crowdWork: false,
    prep: `You prepare one supper club or guest-chef stop for a touring chef. ${SECTIONS_NOTE} Use: opening (the welcome at the table), setlist (the menu course by course, one dish built on a local taste), material (local producers or ingredients to source), crowd (a moment at the pass or the table), staging (kitchen, covers, service, allergies, timings), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only restaurants, dining rooms, cafes and bars with a working kitchen that host pop-up or guest-chef nights. Exclude theatres, clubs, arenas and outdoor parks.",
    example: "Yotam Ottolenghi",
    scene: "fine dining, street food",
    verified: UNVERIFIED,
  },
  filmmaker: {
    key: "filmmaker",
    workspace: WORKSPACES.filmmaker,
    label: "Filmmaker",
    noun: "screening",
    hint: "Screenings and Q&As",
    entityTypes: ["urn:entity:movie", "urn:entity:person"],
    spaces: [THEATRE, MUSEUM, GALLERY, BAR], // no cinema tag in the docs
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(film ?maker|director|documentar\w*|screenwriter|cinematographer|animator)\b/i,
    localScene: false,
    support: "Q&A host",
    ticketFactor: 0.6,
    perHeadSales: 0.1, // posters, zines, downloads
    stayDays: 1,
    deals: ["door_split", "guarantee", "versus"], // guarantee = a screening fee
    revenue: ["ticketed", "screening fee", "merch"],
    ideas: [
      { category: "screen", take: 4, types: ["urn:entity:movie", "urn:entity:tv_show"] },
      { category: "landmarks", take: 2, tags: LANDMARK_TAGS }, // places to shoot
      { category: "themes", take: 2 },
      { category: "people", take: 1 },
    ],
    setOrder: false,
    crowdWork: false,
    prep: `You prepare one screening and Q&A for a touring filmmaker. ${SECTIONS_NOTE} Use: opening (intro before the film, a local hook), setlist (shorts or clips in order, what to screen before the feature), material (Q&A questions to expect and short answers, a local film to mention), crowd (an audience moment), staging (projector, screen, sound, seating, door time), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only theatres, museums, galleries and bars with a projector or screening room. Exclude dance clubs, arenas, restaurants and outdoor parks unless an outdoor screening is clearly offered.",
    example: "Greta Gerwig",
    scene: "documentary, independent film",
    verified: UNVERIFIED,
  },
  teacher: {
    key: "teacher",
    workspace: WORKSPACES.teacher,
    label: "Teacher",
    noun: "workshop",
    hint: "Yoga, dance, movement classes",
    entityTypes: ["urn:entity:person"],
    spaces: [STUDIO, WELLNESS, PARK, CAFE],
    peerType: "urn:entity:person",
    musicFilter: false,
    peerPattern: /\b(yoga|teacher|instructor|dancer|choreograph\w*|pilates|fitness|wellness|meditation)\b/i,
    localScene: false,
    support: "local teacher",
    ticketFactor: 1,
    perHeadSales: 0.05, // mats, recordings
    stayDays: 2,
    deals: ["workshop"],
    workshop: { fee: 1, classSize: 25, sessions: 3, takeUp: 1 },
    revenue: ["workshop"],
    ideas: [
      { category: "music", take: 3 }, // a class playlist the city loves
      { category: "themes", take: 2 },
      { category: "landmarks", take: 2, tags: LANDMARK_TAGS }, // an outdoor session
      { category: "food_places", take: 1 },
    ],
    setOrder: true, // class flow
    crowdWork: false,
    prep: `You prepare one stop of workshops for a touring yoga or dance teacher. ${SECTIONS_NOTE} Use: opening (the welcome and intention), setlist (class flow and music in order, one local music nod), material (levels and adjustments for this crowd), crowd (a partner or circle moment), staging (floor, mats, sound, changing space, class size), sponsor (one co-promo ask), avoid (what to avoid here).`,
    rooms: "Only dance or yoga studios, wellness hotels, parks for outdoor sessions, and cafes with a free floor. Exclude bars, clubs, arenas and restaurants.",
    example: "your name",
    scene: "yoga, dance",
    verified: UNVERIFIED,
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
