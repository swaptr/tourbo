import { z } from "zod";

import { findCity } from "@tourbo/core/engine/cities.ts";
import { placeFeatures } from "@tourbo/core/places/index.server.ts";
import { PerformerKind, Region, type PerformerKind as Kind, type Region as RegionId } from "@tourbo/core/shared/types.ts";

import { FAN_DATA, TOURBO_TOOLS, type ToolDef } from "./tools.ts";
import { PlacesResult } from "./outputs.ts";

// tourbo_place_features (PLAN §18 Q18): open-data place features (money, people, calendar, tone)
// per city and date, combined with fan data the caller passes in. Deterministic; registers itself
// into TOURBO_TOOLS so server.ts needs only a side-effect import.
export const PLACES_TOOL: ToolDef = {
  name: "tourbo_place_features",
  hints: FAN_DATA,
  output: PlacesResult,
  title: "Place features (money, people, calendar, tone)",
  description:
    "Supporting facts about each city from open data, to sharpen fan-data suggestions: income and price level (World Bank, US Census by state), median age (UN), free-expression index (V-Dem), religious-offence law notes, US state vote split (only as 'politics splits this room'), public holidays and usual weather on the show dates. Derived: priceNudge.factor (multiply the region's reference ticket, bounded 0.75–1.25), youngerCrowd.skew (younger → more recent covers/references), tone.addTopics (extra topics for the avoid list), dateRisk (holidays, heat, cold, rain), spendHeadroom (tight → cheap merch/bundles; roomy → premium tier). `surfaced` + `changes` list only the features that change a suggestion; mention the rest only if asked. `facts` carry refs for citing. Pass fan_youth (audience youth from fan data) and edge (city's taste lean) when you have them: fan data outweighs place data. Guidance, not legal advice.",
  input: z.object({
    cities: z.array(z.string().min(1)).min(1).max(8).describe('City names, or "City, Country" for anywhere'),
    region: Region.default("na").describe("Region used to look the cities up and pick the reference ticket"),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(14).default([]).describe("Show dates (YYYY-MM-DD) for holidays and weather; applied to every city"),
    kind: PerformerKind.default("musician"),
    ticket: z.number().positive().optional().describe("Ticket price in the region's currency, if already set"),
    merch: z.number().nonnegative().optional().describe("Expected merch spend per head, region currency"),
    fan_youth: z.number().min(-1).max(1).optional().describe("Fan-data youth score (under-30 minus 45+ affinity) for the room"),
    edge: z.enum(["edgier", "cleaner", "neutral"]).optional().describe("The city's taste lean for edgy comedy from fan data"),
  }),
  run: async ({ cities, region, dates, kind, ticket, merch, fan_youth, edge }: { cities: string[]; region: RegionId; dates: string[]; kind: Kind; ticket?: number; merch?: number; fan_youth?: number; edge?: "edgier" | "cleaner" | "neutral" }) => {
    const out = await Promise.all(
      cities.map(async (name) => {
        const c = findCity(region, name);
        if (!c) return { city: name, error: `Couldn't find ${name}; try "City, Country".` };
        const country = "country" in c ? String((c as { country: string }).country) : undefined;
        return placeFeatures({ ...c, country }, dates, { kind, ticket, merch, fanYouth: fan_youth, edge: edge ? { lean: edge } : undefined });
      }),
    );
    return { places: out, note: "Place data supports fan data; it never overrides it. Guidance, not legal advice." };
  },
};

TOURBO_TOOLS.push(PLACES_TOOL);
