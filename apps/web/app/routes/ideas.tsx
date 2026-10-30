import { LoaderCircle, Search, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Form, Link, useFetcher, useSearchParams } from "react-router";

import { discipline } from "@tourbo/core/disciplines/index.ts";
import { PerformerKind } from "@tourbo/core/shared/types.ts";
import { useKinds } from "~/lib/kinds";
import { recordWork } from "~/lib/work";
import { BudgetLine, ContextControls, contextParams, IdeasBoardWithSpares, type ContextValue } from "~/components/context-controls";
import { IdeasError, IdeasLoading, type IdeasData } from "~/components/ideas-board";
import { ErrorLine, useLimits } from "~/components/state";

type Result = { ideas?: IdeasData; error?: string; retry?: boolean };
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { ideasError, ideasForCity, ideasInputs, writeAngles } from "../../server/agent/ideas.server";
import type { Route } from "./+types/ideas";

// Ideas for any city, no plan needed: /ideas?city=…&kind=…&act=… (act optional; an unknown act
// never blocks, the ideas then come from the city alone).

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.city ? `Ideas for ${loaderData.city} — Tourbo` : "Ideas for any city — Tourbo" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const parsed = PerformerKind.safeParse(url.searchParams.get("kind") ?? "musician");
  const kind = parsed.success ? parsed.data : "musician";
  return {
    city: (url.searchParams.get("city") ?? "").trim().slice(0, 80),
    kind,
    act: (url.searchParams.get("act") ?? "").trim().slice(0, 120),
    crowd: !!discipline(kind).crowdWork,
    // Performance context (?slot=&flavour=&b=): slot length and flavour set how many local ideas.
    inputs: ideasInputs(kind, { slot: url.searchParams.get("slot") ?? undefined, flavour: url.searchParams.get("flavour"), boundaries: url.searchParams.get("b") ?? undefined }),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    if (form.get("intent") === "angles") return { ideas: (await writeAngles(JSON.parse(String(form.get("payload"))))) as IdeasData };
    const parsed = PerformerKind.safeParse(form.get("kind"));
    const kind = parsed.success ? parsed.data : "musician";
    const city = String(form.get("city") ?? "").trim();
    if (!city) return { error: "Type a city first.", retry: false };
    const inputs = ideasInputs(kind, { slot: form.get("slot") ?? undefined, flavour: form.get("flavour"), boundaries: form.get("b") ?? undefined });
    return { ideas: (await ideasForCity({ city, kind, act: String(form.get("act") ?? ""), inputs })) as IdeasData };
  } catch (error) {
    return ideasError(error);
  }
}

// The empty page explains what comes back, in the same plain words the results use.
const WHAT: [string, string][] = [
  ["The idea", "A cover, a local topic or a subject that city's crowd loves, picked for what you do."],
  ["The fan number", "How much more that city's fans love it than most places. Tap “why?” for the detail."],
  ["A line to use it", "Optional: your AI assistant writes one, checked against the numbers. You edit it."],
];

export default function Ideas({ loaderData }: Route.ComponentProps) {
  const { city, kind, act, crowd, inputs } = loaderData;
  const kinds = useKinds();
  const [, setSearch] = useSearchParams();
  const load = useFetcher<Result>();
  const write = useFetcher<Result>();
  const ctx = contextParams(inputs);
  const ctxKey = Object.values(ctx).join(":");
  const fetchIdeas = () => load.submit({ intent: "ideas", city, kind, act, ...ctx }, { method: "post" });
  // Changing a control moves the URL; the effect below then makes that context's ideas.
  const setContext = (v: ContextValue) => setSearch({ city, kind, ...(act ? { act } : {}), ...contextParams(v) }, { replace: true, preventScrollReset: true });
  useEffect(() => {
    if (city) fetchIdeas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, kind, act, ctxKey]);
  const base = load.data?.ideas;
  // Keep the city in "Continue where you left off" once its ideas load.
  useEffect(() => {
    if (base && city) recordWork({ id: `ideas:${kind}:${city}:${act}`.toLowerCase(), kind: "ideas", title: `Ideas for ${act ? `${act} in ` : ""}${city}`, href: `/ideas?${new URLSearchParams({ city, kind, ...(act ? { act } : {}) })}` });
  }, [base, city, kind, act]);
  const sameCtx = (a?: IdeasData, b?: IdeasData) => JSON.stringify(a?.context ?? null) === JSON.stringify(b?.context ?? null);
  const written = write.data?.ideas && write.data.ideas.cities[0]?.city === base?.cities[0]?.city && sameCtx(write.data.ideas, base) ? write.data.ideas : undefined;
  const ideas = load.state === "idle" ? (written ?? base) : undefined;
  const error = load.state === "idle" && load.data?.error ? { error: load.data.error, retry: !!load.data.retry } : undefined;
  const writeError = write.data?.error;
  const writing = write.state !== "idle";
  // Fan data paused: new lookups would fail, so the page says so up front instead of after a click.
  const paused = useLimits().data;
  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-10 sm:py-14">
      <div>
        <h1 className="text-4xl text-balance sm:text-5xl">{city ? `Ideas for ${city}` : "Ideas for any city"}</h1>
        <p className="mt-3 max-w-prose text-lg text-muted-foreground">What to play, joke about or make there, from fan data.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
      <Form method="get" onSubmit={(e) => paused && e.preventDefault()} className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto sm:flex-wrap">
        {Object.entries(ctx).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="col-span-2 grid gap-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" defaultValue={city} placeholder="e.g. Brisbane" required className="sm:w-48" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kind">What you do</Label>
          <NativeSelect id="kind" name="kind" defaultValue={kind}>
            {kinds.filter((k) => k.enabled || k.kind === kind).map((k) => (
              <NativeSelectOption key={k.kind} value={k.kind}>
                {k.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="act">Your act (optional)</Label>
          <Input id="act" name="act" defaultValue={act} placeholder="Empty if unlisted" className="sm:w-56" />
        </div>
        <Button type="submit" variant={ideas || paused ? "outline" : "default"} data-primary={(!ideas && !paused) || undefined} aria-disabled={paused || undefined} aria-describedby={paused ? "ideas-paused" : undefined} onClick={(e) => paused && e.preventDefault()} className="col-span-2 max-sm:h-11 aria-disabled:cursor-not-allowed aria-disabled:border-dashed">
          <Search /> Get ideas
        </Button>
        {paused && (
          <p id="ideas-paused" className="col-span-2 self-center text-sm text-muted-foreground">
            Needs fresh fan data.
          </p>
        )}
      </Form>
        {ideas && (
          <write.Form method="post">
            <input type="hidden" name="intent" value="angles" />
            <input type="hidden" name="payload" value={base ? JSON.stringify(base) : ""} />
            <Button type="submit" data-primary disabled={!base || writing || !!written}>
              {writing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {writing ? "Writing…" : written ? "Angles written" : "Write my angles"}
            </Button>
          </write.Form>
        )}
      </div>
      {city && <ContextControls kind={kind} crowd={crowd} value={inputs} onChange={setContext} disabled={load.state !== "idle" || writing} />}
      {ideas && <BudgetLine data={ideas} />}
      {!city && (
        <section aria-labelledby="ideas-what" className="grid gap-6 border-t pt-8">
          <div>
            <h2 id="ideas-what" className="text-2xl">What each idea gives you</h2>
            <dl className="mt-3 divide-y border-y text-base">
              {WHAT.map(([term, meaning]) => (
                <div key={term} className="grid gap-0.5 py-3 sm:grid-cols-[9rem_1fr] sm:gap-6">
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-muted-foreground">{meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="grid content-start gap-2">
            {!paused && <p className="text-sm text-muted-foreground">Or try a city</p>}
            {!paused && (
              <div className="flex flex-wrap gap-2">
                {["Austin", "Glasgow", "Melbourne"].map((c) => (
                  <Button key={c} variant="outline" className="max-sm:h-11" nativeButton={false} render={<Link to={`/ideas?${new URLSearchParams({ city: c, kind })}`} />}>
                    {c}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
      {city && load.state !== "idle" && <IdeasLoading city={city} />}
      {error && <IdeasError message={error.error} retry={error.retry} onRetry={fetchIdeas} />}
      <ErrorLine message={writeError} retry={write.data?.retry} onRetry={() => base && write.submit({ intent: "angles", payload: JSON.stringify(base) }, { method: "post" })} />
      {writing && <p className="text-sm text-muted-foreground">Your AI assistant is writing one line per idea and checking each against the fan data… (~10 s)</p>}
      {ideas && <IdeasBoardWithSpares data={ideas} onRetry={fetchIdeas} />}
    </main>
  );
}
