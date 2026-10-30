// The web app for the BDD suite: apps/web/server.js's development branch (Express + Vite
// middleware + server/app.ts), with HMR off and its own Vite cache so it runs next to a normal
// `npm run dev` (which holds port 3000 and the HMR socket). Started by harness.ts as a child
// process with cwd = apps/web and the suite's env (fake fan data, throwaway DB).
import express from "express";
import { createServer } from "vite";

const PORT = Number(process.env.PORT ?? 3100);
const app = express();
app.disable("x-powered-by");
app.get("/healthz", (_req, res) => void res.send("ok"));

const vite = await createServer({
  root: process.cwd(),
  cacheDir: process.env.BDD_VITE_CACHE ?? "/tmp/tourbo-bdd-vite",
  // Own HMR socket port: the browser client always connects, and :24678 belongs to `npm run dev`.
  server: { middlewareMode: true, hmr: { port: Number(process.env.BDD_HMR_PORT ?? 24679) } },
  logLevel: "warn",
});
app.use(vite.middlewares);
app.use(async (req, res, next) => {
  try {
    const source = await vite.ssrLoadModule("./server/app.ts");
    return await source.app(req, res, next);
  } catch (error) {
    if (error instanceof Error) vite.ssrFixStacktrace(error);
    next(error);
  }
});
app.listen(PORT, "127.0.0.1", () => console.log(`bdd app on http://127.0.0.1:${PORT}`));
