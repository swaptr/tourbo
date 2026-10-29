import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { angleFacts, fanTaste } from "../engine/angles.ts";
import { seedCities } from "../engine/cities.ts";
import { openerCandidates, pickOpeners } from "../engine/openers.ts";
import { resolveArtist } from "../engine/resolve.ts";
import { routeTour, type Route } from "../engine/routing.ts";
import { scoreCities, shortlist } from "../engine/score.ts";
import type { Emit } from "../engine/trace.ts";
import { findVenues } from "../engine/venues.ts";
import {
  locationQuery,
  type Artist,
  type CityPlan,
  type CityScore,
  type Opener,
  type Plan,
  type Reference,
  type TourParams,
} from "../shared/types.ts";
import { critique } from "./critic.ts";
import { planCityWithWorker } from "./worker.ts";

const MAX_CRITIQUES = 2;

// Per-run state shared by the tools. The model sees compact summaries; full data stays here.
export type RunContext = {
  params: TourParams;
  emit: Emit;
  artist?: Artist;
  shortlist?: CityScore[];
  fans?: Promise<Reference[]>;
  openers?: Promise<Map<string, Opener>>;
  cities: Map<string, CityPlan>;
  route?: Route;
  critiques: number;
  plan?: Plan;
};

export function createContext(params: TourParams, emit: Emit): RunContext {
  return { params, emit, cities: new Map(), critiques: 0 };
}

export function createTools(ctx: RunContext) {
  const { emit } = ctx;
  const traced = <T>(name: string, input: unknown, fn: () => Promise<T>) => {
    emit("tool_call", name, { input });
    return fn();
  };

  const resolve_artist = betaZodTool({
    name: "resolve_artist",
    description: "Look up the artist in Qloo. Returns id, popularity (0–1) and genres. Call first.",
    inputSchema: z.object({ query: z.string() }),
    run: (input) =>
      traced("resolve_artist", input, async () => {
        const artist = await resolveArtist(input.query);
        if (!artist) return `No artist found for "${input.query}". Ask for a different spelling.`;
        ctx.artist = artist;
        ctx.fans = fanTaste(artist.id);
        return JSON.stringify({
          id: artist.id,
          name: artist.name,
          popularity: artist.popularity,
          genres: artist.tags.map((t) => t.name),
        });
      }),
  });

  const score_cities = betaZodTool({
    name: "score_cities",
    description:
      "Score every seed city in the tour region from Qloo fan heatmaps (0–100: fan footprint + over-indexing). Returns a shortlist of shows × 1.5 cities; thin = under 50 heatmap cells.",
    inputSchema: z.object({}),
    run: (input) =>
      traced("score_cities", input, async () => {
        if (!ctx.artist) return "Call resolve_artist first.";
        const scores = await scoreCities(ctx.artist.id, seedCities(ctx.params.region), emit);
        ctx.shortlist = shortlist(scores, ctx.params.shows);
        const candidates = ctx.shortlist;
        ctx.openers = openerCandidates(ctx.artist).then((c) => pickOpeners(c, candidates, emit));
        return JSON.stringify(
          ctx.shortlist.map((c) => ({
            city: c.city.name,
            score: c.score,
            heatmapCells: c.cells,
            thin: c.thinData,
          })),
        );
      }),
  });

  const plan_city = betaZodTool({
    name: "plan_city",
    description:
      "Plan one shortlisted city: finds venues near the top fan hotspot (widening the search if needed), a local opener, local culture, and has a worker pick venue + backup and write the promo angle. Call for several cities in parallel.",
    inputSchema: z.object({ city: z.string() }),
    run: (input) =>
      traced("plan_city", input, async () => {
        const score = ctx.shortlist?.find((c) => c.city.name.toLowerCase() === input.city.toLowerCase());
        if (!ctx.artist || !score) return `"${input.city}" is not on the shortlist. Call score_cities first and use its city names.`;
        const artist = ctx.artist;
        const [venues, facts, openers] = await Promise.all([
          findVenues(artist.id, score, emit),
          ctx.fans!.then((fans) => angleFacts(artist.id, locationQuery(score.city), fans)),
          ctx.openers!,
        ]);
        const opener = openers.get(score.city.name);
        const worker = await planCityWithWorker(
          {
            artist,
            city: score.city.name,
            roomMin: ctx.params.roomMin,
            roomMax: ctx.params.roomMax,
            heatmapCells: score.cells,
            venues,
            facts,
            opener,
          },
          emit,
        );
        const plan: CityPlan = {
          city: score.city,
          score: score.score,
          hotspots: score.hotspots,
          venue: worker.venue,
          backupVenue: worker.backupVenue,
          opener,
          facts,
          angle: worker.angle,
          capacity: worker.capacity,
          fit: worker.fit,
          evidence: worker.evidence,
          thinData: score.thinData,
        };
        ctx.cities.set(score.city.name, plan);
        return JSON.stringify({
          city: score.city.name,
          venue: worker.venue?.name,
          backup: worker.backupVenue?.name,
          capacityEstimate: worker.capacity && `${worker.capacity.min}–${worker.capacity.max}`,
          venueFoundBy: worker.venue?.foundBy,
          opener: opener && `${opener.name} (${opener.localCells} local cells)`,
          angle: worker.angle,
          evidence: worker.evidence.length,
          thin: score.thinData,
        });
      }),
  });

  const route_tour = betaZodTool({
    name: "route_tour",
    description:
      "Order the chosen planned cities into a tour (nearest neighbour + 2-opt from the home base) and assign dates. Pass exactly `shows` city names that have been planned.",
    inputSchema: z.object({ cities: z.array(z.string()) }),
    run: (input) =>
      traced("route_tour", input, async () => {
        const missing = input.cities.filter((c) => !ctx.cities.has(c));
        if (missing.length) return `Plan these cities first: ${missing.join(", ")}.`;
        const picks = input.cities.map((c) => ctx.shortlist!.find((s) => s.city.name === c)!);
        const home = seedCities(ctx.params.region).find(
          (c) => c.name.toLowerCase() === ctx.params.homeBase?.toLowerCase(),
        );
        ctx.route = routeTour(picks, ctx.params.startDate, home);
        return JSON.stringify({
          stops: ctx.route.stops.map((s) => `${s.date} ${s.city.city.name}`),
          legs: ctx.route.legs.map((l) => `${l.from} → ${l.to} ${l.km} km`),
          totalKm: ctx.route.totalKm,
        });
      }),
  });

  const critique_plan = betaZodTool({
    name: "critique_plan",
    description: `Check the routed plan: venues and backups present, Qloo evidence grounded, thin-data cities, capacity fit, long legs. Call before finalize_plan; at most ${MAX_CRITIQUES} times.`,
    inputSchema: z.object({}),
    run: (input) =>
      traced("critique_plan", input, async () => {
        if (ctx.critiques >= MAX_CRITIQUES) return "Critique budget used. Finalize with the best plan you have.";
        ctx.critiques++;
        const routed = (ctx.route?.stops ?? []).map((s) => ctx.cities.get(s.city.city.name)!);
        const issues = critique(routed, ctx.route, ctx.params);
        emit("critic", issues.length ? `${issues.length} issues` : "No issues", { issues });
        return issues.length ? JSON.stringify(issues) : "No issues. Finalize.";
      }),
  });

  const finalize_plan = betaZodTool({
    name: "finalize_plan",
    description: "Save the routed plan as the final tour. Call once, last.",
    inputSchema: z.object({ summary: z.string().describe("two or three sentences for the user") }),
    run: (input) =>
      traced("finalize_plan", input, async () => {
        if (!ctx.artist || !ctx.route) return "Route the tour first.";
        const stops = ctx.route.stops.map(({ city, date }) => ({ ...ctx.cities.get(city.city.name)!, date }));
        ctx.plan = {
          artist: ctx.artist,
          params: ctx.params,
          stops,
          legs: ctx.route.legs,
          totalKm: ctx.route.totalKm,
        };
        emit("decision", input.summary);
        return "Saved.";
      }),
  });

  return [resolve_artist, score_cities, plan_city, route_tour, critique_plan, finalize_plan];
}
