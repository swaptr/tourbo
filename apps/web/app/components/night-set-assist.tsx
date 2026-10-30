import { useRevalidator } from "react-router";

import { AssistButton, type BuildSetDraft } from "~/components/assist";
import { FactChip } from "~/components/insight";
import { Hint } from "~/components/hint";
import { Badge } from "~/components/ui/badge";
import { ShownError } from "~/components/state";
import { saveEventSet } from "~/lib/material";
import { ownerKeyFor } from "~/lib/work";

// "Build my set" for one tour night (shared assist `build_set`, input { runId, city }): your
// Library first, a local nod or two with their fan-data chips. Keep saves the order as that night's
// set (its show). Nods not yet in the Library can't go into a saved set: they're left out and named.
export function NightSetAssist({ runId, city, showId, size = "sm", primary, className }: { runId: string; city: string; showId?: string; size?: "sm" | "default"; primary?: boolean; className?: string }) {
  const revalidator = useRevalidator();
  return (
    <AssistButton<BuildSetDraft>
      task="build_set"
      input={{ runId, city }}
      scope={{ runId }}
      label="Build my set"
      heading={`Set for ${city}`}
      size={size}
      primary={primary}
      className={className}
      disabled={!showId}
      isEmpty={(d) => !d.order.length}
      empty="Your Library is empty. Add a few of your own pieces first; Tourbo orders them."
      keepLabel="Keep this set"
      render={(d) => {
        const fresh = d.order.filter((e) => e.isNew);
        return (
          <div className="space-y-2">
            <ol className="space-y-1.5 text-sm">
              {d.order.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="num w-4 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                  <span className={e.isNew ? "text-muted-foreground line-through" : "font-medium"}>{e.title}</span>
                  {e.origin !== "original" && !e.isNew && <Badge variant="outline">local</Badge>}
                  {e.chip && <FactChip text={e.chip} hedged={e.hedged} />}
                  {e.detail && (
                    <Hint text="why?" label={`Why ${e.title}`}>
                      {e.detail}
                    </Hint>
                  )}
                </li>
              ))}
            </ol>
            <p className="num text-xs text-muted-foreground">
              {Math.round(d.minutes)} of {d.target} min · {d.note}
            </p>
            {fresh.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {fresh.map((e) => e.title).join(", ")} {fresh.length === 1 ? "isn't" : "aren't"} in your Library yet, so Keep leaves {fresh.length === 1 ? "it" : "them"} out. Keep the idea on the Ideas tab to use it.
              </p>
            )}
          </div>
        );
      }}
      onKeep={async (d) => {
        if (!showId) return;
        // Sets save only with the tour's owner key (older shared tours have none).
        if (!ownerKeyFor(runId)) throw new ShownError("Only a tour planned in this browser can keep a set. Plan this tour again here to keep one.");
        await saveEventSet(showId, d.order.flatMap((e) => (e.isNew || !e.materialId ? [] : [e.materialId])), runId);
        await revalidator.revalidate();
      }}
    />
  );
}
