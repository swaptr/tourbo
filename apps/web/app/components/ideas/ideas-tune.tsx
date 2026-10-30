import { LoaderCircle, MessageSquareText, RotateCw, X } from "lucide-react";
import { useFetcher, useRouteLoaderData, useSearchParams } from "react-router";

import { constraintChips, type FeedbackChange } from "@tourbo/core/engine/idea-feedback.ts";
import { CATEGORY_LABEL } from "@tourbo/core/engine/ideas-rank.ts";
import { BoundaryChips, SlotHint, SlotSelect } from "~/components/context-controls";
import { ErrorLine, useLimits } from "~/components/state";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { loader } from "~/routes/plan.$id.ideas";

// The Ideas tab's own controls, shown as a section of the tour header's Tune popover while the
// Ideas tab is open (one place to tune): your slot, what you're OK with (crowd-work kinds), a
// short note to Tourbo, and Refresh. Local flavour is the Tune lever above it.

type Data = Awaited<ReturnType<typeof loader>>;
type FeedbackResult = { feedbackOk?: boolean; affected?: string[]; notice?: string; feedbackError?: string };
type IdeasResult = { ideas?: unknown; error?: string; retry?: boolean };

export function IdeasTuneSection({ canEdit }: { canEdit: boolean }) {
  const d = useRouteLoaderData<typeof loader>("routes/plan.$id.ideas") as Data | undefined;
  const [, setSearch] = useSearchParams();
  const note = useFetcher<FeedbackResult>();
  const fb = useFetcher<FeedbackResult>();
  const refresh = useFetcher<IdeasResult>();
  const limits = useLimits();
  if (!d || !canEdit || !d.cities.length) return null;
  const action = `/plan/${d.id}/ideas`;
  const set = (k: string, v: string) =>
    setSearch(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set(k, v);
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  const ctx = { slot: d.inputs.slot, flavour: d.inputs.flavour, b: d.inputs.boundaries.join(",") };
  const busy = note.state !== "idle" || fb.state !== "idle";
  const change = (c: FeedbackChange) => fb.submit({ intent: "feedback", change: JSON.stringify(c), version: String(d.feedback.version) }, { method: "post", action });
  const chips = constraintChips(d.feedback.feedback.constraints, (c) => CATEGORY_LABEL[c]);
  const text = d.feedback.feedback.note;
  return (
    <section aria-labelledby="tune-ideas-h" className="space-y-3 border-t pt-3" data-testid="tune-ideas">
      <div>
        <h3 id="tune-ideas-h" className="text-sm font-medium">
          Ideas
        </h3>
        <p className="text-xs text-muted-foreground">For every night of this tour.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SlotSelect kind={d.kind} value={d.inputs.slot} onChange={(v) => set("slot", v)} />
        <SlotHint kind={d.kind} slot={d.inputs.slot} flavour={d.inputs.flavour} />
      </div>
      {d.crowd && <BoundaryChips value={d.inputs.boundaries} onChange={(v) => set("b", v.join(","))} />}
      <note.Form method="post" action={action} className="flex gap-2">
        <input type="hidden" name="intent" value="note" />
        <input type="hidden" name="version" value={d.feedback.version} />
        <label className="sr-only" htmlFor="tell-tourbo">
          Tell Tourbo what you want more or less of
        </label>
        <Input id="tell-tourbo" name="note" maxLength={200} defaultValue={text} key={text} placeholder="e.g. no sports, more food, keep it clean" />
        <Button type="submit" variant="outline" disabled={busy}>
          {note.state !== "idle" ? <LoaderCircle className="animate-spin" /> : <MessageSquareText />} Tell Tourbo
        </Button>
      </note.Form>
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="What Tourbo took from your note">
          {chips.map((c) => (
            <li key={`${c.field}:${c.value ?? ""}`}>
              <Badge variant="outline" className="h-6 gap-1 pr-0.5">
                {c.text}
                <Button type="button" size="icon-xs" variant="ghost" className="size-5 rounded-full" aria-label={`Remove: ${c.text}`} disabled={busy} onClick={() => change({ op: "dropConstraint", field: c.field, value: c.value })}>
                  <X />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {text && !chips.length && note.state === "idle" && <p className="text-xs text-muted-foreground">Tourbo didn't find anything to change in that note. Try naming a topic, like "no sports".</p>}
      {note.data?.notice && <p className="text-xs text-muted-foreground">{note.data.notice}</p>}
      <ErrorLine message={note.data?.feedbackError ?? fb.data?.feedbackError} />
      {d.savedAt && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Ideas saved {new Date(d.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
          {!limits.data && (
            <Button type="button" size="xs" variant="outline" disabled={refresh.state !== "idle"} onClick={() => refresh.submit({ intent: "ideas", ...ctx }, { method: "post", action })}>
              {refresh.state !== "idle" ? <LoaderCircle className="animate-spin" /> : <RotateCw />} {refresh.state !== "idle" ? "Refreshing…" : "Refresh ideas"}
            </Button>
          )}
        </p>
      )}
      <ErrorLine message={refresh.data?.error} />
    </section>
  );
}
