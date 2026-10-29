#!/usr/bin/env node
// Tourbo MCP over stdio. Needs your own QLOO_API_KEY; caches Qloo responses in memory unless
// DATABASE_URL + QLOO_CACHE=postgres are set. Logs go to stderr (stdout is the protocol).
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createTourboServer, type Toolset } from "../server.ts";

process.env.QLOO_CACHE ??= process.env.DATABASE_URL ? "postgres" : "memory";
if (!process.env.QLOO_API_KEY) console.error("tourbo-mcp: QLOO_API_KEY is not set; tools will fail until it is.");
const toolsets = (process.env.TOURBO_TOOLSETS?.split(",").filter(Boolean) as Toolset[] | undefined) ?? undefined;
serveStdio(() => createTourboServer({ toolsets }));
console.error("tourbo-mcp: ready on stdio");
