import { useCallback, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";

// One hover/focus tooltip per chart (dataviz skill: the mark is the hit target; value leads,
// label follows; same on keyboard focus as on hover). Put `ref` on a `relative` container and
// spread `bind(value, label)` on each mark; render `tip` inside the container.
type Tip = { x: number; y: number; value: string; label: string };

export function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback((el: Element, value: string, label: string) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - box.left + r.width / 2, 72), Math.max(72, box.width - 72));
    setTip({ x, y: r.top - box.top, value, label });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const bind = (value: string, label: string) => ({
    tabIndex: 0,
    role: "img", // a labelled data mark (aria-label needs a role)
    "aria-label": `${label}: ${value}`,
    onPointerEnter: (e: PointerEvent) => show(e.currentTarget, value, label),
    onPointerLeave: hide,
    onFocus: (e: FocusEvent) => show(e.currentTarget, value, label),
    onBlur: hide,
  });
  const node: ReactNode = tip && (
    <div
      role="tooltip"
      style={{ left: tip.x, top: tip.y }}
      className="pointer-events-none absolute z-20 max-w-60 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <div className="font-semibold">{tip.value}</div>
      <div className="text-muted-foreground">{tip.label}</div>
    </div>
  );
  return { ref, bind, tip: node };
}

// Hover lift shared by every mark: focus ring + slight lighten.
export const markClass = "outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring";
