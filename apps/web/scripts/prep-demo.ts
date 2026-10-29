// Usage: npm run prep:demo -w @tourbo/web -- <runId> [stopIndex]
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { prepareShow } from "../server/agent/prep.server.ts";
import { usageSummary } from "../server/agent/usage.ts";

const [runId, stop = "0"] = process.argv.slice(2);
const prep = await prepareShow(runId!, Number(stop));
for (const s of prep.steps) console.error(`[${s.kind}] ${s.message}`);
console.error(prep.issues.join("\n"));
console.log(JSON.stringify({ hook: prep.final.hook, items: prep.final.items, remaining: prep.remaining, generic: prep.generic?.items.slice(0, 4) }, null, 2));
console.error(JSON.stringify(usageSummary()));
await closeDb();
