// Usage: npm run db:apply. Applies the idempotent schema (tables, columns, row level security) to
// DATABASE_URL and exits. CI runs it before each deploy; the app also applies it on first DB use.
import { closeDb, db } from "../src/db/client.server.ts";

await db();
await closeDb();
console.error("schema applied");
