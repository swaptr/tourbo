import type { ShouldRevalidateFunctionArgs } from "react-router";
import { useEffect, useState } from "react";

// View-only search params on the tour workspace (PLAN Q21): which night is picked and which
// side-panel tab is open. Changing them never refetches anything.
const VIEW = ["night", "panel"];

const withoutView = (u: URL) => {
  const s = new URLSearchParams(u.search);
  for (const k of VIEW) s.delete(k);
  s.sort();
  return s.toString();
};

// For every /plan/:id route: skip loaders when only ?night / ?panel changed. Submissions and
// explicit revalidate() (same URL) keep the default.
export function keepOnViewChange({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod.toUpperCase() !== "GET") return defaultShouldRevalidate;
  if (currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search && withoutView(currentUrl) === withoutView(nextUrl)) return false;
  return defaultShouldRevalidate;
}

// The night picked in the nights rail, at once: the URL (?night=) follows a moment later (a router
// transition), so main-pane tabs that show one night listen for this too.
const NIGHT_PICKED = "tourbo:night-picked";
export const announceNight = (night: number) => window.dispatchEvent(new CustomEvent(NIGHT_PICKED, { detail: night }));
export function usePickedNight(fromUrl: string | null): number {
  const [picked, setPicked] = useState<{ night: number; url: string | null }>();
  useEffect(() => {
    const on = (e: Event) => setPicked({ night: (e as CustomEvent<number>).detail, url: fromUrl });
    window.addEventListener(NIGHT_PICKED, on);
    return () => window.removeEventListener(NIGHT_PICKED, on);
  }, [fromUrl]);
  // Once the URL moves on, it wins again.
  return picked && picked.url === fromUrl ? picked.night : Number(fromUrl) || 1;
}

// The main pane asks the workspace to pick a night (the Ideas tab's tour grid): the panel opens
// on it (as a sheet on a phone when open), with the idea category in view.
const PICK_NIGHT = "tourbo:pick-night";
export type NightPick = { night: number; category?: string; open?: boolean };
export const pickNight = (p: NightPick) => window.dispatchEvent(new CustomEvent(PICK_NIGHT, { detail: p }));
export function onPickNight(fn: (p: NightPick) => void) {
  const on = (e: Event) => fn((e as CustomEvent<NightPick>).detail);
  window.addEventListener(PICK_NIGHT, on);
  return () => window.removeEventListener(PICK_NIGHT, on);
}
