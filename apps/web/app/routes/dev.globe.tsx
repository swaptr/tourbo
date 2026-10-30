import { lazy, Suspense, useEffect, useState } from "react";

import { devExamples } from "../../server/home.server";
import { createHomeStore, HomeStoreProvider, useStory } from "~/lib/home-store";
import { devSource } from "~/lib/landing-data";
import type { Route } from "./+types/dev.globe";

// Dev-only review page for the globe with the stored examples (404 in production). `?only=` picks
// example ids (comma-separated) and `?at=` the start index, for repeatable QA stills.
export async function loader({ request }: Route.LoaderArgs) {
  if (import.meta.env.PROD) throw new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const only = url.searchParams.get("only")?.split(",");
  const all = await devExamples();
  const examples = only ? only.map((id) => all.find((e) => e.id === id)).filter((e) => !!e) : all;
  return { examples, hold: url.searchParams.has("hold") };
}

const Globe = lazy(() => import("~/components/globe").then((m) => ({ default: m.Globe })));

function Headline() {
  const story = useStory();
  return <h1 key={story.id} className="mt-3 max-w-2xl text-5xl leading-[1.02]">{story.example?.decision.headline}</h1>;
}

export default function DevGlobe({ loaderData }: Route.ComponentProps) {
  const { examples, hold } = loaderData;
  const [mounted, setMounted] = useState(false);
  const [source] = useState(devSource);
  const [store] = useState(createHomeStore);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    store.setExamples(examples);
    store.dispatch({ type: "INIT", ids: examples.map((e) => e.id), dur: 8000, reduced: hold });
    return store.start();
  }, [examples, hold, store]);
  return (
    <HomeStoreProvider store={store}>
      <main className="relative h-[calc(100svh-7rem)] min-h-[560px] overflow-hidden">
        <div className="relative z-10 container mx-auto max-w-6xl px-4 pt-10">
          <p className="text-xs tracking-widest text-muted-foreground uppercase">Design review</p>
          <Headline />
        </div>
        <div className="absolute inset-0">{mounted && <Suspense>{<Globe examples={examples} source={source} store={store} />}</Suspense>}</div>
      </main>
    </HomeStoreProvider>
  );
}
