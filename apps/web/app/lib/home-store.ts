// The home page store: the globe-model reducer plus the only clock. The clock is event-driven: one
// timer set to the next deadline (advance, idle end, inspect grace, swap limit), never a per-frame
// loop, so an idle page does no work and nothing allocates per frame. Panels subscribe to one slice each through the hooks below, so a
// story change never re-renders the inspect panel's subscribers and vice versa.
import { createContext, createElement, useContext, useRef, useSyncExternalStore } from "react";

import type { HomeExample } from "@tourbo/core/examples/types.ts";
import { globeFocusId, homeReduce, initialHome, inspectActive, nextDeadline, playState, timeLeft, type HomeEvent, type HomeState, type PlayState } from "./globe-model.ts";

export type HomeStore = {
  get: () => HomeState;
  dispatch: (e: HomeEvent) => void;
  subscribe: (fn: () => void) => () => void;
  // Example lookup by id (the loaded static bundle); no fetch ever happens on hover.
  example: (id: string | null) => HomeExample | undefined;
  setExamples: (all: HomeExample[]) => void;
  // Fraction of the current example's time left (0–1), for the ring; no React, no allocation.
  progress: () => number;
  start: () => () => void;
};

export function createHomeStore(): HomeStore {
  let state = initialHome(typeof performance === "undefined" ? 0 : performance.now());
  const subs = new Set<() => void>();
  let byId = new Map<string, HomeExample>();
  let timer: ReturnType<typeof setTimeout> | undefined, started = false;
  let lastPlay: PlayState = playState(state.playback, typeof performance === "undefined" ? 0 : performance.now());
  const schedule = () => {
    if (!started) return;
    clearTimeout(timer);
    const now = performance.now(), d = nextDeadline(state, now);
    if (d < Infinity) timer = setTimeout(() => (set(homeReduce(state, { type: "TICK" }, performance.now())), schedule()), Math.max(0, d - now) + 1);
  };
  const set = (next: HomeState) => {
    if (next === state) return;
    const prev = state;
    state = next;
    // Notify only when something a subscriber can see changed (not the playback clock itself). The
    // play state is compared with the last one notified, since it also changes with time (idle end).
    const play = playState(next.playback, performance.now());
    if (prev.story !== next.story || prev.inspect !== next.inspect || play !== lastPlay) {
      lastPlay = play;
      for (const fn of subs) fn();
    }
  };
  const store: HomeStore = {
    get: () => state,
    dispatch: (e) => {
      set(homeReduce(state, e, performance.now()));
      schedule();
    },
    subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)),
    example: (id) => (id ? byId.get(id) : undefined),
    setExamples: (all) => (byId = new Map(all.map((e) => [e.id, e]))),
    progress: () => timeLeft(state.playback, performance.now()),
    start: () => {
      started = true;
      schedule();
      const vis = () => store.dispatch({ type: "HIDDEN", hidden: document.hidden });
      document.addEventListener("visibilitychange", vis);
      return () => {
        started = false;
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", vis);
      };
    },
  };
  return store;
}

const Ctx = createContext<HomeStore | null>(null);
export const HomeStoreProvider = ({ store, children }: { store: HomeStore; children: React.ReactNode }) => createElement(Ctx.Provider, { value: store }, children);
export function useHomeStore(): HomeStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useHomeStore outside HomeStoreProvider");
  return s;
}

// Selector with a stable result: re-renders only when `pick` returns a different value (by `same`).
function useSelect<T>(store: HomeStore, pick: (s: HomeState) => T, same: (a: T, b: T) => boolean): T {
  const last = useRef<{ v: T } | null>(null);
  const get = () => {
    const v = pick(store.get());
    if (last.current && same(last.current.v, v)) return last.current.v;
    last.current = { v };
    return v;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

// Story card: the auto-advancing example. Changes only on advance / Next / dots.
export type StoryView = { id: string | null; version: number; index: number; total: number; done: boolean; example?: HomeExample };
export function useStory(): StoryView {
  const store = useHomeStore();
  return useSelect(
    store,
    (s) => ({ id: s.story.id, version: s.story.version, index: s.story.index, total: s.story.ids.length, done: s.story.done, example: store.example(s.story.id) }),
    (a, b) => a.version === b.version,
  );
}
// Whether there is a story to play (≥ 2 examples, not done): changes almost never.
export function useStoryPlayable(): boolean {
  const store = useHomeStore();
  return useSelect(store, (s) => s.story.ids.length > 1 && !s.story.done, (a, b) => a === b);
}
// True while inspect is active (story frozen/dimmed). Subscribe from a thin wrapper that toggles a
// class, so the story card's content never re-renders on hover.
export function useStoryFrozen(): boolean {
  const store = useHomeStore();
  return useSelect(store, (s) => inspectActive(s, performance.now()), (a, b) => a === b);
}
// Story controls (Next, dots). Ignored while inspect is active (single writer).
export const storyGoto = (store: HomeStore, index: number) => store.dispatch({ type: "GOTO", index });

// Inspect panel: exactly one example: the hovered/tapped/focused one, else the story's.
export type InspectView = { id: string | null; version: number; active: boolean; pinned: boolean; mode: "compact" | "expanded"; example?: HomeExample };
export function useInspect(): InspectView {
  const store = useHomeStore();
  return useSelect(
    store,
    (s) => {
      const id = s.inspect.id ?? s.story.id;
      return { id, version: s.inspect.version * 100_000 + (s.inspect.id ? 0 : s.story.version), active: s.inspect.id !== null, pinned: s.inspect.pinned, mode: s.inspect.mode, example: store.example(id) };
    },
    (a, b) => a.version === b.version && a.id === b.id && a.active === b.active && a.pinned === b.pinned && a.mode === b.mode,
  );
}

// Playback: state for the pause/play control; the ring reads store.progress() per frame.
export function usePlayback(): { state: PlayState; toggle: () => void; progress: () => number } {
  const store = useHomeStore();
  const state = useSelect(store, (s) => playState(s.playback, performance.now()), (a, b) => a === b);
  return { state, toggle: () => store.dispatch({ type: "TOGGLE" }), progress: store.progress };
}

// The example the globe's route/towers follow (inspect while hovering, story otherwise).
export function useGlobeFocus(): string | null {
  const store = useHomeStore();
  return useSelect(store, globeFocusId, (a, b) => a === b);
}
