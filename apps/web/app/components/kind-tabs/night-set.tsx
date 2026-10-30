import { workspaceFor } from "@tourbo/core/disciplines/index.ts";
import type { CityPlan } from "@tourbo/core/shared/types.ts";
import { useState } from "react";

import { EventSet } from "~/components/event-set";
import { NightSetAssist } from "~/components/night-set-assist";
import { shortDate } from "~/lib/tour-tabs";

// The tour's Set tab, for the night picked in the rail: that night's show set from the Library,
// with the kind's interior (energy curve, bit markers, wall, menu, class timeline: set-shape.tsx).
export function NightSet({ runId, kind, stop, index, showId, canEdit, currency }: { runId: string; kind: string; stop: CityPlan; index: number; showId?: string; canEdit: boolean; currency?: string }) {
  const w = workspaceFor(kind);
  // "Build my set" is the Set page's primary action; hidden once the Library is known to be empty
  // (then "Add your songs" leads). Unknown (server render, loading) counts as not empty.
  const [library, setLibrary] = useState<number | undefined>(undefined);
  return (
    <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border" aria-label={`${w.set.heading} for night ${index + 1}`} data-testid="night-set">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-full bg-foreground text-xs font-semibold text-background">
          <span className="num">{index + 1}</span>
        </span>
        <span className="font-medium">{stop.city.name}</span>
        <span className="text-xs text-muted-foreground">
          {shortDate(stop.date, true)}
          {stop.venue && ` · ${stop.venue.name}`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {canEdit && library !== 0 && showId ? <NightSetAssist runId={runId} city={stop.city.name} showId={showId} primary /> : null}
        </span>
      </p>
      {showId ? (
        <EventSet eventId={showId} tourId={runId} kind={kind} canEdit={canEdit} currency={currency} onLibrary={setLibrary} />
      ) : (
        <p className="text-sm text-muted-foreground">This night isn't saved as a show yet. Reload the tour and it will be.</p>
      )}
    </section>
  );
}
