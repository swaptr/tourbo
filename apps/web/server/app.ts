import { RouterContextProvider } from "react-router";
import { createRequestHandler } from "@react-router/express";
import express from "express";

import { valueFromExpressContext } from "~/context";

import { mcpHttp } from "./mcp.server.ts";

export const app = express();

// Remote MCP endpoint (Streamable HTTP, bearer tokens): same tools the hosted agent uses.
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
