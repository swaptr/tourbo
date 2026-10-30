import { cn } from "~/lib/utils";
import { markClass, useTip } from "./tip";

// Headline numbers (stat tiles): label, value, optional one-line note. Proportional figures.
export function StatRow({ stats }: { stats: { label: string; value: string; note?: string; tone?: "gain" | "loss" }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="stat-row">
      {stats.map((s) => (
        <div key={s.label} className="min-w-0 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
          <dt className="text-xs text-muted-foreground">{s.label}</dt>
          <dd className="mt-0.5 truncate font-heading text-3xl leading-tight">{s.value}</dd>
          {s.note && <dd className={cn("text-xs", s.tone === "loss" ? "text-destructive" : "text-muted-foreground")}>{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

// Meter: one ratio against a limit. Fill = costs, track = a lighter step of the same hue;
// past 100% the overflow shows as a second segment in the loss colour.
export function Meter({ share, label, fillLabel, restLabel }: { share: number; label: string; fillLabel: string; restLabel: string }) {
  const { ref, bind, tip } = useTip();
  const pct = Math.max(0, share) * 100;
  const fill = Math.min(100, pct);
  return (
    <div ref={ref} className="relative space-y-2">
      <div className="flex h-7 w-full gap-0.5" role="img" aria-label={label}>
        <span
          {...bind(fillLabel, "Costs")}
          className={cn("h-full rounded-l-[4px]", fill >= 100 && "rounded-r-[4px]", markClass)}
          style={{ width: `${fill}%`, background: share > 1 ? "var(--viz-1)" : "var(--viz-2)" }}
        />
        {fill < 100 && (
          <span
            {...bind(restLabel, "You keep")}
            className={cn("h-full flex-1 rounded-r-[4px]", markClass)}
            style={{ background: "color-mix(in oklab, var(--viz-2) 22%, var(--card))" }}
          />
        )}
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-[2px]" style={{ background: share > 1 ? "var(--viz-1)" : "var(--viz-2)" }} aria-hidden />
          Costs · {fillLabel}
        </span>
        {fill < 100 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-[2px]" style={{ background: "color-mix(in oklab, var(--viz-2) 22%, var(--card))" }} aria-hidden />
            You keep · {restLabel}
          </span>
        )}
      </div>
      {tip}
    </div>
  );
}
