import { useEffect, useId, useRef, useState } from "react";

import type { ScoreWhy } from "@tourbo/core/examples/types.ts";
import { cn } from "~/lib/utils";

// Every number explains itself: hover or focus shows why, tap toggles on touch, Esc or a tap
// outside closes. One small popover, placed above unless there's no room.
export function Explain({ children, why, className, label }: { children: React.ReactNode; why: React.ReactNode; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const r = ref.current?.getBoundingClientRect();
    setBelow(!!r && r.top < 180);
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className={cn("relative inline-flex", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-[3px]"
        aria-describedby={open ? id : undefined}
        aria-label={label}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute left-1/2 z-50 w-72 max-w-[80vw] -translate-x-1/2 rounded-md border border-[var(--globe-coast)] bg-background p-3 text-left text-xs font-normal text-foreground normal-case shadow-md",
            below ? "top-full mt-2" : "bottom-full mb-2",
          )}
        >
          {why}
        </span>
      )}
    </span>
  );
}

// "Why is fan strength 92?": the plain line, then reach and lean as two bars that add up to the score.
export const REACH_WEIGHT = 0.6;
export function ScoreWhyView({ score, why }: { score: number; why: ScoreWhy }) {
  const reach = why.reach * REACH_WEIGHT;
  const lean = why.pull * (1 - REACH_WEIGHT);
  return (
    <span className="grid gap-2">
      <span>{why.line}</span>
      <span className="grid gap-1">
        <span className="relative block h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="absolute inset-0 origin-left bg-score-3" style={{ transform: `scaleX(${(reach + lean) / 100})` }} />
          <span className="absolute inset-0 origin-left bg-score-2" style={{ transform: `scaleX(${reach / 100})` }} />
        </span>
        <span className="flex flex-wrap justify-between gap-x-3 text-muted-foreground">
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-score-2" aria-hidden />
            How many fans <span className="num text-foreground">{Math.round(reach)}</span>
          </span>
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-score-3" aria-hidden />
            How much it leans <span className="num text-foreground">{Math.round(lean)}</span>
          </span>
          <span>
            = <span className="num font-medium text-foreground">{Math.round(score)}</span>
          </span>
        </span>
        <span className="text-muted-foreground">
          Ranked {why.rank} of {why.of} nearby cities.
        </span>
      </span>
    </span>
  );
}

// Fan strength with its explanation, or the bare number when there is no breakdown.
export function FanStrength({ value, why }: { value: number; why?: ScoreWhy }) {
  const n = <span className="num">{Math.round(value)}</span>;
  return why ? (
    <Explain why={<ScoreWhyView score={value} why={why} />} label={`Fan strength ${Math.round(value)}, why?`}>
      {n}
    </Explain>
  ) : (
    n
  );
}
