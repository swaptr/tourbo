// Type-only import of the schema module: its validation library stays off the first load.
import type { Profile, ProfileFields } from "@tourbo/core/profiles/profile.ts";
import { readProfileLoose } from "@tourbo/core/profiles/rules.ts";

// The act profile in this browser (PLAN Q21): localStorage "tourbo:profile" holds the fields,
// the server id and the owner key (sent as X-Owner-Key on saves). Skipping onboarding stores an
// empty profile marked `skipped`, so the next visit lands on the workspace, not the form.

export type LocalProfile = Profile & { ownerKey?: string; skipped?: boolean };

const KEY = "tourbo:profile";
const EVENT = "tourbo:profile";
const browser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

export function loadProfile(): LocalProfile | undefined {
  if (!browser()) return undefined;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as (LocalProfile & { kind?: string }) | null;
    if (!raw) return undefined;
    const p = readProfileLoose(raw);
    return p && { ...p, ownerKey: typeof raw.ownerKey === "string" ? raw.ownerKey : undefined, skipped: raw.skipped === true };
  } catch {
    return undefined;
  }
}

export function storeProfile(p: LocalProfile) {
  if (!browser()) return;
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(EVENT));
}

export function forgetProfile() {
  if (!browser()) return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeProfile(cb: () => void) {
  if (!browser()) return () => {};
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

// Save to the server (create on first save, then update with the owner key) and keep it here.
// The local copy is saved first, so a server hiccup never loses the answers.
export async function saveProfile(fields: ProfileFields): Promise<LocalProfile> {
  const old = loadProfile();
  const local: LocalProfile = { ...old, ...fields, skipped: false };
  storeProfile(local);
  const res = await fetch(old?.id ? `/api/profile/${old.id}` : "/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json", ...(old?.ownerKey ? { "X-Owner-Key": old.ownerKey } : {}) },
    body: JSON.stringify(fields),
  });
  const body = (await res.json().catch(() => ({}))) as { profile?: Profile; ownerKey?: string; error?: string };
  if (!res.ok || !body.profile) throw new Error(body.error ?? "Your profile didn't save. Try again in a moment.");
  const saved: LocalProfile = { ...body.profile, ownerKey: body.ownerKey ?? old?.ownerKey, skipped: false };
  storeProfile(saved);
  return saved;
}

export function skipProfile() {
  const old = loadProfile();
  storeProfile({ listed: true, peers: [], styles: [], kinds: [], ...old, skipped: true });
}

export const profileHeaders = (p?: LocalProfile): Record<string, string> => (p?.ownerKey ? { "X-Owner-Key": p.ownerKey } : {});
