// node mock/dev-mock.mjs (from the tourbo root) — the fan-data mock plus the dev server pointed at it (QLOO_BASE_URL from the
// environment wins over .env, so .env stays untouched). Dev only: production uses the real API.
// CACHE_TIERS=memory keeps mock answers out of the app's Postgres cache of real responses.
import { spawn } from "node:child_process";

const port = process.env.MOCK_PORT ?? "8790";
const base = `http://127.0.0.1:${port}`;
const mock = spawn("uv", ["run", "--directory", "mock", "tourbo-mock", "--port", port], { stdio: "inherit" });

let up = false;
for (let i = 0; i < 300 && !up && mock.exitCode === null; i++) {
  up = await fetch(`${base}/healthz`).then((r) => r.ok, () => false);
  if (!up) await new Promise((r) => setTimeout(r, 200));
}
if (!up) {
  console.error(`fan-data mock did not start on ${base}`);
  mock.kill();
  process.exit(1);
}

const dev = spawn("npm", ["run", "dev"], { stdio: "inherit", env: { ...process.env, QLOO_BASE_URL: base, QLOO_API_KEY: process.env.QLOO_API_KEY || "mock", CACHE_TIERS: process.env.CACHE_TIERS || "memory" } });
const stop = () => { dev.kill("SIGTERM"); mock.kill("SIGTERM"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
dev.on("exit", (code) => { mock.kill("SIGTERM"); process.exit(code ?? 0); });
mock.on("exit", () => dev.kill("SIGTERM"));
