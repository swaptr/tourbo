import { Brain, Database, LifeBuoy, ShieldCheck, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { neutral } from "~/lib/neutral";
import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import type { TraceEvent } from "@tourbo/core/shared/types.ts";

const KINDS: Record<TraceEvent["kind"], { icon: LucideIcon; label: string; className: string }> = {
  thinking_summary: { icon: Brain, label: "thinking", className: "text-chart-5" },
  tool_call: { icon: Wrench, label: "tool", className: "text-info" },
  qloo_call: { icon: Database, label: "fan data", className: "text-success" },
  repair: { icon: LifeBuoy, label: "repair", className: "text-warning" },
  critic: { icon: ShieldCheck, label: "critic", className: "text-primary " },
  decision: { icon: Sparkles, label: "decision", className: "text-foreground" },
};

// Fan-data numbers worth surfacing as chips.
const CHIP_KEYS = ["cells", "results", "popularity", "cacheRead"] as const;
const CHIP_LABEL: Record<(typeof CHIP_KEYS)[number], string> = { cells: "fan areas", results: "results", popularity: "popularity", cacheRead: "cached" };

export function Trace({ events, live }: { events: TraceEvent[]; live: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live) end.current?.scrollIntoView({ block: "nearest" });
  }, [events.length, live]);

  return (
    <ol className="space-y-1.5 text-sm">
      {events.map((event) => (
        <TraceRow key={event.seq} event={event} />
      ))}
      <div ref={end} />
    </ol>
  );
}

function TraceRow({ event }: { event: TraceEvent }) {
  const kind = KINDS[event.kind];
  const Icon = kind.icon;
  const data = event.data ?? {};
  const chips = CHIP_KEYS.flatMap((key) =>
    typeof data[key] === "number" ? [`${CHIP_LABEL[key]} ${formatNumber(data[key] as number)}`] : [],
  );
  if (typeof data.step === "string") chips.push(neutral(data.step));
  const issues = Array.isArray(data.issues) ? (data.issues as { city?: string; detail: string }[]) : [];
  const input = event.kind === "tool_call" ? (data.input as Record<string, unknown> | undefined) : undefined;

  return (
    <li className={cn("flex gap-2", data.error === true && "text-destructive")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", kind.className)} aria-label={kind.label} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "[overflow-wrap:anywhere]",
            event.kind === "thinking_summary" && "line-clamp-4 text-muted-foreground italic",
            event.kind === "tool_call" && "text-xs",
          )}
          title={event.kind === "thinking_summary" ? neutral(event.message) : undefined}
        >
          {neutral(event.message)}
          {input && Object.keys(input).length > 0 && (
            <span className="text-muted-foreground"> {neutral(JSON.stringify(input))}</span>
          )}
        </p>
        {chips.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </div>
        )}
        {issues.length > 0 && (
          <ul className="mt-0.5 list-disc pl-4 text-xs text-muted-foreground">
            {issues.map((issue, i) => (
              <li key={i}>
                {issue.city && <span className="font-medium text-foreground">{issue.city}: </span>}
                {neutral(issue.detail)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground num",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function formatNumber(n: number) {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2);
}
