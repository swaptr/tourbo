// Export tools (PLAN §18 Q13): the tour as a calendar file and as markdown. Deterministic, no fan
// data; registers into TOURBO_TOOLS like places.ts.
import { z } from "zod";

import { findCity, timezoneAt } from "@tourbo/core/engine/cities.ts";
import { getProject, projectMarkdown } from "@tourbo/core/projects/projects.server.ts";
import { Region, type Plan as PlanT, type Region as RegionId } from "@tourbo/core/shared/types.ts";

import { UserError } from "../errors.ts";
import { obj } from "../tourbo/outputs.ts";
import { planInput } from "../tourbo/plan-input.ts";
import { LOCAL, TOURBO_TOOLS, type ToolDef } from "../tourbo/tools.ts";
import { toIcs, validTimezone, type IcsEvent } from "./ics.ts";
import { planMarkdown } from "./markdown.ts";
import { runPlan } from "./runs.ts";


const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM, 24-hour");
const Stop = z.object({
  date: z.iso.date(),
  city: z.string().min(1),
  venue: z.string().max(160).optional(),
  address: z.string().max(240).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  start_time: time.optional().describe("Local start, HH:MM; defaults to the call's start_time"),
  timezone: z.string().max(64).optional().describe("IANA zone, e.g. America/Chicago; looked up from the city when omitted"),
  note: z.string().max(1000).optional(),
});
type StopIn = z.infer<typeof Stop>;

// One source of the tour: a saved plan (run_id), a Plan JSON (tourbo_plan_tour), or plain stops.
async function planOf(p: { run_id?: string; plan?: unknown }): Promise<PlanT | undefined> {
  if (p.run_id) return (await runPlan(p.run_id)).plan;
  if (p.plan === undefined) return undefined;
  return planInput(p.plan);
}

const stopsOfPlan = (plan: PlanT): StopIn[] =>
  plan.stops
    .filter((s) => s.date && s.money?.verdict !== "skip")
    .map((s) => ({ date: s.date!, city: s.city.name, venue: s.venue?.name, address: s.venue?.address, lat: s.venue?.lat ?? s.city.lat, lon: s.venue?.lon ?? s.city.lon }));

function zoneFor(s: StopIn, region: RegionId): string | undefined {
  if (s.timezone) {
    if (!validTimezone(s.timezone)) throw new UserError(`"${s.timezone}" isn't a time zone: use an IANA name like Europe/Berlin, or leave it out.`);
    return s.timezone;
  }
  const at = s.lat !== undefined && s.lon !== undefined ? s : findCity(region, s.city);
  return at ? timezoneAt(at.lat!, at.lon!) : undefined;
}

export const ICS_TOOL: ToolDef = {
  name: "tourbo_export_ics",
  title: "Tour calendar (.ics)",
  hints: LOCAL,
  output: obj({
    ics: z.string().describe("iCalendar text (RFC 5545); save as a .ics file"),
    filename: z.string(),
    events: z.number(),
    timezones: z.array(obj({ city: z.string(), date: z.string(), timezone: z.string().nullable() })),
    note: z.string(),
  }),
  description:
    "The tour as an iCalendar file (RFC 5545) to import into Google Calendar, Apple Calendar or Outlook: one event per show with venue, address and map point. Pass run_id (a saved plan, the id in /plan/<id>), plan (the Plan JSON from tourbo_plan_tour), or stops (date, city, optional venue / address / lat / lon / start_time / timezone). Each show's local start is converted with the city's time zone (from the world city table); when a zone isn't known the time stays local ('floating'). Skipped nights are left out. Returns the file text; nothing is stored.",
  input: z.object({
    run_id: z.string().optional().describe("Saved tour plan id"),
    plan: z.unknown().optional().describe("Plan JSON from tourbo_plan_tour"),
    stops: z.array(Stop).max(60).optional(),
    act: z.string().max(120).optional().describe("Act name for event titles"),
    region: Region.default("na").describe("Region used to look up stop cities"),
    start_time: time.default("20:00").describe("Default local show start"),
    minutes: z.number().int().min(15).max(24 * 60).default(120).describe("Show length"),
    all_day: z.boolean().default(false).describe("All-day events instead of timed shows"),
  }),
  run: async (p: { run_id?: string; plan?: unknown; stops?: StopIn[]; act?: string; region: RegionId; start_time: string; minutes: number; all_day: boolean }) => {
    const plan = await planOf(p);
    const stops = p.stops?.length ? p.stops : plan ? stopsOfPlan(plan) : [];
    if (!stops.length) throw new UserError(plan ? "That plan has no dated nights to export yet." : "Pass run_id, plan or stops to export a calendar.");
    const act = p.act ?? plan?.artist.name ?? "Show";
    const region = plan?.params.region ?? p.region;
    const events: IcsEvent[] = stops.map((s) => ({
      date: s.date,
      city: s.city,
      title: `${act}: ${s.city}${s.venue ? ` at ${s.venue}` : ""}`,
      start: p.all_day ? undefined : (s.start_time ?? p.start_time),
      minutes: p.minutes,
      allDay: p.all_day,
      timezone: zoneFor(s, region),
      venue: s.venue,
      address: s.address,
      lat: s.lat,
      lon: s.lon,
      description: s.note,
    }));
    const floating = events.filter((e) => !e.timezone && !e.allDay).length;
    return {
      ics: toIcs(events, { name: `${act} tour` }),
      filename: `${act.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "tour"}-tour.ics`,
      events: events.length,
      timezones: events.map((e) => ({ city: e.city, date: e.date, timezone: e.timezone ?? null })),
      note: floating ? `${floating} show${floating === 1 ? "" : "s"} without a known time zone keep local (floating) times.` : "Times converted with each city's time zone.",
    };
  },
};

export const MARKDOWN_TOOL: ToolDef = {
  name: "tourbo_export_markdown",
  title: "Export as markdown",
  hints: LOCAL,
  output: obj({ markdown: z.string(), title: z.string(), source: z.enum(["project", "plan"]) }),
  description:
    "A project (notes, to-dos, setlists, city briefs and attached plans) or a tour plan (nights, venues, money estimates, route) as clean markdown to paste into Notion, Asana or a doc. Pass project_id, run_id (a saved plan) or plan (the Plan JSON from tourbo_plan_tour). Nothing is stored.",
  input: z.object({
    project_id: z.string().optional(),
    run_id: z.string().optional(),
    plan: z.unknown().optional().describe("Plan JSON from tourbo_plan_tour"),
  }),
  run: async (p: { project_id?: string; run_id?: string; plan?: unknown }) => {
    if (p.project_id) {
      const project = await getProject(p.project_id);
      if (!project) throw new UserError("No project with that id: call tourbo_project_list.");
      return { markdown: projectMarkdown(project), title: project.title, source: "project" as const };
    }
    const plan = await planOf(p);
    if (!plan) throw new UserError("Pass project_id, run_id or plan to export.");
    return { markdown: planMarkdown(plan), title: `${plan.artist.name} tour`, source: "plan" as const };
  },
};

TOURBO_TOOLS.push(ICS_TOOL, MARKDOWN_TOOL);
