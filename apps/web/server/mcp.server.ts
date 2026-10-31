import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { RequestHandler } from "express";

import type { Emit } from "@tourbo/core/engine/trace.ts";
import { createTourboServer, TOURBO_TOOLS, type Toolset } from "@tourbo/mcp";
import { WORKFLOW_META } from "@tourbo/mcp/qloo/workflows.ts";
import { IDEAS_TOOL } from "@tourbo/mcp/tourbo/ideas.ts";
import { createMcpHttpHandler, HOSTED_RATE_LIMIT } from "@tourbo/mcp/http.ts";

import { getWebEnv } from "./env.server.ts";

// The hosted agent is an MCP client of the same server external agents use, connected
// in-process (no network, the Qloo key never leaves this process).
export type McpSession = {
  client: Client;
  call: <T = Record<string, unknown>>(name: string, args: Record<string, unknown>) => Promise<T>;
  close: () => Promise<void>;
};

export async function connectMcp(emit: Emit, toolsets?: Toolset[]): Promise<McpSession> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createTourboServer({ toolsets });
  await server.connect(serverSide);
  const client = new Client({ name: "tourbo-hosted-agent", version: "0.1.0" });
  await client.connect(clientSide);

  // Progress notifications: a plain message plus the engine's trace event in _meta["tourbo/trace"].
  const onprogress = ({ message, _meta }: { message?: string; _meta?: Record<string, unknown> }) => {
    if (!message) return;
    const trace = _meta?.["tourbo/trace"] as { kind?: Parameters<Emit>[0]; data?: Record<string, unknown> } | undefined;
    emit(trace?.kind ?? "qloo_call", message, trace?.data);
  };

  const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
    emit("tool_call", `mcp ${name}`, { mcp: true, input: args });
    const res = await client.callTool({ name, arguments: args }, { onprogress, timeout: 180_000, resetTimeoutOnProgress: true });
    const value = (res.structuredContent ?? JSON.parse(res.content?.[0]?.type === "text" ? res.content[0].text : "{}")) as T & { error?: string; kind?: string };
    // The tool's error kind rides along, so classifyError needs no text matching for it.
    if (res.isError) throw Object.assign(new Error(`${name}: ${value.error ?? "tool failed"}`), { kind: value.kind });
    return value;
  };

  return { client, call, close: async () => { await client.close(); await server.close(); } };
}

// Remote MCP (Streamable HTTP) for other agents: the same handler self-hosters run
// (`tourbo-mcp --http`), with a per-token and per-IP limit (60 tool calls / 10 min). Off unless
// MCP_TOKENS or MCP_PUBLIC_TOKEN is set: it spends this deployment's Qloo key, so the public
// token is a rate-limited demo pass, never the key itself.
let handler: ReturnType<typeof createMcpHttpHandler> | undefined;

function mcpTokens() {
  const { MCP_TOKENS, MCP_PUBLIC_TOKEN } = getWebEnv();
  return MCP_PUBLIC_TOKEN ? [...new Set([...MCP_TOKENS, MCP_PUBLIC_TOKEN])] : MCP_TOKENS;
}

export const mcpHttp: RequestHandler = (req, res, next) => {
  const tokens = mcpTokens();
  if (!tokens.length) {
    res.status(404).json({ error: "The remote endpoint is off on this server: run your own copy instead (see /connect)." });
    return;
  }
  const shared = getWebEnv().MCP_PUBLIC_TOKEN;
  handler ??= createMcpHttpHandler({ tokens, sharedTokens: shared ? [shared] : [], rateLimit: HOSTED_RATE_LIMIT, trustProxy: true });
  void handler(req, res).catch(next);
};

// What the Connect page lists: every tool the server exposes, without starting a session.
export function mcpCatalog() {
  const tourbo = [IDEAS_TOOL, ...TOURBO_TOOLS].map((t) => ({ name: t.name, title: t.title, description: t.description }));
  const qloo = Object.entries(WORKFLOW_META).map(([op, m]) => ({ name: `qloo_${op}`, title: m.title, description: m.description }));
  return { tourbo, qloo, remoteEnabled: mcpTokens().length > 0, publicToken: getWebEnv().MCP_PUBLIC_TOKEN, publicUrl: getWebEnv().PUBLIC_URL };
}
