import type { Profile } from "./profile.ts";

// Profile rules without the validation library (it stays off the home page's first load):
// fields, what each action needs, and a loose reader for this browser's own stored copy.

// Old single-kind profiles ({ kind }) read as kinds: [kind].
export const migrate = (v: unknown) => {
  if (!v || typeof v !== "object") return v;
  const o = v as { kind?: unknown; kinds?: unknown };
  if (Array.isArray(o.kinds) && o.kinds.length) return v;
  return { ...o, kinds: typeof o.kind === "string" ? [o.kind] : [] };
};

// One onboarding step per field group; the order is the order the steps are shown in.
export const FIELDS = ["kind", "name", "home"] as const;
export type Field = (typeof FIELDS)[number];

export type Action = "tour" | "event" | "ideas";
// The only gate (Q21): what each action needs from the profile before it can start. Kind is never
// on it (the tour / event form asks "What sort of show is this?"). An event's city is the event
// form's own required field (pre-filled with the home base when there is one).
export const REQUIRED: Record<Action, readonly Field[]> = {
  tour: ["name", "home"],
  event: ["name"],
  ideas: ["name"],
};

// One plain line per missing field, shown above the step that asks for it.
export const WHY: Record<Action, Partial<Record<Field, string>>> = {
  tour: {
    name: "Tourbo needs your name to find where your fans are.",
    home: "Tourbo needs your home base to plan the route.",
  },
  event: { name: "Tourbo needs your name to find where your fans are." },
  ideas: { name: "Tourbo needs your name to find what your fans like." },
};

export function has(p: Partial<Profile> | null | undefined, f: Field): boolean {
  if (!p) return false;
  if (f === "kind") return (p.kinds?.length ?? 0) > 0;
  if (f === "home") return !!p.home?.name && Number.isFinite(p.home.lat) && Number.isFinite(p.home.lon);
  // A name counts once Tourbo knows how to plan for it: listed, or an unlisted act with a way in.
  const name = (p.name ?? "").trim();
  if (name.length < 2) return false;
  if (p.listed !== false) return true;
  return p.basis === "city" || (p.basis === "peers" && (p.peers?.length ?? 0) > 0) || (p.basis === "styles" && (p.styles?.length ?? 0) > 0);
}

// Missing fields for an action (in step order); no action = everything onboarding asks.
export function missingFor(p: Partial<Profile> | null | undefined, action?: Action): Field[] {
  const need = action ? REQUIRED[action] : FIELDS;
  return FIELDS.filter((f) => need.includes(f) && !has(p, f));
}

// The main kind (pre-picked on new tours / events), and the kinds offered as chips.
export const mainKind = (p: Partial<Profile> | null | undefined) => p?.kinds?.[0];

export const isComplete = (p: Partial<Profile> | null | undefined) => missingFor(p).length === 0;
export const canDo = (p: Partial<Profile> | null | undefined, action: Action) => missingFor(p, action).length === 0;

// This browser's stored copy, read without schema validation (the server validated it on save).
// Same shape and defaults as readProfile; unknown or malformed fields are dropped.
const BASES = ["act", "peers", "styles", "city"] as const;
const chips = (v: unknown) =>
  (Array.isArray(v) ? v : []).filter((c): c is { id: string; name: string; type?: string } => !!c && typeof c.id === "string" && typeof c.name === "string").slice(0, 3);
export function readProfileLoose(raw: unknown): Profile | undefined {
  const o = migrate(raw) as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return undefined;
  const h = o.home as { name?: unknown; lat?: unknown; lon?: unknown } | undefined;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : undefined;
  const basis = BASES.find((b) => b === o.basis);
  const home = h && typeof h.name === "string" && h.name && typeof h.lat === "number" && typeof h.lon === "number" ? { name: h.name, lat: h.lat, lon: h.lon } : undefined;
  return {
    ...(name !== undefined && { name }),
    kinds: (Array.isArray(o.kinds) ? o.kinds : []).filter((k): k is Profile["kinds"][number] => typeof k === "string").slice(0, 18),
    listed: typeof o.listed === "boolean" ? o.listed : true,
    ...(basis && { basis }),
    peers: chips(o.peers),
    styles: chips(o.styles),
    ...(home && { home }),
    id: typeof o.id === "string" ? o.id : undefined,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  };
}
