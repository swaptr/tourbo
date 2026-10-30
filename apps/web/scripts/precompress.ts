// After `react-router build`: write .br and .gz next to every compressible file in build/client
// (scripts, styles, the prerendered `/`, landing JSON), so server.js serves them as files and no
// request spends CPU compressing. Images and fonts are already compressed and skipped.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const br = promisify(brotliCompress), gz = promisify(gzip);
const ROOT = new URL("../build/client/", import.meta.url).pathname;
const EXT = /\.(js|css|html|json|data|svg|txt|xml|webmanifest)$/;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.test(e.name)) yield p;
  }
}

let files = 0, raw = 0, packed = 0;
const jobs: Promise<void>[] = [];
for await (const p of walk(ROOT)) {
  jobs.push((async () => {
    const buf = await readFile(p);
    if (buf.length < 1024) return;
    const [b, g] = await Promise.all([
      br(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }),
      gz(buf, { level: 9 }),
    ]);
    await Promise.all([writeFile(`${p}.br`, b), writeFile(`${p}.gz`, g)]);
    files++, (raw += buf.length), (packed += b.length);
  })());
}
await Promise.all(jobs);
if (!(await stat(join(ROOT, "index.html")).catch(() => undefined))) console.warn("precompress: no prerendered index.html");
console.log(`precompress: ${files} files, ${(raw / 1e6).toFixed(1)} MB → ${(packed / 1e6).toFixed(1)} MB brotli`);
