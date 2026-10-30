import { z } from "zod";

import { workspaceFor } from "../disciplines/index.ts";
import { PerformerKind } from "../shared/types.ts";

// The act's material (PLAN Q21): songs, bits, talks, pieces, routines, reusable across events.
// Client-safe: zod shapes + pure helpers (library order, filters, set building, kept ideas,
// migration of saved sets). The DB side is material.server.ts.

export const MATERIAL_TYPES = ["song", "bit", "talk", "piece", "routine", "other"] as const;
export const MaterialType = z.enum(MATERIAL_TYPES);
export type MaterialType = z.infer<typeof MaterialType>;
export const TYPE_LABEL: Record<MaterialType, string> = { song: "Song", bit: "Bit", talk: "Talk", piece: "Piece", routine: "Routine", other: "Other" };

export const ORIGINS = ["original", "cover", "local_idea"] as const;
export const Origin = z.enum(ORIGINS);
export type Origin = z.infer<typeof Origin>;
export const ORIGIN_LABEL: Record<Origin, string> = { original: "Your own", cover: "Cover", local_idea: "Local idea" };

// The default type per kind is the first of its workspace Library types (disciplines/index.ts).
export const defaultType = (kind?: string): MaterialType => workspaceFor(kind).types[0] ?? "piece";

export const Source = z.object({ ref: z.string().trim().min(1).max(160), category: z.string().max(40).optional(), city: z.string().trim().max(120).optional() });
export type Source = z.infer<typeof Source>;

const MAX_MIN = 600;
// Optional per-kind details (which ones a kind fills: workspaceFor(kind).fields). Songs: key, tempo,
// energy 1–5 (the setlist's energy curve). Bits: opener / callback / closer. Pieces: size and price
// (the hang). Dishes: course (the menu). Class segments: which part of the class.
export const COURSES = ["snack", "starter", "main", "side", "dessert", "drink"] as const;
export const PARTS = ["warmup", "teach", "practice", "cooldown"] as const;
export const MARKERS = ["opener", "callback", "closer"] as const;
export const COURSE_LABEL: Record<(typeof COURSES)[number], string> = { snack: "Snack", starter: "Starter", main: "Main", side: "Side", dessert: "Dessert", drink: "Drink" };
export const PART_LABEL: Record<(typeof PARTS)[number], string> = { warmup: "Warm-up", teach: "Teach", practice: "Practice", cooldown: "Cool-down" };
export const MARKER_LABEL: Record<(typeof MARKERS)[number], string> = { opener: "Opener", callback: "Callback", closer: "Closer" };
export const MaterialDetails = z.object({
  key: z.string().trim().max(8, "Keys are short, like Am or F#.").optional(),
  bpm: z.number().int().min(20, "Tempo is in beats per minute, 20–300.").max(300, "Tempo is in beats per minute, 20–300.").optional(),
  energy: z.number().int().min(1).max(5).optional(),
  marker: z.enum(MARKERS).optional(),
  size: z.string().trim().max(40, "Keep the size short, like 60 × 80 cm.").optional(),
  price: z.number().min(0, "Price can't be negative.").max(10_000_000).optional(),
  course: z.enum(COURSES).optional(),
  part: z.enum(PARTS).optional(),
});
export type MaterialDetails = z.infer<typeof MaterialDetails>;
export type DetailField = keyof MaterialDetails;

export const MaterialFields = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."),
  type: MaterialType.default("song"),
  kind: PerformerKind.optional(),
  lengthMin: z
    .number({ message: "Length is in minutes, like 4 or 3.5." })
    .min(0, "Length can't be negative.")
    .max(MAX_MIN, "Keep it under 10 hours.")
    .optional(),
  notes: z.string().trim().max(2000, "Keep notes under 2000 characters.").optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12, "Up to 12 tags.").default([]),
  origin: Origin.default("original"),
  source: Source.optional(),
  details: MaterialDetails.optional(),
});
export type MaterialFields = z.infer<typeof MaterialFields>;
export type Material = MaterialFields & { id: string; profileId: string; createdAt: string; updatedAt: string; uses?: number };

// Form text → numbers / tags. "" length = none; "4", "3.5", "4 min", "3:30" all read.
export function readLength(text: string): number | undefined | "bad" {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  const mmss = t.match(/^(\d+):([0-5]\d)$/);
  if (mmss) return Number(mmss[1]) + Number(mmss[2]) / 60;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes)?$/);
  return m ? Number(m[1]) : "bad";
}
export const readTags = (text: string) => [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 12);

// "4 min", "3½ min" style; minutes are rounded to the half.
export function minutesLabel(min?: number): string {
  if (min === undefined || !Number.isFinite(min)) return "";
  const half = Math.round(min * 2) / 2;
  if (half >= 60) {
    const h = Math.floor(half / 60);
    const m = Math.round(half - h * 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Number.isInteger(half) ? half : `${Math.floor(half)}½`} min`;
}

// ---------- Library ----------

const ORIGIN_ORDER: Record<Origin, number> = { original: 0, cover: 1, local_idea: 2 };
// Originals first (local ideas season the act's own material, never lead), then A–Z.
export function sortLibrary<T extends Pick<Material, "origin" | "title">>(list: T[]): T[] {
  return [...list].sort((a, b) => ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin] || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

export type LibraryFilter = { q?: string; type?: string; origin?: string };
export function filterLibrary<T extends Pick<Material, "title" | "type" | "origin" | "tags" | "notes">>(list: T[], f: LibraryFilter): T[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return list.filter(
    (m) =>
      (!f.type || m.type === f.type) &&
      (!f.origin || m.origin === f.origin) &&
      (!q || m.title.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)) || (m.notes ?? "").toLowerCase().includes(q)),
  );
}

// ---------- An event's set: an ordered list of material ids ----------

export const MAX_SET = 80;
// Unique, capped; the same item twice in one set is a mistake, not a reprise.
export const normalizeSet = (ids: string[]) => [...new Set(ids.filter((i) => typeof i === "string" && i.length > 0))].slice(0, MAX_SET);
export const addToSet = (ids: string[], id: string) => (ids.includes(id) ? ids : normalizeSet([...ids, id]));
export const removeFromSet = (ids: string[], id: string) => ids.filter((i) => i !== id);
// Move one place up (-1) or down (+1); out of range = unchanged.
export function moveInSet(ids: string[], index: number, by: -1 | 1): string[] {
  const to = index + by;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
// Ids → items in set order; ids no longer in the library drop out.
export function resolveSet<T extends { id: string }>(ids: string[], library: T[]): T[] {
  const byId = new Map(library.map((m) => [m.id, m]));
  return normalizeSet(ids).flatMap((id) => byId.get(id) ?? []);
}
export const setMinutes = (items: Pick<Material, "lengthMin">[]) => items.reduce((s, m) => s + (m.lengthMin ?? 0), 0);
export const untimed = (items: Pick<Material, "lengthMin">[]) => items.filter((m) => m.lengthMin === undefined).length;

// ---------- Kept Tourbo ideas ----------

const norm = (s?: string) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const cityKey = (s?: string) => norm((s ?? "").split(",")[0]);
// The same idea for the same city is one library item, however often it's kept.
export const sameIdea = (a: Source | undefined, b: Source | undefined) => !!a && !!b && norm(a.ref) === norm(b.ref) && cityKey(a.city) === cityKey(b.city);
export function findKept<T extends Pick<Material, "origin" | "source">>(list: T[], source: Source): T | undefined {
  return list.find((m) => m.origin === "local_idea" && sameIdea(m.source, source));
}
// Library fields for a kept idea: its card title, the act's default type, tagged with the city.
export function keptIdeaFields(idea: { idea?: string; ref: string; category?: string }, city: string, kind?: string): MaterialFields {
  const isCover = idea.category === "cover";
  return MaterialFields.parse({
    title: (idea.idea || idea.ref).slice(0, 120),
    type: isCover ? "song" : defaultType(kind),
    kind: PerformerKind.safeParse(kind).success ? kind : undefined,
    origin: "local_idea",
    tags: [city.split(",")[0].trim()].filter(Boolean),
    source: { ref: idea.ref, category: idea.category, city },
  });
}

// ---------- Migration: a saved built set → material + per-city order ----------

// Shape of the saved set this reads (apps/web/server/agent/set.server.ts SavedSet), loosely.
export type SavedSetLike = {
  inputs?: { text?: string };
  build?: { result?: { kind?: string; cities?: { city: string; order: { item?: number; title: string; minutes?: number; move?: string; refs?: string[] }[] }[] } };
};
export type MigratedItem = MaterialFields & { key: string };
export type Migration = { items: MigratedItem[]; cities: { city: string; keys: string[] }[] };

export const materialKey = (m: Pick<MaterialFields, "title" | "origin"> & { source?: Source }) => `${m.origin}|${norm(m.title)}|${cityKey(m.source?.city)}`;

// The act's own lines become originals (once each); "Cover: X" covers; local tags and crowd work
// local ideas for that city. Each city keeps its built order as material keys.
export function migrateSavedSet(saved: SavedSetLike, kindHint?: string): Migration {
  const result = saved.build?.result;
  const kind = result?.kind ?? kindHint;
  const items = new Map<string, MigratedItem>();
  const add = (f: MaterialFields) => {
    const key = materialKey(f);
    if (!items.has(key)) items.set(key, { ...f, key });
    return key;
  };
  const type = defaultType(kind);
  const k = PerformerKind.safeParse(kind).success ? (kind as PerformerKind) : undefined;
  const cities = (result?.cities ?? []).map((c) => {
    const keys = c.order.map((e) => {
      const minutes = Number.isFinite(e.minutes) ? e.minutes : undefined;
      if (e.item !== undefined) return add(MaterialFields.parse({ title: e.title.slice(0, 120), type, kind: k, lengthMin: minutes, origin: "original" }));
      const cover = e.title.match(/^Cover:\s*(.+)$/);
      if (cover) return add(MaterialFields.parse({ title: e.title.slice(0, 120), type: "song", kind: k, lengthMin: minutes, origin: "cover", source: { ref: cover[1].slice(0, 160), category: "cover", city: c.city } }));
      const ref = e.refs?.[0] ?? e.title.replace(/^[^:]+:\s*/, "");
      return add(MaterialFields.parse({ title: e.title.slice(0, 120), type, kind: k, lengthMin: minutes, origin: "local_idea", tags: [c.city.split(",")[0].trim()], source: { ref: ref.slice(0, 160) || e.title.slice(0, 160), city: c.city } }));
    });
    return { city: c.city, keys: normalizeSet(keys) };
  });
  // Lines the act typed but no city used still belong in the library.
  for (const line of (saved.inputs?.text ?? "").split("\n")) {
    const parts = line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "").split(/\s*[|,;]\s*|\s+[—–]\s+/).map((s) => s.trim());
    if (!parts[0]) continue;
    const mins = parts.slice(1).map((p) => p.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes)?$/i)).find(Boolean);
    add(MaterialFields.parse({ title: parts[0].slice(0, 120), type, kind: k, lengthMin: mins ? Number(mins[1]) : undefined, origin: "original" }));
  }
  return { items: [...items.values()], cities };
}
export const sameCity = (a: string, b: string) => cityKey(a) === cityKey(b);

// "Paste a list": one per line, an optional length at the end ("Harbour Lights 4:30", "Paper Moon - 3").
export function readPasted(text: string): { title: string; lengthMin?: number }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((l) => {
      const m = l.match(/^(.*?)[\s,–—-]+(\d{1,2}:[0-5]\d|\d+(?:\.\d+)?\s*(?:m|min|mins)?)$/i);
      const len = m ? readLength(m[2]) : undefined;
      return m && typeof len === "number" ? { title: m[1].trim(), lengthMin: len } : { title: l };
    })
    .filter((x) => x.title.length > 0)
    .map((x) => ({ ...x, title: x.title.slice(0, 120) }));
}
