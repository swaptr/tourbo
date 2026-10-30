import { RouterContextProvider } from "react-router";
import { createRequestHandler } from "@react-router/express";
import express from "express";

import { valueFromExpressContext } from "~/context";

import { mcpHttp } from "./mcp.server.ts";

export const app = express();
app.disable("x-powered-by");

// Remote MCP endpoint (Streamable HTTP, bearer tokens, 60 tool calls / 10 min per token and per IP;
// packages/mcp/src/http.ts, shared with self-hosted `tourbo-mcp --http`): same tools the hosted agent uses.
// Mounted before any body parser (the handler reads the body itself).
app.all("/mcp", mcpHttp);

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    getLoadContext() {
      const context = new RouterContextProvider();
      context.set(valueFromExpressContext, "Hello from Express");
      return context;
    },
  }),
);

// The build-time prerender (react-router.config.ts) loads build/server/index.js as a server build,
// so this entry also exports the build itself next to `app`.
export * from "virtual:react-router/server-build";
