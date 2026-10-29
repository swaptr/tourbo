import { Client } from "@modelcontextprotocol/client";
import { createMcpHandler, InMemoryTransport } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { RequestHandler } from "express";

import type { Emit } from "@tourbo/core/engine/trace.ts";
import { createTourboServer, TOURBO_TOOLS, type Toolset } from "@tourbo/mcp";
import { WORKFLOW_META } from "@tourbo/mcp/qloo/workflows.ts";

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

  // Progress notifications carry the engine's trace events as JSON.
  const onprogress = ({ message }: { message?: string }) => {
    if (!message) return;
    try {
      const e = JSON.parse(message) as { kind: Parameters<Emit>[0]; message: string; data?: Record<string, unknown> };
      emit(e.kind, e.message, e.data);
    } catch {
      emit("qloo_call", message);
    }
  };

  const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
    emit("tool_call", `mcp ${name}`, { mcp: true, input: args });
    const res = await client.callTool({ name, arguments: args }, { onprogress, timeout: 180_000, resetTimeoutOnProgress: true });
    const value = (res.structuredContent ?? JSON.parse(res.content?.[0]?.type === "text" ? res.content[0].text : "{}")) as T & { error?: string };
    if (res.isError) throw new Error(`${name}: ${value.error ?? "tool failed"}`);
    return value;
  };

  return { client, call, close: async () => { await client.close(); await server.close(); } };
}

// Remote MCP (Streamable HTTP) for other agents. Off unless MCP_TOKENS is set: it spends this
// deployment's Qloo key, and the hackathon rules forbid sharing a credential openly.
const handler = toNodeHandler(createMcpHandler(() => createTourboServer()));

export const mcpHttp: RequestHandler = (req, res, next) => {
  const tokens = getWebEnv().MCP_TOKENS;
  if (!tokens.length) {
    res.status(404).json({ error: "Remote MCP is disabled on this deployment (set MCP_TOKENS)." });
    return;
  }
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.query.token ?? "");
  if (!tokens.includes(token)) {
    res.status(401).set("WWW-Authenticate", 'Bearer realm="tourbo-mcp"').json({ error: "Missing or invalid bearer token." });
    return;
  }
  void Promise.resolve(handler(req, res)).catch(next);
};

// What the Connect page lists: every tool the server exposes, without starting a session.
export function mcpCatalog() {
  const tourbo = TOURBO_TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description }));
  const qloo = Object.entries(WORKFLOW_META).map(([op, m]) => ({ name: `qloo_${op}`, title: m.title, description: m.description }));
  return { tourbo, qloo, remoteEnabled: getWebEnv().MCP_TOKENS.length > 0, publicUrl: getWebEnv().PUBLIC_URL };
}
