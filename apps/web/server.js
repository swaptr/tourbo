import compression from "compression";
import express from "express";
import morgan from "morgan";
import { readdirSync } from "node:fs";
import { sep } from "node:path";

// Short-circuit the type-checking of the built output.
const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "3000");

const app = express();

app.disable("x-powered-by");
// Render sits one proxy hop in front: req.protocol (and so request.url in loaders) reads https from it.
app.set("trust proxy", 1);
// Basic security headers: no framing, no MIME sniffing, origin-only referrers, HTTPS pinned in
// production. No script CSP (the app, map tiles and workers load as they are).
app.use((_req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!DEVELOPMENT) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.get("/healthz", (req, res) => {
  // Dev only: /healthz?cache = cache hit/miss/stale counters per namespace.
  if (DEVELOPMENT && "cache" in req.query) return res.json({ status: "ok", cache: /** @type {any} */ (globalThis).__tourboCacheStats?.() ?? {} });
  res.send("ok");
});
// Compression buffers SSE; skip text/event-stream responses.
app.use(
  compression({
    filter: (req, res) =>
      !String(res.getHeader("Content-Type") ?? "").startsWith(
        "text/event-stream",
      ) && compression.filter(req, res),
  }),
);

if (DEVELOPMENT) {
  console.log("Starting development server");
  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({
      server: { middlewareMode: true },
    }),
  );
  app.use(viteDevServer.middlewares);
  app.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule("./server/app.ts");
      return await source.app(req, res, next);
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  console.log("Starting production server");
  // Pre-compressed files (scripts/precompress.ts writes .br/.gz at build): served as-is, so no
  // request spends CPU compressing (compression() skips responses that already have an encoding).
  /** @type {Record<string, string>} */
  const TYPES = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", html: "text/html; charset=utf-8", json: "application/json; charset=utf-8", data: "text/x-script", svg: "image/svg+xml", txt: "text/plain; charset=utf-8", xml: "application/xml", webmanifest: "application/manifest+json" };
  const variants = new Set(readdirSync("build/client", { recursive: true, encoding: "utf8" }).filter((f) => /\.(br|gz)$/.test(f)).map((f) => "/" + f.split(sep).join("/")));
  /** @param {express.Request} req @param {express.Response} res @param {string} file url path of the original */
  const encoded = (req, res, file) => {
    const type = TYPES[file.slice(file.lastIndexOf(".") + 1)];
    if (!type || !(variants.has(file + ".br") || variants.has(file + ".gz"))) return file;
    res.vary("Accept-Encoding");
    const accept = String(req.headers["accept-encoding"] ?? "");
    for (const [enc, ext] of [["br", ".br"], ["gzip", ".gz"]]) {
      if (!new RegExp(`\\b${enc}\\b`).test(accept) || !variants.has(file + ext)) continue;
      res.setHeader("Content-Encoding", enc);
      res.setHeader("Content-Type", type);
      return file + ext;
    }
    return file;
  };
  app.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || req.path === "/_.data") return next(); // `/` files: below
    let path;
    try {
      path = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const file = encoded(req, res, path);
    if (file !== path) req.url = file + req.url.slice(req.path.length);
    next();
  });
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(morgan("tiny"));
  // Landing data (exported static files): content-hashed files never change; the manifest does.
  app.use(
    "/landing",
    express.static("build/client/landing", {
      setHeaders(res, path) {
        res.setHeader("Cache-Control", /\.[0-9a-f]{6,}\.(json|png)(\.br|\.gz)?$/.test(path) ? "public, max-age=31536000, immutable" : "public, max-age=60");
      },
    }),
  );
  // `/` is prerendered at build (index.html + _.data for client navigations): served as files, so a
  // landing visit runs no loader, no database, no fan-data or AI call, and sets no cookie. CDNs
  // keep it a day and may serve it stale for a week while they refetch. `?live=off` still SSRs.
  const LANDING_HTML = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";
  /** @param {string} file @param {string} type @returns {express.RequestHandler} */
  const prerendered = (file, type) => (req, res, next) => {
    if (req.path === "/" && req.query.live !== undefined) return next();
    res.setHeader("Content-Type", type);
    res.sendFile(encoded(req, res, file).slice(1), { root: "build/client", headers: { "Cache-Control": LANDING_HTML } }, (/** @type {Error | undefined} */ err) => err && !res.headersSent && next());
  };
  app.get("/", prerendered("/index.html", "text/html; charset=utf-8"));
  app.get("/_.data", prerendered("/_.data", "text/x-script"));
  app.use(express.static("build/client", { maxAge: "1h", index: false }));
  // HTML and data responses: always revalidate (hashed assets above are immutable).
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache");
    next();
  });
  app.use(await import(BUILD_PATH).then((mod) => mod.app));
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
