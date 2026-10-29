// Shared harness: an in-memory MCP client of the Tourbo server, exactly what the hosted agent
// uses. Tools hit live Qloo (cached), no LLM.
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createTourboServer } from "@tourbo/mcp";

process.env.QLOO_CACHE ??= process.env.DATABASE_URL ? "postgres" : "memory";

export async function mcp() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createTourboServer();
  await server.connect(b);
  const client = new Client({ name: "story-test", version: "0" });
  await client.connect(a);
  const call = async <T = any>(name: string, args: Record<string, unknown>): Promise<T> => {
    const res = await client.callTool({ name, arguments: args }, { timeout: 180_000 });
    const text = res.content?.[0]?.type === "text" ? res.content[0].text : "{}";
    if (res.isError) throw new Error(`${name}: ${text}`);
    return (res.structuredContent ?? JSON.parse(text)) as T;
  };
  return { client, call, close: async () => { await client.close(); await server.close(); } };
}

export const BASE = process.env.STORY_BASE_URL ?? "http://localhost:3000";
export async function appUp() {
  return fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false);
}
