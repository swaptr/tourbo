import type { Compare, CompareCity } from "@tourbo/core/examples/types.ts";
import { Explain, FanStrength } from "~/components/explain";
import { cn } from "~/lib/utils";

// "Why here, not there?": one plain line, then the chosen city against the one it beat.
// Shared by the home globe popovers, plan night cards and "why?". Plain words, no vendor names.
export type { Compare, CompareCity };

const RAMP = ["bg-score-1", "bg-score-2", "bg-score-3", "bg-score-4"] as const;
export const rampClass = (value: number) => RAMP[Math.min(3, Math.max(0, Math.floor(value / 25)))];

const money = (n: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
const km = (n: number) => `${new Intl.NumberFormat("en").format(Math.round(n))} km`;

export function FanBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      {/* Fixed track, bar scaled with transform (no layout work, no remounts). */}
      <span className={cn("block h-full w-full origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none", rampClass(v))} style={{ transform: `scaleX(${Math.max(3, v) / 100})` }} />
    </span>
  );
}

type Row = { label: string; cell: (c: CompareCity) => React.ReactNode; better?: (a: CompareCity, b: CompareCity) => boolean };

export function WhyCompare({ compare, checkedAt, className }: { compare: Compare; checkedAt?: string; className?: string }) {
  const { chosen, skipped, currency } = compare;
  const rows: Row[] = [
    {
      label: "Fan strength",
      cell: (c) => (
        <span className="grid grid-cols-[1fr_3ch] items-center gap-2">
          <FanBar value={c.fanStrength} />
          <span className="text-right"><FanStrength value={c.fanStrength} why={c.why} /></span>
        </span>
      ),
      better: (a, b) => a.fanStrength > b.fanStrength,
    },
    { label: "Leans to the act", cell: (c) => <span className="num">{c.lean.toFixed(1)}×</span>, better: (a, b) => a.lean > b.lean },
    { label: "Room fit", cell: (c) => <Explain why={`Expected crowd ~${new Intl.NumberFormat("en").format(c.tickets)}. A room a bit smaller than demand sells out; a much bigger one looks empty and costs more.`}>{c.roomFit}</Explain> },
    {
      label: "Night profit",
      cell: (c) => (
        <Explain
          why={`About ${new Intl.NumberFormat("en").format(c.tickets)} tickets at a typical price for the room, minus the room, travel and crew. ${c.profit < 0 ? "This night loses money." : "An estimate, not a promise."}`}
        >
          <span className={cn("num", c.profit < 0 && "text-destructive")}>{money(c.profit, currency)}</span>
        </Explain>
      ),
      better: (a, b) => a.profit > b.profit,
    },
    { label: "Travel from home", cell: (c) => <span className="num">{km(c.travelKm)}</span>, better: (a, b) => a.travelKm < b.travelKm },
  ];
  if (chosen.localTaste || skipped.localTaste) rows.push({ label: "Local taste", cell: (c) => c.localTaste ?? "–" });
  const date = checkedAt ? new Date(checkedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : undefined;

  return (
    <div className={cn("grid gap-3 text-sm", className)} data-testid="why-compare">
      <p>{compare.line}</p>
      {compare.reason && (
        <p className="text-xs">
          <span className="text-muted-foreground">Why {skipped.name} was skipped: </span>
          {compare.reason}
        </p>
      )}
      <table className="w-full table-fixed text-xs">
        <caption className="sr-only">
          {chosen.name} compared with {skipped.name}
        </caption>
        <thead>
          <tr className="text-left">
            <th className="w-[34%] pb-1.5 font-normal text-muted-foreground" scope="col">
              <span className="sr-only">Measure</span>
            </th>
            <th className="pb-1.5 font-heading text-base font-normal" scope="col">
              {chosen.name} <span className="text-[10px] tracking-widest text-primary uppercase">picked</span>
            </th>
            <th className="pb-1.5 font-heading text-base font-normal text-muted-foreground" scope="col">
              {skipped.name}
            </th>
          </tr>
        </thead>
        <tbody className="align-top">
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-muted-foreground">
                {r.label}
              </th>
              <td className={cn("py-1.5 pr-3", r.better?.(chosen, skipped) && "font-medium")}>{r.cell(chosen)}</td>
              <td className="py-1.5 text-muted-foreground">{r.cell(skipped)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">Fan data{date ? ` · checked ${date}` : ""} · every number is an estimate</p>
    </div>
  );
}
