// Bundles the CLI into one self-contained ESM file (dist/bin/tourbo-mcp.js) for npm and Docker:
// @tourbo/core and every dependency inlined, so `npx -y @tourbo/mcp` installs nothing else.
// The embedded-Postgres starter is swapped for a stub: the published server never starts a
// database; without DATABASE_URL the project tools answer with one plain sentence.
import { readFileSync, rmSync, statSync } from "node:fs";
import { build } from "esbuild";

const here = new URL(".", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(`${here}package.json`, "utf8"));
const serverSrc = readFileSync(`${here}src/server.ts`, "utf8");
if (!serverSrc.includes(`version: "${pkg.version}"`)) throw new Error(`SERVER_INFO.version in src/server.ts must match package.json (${pkg.version}).`);

const noEmbeddedDb = {
  name: "no-embedded-postgres",
  setup(b) {
    b.onResolve({ filter: /\/embedded\.server(\.ts)?$/ }, (args) => ({ path: args.path, namespace: "no-db" }));
    b.onLoad({ filter: /.*/, namespace: "no-db" }, () => ({
      loader: "ts",
      contents: `export const EMBEDDED_PORT = 0;
export const EMBEDDED_URL = "";
export function embeddedUrl(): Promise<string> {
  return Promise.reject(new Error("Projects need DATABASE_URL: set it to a Postgres connection string and restart the server."));
}`,
    }));
  },
};

const outfile = `${here}dist/bin/tourbo-mcp.js`;
rmSync(`${here}dist`, { recursive: true, force: true });
const result = await build({
  entryPoints: [`${here}src/bin/cli.ts`],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  legalComments: "eof",
  metafile: true,
  plugins: [noEmbeddedDb],
  // CJS dependencies call require() for Node built-ins; give the ESM bundle one.
  banner: { js: `#!/usr/bin/env node\nimport { createRequire as __tourboRequire } from "node:module";\nconst require = __tourboRequire(import.meta.url);` },
  logLevel: "warning",
});
const leaked = Object.keys(result.metafile.inputs).filter((f) => /embedded-postgres/.test(f));
if (leaked.length) throw new Error(`embedded-postgres leaked into the bundle: ${leaked.join(", ")}`);
console.log(`dist/bin/tourbo-mcp.js ${(statSync(outfile).size / 1024).toFixed(0)} KB`);
