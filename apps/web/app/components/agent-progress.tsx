import { Check, LoaderCircle, X } from "lucide-react";
import { neutral } from "~/lib/neutral";

import { cn } from "~/lib/utils";
import type { TraceEvent } from "@tourbo/core/shared/types.ts";

// The agent's run as plain-language steps. A step is done once a later step has started.
const STEPS: { label: string; who: string; match: RegExp; job?: "prep" | "outreach" }[] = [
  { label: "Looking you up", who: "fan data", match: /^resolve_act/ },
  { label: "Finding where your fans are", who: "fan heatmaps", match: /^score_cities/ },
  { label: "Choosing rooms and checking the money", who: "Tourbo", match: /^(plan_city|evaluate_show|set_show)/ },
  { label: "Routing the tour", who: "Tourbo tools", match: /^(route_tour|plan_promo)/ },
  { label: "Double-checking the plan", who: "Critic", match: /^(critique_plan|finalize_plan)/ },
  { label: "Writing show notes for each night", who: "Tourbo + city taste", match: /^show_prep/, job: "prep" },
  { label: "Drafting venue emails", who: "Tourbo", match: /^draft_venue_emails/, job: "outreach" },
];

export function AgentProgress({ events, jobs, status }: { events: TraceEvent[]; jobs: string[]; status: string }) {
  const steps = STEPS.filter((s) => !s.job || jobs.includes(s.job));
  const reached = steps.map((s) => events.some((e) => e.kind === "tool_call" && s.match.test(e.message)));
  const current = reached.lastIndexOf(true);
  const finished = status === "done";
  const failed = status === "failed" || status === "interrupted";
  const latest = [...events].reverse().find((e) => e.kind === "decision" || e.kind === "repair");

  return (
    <div className="rounded-xl p-4 ring-1 ring-foreground/10">
      <ol className="space-y-2.5">
        {steps.map((s, i) => {
          const state = finished || i < current ? "done" : i === current ? (failed ? "failed" : "active") : "todo";
          return (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  state === "done" && "border-success bg-success text-success-foreground",
                  state === "active" && "border-primary text-primary",
                  state === "failed" && "border-destructive bg-destructive text-destructive-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <LoaderCircle className="size-3.5 animate-spin" /> : state === "failed" ? <X className="size-3.5" /> : null}
              </span>
              <span className={cn(state === "todo" && "text-muted-foreground", state === "active" && "font-medium")}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      {!finished && !failed && latest && (
        <p className="mt-4 line-clamp-2 border-t pt-3 text-sm text-muted-foreground" aria-live="polite">
          {neutral(latest.message)}
        </p>
      )}
    </div>
  );
}
