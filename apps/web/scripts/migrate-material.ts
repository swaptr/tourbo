// Usage: npm run material:migrate
// Existing built sets (a tour's last "Build my set", run_steps set_last) → the act's material +
// a set on each of the tour's night events (PLAN Q21). Idempotent: run it again any time.
import { closeDb } from "@tourbo/core/db/client.server.ts";
import { migrateRunSet, runsWithSavedSets } from "@tourbo/core/material/material.server.ts";

const runs = await runsWithSavedSets();
let created = 0;
let nights = 0;
for (const id of runs) {
  try {
    const r = await migrateRunSet(id);
    if (r) {
      created += r.created;
      nights += r.nights;
    }
  } catch (e) {
    console.error(`tour ${id}: ${(e as Error).message}`);
  }
}
console.log(`${runs.length} tours with a saved set: ${created} new material items, ${nights} nights given a set.`);
await closeDb();
