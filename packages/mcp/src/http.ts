// Streamable HTTP for the Tourbo MCP server: bearer tokens, per-token + per-IP rate limit,
// origin check (CORS stays off) and /healthz. Used by the self-hosted CLI (`--http`) and by the
// hosted web app's /mcp, so both answer the same way.
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createMcpHandler, localhostAllowedHostnames, validateHostHeader } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

import { createTourboServer, type Toolset } from "./server.ts";

export type RateLimit = { calls: number; windowMs: number };

export type McpHttpOptions = {
  tokens: string[]; // accepted bearer tokens; empty + noAuth = open
  noAuth?: boolean;
  rateLimit?: RateLimit; // tool calls per token and per IP; unset = unlimited
  sharedTokens?: string[]; // published tokens: limited per IP only, so one visitor can't lock out the rest; no project tools, no edits to website-owned plans
  sharedDailyCalls?: number; // tool calls per day across all shared tokens (default 5000)
  trustProxy?: boolean; // client IP from X-Forwarded-For (behind a proxy / load balancer)
  allowedOrigins?: string[]; // browser origins allowed to call; none by default
  allowedHosts?: string[]; // Host header allowlist (DNS-rebinding guard); unset = any host
  toolsets?: Toolset[];
};

export const HOSTED_RATE_LIMIT: RateLimit = { calls: 60, windowMs: 10 * 60_000 };
const SHARED_DAILY_CALLS = 5000;
const MAX_BODY = 4 * 1024 * 1024;

// "60/10m" | "60" (per 10 minutes) → RateLimit; anything else → undefined.
export function parseRateLimit(s: string | undefined): RateLimit | undefined {
  const m = s?.trim().match(/^(\d+)(?:\/(\d+)(s|m|h))?$/);
  if (!m) return undefined;
  const unit = { s: 1000, m: 60_000, h: 3_600_000 }[(m[3] ?? "m") as "s" | "m" | "h"];
  return { calls: Number(m[1]), windowMs: Number(m[2] ?? 10) * unit };
}

// Constant-time token check: hash both sides so lengths match and nothing leaks by timing.
const digest = (s: string) => createHash("sha256").update(s).digest();
export function tokenMatches(token: string, tokens: string[]): boolean {
  if (!token) return false;
  const got = digest(token);
  let ok = false;
  for (const t of tokens) ok = timingSafeEqual(got, digest(t)) || ok;
  return ok;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const isLoopback = (host: string) => LOOPBACK.has(host.trim().toLowerCase());

export const parseTokens = (s: string | undefined) => (s ? s.split(",").map((t) => t.trim()).filter(Boolean) : []);

function send(res: ServerResponse, status: number, error: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify({ error }));
}

// Client IP behind one trusted proxy: the right-most X-Forwarded-For entry (the one the proxy
// appended); earlier entries are whatever the client sent.
export const clientIp = (xff: string | string[] | null | undefined) => String(xff ?? "").split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? "";

// Fixed-window counters; old windows are dropped as they are touched or when the map grows.
// Returns ms to wait (0 = allowed and counted).
export function limiter(limit: RateLimit) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (keys: string[], cost: number): number => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    let wait = 0;
    const entries = keys.map((k) => {
      let e = hits.get(k);
      if (!e || e.reset <= now) hits.set(k, (e = { n: 0, reset: now + limit.windowMs }));
      if (e.n + cost > limit.calls) wait = Math.max(wait, e.reset - now);
      return e;
    });
    if (!wait) for (const e of entries) e.n += cost;
    return wait;
  };
}

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) return undefined;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const countCalls = (body: unknown) =>
  (Array.isArray(body) ? body : [body]).filter((m) => (m as { method?: string })?.method === "tools/call").length;

// The /mcp handler: (req, res) for node:http or Express (mount it before any body parser).
export function createMcpHttpHandler(opts: McpHttpOptions) {
  const mcp = toNodeHandler(createMcpHandler(() => createTourboServer({ toolsets: opts.toolsets })));
  // Published tokens get a server without the project tools and without edits to website-owned
  // plans, so nobody's saved work is reachable with a token anyone can read.
  const shared = toNodeHandler(createMcpHandler(() => createTourboServer({ toolsets: opts.toolsets, publicOnly: true })));
  const sharedDay = limiter({ calls: opts.sharedDailyCalls ?? SHARED_DAILY_CALLS, windowMs: 86_400_000 });
  const calls = opts.rateLimit && limiter(opts.rateLimit);
  // Every request (initialize, list, …) counts against a looser budget so floods stop too.
  const requests = opts.rateLimit && limiter({ calls: opts.rateLimit.calls * 10, windowMs: opts.rateLimit.windowMs });

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (opts.allowedHosts) {
      const host = validateHostHeader(req.headers.host, opts.allowedHosts);
      if (!host.ok) {
        send(res, 403, "This server only answers requests addressed to localhost: connect to http://localhost:<port>/mcp.");
        return;
      }
    }
    const origin = req.headers.origin;
    if (origin && !opts.allowedOrigins?.includes(origin)) {
      send(res, 403, "Requests from web pages are blocked on this server; connect from an MCP client instead.");
      return;
    }

    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!opts.noAuth && !tokenMatches(token, opts.tokens)) {
      send(res, 401, "Missing or invalid token: add the header Authorization: Bearer <your-token>.", { "www-authenticate": 'Bearer realm="tourbo-mcp"' });
      return;
    }

    let parsed: unknown;
    if (req.method === "POST") {
      const raw = await readBody(req);
      if (raw === undefined) return send(res, 413, "Request too large: send a smaller request.");
      try {
        parsed = JSON.parse(raw);
      } catch {
        return send(res, 400, "The request body is not valid JSON: send an MCP JSON-RPC message.");
      }
    }

    const isShared = !!token && tokenMatches(token, opts.sharedTokens ?? []);
    if (calls && requests) {
      const fwd = opts.trustProxy ? clientIp(req.headers["x-forwarded-for"]) : "";
      const perToken = token && !isShared;
      const keys = [`ip:${fwd || req.socket.remoteAddress || "?"}`, ...(perToken ? [`token:${token}`] : [])];
      const wait = Math.max(requests(keys, 1), calls(keys, countCalls(parsed)));
      if (wait) {
        const minutes = Math.max(1, Math.ceil(wait / 60_000));
        send(res, 429, `Too many requests: wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`, { "retry-after": String(Math.ceil(wait / 1000)) });
        return;
      }
    }

    if (isShared && countCalls(parsed) && sharedDay(["shared"], countCalls(parsed))) {
      send(res, 429, "The public demo token is out of tool calls for today: try again tomorrow, or run your own copy (see /connect).", { "retry-after": "3600" });
      return;
    }

    await (isShared ? shared : mcp)(req, res, parsed);
  };
}

// Standalone HTTP server: POST/GET/DELETE /mcp and GET /healthz.
// With --no-auth on a loopback address, only Host: localhost / 127.0.0.1 / [::1] is answered, so a
// web page can't reach it through DNS rebinding.
export function startHttpServer(opts: McpHttpOptions & { port: number; host: string }): Promise<Server> {
  const allowedHosts = opts.allowedHosts ?? (opts.noAuth && isLoopback(opts.host) ? localhostAllowedHostnames() : undefined);
  const handle = createMcpHttpHandler({ ...opts, allowedHosts });
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (path !== "/mcp") return send(res, 404, "Not found: the MCP endpoint is /mcp.");
    handle(req, res).catch((error) => {
      console.error("tourbo-mcp:", error);
      if (!res.headersSent) send(res, 500, "Something went wrong on the server: try again.");
      else res.end();
    });
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(opts.port, opts.host, () => ok(server));
  });
}
