// A production server (apps/web/build) on its own port whose database, fan-data API and AI API all
// point at local counting sinks: every connection attempt is counted and refused, so a landing
// visit that touched any of them shows up as a non-zero count. Used by story test 18 and
// `npm run landing:load`. The child gets a minimal env (no .env, no keys).
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo, type Server } from "node:net";
import { fileURLToPath } from "node:url";

export const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
export const hasBuild = () => existsSync(`${WEB_DIR}/build/client/index.html`) && existsSync(`${WEB_DIR}/build/server/index.js`);

type Sink = { server: Server; port: number; hits: () => number };
async function sink(): Promise<Sink> {
  let n = 0;
  const server = createServer((s) => (n++, s.destroy()));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, port: (server.address() as AddressInfo).port, hits: () => n };
}

export type LandingServer = {
  base: string;
  pid: number;
  calls: () => { db: number; fanData: number; ai: number };
  log: () => string;
  stop: () => Promise<void>;
};

export async function startLandingServer(port: number): Promise<LandingServer> {
  const [db, fan, ai] = await Promise.all([sink(), sink(), sink()]);
  let out = "";
  const child: ChildProcess = spawn(process.execPath, ["server.js"], {
    cwd: WEB_DIR,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_URL: `postgres://tourbo:tourbo@127.0.0.1:${db.port}/tourbo`,
      QLOO_BASE_URL: `http://127.0.0.1:${fan.port}`,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (d) => (out += d));
  child.stderr!.on("data", (d) => (out += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    if (await fetch(`${base}/healthz`).then((r) => r.ok).catch(() => false)) break;
    if (i > 100 || child.exitCode != null) throw new Error(`landing server did not start:\n${out}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base,
    pid: child.pid!,
    calls: () => ({ db: db.hits(), fanData: fan.hits(), ai: ai.hits() }),
    log: () => out,
    stop: async () => {
      child.kill();
      await new Promise((r) => child.once("exit", r));
      for (const s of [db, fan, ai]) s.server.close();
    },
  };
}

// The same-origin files the prerendered HTML loads first: scripts, styles, preloaded fonts, plus
// the landing manifest the page reads on hydration.
export function firstLoadAssets(html: string): string[] {
  const refs = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g), ...html.matchAll(/import\("(\/assets\/[^"]+)"\)/g)].map((m) => m[1]);
  return [...new Set([...refs, "/landing/manifest.json"])];
}

// CPU seconds (user + system) the process has used so far (Linux /proc; 0 elsewhere).
export function cpuSeconds(pid: number): number {
  try {
    const f = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
    return (Number(f[11]) + Number(f[12])) / 100;
  } catch {
    return 0;
  }
}
