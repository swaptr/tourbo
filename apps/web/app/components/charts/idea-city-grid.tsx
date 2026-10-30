import { useState } from "react";

import type { CityIdeas, RegionIdea } from "@tourbo/core/engine/ideas-rank.ts";
import { Hint } from "~/components/hint";
import { ScrollArea } from "~/components/ui/scroll-area";
import { heat, ideaGrid } from "~/lib/analytics";
import { cn } from "~/lib/utils";
import { markClass, useTip } from "./tip";

// Ideas × cities heat grid: every cell is that idea's fit in that city, shaded and sized on one
// sequential ramp (the fan ramp, score-1..4), so the size still reads without colour; the
// best city per idea wears a ring. Values on hover/focus and behind each row's "why?".
// Sticky idea column + horizontal scroll at 390 px.
const fill = (t: number) => `var(--score-${1 + Math.min(3, Math.floor(Math.max(0, t) * 4))})`; // the fan ramp, like every fan quantity
const size = (t: number) => Math.round(10 + 16 * t);
const verb = (category: string) => (category === "cover" ? "Cover" : category === "landmarks" || category === "themes" ? "Subject" : "Topic");

export function IdeaCityGrid({ items, cities, limit = 4 }: { items: RegionIdea[]; cities: CityIdeas[]; limit?: number }) {
  const [all, setAll] = useState(false);
  const grid = ideaGrid({ cities, region: items }, items.length);
  const rows = all ? grid.rows : grid.rows.slice(0, limit);
  const { ref, bind, tip } = useTip();
  return (
    <div className="space-y-3">
      <div ref={ref} className="relative">
        <ScrollArea className="w-full min-w-0 [&_[data-orientation=vertical]]:hidden">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm" data-testid="region-ideas">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card pb-2 text-left text-xs font-normal text-muted-foreground">Idea</th>
                {grid.cities.map((c) => (
                  <th key={c} scope="col" className="px-1.5 pb-2 text-center text-xs font-medium whitespace-nowrap text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ref}>
                  <th scope="row" className="sticky left-0 z-10 max-w-40 border-t bg-card py-1.5 pr-3 text-left font-normal sm:max-w-56">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0">
                        <span className="block text-xs text-muted-foreground">{verb(r.category)}</span>
                        <span className="block truncate font-semibold">{r.ref}</span>
                      </span>
                      {(r.short || r.detail) && (
                        <Hint label={`Where ${r.ref} fits`}>
                          {r.short && <p>{r.short}</p>}
                          {r.detail && <p className="mt-1 text-muted-foreground">{r.detail}</p>}
                        </Hint>
                      )}
                    </span>
                  </th>
                  {r.cells.map((v, i) => {
                    const city = grid.cities[i];
                    if (v === undefined)
                      return (
                        <td key={city} className="border-t px-1.5 py-1.5 text-center">
                          <span
                            {...bind("not in the fan data here", `${r.ref} in ${city}`)}
                            className={cn("mx-auto flex size-8 items-center justify-center rounded-md", markClass)}
                          >
                            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                          </span>
                        </td>
                      );
                    const best = i === r.best;
                    // 0 = the fan-data map has this city, with the least lean of the tour: "weak here".
                    if (v === 0 && !best)
                      return (
                        <td key={city} className="border-t px-1.5 py-1.5 text-center">
                          <span
                            {...bind("weak here (fan data)", `${r.ref} in ${city}`)}
                            data-cell=""
                            data-weak=""
                            className={cn("mx-auto flex size-8 items-center justify-center rounded-md", markClass)}
                          >
                            <span className="size-2.5 rounded-[3px] border border-muted-foreground/50" />
                          </span>
                        </td>
                      );
                    const t = heat(v, grid.lo, grid.hi);
                    return (
                      <td key={city} className="border-t px-1.5 py-1.5 text-center">
                        <span
                          {...bind(`fit ${v}${best ? " · best city" : ""} (fan data)`, `${r.ref} in ${city}`)}
                          data-cell=""
                          data-best={best ? "" : undefined}
                          className={cn("mx-auto flex size-8 items-center justify-center rounded-md", best && "ring-2 ring-foreground ring-offset-2 ring-offset-card", markClass)}
                        >
                          <span className="rounded-[4px]" style={{ width: size(t), height: size(t), background: fill(t) }} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        {tip}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          Less fit
          {[0, 0.33, 0.66, 1].map((t) => (
            <span key={t} className="flex size-5 items-center justify-center">
              <span className="rounded-[3px]" style={{ width: size(t) * 0.7, height: size(t) * 0.7, background: fill(t) }} />
            </span>
          ))}
          More fit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-2 ring-foreground ring-offset-1 ring-offset-card" /> Best city
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-muted-foreground/50" /> Weak here
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-muted-foreground/40" /> Not in its data
        </span>
        {grid.rows.length > limit && (
          <button type="button" className="ml-auto font-medium text-foreground underline-offset-4 hover:underline" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${grid.rows.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
