import { db } from "../db/client.server.ts";
import type { PerformerKind } from "../shared/types.ts";
import { mergeKinds, registryKinds, type ActKind, type ActKindRow } from "./labels.ts";

export { mergeKinds, registryKinds, type ActKind };

// act_kinds rows (seeded from the registry in schema.server.ts) merged over the registry. Short
// in-process memo so page loads don't each query; a failed read falls back to the registry and
// is retried after a minute, so a missing DB never slows pages down.
const FRESH_MS = 10_000;
const RETRY_MS = 60_000;
let memo: { at: number; ttl: number; kinds: ActKind[] } | undefined;

const readRows = async (): Promise<ActKindRow[]> => (await db())<ActKindRow[]>`select kind, label, hint, sort, enabled from act_kinds`;

export async function actKinds(opts: { rows?: () => Promise<ActKindRow[]>; fresh?: boolean } = {}): Promise<ActKind[]> {
  if (!opts.fresh && !opts.rows && memo && Date.now() - memo.at < memo.ttl) return memo.kinds;
  let kinds: ActKind[];
  let ttl = FRESH_MS;
  try {
    kinds = mergeKinds(await withTimeout((opts.rows ?? readRows)(), 3_000));
  } catch {
    kinds = registryKinds();
    ttl = RETRY_MS;
  }
  if (!opts.rows) memo = { at: Date.now(), ttl, kinds };
  return kinds;
}

export type KindPatch = { label?: string; hint?: string; sort?: number; enabled?: boolean };

// Upsert one kind's display fields (registry values fill the rest of a new row).
export async function setActKind(kind: PerformerKind, patch: KindPatch): Promise<ActKind> {
  const base = registryKinds().find((k) => k.kind === kind);
  if (!base) throw new Error(`Unknown kind "${kind}"`);
  const sql = await db();
  await sql`insert into act_kinds (kind, label, hint, sort, enabled) values (${kind}, ${base.label}, ${base.hint}, ${base.sort}, true) on conflict (kind) do nothing`;
  await sql`update act_kinds set
    label = coalesce(${patch.label ?? null}::text, label),
    hint = coalesce(${patch.hint ?? null}::text, hint),
    sort = coalesce(${patch.sort ?? null}::int, sort),
    enabled = coalesce(${patch.enabled ?? null}::boolean, enabled),
    updated_at = now()
    where kind = ${kind}`;
  memo = undefined;
  return (await actKinds({ fresh: true })).find((k) => k.kind === kind)!;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error("act_kinds read timed out")), ms)))]).finally(() => clearTimeout(timer));
}
