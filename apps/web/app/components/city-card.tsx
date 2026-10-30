import { Banknote, MapPin, Megaphone, Music, TrainFront, TriangleAlert } from "lucide-react";
import { neutral } from "~/lib/neutral";

import { Badge } from "~/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { Access, AngleFacts, CityPlan, Reference, ShowMoney } from "@tourbo/core/shared/types.ts";
import { Chip, formatNumber } from "./trace";

export function CityCard({ stop, index, support = "opener", best = false }: { stop: CityPlan; index: number; support?: string; best?: boolean }) {
  const money = stop.money;
  const skip = money?.verdict === "skip";
  return (
    <Card size="sm" className={skip ? "opacity-70" : best ? "ring-2 ring-primary" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{index + 1}</span>
          {stop.city.name}
          {best && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium tracking-wider text-primary-foreground uppercase">Best bet</span>}
        </CardTitle>
        <CardDescription>{stop.date ? new Date(`${stop.date}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) : "date tbd"}</CardDescription>
        {money && (
          <CardAction>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${VERDICT[money.verdict]}`}>{money.verdict}</span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground" title="Fan score, relative to the other cities scored">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className={best ? "block h-full rounded-full bg-primary" : "block h-full rounded-full bg-score-3"} style={{ width: `${stop.score}%` }} />
          </span>
          <span>
            fan score <span className="num font-semibold text-foreground">{stop.score}</span>
          </span>
        </div>
        {stop.venue ? (
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">{stop.venue.name}</span>
              {stop.venue.neighborhood && <span className="text-muted-foreground"> · {stop.venue.neighborhood}</span>}
              {stop.capacity && <span className="text-muted-foreground"> · ~{formatNumber(stop.capacity.max)} cap.</span>}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">No room found yet; try a bigger area or room size.</p>
        )}
        {money && (
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <Banknote className="size-3.5 self-center text-muted-foreground" />
            <span className={money.profit >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
              {formatMoney(money.profit, money.currency)}
            </span>
            <span className="text-muted-foreground">
              profit · {formatMoney(money.price, money.currency)} tickets · ~{formatNumber(money.tickets)} sold
            </span>
          </p>
        )}
        {stop.opener && (
          <p className="flex items-center gap-1.5">
            <Music className="size-3.5 text-muted-foreground" />
            {support[0].toUpperCase() + support.slice(1)}: <span className="font-medium">{stop.opener.name}</span>
            {stop.opener.source === "local" && <span className="text-xs text-muted-foreground">(local)</span>}
          </p>
        )}
        {stop.angle && <p className="border-l-2 border-primary/50 pl-2 text-muted-foreground italic">{neutral(stop.angle)}</p>}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Why this city, room and deal?</summary>
          <div className="mt-2 space-y-2.5">
            <p className="flex flex-wrap items-center gap-1">
              <Chip>fan score {stop.score}/100</Chip>
              {stop.thinData && (
                <Badge variant="outline">
                  <TriangleAlert /> thin data
                </Badge>
              )}
              {stop.venue?.affinity !== undefined && <Chip>room fit {formatNumber(stop.venue.affinity)}</Chip>}
            </p>
            {stop.fit && <p>{neutral(stop.fit)}</p>}
            {money && <MoneyBlock money={money} />}
            {stop.promo && stop.promo.spend > 0 && (
              <p className="flex flex-wrap items-center gap-1.5">
                <Megaphone className="size-3.5 text-muted-foreground" />
                Promo {formatMoney(stop.promo.spend, money?.currency)} in {stop.promo.targets.length} neighbourhoods
                <span className="text-muted-foreground">· {neutral(stop.promo.why)}</span>
              </p>
            )}
            {stop.access && <AccessLine access={stop.access} />}
            {stop.sponsors && stop.sponsors.length > 0 && (
              <p>
                <span className="text-muted-foreground">Local sponsors to ask: </span>
                {stop.sponsors.slice(0, 4).map((r) => r.name).join(" · ")}
              </p>
            )}
            <LocalScene facts={stop.facts} localArtists={stop.localArtists} />
            {stop.backupVenue && (
              <p className="text-muted-foreground">
                Backup room: <span className="text-foreground">{stop.backupVenue.name}</span>
              </p>
            )}
            {stop.evidence.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {stop.evidence.map((e, i) => (
                  <Chip key={i} className="cursor-help">
                    <span title={neutral(e.claim)}>
                      {neutral(e.ref)}
                      {e.value && ` · ${neutral(e.value)}`}
                    </span>
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function formatMoney(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${formatNumber(Math.round(n))} ${currency}`;
  }
}

const VERDICT: Record<ShowMoney["verdict"], string> = {
  headline: "bg-success/15 text-success",
  "co-headline": "bg-info/15 text-info",
  "support slot": "bg-warning/15 text-warning",
  skip: "bg-destructive/15 text-destructive",
};

// The show-economics verdict: deal, price, expected tickets and the act's profit (all estimates).
function MoneyBlock({ money }: { money: ShowMoney }) {
  const m = (n: number) => formatMoney(n, money.currency);
  return (
    <div className="rounded-lg bg-muted/50 p-2 text-xs">
      <p className="flex flex-wrap items-center gap-1.5">
        <Banknote className="size-3.5 text-muted-foreground" />
        <span className={`rounded px-1.5 py-0.5 font-medium ${VERDICT[money.verdict]}`}>{money.verdict}</span>
        <span className="font-medium">{money.deal.replace("_", " ")}</span>
        {money.guarantee ? <span>· guarantee {m(money.guarantee)}</span> : null}
        <span>· {m(money.price)} tickets</span>
      </p>
      <p className="mt-1">
        ~{formatNumber(money.tickets)}/{formatNumber(money.capacity)} sold ({Math.round(money.sellThrough * 100)}%) · gross{" "}
        {m(money.gross)} · act {m(money.artistTake)} − costs {m(money.costs)} ={" "}
        <span className={money.profit >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
          {m(money.profit)}
        </span>
      </p>
      <p className="mt-1 text-muted-foreground">
        {neutral(money.reason ?? money.why)} <span className="italic">(estimate: {neutral(money.basis)})</span>
      </p>
    </div>
  );
}

function AccessLine({ access }: { access: Access }) {
  const parts = [
    access.nearestStation && `${access.nearestStation.name} ${access.nearestStation.km.toFixed(1)} km`,
    access.nearestAirport && `✈ ${access.nearestAirport.name} ${Math.round(access.nearestAirport.km)} km`,
    access.transitStops800m !== undefined && `${access.transitStops800m} transit stops within 800 m`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" title={`Source: ${access.source}`}>
      <TrainFront className="size-3.5" />
      {parts.join(" · ")}
    </p>
  );
}

const SCENE: { label: string; pick: (facts: AngleFacts) => Reference[] }[] = [
  { label: "TV", pick: (f) => f.cityCulture.filter((r) => r.type === "tv_show") },
  { label: "Brands & teams", pick: (f) => f.cityCulture.filter((r) => r.type === "brand") },
  { label: "People", pick: (f) => f.cityCulture.filter((r) => r.type === "person") },
  { label: "Fans' local spots", pick: (f) => f.localSpots },
];


// What this city loves (fan data, location signal only) and where this artist's fans go there.
function LocalScene({ facts, localArtists = [] }: { facts?: AngleFacts; localArtists?: Reference[] }) {
  const rows = [
    ...(facts ? SCENE.map((row) => ({ label: row.label, items: row.pick(facts).slice(0, 4) })) : []),
    { label: "Local acts", items: localArtists.slice(0, 4) },
  ].filter((row) => row.items.length);
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-muted-foreground">What this city loves (fan data)</p>
      <dl className="mt-1 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">{row.label}</dt>
            <dd>{row.items.map((r) => r.name).join(" · ")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
