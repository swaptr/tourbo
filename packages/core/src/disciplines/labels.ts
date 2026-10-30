import type { PerformerKind } from "../shared/types.ts";
import { DISCIPLINES } from "./index.ts";

// Display name, hint, order and on/off per kind of act. Client-safe: the registry gives the
// defaults; the act_kinds table (labels.server.ts, edited with `npm run kinds:set`) overrides them.
export type ActKind = { kind: PerformerKind; label: string; hint: string; sort: number; enabled: boolean };
export type ActKindRow = { kind: string; label?: string | null; hint?: string | null; sort?: number | null; enabled?: boolean | null };

export const registryKinds = (): ActKind[] =>
  Object.values(DISCIPLINES).map((d, i) => ({ kind: d.key, label: d.label, hint: d.hint, sort: (i + 1) * 10, enabled: true }));

// DB rows override the registry field by field (blank text ignored); rows for unknown kinds are
// dropped; result sorted by `sort`, registry order breaking ties.
export function mergeKinds(rows: ActKindRow[] = []): ActKind[] {
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  const text = (v: string | null | undefined, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  return registryKinds()
    .map((d, i) => {
      const r = byKind.get(d.kind);
      const kind: ActKind = r
        ? { kind: d.kind, label: text(r.label, d.label), hint: text(r.hint, d.hint), sort: Number.isFinite(r.sort) ? Number(r.sort) : d.sort, enabled: r.enabled ?? d.enabled }
        : d;
      return { kind, i };
    })
    .sort((a, b) => a.kind.sort - b.kind.sort || a.i - b.i)
    .map((x) => x.kind);
}

export const labelMap = (kinds: ActKind[]) => Object.fromEntries(kinds.map((k) => [k.kind, k.label])) as Record<PerformerKind, string>;
