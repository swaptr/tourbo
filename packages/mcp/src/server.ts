import { McpServer, type ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { Emit } from "@tourbo/core/engine/trace.ts";

import { runWorkflow, WORKFLOW_INPUTS, WORKFLOW_META, type Workflow } from "./qloo/workflows.ts";
import { TOURBO_TOOLS, type ToolDef } from "./tourbo/tools.ts";

export const SERVER_INFO = { name: "tourbo", title: "Tourbo", version: "0.1.0" };

export type Toolset = "tourbo" | "qloo";

const INSTRUCTIONS = `Tourbo plans tours for musicians and comedians from Qloo taste and location data.
Typical flow: tourbo_resolve_act → tourbo_score_cities → tourbo_city_detail for the strongest cities → tourbo_show_economics per city (pick deal, price, room; skip or take a support slot when it loses money) → tourbo_route → tourbo_city_brief for set notes / banter / sponsors.
Shortcut: tourbo_plan_tour does the deterministic pipeline in one call; review its venues and money verdicts.
New or foreign acts: tourbo_find_markets with comparable acts or a genre (e.g. qawwali).
qloo_* tools are general Qloo workflows (recommend, rank, where_popular, …) for anything else.
Never name venues, openers or local references that are not in tool results. Money figures are estimates.`;

// Engine progress → MCP progress notifications (the hosted app turns them into its live trace).
// Each message is a JSON trace event: {"kind","message","data"}.
function progressEmit(ctx: ServerContext): Emit {
  const token = ctx.mcpReq._meta?.progressToken;
  if (token === undefined) return () => {};
  let n = 0;
  return (kind, message, data) => {
    void ctx.mcpReq
      .notify({ method: "notifications/progress", params: { progressToken: token, progress: ++n, message: JSON.stringify({ kind, message, data }) } })
      .catch(() => {});
  };
}

const result = (value: unknown, isError = false) => {
  const structured = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { result: value };
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: structured, ...(isError ? { isError } : {}) };
};

function registerTourbo(server: McpServer, tool: ToolDef) {
  server.registerTool(
    tool.name,
    { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true } },
    async (input: unknown, ctx: ServerContext) => {
      try {
        return result(await tool.run(input, progressEmit(ctx)));
      } catch (error) {
        return result({ error: (error as Error).message }, true);
      }
    },
  );
}

function registerQloo(server: McpServer) {
  for (const op of Object.keys(WORKFLOW_INPUTS) as Workflow[]) {
    const meta = WORKFLOW_META[op];
    server.registerTool(
      `qloo_${op}`,
      {
        title: meta.title,
        description: `${meta.description} Docs: https://docs.qloo.com/reference/${meta.docs}`,
        inputSchema: WORKFLOW_INPUTS[op],
        annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
        _meta: { "qloo/contractVersion": "harness-0.1.26" },
      },
      async (input: any) => {
        const envelope = await runWorkflow(op, input);
        return result(envelope, envelope.status === "error");
      },
    );
  }
  server.registerTool(
    "qloo_capabilities",
    {
      title: "Inspect Qloo tool capabilities",
      description: "List the Qloo workflow tools this server executes and their documentation, without contacting Qloo.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async () =>
      result({
        adapter: { id: "tourbo_mcp", compatibility: "qloo-harness-0.1.26 workflows (TypeScript port)", ready: !!process.env.QLOO_API_KEY },
        operations: (Object.keys(WORKFLOW_META) as Workflow[]).map((op) => ({ id: op, tool: `qloo_${op}`, ...WORKFLOW_META[op] })),
      }),
  );
}

export function createTourboServer(opts: { toolsets?: Toolset[] } = {}) {
  const toolsets = opts.toolsets ?? ["tourbo", "qloo"];
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {}, prompts: {} }, instructions: INSTRUCTIONS });
  if (toolsets.includes("tourbo")) for (const tool of TOURBO_TOOLS) registerTourbo(server, tool);
  if (toolsets.includes("qloo")) registerQloo(server);
  server.registerPrompt(
    "plan_tour",
    {
      title: "Plan a tour",
      description: "Plan a profitable tour for a musician or comedian, with venues, money verdicts and per-city show notes.",
      argsSchema: z.object({ act: z.string(), region: z.string().default("na"), shows: z.string().default("6"), kind: z.string().default("musician") }),
    },
    ({ act, region, shows, kind }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Plan a ${shows}-show tour for the ${kind} "${act}" in region ${region}, starting about 3 months from today. Use the Tourbo tools: score cities, check venues and show economics for the strongest ones (drop or downgrade loss-making stops), route it, then give me per-city show notes from tourbo_city_brief. Cite the Qloo numbers.`,
          },
        },
      ],
    }),
  );
  return server;
}

export const TOOL_NAMES = {
  tourbo: TOURBO_TOOLS.map((t) => t.name),
  qloo: [...(Object.keys(WORKFLOW_INPUTS) as Workflow[]).map((op) => `qloo_${op}`), "qloo_capabilities"],
};
