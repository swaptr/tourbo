import { MessageCircleQuestion } from "lucide-react";

import { discipline, workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { COURSE_LABEL, COURSES, MARKER_LABEL, PART_LABEL, PARTS, type MaterialDetails } from "@tourbo/core/material/material.ts";
import { formatMoney } from "~/components/city-card";
import { formatNumber } from "~/components/trace";
import { cn } from "~/lib/utils";

// The Set's interior per kind (workspaceFor(kind).set.style), on top of the plain running order:
//   setlist → energy curve across the set, key and tempo per song
//   bits    → opener / callback / closer markers and the crowd-work slot
//   hang / stall → the wall (or table) as an ordered grid with size and price
//   menu    → the menu card by course
//   class / order → timed segments (start time per item; parts of the class as one bar)
// Everything comes from the act's own Library details; nothing is invented.

export type ShapeItem = { id?: string; title: string; lengthMin?: number; details?: MaterialDetails };

// A built running order (pasted list → engine moves) as shape items: the move stands in for the
// Library details it doesn't have (peak = top energy, breather = low, open / close = markers).
const MOVE_ENERGY: Record<string, number> = { breather: 2, open: 4, keep: 3, build: 4, nod: 3, crowd: 3, peak: 5, close: 5 };
export const fromMoves = (order: { title: string; minutes?: number; move?: string }[]): ShapeItem[] =>
  order.map((e) => ({
    title: e.title,
    lengthMin: e.minutes,
    details: { energy: e.move ? MOVE_ENERGY[e.move] : undefined, marker: e.move === "open" ? "opener" : e.move === "close" ? "closer" : undefined },
  }));

const clock = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;
export const startTimes = (items: ShapeItem[]) => items.reduce<number[]>((a, x, i) => [...a, i ? a[i - 1] + (items[i - 1].lengthMin ?? 0) : 0], []);

// Per-row details: chips after the title.
export function SetRowMeta({ kind, item, start }: { kind: string; item: ShapeItem; start?: number }) {
  const style = workspaceFor(kind).set.style;
  const d = item.details ?? {};
  const chip = "rounded-full border px-1.5 text-xs leading-5 text-muted-foreground";
  if (style === "setlist")
    return (
      <>
        {d.key && <span className={chip}>{d.key}</span>}
        {d.bpm && <span className={cn(chip, "num")}>{d.bpm} bpm</span>}
      </>
    );
  if (style === "bits") return d.marker ? <span className={cn(chip, d.marker === "closer" && "border-foreground/40 text-foreground")}>{MARKER_LABEL[d.marker]}</span> : null;
  if (style === "menu") return d.course ? <span className={chip}>{COURSE_LABEL[d.course]}</span> : null;
  if (style === "hang" || style === "stall") return d.size ? <span className={chip}>{d.size}</span> : null;
  if (style === "class" || style === "order")
    return (
      <>
        {d.part && <span className={chip}>{PART_LABEL[d.part]}</span>}
        {start !== undefined && <span className="num w-10 shrink-0 text-right text-xs text-muted-foreground">{clock(start)}</span>}
      </>
    );
  return null;
}

// Comics (and anyone whose ideas carry crowd questions): a slot after the opener for crowd work.
export function CrowdSlot({ kind }: { kind: string }) {
  if (workspaceFor(kind).set.style !== "bits" || !discipline(kind as never).crowdWork) return null;
  return (
    <li className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground" data-testid="crowd-slot">
      <span className="w-5 shrink-0" aria-hidden />
      <MessageCircleQuestion className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">Crowd work · 2–3 min. Ask one of this city's questions.</span>
    </li>
  );
}

// The shape above the list. Renders nothing when the set is empty or the kind has no shape.
export function SetShape({ kind, items, currency }: { kind: string; items: ShapeItem[]; currency?: string }) {
  if (!items.length) return null;
  const style = workspaceFor(kind).set.style;
  if (style === "setlist") return <EnergyCurve items={items} />;
  if (style === "bits") return <BitsLine items={items} />;
  if (style === "hang" || style === "stall") return <Wall items={items} stall={style === "stall"} currency={currency} />;
  if (style === "menu") return <MenuCard items={items} />;
  if (style === "class") return <ClassBar items={items} />;
  return null;
}

const Note = ({ children }: { children: string }) => <p className="text-xs text-muted-foreground">{children}</p>;

function EnergyCurve({ items }: { items: ShapeItem[] }) {
  const e = items.map((x) => x.details?.energy);
  const known = e.filter((x): x is number => x !== undefined);
  if (known.length < 2) return <Note>Give your songs an energy (1–5) in the Library to see the set's shape here.</Note>;
  const W = 100;
  const H = 28;
  const x = (i: number) => (items.length === 1 ? W / 2 : (i / (items.length - 1)) * W);
  const y = (v: number) => H - 3 - ((v - 1) / 4) * (H - 6);
  const pts = e.map((v, i) => (v === undefined ? undefined : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => !!p);
  const peak = e.indexOf(Math.max(...known));
  const dip = e.findIndex((v, i) => i > 0 && i < e.length - 1 && v !== undefined && v <= Math.min(...known));
  const ends = known.at(-1)! >= Math.max(...known) - 1 ? "ends near the top" : "ends lower than it peaks";
  return (
    <figure className="space-y-1" data-testid="energy-curve">
      <div className="relative h-12">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={`Energy across the set, song by song: ${e.map((v) => v ?? "not set").join(", ")}`}>
          <line x1="0" x2={W} y1={H - 3} y2={H - 3} className="stroke-border" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" className="stroke-foreground/70" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Dots in HTML so they stay round; the peak carries its song number. */}
        {e.map((v, i) =>
          v === undefined ? null : (
            <span key={i} aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(v) / H) * 100}%` }}>
              <span className={cn("block rounded-full bg-foreground ring-2 ring-card", i === peak ? "size-2.5" : "size-1.5")} />
              {i === peak && <span className="num absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-xs font-medium">#{i + 1}</span>}
            </span>
          ),
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Energy: peaks at #{peak + 1}
        {dip > 0 && `, breathes at #${dip + 1}`}, {ends}.
      </figcaption>
    </figure>
  );
}

function BitsLine({ items }: { items: ShapeItem[] }) {
  const m = items.map((x) => x.details?.marker);
  const notes: string[] = [];
  if (!m.includes("closer")) notes.push("Mark your strongest bit as the closer.");
  else if (m.at(-1) !== "closer") notes.push("Your closer isn't last.");
  const cb = m.indexOf("callback");
  if (cb === 0) notes.push("A callback needs something earlier to call back to.");
  const callbacks = m.filter((x) => x === "callback").length;
  if (!notes.length) return <Note>{callbacks ? `Opener first, ${callbacks} callback${callbacks === 1 ? "" : "s"}, closer last. Good shape.` : "Opener first, closer last. Good shape."}</Note>;
  return <Note>{notes.join(" ")}</Note>;
}

function Wall({ items, stall, currency }: { items: ShapeItem[]; stall: boolean; currency?: string }) {
  const price = (n: number) => (currency ? formatMoney(n, currency) : formatNumber(n));
  const priced = items.filter((x) => x.details?.price !== undefined);
  const total = priced.reduce((a, x) => a + (x.details?.price ?? 0), 0);
  return (
    <figure className="space-y-1.5" data-testid="wall">
      <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" aria-label={stall ? "The table, in order" : "The wall, left to right"}>
        {items.map((x, i) => (
          <li key={x.id ?? i} className="flex aspect-[4/3] flex-col justify-between rounded-md bg-muted/50 p-1.5 ring-1 ring-border">
            <span className="num text-xs text-muted-foreground">{i + 1}</span>
            <span className="line-clamp-2 text-xs leading-tight font-medium">{x.title}</span>
            <span className="num truncate text-xs text-muted-foreground">{[x.details?.size, x.details?.price !== undefined ? price(x.details.price) : undefined].filter(Boolean).join(" · ") || " "}</span>
          </li>
        ))}
      </ol>
      <figcaption className="text-xs text-muted-foreground">
        {stall ? "Table order, front to back." : "Wall order, left to right."} {priced.length ? `${priced.length} priced, ${price(total)} if all sell.` : "Add sizes and prices in the Library to plan the sales."}
      </figcaption>
    </figure>
  );
}

function MenuCard({ items }: { items: ShapeItem[] }) {
  const by = COURSES.map((c) => ({ c, dishes: items.filter((x) => x.details?.course === c) })).filter((g) => g.dishes.length);
  const loose = items.filter((x) => !x.details?.course);
  if (!by.length) return <Note>Give each dish a course in the Library and the menu sorts itself here.</Note>;
  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-lg bg-muted/30 px-3 py-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="menu-card">
      {by.map(({ c, dishes }) => (
        <div key={c} className="contents">
          <dt className="text-xs leading-5 font-medium text-muted-foreground">{COURSE_LABEL[c]}</dt>
          <dd>{dishes.map((d) => d.title).join(" · ")}</dd>
        </div>
      ))}
      {loose.length > 0 && (
        <div className="contents">
          <dt className="text-xs leading-5 text-muted-foreground">No course yet</dt>
          <dd className="text-muted-foreground">{loose.map((d) => d.title).join(" · ")}</dd>
        </div>
      )}
    </dl>
  );
}

// Neutral steps (the colour ramp stays for fan data).
const PART_TONE: Record<(typeof PARTS)[number], string> = { warmup: "bg-foreground/40", teach: "bg-foreground/85", practice: "bg-foreground/60", cooldown: "bg-foreground/30" };

function ClassBar({ items }: { items: ShapeItem[] }) {
  const timed = items.filter((x) => x.lengthMin);
  const total = timed.reduce((a, x) => a + (x.lengthMin ?? 0), 0);
  if (!total) return <Note>Give each segment a length in the Library to see the class as a timeline.</Note>;
  const parts = PARTS.map((p) => ({ p, min: timed.filter((x) => x.details?.part === p).reduce((a, x) => a + (x.lengthMin ?? 0), 0) })).filter((x) => x.min);
  return (
    <figure className="space-y-1.5" data-testid="class-bar">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        {timed.map((x, i) => (
          <span key={x.id ?? i} className={cn("h-full border-r border-card last:border-r-0", x.details?.part ? PART_TONE[x.details.part] : "bg-foreground/25")} style={{ width: `${((x.lengthMin ?? 0) / total) * 100}%` }} />
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span className="num">{clock(total)} in all</span>
        {parts.map(({ p, min }) => (
          <span key={p} className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-full", PART_TONE[p])} aria-hidden />
            {PART_LABEL[p]} <span className="num">{Math.round(min)} min</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
