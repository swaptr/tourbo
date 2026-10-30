import { ArrowRight, Pause, Play, Search } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Form, Link } from "react-router";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { HomeDialog } from "~/components/example-card";
import { prewarmViews } from "~/lib/example-view";
import { prefersReducedMotion } from "~/lib/css-color";
import { playState, type PlayState } from "~/lib/globe-model";
import { createHomeStore, HomeStoreProvider, useHomeStore, useStoryPlayable, type HomeStore } from "~/lib/home-store";
import { markShown, playOrder, rotate, walkStart } from "~/lib/showcase";
import {
  devSource, emptySource, loadDevExamples, loadStaticContrast, loadStaticExamples, staticSource, type Contrast, type GlobeSource, type LandingManifest,
} from "~/lib/landing-data";
import { cn } from "~/lib/utils";
import { landingFirstExample, landingManifest } from "../../server/home.server";
import type { HomeExample } from "@tourbo/core/examples/types.ts";
import type { Route } from "./+types/home";

// three.js is big and browser-only: the globe loads after first paint.
const Globe = lazy(() => import("~/components/globe").then((m) => ({ default: m.Globe })));

const TITLE = "Tourbo: your fans already picked your tour";
const DESCRIPTION = "Tour planning for acts without a booking agent: where your fans live, which rooms fit, which nights make money, and what to say on stage.";
const EXAMPLE_MS = 7500;

export function meta({}: Route.MetaArgs) {
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:image", content: "/og.png" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: "/og.png" },
  ];
}

// Static only: `/` is prerendered at build (react-router.config.ts), so this loader runs at build
// time and reads the exported bundle from disk: the manifest plus the first example in play order,
// inlined so the dialog shows it with no fetch. The browser fetches the other hashed files. No
// fan-data API, agent or database calls when / is served. `?live=off` previews no data (SSR).
export async function loader({ request }: Route.LoaderArgs) {
  const off = new URL(request.url).searchParams.get("live") === "off";
  const manifest = off ? undefined : await landingManifest();
  return { manifest, first: await landingFirstExample(manifest), devFallback: import.meta.env.DEV && !off };
}

type Landing = { status: "loading" | "ready" | "empty"; examples: HomeExample[]; contrast?: Contrast; source: GlobeSource };
function useLanding(manifest: LandingManifest | undefined, devFallback: boolean): Landing {
  const [state, setState] = useState<Landing>({ status: manifest || devFallback ? "loading" : "empty", examples: [], source: emptySource });
  useEffect(() => {
    let stale = false;
    const source = manifest ? staticSource(manifest) : devFallback ? devSource() : emptySource;
    const examples = manifest ? loadStaticExamples(manifest) : devFallback ? loadDevExamples().then((ex) => ex && pathOrder(ex)) : Promise.resolve(undefined);
    const contrast = manifest ? loadStaticContrast(manifest) : Promise.resolve(undefined);
    setState((s) => ({ ...s, source }));
    Promise.all([examples, contrast]).then(([ex, c]) => {
      if (!stale) setState({ status: ex?.length ? "ready" : "empty", examples: ex ?? [], contrast: c, source });
    });
    return () => {
      stale = true;
    };
  }, [manifest, devFallback]);
  return state;
}



// The static export is already in play order; the dev (DB-backed) list is sorted the same way.
const focusOf = (e: HomeExample) => e.route?.[0] ?? e.cities[0] ?? e.home;
function pathOrder(examples: HomeExample[]): HomeExample[] {
  const items = examples.map((e) => ({ e, act: e.fanKey || e.act.name, lat: focusOf(e).lat, lon: focusOf(e).lon }));
  return playOrder(items).map((i) => i.e);
}

// Order: walk the geographic path from a per-session start (lib/showcase), wrapping at the end.
// Built after hydration so server and client render the same first example; then the home store
// plays it (it owns the only clock).
// With an inlined first example, a fresh session starts the walk there (it is already on screen);
// a reload in the same session keeps walking forward.
function useShowcase(examples: HomeExample[], store: HomeStore, first: HomeExample | undefined) {
  const [all, setAll] = useState(examples);
  useEffect(() => {
    if (first && !examples.length) return; // keep the inlined example until the bundle arrives
    const ids = examples.map((e) => e.id);
    const at = first ? ids.indexOf(first.id) : -1;
    const ordered = rotate(examples, at >= 0 ? walkStart(ids, () => (at + 0.5) / ids.length) : walkStart(ids));
    store.setExamples(ordered);
    setAll(ordered);
    store.dispatch({ type: "INIT", ids: ordered.map((e) => e.id), dur: EXAMPLE_MS, reduced: prefersReducedMotion() });
  }, [examples, store, first]);
  // Mark what the story showed (sessionStorage bag), outside render.
  useEffect(() => store.subscribe(() => {
    const id = store.get().story.id;
    if (id) markShown(id);
  }), [store]);
  return all;
}

// Pause/play with the time-left ring. Never re-renders after mount: a store subscription writes the
// play state (data-state, label, icon via CSS) and restarts the WAAPI ring on each new example.
const RING_R = 15;
const PLAY_LABEL: Record<PlayState, [aria: string, title: string]> = {
  playing: ["Pause the examples", "Pause"],
  "paused-by-interaction": ["Pause the examples", "Paused while you look around"],
  "paused-by-user": ["Play the examples", "Play"],
  hidden: ["Pause the examples", "Pause"],
};
function PlayControl() {
  const playable = useStoryPlayable();
  const store = useHomeStore();
  const btn = useRef<HTMLButtonElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const C = 2 * Math.PI * RING_R;
  useEffect(() => {
    let anim: Animation | undefined, v = -1, last: PlayState | null = null;
    const sync = () => {
      const s = store.get(), state = playState(s.playback, performance.now());
      if (state === last && s.story.version === v) return;
      last = state;
      v = s.story.version;
      const b = btn.current, el = ring.current;
      if (!b || !el) return;
      b.dataset.state = state;
      b.setAttribute("aria-label", PLAY_LABEL[state][0]);
      b.title = PLAY_LABEL[state][1];
      anim?.cancel();
      const left = store.progress();
      const from = C * (1 - left);
      el.style.strokeDashoffset = from.toFixed(2);
      if (state === "playing" && left > 0) anim = el.animate([{ strokeDashoffset: from }, { strokeDashoffset: C }], { duration: left * s.playback.dur, easing: "linear", fill: "forwards" });
    };
    sync();
    const unsub = store.subscribe(sync);
    return () => (unsub(), anim?.cancel());
  }, [store, C, playable]);
  if (!playable) return null;
  return (
    <button
      ref={btn}
      type="button"
      onClick={() => store.dispatch({ type: "TOGGLE" })}
      data-testid="play-control"
      className="group/play relative grid size-9 place-items-center rounded-full border bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle ref={ring} cx="18" cy="18" r={RING_R} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={0} className="stroke-primary opacity-40 transition-opacity duration-300 group-data-[state=playing]/play:opacity-100" />
      </svg>
      <Play className="hidden size-3.5 translate-x-px group-data-[state=paused-by-user]/play:block" />
      <Pause className="size-3.5 group-data-[state=paused-by-user]/play:hidden" />
    </button>
  );
}

function GlobePlaceholder() {
  return <div className="pointer-events-none absolute inset-x-[6%] top-[8%] aspect-square rounded-full bg-globe-ocean/50 ring-1 ring-border lg:top-[30%]" aria-hidden />;
}

function ContrastSection({ contrast }: { contrast: Contrast }) {
  return (
    <section className="container mx-auto max-w-6xl px-4 py-16">
      <h2 className="text-4xl">Planned with fan data, or an AI's guess</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        The same request for {contrast.act}, planned twice: once from where the fans actually live, once from a general-purpose guess.
      </p>
      <ul className="mt-8 divide-y border-y">
        {contrast.rows.map((r) => (
          <li key={`${r.side}-${r.city}`} className="grid gap-1 py-4 sm:grid-cols-[12rem_9rem_1fr] sm:items-baseline sm:gap-6">
            <span className="font-heading text-2xl">{r.city}</span>
            <span className={cn("text-xs tracking-widest uppercase", r.side === "guess" ? "text-muted-foreground" : "text-primary")}>
              {r.side === "fan" ? "Fan data only" : r.side === "guess" ? "AI guess only" : "Both, different room"}
            </span>
            <span className="text-sm text-muted-foreground">{r.line}</span>
          </li>
        ))}
      </ul>
      <Link to={`/plan/${contrast.runId}/compare`} className="mt-4 inline-block text-sm underline underline-offset-4">
        See the full comparison
      </Link>
    </section>
  );
}

// The store starts with the inlined example, so the server HTML and the first client render show it.
function seededStore(first: HomeExample | undefined): HomeStore {
  const store = createHomeStore();
  if (first) {
    store.setExamples([first]);
    store.dispatch({ type: "INIT", ids: [first.id], dur: EXAMPLE_MS, reduced: false });
  }
  return store;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const data = useLanding(loaderData.manifest, loaderData.devFallback);
  const [store] = useState(() => seededStore(loaderData.first));
  const all = useShowcase(data.examples, store, loaderData.first);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => store.start(), [store]);
  // The globe keeps its hover zones and focus clear of the dialog.
  const dialogRef = useRef<HTMLElement | null>(null);
  const avoid = useMemo(() => [dialogRef], []);
  useEffect(() => {
    dialogRef.current = document.querySelector<HTMLElement>("[data-testid=info-panel]");
  });
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(prefersReducedMotion()), []);
  useEffect(() => (data.examples.length ? prewarmViews(data.examples) : undefined), [data.examples]);

  return (
    <main>
      <section className="relative overflow-hidden border-b">
        <div className="container mx-auto max-w-6xl px-4 pt-12 sm:pt-16">
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Tour planning for acts without an agent</p>
          <h1 className="mt-4 max-w-3xl text-5xl leading-[1.02] text-balance sm:text-7xl">
            Your fans already picked <em className="text-primary">your tour.</em>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Tourbo reads the map: where your fans live, which rooms fit, which nights make money and what to say on stage.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Button size="lg" className="h-12 px-6 text-base" nativeButton={false} render={<Link to="/start" />}>
              Plan my tour <ArrowRight />
            </Button>
            <Form action="/start" method="get" className="flex items-center gap-2" role="search">
              <label htmlFor="try-act" className="sr-only">
                Try it with any act
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="try-act" name="artist" placeholder="Try it with any act" className="h-10 w-56 bg-card pl-8" autoComplete="off" />
              </div>
            </Form>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">See it on acts you know. Built for acts nobody's heard of yet.</p>
        </div>

        <HomeStoreProvider store={store}>
          <div className="relative mt-6 flex flex-col lg:block lg:min-h-[680px]">
            {/* The globe is always there: base layers even with no examples; examples stream in. */}
            <div className="relative order-2 aspect-square w-full lg:absolute lg:inset-0 lg:aspect-auto">
              {mounted ? (
                <Suspense fallback={<GlobePlaceholder />}>
                  <Globe examples={all} source={data.source} store={store} avoidRefs={avoid} />
                </Suspense>
              ) : (
                <GlobePlaceholder />
              )}
              {mounted && (
                <div className="absolute right-[3.75rem] bottom-3 z-20">
                  <PlayControl />
                </div>
              )}
            </div>
            <HomeDialog reduced={reduced} empty={data.status === "loading" ? "Loading examples…" : "Live examples are warming up. Plan your own tour in the meantime."} />
          </div>
        </HomeStoreProvider>
      </section>

      {data.contrast && <ContrastSection contrast={data.contrast} />}

      <section className="border-y bg-card">
        <div className="container mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-3">
          {[
            ["Find the cities", "Where your fans live and which cities lean toward you."],
            ["Check the money", "Rooms that fit, ticket prices and the nights to skip."],
            ["Get on stage", "Show notes, venue emails and counter-offers. You approve every send."],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-2xl">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">
        Works with any AI assistant that supports MCP.{" "}
        <Link to="/connect" className="text-foreground underline underline-offset-4">
          Connect yours
        </Link>
        . Run a bar or venue?{" "}
        <Link to="/explore" className="text-foreground underline underline-offset-4">
          Find acts for your room
        </Link>
        .
      </section>

      <p className="container mx-auto max-w-3xl px-4 pb-10 text-center text-xs text-muted-foreground">
        Every number is an estimate, and every reference comes from real fan data.
      </p>
    </main>
  );
}
