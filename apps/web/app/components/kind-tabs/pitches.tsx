import { Link } from "react-router";

import { formatMoney } from "~/components/city-card";
import { Hint } from "~/components/hint";
import { formatNumber } from "~/components/trace";
import { Figure, Figures, KindTabFrame, NightRows } from "./frame";
import { money, type KindTabData } from "./index";

// Buskers: the spot in each city instead of a booked room. Footfall from where your fans are,
// how many pitches, what the hat brings, how easy it is to reach, and the day's risks.
export function PitchesTab({ data }: { data: KindTabData }) {
  const cur = money(data);
  const fmt = (n: number) => formatMoney(n, cur);
  return (
    <KindTabFrame
      title="Pitches"
      line={`Where to stand in each city, about ${data.shows} pitches per stop. Check the local busking permit before you play.`}
      aside={
        data.hasPermits ? (
          <Link to={`/plan/${data.id}/pipeline`} className="text-sm font-medium underline-offset-4 hover:underline">
            Ask for permits
          </Link>
        ) : undefined
      }
    >
      <NightRows
        stops={data.plan.stops}
        empty="No spot picked here yet. Pick one on the Plan tab."
        render={(s) => {
          const m = s.money;
          const a = s.access;
          const risk = s.place?.dateRisk;
          if (!s.venue && !m) return null;
          return (
            <div className="space-y-1.5">
              {s.venue && (
                <p className="text-sm">
                  <span className="font-semibold">{s.venue.name}</span>
                  {s.venue.address && <span className="text-muted-foreground"> · {s.venue.address}</span>}
                </p>
              )}
              {m && (
                <Figures>
                  <Figure label="People who stop" value={`~${formatNumber(m.tickets)}`} note={`over ${data.shows} pitches`} />
                  <Figure label="Hat and merch" value={fmt(m.artistTake)} />
                  <Figure label="Left after costs" value={<span className={m.profit < 0 ? "text-destructive" : undefined}>{fmt(m.profit)}</span>} />
                  {a?.transitStops800m !== undefined && <Figure label="Transit stops close by" value={formatNumber(a.transitStops800m)} />}
                </Figures>
              )}
              {m && (
                <Hint text="why?" label={`why this pitch in ${s.city.name}`}>
                  {m.why}
                </Hint>
              )}
              {risk && risk.level !== "low" && <p className="text-sm text-warning">Heads-up: {risk.reasons.join("; ")}.</p>}
            </div>
          );
        }}
      />
    </KindTabFrame>
  );
}
