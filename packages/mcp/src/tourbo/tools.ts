// Tourbo domain tools: deterministic, Qloo-grounded, stateless (every call carries its inputs;
// the Qloo cache makes repeats cheap). No inference happens here; the caller's model decides.
import { z } from "zod";

import { critique } from "@tourbo/core/critic/critic.ts";
import { cityBrief } from "@tourbo/core/engine/brief.ts";
import { citiesNear, findCity as findCityByName, seedCities } from "@tourbo/core/engine/cities.ts";
import { defaultCapacity, estimateDemand, legCosts, median, optimise, REGION_DEFAULTS } from "@tourbo/core/engine/economics.ts";
import { ALL_REGIONS, findMarkets, resolveMarketSignal } from "@tourbo/core/engine/markets.ts";
import { openerCandidates, pickOpeners } from "@tourbo/core/engine/openers.ts";
import { buildPlan } from "@tourbo/core/engine/plan.ts";
import { priceAdjust } from "@tourbo/core/places/hooks.server.ts";
import { assessOffer } from "@tourbo/core/engine/negotiate.ts";
import { ticketPace } from "@tourbo/core/engine/pace.ts";
import { allocatePromo } from "@tourbo/core/engine/promo.ts";
import { artistById, resolvePerformer, signalIds } from "@tourbo/core/engine/resolve.ts";
import { routeTour } from "@tourbo/core/engine/routing.ts";
import { scoreCities, shortlist } from "@tourbo/core/engine/score.ts";
import type { Emit } from "@tourbo/core/engine/trace.ts";
import { findVenues, roomType } from "@tourbo/core/engine/venues.ts";
import { accessFor } from "@tourbo/core/engine/access.ts";
import { actsForVenue } from "@tourbo/core/engine/reverse.ts";
import { locationQuery, PerformerKind, Region, REGION_NAMES, type Artist, type City, type CityScore } from "@tourbo/core/shared/types.ts";
import { DISCIPLINES, discipline } from "@tourbo/core/disciplines/index.ts";
import { actKinds } from "@tourbo/core/disciplines/labels.server.ts";
import { personas, ROLEPLAY_INSTRUCTIONS } from "@tourbo/core/engine/rehearsal.ts";
import { buildSet, parseSetLines, SET_TAGS } from "@tourbo/core/engine/set.ts";
import { cached, DAY, hashKey } from "@tourbo/core/cache/index.ts";
import { qlooErrorCount } from "@tourbo/core/qloo/client.server.ts";
import { addItem, attachRun, createProject, deleteItem, getProject, ItemKind, listProjects, projectMarkdown, setItemDone } from "@tourbo/core/projects/projects.server.ts";

import { UserError } from "../errors.ts";
import * as out from "./outputs.ts";
import { planInput } from "./plan-input.ts";

const { obj, num, str } = out;

const kind = PerformerKind.default("musician").describe(
  `Discipline: ${PerformerKind.options.join(", ")}. See tourbo_disciplines for spaces, revenue and how each resolves in Qloo.`,
);

// Public view of the registry (tool + tourbo://disciplines resource). Label and hint from the
// act_kinds table when the DB answers (registry otherwise).
export const disciplineCatalog = async () => {
  const shown = new Map((await actKinds()).map((k) => [k.kind, k]));
  return Object.values(DISCIPLINES).map((d) => ({
    key: d.key,
    label: shown.get(d.key)?.label ?? d.label,
    hint: shown.get(d.key)?.hint ?? d.hint,
    resolvesAs: d.entityTypes,
    spaces: [...new Set(d.spaces.map((s) => s.label))],
    support: d.support,
    revenue: d.revenue,
    stayDays: d.stayDays,
    sceneTagExamples: d.scene,
    verified: d.verified,
  }));
};
const region = Region.describe(`Tour region: ${Region.options.map((r) => `${r} = ${REGION_NAMES[r]}`).join(", ")}`);
const actId = z.string().describe("Qloo entity id of the act, from tourbo_resolve_act");
const peerIds = z.array(z.string()).max(5).default([]).describe('Qloo ids of "sounds like" acts blended into the fan signal');
const cityName = z.string().describe("City name from the region's seed list (see tourbo_score_cities)");

// MCP tool annotations (spec 2026-07-28 ToolAnnotations). Hints, not guarantees: readOnly = no
// change to any stored state; idempotent = repeating the same call has no extra effect;
// openWorld = reaches outside this server (fan data, open-data APIs); destructive = may delete
// or overwrite (only meaningful when not read-only).
export type ToolHints = { readOnly: boolean; idempotent: boolean; openWorld: boolean; destructive?: boolean };
export const FAN_DATA: ToolHints = { readOnly: true, idempotent: true, openWorld: true }; // reads fan data / open data
export const LOCAL: ToolHints = { readOnly: true, idempotent: true, openWorld: false }; // pure calculation or a DB read

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  output: z.ZodObject; // outputSchema; structuredContent must validate. Arrays go under {result}.
  hints: ToolHints;
  run: (input: any, emit: Emit) => Promise<unknown>;
};

const r1 = (n?: number) => (n === undefined ? undefined : Math.round(n * 100) / 100);

// Seed list first, then any world city (GeoNames table) by name or "City, Country".
function findCity(regionId: Region, name: string): City {
  const city = findCityByName(regionId, name);
  if (!city) throw new UserError(`Unknown city "${name}": use a name from tourbo_score_cities, or "City, Country".`);
  return city;
}

async function act(id: string, peers: string[], k: Artist["kind"]): Promise<Artist> {
  const artist = await artistById(id, k);
  if (!artist) throw new UserError(`No act with id ${id}: call tourbo_resolve_act first and use its id.`);
  return { ...artist, kind: k, peers: peers.map((p) => ({ id: p, name: p })) };
}

const SCORE_FORMULA = "score = 60% reach (how many fans) + 40% lean (how strongly the city leans to the act), each 0–100 across these candidates";
const TOP_HOTSPOTS = 3;
const compactHotspots = (c: CityScore) =>
  c.hotspots.slice(0, TOP_HOTSPOTS).map((h) => ({ geohash: h.geohash, lat: h.lat, lon: h.lon, affinity: r1(h.affinity), popularity: r1(h.popularity) }));
const compactScore = (c: CityScore, hotspots = true) => ({
  city: c.city.name,
  lat: r1(c.city.lat),
  lon: r1(c.city.lon),
  score: c.score,
  reach: c.reach,
  lean: c.lean,
  heatmapCells: c.cells,
  fanIndex: c.fanIndex,
  thinData: c.thinData,
  ...(hotspots ? { hotspots: compactHotspots(c) } : {}),
});
const detailFlag = z.boolean().default(false).describe("true = full output (hotspots for every city, venue descriptions); default is compact");

// Read-only, Qloo-derived tools: results cached 1 day per exact input (namespace tool:<name>).
// Not cached when any Qloo request failed during the run (engines degrade quietly on errors) or
// the tool threw. A cache hit replays no progress events.
export const CACHED_TOOLS = new Set(["tourbo_score_cities", "tourbo_city_detail", "tourbo_openers", "tourbo_city_brief"]);
export const TOOL_TTL = DAY;

export function withCache(tool: ToolDef): ToolDef {
  return {
    ...tool,
    run: (input, emit) => {
      let degraded = false;
      return cached(
        hashKey(input),
        async () => {
          const errors = qlooErrorCount();
          const value = await tool.run(input, emit);
          degraded = qlooErrorCount() !== errors;
          return value;
        },
        { ns: `tool:${tool.name}`, ttl: TOOL_TTL, cacheable: () => !degraded },
      );
    },
  };
}

const TOOLS: ToolDef[] = [
  {
    name: "tourbo_project_create",
    hints: { readOnly: false, idempotent: false, openWorld: false, destructive: false },
    output: obj({ id: z.string(), title: z.string(), artist: str, kind: str, createdAt: z.string() }),
    title: "Create a tour project",
    description:
      "Start a project for one tour or show: a small notebook for notes, to-dos, setlist or bit drafts and saved city briefs that tour plans attach to. Returns the project id. Projects are stored on this Tourbo server (shared with its website).",
    input: z.object({ title: z.string().min(1).max(120), artist: z.string().max(120).optional(), kind: kind.optional() }),
    run: async ({ title, artist, kind: k }) => createProject({ title, artist, kind: k }),
  },
  {
    name: "tourbo_project_list",
    hints: LOCAL,
    output: obj({ projects: z.array(obj({ id: z.string(), title: z.string(), artist: str, kind: str, createdAt: z.string(), items: z.number(), runs: z.number() })) }),
    title: "List tour projects",
    description: "Recent tour projects with item and plan counts.",
    input: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
    run: async ({ limit }) => ({ projects: await listProjects(limit) }),
  },
  {
    name: "tourbo_project_get",
    hints: LOCAL,
    output: obj({ ...out.NotFound, project: obj({ id: z.string(), title: z.string(), items: z.array(obj({ id: z.string(), kind: z.string(), text: z.string(), done: z.boolean(), city: str })), runs: z.array(obj({ id: z.string(), status: z.string(), cities: z.array(z.string()) })) }).optional(), markdown: z.string().optional() }),
    title: "Get a tour project",
    description:
      "One project with its items and attached tour plans, plus the same content as clean markdown (paste it into Notion, Asana or a doc).",
    input: z.object({ project_id: z.string() }),
    run: async ({ project_id }) => {
      const p = await getProject(project_id);
      if (!p) return { found: false, hint: "No project with that id. Call tourbo_project_list." };
      return { found: true, project: p, markdown: projectMarkdown(p) };
    },
  },
  {
    name: "tourbo_project_update",
    hints: { readOnly: false, idempotent: true, openWorld: false, destructive: true },
    output: obj({ ok: z.boolean(), item_id: z.string(), action: z.string() }),
    title: "Update a project item",
    description: "Change one project item: action mark_done / mark_not_done ticks a to-do, delete removes the item (can't be undone). Other items are untouched.",
    input: z.object({
      project_id: z.string(),
      item_id: z.string(),
      action: z.enum(["mark_done", "mark_not_done", "delete"]).optional().describe("mark_done | mark_not_done | delete (permanent)"),
      // Legacy shape (before `action`), still accepted: tests/bdd and older prompts send it.
      done: z.boolean().optional().describe("Deprecated: use action"),
      delete: z.boolean().optional().describe("Deprecated: use action"),
    }),
    run: async (p: { project_id: string; item_id: string; action?: "mark_done" | "mark_not_done" | "delete"; done?: boolean; delete?: boolean }) => {
      const { project_id, item_id } = p;
      const action = p.action ?? (p.delete ? "delete" : p.done === true ? "mark_done" : p.done === false ? "mark_not_done" : undefined);
      if (!action) throw new UserError("Pass action: mark_done, mark_not_done or delete.");
      if (![project_id, item_id].every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new UserError("No project or item with that id: get the ids from tourbo_project_get.");
      if (action === "delete") await deleteItem(project_id, item_id);
      else await setItemDone(project_id, item_id, action === "mark_done");
      return { ok: true, item_id, action };
    },
  },
  {
    name: "tourbo_project_add",
    hints: { readOnly: false, idempotent: false, openWorld: false, destructive: false },
    output: obj({ attached: z.string().optional(), item: obj({ id: z.string(), kind: z.string(), text: z.string(), done: z.boolean(), city: str }).optional() }),
    title: "Add to a tour project",
    description:
      "Add a note, to-do, setlist / bit draft or city brief to a project (optionally for one city), or attach a tour plan by its run id (the id in /plan/<id>). Save show notes or a tourbo_city_brief summary here so they're there next time.",
    input: z.object({
      project_id: z.string(),
      kind: ItemKind.optional().describe("note | todo | setlist | brief; omit when only attaching a plan"),
      text: z.string().max(8000).optional(),
      city: z.string().max(80).optional(),
      run_id: z.string().optional().describe("Attach this tour plan to the project"),
    }),
    run: async ({ project_id, kind: itemKind, text, city, run_id }) => {
      if (!run_id && !(itemKind && text)) throw new UserError("Pass kind and text to add an item, or run_id to attach a plan.");
      const out: Record<string, unknown> = {};
      if (run_id) {
        await attachRun(project_id, run_id);
        out.attached = run_id;
      }
      if (itemKind && text) out.item = await addItem(project_id, { kind: itemKind, text, city });
      return out;
    },
  },
  {
    name: "tourbo_disciplines",
    hints: LOCAL,
    output: obj({ disciplines: z.array(obj({ key: z.string(), label: z.string(), resolvesAs: z.array(z.string()), spaces: z.array(z.string()) })) }),
    title: "List disciplines",
    description:
      `Every kind of act Tourbo plans for (${PerformerKind.options.length}: ${PerformerKind.options.join(", ")}): which Qloo entity types it resolves as, the spaces it books, the support act, revenue models, stay length per city, scene tags to try when the act isn't in Qloo, and the probe that verified it. Most painters, dancers and poets are not Qloo entities: resolve with peers, or use tourbo_find_markets with scene tags.`,
    input: z.object({}),
    run: async () => ({ disciplines: await disciplineCatalog() }),
  },
  {
    name: "tourbo_resolve_act",
    hints: FAN_DATA,
    output: obj({ ...out.NotFound, unknown: z.boolean().optional(), id: z.string().optional(), name: z.string().optional(), kind: z.string().optional(), popularity: num, genres: z.array(z.string()).optional(), peers: z.array(obj({ id: z.string(), name: z.string() })).optional() }),
    title: "Resolve an act",
    description:
      "Look up an act (any discipline) in Qloo and return its id, popularity and genres. Pass `peers` (comparable acts) for unknown or niche acts: their fans are blended into the signal. Call first.",
    input: z.object({
      name: z.string(),
      kind,
      peers: z.array(z.string()).max(5).default([]).describe("Comparable acts (\"sounds like\")"),
      not_in_qloo: z.boolean().default(false).describe("The act says the Qloo entity with this name isn't them: plan from peers only"),
    }),
    run: async ({ name, kind: k, peers, not_in_qloo }) => {
      const a = await resolvePerformer(name, k, peers, not_in_qloo);
      if (!a) return { found: false, hint: `No ${k} named "${name}" in Qloo. Retry with comparable acts in peers.` };
      return { found: true, unknown: a.unknown, id: a.id, name: a.name, kind: a.kind, popularity: r1(a.popularity), genres: a.tags.map((t) => t.name), peers: a.peers };
    },
  },
  {
    name: "tourbo_score_cities",
    hints: FAN_DATA,
    output: obj({ region: z.string(), medianFanIndex: z.number(), shortlist: z.array(z.string()), scoreFormula: z.string(), cities: z.array(out.CityScoreRow) }),
    title: "Score tour markets",
    description:
      "Score every seed city in a region (or near a point) from Qloo fan heatmaps (0–100 = 0.6 × fan footprint + 0.4 × over-indexing, relative to this set). Returns every city's score, reach, lean and fanIndex (relative demand for tourbo_show_economics), a shortlist of shows × 1.5, and the top 3 fan hotspots (geohash cells) for shortlisted cities (every city with detail:true). Thin data = under 50 heatmap cells.",
    input: z.object({
      act_id: actId,
      peer_ids: peerIds,
      region,
      shows: z.number().int().min(1).max(20).default(6),
      near: z
        .object({ lat: z.number(), lon: z.number(), radius_km: z.number().min(50).max(5000) })
        .optional()
        .describe("Only score cities within radius_km of this point (topped up with the nearest if too few)"),
      detail: detailFlag,
    }),
    run: async ({ act_id, peer_ids, region: rg, shows, near, detail }, emit) => {
      const area = near && citiesNear({ lat: near.lat, lon: near.lon, radiusKm: near.radius_km }, Math.ceil(shows * 1.5));
      const cities = area ? area.cities : seedCities(rg);
      const scores = await scoreCities([act_id, ...peer_ids], cities, emit);
      const short = shortlist(scores, shows);
      // With `near`, the region (money profile) is the circle's, whatever was passed.
      const listed = new Set(short.map((c) => c.city.name));
      return {
        region: area ? area.region : rg,
        medianFanIndex: median(scores.map((s) => s.fanIndex ?? 0)),
        shortlist: short.map((c) => c.city.name),
        scoreFormula: SCORE_FORMULA,
        cities: scores.map((c) => compactScore(c, detail || listed.has(c.city.name))),
      };
    },
  },
  {
    name: "tourbo_find_markets",
    hints: FAN_DATA,
    output: obj({ ...out.NotFound, signal: obj({ acts: z.array(obj({ id: z.string(), name: z.string() })), tags: z.array(obj({ id: z.string(), name: z.string() })) }).optional(), markets: z.array(out.CityScoreRow.extend({ region: z.string() })).optional(), note: str }),
    title: "Find markets where acts like you win",
    description:
      "Rank cities across regions by the fans of comparable acts and/or a genre or scene tag (e.g. acts=['Nusrat Fateh Ali Khan'] or genres=['qawwali']). Use for new or foreign acts deciding where to tour. Scores are relative within this call.",
    input: z.object({
      acts: z.array(z.string()).max(5).default([]),
      genres: z.array(z.string()).max(3).default([]).describe("Genre/scene names or urn:tag ids"),
      regions: z.array(Region).default([...ALL_REGIONS]),
      kind,
      limit: z.number().int().min(3).max(40).default(12),
    }),
    run: async ({ acts, genres, regions, kind: k, limit }, emit) => {
      const signal = await resolveMarketSignal({ acts, genres, kind: k });
      if (!signal.acts.length && !signal.tags.length) return { found: false, hint: "None of the acts or genres resolved in Qloo." };
      const markets = await findMarkets(signal, regions, emit);
      return {
        signal,
        markets: markets.slice(0, limit).map((m) => ({ ...compactScore(m, false), region: m.region })),
        note: "Score = fan footprint + over-indexing of this signal, normalised across the cities in this call.",
      };
    },
  },
  {
    name: "tourbo_city_detail",
    hints: FAN_DATA,
    output: obj({ city: z.string(), heatmapCells: z.number(), fanIndex: num, thinData: z.boolean(), hotspots: z.array(out.Hotspot), venues: z.array(out.DetailVenue), opener: out.Opener.optional() }),
    title: "Venues, opener and local facts for one city",
    description:
      "For one city: venue candidates near the top fan hotspot (search widens 1.5 → 3 → 6 km → area → city when thin; each candidate has Qloo affinity, popularity, room type and how it was found), a local opener (a local favourite sharing the audience, else the similar act with the most local heatmap presence), and angle facts (fan taste, city culture, local spots).",
    input: z.object({ act_id: actId, peer_ids: peerIds, kind, region, city: cityName, detail: detailFlag }),
    run: async ({ act_id, peer_ids, kind: k, region: rg, city, detail }, emit) => {
      const artist = await act(act_id, peer_ids, k);
      const [score] = await scoreCities(signalIds(artist), [findCity(rg, city)], emit);
      const [venues, openers] = await Promise.all([
        findVenues(signalIds(artist), score, emit, k),
        // Openers are optional: some Qloo entities heatmap fine but reject similar-entity insights.
        openerCandidates(artist)
          .then((c) => pickOpeners(artist, c, [score], emit))
          .catch((error: Error) => {
            emit("repair", `Openers unavailable for ${score.city.name}: ${error.message.slice(0, 120)}`);
            return new Map() as Awaited<ReturnType<typeof pickOpeners>>;
          }),
      ]);
      return {
        city: score.city.name,
        heatmapCells: score.cells,
        fanIndex: score.fanIndex,
        thinData: score.thinData,
        hotspots: compactHotspots(score),
        venues: venues.map((v) => ({
          id: v.id,
          name: v.name,
          roomType: roomType(v.tag),
          defaultCapacityEstimate: defaultCapacity(roomType(v.tag)),
          neighborhood: v.neighborhood,
          address: v.address,
          lat: v.lat,
          lon: v.lon,
          affinity: r1(v.affinity),
          popularity: r1(v.popularity),
          foundBy: v.foundBy,
          ...(detail && v.description ? { description: v.description.slice(0, 200) } : {}),
        })),
        opener: openers.get(score.city.name),
      };
    },
  },
  {
    name: "tourbo_openers",
    hints: FAN_DATA,
    output: obj({ openers: z.record(z.string(), out.Opener) }),
    title: "Openers for a set of tour cities",
    description:
      "Pick an opener per city for the given tour cities: a local favourite that shares the headliner's audience wins; otherwise the similar, smaller act with the most local pull (heatmap cells here ÷ mean across these cities × log cells). Pass the whole shortlist so local pull is comparable.",
    input: z.object({ act_id: actId, peer_ids: peerIds, kind, region, cities: z.array(cityName).min(1).max(20) }),
    run: async ({ act_id, peer_ids, kind: k, region: rg, cities }, emit) => {
      const artist = await act(act_id, peer_ids, k);
      const scores = cities.map((name: string) => ({ city: findCity(rg, name), score: 0, cells: 0, hotspots: [], thinData: false }));
      const picks = await openerCandidates(artist).then((c) => pickOpeners(artist, c, scores, emit));
      return { openers: Object.fromEntries(picks) };
    },
  },
  {
    name: "tourbo_city_brief",
    hints: FAN_DATA,
    output: obj({ city: z.string(), fanTaste: z.array(out.Reference), cityCulture: z.array(out.Reference), localArtists: z.array(out.Reference), localSpots: z.array(out.Reference), sponsors: z.array(out.Reference), fanTags: z.array(out.Reference) }),
    title: "City brief for show prep",
    description:
      "Grounded material for set notes, banter, setlists and sponsor asks in one city: what the act's fans love, what the city loves (TV, brands, people, podcasts), the city's own music scene, local spots the fans like, city brands ranked by the fans (sponsor candidates) and concepts the fans over-index on. Every item carries its Qloo affinity/popularity; cite them, don't invent others. Qloo has no news: current local topics need a web search.",
    input: z.object({ act_id: actId, peer_ids: peerIds, kind, region, city: cityName }),
    run: async ({ act_id, peer_ids, kind: k, region: rg, city }) => {
      const c = findCity(rg, city);
      return cityBrief({ signal: [act_id, ...peer_ids], city: locationQuery(c), kind: k });
    },
  },
  {
    name: "tourbo_rehearsal_panel",
    hints: FAN_DATA,
    output: obj({ city: z.string(), personas: z.array(obj({ id: z.string(), name: z.string(), who: z.string(), slice: z.array(out.Reference) })), instructions: z.string(), label: z.string() }),
    title: "Rehearsal panel personas",
    description:
      "Simulated audience members for one city, each a small slice of that city's Qloo brief (the superfan, the scene regular, the born-and-raised local, the plus-one). Role-play them against a draft set or setlist to see which lines land: every reaction must cite a name from that persona's slice. Returns personas plus instructions; this server does no inference. A rehearsal, not a prediction.",
    input: z.object({ act_id: actId, peer_ids: peerIds, kind, region, city: cityName }),
    run: async ({ act_id, peer_ids, kind: k, region: rg, city }) => {
      const c = findCity(rg, city);
      const brief = await cityBrief({ signal: [act_id, ...peer_ids], city: locationQuery(c), kind: k });
      return { city: c.name, personas: personas(brief, c.name), instructions: ROLEPLAY_INSTRUCTIONS, label: "Rehearsal with simulated fans from Qloo data, not a prediction" };
    },
  },
  {
    name: "tourbo_build_set",
    hints: FAN_DATA,
    output: out.SetResult,
    title: "Build my set (running order per city)",
    description:
      "Order the act's own songs or bits for each city. Pass items (title, optional tag opener|slow|banger|closer, minutes, 1–2 style names such as genres) or paste them as text, one per line (\"Title, banger, 4, indie folk\"). The fan data has no songs, so fit is by style: each style is matched to the genre tags of what the city over-indexes on. Returns per city: running order (every item exactly once) with a reason per move citing a name in that city's facts, a local-nod slot, 2–3 cover ideas (artists the act's fans in that city over-index on, with the number), crowd-work topics for comics, a length check against the slot and one weak spot. Deterministic, no inference: write your own reasons on top, citing only fact names.",
    input: z.object({
      items: z
        .array(z.object({ title: z.string().min(1).max(120), tag: z.enum(SET_TAGS).optional(), minutes: z.number().positive().max(60).optional(), styles: z.array(z.string().max(60)).max(2).optional() }))
        .max(40)
        .default([]),
      text: z.string().max(6000).optional().describe("Pasted list, one per line; used when items is empty"),
      cities: z.array(z.string()).min(1).max(8),
      region: region.default("na"),
      kind,
      slot: z.string().max(40).default("headline").describe("Slot key for the discipline (see tourbo_disciplines / context slots), e.g. headline, support, co_bill, guest, festival, open_mic, feature, keynote; unknown keys fall back to headline"),
      flavour: z.enum(["touch", "some", "lots"]).default("touch").describe("How many local touches: a touch (≈1 per 25 min, ≤15% of the slot), some, lots. The act's own material always leads"),
      boundaries: z.array(z.enum(["clean", "edgy", "dark", "political"])).max(4).optional().describe("What the act is OK with; default clean (comics: edgy). Feeds the avoid list"),
      target_minutes: z.number().int().min(5).max(240).optional().describe("Override the slot length"),
      act_id: actId.optional().describe("Qloo id of the act (from tourbo_resolve_act); omit for unlisted acts"),
      peer_ids: peerIds,
      default_styles: z.array(z.string()).max(2).optional().describe("Styles for items without their own; defaults to the act's genres"),
      skew: z.enum(["younger", "older"]).optional().describe("Era tilt for cover ideas: younger = more recent acts, older = classics (the act's own choice)"),
    }),
    run: async ({ items, text, cities, region: rg, kind: k, slot, flavour, boundaries, target_minutes, act_id, peer_ids, default_styles, skew }) => {
      const list = items.length ? items : parseSetLines(text ?? "");
      if (!list.length) throw new UserError("Paste at least one song or bit, one per line.");
      const signal = [act_id, ...peer_ids].filter((x): x is string => !!x);
      const artist = act_id ? await artistById(act_id, k).catch(() => undefined) : undefined;
      const resolved = cities.map((name: string) => {
        const c = findCityByName(rg, name);
        return { name: c?.name ?? name, query: c ? locationQuery(c) : name, region: rg, country: c && "country" in c ? String(c.country) : undefined };
      });
      return buildSet({
        items: list,
        cities: resolved,
        kind: k,
        slot,
        signal,
        actNames: artist ? [artist.name] : [],
        defaultStyles: default_styles ?? artist?.tags.map((t) => t.name).slice(0, 2) ?? [],
        targetMinutes: target_minutes,
        flavour,
        boundaries,
        skew,
      });
    },
  },
  {
    name: "tourbo_route",
    hints: LOCAL,
    output: obj({ stops: z.array(obj({ date: z.string(), city: z.string() })), legs: z.array(obj({ from: z.string(), to: z.string(), km: z.number() })), totalKm: z.number() }),
    title: "Route a tour",
    description:
      "Order cities into a tour (nearest neighbour + 2-opt from the home base) and assign dates (≤500 km per drive day, flights over 1200 km, a day off every 4 shows). Returns stops with dates, legs in km and total km.",
    input: z.object({ region, cities: z.array(cityName).min(1).max(20), start_date: z.iso.date(), home_base: cityName.optional(), kind: kind.optional() }),
    run: async ({ region: rg, cities, start_date, home_base, kind: k }) => {
      const picks = cities.map((name: string) => ({ city: findCity(rg, name), score: 0, cells: 0, hotspots: [], thinData: false }));
      const route = routeTour(picks, start_date, home_base ? findCity(rg, home_base) : undefined, discipline(k).stayDays);
      return { stops: route.stops.map((s) => ({ date: s.date, city: s.city.city.name })), legs: route.legs, totalKm: route.totalKm };
    },
  },
  {
    name: "tourbo_show_economics",
    hints: LOCAL,
    output: obj({ city: z.string(), best: out.Outcome, alternatives: z.array(out.Outcome), verdict: z.enum(["headline", "co-headline", "support slot", "skip"]), why: z.string(), currency: z.string(), demand: obj({ typicalDraw: z.number(), relDemand: z.number(), draw: z.number(), basis: z.string() }), estimate: z.literal(true), assumptions: obj({}) }),
    title: "Show economics (estimate)",
    description:
      "Estimate one show's money and pick the best deal: grid over deal (door split, guarantee, versus, free-entry bar deal) × ticket price × room. Draw = the act's typical draw (from room size, or calibrated from logged past shows) × √(city fanIndex ÷ tour median fanIndex). Returns tickets, sell-through, artist take, costs, profit, break-even price, a verdict (headline / co-headline / support slot / skip) and the formula used. All money is an ESTIMATE in the region's currency; Qloo has no capacity, price or sales data.",
    input: z.object({
      region,
      kind,
      city: z.string(),
      fan_index: z.number().nonnegative().describe("fanIndex of this city from tourbo_score_cities / tourbo_city_detail"),
      median_fan_index: z.number().positive().describe("medianFanIndex from tourbo_score_cities"),
      room_min: z.number().int().positive().default(200),
      room_max: z.number().int().positive().default(800),
      rooms: z.array(z.object({ name: z.string(), capacity: z.number().int().positive() })).max(6).default([]).describe("Candidate rooms with (estimated) capacity"),
      travel_km: z.number().nonnegative().default(0).describe("Leg into this city"),
      crew: z.number().int().min(1).max(20).default(3),
      opener: z.boolean().default(true),
      ticket_price: z.number().positive().optional().describe("Fix the price; omit to optimise"),
      promo: z.number().nonnegative().default(0),
      sponsor: z.number().nonnegative().default(0),
      min_guarantee: z.number().nonnegative().optional(),
      past_shows: z.array(z.object({ fanIndex: z.number(), attendance: z.number() })).default([]).describe("Logged shows of this act for calibration"),
      price_factor: z.number().min(0.75).max(1.25).optional().describe("priceNudge.factor from tourbo_place_features (only when it surfaced): multiplies the region's reference ticket"),
      elasticity: z.number().min(0.9).max(1.5).optional().describe("priceNudge.elasticity from tourbo_place_features: local price sensitivity (default 1.1)"),
    }),
    run: async (p) => {
      const demand = estimateDemand({ fanIndex: p.fan_index, medianFanIndex: p.median_fan_index, roomMin: p.room_min, roomMax: p.room_max, pastShows: p.past_shows });
      const rec = optimise({
        region: p.region,
        kind: p.kind,
        demand,
        rooms: p.rooms,
        costs: legCosts(p.travel_km, p.crew, p.opener),
        price: p.ticket_price,
        promo: p.promo,
        sponsor: p.sponsor,
        minGuarantee: p.min_guarantee,
        priceFactor: p.price_factor,
        elasticity: p.elasticity,
      });
      return { city: p.city, ...rec, estimate: true, assumptions: { ...REGION_DEFAULTS[p.region as Region], elasticity: rec.priceNudge?.elasticity ?? 1.1, ticketFees: 0.1, ...(rec.priceNudge ? { priceFactor: rec.priceNudge.factor } : {}) } };
    },
  },
  {
    name: "tourbo_assess_offer",
    hints: LOCAL,
    output: obj({ decision: z.enum(["accept", "counter", "walk_away"]), offered: obj({ take: z.number(), profit: z.number(), tickets: z.number(), venueNet: z.number() }), planned: obj({ profit: z.number(), deal: z.string() }), counter: obj({ deal: z.string(), take: z.number(), profit: z.number() }).optional(), reasons: z.array(z.string()), currency: z.string(), estimate: z.literal(true) }),
    title: "Assess a venue offer (negotiation)",
    description:
      "Given a venue's offer (deal, ticket price, capacity, guarantee, door split) and the planned show from tourbo_show_economics, decide accept / counter / walk_away against the act's walk-away limits, and compute a counter (versus deal with the guarantee that reaches 85% of planned profit, capped at what the room's door can pay). Deterministic; money is an ESTIMATE.",
    input: z.object({
      region,
      kind,
      draw: z.number().positive().describe("Estimated tickets at the reference price (draw from tourbo_show_economics)"),
      capacity: z.number().int().positive().describe("Planned room capacity"),
      price: z.number().positive().describe("Planned ticket price"),
      costs: z.number().nonnegative().describe("The act's costs for this show"),
      planned_profit: z.number(),
      planned_deal: z.string().default("door_split"),
      offer: z.object({
        deal: z.enum(["door_split", "guarantee", "versus", "bar_deal"]),
        price: z.number().positive().optional(),
        capacity: z.number().int().positive().optional(),
        guarantee: z.number().nonnegative().optional(),
        split: z.number().min(0).max(1).optional().describe("Artist share of net door, 0–1"),
      }),
      min_guarantee: z.number().nonnegative().optional(),
      min_door_split: z.number().min(0).max(1).optional(),
    }),
    run: async (p) =>
      assessOffer({
        region: p.region,
        kind: p.kind,
        draw: p.draw,
        capacity: p.capacity,
        price: p.price,
        costs: p.costs,
        plannedProfit: p.planned_profit,
        plannedDeal: p.planned_deal,
        offer: p.offer,
        limits: { minGuarantee: p.min_guarantee, minDoorSplit: p.min_door_split },
      }),
  },
  {
    name: "tourbo_ticket_pace",
    hints: LOCAL,
    output: obj({ status: z.enum(["ahead", "on track", "behind", "well behind"]), expectedByNow: z.number(), projected: z.number(), ratio: z.number(), actions: z.array(z.string()), basis: z.string() }),
    title: "Ticket pace check",
    description:
      "After booking: compare tickets sold so far with where a small show should be this many days out, project show-night sales and suggest actions (shift promo, lean on the opener, smaller room, raise price). Deterministic rule of thumb; say so.",
    input: z.object({
      expected_tickets: z.number().positive(),
      capacity: z.number().int().positive(),
      sold: z.number().int().nonnegative(),
      days_to_show: z.number().int().nonnegative(),
      promo_left: z.number().nonnegative().optional(),
      has_smaller_room: z.boolean().default(false),
      currency: z.string().optional(),
    }),
    run: async (p) =>
      ticketPace({
        expectedTickets: p.expected_tickets,
        capacity: p.capacity,
        sold: p.sold,
        daysToShow: p.days_to_show,
        promoLeft: p.promo_left,
        hasSmallerRoom: p.has_smaller_room,
        currency: p.currency,
      }),
  },
  {
    name: "tourbo_promo_plan",
    hints: LOCAL,
    output: obj({ allocations: z.array(obj({ city: z.string(), spend: z.number(), share: z.number(), unsold: z.number(), targets: z.array(obj({ geohash: z.string(), lat: z.number(), lon: z.number(), radiusKm: z.number() })), why: z.string() })) }),
    title: "Split a promo budget",
    description: "Split a tour promo budget across stops by expected unsold seats × demand, with geo-ad targets (fan hotspot cells, 1.5 km radius) per city.",
    input: z.object({
      budget: z.number().positive(),
      stops: z.array(
        z.object({
          city: z.string(),
          capacity: z.number().int().positive(),
          tickets: z.number().int().nonnegative(),
          relDemand: z.number().nonnegative(),
          hotspots: z.array(z.object({ geohash: z.string(), lat: z.number(), lon: z.number(), affinity: z.number().default(0), popularity: z.number().default(0) })).default([]),
        }),
      ),
    }),
    run: async ({ budget, stops }) => ({ allocations: allocatePromo(budget, stops) }),
  },
  {
    name: "tourbo_critique_plan",
    hints: LOCAL,
    output: obj({ issues: z.array(out.Issue) }),
    title: "Critique a plan",
    description:
      "Deterministic checks on a full plan (the Plan JSON from tourbo_plan_tour): venue + backup present, Qloo evidence grounded, thin-data cities, capacity fit, legs over 1500 km.",
    input: z.object({ plan: z.unknown() }),
    run: async ({ plan }) => {
      const p = planInput(plan);
      const route = { stops: p.stops.map((s) => ({ city: { city: s.city, score: s.score, cells: 0, hotspots: s.hotspots, thinData: s.thinData }, date: s.date ?? "" })), legs: p.legs, totalKm: p.totalKm };
      return { issues: critique(p.stops, route, p.params) };
    },
  },
  {
    name: "tourbo_venue_access",
    hints: FAN_DATA,
    output: obj({ venue: str, nearestStation: obj({ name: z.string(), km: z.number(), kind: z.string() }).optional(), nearestAirport: obj({ name: z.string(), km: z.number(), kind: z.string() }).optional(), transitStops800m: num, parking500m: num, score: z.number(), source: z.string() }),
    title: "Venue access (transit, stations, airport)",
    description:
      "How easy a venue is to reach: public-transport stops within 800 m, nearest rail/metro station and airport with distances, and parking nearby (OpenStreetMap). Use to choose between similar rooms and to estimate the act's travel.",
    input: z.object({ lat: z.number(), lon: z.number(), name: z.string().optional() }),
    run: async ({ lat, lon, name }) => ({ venue: name, ...(await accessFor(lat, lon)) }),
  },
  {
    name: "tourbo_acts_for_venue",
    hints: FAN_DATA,
    output: obj({ ...out.NotFound, venue: obj({ id: z.string(), name: z.string(), address: z.unknown().optional(), popularity: num }).optional(), acts: z.array(obj({ id: z.string(), name: z.string(), affinity: num, popularity: num, localCells: z.number(), fit: z.number() })).optional(), note: str }),
    title: "Acts for a venue (promoter mode)",
    description:
      "Reverse mode for venues, bars and promoters: given a room and its city, which musicians (or comedians) does this room's crowd like, smaller than headliners, with local heatmap presence.",
    input: z.object({ venue: z.string(), city: z.string(), kind, limit: z.number().int().min(3).max(20).default(10) }),
    run: async ({ venue, city, kind: k, limit }, emit) => actsForVenue({ venue, city, kind: k, limit }, emit),
  },
  {
    name: "tourbo_plan_tour",
    hints: FAN_DATA,
    output: out.Plan,
    title: "Plan a whole tour (deterministic)",
    description:
      "One call: resolve the act, score the region, pick the top cities, route them, and find venues (+ backup), openers and local facts per stop, plus a show-economics estimate per stop. Deterministic (no LLM): your model should then review venues, write copy and decide. Takes 10–40 s.",
    input: z.object({
      artist: z.string(),
      kind,
      peers: z.array(z.string()).max(5).default([]),
      region,
      shows: z.number().int().min(2).max(12).default(6),
      start_date: z.iso.date(),
      home_base: z.string().optional(),
      room_min: z.number().int().positive().default(200),
      room_max: z.number().int().positive().default(800),
    }),
    run: async (p, emit) => {
      const plan = await buildPlan(
        { artist: p.artist, kind: p.kind, peers: p.peers, region: p.region, shows: p.shows, startDate: p.start_date, homeBase: p.home_base, roomMin: p.room_min, roomMax: p.room_max, money: {}, jobs: [], notInQloo: false },
        emit,
      );
      const med = median(plan.stops.map((s) => s.fanIndex ?? 0));
      return {
        ...plan,
        stops: plan.stops.map((s, i) => {
          const demand = estimateDemand({ fanIndex: s.fanIndex ?? 0, medianFanIndex: med, roomMin: p.room_min, roomMax: p.room_max });
          const rooms = [s.venue, s.backupVenue].filter((v) => !!v).map((v) => ({ name: v!.name, capacity: defaultCapacity(roomType(v!.tag)) }));
          const money = optimise({ region: p.region, kind: p.kind, demand, rooms, costs: legCosts(plan.legs[i - 1]?.km ?? 0, 3, !!s.opener), ...priceAdjust(s.place) });
          return { ...s, money: { verdict: money.verdict, why: money.why, currency: money.currency, best: money.best, ...(money.priceNudge ? { priceNudge: money.priceNudge } : {}) } };
        }),
      };
    },
  },
];

export const TOURBO_TOOLS: ToolDef[] = TOOLS.map((t) => (CACHED_TOOLS.has(t.name) ? withCache(t) : t));
