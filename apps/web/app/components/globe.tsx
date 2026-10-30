// The home globe, React side: a canvas, pointer forwarding, the keyboard list and the zoom buttons.
// Everything that draws or hit-tests lives in lib/globe-scene.ts (no DOM; worker-ready). The globe
// talks to the page only through the home store: hover/tap/interactions go in as events, and it
// follows the store (which example to draw, the inspected marker, playback). It renders once; store
// changes never re-render it.
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { HomeExample } from "@tourbo/core/examples/types.ts";
import { prefersReducedMotion, tokenColor } from "~/lib/css-color";
import { angularDistanceDeg, globeFocusId, playState, routeStops, type HomeState } from "~/lib/globe-model";
import type { GlobeIn, GlobeOut, SceneExample, SceneGroup } from "~/lib/globe-scene";
import type { HomeStore } from "~/lib/home-store";
import type { GlobeSource } from "~/lib/landing-data";

// Kept for the info panel's type imports (the panel shows exactly one example now).
export type Inspect = { examples: number[]; expanded: boolean; pinned: boolean };
export type GlobeControl = { close: () => void; open: (group: number) => void };
export type GlobePlayer = { hold: (reason: string) => void; release: (reason: string) => void; nudge: () => void; playing: () => boolean };

export type GlobeProps = {
  examples: HomeExample[];
  source: GlobeSource;
  store: HomeStore;
  // Elements the globe must keep clear of (no hover zones or focus markers under them).
  avoidRefs?: React.RefObject<HTMLElement | null>[];
  onReady?: () => void;
  className?: string;
};

const ZOOM_STEP = 0.2;
const WHEEL_ZOOM = 0.0015;
const PINCH_WHEEL_ZOOM = 0.008; // trackpad pinch (ctrl + small wheel deltas)
const WHEEL_MAX_PX = 120; // one event never jumps more than a notch
const KEY_DEG = 10;
const NEIGHBOURS = 6; // nearest other examples drawn flat around the selected one
const NEIGHBOUR_DEG = 30;
const HINT_MS = 1400;
const SCROLL_IDLE_MS = 150; // rendering pauses while the page scrolls
const COLORS = ["primary", "foreground", "muted-foreground", "background", "globe-ocean", "globe-land", "globe-coast", "globe-rim", "globe-skip", "score-1", "score-2", "score-3", "score-4"];

type Group = SceneGroup & { key: string; ids: string[] };
function markerGroups(examples: HomeExample[]): Group[] {
  const m = new Map<string, Group>();
  for (const ex of examples) {
    const f = ex.cities[0] ?? ex.home;
    const key = `${f.lat.toFixed(1)},${f.lon.toFixed(1)}`;
    const g = m.get(key) ?? { key, lat: f.lat, lon: f.lon, area: [], state: 0, ids: [] };
    g.ids.push(ex.id);
    for (const c of ex.cities) g.area.push([c.lat, c.lon]);
    m.set(key, g);
  }
  return [...m.values()];
}
const sceneExample = (ex: HomeExample): SceneExample => ({
  id: ex.id,
  fanKey: ex.fanKey,
  home: { lat: ex.home.lat, lon: ex.home.lon },
  cities: ex.cities.map((c) => ({ name: c.name, lat: c.lat, lon: c.lon, fanStrength: c.fanStrength })),
  route: ex.route?.map((r) => ({ name: r.name, lat: r.lat, lon: r.lon })),
  focus: ex.feature === "route" ? undefined : (ex.room?.city ?? ex.cities[0]?.name),
  decision: { lines: ex.decision.lines },
  skipped: ex.skipped && { name: ex.skipped.name, lat: ex.skipped.lat, lon: ex.skipped.lon },
  surprise: ex.surprise && { city: ex.surprise.city },
});
const hexOf = (rgba: string) => {
  const m = rgba.match(/[\d.]+/g) ?? ["128", "128", "128"];
  return `#${m.slice(0, 3).map((v) => Math.round(Number(v)).toString(16).padStart(2, "0")).join("")}`;
};

// Resolve once the element is on screen and the browser is idle (or after a short timeout).
function whenVisibleAndIdle(el: Element): Promise<void> {
  return new Promise((resolve) => {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1));
      idle(() => resolve(), { timeout: 1200 });
    });
    io.observe(el);
  });
}

// Roving focus over the marker buttons: one Tab stop, arrows / Home / End move it.
function roveKeys(e: React.KeyboardEvent<HTMLUListElement>) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0 || !all.length) return;
  const to = step ? (at + step + all.length) % all.length : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : -1;
  if (to < 0) return;
  e.preventDefault();
  all[at].tabIndex = -1;
  all[to].tabIndex = 0;
  all[to].focus();
}

export function Globe({ examples, source, store, avoidRefs, onReady, className }: GlobeProps) {
  const box = useRef<HTMLDivElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const post = useRef<(m: GlobeIn) => void>(() => {});
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // The zoom hint toggles straight on the DOM: a state flip would re-render the whole globe
  // component (and its icons) on every plain wheel over it.
  const hintRef = useRef<HTMLDivElement>(null);
  const setHint = (on: boolean) => hintRef.current?.toggleAttribute("hidden", !on);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const [lost, setLost] = useState(false);
  const placeholder = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => markerGroups(examples), [examples]);
  const byId = useMemo(() => new Map(examples.map((e) => [e.id, e])), [examples]);
  const groupOf = useMemo(() => {
    const m = new Map<string, number>();
    groups.forEach((g, i) => g.ids.forEach((id) => m.set(id, i)));
    return m;
  }, [groups]);
  const live = useRef({ groups, byId, groupOf, source });
  live.current = { groups, byId, groupOf, source };

  // One example per marker: the story's when it is in the group, else the first.
  const exampleOf = (group: number) => {
    const g = live.current.groups[group];
    if (!g) return null;
    const sid = store.get().story.id;
    return sid && g.ids.includes(sid) ? sid : g.ids[0];
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A fresh canvas per scene: on unmount its WebGL context is released outright (forceContextLoss),
    // which must never hit a canvas a later mount reuses (StrictMode remounts in dev).
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    el.prepend(canvas);
    let disposed = false;
    let dispose = () => {};
    const unsubs: (() => void)[] = [];

    (async () => {
      // The globe chunk (three.js) loads only once the hero is on screen and the page is idle,
      // so it never competes with first paint.
      await whenVisibleAndIdle(el);
      if (disposed) return;
      const [{ createGlobeScene }, landUrl, land50Url] = await Promise.all([
        import("~/lib/globe-scene"),
        import("world-atlas/land-110m.json?url").then((m) => m.default),
        import("world-atlas/land-50m.json?url").then((m) => m.default),
      ]);
      if (disposed) return;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const colors = Object.fromEntries(COLORS.map((c) => [c, hexOf(tokenColor(c, 1, el))]));
      const scene = await createGlobeScene(
        canvas,
        {
          width: el.clientWidth,
          height: el.clientHeight,
          dpr: Math.min(window.devicePixelRatio, 2), // the scene caps it per quality tier
          stats: new URLSearchParams(location.search).has("perf"),
          low: coarse,
          reduced: prefersReducedMotion(),
          colors,
          landUrl: new URL(landUrl, location.href).href,
          land50Url: new URL(land50Url, location.href).href,
        },
        (m) => onOut(m),
      ).catch((e) => {
        if (import.meta.env.DEV) console.error("globe", e);
        return undefined;
      });
      if (!scene || disposed) {
        scene?.dispose();
        if (!disposed) setState("failed");
        return;
      }
      post.current = scene.handle;
      dispose = scene.dispose;

      // Base layers.
      // Big cities come with the world file; the ~25k small towns are fetched afterwards, when idle.
      const src = live.current.source;
      void src.world().then((w) => {
        if (!w || disposed) return;
        scene.handle({ t: "world", world: w });
        const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1000));
        idle(() => void src.towns().then((t) => t && !disposed && scene.handle({ t: "towns", cities: t.cities })), { timeout: 4000 });
      });

      // Follow the store: which example to draw (camera moves only when the story advanced),
      // the inspected marker's ring, playback.
      let drawn: string | null = null, storyV = -1, inspectG = -2, playing: boolean | null = null, groupKey = "";
      const sync = (s: HomeState) => {
        const L = live.current;
        const key = `${s.story.id}|${L.groups.length}`;
        if (key !== groupKey) {
          groupKey = key;
          const shown = new Set(s.story.ids.slice(0, s.story.index + 1));
          scene.handle({ t: "groups", groups: L.groups.map((g) => ({ lat: g.lat, lon: g.lon, area: g.area, state: s.story.id && g.ids.includes(s.story.id) ? 2 : g.ids.some((id) => shown.has(id)) ? 1 : 0 })) });
        }
        if (s.story.id) el.dataset.story = s.story.id; // for tests: which example the story is on
        const focus = globeFocusId(s);
        const advanced = s.story.version !== storyV && focus === s.story.id;
        if (focus && (focus !== drawn || advanced)) {
          const ex = L.byId.get(focus);
          if (ex) {
            const move = advanced && drawn !== null ? true : drawn === null;
            drawn = focus;
            storyV = s.story.version;
            void L.source.density(ex).then((d) => {
              if (disposed || drawn !== focus) return; // stale: a newer focus won
              scene.handle({ t: "show", ex: sceneExample(ex), density: d ?? null, move });
            });
            // While this one is on screen: fetch the story's next examples and have the scene bake
            // their terrain when the page is idle, so the next swaps never wait for a bake.
            const ids = s.story.ids, at = s.story.index;
            const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
            idle(() => {
              const next = [1, 2, 3].map((k) => L.byId.get(ids[(at + k) % ids.length] ?? "")).filter((e) => e && e.id !== focus) as typeof ex[];
              void Promise.all(next.map((n) => L.source.density(n).then((d) => d && { ex: sceneExample(n), density: d }))).then((items) => {
                if (disposed || drawn !== focus) return;
                scene.handle({ t: "prebake", items: items.filter((i) => !!i) });
              });
              // The nearest other examples (one per marker, within NEIGHBOUR_DEG): flat surfaces
              // in the sibling colour, so the region around the selected one isn't bare.
              const f = ex.cities[0] ?? ex.home, seenG = new Set([L.groupOf.get(focus)]);
              const near = [...L.byId.values()]
                .filter((n) => n.id !== focus && n.fanKey !== ex.fanKey)
                .map((n) => ({ n, d: angularDistanceDeg(f.lat, f.lon, (n.cities[0] ?? n.home).lat, (n.cities[0] ?? n.home).lon) }))
                .filter((x) => x.d < NEIGHBOUR_DEG)
                .sort((a, b) => a.d - b.d)
                .filter(({ n }) => {
                  const g = L.groupOf.get(n.id);
                  return !seenG.has(g) && (seenG.add(g), true);
                })
                .slice(0, NEIGHBOURS);
              // One act per task: each decode is a few ms, six in one task would be a long task.
              void (async () => {
                const items = [];
                for (const { n } of near) {
                  const d = await L.source.density(n);
                  if (disposed || drawn !== focus) return;
                  if (d) items.push({ ex: sceneExample(n), density: d, group: L.groupOf.get(n.id) ?? -1 });
                  await new Promise((r) => setTimeout(r, 0));
                }
                if (!disposed && drawn === focus) scene.handle({ t: "neighbours", items });
              })();
            }, { timeout: 1500 });
          }
        }
        const ig = s.inspect.id ? (L.groupOf.get(s.inspect.id) ?? -1) : -1;
        if (ig !== inspectG) scene.handle({ t: "inspect", group: (inspectG = ig) });
        const p = playState(s.playback, performance.now()) === "playing";
        if (p !== playing) scene.handle({ t: "playing", on: (playing = p) });
      };
      sync(store.get());
      unsubs.push(store.subscribe(() => sync(store.get())));

      // Size, visibility (off-screen, hidden tab, page scroll) and the areas to keep clear.
      const panels = () => {
        const r = el.getBoundingClientRect();
        const rects = (avoidRefs ?? [])
          .map((ref) => ref.current?.getBoundingClientRect())
          .filter((b): b is DOMRect => !!b && b.width > 0)
          .map((b) => [b.left - r.left, b.top - r.top, b.width, b.height] as [number, number, number, number]);
        scene.handle({ t: "panels", rects, anchor: null });
      };
      const ro = new ResizeObserver(() => {
        scene.handle({ t: "size", width: el.clientWidth, height: el.clientHeight, dpr: window.devicePixelRatio });
        panels();
      });
      ro.observe(el);
      for (const ref of avoidRefs ?? []) if (ref.current) ro.observe(ref.current);
      let onScreen = true, scrolling = 0;
      const vis = () => scene.handle({ t: "visible", on: onScreen && !document.hidden && !scrolling });
      const io = new IntersectionObserver(([e]) => ((onScreen = e.isIntersecting), vis()));
      io.observe(el);
      const onScroll = () => {
        if (!scrolling) (scrolling = window.setTimeout(end, SCROLL_IDLE_MS)), vis();
        else {
          clearTimeout(scrolling);
          scrolling = window.setTimeout(end, SCROLL_IDLE_MS);
        }
      };
      const end = () => {
        scrolling = 0;
        vis();
        panels();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("visibilitychange", vis);
      // DPR changes (window dragged to another screen) don't always resize the element.
      let dprMq: MediaQueryList | null = null;
      const onDpr = () => {
        dprMq?.removeEventListener("change", onDpr);
        scene.handle({ t: "size", width: el.clientWidth, height: el.clientHeight, dpr: window.devicePixelRatio });
        dprMq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        dprMq.addEventListener("change", onDpr);
      };
      dprMq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprMq.addEventListener("change", onDpr);
      unsubs.push(() => {
        dprMq?.removeEventListener("change", onDpr);
        ro.disconnect();
        io.disconnect();
        clearTimeout(scrolling);
        window.removeEventListener("scroll", onScroll);
        document.removeEventListener("visibilitychange", vis);
      });

      // Pointer input: forwarded as-is; moves coalesce to one per frame.
      let wheelArmed = false, pendingMove: GlobeIn | null = null, moveRaf = 0;
      const send = (kind: "enter" | "leave" | "down" | "move" | "up" | "cancel", e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const m: GlobeIn = { t: "pointer", kind, id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, touch: e.pointerType !== "mouse", time: e.timeStamp };
        if (kind !== "move") return scene.handle(m);
        pendingMove = m;
        moveRaf ||= requestAnimationFrame(() => {
          moveRaf = 0;
          if (pendingMove) scene.handle(pendingMove);
          pendingMove = null;
        });
      };
      const on: [string, (e: PointerEvent) => void][] = [
        ["pointerenter", (e) => send("enter", e)],
        ["pointerleave", (e) => ((wheelArmed = false), send("leave", e))],
        ["pointerdown", (e) => ((wheelArmed = true), el.setPointerCapture(e.pointerId), send("down", e))],
        ["pointermove", (e) => send("move", e)],
        ["pointerup", (e) => send("up", e)],
        ["pointercancel", (e) => send("cancel", e)],
      ];
      for (const [t, f] of on) el.addEventListener(t, f as EventListener, { passive: true });
      // Never stuck: a lost capture, a window blur or a hidden tab drops every drag and pinch.
      const cancelAll = () => scene.handle({ t: "cancelInput" });
      const onLost = (e: PointerEvent) => send("cancel", e);
      const onHide = () => document.hidden && cancelAll();
      el.addEventListener("lostpointercapture", onLost);
      window.addEventListener("blur", cancelAll);
      document.addEventListener("visibilitychange", onHide);
      const at = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      // Plain wheel scrolls the page; ctrl/⌘ + wheel (trackpad pinch sends ctrlKey), a focused
      // globe, or wheel after clicking the globe zooms toward the cursor. Otherwise a hint shows.
      let hintTimer = 0;
      const onWheel = (e: WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey || wheelArmed || document.activeElement === el)) {
          setHint(true);
          clearTimeout(hintTimer);
          hintTimer = window.setTimeout(() => setHint(false), HINT_MS);
          return;
        }
        e.preventDefault();
        setHint(false);
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1; // lines, pages → px
        const dy = Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, e.deltaY * unit));
        scene.handle({ t: "zoom", dz: -dy * (e.ctrlKey && !e.metaKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM), ...at(e) });
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      const onDbl = (e: MouseEvent) => scene.handle({ t: "zoom", dz: ZOOM_STEP, ...at(e) });
      el.addEventListener("dblclick", onDbl);
      // Keyboard on the focused globe: arrows rotate, +/− zoom, Esc resets the view.
      const onGlobeKey = (e: KeyboardEvent) => {
        const k = e.key;
        const rot: Record<string, [number, number]> = { ArrowLeft: [-KEY_DEG, 0], ArrowRight: [KEY_DEG, 0], ArrowUp: [0, KEY_DEG], ArrowDown: [0, -KEY_DEG] };
        if (rot[k]) scene.handle({ t: "rotate", dLon: rot[k][0], dLat: rot[k][1] });
        else if (k === "+" || k === "=") scene.handle({ t: "zoom", dz: ZOOM_STEP });
        else if (k === "-" || k === "_") scene.handle({ t: "zoom", dz: -ZOOM_STEP });
        else if (k === "Escape") {
          if (store.get().inspect.id) return; // Esc closes an open example first (document handler)
          scene.handle({ t: "reset" });
        }
        else return;
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener("keydown", onGlobeKey);
      // Esc closes a tapped example.
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && store.dispatch({ type: "CLOSE" });
      document.addEventListener("keydown", onKey);
      unsubs.push(() => {
        cancelAnimationFrame(moveRaf);
        clearTimeout(hintTimer);
        for (const [t, f] of on) el.removeEventListener(t, f as EventListener);
        el.removeEventListener("lostpointercapture", onLost);
        window.removeEventListener("blur", cancelAll);
        document.removeEventListener("visibilitychange", onHide);
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("dblclick", onDbl);
        el.removeEventListener("keydown", onGlobeKey);
        document.removeEventListener("keydown", onKey);
      });

      // Dev-only hook for QA scripts.
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tourboGlobe = { goto: (lat: number, lon: number, zoom: number) => scene.handle({ t: "goto", lat, lon, zoom }) };
      // Crossfade the placeholder out and the live globe in (WAAPI, compositor-only opacity).
      const fade = prefersReducedMotion() ? 0 : 500;
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: "ease-out" });
      const ph = placeholder.current;
      ph?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fade, easing: "ease-out", fill: "forwards" }).finished.then(() => (ph.hidden = true), () => {});
      setState("ready");
      onReady?.();
    })();

    // Scene → page: hover/tap become store events; settled markers are published for tests.
    const onOut = (m: GlobeOut) => {
      switch (m.t) {
        case "hover": {
          const id = m.group >= 0 ? exampleOf(m.group) : null;
          el.dataset.hover = String(m.group);
          el.style.cursor = m.group >= 0 ? "pointer" : "";
          store.dispatch(id ? { type: "HOVER", id } : { type: "HOVER", id: null, from: exampleOf(m.from) ?? undefined });
          return;
        }
        case "tap": {
          const id = m.group >= 0 ? exampleOf(m.group) : null;
          store.dispatch({ type: "TAP", id });
          // On a phone the card sits above the globe: bring it into view so a tap never changes a
          // card the reader can't see (no-op when it's already on screen).
          const card = id ? document.querySelector<HTMLElement>("[data-testid=info-panel]") : null;
          const r = card?.getBoundingClientRect();
          if (card && r && (r.bottom < 0 || r.top > innerHeight || r.top < 0)) card.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
          return;
        }
        case "interact":
          store.dispatch(m.kind === "nudge" ? { type: "NUDGE" } : { type: m.kind === "hold" ? "HOLD" : "RELEASE", reason: m.reason ?? "globe" });
          return;
        case "zoomed":
          if (resetRef.current) resetRef.current.hidden = !m.on;
          return;
        case "markers":
          el.dataset.markers = JSON.stringify(m.vis);
          el.dataset.view = m.view.join(",");
          return;
        case "failed":
          setState("failed");
          return;
        case "lost":
        case "restored":
          setLost(m.t === "lost");
          return;
        case "stats":
          el.dataset.stats = JSON.stringify(m);
          return;
      }
    };

    // perf:home only (?perf): renderer.info, tier and GPU time on the canvas element once a second.
    const statsTimer = new URLSearchParams(location.search).has("perf") ? setInterval(() => post.current({ t: "stats" }), 1000) : undefined;

    return () => {
      disposed = true;
      clearInterval(statsTimer);
      for (const u of unsubs) u();
      dispose();
      canvas.remove();
      post.current = () => {};
      if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__tourboGlobe;
    };
    // The scene is built once; examples/source changes reach it through `live` and the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marker list changes (examples loaded): resend the groups.
  useEffect(() => {
    if (state !== "ready") return;
    store.dispatch({ type: "TICK" });
  }, [groups, state, store]);

  // Keyboard order: the story's route stops first, then every other marker.
  const keyOrder = useMemo(() => {
    const first = examples[0];
    const at = (lat: number, lon: number) => groups.findIndex((g) => Math.abs(g.lat - lat) < 0.05 && Math.abs(g.lon - lon) < 0.05);
    const head = (first ? routeStops(first.cities, first.route, first.decision.lines) : []).map((s) => at(s.lat, s.lon)).filter((i) => i >= 0);
    return [...new Set([...head, ...groups.map((_, i) => i)])];
  }, [groups, examples]);

  return (
    <div className={className ?? "relative h-full w-full"} data-testid="globe">
      <div
        ref={box}
        className="absolute inset-0 cursor-grab touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-testid="globe-canvas"
        tabIndex={0}
        role="application"
        aria-label="Globe. Arrow keys turn it, plus and minus zoom, Escape resets the view."
      ></div>
      <div ref={hintRef} hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center [&[hidden]]:hidden" data-testid="zoom-hint">
        <p className="rounded-md bg-foreground/80 px-3 py-1.5 text-sm text-background">{isMac ? "Use ⌘ + scroll to zoom" : "Use ctrl + scroll to zoom"}</p>
      </div>
      {state !== "failed" && <div ref={placeholder} className="pointer-events-none absolute inset-x-[6%] top-[22%] aspect-square rounded-full bg-globe-ocean/60 ring-1 ring-border" aria-hidden />}
      {(state === "failed" || lost) && (
        // WebP with alpha (12 KB); AVIF came out larger for this image, so there's no AVIF source.
        <img src="/globe-still.webp" alt="" width={1440} height={681} className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top" aria-hidden />
      )}
      {/* Keyboard: the markers are one Tab stop (roving tabindex): Tab lands on one example, the
          arrow keys move between them, Enter pins it, Esc closes. Tab again leaves the globe, so the
          card is a few Tabs away instead of hundreds. */}
      <ul className="sr-only" aria-label="Examples on the globe, arrow keys to browse" onKeyDown={roveKeys}>
        {keyOrder.map((i, n) => {
          const g = groups[i];
          const ex = byId.get(g.ids[0])!;
          return (
            <li key={g.key}>
              <button
                type="button"
                tabIndex={n === 0 ? 0 : -1}
                onFocus={() => store.dispatch({ type: "FOCUS", id: ex.id })}
                onBlur={() => store.dispatch({ type: "FOCUS", id: null })}
                onClick={() => store.dispatch({ type: "TAP", id: ex.id })}
              >
                {ex.act.name}: {ex.decision.headline}
              </button>
            </li>
          );
        })}
      </ul>
      {state === "ready" && (
        <div className="absolute right-3 bottom-3 z-20 flex flex-col overflow-hidden rounded-md border bg-background/90 shadow-sm backdrop-blur-sm">
          <button type="button" className="p-2 hover:bg-muted" aria-label="Zoom in" onClick={() => post.current({ t: "zoom", dz: ZOOM_STEP })}>
            <Plus className="size-4" />
          </button>
          <button type="button" className="border-t p-2 hover:bg-muted" aria-label="Zoom out" onClick={() => post.current({ t: "zoom", dz: -ZOOM_STEP })}>
            <Minus className="size-4" />
          </button>
          <button ref={resetRef} hidden type="button" className="border-t p-2 hover:bg-muted" aria-label="Reset view" onClick={() => post.current({ t: "reset" })}>
            <RotateCcw className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
