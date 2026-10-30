import { Hint } from "~/components/hint";
import { rampClass } from "~/components/why-compare";
import { cn } from "~/lib/utils";

export type WhyCity = { name: string; fanStrength: number; lean?: number };

// "why?" for a city pick: one plain sentence, then this city against the next few and the median.
// Plain words only: no tool names, cell counts or vendor names.
export function Why({ city, others, median, checkedAt, className }: { city: WhyCity; others: WhyCity[]; median?: number; checkedAt?: string; className?: string }) {
  const rows = [city, ...others.filter((o) => o.name !== city.name).slice(0, 4)];
  const leans = city.lean !== undefined && city.lean > 1.05;
  const sentence =
    city.fanStrength >= Math.max(...rows.map((r) => r.fanStrength))
      ? `More of this act's fans live in ${city.name} than in the other cities here${leans ? ", and the city leans toward this act more than most" : ""}.`
      : `${city.name} has a solid fan base for this act${leans ? " and leans toward it more than most cities" : ""}, though not the biggest.`;
  const date = checkedAt ? new Date(checkedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : undefined;
  return (
    <Hint text="why?" label={`Why ${city.name}`} className={className}>
      <div className="grid gap-3">
        <p>{sentence}</p>
        <div>
          <p className="text-xs text-muted-foreground">Fan strength (0–100)</p>
          <ul className="mt-1.5 grid gap-1">
            {rows.map((r) => (
              <Bar key={r.name} label={r.name} value={r.fanStrength} strong={r.name === city.name} />
            ))}
            {median !== undefined && <Bar label="Typical city" value={median} muted />}
          </ul>
        </div>
        {city.lean !== undefined && (
          <p className="text-xs text-muted-foreground">
            How much the city leans to this act: <span className="num text-foreground">{city.lean.toFixed(1)}×</span> a typical city its size.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Fan data{date ? ` · checked ${date}` : ""}</p>
      </div>
    </Hint>
  );
}

function Bar({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <li className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-xs">
      <span className={cn("truncate", strong && "font-medium", muted && "text-muted-foreground")}>{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full w-full origin-left rounded-full", muted ? "bg-muted-foreground/40" : rampClass(value))} style={{ transform: `scaleX(${Math.max(2, Math.min(100, value)) / 100})` }} />
      </span>
      <span className={cn("num text-right", strong ? "font-medium" : "text-muted-foreground")}>{Math.round(value)}</span>
    </li>
  );
}
