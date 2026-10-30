import { ChevronLeft, ChevronRight, MapPin, Navigation, Quote } from "lucide-react";
import { Link } from "react-router";

import { db } from "@tourbo/core/db/client.server.ts";
import { stopKey } from "@tourbo/core/engine/edit.ts";
import { getEventSet } from "@tourbo/core/material/material.server.ts";
import { formatMoney } from "~/components/city-card";
import { Hint } from "~/components/hint";
import { FactChip } from "~/components/insight";
import { NotesSections } from "~/components/plan-workspace";
import { formatNumber } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { setName } from "~/lib/labels";
import { keepOnViewChange } from "~/lib/plan-nav";
import { ideaChip, mapLink, played, roadNight } from "~/lib/tour-tabs";
import { cn } from "~/lib/utils";
import { nightExtras } from "../../server/agent/nights.server";
import { getRun } from "../../server/agent/runs.server";
import type { Route } from "./+types/plan.$id.road";

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = 86_400_000;

// Tonight (surface brief, phone on the road): one night on one short page. The room and where it
// is, the set in order (from the Library when the night has one, else the built set), the opening
// line, the top three ideas with their fan-data chips, and the rest of the notes folded. DB only.
export async function loader({ params, request }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run?.plan) throw new Response("Not found", { status: 404 });
  const today = new Date().toISOString().slice(0, 10);
  const asked = Number(new URL(request.url).searchParams.get("night"));
  const road = roadNight(run.plan, today);
  const n = asked >= 1 && asked <= run.plan.stops.length ? asked : (road.night ?? Math.max(1, run.plan.stops.findIndex(played) + 1));
  const stop = run.plan.stops[n - 1];
  const [extras, library] = await Promise.all([nightExtras(run).catch(() => undefined), librarySet(run.id, stopKey(stop)).catch(() => [])]);
  return {
    n,
    count: run.plan.stops.length,
    kind: run.plan.artist.kind,
    stop,
    today,
    ideas: extras?.ideas[n - 1]?.slice(0, 3) ?? [],
    set: library.length ? library.map((m) => ({ title: m.title, minutes: m.lengthMin, local: m.origin !== "original" })) : (extras?.set[n - 1] ?? []),
    prep: extras?.prep[n - 1],
  };
}

// The night's own show (synced from the tour) and its set from the Library.
async function librarySet(runId: string, key: string) {
  const sql = await db();
  const [ev] = await sql<{ id: string }[]>`select id from events where tour_id = ${runId} and stop_key = ${key} limit 1`;
  return ev ? getEventSet(ev.id) : [];
}

export const shouldRevalidate = keepOnViewChange;

export default function Tonight({ loaderData: d, params }: Route.ComponentProps) {
  const s = d.stop;
  const base = `/plan/${params.id}`;
  const opening = d.prep?.items.find((x) => x.section === "opening")?.text;
  const rest = d.prep && { ...d.prep, hook: "", items: d.prep.items.filter((x) => x.section !== "opening") };
  const minutes = d.set.reduce((a, x) => a + (x.minutes ?? 0), 0);
  const days = s.date ? Math.round((new Date(`${s.date}T12:00:00`).getTime() - new Date(`${d.today}T12:00:00`).getTime()) / DAY) : undefined;
  const when = days === undefined ? "Date to set" : days === 0 ? "Tonight" : days === 1 ? "Tomorrow" : days > 1 ? `In ${days} days` : "Played";
  const nav = (to: number) => `${base}/tonight?night=${to}`;

  return (
    <article className="mx-auto max-w-xl space-y-6 pb-8" data-testid="tonight">
      <header className="flex items-stretch gap-4">
        <TicketStub date={s.date} />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-xs font-medium text-muted-foreground">{when}</p>
          <h2 className="font-heading text-3xl leading-tight">{s.city.name}</h2>
          {s.venue ? (
            <p className="mt-0.5 flex items-start gap-1.5 text-sm">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="font-medium">{s.venue.name}</span>
                {s.capacity && <span className="text-muted-foreground"> · ~{formatNumber(s.capacity.max)} people</span>}
                {s.venue.address && <span className="block text-muted-foreground">{s.venue.address}</span>}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">No room picked yet. Pick one on the Plan tab.</p>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={mapLink(s)} target="_blank" rel="noreferrer" />}>
          <Navigation /> Directions
        </Button>
        {s.money && played(s) && (
          <span className="text-sm text-muted-foreground">
            <span className={cn("num font-medium", s.money.profit >= 0 ? "text-success" : "text-destructive")}>{formatMoney(s.money.profit, s.money.currency)}</span> profit est. · ~{formatNumber(s.money.tickets)} tickets
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label="Previous night" disabled={d.n <= 1} nativeButton={false} render={<Link to={nav(d.n - 1)} preventScrollReset />}>
            <ChevronLeft />
          </Button>
          <span className="num text-xs text-muted-foreground">
            {d.n} of {d.count}
          </span>
          <Button size="icon-sm" variant="ghost" aria-label="Next night" disabled={d.n >= d.count} nativeButton={false} render={<Link to={nav(d.n + 1)} preventScrollReset />}>
            <ChevronRight />
          </Button>
        </span>
      </div>

      {opening && (
        <figure className="rounded-xl bg-muted/50 px-4 py-3.5">
          <figcaption className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Quote className="size-3.5" aria-hidden /> Open with
          </figcaption>
          <blockquote className="font-heading text-xl leading-snug">{opening}</blockquote>
        </figure>
      )}

      <Section title={setName(d.kind)} aside={minutes ? `${Math.round(minutes)} min` : undefined}>
        {d.set.length ? (
          <ol className="divide-y rounded-xl ring-1 ring-border">
            {d.set.map((x, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="num w-5 shrink-0 text-right text-sm text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 text-base">{x.title}</span>
                {x.local && <Badge variant="outline">local</Badge>}
                {x.minutes ? <span className="num shrink-0 text-xs text-muted-foreground">{Math.round(x.minutes)}′</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <Friendly to={`${base}/set?night=${d.n}`} action="Build the set">
            No set for tonight yet. Two minutes on the Set tab and it'll be here, in order.
          </Friendly>
        )}
      </Section>

      <Section title="Three ideas for this crowd">
        {d.ideas.length ? (
          <ul className="space-y-3">
            {d.ideas.map((x, i) => {
              const chip = ideaChip(x.why);
              return (
                <li key={i} className="space-y-1">
                  <p className="font-medium">{x.idea}</p>
                  {x.angle && <p className="text-sm text-muted-foreground">{x.angle}</p>}
                  <p className="flex flex-wrap items-center gap-1.5">
                    <FactChip text={chip.text} meter={chip.meter} hedged={chip.hedged} />
                    <Hint text="why?" label={`Why ${x.idea}`}>
                      {x.why}
                    </Hint>
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <Friendly to={`${base}/ideas?night=${d.n}`} action="Find ideas">
            Nothing picked for {s.city.name} yet. The Ideas tab finds what this city's fans love.
          </Friendly>
        )}
      </Section>

      <Section title="Show notes">
        {rest && rest.items.length ? (
          <NotesSections prep={rest} open={["setlist"]} />
        ) : (
          <Friendly to={`${base}/prep?night=${d.n}`} action="Write notes">
            No notes yet. Tourbo can draft an opening line and what to say, from what this city loves.
          </Friendly>
        )}
      </Section>
    </article>
  );
}

// A ticket stub: weekday, big day number, month, with a perforated edge.
function TicketStub({ date }: { date?: string }) {
  const d = date ? new Date(`${date}T12:00:00`) : undefined;
  return (
    <div className="relative flex w-20 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg bg-foreground px-2 pt-3 pb-2 text-background" role="img" aria-label={d ? d.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" }) : "Date to set"}>
      {/* Ink stub, a thin tomato tear-strip as the only accent. */}
      <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden />
      <span className="text-xs font-medium uppercase opacity-90" aria-hidden>
        {d ? d.toLocaleDateString("en", { weekday: "short" }) : "Date"}
      </span>
      <span className="num font-heading text-4xl leading-none" aria-hidden>
        {d ? d.getDate() : "?"}
      </span>
      <span className="text-xs font-medium uppercase opacity-90" aria-hidden>
        {d ? d.toLocaleDateString("en", { month: "short" }) : "to set"}
      </span>
      <span className="absolute inset-y-2 -right-px border-r-2 border-dashed border-background/70" aria-hidden />
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-baseline justify-between gap-2 font-heading text-xl">
        {title}
        {aside && <span className="num font-sans text-xs text-muted-foreground">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

function Friendly({ to, action, children }: { to: string; action: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <p className="min-w-0 flex-1 basis-56">{children}</p>
      <Button size="xs" variant="outline" nativeButton={false} render={<Link to={to} />}>
        {action}
      </Button>
    </div>
  );
}
