import type { CityPlan } from "@tourbo/core/shared/types.ts";
import { rampClass } from "~/components/why-compare";
import { cn } from "~/lib/utils";

// The tour's cities ranked by fan score: one glance says which is the better location.
export function FanRanking({ stops }: { stops: CityPlan[] }) {
  const ranked = [...stops].sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  return (
    <div className="flex h-full flex-col rounded-xl bg-card p-4 ring-1 ring-border" data-testid="fan-ranking">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fans by city</p>
      <ol className="mt-3 space-y-2.5">
        {ranked.map((s, i) => (
          <li key={s.city.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
            <span className={cn("flex items-center gap-2 truncate", i === 0 && "font-semibold")}>
              {s.city.name}
              {i === 0 && <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-foreground">Strongest</span>}
              {s.thinData && <span className="text-xs font-normal text-muted-foreground">thin data</span>}
            </span>
            <span className={cn("num text-right", i === 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.score}</span>
            <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", rampClass(s.score))} style={{ width: `${s.score}%` }} />
            </span>
          </li>
        ))}
      </ol>
      <details className="mt-auto pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">why?</summary>
        <ul className="mt-1.5 space-y-0.5">
          {ranked.map((s) => (
            <li key={s.city.name}>
              {s.city.name}: score {s.score}
              {s.fanIndex !== undefined && `, fan index ${s.fanIndex}`}
              {s.hotspots[0] && `, top hotspot affinity ${Math.round(s.hotspots[0].affinity * 100) / 100}`}
            </li>
          ))}
        </ul>
        <p className="mt-1.5">Fan heatmaps: how many of your fans live there and how strongly the city leans to you, relative to the other cities scored.</p>
      </details>
    </div>
  );
}
