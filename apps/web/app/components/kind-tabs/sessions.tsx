import { formatMoney } from "~/components/city-card";
import { Hint } from "~/components/hint";
import { formatNumber } from "~/components/trace";
import { Figure, Figures, KindTabFrame, NightRows } from "./frame";
import { money, type KindTabData } from "./index";

// Teachers, makers, dancers, chefs' classes: per stop, how many sessions, seats per session, how
// many seats Tourbo expects to fill and at what fee. Only stops booked as a class show here.
export function SessionsTab({ data }: { data: KindTabData }) {
  const cur = money(data);
  const fmt = (n: number) => formatMoney(n, cur);
  const w = data.workshop;
  const classes = data.plan.stops.filter((s) => s.money?.deal === "workshop" && s.money.verdict !== "skip");
  const seats = classes.reduce((a, s) => a + (s.money?.tickets ?? 0), 0);
  return (
    <KindTabFrame
      title="Sessions"
      line={w ? `About ${w.sessions} ${w.sessions === 1 ? "session" : "sessions"} per stop, up to ${w.classSize} seats each. Seats fill from where your fans are. Estimates.` : "Seats per stop, filled from where your fans are. Estimates."}
      aside={
        <p className="text-right text-sm">
          <span className="num block font-heading text-2xl">~{formatNumber(seats)}</span>
          <span className="text-xs text-muted-foreground">seats across {classes.length} {classes.length === 1 ? "stop" : "stops"}</span>
        </p>
      }
    >
      <NightRows
        stops={data.plan.stops}
        empty="Not a class here: this stop is booked as a show."
        render={(s) => {
          const m = s.money;
          if (!m || m.deal !== "workshop") return null;
          const full = Math.round(m.sellThrough * 100);
          return (
            <div className="space-y-1.5">
              <Figures>
                <Figure label="Seats filled" value={`~${formatNumber(m.tickets)}`} note={`of ${formatNumber(m.capacity)}`} />
                <Figure label="Full" value={`${full}%`} />
                <Figure label="Seat fee" value={fmt(m.price)} />
                <Figure label="Left after costs" value={<span className={m.profit < 0 ? "text-destructive" : undefined}>{fmt(m.profit)}</span>} />
              </Figures>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="min-w-0">{full >= 85 ? "Likely full: add a session if the room allows." : full < 50 ? "Half empty on these numbers: fewer sessions, or a smaller room." : "Comfortably booked."}</span>
                <Hint text="why?" label={`why these seats in ${s.city.name}`}>
                  {m.why}
                </Hint>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full origin-left rounded-full bg-foreground/70" style={{ transform: `scaleX(${Math.min(1, m.sellThrough)})` }} />
              </div>
            </div>
          );
        }}
      />
    </KindTabFrame>
  );
}
