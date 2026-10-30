import { useEffect, type RefObject } from "react";

// While `active`, everything outside `ref` is inert (no focus, no clicks, hidden from screen
// readers): a sheet or full-screen panel behaves as a modal without moving its DOM (WCAG 2.4.3,
// 2.4.11). Portals opened later from inside the panel are new <body> children, so they stay live.
// Siblings marked data-inert-keep (a backdrop that closes the sheet) or role="dialog" stay live.
// Focus moves into the panel (give it tabIndex={-1}) and returns to the opener when it closes.
export function useInertOutside(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const made: HTMLElement[] = [];
    const opener = document.activeElement instanceof HTMLElement && !el.contains(document.activeElement) ? document.activeElement : null;
    for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
      for (const sib of node.parentElement?.children ?? []) {
        if (sib === node || !(sib instanceof HTMLElement) || sib.inert || sib.tagName === "SCRIPT" || sib.dataset.inertKeep !== undefined || sib.getAttribute("role") === "dialog") continue;
        sib.inert = true;
        made.push(sib);
      }
    }
    if (opener) el.focus({ preventScroll: true });
    return () => {
      made.forEach((s) => (s.inert = false));
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) opener.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
