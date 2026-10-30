import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import type { CityPlan } from "@tourbo/core/shared/types.ts";
import { played, shortDate } from "~/lib/tour-tabs";
import { cn } from "~/lib/utils";

// Shared anatomy for the kind tabs: a title with one plain line, then the tour's nights in order,
// each a numbered row (ink circle, the picked night ringed) with that night's content under it.
// Main pane = across the tour; the night panel stays the per-night view.

export function KindTabFrame({ title, line, aside, children }: { title: string; line: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-5" data-testid="kind-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[65ch]">
          <h2 className="font-heading text-lg tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{line}</p>
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

// The nights that are played, in tour order, each with its own content (nothing → a quiet line).
export function NightRows({ stops, render, empty }: { stops: CityPlan[]; render: (s: CityPlan, i: number) => ReactNode; empty: string }) {
  const [search] = useSearchParams();
  const picked = Number(search.get("night")) || undefined;
  return (
    <ol className="divide-y rounded-xl bg-card ring-1 ring-border">
      {stops.map((s, i) =>
        played(s) ? (
          <li key={`${s.city.name}-${i}`} className={cn("px-4 py-3.5 transition-colors duration-150", picked === i + 1 && "bg-muted/60")} aria-current={picked === i + 1 ? "true" : undefined}>
            <div className="flex items-baseline gap-2.5">
              <span className={cn("flex size-6 shrink-0 translate-y-0.5 items-center justify-center self-start rounded-full text-xs font-semibold", picked === i + 1 ? "bg-foreground text-background" : "border border-foreground/40 text-foreground")} aria-hidden>
                <span className="num">{i + 1}</span>
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                {/* The whole header picks the night (rail, map and panel follow). */}
                <Link
                  to={`?night=${i + 1}`}
                  replace
                  preventScrollReset
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-sm outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-current={picked === i + 1 ? "true" : undefined}
                >
                  <span className="font-medium">
                    <span className="sr-only">Night {i + 1}, </span>
                    {s.city.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {shortDate(s.date, true)}
                    {s.venue && ` · ${s.venue.name}`}
                  </span>
                </Link>
                {render(s, i) ?? <p className="text-sm text-muted-foreground">{empty}</p>}
              </div>
            </div>
          </li>
        ) : null,
      )}
    </ol>
  );
}

// A labelled figure inside a night row: small label over a tabular number.
export function Figure({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num text-sm font-medium">
        {value}
        {note && <span className="ml-1 text-xs font-normal text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}

export function Figures({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">{children}</dl>;
}

// The one night whose action is the screen's primary (filled tomato): the picked night when it
// has one, else the first night that does. Every other night's action stays outline.
export function useLeadNight(stops: CityPlan[], has: (i: number) => boolean): number {
  const [search] = useSearchParams();
  const picked = Number(search.get("night")) - 1;
  if (picked >= 0 && played(stops[picked] ?? ({} as CityPlan)) && has(picked)) return picked;
  return stops.findIndex((s, i) => played(s) && has(i));
}
