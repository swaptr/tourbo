import { z } from "zod";

import { BOUNDARIES, FLAVOURS, type Boundary, type Flavour } from "@tourbo/core/context/index.ts";
import { findCity } from "@tourbo/core/engine/cities.ts";
import { AGE_RANGES, ideasFor, type Audience } from "@tourbo/core/engine/ideas.ts";
import { artistById } from "@tourbo/core/engine/resolve.ts";
import { locationQuery, PerformerKind, Region, type PerformerKind as Kind, type Region as RegionId } from "@tourbo/core/shared/types.ts";

import { FAN_DATA, type ToolDef } from "./tools.ts";
import { IdeasResult } from "./outputs.ts";

// tourbo_ideas (PLAN §18 Q12): "Ideas for this place". Deterministic and structured, so any
// assistant gets the same ideas as the website; the caller writes its own lines on top.
export const IDEAS_TOOL: ToolDef = {
  name: "tourbo_ideas",
  hints: FAN_DATA,
  output: IdeasResult,
  title: "Ideas for this place",
  description:
    "Grounded ideas of what to perform or make in each city, from Qloo taste data. Musicians and DJs: cover ideas (well-known artists the act's fans in that city over-index on vs the act's fans overall; from the city's own taste when the act is unknown) plus between-song topics. Comedians, speakers, poets, authors, podcasters, dancers: local topics (TV / films / podcasts / books, brands and teams, food and places, people, trending, themes) with a premise and a crowd-work question. Painters / visual artists: subjects and themes (landmarks, places, themes, the artists and films the city loves), taste-based, not sales predictions. Each idea: idea, category, ref (exact Qloo name), value (local score), why (the numbers), angle (a hint), cities (other cities where it also ranks). With 2+ cities, `region` ranks ideas across them (\"Play AC/DC in Brisbane and Perth, not Sydney\"): the same cover goes where it scores best. Every idea has rank (1 = best in that city, mixing categories) and local: true; the framing is \"keep your set, add this\": pass budget to cap ideas per city. Pass slot / flavour / boundaries for the performance context: each city then returns at most the originality budget for that slot as ideas (the rest as spare, still ranked), topics that hit the act's avoid list (never-punch-down rules, the act's boundaries, local rules) are dropped, and context says the slot, budget and note. Optional audience_age / audience_gender bias the lists toward that crowd. Write your own angles on top, naming only refs. No inference here.",
  input: z.object({
    cities: z.array(z.string().min(1)).min(1).max(8).describe('City names, or "City, Country" for anywhere'),
    region: Region.default("na").describe("Region used to look the cities up in the seed list first"),
    kind: PerformerKind.default("musician"),
    act_id: z.string().optional().describe("Qloo id of the act (tourbo_resolve_act); omit for an unlisted act: ideas come from the city alone"),
    peer_ids: z.array(z.string()).max(5).default([]).describe('Qloo ids of "sounds like" acts'),
    act_name: z.string().max(120).optional().describe("The act's name, never suggested as its own cover"),
    audience_age: z.array(z.enum(AGE_RANGES)).max(6).optional().describe("Bias toward this crowd's age ranges (younger → more recent acts and shows)"),
    audience_gender: z.enum(["male", "female"]).optional(),
    budget: z.number().int().min(1).max(20).optional().describe("Max ideas per city, best first (each idea has rank); local ideas are seasoning on the act's own set"),
    slot: z.string().max(40).optional().describe("Slot key for the discipline (see tourbo_disciplines / context slots), e.g. headline, support, co_bill, guest, festival, open_mic, showcase, host; sets how many local ideas fit. Omit with flavour and boundaries for every idea, uncapped"),
    flavour: z.enum(FLAVOURS).optional().describe("How many local touches: touch (≈1 per 25 min, ≤15% of the slot, default), some, lots. The act's own material always leads"),
    boundaries: z.array(z.enum(BOUNDARIES)).max(4).optional().describe("What the act is OK with; default clean (comics: edgy). Feeds the avoid list that drops topics"),
    skew: z.enum(["younger", "older"]).optional().describe("Era tilt for cover ideas: younger = more recent acts, older = classics (the act's own choice; overrides the audience guess)"),
  }),
  run: async ({ cities, region, kind, act_id, peer_ids, act_name, audience_age, audience_gender, budget, slot, flavour, boundaries, skew }: { cities: string[]; region: RegionId; kind: Kind; act_id?: string; peer_ids: string[]; act_name?: string; audience_age?: Audience["age"]; audience_gender?: Audience["gender"]; budget?: number; slot?: string; flavour?: Flavour; boundaries?: Boundary[]; skew?: "younger" | "older" }) => {
    const resolved = cities.map((name) => {
      const c = findCity(region, name);
      return { name: c?.name ?? name.replace(/,.*$/, "").trim(), query: c ? locationQuery(c) : name, ...(c ? { lat: c.lat, lon: c.lon, region: c.region } : {}) };
    });
    const signal = [act_id, ...peer_ids].filter((x): x is string => !!x);
    const artist = act_id ? await artistById(act_id, kind).catch(() => undefined) : undefined;
    return ideasFor({
      cities: resolved,
      kind,
      signal,
      actNames: [act_name, artist?.name].filter((x): x is string => !!x),
      styles: artist?.tags.map((t) => t.name).slice(0, 1),
      audience: audience_age?.length || audience_gender ? { age: audience_age, gender: audience_gender } : undefined,
      budget,
      ...(slot || flavour || boundaries?.length || skew ? { context: { slot, flavour, boundaries, skew } } : {}),
    });
  },
};
