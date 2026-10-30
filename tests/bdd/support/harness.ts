// Suite-wide setup: the fan-data double, a throwaway Postgres, and the web app on its own port.
// Nothing here touches .data/postgres or the dev server on :3000.
//
// Env knobs: BDD_PORT (app, 3100), BDD_FAKE_PORT (3199), BDD_PG_PORT (5435), BDD_LLM=1 (the app
// loads .env and uses the real AI key; fan data stays on the double), BDD_KEEP_DB=1 (keep the
// temp DB dir for debugging). App log: /tmp/tourbo-bdd-app.log (BDD_APP_LOG overrides).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startFakeFanData, type FakeFanData } from "./fake-fan-data.ts";

export const ROOT = resolve(import.meta.dirname, "../../..");
export const LLM = process.env.BDD_LLM === "1";
const PORT = Number(process.env.BDD_PORT ?? 3100);
const FAKE_PORT = Number(process.env.BDD_FAKE_PORT ?? 3199);
const PG_PORT = Number(process.env.BDD_PG_PORT ?? 5435);
export const BASE = `http://127.0.0.1:${PORT}`;
export const DB_URL = `postgres://tourbo:tourbo@127.0.0.1:${PG_PORT}/tourbo`;

// The test process talks to the same double and DB as the app (seeding plans, checking deletes).
// Set before any core module reads getEnv() (lazy, first use).
Object.assign(process.env, {
  QLOO_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
  QLOO_API_KEY: "bdd-fake-key",
  CACHE_TIERS: "none",
  DATABASE_URL: DB_URL,
  NODE_ENV: "development",
});

let fake: FakeFanData | undefined;
let app: ChildProcess | undefined;
let pg: { stop: () => Promise<void> } | undefined;
let pgDir: string | undefined;

export const fanData = () => fake!;

async function waitFor(url: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await fetch(url).then((r) => r.ok, () => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function startHarness() {
  fake = await startFakeFanData(FAKE_PORT);

  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  pgDir = mkdtempSync(join(tmpdir(), "tourbo-bdd-pg-"));
  const db = new EmbeddedPostgres({ databaseDir: pgDir, port: PG_PORT, user: "tourbo", password: "tourbo", authMethod: "scram-sha-256", persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: () => {}, onError: () => {} });
  await db.initialise();
  await db.start();
  await db.createDatabase("tourbo");
  pg = db;

  // Production build by default (no Vite dev server, so no race with `npm run dev` over
  // apps/web/.react-router typegen). BDD_DEV=1 runs the dev server instead; BDD_SKIP_BUILD=1
  // serves the existing apps/web/build. A failed build falls back to dev mode.
  mode = process.env.BDD_DEV === "1" ? "dev" : "prod";
  if (mode === "prod" && process.env.BDD_SKIP_BUILD !== "1") {
    const built = spawnSync("npm", ["run", "build", "-w", "@tourbo/web"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    if (built.status !== 0) {
      console.error(`[bdd] production build failed; using the dev server.\n${(built.stderr || built.stdout).slice(-1500)}`);
      mode = "dev";
    }
  }
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(PORT), NODE_ENV: mode === "prod" ? "production" : "development", CACHE_TIERS: "none" };
  if (!LLM) env.ANTHROPIC_API_KEY = ""; // empty beats .env; the app shows its no-AI states
  delete env.RESEND_API_KEY; // emails stay simulated
  log = createWriteStream(process.env.BDD_APP_LOG ?? "/tmp/tourbo-bdd-app.log");
  appEnv = env;
  spawnApp();
  await waitFor(`${BASE}/healthz`, 60_000);
  // First SSR of a route compiles it; warm the main ones so step timeouts measure the app.
  for (const path of ["/start", "/help", "/connect", "/projects"]) await fetch(BASE + path).catch(() => {});
}

let log: ReturnType<typeof createWriteStream>;
let appEnv: NodeJS.ProcessEnv;
let stopping = false;
let mode: "prod" | "dev" = "prod";
export const appMode = () => mode;
// In dev mode the app shares apps/web/.react-router (route typegen) with any running `npm run dev`;
// when both regenerate at once one can die with ENOTEMPTY. Restart it, like a supervisor would.
function spawnApp() {
  const envFile = LLM ? ["--env-file-if-exists=../../.env"] : [];
  const args = mode === "prod" ? [...envFile, "server.js"] : ["--conditions", "development", ...envFile, join(import.meta.dirname, "app-server.ts")];
  app = spawn(process.execPath, args, {
    cwd: join(ROOT, "apps/web"),
    env: appEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout!.pipe(log, { end: false });
  app.stderr!.pipe(log, { end: false });
  app.once("exit", (code) => {
    if (stopping) return;
    log.write(`\n[bdd] app exited (${code}); restarting\n`);
    restarts++;
    spawnApp();
  });
}
let restarts = 0;
export const appRestarts = () => restarts;

// Before each scenario: the app is up (after a restart it takes a few seconds).
export const appReady = () => waitFor(`${BASE}/healthz`, 90_000);

export async function stopHarness() {
  stopping = true;
  if (app && app.exitCode == null) {
    app.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
  }
  const { closeDb } = await import("@tourbo/core/db/client.server.ts");
  await closeDb().catch(() => {});
  await pg?.stop().catch(() => {});
  if (pgDir && process.env.BDD_KEEP_DB !== "1") rmSync(pgDir, { recursive: true, force: true });
  await fake?.close();
}
