import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Backend, Entry } from "./index.ts";

// One JSON file per entry: <dir>/<namespace>/<sha256(key)>.json. Read-only mode serves baked files
// (e.g. shipped in the image) and never writes, so prod disks stay untouched.
export function fileBackend(dir: string, readOnly = false): Backend {
  const nsDir = (ns: string) => join(dir, ns.replace(/[^\w.-]/g, "_"));
  const path = (ns: string, key: string) => join(nsDir(ns), `${createHash("sha256").update(key).digest("hex")}.json`);
  return {
    name: "file",
    readOnly,
    async get(ns, key) {
      const text = await readFile(path(ns, key), "utf8").catch(() => undefined);
      if (text === undefined) return undefined;
      try {
        return JSON.parse(text) as Entry;
      } catch {
        return undefined;
      }
    },
    async set(ns, key, entry) {
      if (readOnly) return;
      const file = path(ns, key);
      await mkdir(nsDir(ns), { recursive: true });
      // Write then rename so a concurrent reader never sees half a file.
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entry));
      await rename(tmp, file);
    },
    async delete(ns, key) {
      if (!readOnly) await rm(path(ns, key), { force: true });
    },
    async deleteByTag(tag) {
      if (readOnly) return;
      for (const ns of await readdir(dir).catch(() => [])) {
        for (const name of await readdir(join(dir, ns)).catch(() => [])) {
          const file = join(dir, ns, name);
          const entry = await readFile(file, "utf8").then((t) => JSON.parse(t) as Entry).catch(() => undefined);
          if (entry?.tags?.includes(tag)) await rm(file, { force: true });
        }
      }
    },
  };
}
