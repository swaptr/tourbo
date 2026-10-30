import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { markClass, useTip } from "./tip";

// Horizontal bars in plain HTML (responsive without measuring): label | track | value.
// Dataviz specs: ≤ 24 px thick (20 px here), 4 px rounded data end, square at the baseline,
// one hairline baseline, text in text tokens (never the series colour), value outside the bar.
export type Bar = {
  label: string;
  value: number;
  display: string; // the value as printed at the end of the row
  tip?: string; // tooltip label (defaults to label)
  color?: string; // CSS colour (theme var); default var(--viz-1)
  dim?: boolean; // context (greyed), e.g. a dropped night
  sub?: string; // small second line under the label
};

function Row({ bar, children, label }: { bar: Bar; children: ReactNode; label?: ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(5.5rem,8.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_auto]">
      <span className={cn("min-w-0 text-sm leading-tight", bar.dim && "text-muted-foreground")}>
        <span className="block truncate">{label ?? bar.label}</span>
        {bar.sub && <span className="block truncate text-xs text-muted-foreground">{bar.sub}</span>}
      </span>
      {children}
      <span className={cn("num text-right text-sm font-medium whitespace-nowrap", bar.dim && "font-normal text-muted-foreground")}>{bar.display}</span>
    </li>
  );
}

// Ranked bars on one zero baseline (magnitude).
export function RankedBars({ bars, max, testId }: { bars: Bar[]; max?: number; testId?: string }) {
  const { ref, bind, tip } = useTip();
  const top = max ?? Math.max(1, ...bars.map((b) => b.value));
  return (
    <div ref={ref} className="relative">
      <ul className="space-y-2" data-testid={testId}>
        {bars.map((b, i) => (
          <Row key={i} bar={b}>
            <span className="relative flex h-5 items-center border-l border-border">
              <span
                {...bind(b.display, b.tip ?? b.label)}
                data-bar=""
                className={cn("h-5 min-w-0.5 rounded-r-[4px]", markClass)}
                style={{ width: `${Math.max(0.5, (b.value / top) * 100)}%`, background: b.dim ? "var(--viz-0)" : (b.color ?? "var(--viz-1)"), opacity: b.dim ? 0.45 : undefined }}
              />
            </span>
          </Row>
        ))}
      </ul>
      {tip}
    </div>
  );
}

// Above/below zero (polarity): gains right in --viz-2, losses left in --viz-1, grey zero line.
export function DivergingBars({ bars, testId }: { bars: Bar[]; testId?: string }) {
  const { ref, bind, tip } = useTip();
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  // All gains (or all losses): one side only, so the bars use the full width.
  const oneSided = bars.every((b) => b.value >= 0) ? "gain" : bars.every((b) => b.value < 0) ? "loss" : undefined;
  const span = oneSided ? 100 : 50;
  const zero = oneSided === "gain" ? "0%" : oneSided === "loss" ? "100%" : "50%";
  return (
    <div ref={ref} className="relative">
      <ul className="space-y-2" data-testid={testId}>
        {bars.map((b, i) => {
          const w = `${Math.max(0.5, (Math.abs(b.value) / max) * span)}%`;
          const gain = b.value >= 0;
          return (
            <Row key={i} bar={b}>
              <span className="relative h-5">
                <span className="absolute inset-y-[-4px] w-px bg-border" style={{ left: zero }} aria-hidden />
                <span
                  {...bind(b.display, b.tip ?? b.label)}
                  data-bar=""
                  className={cn("absolute top-0 h-5", gain ? "rounded-r-[4px]" : "rounded-l-[4px]", markClass)}
                  style={{ width: w, ...(gain ? { left: zero } : { right: `calc(100% - ${zero})` }), background: b.dim ? "var(--viz-0)" : gain ? "var(--viz-2)" : "var(--viz-1)", opacity: b.dim ? 0.45 : undefined }}
                />
              </span>
            </Row>
          );
        })}
      </ul>
      {tip}
    </div>
  );
}

// Legend chip: a swatch that mirrors the mark (rect for bars, line for lines, dot for dots).
export function Key({ color, label, shape = "rect", dim }: { color: string; label: string; shape?: "rect" | "line" | "dot" | "ring"; dim?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn(shape === "rect" && "h-2.5 w-3 rounded-[2px]", shape === "line" && "h-0.5 w-4 rounded-full", shape === "dot" && "size-2.5 rounded-full", shape === "ring" && "size-3 rounded-full border-2")}
        style={shape === "ring" ? { borderColor: color } : { background: color, opacity: dim ? 0.45 : undefined }}
      />
      {label}
    </span>
  );
}
