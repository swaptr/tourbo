import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { Emit } from "@tourbo/core/engine/trace.ts";
import type { AngleFacts, Artist, Evidence, Opener, Reference, Venue } from "@tourbo/core/shared/types.ts";
import { discipline, type Discipline } from "@tourbo/core/disciplines/index.ts";
import { WORKER_MODEL } from "./models.ts";
import { recordUsage } from "./usage.ts";
import { friendlyError, logError } from "./errors.ts";

const WorkerOutput = z.object({
  venueId: z.string().describe("entity id of the chosen venue, from the candidates"),
  backupVenueId: z.string().nullable(),
  excluded: z.array(z.object({ id: z.string(), reason: z.string() })),
  capacityMin: z.number().describe("estimated capacity of the chosen venue, lower bound"),
  capacityMax: z.number(),
  fit: z.string().describe("one or two sentences on why this room fits, quoting Qloo numbers"),
  angle: z.string().describe("one or two lines of promo copy using a local reference"),
  evidence: z.array(
    z.object({
      claim: z.string(),
      source: z.enum(["heatmap", "venue", "fanTaste", "cityCulture", "localSpots", "opener", "sponsors", "localArtists"]),
      ref: z.string().describe("exact name of the Qloo item or metric, copied from the input"),
      value: z.string().nullable(),
    }),
  ),
});
export type WorkerOutput = z.infer<typeof WorkerOutput>;

// Kept byte-identical across calls so it can be cached.
const COMEDY_SYSTEM = `You plan one city of a stand-up comedy tour for a touring comedian. You receive Qloo data only: room candidates (with Qloo popularity and affinity to the comedian's fans, and a room type), the comedian's fan taste, the city's culture, its music scene, local spots, city brands the fans like, and a suggested opener (a fellow comic or creator).

Pick the room and a backup:
- Only rooms where a comedian can headline a ticketed set: comedy clubs, theatres, bars or lounges with a stage or event space. Exclude festivals, outdoor parks, restaurants without a stage, academies, offices, hotels' banquet halls unless clearly an event venue, and arenas far above the requested room size. List every exclusion with a short reason.
- Prefer comedy clubs and rooms whose size fits the requested range, then higher affinity.
- Qloo has no capacity data. Estimate the chosen room's capacity from its name, type and description; it will be shown as an estimate.

Write a short fit note and one or two lines of promo copy that use at least one local reference from the city culture or local spots (comedy-poster tone).

Every claim must be backed by an evidence item whose ref is copied exactly from the input (an item name, or a metric like "heatmap cells") and whose value quotes the Qloo number when there is one. Do not invent rooms, references or numbers.`;

const SYSTEM = `You plan one city of a concert tour for a touring artist. You receive Qloo data only: venue candidates (with Qloo popularity and affinity to the artist), the artist's fan taste, the city's culture, local spots, and a suggested local opener.

Pick the venue and a backup:
- Only bookable rooms where the artist would headline: clubs, theatres, music halls. Exclude festivals, outdoor parks or shells, arenas and stadiums far above the requested room size, restaurants and cafes that only host background music. List every exclusion with a short reason.
- Prefer rooms whose size fits the requested range, then higher affinity.
- Qloo has no capacity data. Estimate the chosen room's capacity from its name and description; it will be shown as an estimate.

Write a short fit note and one or two lines of promo copy that use at least one local reference from the city culture or local spots.

Every claim must be backed by an evidence item whose ref is copied exactly from the input (an item name, or a metric like "heatmap cells") and whose value quotes the Qloo number when there is one. Do not invent venues, references or numbers.`;

// Other disciplines: same rules, rooms and support act from the registry (one prompt per discipline, still cacheable).
const otherSystem = (d: Discipline) => `You plan one city of a ${d.noun} tour for a touring ${d.label.toLowerCase()}. You receive Qloo data only: space candidates (with Qloo popularity and affinity to the act's fans, and a space type), the act's fan taste, the city's culture, local spots, city brands the fans like, and a suggested ${d.support}.

Pick the space and a backup:
- ${d.rooms} List every exclusion with a short reason.
- Prefer spaces whose size fits the requested range, then higher affinity.${d.stayDays > 1 ? ` The act stays about ${d.stayDays} days per city.` : ""}
- Qloo has no capacity data. Estimate the chosen space's capacity from its name, type and description; it will be shown as an estimate.

Write a short fit note and one or two lines of promo copy that use at least one local reference from the city culture or local spots.

Every claim must be backed by an evidence item whose ref is copied exactly from the input (an item name, or a metric like "heatmap cells") and whose value quotes the Qloo number when there is one. Do not invent spaces, references or numbers.`;

const systemFor = (kind: Artist["kind"]) => (kind === "comedian" ? COMEDY_SYSTEM : kind === "musician" ? SYSTEM : otherSystem(discipline(kind)));

export type WorkerInput = {
  artist: Artist;
  sponsors?: Reference[];
  localArtists?: Reference[];
  city: string;
  roomMin: number;
  roomMax: number;
  heatmapCells: number;
  venues: Venue[];
  facts: AngleFacts;
  opener?: Opener;
};

export type WorkerResult = {
  venue?: Venue;
  backupVenue?: Venue;
  capacity?: { min: number; max: number; estimate: true };
  fit?: string;
  angle?: string;
  evidence: Evidence[];
  excluded: { id: string; reason: string }[];
};

let client: Anthropic | undefined;

export async function planCityWithWorker(input: WorkerInput, emit: Emit): Promise<WorkerResult> {
  client ??= new Anthropic();
  const request = () =>
    client!.messages.parse({
      model: WORKER_MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(WorkerOutput) },
      system: systemFor(input.artist.kind),
      messages: [{ role: "user", content: JSON.stringify(compact(input)) }],
    });
  // parse() throws when the output doesn't match the schema (e.g. truncated JSON); retry once,
  // then fall back to the top-ranked venues so the city still makes the tour.
  const response = await request()
    .catch(() => {
      emit("repair", `${input.city}: worker output didn't parse; retrying`, { city: input.city });
      return request();
    })
    .catch((error: Error) => {
      logError(`worker ${input.city}`, error);
      emit("repair", `${input.city}: worker failed (${friendlyError(error)})`, { city: input.city });
      return undefined;
    });

  if (response) recordUsage(WORKER_MODEL, response.usage);

  if (!response || response.stop_reason === "refusal" || !response.parsed_output) {
    emit("repair", `${input.city}: worker returned no plan (${response?.stop_reason ?? "error"}); using top-ranked venues`, {
      city: input.city,
    });
    return { venue: input.venues[0], backupVenue: input.venues[1], evidence: [], excluded: [] };
  }

  const out = response.parsed_output;
  const byId = new Map(input.venues.map((v) => [v.id, v]));
  const venue = byId.get(out.venueId) ?? input.venues[0];
  const backup =
    (out.backupVenueId ? byId.get(out.backupVenueId) : undefined) ??
    input.venues.find((v) => v.id !== venue?.id && !out.excluded.some((e) => e.id === v.id));
  for (const e of out.excluded) {
    emit("decision", `${input.city}: excluded ${byId.get(e.id)?.name ?? e.id} (${e.reason})`, { city: input.city });
  }
  emit("decision", `${input.city}: ${venue?.name ?? "no venue"} (backup ${backup?.name ?? "none"}), ~${out.capacityMin}–${out.capacityMax} est.`, {
    city: input.city,
    venue: venue?.name,
    backup: backup?.name,
  });
  return {
    venue,
    backupVenue: backup,
    capacity: { min: out.capacityMin, max: out.capacityMax, estimate: true },
    fit: out.fit,
    angle: out.angle,
    evidence: out.evidence.map((e) => ({ ...e, value: e.value ?? undefined })),
    excluded: out.excluded,
  };
}

// Only the fields the worker needs; keeps tokens down.
function compact(input: WorkerInput) {
  const round = (n?: number) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);
  return {
    artist: { name: input.artist.name, genres: input.artist.tags.map((t) => t.name) },
    city: input.city,
    requestedRoomSize: { min: input.roomMin, max: input.roomMax },
    heatmapCells: input.heatmapCells,
    venues: input.venues.map((v) => ({
      id: v.id,
      name: v.name,
      roomType: v.tag.split(":").at(-1)?.replace(/_/g, " "),
      neighborhood: v.neighborhood,
      description: v.description?.slice(0, 300),
      popularity: round(v.popularity),
      affinity: round(v.affinity),
      foundBy: v.foundBy,
    })),
    fanTaste: input.facts.fanTaste.map((r) => `${r.name} (${r.type})`),
    cityCulture: input.facts.cityCulture.map((r) => `${r.name} (${r.type})`),
    localSpots: input.facts.localSpots.map((r) => r.name),
    sponsors: (input.sponsors ?? []).slice(0, 5).map((r) => r.name),
    localArtists: (input.localArtists ?? []).slice(0, 5).map((r) => r.name),
    opener: input.opener && {
      name: input.opener.name,
      localHeatmapCells: input.opener.localCells,
    },
  };
}
