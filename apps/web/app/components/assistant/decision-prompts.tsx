import { HelpCircle, LoaderCircle, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRevalidator } from "react-router";

import { detectPrompts, type DecisionPrompt } from "@tourbo/core/engine/prompts.ts";
import type { Proposal } from "@tourbo/core/engine/proposals.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { ErrorLine, shownMessage } from "~/components/state";
import { Button } from "~/components/ui/button";
import { useCanEdit } from "~/components/your-work";
import { cn } from "~/lib/utils";
import { patch, planChanged, post, useAssistant } from "./store";

// "Tourbo asks" (PLAN §18 Q20): when the data is close (two cities with similar fans, a night that
// barely breaks even, a half-empty room, thin data), a 1-tap question instead of a silent pick.
// At most 2 at a time; an answer records a preference and, when it changes the plan, applies it
// through the owner-only edit path with Undo. Only the owner's browser sees the questions.
//   <DecisionPrompts runId={run.id} plan={run.plan} />
export function DecisionPrompts({ runId, plan, className }: { runId: string; plan: Plan; className?: string }) {
  const a = useAssistant({ runId });
  const canEdit = useCanEdit(runId, !!a.state?.owned);
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ prompt: DecisionPrompt; label: string; proposal?: Proposal }>();

  // Server questions include the run's other scored cities; before they load, the plan alone.
  const prompts = useMemo(() => a.state?.prompts ?? (a.state ? [] : detectPrompts(plan)), [a.state, plan]);
  if (!canEdit || a.state?.ready === false || (!prompts.length && !done)) return null;

  const answer = async (p: DecisionPrompt, optionId: string, label: string) => {
    setBusy(`${p.id}:${optionId}`);
    setError(undefined);
    try {
      const res = await post<{ ok?: boolean; proposal?: Proposal; plan?: Plan }>(runId, { intent: "answer", promptId: p.id, optionId });
      setDone({ prompt: p, label, proposal: res.proposal });
      if (res.plan) {
        planChanged(runId, res.plan);
        void revalidator.revalidate();
      }
      await a.reload(); // fresh questions for the plan as it is now
    } catch (e) {
      setError(shownMessage(e, "That didn't go through. Try again."));
    } finally {
      setBusy(undefined);
    }
  };

  const undo = async () => {
    if (!done?.proposal) return;
    setBusy("undo");
    try {
      await post(runId, { intent: "undo", proposalId: done.proposal.id });
      patch(runId, (s) => ({ ...s, proposals: (s.proposals ?? []).map((x) => (x.id === done.proposal!.id ? { ...x, status: "undone" as const } : x)) }));
      setDone(undefined);
      planChanged(runId);
      void revalidator.revalidate();
    } catch (e) {
      setError(shownMessage(e, "That didn't go through. Try again."));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section className={cn("grid gap-2", className)} aria-label="Tourbo asks">
      {done && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
          Noted: {done.label}.{done.proposal?.diff?.lines.length ? ` ${done.proposal.diff.lines.join(", ")} (estimate).` : ""}
          {done.proposal && (
            <Button type="button" size="xs" variant="outline" onClick={undo} disabled={!!busy}>
              {busy === "undo" ? <LoaderCircle className="animate-spin" /> : <Undo2 />} Undo
            </Button>
          )}
        </p>
      )}
      {prompts.map((p) => (
        <div key={p.id} className="grid gap-2 rounded-lg border border-dashed bg-muted/30 p-3" data-prompt={p.kind}>
          <p className="flex items-start gap-2 text-sm">
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-medium">{p.question}</span> <span className="text-muted-foreground">{p.detail}</span>
            </span>
          </p>
          <div className="flex flex-wrap gap-2 pl-6">
            {p.options.map((o, i) => (
              <Button key={o.id} type="button" size="sm" variant={i === 0 ? "secondary" : "outline"} disabled={!!busy} onClick={() => void answer(p, o.id, o.label)}>
                {busy === `${p.id}:${o.id}` && <LoaderCircle className="animate-spin" />} {o.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <ErrorLine message={error} />
    </section>
  );
}
