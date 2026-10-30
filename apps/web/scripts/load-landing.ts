// Landing load check (Q8): N visits to `/` (each also fetching its first-load assets) against the
// production build, with the database / fan-data / AI endpoints pointed at counting sinks.
// Reports TTFB p50/p95 for `/` (client side, includes its own queueing) and the server's time, server CPU used, and the connection counts (must all be 0).
// Usage: npm run landing:load -- [visits=1000] [concurrency=50]   (after npm run build)
import { cpuSeconds, firstLoadAssets, hasBuild, startLandingServer } from "./landing-server.ts";

const visits = Number(process.argv[2] ?? 1000);
const concurrency = Number(process.argv[3] ?? 50);
if (!hasBuild()) throw new Error("no production build: run npm run build first");

const srv = await startLandingServer(3119);
try {
  const assets = firstLoadAssets(await fetch(`${srv.base}/`).then((r) => r.text()));
  const headers = { "accept-encoding": "gzip, br" };
  const ttfb: number[] = [];
  let requests = 0, failed = 0, next = 0;
  const cpu0 = cpuSeconds(srv.pid), t0 = performance.now();
  const visit = async () => {
    const t = performance.now();
    const res = await fetch(`${srv.base}/`, { headers });
    ttfb.push(performance.now() - t); // fetch resolves when the response headers arrive
    await res.arrayBuffer();
    const all = await Promise.all(assets.map((a) => fetch(srv.base + a, { headers }).then(async (r) => (await r.arrayBuffer(), r.ok))));
    requests += 1 + all.length;
    failed += (res.ok ? 0 : 1) + all.filter((ok) => !ok).length;
  };
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next++ < visits) await visit();
  }));
  const secs = (performance.now() - t0) / 1000;
  ttfb.sort((a, b) => a - b);
  const pct = (p: number) => ttfb[Math.min(ttfb.length - 1, Math.floor(p * ttfb.length))].toFixed(1);
  const calls = srv.calls();
  console.log(`${visits} visits × (1 + ${assets.length} assets) = ${requests} requests in ${secs.toFixed(1)} s, concurrency ${concurrency}, ${failed} failed`);
  console.log(`TTFB for /: p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${ttfb.at(-1)!.toFixed(1)} ms`);
  // morgan "tiny": `GET / 200 <bytes> - <ms> ms` = the server's own time to the response headers.
  const server = [...srv.log().matchAll(/^GET \/ 200 .* ([\d.]+) ms$/gm)].map((m) => Number(m[1])).sort((a, b) => a - b);
  const spct = (p: number) => server[Math.min(server.length - 1, Math.floor(p * server.length))]?.toFixed(2);
  console.log(`server time for / (${server.length} logged): p50 ${spct(0.5)} ms, p95 ${spct(0.95)} ms`);
  console.log(`server CPU: ${(cpuSeconds(srv.pid) - cpu0).toFixed(2)} s for ${requests} requests`);
  console.log(`database connections: ${calls.db}, fan-data calls: ${calls.fanData}, AI calls: ${calls.ai}`);
  if (failed || calls.db || calls.fanData || calls.ai) process.exitCode = 1;
} finally {
  await srv.stop();
}
