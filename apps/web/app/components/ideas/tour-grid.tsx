import { ChevronRight } from "lucide-react";

import type { ShownCity } from "@tourbo/core/engine/idea-feedback.ts";
import { grouped, type Idea } from "@tourbo/core/engine/ideas-rank.ts";
import { FactChip } from "~/components/insight";
import { ideaChip } from "~/lib/tour-tabs";
import { cn } from "~/lib/utils";

// The Ideas tab's tour-wide view: the top idea per category for every night, side by side, each
// with its fan-data chip. Picking a cell opens that night in the panel with the category in view.
// Phone: a list of nights, each opening the night sheet.

export type GridNight = { city: string; date?: string; ideas?: ShownCity };
const short = (c: string) => c.split(",")[0].trim();
const day = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) : undefined);

// picked: the category last picked in the selected night's column (ringed).
export function IdeasTourGrid({ nights, selected, picked, onPick }: { nights: GridNight[]; selected: number; picked?: string; onPick: (night: number, category?: string, open?: boolean) => void }) {
  const all = nights.flatMap((n) => n.ideas?.ideas ?? []);
  const rows = grouped(all).map((g) => ({ category: g.category, label: g.label }));
  const top = (n: GridNight, cat: string) => {
    const list = (n.ideas?.ideas ?? []).filter((i) => i.category === cat);
    return { first: list[0], more: list.length - 1 };
  };
  return (
    <>
      {/* ≥ sm: categories × nights */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10 max-sm:hidden" tabIndex={0} role="region" aria-label="Ideas by night">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm" data-testid="ideas-grid">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-28 bg-card px-3 py-2 text-left text-xs font-normal text-muted-foreground">
                Idea
              </th>
              {nights.map((n, i) => (
                <th key={i} scope="col" className={cn("min-w-36 border-l bg-card p-0 text-left font-normal", i + 1 === selected && "bg-muted")} aria-current={i + 1 === selected ? "true" : undefined}>
                  <button type="button" onClick={() => onPick(i + 1)} className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                    <span className={cn("num flex size-6 shrink-0 items-center justify-center rounded-full text-xs", i + 1 === selected ? "bg-foreground text-background" : "bg-muted text-foreground")}>{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{short(n.city)}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {n.ideas?.ideas.length ?? 0} pick{n.ideas?.ideas.length === 1 ? "" : "s"}
                        {day(n.date) && ` · ${day(n.date)}`}
                      </span>
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <th scope="row" className="sticky left-0 z-10 w-28 border-t bg-card px-3 py-2 text-left align-top text-xs font-medium">
                  {r.label}
                </th>
                {nights.map((n, i) => {
                  const { first, more } = top(n, r.category);
                  return (
                    <td key={i} className={cn("border-t border-l bg-card p-0 align-top", i + 1 === selected && "bg-muted/50")}>
                      {first ? <Cell idea={first} more={more} city={short(n.city)} label={r.label} on={i + 1 === selected && picked === r.category} onClick={() => onPick(i + 1, r.category)} /> : <span className="block px-3 py-2.5 text-muted-foreground" aria-label={`No ${r.label.toLowerCase()} for ${short(n.city)}`}>–</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* phone: one row per night */}
      <ol className="divide-y rounded-xl ring-1 ring-foreground/10 sm:hidden" aria-label="Ideas by night" data-testid="ideas-list">
        {nights.map((n, i) => {
          const first = n.ideas?.ideas[0];
          const chip = first && ideaChip(first.why);
          return (
            <li key={i}>
              <button type="button" aria-current={i + 1 === selected || undefined} onClick={() => onPick(i + 1, undefined, true)} className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", i + 1 === selected && "bg-muted/60")}>
                <span className={cn("num flex size-7 shrink-0 items-center justify-center rounded-full text-xs", i + 1 === selected ? "bg-foreground text-background" : "bg-muted")}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-medium">{short(n.city)}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">
                      {n.ideas?.ideas.length ?? 0} pick{n.ideas?.ideas.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {first && chip ? (
                    <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="min-w-0 truncate">{first.ref}</span>
                      <FactChip text={chip.text} meter={chip.meter} hedged={chip.hedged} className="shrink-0" />
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-sm text-muted-foreground">Nothing from the fan data yet</span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Cell({ idea, more, city, label, on, onClick }: { idea: Idea; more: number; city: string; label: string; on?: boolean; onClick: () => void }) {
  const chip = ideaChip(idea.why);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on || undefined}
      // Name starts with the visible text in order (WCAG 2.5.3): ref, chip, "+N".
      aria-label={`${idea.ref} ${chip.text}${more > 0 ? ` +${more}` : ""}, ${label.toLowerCase()} for ${city}. Open ${city}'s ideas.`}
      className={cn("flex w-full flex-col items-start gap-1.5 px-3 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", on && "ring-2 ring-foreground/50 ring-inset")}
    >
      <span className="line-clamp-2 font-medium text-pretty">{idea.ref}</span>
      <span className="flex items-center gap-1.5">
        <FactChip text={chip.text} meter={chip.meter} hedged={chip.hedged} />
        {more > 0 && <span className="num text-xs text-muted-foreground">+{more}</span>}
      </span>
    </button>
  );
}
