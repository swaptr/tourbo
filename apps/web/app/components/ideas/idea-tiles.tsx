import { MapPin, MessageCircle } from "lucide-react";

import { segments, type Idea } from "@tourbo/core/engine/ideas-rank.ts";
import { Hint } from "~/components/hint";
import { FactChip } from "~/components/insight";
import { RichLine } from "~/components/rich-line";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { plainWhy } from "~/lib/idea-why";
import { ideaChip } from "~/lib/tour-tabs";
import { neutral } from "~/lib/neutral";
import { cn } from "~/lib/utils";

// One idea card, the same anatomy for every kind: the name, one line on how to use it, one evidence
// chip (this city's rank in the fan data, on the ramp) and "why?" with the numbers. Covers (kinds
// without a Covers tab) add the artist's picture; places add where to see them.

const SUBJECT = new Set<Idea["category"]>(["landmarks", "themes", "artists_films"]);
export const isSubject = (idea: Idea, kind: string) => SUBJECT.has(idea.category) && /visual|photo|film|maker|painter/.test(kind);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function IdeaWhy({ idea, city }: { idea: Idea; city: string }) {
  const w = plainWhy(neutral(idea.why));
  return (
    <Hint text="why?" label={`Why ${idea.ref} in ${city}`} align="end">
      <p>{w.line}</p>
      {idea.cities?.length ? <p className="mt-1">Also ranks in {idea.cities.join(", ")}.</p> : null}
      {w.strength !== undefined && (
        <p className="mt-1 text-muted-foreground">
          Fan data · local strength <span className="num">{w.strength}</span> of 100
        </p>
      )}
    </Hint>
  );
}

// actions: the act's Keep / More like this / Not for me (owner only); pinned: kept.
export function IdeaTile({ idea, city, kind, actions, pinned }: { idea: Idea; city: string; kind: string; actions?: React.ReactNode; pinned?: boolean }) {
  const chip = ideaChip(idea.why);
  const cover = idea.category === "cover";
  const place = isSubject(idea, kind) && (idea.category === "landmarks" || idea.type === "place");
  const names = (idea.names ?? [idea.ref, city]).filter((n) => n !== idea.ref);
  const angle = idea.angle.replace(/^(Premise|Local example): /, "");
  return (
    <article
      data-testid="idea"
      data-ref={idea.ref}
      data-category={idea.category}
      data-pinned={pinned || undefined}
      aria-label={idea.ref}
      className={cn("flex flex-col gap-2 rounded-xl bg-card p-3.5 text-sm ring-1 ring-foreground/10", pinned && "ring-foreground/40")}
    >
      <div className="flex items-start gap-3">
        {cover && (
          <Avatar>
            {idea.image && <AvatarImage src={idea.image} alt="" />}
            <AvatarFallback>{initials(idea.ref)}</AvatarFallback>
          </Avatar>
        )}
        <h4 className="min-w-0 flex-1 pt-0.5 text-base leading-snug font-medium text-pretty">{idea.ref}</h4>
        <IdeaWhy idea={idea} city={city} />
      </div>
      {angle && <RichLine parts={segments(angle, names)} className="text-pretty text-muted-foreground" />}
      {idea.question && (
        <p className="flex gap-1.5 text-muted-foreground">
          <MessageCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            “<RichLine parts={segments(idea.question, [idea.ref, ...names])} />”
          </span>
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-muted-foreground">
        <FactChip text={chip.text} meter={chip.meter} hedged={chip.hedged} />
        {place && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> See it in {city.split(",")[0]}
          </span>
        )}
        {actions && <span className="ml-auto flex items-center gap-0.5">{actions}</span>}
      </div>
    </article>
  );
}
