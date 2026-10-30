import { useState } from "react";

import type { RegionIdea } from "@tourbo/core/engine/ideas-rank.ts";
import { Hint } from "~/components/hint";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

// "Across your tour": ideas × cities. A filled dot = play / use it there; the comparison and
// numbers sit behind the row's hint. Top 4, then "Show all".
export function RegionGrid({ items, cities }: { items: RegionIdea[]; cities: string[] }) {
  const [all, setAll] = useState(false);
  const rows = all ? items : items.slice(0, 4);
  const verb = (r: RegionIdea) => (r.category === "cover" ? "Cover" : r.category === "landmarks" || r.category === "themes" ? "Subject" : "Topic");
  return (
    <div className="space-y-2">
      <ScrollArea className="w-full min-w-0 [&_[data-orientation=vertical]]:hidden">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm" data-testid="region-ideas">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card pb-2 text-left text-xs font-normal text-muted-foreground">Idea</th>
              {cities.map((c) => (
                <th key={c} scope="col" className="px-2 pb-2 text-center text-xs font-medium whitespace-nowrap text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const where = new Set(r.best.map((b) => b.city));
              return (
                <tr key={r.ref}>
                  <th scope="row" className="sticky left-0 z-10 max-w-44 border-t bg-card py-2 pr-3 text-left font-normal">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0">
                        <span className="block text-xs text-muted-foreground">{verb(r)}</span>
                        <span className="block truncate font-semibold">{r.ref}</span>
                      </span>
                      <Hint label={`Where ${r.ref} fits`}>
                        <p>{r.short}</p>
                        <p className="mt-1 text-muted-foreground">{r.detail}</p>
                      </Hint>
                    </span>
                  </th>
                  {cities.map((c) => (
                    <td key={c} className="border-t px-2 py-2 text-center">
                      <span
                        role="img"
                        aria-label={where.has(c) ? `${r.ref}: yes in ${c}` : `${r.ref}: not in ${c}`}
                        title={where.has(c) ? `Yes in ${c}` : `Not in ${c}`}
                        className={cn("inline-block size-3 rounded-full", where.has(c) ? "bg-foreground/70" : "border border-muted-foreground/30")}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
      {items.length > 4 && (
        <button type="button" className="text-sm font-medium underline-offset-4 hover:underline" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
