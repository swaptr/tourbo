import { Check, LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";
import { useRouteLoaderData } from "react-router";

import { stopKey } from "@tourbo/core/engine/edit.ts";
import type { CityPlan } from "@tourbo/core/shared/types.ts";
import { ErrorLine, shownMessage } from "~/components/state";
import { Button } from "~/components/ui/button";
import { useCanEdit } from "~/components/your-work";
import { getEventSet, keepIdeaAsMaterial, saveEventSet } from "~/lib/material";

type Layout = { run: { id: string }; owned: boolean; ws?: { shows?: Record<string, { id: string }> } };

// The night's show (its set lives there) and whether this browser may edit the tour.
export function useNightShow(stop: CityPlan) {
  const layout = useRouteLoaderData("routes/plan.$id") as Layout | undefined;
  const canEdit = useCanEdit(layout?.run.id ?? "", !!layout?.owned);
  return { runId: layout?.run.id, showId: layout?.ws?.shows?.[stopKey(stop)]?.id, canEdit };
}

// One tap: keep a Tourbo pick in the Library (as a local idea for this city) and put it at the end
// of this night's set. Saying it's in the set is the confirmation; the Set tab reorders it.
export function AddToSet({ stop, kind, ref: name, category, label, primary }: { stop: CityPlan; kind: string; ref: string; category: string; label: string; primary?: boolean }) {
  const { runId, showId, canEdit } = useNightShow(stop);
  const [state, setState] = useState<"idle" | "busy" | "done" | { error: string }>("idle");
  if (!canEdit || !showId) return null;
  const add = async () => {
    setState("busy");
    try {
      const { material } = await keepIdeaAsMaterial({ idea: `${label} ${name}`, ref: name, category }, stop.city.name, kind);
      const { set } = await getEventSet(showId);
      const ids = set.map((m) => m.id);
      if (!ids.includes(material.id)) await saveEventSet(showId, [...ids, material.id], runId);
      setState("done");
    } catch (e) {
      setState({ error: shownMessage(e, "That didn't reach the set. Try again.") });
    }
  };
  if (state === "done")
    return (
      <span className="inline-flex h-7 items-center gap-1 text-sm text-success" role="status">
        <Check className="size-4" aria-hidden /> In {stop.city.name}'s set
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant={primary ? "default" : "outline"} data-primary={primary || undefined} onClick={add} disabled={state === "busy"}>
        {state === "busy" ? <LoaderCircle className="animate-spin" /> : <Plus />} Add to {stop.city.name}'s set
      </Button>
      {typeof state === "object" && <ErrorLine message={state.error} retry onRetry={add} />}
    </span>
  );
}
