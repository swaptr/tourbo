// One-off copy of an existing Postgres (default: the old Docker one on :5433) into the database
// db() uses (the local embedded one unless DATABASE_URL is set). Reads the source only.
//   npm run db:import -- [source-url] [--replace]
// --replace empties target tables that already have rows; without it a non-empty target aborts.
import { pipeline } from "node:stream/promises";
import postgres from "postgres";

import { db, closeDb } from "../src/db/client.server.ts";

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const sourceUrl = args.find((a) => !a.startsWith("--")) ?? "postgres://tourbo:tourbo@localhost:5433/tourbo";

const target = await db();
const source = postgres(sourceUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
const id = async (sql: postgres.Sql) => (await sql`select inet_server_port() as port, pg_postmaster_start_time()::text as sys`)[0];
const [s, t] = await Promise.all([id(source), id(target)]);
if (s.sys === t.sys && s.port === t.port) throw new Error("Source and target are the same database.");

type Col = { table: string; column: string };
const columns = async (sql: postgres.Sql) => {
  const rows = await sql<Col[]>`select table_name as table, column_name as column from information_schema.columns
    where table_schema = 'public' and table_name in (select tablename from pg_tables where schemaname = 'public')
    order by table_name, ordinal_position`;
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.table, [...(map.get(r.table) ?? []), r.column]);
  return map;
};
const [srcCols, dstCols] = await Promise.all([columns(source), columns(target)]);
const tables = [...srcCols.keys()].filter((name) => dstCols.has(name));
const skipped = [...srcCols.keys()].filter((name) => !dstCols.has(name));

const conn = await target.reserve();
try {
  const filled: string[] = [];
  for (const name of tables) if ((await conn`select exists (select 1 from ${conn(name)}) as x`)[0].x) filled.push(name);
  if (filled.length && !replace) throw new Error(`Target already has rows in: ${filled.join(", ")}. Re-run with --replace to overwrite them.`);

  await conn`begin`;
  await conn`set local session_replication_role = replica`; // skip FK checks while loading
  if (tables.length) await conn.unsafe(`truncate ${tables.map((n) => `"${n}"`).join(", ")} cascade`);
  for (const name of tables) {
    const cols = srcCols.get(name)!.filter((c) => dstCols.get(name)!.includes(c));
    const list = cols.map((c) => `"${c}"`).join(", ");
    const started = Date.now();
    const out = await source.unsafe(`copy "${name}" (${list}) to stdout`).readable();
    const into = await conn.unsafe(`copy "${name}" (${list}) from stdin`).writable();
    await pipeline(out, into);
    const [{ n }] = await conn.unsafe(`select count(*)::int as n from "${name}"`);
    // Serial ids continue after the copied rows.
    for (const c of cols) {
      const [{ seq }] = await conn`select pg_get_serial_sequence(${`"${name}"`}, ${c}) as seq`;
      if (seq) await conn.unsafe(`select setval('${seq}', coalesce((select max("${c}") from "${name}"), 0) + 1, false)`);
    }
    console.log(`${name}: ${n} rows (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  await conn`commit`;
  await conn`analyze`;
  if (skipped.length) console.log(`Skipped (not in this schema): ${skipped.join(", ")}`);
  console.log("Import done.");
} catch (error) {
  await conn`rollback`.catch(() => {});
  throw error;
} finally {
  conn.release();
  await source.end({ timeout: 5 });
  await closeDb();
}
