import { formatMoney } from "~/components/city-card";
import { formatNumber } from "~/components/trace";
import { Figure, Figures, KindTabFrame, NightRows } from "./frame";
import { money, type KindTabData } from "./index";

// Painters, photographers, makers: each stop as a show that hangs for days. Visitors over the
// stay, the entry, what sales per visitor bring in, and what's left. All estimates.
export function SalesTab({ data }: { data: KindTabData }) {
  const cur = money(data);
  const fmt = (n: number) => formatMoney(n, cur);
  const isShow = (s: KindTabData["plan"]["stops"][number]) => !!s.money && s.money.verdict !== "skip" && (s.money.deal === "exhibition" || s.money.deal === "commission");
  const stops = data.plan.stops.filter(isShow);
  const visitors = stops.reduce((a, s) => a + (s.money?.tickets ?? 0), 0);
  const take = stops.reduce((a, s) => a + (s.money?.artistTake ?? 0), 0);
  return (
    <KindTabFrame
      title="Sales"
      line={`Each show hangs about ${data.stayDays} days. Visitors come from where your fans are; sales per visitor do the rest. Estimates, not promises.`}
      aside={
        <p className="text-right text-sm">
          <span className="num block font-heading text-2xl">~{formatNumber(visitors)}</span>
          <span className="text-xs text-muted-foreground">visitors, ~{fmt(take)} to you (est.)</span>
        </p>
      }
    >
      <NightRows
        stops={data.plan.stops}
        empty="Not hung as a show here."
        render={(s) => {
          const m = s.money;
          if (!m || !isShow(s)) return null;
          return (
            <div className="space-y-1.5">
              <Figures>
                <Figure label="Visitors" value={`~${formatNumber(m.tickets)}`} note={m.capacity ? `room for ${formatNumber(m.capacity)}` : undefined} />
                <Figure label="Entry" value={m.price ? fmt(m.price) : "Free"} />
                <Figure label="To you" value={fmt(m.artistTake)} />
                <Figure label="Left after costs" value={<span className={m.profit < 0 ? "text-destructive" : undefined}>{fmt(m.profit)}</span>} />
              </Figures>
              <p className="text-sm text-muted-foreground">{m.why}</p>
            </div>
          );
        }}
      />
    </KindTabFrame>
  );
}
