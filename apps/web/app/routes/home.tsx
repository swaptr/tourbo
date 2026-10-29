import { ArrowRight, Bot, Mail, MapPinned, NotebookPen, Sparkles, Wallet, Wrench } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { recentRuns } from "../../server/agent/runs.server";
import { REGION_NAMES, type Region } from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Tourbo: the tour manager small acts can't afford" },
    { name: "description", content: "Plan a tour that pays: where your fans are, which rooms, what to charge, what to say on stage. Qloo + Claude." },
  ];
}

export async function loader() {
  // The landing page still works if the DB is down; only the recent list is lost.
  return { recent: await recentRuns().catch(() => []) };
}

const OUTCOMES = [
  { icon: MapPinned, title: "A tour that makes sense", body: "Cities where your fans actually live, routed with sane drives and days off." },
  { icon: Wallet, title: "The money for every night", body: "Room, deal, ticket price and expected profit, so you skip the nights that lose money." },
  { icon: NotebookPen, title: "What to say on stage", body: "Openers, setlist nods, local bits and banter for each city, every reference from real taste data." },
  { icon: Mail, title: "Venue emails, ready to send", body: "Inquiries with the numbers that make your case, and counter-offers when a venue lowballs you." },
];

const WHO = [
  { icon: Sparkles, name: "Qloo", body: "Knows taste: where your fans cluster, which rooms and local acts they like, what each city loves." },
  { icon: Wrench, name: "Tourbo tools (MCP)", body: "Turn that into tour math: city scores, rooms, openers, money per night, routes, offer checks." },
  { icon: Bot, name: "Claude", body: "The agent. Uses the tools, weighs the trade-offs, writes your notes and emails. You approve." },
];

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <section className="container mx-auto max-w-4xl px-4 pt-16 pb-12 text-center">
        <p className="text-sm font-medium text-indigo-600">For musicians and comedians without a booking agent</p>
        <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Plan a tour that pays.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Tell Tourbo who you are and where you want to play. Its agent finds where your fans are, books the right rooms, runs the
          numbers for every night and writes what to say on stage.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" nativeButton={false} render={<Link to="/start" />}>
            Plan my tour <ArrowRight />
          </Button>
          <Button size="lg" variant="outline" nativeButton={false} render={<Link to="/connect" />}>
            Use it from my own Claude
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Takes about two minutes. Nothing is sent to anyone without your OK.</p>
      </section>

      <section className="container mx-auto max-w-5xl px-4 pb-14">
        <h2 className="text-center text-sm font-medium text-muted-foreground">What you leave with</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OUTCOMES.map((o) => (
            <div key={o.title} className="rounded-xl p-4 ring-1 ring-foreground/10">
              <o.icon className="size-5 text-indigo-600" />
              <p className="mt-3 font-medium">{o.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{o.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="container mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-center font-heading text-xl font-semibold">Who does what</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {WHO.map((w, i) => (
              <li key={w.name} className="rounded-xl bg-background p-4 ring-1 ring-foreground/10">
                <p className="flex items-center gap-2 font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">{i + 1}</span>
                  <w.icon className="size-4 text-indigo-600" /> {w.name}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{w.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            The same tools run inside this site and in your own Claude Code or Claude Desktop.{" "}
            <Link to="/connect" className="underline">
              Connect in one line
            </Link>
            . Run a bar or venue?{" "}
            <Link to="/explore" className="underline">
              Find acts for your room
            </Link>
            .
          </p>
        </div>
      </section>

      {loaderData.recent.length > 0 && (
        <section className="container mx-auto max-w-3xl px-4 py-12">
          <h2 className="text-sm font-medium text-muted-foreground">Recent tours</h2>
          <ul className="mt-2 divide-y rounded-xl ring-1 ring-foreground/10">
            {loaderData.recent.map((run) => (
              <li key={run.id}>
                <Link to={`/plan/${run.id}`} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <span className="font-medium">{run.artistName}</span>
                  <span className="text-muted-foreground">
                    {run.shows} shows · {REGION_NAMES[run.region as Region] ?? run.region}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
