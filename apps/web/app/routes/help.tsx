import { ArrowRight, Bot, ListMusic, Mail, MapPinned, UserRoundSearch } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import type { Route } from "./+types/help";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Help — Tourbo" }];
}

// Static: no plan ids here (no listing of other people's plans without sign-in).
// A short guide, read top to bottom: the main path first, then the other jobs as ruled rows.
const LEAD = {
  icon: MapPinned,
  title: "Plan a tour",
  body: "Say who you are, circle a home city and pick how many nights. Tourbo does the rest.",
  to: "/start?next=tour",
  cta: "Plan a tour",
};

const MORE = [
  {
    icon: UserRoundSearch,
    title: "Not listed? Start here",
    body: "Not in the fan data yet? Pick acts you sound like, your style, or just your city.",
    to: "/start?step=1",
    cta: "Start without a listing",
  },
  {
    icon: ListMusic,
    title: "Build your set",
    body: "Add songs or bits to your Library, then open a tour's Set. Tourbo orders them per city.",
    to: "/material",
    cta: "Open your Library",
  },
  {
    icon: Mail,
    title: "Book the rooms",
    body: "On a tour, Booking drafts one email per room. Nothing sends until you approve.",
    to: "/work",
    cta: "Open your tours",
  },
  {
    icon: Bot,
    title: "Use Tourbo from your own AI assistant",
    body: "Ask your own assistant for a tour. It uses the same tools as this site.",
    to: "/connect",
    cta: "Connect your assistant",
  },
];

const WORDS: [string, string][] = [
  ["Fan data", "Where your fans live and what else they love. Every suggestion shows its number."],
  ["why?", "Tap it next to any suggestion to see the numbers behind it."],
  ["Night", "One stop on a tour: a city, a room, a date and the money."],
  ["Ideas", "Covers, local topics or subjects a city's crowd loves. They season your act, never replace it."],
  ["Set", "Your own material in order for one night, with a local touch or two."],
  ["Notes", "What to say and do on stage that night, written from what the city loves."],
  ["Estimate", "Every money figure is an estimate. Check it with the venue before you sign."],
];

const FIXES: [string, string][] = [
  ["“Fan data is paused for now.”", "New fan lookups have hit their limit. Saved tours, sets and notes still open; new lookups come back when the limit resets."],
  ["A money figure looks wrong", "Tap “why?” to see what it's built from. Change the room or date on that night and the money updates."],
  ["My act isn't found", "Use “Start without a listing” and pick acts you sound like, your style, or just your city."],
  ["Did an email go out?", "Only if you sent it. Booking drafts every email; nothing leaves until you approve it."],
];

export default function Help() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-4xl text-balance sm:text-5xl">How to get the most from Tourbo</h1>
      <p className="mt-3 max-w-prose text-lg text-muted-foreground">Most people start with a tour. Ideas, sets, notes and booking all hang off it.</p>

      <section data-testid="help-card" aria-labelledby="help-lead" className="mt-10 grid gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 sm:p-6">
        <div className="min-w-0">
          <h2 id="help-lead" className="flex items-center gap-2.5 text-2xl">
            <LEAD.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden /> {LEAD.title}
          </h2>
          <p className="mt-1.5 text-base text-muted-foreground">{LEAD.body}</p>
        </div>
        <Button size="xl" className="justify-self-start max-sm:h-11" data-primary nativeButton={false} render={<Link to={LEAD.to} />}>
          {LEAD.cta} <ArrowRight />
        </Button>
      </section>

      <h2 className="mt-12 text-2xl">More you can do</h2>
      <ul className="mt-3 divide-y border-y">
        {MORE.map((c) => (
          <li key={c.title} data-testid="help-card" className="grid gap-3 py-5 sm:grid-cols-[1.5rem_1fr_auto] sm:items-baseline sm:gap-4">
            <c.icon className="hidden size-4 translate-y-0.5 text-muted-foreground sm:block" aria-hidden />
            <div className="min-w-0">
              <h3 className="font-sans text-base font-medium tracking-normal">{c.title}</h3>
              <p className="mt-0.5 text-base text-muted-foreground">{c.body}</p>
            </div>
            <Button size="sm" variant="outline" className="justify-self-start" nativeButton={false} render={<Link to={c.to} />}>
              {c.cta} <ArrowRight />
            </Button>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-2xl">Words Tourbo uses</h2>
      <dl className="mt-3 divide-y border-y text-base">
        {WORDS.map(([term, meaning]) => (
          <div key={term} className="grid gap-0.5 py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-6">
            <dt className="font-medium">{term}</dt>
            <dd className="text-muted-foreground">{meaning}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-2xl">When something looks off</h2>
      <dl className="mt-3 divide-y border-y text-base">
        {FIXES.map(([q, a]) => (
          <div key={q} className="py-3.5">
            <dt className="font-medium">{q}</dt>
            <dd className="mt-0.5 text-muted-foreground">{a}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-sm text-muted-foreground">
        Still stuck? Start over from{" "}
        <Link to="/" className="text-foreground underline underline-offset-4 hover:no-underline">
          the home page
        </Link>
        ; nothing you saved is lost.
      </p>
    </main>
  );
}
