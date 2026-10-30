import { Check, LoaderCircle, Undo2, X } from "lucide-react";
import { useState } from "react";
import { useRevalidator } from "react-router";

import type { Proposal } from "@tourbo/core/engine/proposals.ts";
import { ErrorLine, shownMessage } from "~/components/state";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { patch, planChanged, post } from "./store";

// A change Tourbo suggests: what changes (one line per night) and the deltas; nothing happens until
// the owner presses Apply. Shared links see the card read-only.
export function ProposalCard({ runId, proposal, canEdit }: { runId: string; proposal: Proposal; canEdit: boolean }) {
  const [busy, setBusy] = useState<"apply" | "discard" | "undo">();
  const [error, setError] = useState<string>();
  const revalidator = useRevalidator();
  const p = proposal;
  const save = p.kind === "constraint";

  const act = async (intent: "apply" | "discard" | "undo") => {
    setBusy(intent);
    setError(undefined);
    try {
      const res = await post<{ proposal: Proposal; plan?: unknown }>(runId, { intent, proposalId: p.id });
      patch(runId, (s) => ({ ...s, proposals: (s.proposals ?? []).map((x) => (x.id === p.id ? res.proposal : x)) }));
      if (res.plan) {
        planChanged(runId);
        void revalidator.revalidate();
      }
    } catch (e) {
      setError(shownMessage(e, "That didn't go through. Try again."));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className={cn("grid gap-2 rounded-lg border bg-card p-3 text-sm", p.status === "discarded" && "opacity-60")} data-proposal={p.status} data-testid="proposal-card">
      <p className="font-medium">{p.title}</p>
      <ul className="grid gap-0.5 text-muted-foreground">
        {p.changes.slice(0, 5).map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {!!p.diff?.lines.length && (
        <p className="flex flex-wrap gap-1.5" aria-label="What changes (estimate)">
          {p.diff.lines.map((l) => (
            <span key={l} className={cn("num rounded-full border px-2 py-0.5 text-xs", /^profit \+/.test(l) && "border-score-3 text-foreground", /^profit −/.test(l) && "border-destructive/50 text-destructive")}>
              {l}
            </span>
          ))}
          <span className="text-xs text-muted-foreground">estimate</span>
        </p>
      )}
      {p.status === "pending" && canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => act("apply")} disabled={!!busy} data-testid="proposal-apply">
            {busy === "apply" ? <LoaderCircle className="animate-spin" /> : <Check />} {save ? "Save" : "Apply"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => act("discard")} disabled={!!busy}>
            <X /> Discard
          </Button>
        </div>
      )}
      {p.status === "applied" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Check className="size-3.5" /> {save ? "Saved for ideas, sets and notes." : "Applied to your plan."}
          {canEdit && (
            <Button type="button" size="xs" variant="outline" onClick={() => act("undo")} disabled={!!busy}>
              {busy === "undo" ? <LoaderCircle className="animate-spin" /> : <Undo2 />} Undo
            </Button>
          )}
        </p>
      )}
      {p.status === "undone" && <p className="text-xs text-muted-foreground">Undone.</p>}
      {p.status === "discarded" && <p className="text-xs text-muted-foreground">Discarded.</p>}
      <ErrorLine message={error} />
    </div>
  );
}
