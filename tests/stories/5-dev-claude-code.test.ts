// Story 5: Dev uses Tourbo from Claude Code: .mcp.json starts the stdio server, tools list.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = new URL("../../", import.meta.url).pathname;

test("Dev: the project .mcp.json starts Tourbo and exposes its tools", async () => {
  const config = JSON.parse(readFileSync(`${root}.mcp.json`, "utf8"));
  const server = config.mcpServers.tourbo;
  assert.ok(server, ".mcp.json registers tourbo");
  assert.ok(!JSON.stringify(server).match(/QLOO_API_KEY=|[0-9a-f]{32}/i), "no credential in the config");
  const transport = new StdioClientTransport({
    command: server.command === "node" ? process.execPath : server.command,
    args: server.args,
    cwd: root,
    env: { ...(process.env as Record<string, string>), QLOO_CACHE: "memory" },
  });
  const client = new Client({ name: "story-dev", version: "0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ["tourbo_resolve_act", "tourbo_score_cities", "tourbo_show_economics", "tourbo_assess_offer", "tourbo_plan_tour"]) assert.ok(names.includes(n), n);
  const { prompts } = await client.listPrompts();
  assert.ok(prompts.some((p) => p.name === "plan_tour"));
  await client.close();
});
