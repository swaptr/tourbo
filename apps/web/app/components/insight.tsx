import type { ReactNode } from "react";

import type { ExplainItem } from "@tourbo/core/engine/explain.ts";
import { Hint } from "~/components/hint";
import { FactList, WhyLine } from "~/components/why-line";
import { rampClass } from "~/components/why-compare";
import { cn } from "~/lib/utils";

// Inline insight for any suggestion (night card, idea tile, set move, deal): the fan data first as
// a small fact chip with a meter, then (strong evidence only) one grounded "why" sentence.
//   strong → chip + why line;  some → hedged chip only;  none → just the suggestion.
// The item comes from @tourbo/core/engine/explain-facts.ts (nightItems, dealItems, ideaItem,
// setMoveItem, takeawayItem). Pass runId so the sentence is saved with the plan.
export function Insight({ item, runId, suggestion, why = true, className }: { item: ExplainItem; runId?: string; suggestion?: ReactNode; why?: boolean; className?: string }) {
  if (item.evidence === "none" || !item.chip) return suggestion ? <>{suggestion}</> : null;
  return (
    <div className={cn("grid gap-1", className)}>
      {suggestion}
      <span className="flex flex-wrap items-center gap-2">
        <FactChip text={item.chip.text} meter={item.chip.meter} hedged={item.chip.hedged} />
        {item.evidence === "some" && (
          <Hint label={`The numbers behind ${item.subject}`}>
            <FactList item={item} />
          </Hint>
        )}
      </span>
      {why && item.evidence === "strong" && <WhyLine runId={runId} items={[item]} />}
    </div>
  );
}

export function FactChip({ text, meter, hedged, className }: { text: string; meter?: number; hedged?: boolean; className?: string }) {
  const m = meter === undefined ? undefined : Math.max(0.03, Math.min(1, meter));
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
        hedged ? "border-dashed text-muted-foreground" : "border-border bg-muted/50 font-medium text-foreground",
        className,
      )}
    >
      {m !== undefined && (
        <span className="h-1.5 w-8 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className={cn("block h-full w-full origin-left rounded-full", hedged ? "bg-muted-foreground/40" : rampClass(m * 100))} style={{ transform: `scaleX(${m})` }} />
        </span>
      )}
      <span className="num">{text}</span>
    </span>
  );
}
