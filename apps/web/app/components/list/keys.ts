import { useEffect, useRef } from "react";

// Single-key page shortcuts ("/" search, "n" new), ignored while typing or inside a menu.
export function useKey(key: string, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=dialog]")) return;
      if (e.key.toLowerCase() !== key) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [key]);
}
