// Local Postgres without Docker: when DATABASE_URL is unset, db() runs real Postgres 17 binaries
// (embedded-postgres) with data in <repo>/.data/postgres (git-ignored). The first process to need
// it starts it and stops it on exit; others reuse it while it is up. Logs go to stderr only.
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";

export const EMBEDDED_PORT = 5434;
export const EMBEDDED_URL = `postgres://tourbo:tourbo@127.0.0.1:${EMBEDDED_PORT}/tourbo`;

// Repo root = nearest dir with package-lock.json (npm runs workspace scripts in the workspace dir).
function dataDir() {
  let dir = process.cwd();
  while (!existsSync(join(dir, "package-lock.json")) && dirname(dir) !== dir) dir = dirname(dir);
  return resolve(dir, ".data/postgres");
}

const listening = () =>
  new Promise<boolean>((ok) => {
    const s = connect(EMBEDDED_PORT, "127.0.0.1");
    s.once("connect", () => (s.destroy(), ok(true)));
    s.once("error", () => ok(false));
  });

async function start(): Promise<string> {
  if (await listening()) return EMBEDDED_URL;
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = dataDir();
  const log: string[] = [];
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    port: EMBEDDED_PORT,
    user: "tourbo",
    password: "tourbo",
    authMethod: "scram-sha-256",
    persistent: true,
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
    onLog: (m) => void log.push(String(m)),
    onError: (m) => void log.push(String(m)),
  });
  const fresh = !existsSync(join(dir, "PG_VERSION"));
  try {
    if (fresh) await pg.initialise();
    await pg.start();
    if (fresh) await pg.createDatabase("tourbo");
  } catch (error) {
    // Another process may have started it at the same moment.
    for (let i = 0; i < 50; i++) {
      if (await listening()) return EMBEDDED_URL;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Local database did not start (${dir}). ${log.slice(-5).join(" ").trim() || error}`);
  }
  // Let short scripts exit on their own; embedded-postgres stops the server on exit/SIGINT/SIGTERM.
  const child = (pg as unknown as { process?: import("node:child_process").ChildProcess }).process;
  child?.unref();
  for (const s of [child?.stdout, child?.stderr]) (s as unknown as { unref?: () => void })?.unref?.();
  console.error(`Local database ${fresh ? "created" : "started"}: ${dir} (port ${EMBEDDED_PORT})`);
  return EMBEDDED_URL;
}

// Survives Vite dev module reloads.
const g = globalThis as { __tourboEmbeddedPg?: Promise<string> };
export function embeddedUrl(): Promise<string> {
  g.__tourboEmbeddedPg ??= start().catch((error) => {
    g.__tourboEmbeddedPg = undefined;
    throw error;
  });
  return g.__tourboEmbeddedPg;
}
