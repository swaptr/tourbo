import type { AudienceSide } from "@tourbo/core/context/audience.ts";
import { ageBars } from "~/lib/analytics";
import { DivergingBars, Key } from "./bars";

// Who's in the room: each age band over- (cobalt, right) or under-represented (tomato, left)
// against the average, from the fan data's audience profile. Gender is one plain line.
export function AudienceBars({ side, title }: { side: AudienceSide; title?: string }) {
  const { bars, gender } = ageBars(side);
  const fmt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
  return (
    <div className="space-y-2" data-testid="audience-bars">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <DivergingBars bars={bars.map((b) => ({ label: b.label, value: b.value, display: fmt(b.value), tip: `${b.label}: ${b.value >= 0 ? "more" : "fewer"} than usual (fan data)` }))} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Key color="var(--viz-2)" label="More than usual" />
        <Key color="var(--viz-1)" label="Fewer than usual" />
        <span className="text-xs text-muted-foreground">Gender: {gender}.</span>
      </div>
    </div>
  );
}
