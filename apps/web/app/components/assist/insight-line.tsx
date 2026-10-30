import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { EvidenceChips } from "./evidence";
import { useRowInsight } from "./use-assist";

// One line of fan-data insight under a tour or show row ("Austin fans over-index 3.1×; Tulsa is
// the softest (41)."), from its saved plan. Rows on screen share one request. No plan, no line:
// renders nothing (or `fallback`), never an error in a list.
export function InsightLine({ runId, fallback, chips = false, className }: { runId?: string; fallback?: React.ReactNode; chips?: boolean; className?: string }) {
  const e = useRowInsight(runId);
  if (!runId || e.status === "none" || e.status === "error") return fallback ? <>{fallback}</> : null;
  if (e.status === "loading" || !e.row) return <Skeleton className={cn("h-3.5 w-56 max-w-full", className)} aria-label="Reading fan data" />;
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="min-w-0 truncate text-foreground/80" title={e.row.line}>
        {e.row.line}
      </span>
      {chips ? <EvidenceChips evidence={e.row.evidence} max={2} /> : <EvidenceChips evidence={e.row.evidence} max={0} />}
    </div>
  );
}
