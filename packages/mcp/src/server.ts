import { completable, McpServer, ResourceNotFoundError, ResourceTemplate, type ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { Emit } from "@tourbo/core/engine/trace.ts";
import { cityOnlyBrief } from "@tourbo/core/engine/brief.ts";
import { findCity, seedCities } from "@tourbo/core/engine/cities.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import { getProject, projectMarkdown } from "@tourbo/core/projects/projects.server.ts";
import { locationQuery, PerformerKind, Region, REGION_NAMES } from "@tourbo/core/shared/types.ts";

import { ENVELOPE_SCHEMA, runWorkflow, WORKFLOW_INPUTS, WORKFLOW_META, type Workflow } from "./qloo/workflows.ts";
import { disciplineCatalog, TOURBO_TOOLS, type ToolDef } from "./tourbo/tools.ts";
import { IDEAS_TOOL } from "./tourbo/ideas.ts";
import "./tourbo/places.ts"; // registers tourbo_place_features into TOURBO_TOOLS
import "./extra/tools.ts"; // registers tourbo_export_ics + tourbo_export_markdown
import { planMarkdown } from "./extra/markdown.ts";
import { runPlan } from "./extra/runs.ts";
import { NO_KEY, plainError, toolFailure } from "./errors.ts";

export { NO_KEY } from "./errors.ts";

export const SERVER_INFO = { name: "tourbo", title: "Tourbo", version: "0.1.0" };

export type Toolset = "tourbo" | "qloo";

const KINDS = PerformerKind.options;
const INSTRUCTIONS = `Tourbo plans tours and shows for small acts from fan-taste and location data (Qloo). Deterministic tools, no inference: you decide and write.
Kinds of act (pass as kind): ${KINDS.join(", ")}. tourbo_disciplines explains each (spaces, deals, stay length, how it resolves).
Regions: ${Region.options.map((r) => `${r} = ${REGION_NAMES[r]}`).join(", ")}.
Front door, ideas → plan → set → edit:
1. Ideas: tourbo_ideas for one or more cities (covers for musicians, local topics for comics and speakers, subjects for visual artists), each with a ref and its number. Works without an act id (city taste only).
2. Plan: tourbo_resolve_act (pass peers for unknown acts; or tourbo_find_markets by genre) → tourbo_score_cities → tourbo_city_detail for the strongest cities → tourbo_show_economics per city (skip or take a support slot when it loses money) → tourbo_route. Shortcut: tourbo_plan_tour does the whole pipeline in one call. tourbo_place_features adds income, holidays, weather and tone notes.
3. Set: tourbo_build_set orders the act's own songs or bits per city with a few local touches (the act's material leads); tourbo_city_brief and tourbo_rehearsal_panel for show prep.
4. Edit and keep: change the cities or venues and re-run tourbo_route / tourbo_show_economics for the changed nights; save notes with tourbo_project_* tools; export with tourbo_export_ics (calendar) and tourbo_export_markdown.
After booking: tourbo_assess_offer (venue offers), tourbo_ticket_pace, tourbo_promo_plan.
qloo_* tools are general fan-data workflows (recommend, rank, where_popular, …) for anything else.
Never name venues, openers or local references that are not in tool results. Money figures are estimates. Errors come back as one sentence saying what to do next.`;

// Engine progress → MCP progress notifications: message is a plain line; the trace event (kind,
// data) rides in _meta["tourbo/trace"] for clients that show a live trace (the hosted app).
function progressEmit(ctx: ServerContext): Emit {
  const token = ctx.mcpReq._meta?.progressToken;
  if (token === undefined) return () => {};
  let n = 0;
  return (kind, message, data) => {
    void ctx.mcpReq
      .notify({ method: "notifications/progress", params: { progressToken: token, progress: ++n, message, _meta: { "tourbo/trace": { kind, ...(data ? { data } : {}) } } } })
      .catch(() => {});
  };
}

// structuredContent is the JSON the text block carries (round-tripped, so in-process and wire
// clients see the same thing); arrays go under {result} (object root).
const result = (value: unknown, isError = false) => {
  const text = JSON.stringify(value ?? null);
  const parsed = JSON.parse(text) as unknown;
  const structured = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { result: parsed };
  return { content: [{ type: "text" as const, text }], structuredContent: structured, ...(isError ? { isError } : {}) };
};
const failure = (error: unknown, where: string) => result(toolFailure(error, where), true);

export const annotationsOf = (tool: ToolDef) => ({
  readOnlyHint: tool.hints.readOnly,
  idempotentHint: tool.hints.idempotent,
  openWorldHint: tool.hints.openWorld,
  ...(tool.hints.readOnly ? {} : { destructiveHint: tool.hints.destructive ?? false }),
});

function registerTourbo(server: McpServer, tool: ToolDef) {
  server.registerTool(
    tool.name,
    { title: tool.title, description: tool.description, inputSchema: tool.input, outputSchema: tool.output, annotations: annotationsOf(tool) },
    async (input: unknown, ctx: ServerContext) => {
      try {
        await ensureWorld(); // world city index (no-op after the first call; seeds if the DB is down)
        return result(await tool.run(input, progressEmit(ctx)));
      } catch (error) {
        return failure(error, tool.name);
      }
    },
  );
}

const CAPABILITIES_OUTPUT = z.looseObject({
  adapter: z.looseObject({ id: z.string(), compatibility: z.string(), ready: z.boolean() }),
  operations: z.array(z.looseObject({ id: z.string(), tool: z.string(), title: z.string(), description: z.string(), docs: z.string() })),
});

function registerQloo(server: McpServer) {
  for (const op of Object.keys(WORKFLOW_INPUTS) as Workflow[]) {
    const meta = WORKFLOW_META[op];
    server.registerTool(
      `qloo_${op}`,
      {
        title: meta.title,
        description: `${meta.description} Docs: https://docs.qloo.com/reference/${meta.docs}`,
        inputSchema: WORKFLOW_INPUTS[op],
        outputSchema: ENVELOPE_SCHEMA,
        annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
        _meta: { "qloo/contractVersion": "harness-0.1.26" },
      },
      async (input: any) => {
        if (!process.env.QLOO_API_KEY) return result({ error: NO_KEY, kind: "data_off", retry: false }, true);
        try {
          const envelope = await runWorkflow(op, input);
          return result(envelope, envelope.status === "error");
        } catch (error) {
          return failure(error, `qloo_${op}`);
        }
      },
    );
  }
  server.registerTool(
    "qloo_capabilities",
    {
      title: "Inspect Qloo tool capabilities",
      description: "List the Qloo workflow tools this server executes and their documentation, without contacting Qloo.",
      inputSchema: z.object({}),
      outputSchema: CAPABILITIES_OUTPUT,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async () =>
      result({
        adapter: { id: "tourbo_mcp", compatibility: "qloo-harness-0.1.26 workflows (TypeScript port)", ready: !!process.env.QLOO_API_KEY },
        operations: (Object.keys(WORKFLOW_META) as Workflow[]).map((op) => ({ id: op, tool: `qloo_${op}`, ...WORKFLOW_META[op] })),
      }),
  );
}

// Prompt / template argument completion.
const startsWith = (list: readonly string[], value: string | undefined) => list.filter((x) => x.toLowerCase().startsWith((value ?? "").toLowerCase())).slice(0, 50);
const kindArg = (fallback: string) => completable(z.string().default(fallback).describe(`Kind of act: ${KINDS.join(", ")}`), (v) => startsWith(KINDS, v));
const regionArg = () => completable(z.string().default("na").describe(`Region: ${Region.options.join(", ")}`), (v) => startsWith(Region.options, v));
const regionOf = (r: string | undefined) => (Region.safeParse(r).success ? (r as Region) : "na");
const cityNames = (region: string | undefined) => seedCities(regionOf(region)).map((c) => c.name);
const cityArg = () =>
  completable(z.string().min(1).describe("City name, or \"City, Country\""), (v, ctx) => startsWith(cityNames(ctx?.arguments?.region), v));
const user = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "plan_tour",
    {
      title: "Plan a tour",
      description: `Plan a profitable tour for any act (${KINDS.length} kinds: singer, comedian, DJ, dancer, poet, painter, speaker, magician, chef…), with venues, money verdicts and per-city show notes.`,
      argsSchema: z.object({ act: z.string().min(1), region: regionArg(), shows: z.string().default("6"), kind: kindArg("musician") }),
    },
    ({ act, region, shows, kind }) =>
      user(
        `Plan a ${shows}-show tour for the ${kind} "${act}" in region ${region}, starting about 3 months from today. Use the Tourbo tools (tourbo_disciplines first if the act isn't a musician or comedian; if the act isn't in the fan data, plan from comparable acts as peers): score cities, check venues and show economics for the strongest ones (drop or downgrade loss-making stops), route it, then give me per-city show notes from tourbo_city_brief. Cite the fan-data numbers.`,
      ),
  );
  server.registerPrompt(
    "prep_city",
    {
      title: "Prep one city",
      description: "Show prep for one night: what this city and the act's fans love, local ideas, a rehearsal panel and the night's money check.",
      argsSchema: z.object({ act: z.string().min(1), city: cityArg(), region: regionArg(), kind: kindArg("musician") }),
    },
    ({ act, city, region, kind }) =>
      user(
        `Prep my show in ${city} (region ${region}) for the ${kind} "${act}". Resolve the act with tourbo_resolve_act, then use tourbo_city_brief and tourbo_ideas for ${city}, and tourbo_rehearsal_panel to test my material. Give me: 3 local touches (keep my own material leading), a crowd-work or banter line per touch citing its ref, and anything to avoid. Name only things in the tool results.`,
      ),
  );
  server.registerPrompt(
    "build_set",
    {
      title: "Build my set",
      description: "Order the act's own songs or bits for each city, with a local nod and cover or topic ideas.",
      argsSchema: z.object({
        items: z.string().min(1).describe('One song or bit per line, e.g. "Golden Hour, opener, 4, indie folk"'),
        cities: z.string().min(1).describe("Comma-separated city names"),
        region: regionArg(),
        kind: kindArg("musician"),
        slot: z.string().default("headline").describe("headline, support, co_bill, festival, open_mic, …"),
      }),
    },
    ({ items, cities, region, kind, slot }) =>
      user(
        `Build my ${slot} set for each of these cities: ${cities} (region ${region}, I'm a ${kind}). Call tourbo_build_set with these items as text, then show each city's running order with a one-line reason per move that cites a fact name from the result.\n\n${items}`,
      ),
  );
  server.registerPrompt(
    "ideas_for_city",
    {
      title: "Ideas for this place",
      description: "Grounded ideas of what to perform or make in a city: covers, local topics or subjects, each with its fan-data number.",
      argsSchema: z.object({ city: cityArg(), region: regionArg(), kind: kindArg("musician"), act: z.string().optional().describe("Act name; omit for ideas from the city alone") }),
    },
    ({ city, region, kind, act }) =>
      user(
        `What should a ${kind}${act ? ` ("${act}")` : ""} perform or make in ${city} (region ${region})? ${act ? "Resolve the act with tourbo_resolve_act, then call" : "Call"} tourbo_ideas for ${city}${act ? " with its act_id" : ""}. Give me the top ideas with one angle each, naming only refs from the result, and say why with its number.`,
      ),
  );
}

// Templates read per user data: never cached, private.
const PRIVATE = { ttlMs: 0, cacheScope: "private" as const };
const md = (uri: URL, text: string) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text }] });
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const readError = (error: unknown, where: string) => {
  if (error instanceof ResourceNotFoundError) return error;
  return new Error(plainError(error, where));
};

function registerResources(server: McpServer) {
  server.registerResource(
    "disciplines",
    "tourbo://disciplines",
    { title: "Tourbo disciplines", description: "Kinds of act Tourbo plans for and how each maps to fan data", mimeType: "application/json", cacheHint: { ttlMs: 3_600_000, cacheScope: "public" } },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await disciplineCatalog(), null, 2) }] }),
  );
  server.registerResource(
    "project",
    new ResourceTemplate("tourbo://project/{id}", { list: undefined }),
    { title: "Tour project", description: "One project (notes, to-dos, setlists, briefs, attached plans) as markdown", mimeType: "text/markdown", cacheHint: PRIVATE },
    async (uri, vars) => {
      try {
        const p = await getProject(one(vars.id));
        if (!p) throw new ResourceNotFoundError(uri.href, "No project with that id: call tourbo_project_list.");
        return md(uri, projectMarkdown(p));
      } catch (error) {
        throw readError(error, "tourbo://project");
      }
    },
  );
  server.registerResource(
    "plan",
    new ResourceTemplate("tourbo://plan/{run_id}", { list: undefined }),
    { title: "Tour plan", description: "A saved tour plan (the id in /plan/<id>) as markdown: nights, venues, money estimates, route", mimeType: "text/markdown", cacheHint: PRIVATE },
    async (uri, vars) => {
      try {
        const { plan, status } = await runPlan(one(vars.run_id));
        return md(uri, planMarkdown(plan, { status }));
      } catch (error) {
        throw readError(error, "tourbo://plan");
      }
    },
  );
  server.registerResource(
    "city_brief",
    new ResourceTemplate("tourbo://city/{region}/{city}/brief", {
      list: undefined,
      complete: { region: (v) => startsWith(Region.options, v), city: (v, ctx) => startsWith(cityNames(ctx?.arguments?.region), v) },
    }),
    { title: "City brief", description: "What a city loves on its own (TV, brands, people, its music scene) from fan data, fetched fresh", mimeType: "application/json", cacheHint: PRIVATE },
    async (uri, vars) => {
      try {
        await ensureWorld();
        const name = decodeURIComponent(one(vars.city));
        const city = findCity(regionOf(one(vars.region)), name);
        if (!city) throw new ResourceNotFoundError(uri.href, `Unknown city "${name}": use a city name, or "City, Country".`);
        if (!process.env.QLOO_API_KEY) throw new Error(NO_KEY);
        const brief = await cityOnlyBrief(locationQuery(city));
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ ...brief, city: city.name }, null, 2) }] };
      } catch (error) {
        throw readError(error, "tourbo://city/brief");
      }
    },
  );
}

const ALL_TOURBO = () => [...TOURBO_TOOLS, IDEAS_TOOL];

// Lists are identical for every caller (hosted and self-hosted): cacheable for an hour.
const LIST_HINT = { ttlMs: 3_600_000, cacheScope: "public" as const };

export function createTourboServer(opts: { toolsets?: Toolset[] } = {}) {
  const toolsets = opts.toolsets ?? ["tourbo", "qloo"];
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {}, prompts: {}, resources: {} },
    instructions: INSTRUCTIONS,
    cacheHints: { "tools/list": LIST_HINT, "prompts/list": LIST_HINT, "resources/list": LIST_HINT, "resources/templates/list": LIST_HINT },
  });
  if (toolsets.includes("tourbo")) for (const tool of ALL_TOURBO()) registerTourbo(server, tool);
  if (toolsets.includes("qloo")) registerQloo(server);
  registerResources(server);
  registerPrompts(server);
  return server;
}

export const TOOL_NAMES = {
  tourbo: ALL_TOURBO().map((t) => t.name),
  qloo: [...(Object.keys(WORKFLOW_INPUTS) as Workflow[]).map((op) => `qloo_${op}`), "qloo_capabilities"],
};
