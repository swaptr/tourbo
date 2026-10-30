import type { AssistEvidence, AssistSource } from "@tourbo/core/assist/assist.ts";
import { Hint } from "~/components/hint";
import { FactChip } from "~/components/insight";
import { cn } from "~/lib/utils";

// Vendor-neutral words for where a draft came from (never the provider or model).
export const SOURCE_LABEL: Record<AssistSource, string> = {
  "fan data": "From fan data",
  ai: "Drafted by your AI assistant",
  rules: "Tourbo's draft",
};
const ORIGIN: Record<AssistEvidence["source"], string> = { "fan data": "Fan data", "your text": "Your text", rules: "Tourbo" };

// The facts under a draft: fan data first as chips (hedged ones dashed), then one "why?" with the
// detail behind each. Nothing when there is no evidence.
export function EvidenceChips({ evidence, max = 3, className }: { evidence: AssistEvidence[]; max?: number; className?: string }) {
  if (!evidence.length) return null;
  const sorted = [...evidence].sort((a, b) => rank(a) - rank(b));
  const shown = sorted.slice(0, max);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((e, i) => (
        <FactChip key={`${e.label}-${i}`} text={e.label} hedged={e.hedged || e.source !== "fan data"} />
      ))}
      {shown.length > 0 && sorted.length > shown.length && <span className="num text-xs text-muted-foreground">+{sorted.length - shown.length}</span>}
      {sorted.some((e) => e.detail) && (
        <Hint text="why?" label="Why this draft">
          <ul className="grid gap-2">
            {sorted.map((e, i) => (
              <li key={`${e.label}-${i}`} className="grid gap-0.5">
                <span className="font-medium text-foreground">{e.label}</span>
                {e.detail && <span>{e.detail}</span>}
                <span className="text-muted-foreground">{ORIGIN[e.source]}{e.hedged ? " · a hint, check it" : ""}</span>
              </li>
            ))}
          </ul>
        </Hint>
      )}
    </div>
  );
}

const rank = (e: AssistEvidence) => (e.source === "fan data" ? 0 : e.source === "your text" ? 1 : 2) + (e.hedged ? 0.5 : 0);
