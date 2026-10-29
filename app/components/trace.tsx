import { Brain, Database, LifeBuoy, ShieldCheck, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import type { TraceEvent } from "../../server/core/shared/types";

const KINDS: Record<TraceEvent["kind"], { icon: LucideIcon; label: string; className: string }> = {
  thinking_summary: { icon: Brain, label: "thinking", className: "text-violet-600 dark:text-violet-400" },
  tool_call: { icon: Wrench, label: "tool", className: "text-sky-600 dark:text-sky-400" },
  qloo_call: { icon: Database, label: "qloo", className: "text-emerald-600 dark:text-emerald-400" },
  repair: { icon: LifeBuoy, label: "repair", className: "text-amber-600 dark:text-amber-400" },
  critic: { icon: ShieldCheck, label: "critic", className: "text-rose-600 dark:text-rose-400" },
  decision: { icon: Sparkles, label: "decision", className: "text-foreground" },
};

// Qloo numbers worth surfacing as chips.
const CHIP_KEYS = ["cells", "results", "popularity", "cacheRead"] as const;

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
    typeof data[key] === "number" ? [`${key} ${formatNumber(data[key] as number)}`] : [],
  );
  if (typeof data.step === "string") chips.push(data.step);
  const issues = Array.isArray(data.issues) ? (data.issues as { city?: string; detail: string }[]) : [];
  const input = event.kind === "tool_call" ? (data.input as Record<string, unknown> | undefined) : undefined;

  return (
    <li className={cn("flex gap-2", data.error === true && "text-destructive")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", kind.className)} aria-label={kind.label} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "break-words",
            event.kind === "thinking_summary" && "line-clamp-4 text-muted-foreground italic",
            event.kind === "tool_call" && "font-mono text-xs",
          )}
          title={event.kind === "thinking_summary" ? event.message : undefined}
        >
          {event.message}
          {input && Object.keys(input).length > 0 && (
            <span className="text-muted-foreground"> {JSON.stringify(input)}</span>
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
                {issue.detail}
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
        "inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
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
