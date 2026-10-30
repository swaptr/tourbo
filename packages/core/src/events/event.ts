import { z } from "zod";

import { PerformerKind } from "../shared/types.ts";

// A one-off event (PLAN Q21): client-safe shape + validation. Dates and venue are optional while
// it's a draft; the end date defaults to the start (one day).

const Day = z.iso.date();
export const EventVenue = z.object({
  name: z.string().trim().min(1, "Give the venue a name.").max(120),
  address: z.string().trim().max(200).optional(),
  source: z.enum(["own", "tourbo"]),
  venueId: z.string().optional(),
  capacity: z.number().optional(),
  profit: z.number().optional(), // Tourbo's estimate for that room (suggested venues only)
  currency: z.string().optional(),
});
export type EventVenue = z.infer<typeof EventVenue>;

// Classes and seatings (teacher, maker, dancer, circus, chef): how many sessions and seats in each.
export const EventClasses = z.object({
  sessions: z.number().int().min(1, "At least one session.").max(60, "Up to 60 sessions.").optional(),
  seats: z.number().int().min(1, "At least one seat.").max(2000, "Up to 2,000 seats.").optional(),
});
export type EventClasses = z.infer<typeof EventClasses>;

export const EventFields = z
  .object({
    title: z.string().trim().min(1, "Give the event a name.").max(120),
    artist: z.string().trim().min(1).max(120),
    kind: PerformerKind,
    city: z.object({ name: z.string().min(1, "Pick the city."), lat: z.number(), lon: z.number() }),
    startDate: Day.optional(),
    endDate: Day.optional(),
    venue: EventVenue.optional(),
    classes: EventClasses.optional(),
  })
  .transform((e) => ({ ...e, endDate: e.startDate ? (e.endDate ?? e.startDate) : undefined }))
  .refine((e) => !e.startDate || !e.endDate || e.endDate >= e.startDate, { message: "The last day can't be before the first day.", path: ["endDate"] });
export type EventFields = z.infer<typeof EventFields>;

export type TourEvent = EventFields & { id: string; runId?: string; tourId?: string; stopKey?: string; archived: boolean | null; createdAt: string; updatedAt: string };

// "Fri 6 Mar" or "Fri 6 – Sun 8 Mar" style, plain.
export function dateRange(start?: string, end?: string): string {
  if (!start) return "No date yet";
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  const f = (s: string, o: Intl.DateTimeFormatOptions) => d(s).toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
  if (!end || end === start) return f(start, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${f(start, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${f(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

export const days = (start?: string, end?: string) => (start ? Math.round((Date.parse(end ?? start) - Date.parse(start)) / 86_400_000) + 1 : 0);
