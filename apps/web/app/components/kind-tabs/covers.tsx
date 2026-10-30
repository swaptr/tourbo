import { Hint } from "~/components/hint";
import { FactChip } from "~/components/insight";
import { cn } from "~/lib/utils";
import { KindTabFrame, NightRows, useLeadNight } from "./frame";
import type { KindTabData } from "./index";
import { AddToSet } from "./night-action";

type Cover = KindTabData["covers"][number][number];

// Musicians: one cover per night, ranked by over-index: how much higher your fans in this city rank
// the artist than your fans elsewhere (fan data). The chip and bar show this city's rank; the
// rank elsewhere is behind why?. Each pick says where on the tour it lands hardest and how to
// make it yours, from real tags only (the artist's genre, your style).
const yourWay = (c: Cover) =>
  c.genre && c.style ? `Their ${c.genre}, played your ${c.style} way.` : c.style ? `Played your ${c.style} way.` : c.genre ? `Their ${c.genre}, stripped back to the melody.` : undefined;

// Chip = this city's rank (short, one line on a phone); the bar follows it (#1 full, #10 a sliver).
const rankText = (c: Cover) => (c.cityRank ? `#${c.cityRank} here` : "ranks higher here");
const rankMeter = (c: Cover) => (c.cityRank ? Math.max(0.1, 1 - (c.cityRank - 1) / 10) : undefined);
const elsewhere = (c: Cover) => (c.overallRank ? `#${c.overallRank} with your fans elsewhere. ` : "Not in your fans' top list elsewhere. ");

export function CoversTab({ data }: { data: KindTabData }) {
  const stops = data.plan.stops;
  const lead = useLeadNight(stops, (i) => !!data.covers[i]?.length);
  // Where each cover lands hardest across the tour (highest lift).
  const best = new Map<string, { i: number; value: number; n: number }>();
  Object.entries(data.covers).forEach(([i, list]) =>
    list.slice(0, 3).forEach((c) => {
      const b = best.get(c.ref);
      best.set(c.ref, !b || c.value > b.value ? { i: Number(i), value: c.value, n: (b?.n ?? 0) + 1 } : { ...b, n: b.n + 1 });
    }),
  );
  return (
    <KindTabFrame title="Covers" line="One cover a night: the artist your fans in that city rank far above your fans elsewhere. Your own songs still lead.">
      <NightRows
        stops={stops}
        empty="No cover stands out here in the fan data. Play your own."
        render={(s, i) => {
          const list = data.covers[i]?.slice(0, 3);
          if (!list?.length) return null;
          const [top, ...alts] = list;
          const way = yourWay(top);
          return (
            <div className="space-y-2">
              <CoverLine c={top} i={i} best={best} city={s.city.name} stops={stops} lead />
              {way && <p className="text-sm text-pretty text-muted-foreground">{way}</p>}
              <AddToSet stop={s} kind={data.kind} ref={top.ref} category="cover" label="Cover" primary={i === lead} />
              {alts.length > 0 && (
                <div className="space-y-1.5 border-t pt-2">
                  <p className="text-xs text-muted-foreground">Next best here</p>
                  {alts.map((c) => (
                    <CoverLine key={c.ref} c={c} i={i} best={best} city={s.city.name} stops={stops} />
                  ))}
                </div>
              )}
            </div>
          );
        }}
      />
    </KindTabFrame>
  );
}

function CoverLine({ c, i, best, city, stops, lead }: { c: Cover; i: number; best: Map<string, { i: number; value: number; n: number }>; city: string; stops: KindTabData["plan"]["stops"]; lead?: boolean }) {
  const b = best.get(c.ref);
  const where = !b || b.n < 2 ? undefined : b.i === i ? "Lands hardest here" : `Lands harder in ${stops[b.i]?.city.name}`;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="cover" data-ref={c.ref}>
      <span className={cn(lead ? "text-base font-semibold" : "text-sm font-medium")}>{c.ref}</span>
      <span className="inline-flex flex-nowrap items-center gap-2">
        <FactChip text={rankText(c)} meter={rankMeter(c)} hedged={!c.cityRank || c.cityRank > 5} />
        <Hint text="why?" label={`why ${c.ref} in ${city}`}>
          {elsewhere(c)}
          {c.why}
        </Hint>
      </span>
      {where && <span className={cn("text-xs", b?.i === i ? "rounded-full border px-1.5 leading-5 text-foreground" : "text-muted-foreground")}>{where}</span>}
    </p>
  );
}
