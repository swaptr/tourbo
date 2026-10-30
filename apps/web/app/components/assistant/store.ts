import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { Levers } from "@tourbo/core/engine/levers.ts";
import type { DecisionPrompt } from "@tourbo/core/engine/prompts.ts";
import type { Constraint, Proposal } from "@tourbo/core/engine/proposals.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { ownerHeaders } from "~/lib/work";
import { ShownError } from "~/components/state";

// One client store per run for the conversation layer (chat, levers, Tourbo's questions), so the
// three components share one GET /api/chat and see each other's writes. Client-only.

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; at: string; proposals?: string[] };
export type AssistantState = {
  ai: boolean;
  off?: string; // one plain sentence when Ask Tourbo is off on this server
  left: number;
  owned?: boolean;
  ready?: boolean;
  history?: ChatMessage[];
  proposals?: Proposal[];
  levers?: Levers;
  constraints?: Constraint[];
  prompts?: DecisionPrompt[];
};
type Entry = { state?: AssistantState; error?: string; loading: boolean };

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const EMPTY: Entry = { loading: true };

const emit = (key: string) => listeners.get(key)?.forEach((l) => l());
export function patch(key: string, fn: (s: AssistantState) => AssistantState) {
  const e = entries.get(key);
  if (!e?.state) return;
  entries.set(key, { ...e, state: fn(e.state) });
  emit(key);
}

async function load(key: string, query: string) {
  entries.set(key, { ...(entries.get(key) ?? {}), loading: true, error: undefined });
  emit(key);
  // Only the server's plain sentence is shown; network or parse failures read as the fallback.
  const LOAD_FAILED = "We couldn't load this just now. Try again.";
  try {
    const res = await fetch(`/api/chat?${query}`);
    const body = (await res.json().catch(() => ({}))) as AssistantState & { error?: string };
    if (!res.ok) entries.set(key, { ...(entries.get(key) ?? {}), loading: false, error: body.error ?? LOAD_FAILED });
    else entries.set(key, { state: body, loading: false });
  } catch {
    entries.set(key, { ...(entries.get(key) ?? {}), loading: false, error: LOAD_FAILED });
  }
  emit(key);
}

// key: the run id, or "city:<name>" for /ideas.
export function useAssistant(scope: { runId?: string; city?: string }) {
  const key = scope.runId ?? `city:${scope.city ?? ""}`;
  const query = scope.runId ? `runId=${encodeURIComponent(scope.runId)}` : `city=${encodeURIComponent(scope.city ?? "")}`;
  const subscribe = useCallback(
    (cb: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(cb);
      listeners.set(key, set);
      return () => set.delete(cb);
    },
    [key],
  );
  const entry = useSyncExternalStore(subscribe, () => entries.get(key) ?? EMPTY, () => EMPTY);
  useEffect(() => {
    if (!entries.has(key)) void load(key, query);
  }, [key, query]);
  const reload = useCallback(() => load(key, query), [key, query]);
  // An edit from the map / night list: Tourbo's questions are for the plan as it is now.
  useEffect(() => {
    if (!scope.runId) return;
    const on = (e: Event) => (e as CustomEvent<{ runId?: string }>).detail?.runId === scope.runId && void load(key, query);
    window.addEventListener("tourbo:edits", on);
    return () => window.removeEventListener("tourbo:edits", on);
  }, [key, query, scope.runId]);
  return { ...entry, key, reload, patch: (fn: (s: AssistantState) => AssistantState) => patch(key, fn) };
}

// POST /api/chat with this browser's owner key. Returns the JSON or throws one plain sentence.
export async function post<T = Record<string, unknown>>(runId: string | undefined, body: Record<string, unknown>): Promise<T> {
  const NOT_SENT = "That didn't go through. Try again in a moment.";
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(runId ? ownerHeaders(runId) : {}) },
    body: JSON.stringify({ ...body, ...(runId ? { runId } : {}) }),
  }).catch(() => {
    throw new ShownError(NOT_SENT);
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ShownError(json.error ?? NOT_SENT);
  return json;
}

// The plan changed on the server (Apply / Undo / an answer): the workspace re-reads its loader.
export const PLAN_CHANGED = "tourbo:plan-changed";
export function planChanged(runId: string, plan?: Plan) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PLAN_CHANGED, { detail: { runId, plan } }));
}

// Lever view changes (no server write of the plan): { runId, levers, plan (tuned view) }.
export const LEVERS_CHANGED = "tourbo:levers";
