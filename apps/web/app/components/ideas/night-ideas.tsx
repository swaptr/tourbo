import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import { EMPTY_FEEDBACK, type FeedbackChange, type ShownCity } from "@tourbo/core/engine/idea-feedback.ts";
import { IdeasBoard, type EmptyAction, type IdeasData } from "~/components/ideas-board";
import { ErrorLine } from "~/components/state";

// The night panel's Ideas: this night's idea cards, the act's Keep / More like this / Not for me on
// each (posted to the Ideas tab's action), "why?" with the numbers. focus: a category picked in the
// tour-wide grid scrolls into view.
export function NightIdeas({ runId, kind, city, more, canEdit, empty, focus }: { runId: string; kind: string; city: ShownCity; more: string[]; canEdit: boolean; empty?: EmptyAction; focus?: string }) {
  const fb = useFetcher<{ feedbackError?: string }>();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-testid=idea][data-category="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [focus, city.city]);
  const data = { cities: [city], kind, region: [], frame: "", basisLine: "", label: "" } as unknown as IdeasData;
  const change = (c: FeedbackChange) => fb.submit({ intent: "feedback", change: JSON.stringify(c) }, { method: "post", action: `/plan/${runId}/ideas` });
  const marks = { ...EMPTY_FEEDBACK, more: more.map((ref) => ({ city: city.city, ref, category: city.ideas.find((i) => i.ref === ref)?.category ?? "trending" })) };
  return (
    <div ref={root} className="space-y-3" data-testid="night-ideas">
      <IdeasBoard compact data={data} empty={() => empty} feedback={canEdit ? { marks, busy: fb.state !== "idle", onChange: change } : undefined} />
      <ErrorLine message={fb.data?.feedbackError} />
    </div>
  );
}
