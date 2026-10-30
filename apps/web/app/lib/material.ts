import { keptIdeaFields, type Material, type MaterialFields } from "@tourbo/core/material/material.ts";
import { ShownError } from "~/components/state";
import { loadProfile, profileHeaders, saveProfile, storeProfile, type LocalProfile } from "~/lib/profile";
import { ownerKeyFor } from "~/lib/work";

// Browser side of the act's material (PLAN Q21). Material belongs to the act profile; a browser
// that skipped onboarding gets a profile row (with whatever it has) on the first save.

const JSON_HEADERS = { "content-type": "application/json" };

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ShownError("You look offline. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; field?: string };
  if (!res.ok) throw Object.assign(new ShownError(body.error ?? fallback), { field: body.field });
  return body;
}

// The profile that owns this browser's material, created (empty if need be) when missing.
export async function ensureProfile(): Promise<LocalProfile> {
  const p = loadProfile();
  if (p?.id && p.ownerKey) return p;
  if (p?.id && !p.ownerKey) throw new ShownError("Only the browser that made your profile can change your material. Open Tourbo there, or import your work.");
  const saved = await saveProfile({ name: p?.name, kinds: p?.kinds ?? [], listed: p?.listed ?? true, basis: p?.basis, peers: p?.peers ?? [], styles: p?.styles ?? [], home: p?.home });
  // Creating the row for material doesn't count as finishing onboarding.
  if (p?.skipped) storeProfile({ ...saved, skipped: true });
  return saved;
}

export async function listMaterial(profileId: string): Promise<Material[]> {
  const { items } = await call<{ items: Material[] }>("/api/material", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ profileId }) }, "Your material didn't load. Try again in a moment.");
  return items;
}

export async function createMaterial(fields: MaterialFields): Promise<Material> {
  const p = await ensureProfile();
  const { material } = await call<{ material: Material }>(
    "/api/material",
    { method: "POST", headers: { ...JSON_HEADERS, ...profileHeaders(p) }, body: JSON.stringify({ profileId: p.id, material: fields }) },
    "That didn't save. Try again in a moment.",
  );
  return material;
}

export async function updateMaterial(id: string, fields: MaterialFields): Promise<Material> {
  const { material } = await call<{ material: Material }>(
    `/api/material/${id}`,
    { method: "POST", headers: { ...JSON_HEADERS, ...profileHeaders(loadProfile()) }, body: JSON.stringify({ material: fields }) },
    "That didn't save. Try again in a moment.",
  );
  return material;
}

export async function deleteMaterial(id: string): Promise<void> {
  await call(`/api/material/${id}`, { method: "DELETE", headers: profileHeaders(loadProfile()) }, "That didn't delete. Try again in a moment.");
}

// "Keep" on a Tourbo idea → the library, as a local idea for that city (once).
export async function keepIdeaAsMaterial(idea: { idea?: string; ref: string; category?: string }, city: string, kind?: string): Promise<{ material: Material; existed: boolean }> {
  const p = await ensureProfile();
  return call(
    "/api/material",
    { method: "POST", headers: { ...JSON_HEADERS, ...profileHeaders(p) }, body: JSON.stringify({ profileId: p.id, keep: keptIdeaFields(idea, city, kind) }) },
    "That idea didn't save to your material. Try again.",
  );
}

export type EventSetReply = { set: Material[]; minutes: number; length: string };

export const getEventSet = (eventId: string) => call<EventSetReply>(`/api/events/${eventId}/set`, { headers: { accept: "application/json" } }, "The set didn't load. Try again in a moment.");

// A tour night's key is its tour's (the night's row carries the tour's owner hash).
export function saveEventSet(eventId: string, ids: string[], tourId?: string): Promise<EventSetReply> {
  const key = ownerKeyFor(tourId ?? eventId) ?? ownerKeyFor(eventId);
  return call(`/api/events/${eventId}/set`, { method: "PUT", headers: { ...JSON_HEADERS, ...(key ? { "X-Owner-Key": key } : {}) }, body: JSON.stringify({ ids }) }, "The set didn't save. Try again in a moment.");
}
