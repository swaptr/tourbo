import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { AssistResult, AssistTask, RowDraft, RowsDraft } from "@tourbo/core/assist/assist.ts";
import { loadProfile } from "~/lib/profile";
import { ownerKeyFor } from "~/lib/work";

// Client side of the AI assists (PLAN Q21). POST /api/assist; the owner key of the run (when the
// browser has it) or of the act profile rides along, so the AI assistant can help the owner and
// everyone else still gets Tourbo's plain draft. Never throws: errors land in state.

export type AssistStatus = "idle" | "loading" | "done" | "error";
export type AssistState<T> = { status: AssistStatus; result?: AssistResult<T>; error?: string; retry?: boolean };
export type AssistScope = { profileId?: string; runId?: string };

const FAILED = "Tourbo couldn't draft that just now. Try again in a moment.";

export async function callAssist<T>(task: AssistTask, input: unknown, scope: AssistScope = {}): Promise<AssistResult<T>> {
  const profile = loadProfile();
  const profileId = scope.profileId ?? profile?.id;
  const runKey = scope.runId ? ownerKeyFor(scope.runId) : undefined;
  const key = runKey ?? (profileId && profileId === profile?.id ? profile?.ownerKey : undefined);
  const res = await fetch("/api/assist", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "X-Owner-Key": key } : {}) },
    body: JSON.stringify({ task, input, ...(profileId ? { profileId } : {}) }),
  }).catch(() => undefined);
  const body = (await res?.json().catch(() => undefined)) as (AssistResult<T> & { error?: string; retry?: boolean }) | undefined;
  if (!res?.ok || !body || body.error) throw Object.assign(new Error(body?.error ?? FAILED), { retry: body?.retry ?? true });
  return body;
}

// const tidy = useAssist<ParseDraft>("library_parse"); tidy.run({ text, kind })
export function useAssist<T>(task: AssistTask, scope: AssistScope = {}) {
  const [state, setState] = useState<AssistState<T>>({ status: "idle" });
  const seq = useRef(0);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const run = useCallback(
    async (input: unknown): Promise<AssistResult<T> | undefined> => {
      const id = ++seq.current;
      setState((s) => ({ status: "loading", result: s.result }));
      try {
        const result = await callAssist<T>(task, input, scopeRef.current);
        if (id === seq.current) setState({ status: "done", result });
        return result;
      } catch (error) {
        if (id === seq.current) setState({ status: "error", error: (error as Error).message || FAILED, retry: (error as { retry?: boolean }).retry !== false });
        return undefined;
      }
    },
    [task],
  );
  const reset = useCallback(() => {
    seq.current++;
    setState({ status: "idle" });
  }, []);
  return { ...state, draft: state.result?.draft, loading: state.status === "loading", run, reset };
}

// ---------- Row insights: one batched request per list render ----------

export type RowInsightDraft = RowDraft;
type RowEntry = { row?: RowInsightDraft; status: "loading" | "done" | "none" | "error"; notice?: string };

const rows = new Map<string, RowEntry>();
const listeners = new Set<() => void>();
let queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
const emit = () => listeners.forEach((l) => l());

function flush() {
  timer = undefined;
  const ids = [...queue];
  queue = new Set();
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    callAssist<RowsDraft>("row_insight", { runIds: chunk })
      .then((r) => {
        const by = new Map(r.draft.rows.map((x) => [x.runId, x]));
        for (const id of chunk) rows.set(id, by.get(id) ? { row: by.get(id), status: "done", notice: r.notice } : { status: "none" });
      })
      .catch(() => chunk.forEach((id) => rows.set(id, { status: "error" })))
      .finally(emit);
  }
}

function want(runId: string) {
  if (rows.has(runId)) return;
  rows.set(runId, { status: "loading" });
  queue.add(runId);
  timer ??= setTimeout(flush, 30);
}

// The list row's one-line insight from its saved plan (fan data). Rows mounted together share one request.
export function useRowInsight(runId: string | undefined): RowEntry {
  const entry = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => (runId ? rows.get(runId) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (runId && !rows.has(runId)) want(runId);
  }, [runId, entry]);
  return entry ?? { status: runId ? "loading" : "none" };
}

// After a plan changes (an edit, a rebuilt tour), drop its cached line so the next render asks again.
export function forgetRowInsight(runId: string) {
  rows.delete(runId);
  emit();
}
