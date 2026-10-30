import { Check, EyeOff, Info, LoaderCircle, Pin, Plus, Undo2 } from "lucide-react";
import { useState } from "react";

import type { CityWithFeedback, FeedbackChange, IdeaFeedback, IdeaMark, ShownCity } from "@tourbo/core/engine/idea-feedback.ts";
import { CATEGORY_LABEL, grouped, norm, type Idea } from "@tourbo/core/engine/ideas-rank.ts";
import type { IdeasResult } from "@tourbo/core/engine/ideas.ts";
import { IdeaTile } from "~/components/ideas/idea-tiles";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { ErrorLine, useLimits } from "~/components/state";
import { keepIdeaAsMaterial } from "~/lib/material";
import { neutral } from "~/lib/neutral";

export type IdeasData = IdeasResult & { act?: string; note?: string; dropped?: number };

// "Ideas for {city}": one city at a time (the tour page picks it from the nights rail), its ideas
// grouped by category as cards, each with one fan-data chip and "why?". Shared by /ideas and
// /plan/:id/ideas.

export function IdeasLoading({ city }: { city?: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Reading what {city ?? "each city"} loves…
      </p>
      <Skeleton className="h-4 w-28" />
      <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl p-3.5 ring-1 ring-foreground/10">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function IdeasError({ message, retry, onRetry, busy }: { message: string; retry?: boolean; onRetry?: () => void; busy?: boolean }) {
  return <ErrorLine boxed message={message} retry={retry} onRetry={onRetry} busy={busy} />;
}

// The act's feedback controls (plan ideas, owner only): Keep / More like this / Not for me.
export type BoardFeedback = { marks: IdeaFeedback; busy: boolean; onChange: (c: FeedbackChange) => void };

// What a city with no ideas says, and its one way on (e.g. "See Chicago's covers").
export type EmptyAction = { text: string; action?: React.ReactNode };

const short = (c: string) => c.split(",")[0].trim().toLowerCase();

// city: the night picked in the tour's nights rail (one city picker per screen); otherwise the first.
// compact: the night panel (no basis lines; the page above it says them).
export function IdeasBoard({ data, city, onRetry, feedback, empty, lead, compact }: { data: IdeasData; city?: string; onRetry?: () => void; feedback?: BoardFeedback; empty?: (c: ShownCity) => EmptyAction | undefined; lead?: React.ReactNode; compact?: boolean }) {
  const limits = useLimits();
  const c = (city && data.cities.find((x) => short(x.city) === short(city))) || data.cities[0];
  const [all, setAll] = useState(false);
  if (!c) return null;
  const spare = c.spare?.length ?? 0;
  const shown = all && spare ? { ...c, ideas: [...c.ideas, ...(c.spare ?? [])] } : c;
  return (
    <div className="@container min-w-0 space-y-5">
      {!compact && (
      <>
      <p className="max-w-prose text-sm text-pretty text-muted-foreground" data-testid="ideas-basis">
        {c.ideas.length > 0 && <span className="font-medium text-foreground">{neutral(data.frame)} </span>}
        {neutral(data.basisLine)}
        {lead && <> {lead}</>}
      </p>
      {data.note && <p className="text-sm text-muted-foreground">{neutral(data.note)}</p>}
      {/visual|photo|film|maker/.test(data.kind) && <p className="text-xs text-muted-foreground">{neutral(data.label)}</p>}
      </>
      )}
      {data.partial && !limits.data && !compact && (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0" aria-hidden />
          <span>Some fan data didn't load, so a few ideas may be missing.</span>
          {onRetry && (
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
        </p>
      )}
      <CityIdeasView key={c.city} city={shown} kind={data.kind} feedback={feedback} empty={empty?.(c)} />
      {spare > 0 && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2.5 max-sm:h-11" aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? "Show only the picks" : `Show ${spare} more to look through`}
        </Button>
      )}
    </div>
  );
}

function CityIdeasView({ city: c, kind, feedback, empty }: { city: ShownCity; kind: string; feedback?: BoardFeedback; empty?: EmptyAction }) {
  const city = c as CityWithFeedback;
  const isPinned = (i: Idea) => !!city.pinned?.some((r) => norm(r) === norm(i.ref));
  const kept = feedback ? city.ideas.filter(isPinned) : [];
  // With feedback, categories follow the act's order (wanted first); kept ideas get their own group.
  const groups = grouped(city.ideas.filter((i) => !kept.includes(i)));
  if (feedback) groups.sort((a, b) => city.ideas.indexOf(a.ideas[0]) - city.ideas.indexOf(b.ideas[0]));
  const tile = (idea: Idea) => (
    <IdeaTile
      key={idea.ref}
      idea={idea}
      city={city.city}
      kind={kind}
      pinned={feedback ? isPinned(idea) : undefined}
      actions={feedback && <IdeaActions idea={idea} city={city.city} kind={kind} pinned={isPinned(idea)} more={feedback.marks.more.some((m) => norm(m.city) === norm(city.city) && norm(m.ref) === norm(idea.ref))} feedback={feedback} />}
    />
  );
  const fallback = city.empty ?? `No ideas for ${city.city} yet.`;
  return (
    <section className="space-y-6" data-testid="city-ideas" data-city={city.city} aria-label={`Ideas for ${city.city}`}>
      {!city.ideas.length && (
        <div className="space-y-3 rounded-xl border border-dashed px-4 py-4 text-sm" data-testid="ideas-empty">
          <p className="max-w-prose text-pretty text-muted-foreground">{empty?.text ?? fallback}</p>
          {empty?.action && <div className="flex flex-wrap items-center gap-2">{empty.action}</div>}
        </div>
      )}
      {kept.length > 0 && <Group label="Kept" ideas={kept} tile={tile} testid="kept-ideas" wide />}
      {groups.length > 0 && (
        <div className="grid items-start gap-x-4 gap-y-6 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {groups.map((g) => (
            <Group key={g.category} label={g.label} ideas={g.ideas} tile={tile} />
          ))}
        </div>
      )}
      {feedback && city.noMore?.length ? (
        <p className="text-sm text-muted-foreground" role="status">
          No more {city.noMore.map((x) => CATEGORY_LABEL[x].toLowerCase()).join(" or ")} saved for {city.city} yet. Refresh ideas under Tune ideas to look again.
        </p>
      ) : null}
      {feedback && city.hidden?.length ? <HiddenIdeas city={city.city} hidden={city.hidden} feedback={feedback} /> : null}
    </section>
  );
}

// A category's cards; categories sit side by side (one column each), kept ideas span the row.
function Group({ label, ideas, tile, testid, wide }: { label: string; ideas: Idea[]; tile: (i: Idea) => React.ReactNode; testid?: string; wide?: boolean }) {
  return (
    <div className="min-w-0 space-y-2.5" data-testid={testid}>
      <h3 className="flex items-baseline gap-2 text-sm font-medium">
        {label} <span className="num text-xs font-normal text-muted-foreground">{ideas.length}</span>
      </h3>
      <div className={wide ? "grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3" : "grid gap-3"}>{ideas.map(tile)}</div>
    </div>
  );
}

const markOf = (city: string, i: Idea): IdeaMark => ({ city, ref: i.ref, category: i.category });

function IdeaActions({ idea, city, kind, pinned, more, feedback }: { idea: Idea; city: string; kind?: string; pinned: boolean; more: boolean; feedback: BoardFeedback }) {
  const mark = markOf(city, idea);
  const { busy, onChange } = feedback;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={pinned ? "secondary" : "outline"}
        className="max-sm:h-11"
        disabled={busy}
        aria-pressed={pinned}
        aria-label={`Keep ${idea.ref}`}
        onClick={() => {
          onChange({ op: pinned ? "unpin" : "pin", mark });
          // Kept ideas also land in the act's Library as local ideas (once per idea + city).
          if (!pinned) keepIdeaAsMaterial(idea, city, kind).catch(() => {});
        }}
      >
        {pinned ? <Check /> : <Pin />} {pinned ? "Kept" : "Keep"}
      </Button>
      <Button type="button" size="icon-sm" variant={more ? "secondary" : "ghost"} className="max-sm:size-11" disabled={busy} aria-pressed={more} aria-label={`More like ${idea.ref}`} title="More like this" onClick={() => onChange({ op: more ? "unmore" : "more", mark })}>
        {more ? <Check /> : <Plus />}
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground max-sm:size-11" disabled={busy} aria-label={`Not for me: hide ${idea.ref} and ideas like it`} title="Not for me" onClick={() => onChange({ op: "hide", mark })}>
        <EyeOff />
      </Button>
    </>
  );
}

// Hidden ideas stay one tap away: "3 hidden · Show", each with Undo (or the note that hid it).
function HiddenIdeas({ city, hidden, feedback }: { city: string; hidden: NonNullable<CityWithFeedback["hidden"]>; feedback: BoardFeedback }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 px-3 py-2 text-sm" data-testid="hidden-ideas">
      <p className="flex items-center gap-2 text-muted-foreground">
        <EyeOff className="size-4" aria-hidden /> {hidden.length} hidden in {city}
        <Button type="button" size="sm" variant="ghost" className="ml-auto max-sm:h-11" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide list" : "Show"}
        </Button>
      </p>
      {open && (
        <ul className="space-y-1">
          {hidden.map((h) => (
            <li key={`${h.ref}-${h.reason}`} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{h.ref}</span>
              <span className="text-xs text-muted-foreground">{h.reason === "note" ? "by your note" : h.reason === "similar" ? `like ${h.by?.ref}` : "not for you"}</span>
              {h.by && (
                <Button type="button" size="sm" variant="ghost" className="ml-auto max-sm:h-11" disabled={feedback.busy} onClick={() => feedback.onChange({ op: "unhide", mark: h.by! })}>
                  <Undo2 /> Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
