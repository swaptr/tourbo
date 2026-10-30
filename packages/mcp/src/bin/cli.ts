// tourbo-mcp: the Tourbo MCP server. Stdio by default (Claude Desktop / Code, Cursor, VS Code…),
// or Streamable HTTP with --http. Needs your own QLOO_API_KEY. Logs go to stderr (stdout is the
// protocol in stdio mode).
import { parseArgs } from "node:util";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createTourboServer, SERVER_INFO, type Toolset } from "../server.ts";
import { HOSTED_RATE_LIMIT, parseRateLimit, parseTokens, startHttpServer } from "../http.ts";

const HELP = `tourbo-mcp ${SERVER_INFO.version}: Tourbo tour-planning tools over MCP.

Usage:
  tourbo-mcp                       stdio (your MCP client starts it)
  tourbo-mcp --http [--port 8787]  Streamable HTTP at http://<host>:<port>/mcp, health at /healthz

Options:
  --http             serve over HTTP instead of stdio
  --port <n>         HTTP port (default: PORT or 8787)
  --host <addr>      HTTP bind address (default: HOST or 127.0.0.1; 0.0.0.0 in Docker)
  --no-auth          HTTP without tokens (only on a private network; anyone who can reach it spends your key)
  --version          print the version
  --help             this help

Environment:
  QLOO_API_KEY       your Qloo API key (required for fan data; tools still list without it)
  MCP_TOKENS         HTTP: comma-separated bearer tokens; clients send Authorization: Bearer <token>
  MCP_RATE_LIMIT     HTTP: tool calls per token and per IP, e.g. 60/10m (default 60/10m; "off" = none)
  MCP_ALLOWED_ORIGINS  HTTP: comma-separated browser origins allowed to call (default none)
  MCP_TRUST_PROXY    HTTP: 1 = take the client IP from X-Forwarded-For
  DATABASE_URL       Postgres for the tourbo_project_* tools (optional)
  TOURBO_TOOLSETS    tourbo,qloo (default both)
`;

let args;
try {
  args = parseArgs({
    options: {
      http: { type: "boolean" },
      port: { type: "string" },
      host: { type: "string" },
      "no-auth": { type: "boolean" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  }).values;
} catch (error) {
  console.error(`tourbo-mcp: ${(error as Error).message}. Run tourbo-mcp --help.`);
  process.exit(2);
}

if (args.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (args.version) {
  process.stdout.write(`${SERVER_INFO.version}\n`);
  process.exit(0);
}

const env = process.env;
// No DATABASE_URL: Qloo responses cache in memory for this process only (dev); production
// (NODE_ENV=production) caches nothing unless CACHE_TIERS says so.
env.QLOO_CACHE ??= env.DATABASE_URL ? "postgres" : "memory";
if (!env.QLOO_API_KEY) console.error("tourbo-mcp: QLOO_API_KEY is not set; tools will list but each call will ask for it.");
const toolsets = (env.TOURBO_TOOLSETS?.split(",").filter(Boolean) as Toolset[] | undefined) ?? undefined;

if (!args.http) {
  serveStdio(() => createTourboServer({ toolsets }));
  console.error("tourbo-mcp: ready on stdio");
} else {
  const tokens = parseTokens(env.MCP_TOKENS);
  const noAuth = !!args["no-auth"];
  if (!tokens.length && !noAuth) {
    console.error("tourbo-mcp: set MCP_TOKENS (comma-separated bearer tokens) to serve over HTTP, or pass --no-auth on a private network.");
    process.exit(1);
  }
  if (noAuth) console.error("tourbo-mcp: WARNING --no-auth: anyone who can reach this server can use it and spend your API key.");
  const port = Number(args.port ?? env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`tourbo-mcp: --port must be a number from 0 to 65535 (got ${args.port ?? env.PORT}).`);
    process.exit(2);
  }
  const host = args.host ?? env.HOST ?? "127.0.0.1";
  const rateLimit = env.MCP_RATE_LIMIT?.trim() === "off" ? undefined : (parseRateLimit(env.MCP_RATE_LIMIT) ?? HOSTED_RATE_LIMIT);
  try {
    const server = await startHttpServer({
      port,
      host,
      tokens: noAuth ? [] : tokens,
      noAuth,
      rateLimit,
      trustProxy: env.MCP_TRUST_PROXY === "1",
      allowedOrigins: parseTokens(env.MCP_ALLOWED_ORIGINS),
      toolsets,
    });
    const addr = server.address();
    const bound = typeof addr === "object" && addr ? addr.port : port;
    console.error(`tourbo-mcp: ready on http://${host}:${bound}/mcp (health: /healthz)`);
    const stop = () => server.close(() => process.exit(0));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    console.error(`tourbo-mcp: could not listen on ${host}:${port} (${(error as Error).message}); pick another --port.`);
    process.exit(1);
  }
}
