// Change how a kind of act is shown (wizard tiles, pages, MCP catalog) without a deploy.
//   npm run kinds:set -- <kind> [--label X] [--hint Y] [--sort N] [--enable|--disable]
//   npm run kinds:list
// Writes the act_kinds table of the active DB (DATABASE_URL, else the local embedded one).
import { parseArgs } from "node:util";

import { closeDb, db } from "../src/db/client.server.ts";
import { actKinds, setActKind, type KindPatch } from "../src/disciplines/labels.server.ts";
import { PerformerKind } from "../src/shared/types.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: "boolean" },
    label: { type: "string" },
    hint: { type: "string" },
    sort: { type: "string" },
    enable: { type: "boolean" },
    disable: { type: "boolean" },
  },
});

const show = (k: { kind: string; label: string; hint: string; sort: number; enabled: boolean }) =>
  `${String(k.sort).padStart(4)}  ${k.enabled ? "on " : "off"}  ${k.kind.padEnd(14)} ${k.label.padEnd(14)} ${k.hint}`;

try {
  await db(); // fail loudly here, not with a silent registry fallback
  if (values.list) {
    for (const k of await actKinds({ fresh: true })) console.log(show(k));
  } else {
    const kind = PerformerKind.safeParse(positionals[0]);
    if (!kind.success) throw new Error(`Usage: npm run kinds:set -- <kind> [--label X] [--hint Y] [--sort N] [--enable|--disable]\nKinds: ${PerformerKind.options.join(", ")}`);
    if (values.enable && values.disable) throw new Error("Pick one of --enable or --disable.");
    const patch: KindPatch = {};
    if (values.label !== undefined) patch.label = values.label.trim();
    if (values.hint !== undefined) patch.hint = values.hint.trim();
    if (values.sort !== undefined) {
      patch.sort = Number(values.sort);
      if (!Number.isInteger(patch.sort)) throw new Error("--sort needs a whole number.");
    }
    if (values.enable) patch.enabled = true;
    if (values.disable) patch.enabled = false;
    if (patch.label === "" || patch.hint === "") throw new Error("--label and --hint can't be empty.");
    if (!Object.keys(patch).length) throw new Error("Nothing to change: pass --label, --hint, --sort, --enable or --disable.");
    console.log(show(await setActKind(kind.data, patch)));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
