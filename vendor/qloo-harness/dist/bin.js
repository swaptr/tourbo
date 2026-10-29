#!/usr/bin/env node
import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);

// apps/qloo-harness/dist/bin.js
try {
  const { runQloo } = await import("./router.js");
  process.exitCode = await runQloo();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`qloo: unexpected failure: ${message}
`);
  process.exitCode = 1;
}
