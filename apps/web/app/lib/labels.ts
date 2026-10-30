import { workspaceFor } from "@tourbo/core/disciplines/index.ts";
import type { MaterialType } from "@tourbo/core/material/material.ts";
import type { PerformerKind } from "@tourbo/core/shared/types.ts";

// Every user-visible name for Tourbo's entities and the workspace navigation, in one place (PLAN
// Q21), so the final vocabulary is a one-file swap. Internal names (DB tables, types, routes:
// runs / events / material / projects) stay as they are.

export const LABELS = {
  work: "Your work", // the workspace
  tours: "Tours",
  tour: "tour",
  events: "Shows", // one-off events and tour nights: gigs, gallery shows, talks
  event: "show",
  material: "Library", // the act's songs / bits / pieces (items named by kind: itemNoun)
  notebook: "Notebook", // a project (notes, to-dos, drafts for one tour)
  notebooks: "Notebooks",
  profile: "Your act",
  set: "Set",
  newTour: "Plan a tour",
  newEvent: "Add a show",
  planTour: "Plan a tour",
  planThisTour: "Plan this tour",
  addEvent: "Add a show",
  origin: { original: "Yours", cover: "Cover", local_idea: "Local nod" },
  originGroup: { original: "Yours", cover: "Covers", local_idea: "Local nods" },
  past: "Past",
  drafts: "Drafts",
  onTheRoad: "On the road",
  nextUp: "Next up",
  notes: "Notes",
  skip: "Skip for now",
  // Each list page's own title and one plain line under it.
  page: {
    tours: { title: "Your tours", line: "Runs of nights, planned around your fans." },
    events: { title: "Your shows", line: "Every night on the calendar: one-offs and tour stops." },
    material: { title: "Your library", line: "Everything you can put in a set, ready for any show." },
  },
  empty: {
    tours: { title: "No tours yet. The road is wide open.", body: "Tourbo picks the cities where your fans are, a room in each, and the money." },
    events: { title: "Nothing on the calendar yet.", body: "A gig, a gallery night, a talk: add it with its dates and venue. They can wait, too." },
    material: { title: "Your library is a blank page.", body: "Add what you perform, or paste a whole list. Ideas you keep from Tourbo land here too." },
  },
  // Booking (venue emails) columns, by outreach status.
  booking: { drafted: "Drafted", sent: "Sent", interested: "Replied", hold: "Holding the date", passed: "Said no", confirmed: "Confirmed" },
  materialType: { song: "Song", bit: "Bit", talk: "Talk", piece: "Piece", routine: "Routine", other: "Other" },
} as const;

// One item of the act's material, the set's heading and the Library's types, per kind: all from
// the kind's workspace block (packages/core/src/disciplines/index.ts, WORKSPACES).
export const itemNoun = (kind?: PerformerKind | string, plural = false) => workspaceFor(kind).item[plural ? 1 : 0];

// The set's heading by kind: Setlist (music) · Set (comedy) · Running order (talks, dance) · Hang
// list (exhibitions) · Menu (chef) · Class plan (teacher).
export const setName = (kind?: PerformerKind | string) => workspaceFor(kind).set.heading;

// Library types this kind offers (first = default) and each one's name for this kind.
export const libraryTypes = (kind?: PerformerKind | string): MaterialType[] => workspaceFor(kind).types;
export const typeLabel = (kind: PerformerKind | string | undefined, type: MaterialType) => workspaceFor(kind).typeLabels?.[type] ?? LABELS.materialType[type];
