import type { ReactNode } from "react";
import { Hint } from "~/components/hint";
import { Banknote, MapPin, Megaphone, TrainFront, TriangleAlert } from "lucide-react";
import { neutral } from "~/lib/neutral";

import { Badge } from "~/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { Access, AngleFacts, CityPlan, Reference, ShowMoney } from "@tourbo/core/shared/types.ts";
import { Chip, formatNumber } from "./trace";
import { rampClass } from "./why-compare";

// At most 160 chars (cut at a word) for primary UI; the full text goes behind "why?".
export function firstLine(text: string, max = 160) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : undefined).replace(/[\s,;:(]+$/, "")}…`;
}

// The first whole sentence when it fits (no mid-sentence cut); else a word-boundary cut.
export function firstSentence(text: string, max = 160) {
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  return m && m[0].length <= max ? m[0] : firstLine(text, max);
}

// why / dealWhy: inline insights (components/insight) for the night and its deal, from the plan page.
// noRoom: what to offer when the night has no room yet (plan workspace: nearby rooms, Change).
// One type scale for every night card (open or collapsed): sans city name, shadcn Badges.
// bare: inside the tour workspace's night panel, which already shows the number, city and date.
export function CityCard({ stop, index, support = "opener", best = false, bare = false, footer, why, dealWhy, noRoom }: { stop: CityPlan; index: number; support?: string | false; best?: boolean; bare?: boolean; footer?: ReactNode; why?: ReactNode; dealWhy?: ReactNode; noRoom?: ReactNode }) {
  const money = stop.money;
  const skip = money?.verdict === "skip";
  const risk = stop.place?.surfaced?.includes("dateRisk") && stop.place.changes.dateRisk && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning" data-testid="date-risk">
              <TriangleAlert className="size-3" aria-hidden />
              {firstLine(neutral(stop.place.changes.dateRisk), 60)}
              <Hint label="About this date">
                <div className="space-y-1">
                  <p>{neutral(stop.place.changes.dateRisk)}</p>
                  {stop.place.dateRisk?.reasons.map((r) => <p key={r} className="text-muted-foreground">{neutral(r)}</p>)}
                </div>
              </Hint>
            </span>
          );
  const verdict = money && (
    <Badge variant="secondary" className={VERDICT[money.verdict]}>
      {money.reason === DROPPED ? "Dropped" : VERDICT_LABEL[money.verdict]}
    </Badge>
  );
  const marks = (
    <>
      {stop.yours && <Badge variant="outline">your pick</Badge>}
      {best && !skip && <Badge variant="outline">Strongest</Badge>}
    </>
  );
  const body = (
    <>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" title="Fans, relative to the other cities scored">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className={`block h-full rounded-full ${rampClass(stop.score)}`} style={{ width: `${stop.score}%` }} />
          </span>
          <span>
            fans <span className="num font-semibold text-foreground">{stop.score}</span>
          </span>
        </div>
        {stop.venue ? (
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-semibold">{stop.venue.name}</span>
              {stop.venue.neighborhood && <span className="text-muted-foreground"> · {stop.venue.neighborhood}</span>}
              {stop.capacity && <span className="text-muted-foreground"> · ~{formatNumber(stop.capacity.max)} cap.</span>}
            </span>
          </p>
        ) : (
          (noRoom ?? <p className="text-muted-foreground">{stop.yours ? "Tourbo didn't check rooms here; the money assumes a typical room." : "No room found yet; try a bigger area or room size."}</p>)
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
        {dealWhy}
        {why}
        {stop.opener && support && (
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials(stop.opener.name)}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                {support[0].toUpperCase() + support.slice(1)}
                {stop.opener.source === "local" && " · local"}
              </span>
              <span className="block truncate font-semibold">{stop.opener.name}</span>
            </span>
          </div>
        )}
        {stop.angle && <p className="border-l-2 border-foreground/20 pl-2.5 text-muted-foreground italic">{firstSentence(neutral(stop.angle))}</p>}
        <Hint text="why?" label={`Why ${stop.city.name}`}>
          <div className="space-y-2.5">
            {stop.angle && firstSentence(neutral(stop.angle)) !== neutral(stop.angle) && <div className="italic">{neutral(stop.angle)}</div>}
            <p className="flex flex-wrap items-center gap-1">
              <Chip>fans {stop.score} of 100</Chip>
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
        </Hint>
        {footer}
    </>
  );
  if (bare)
    return (
      <div className="space-y-3 text-sm" data-slot="card" data-skip={skip || undefined}>
        <p className="flex flex-wrap items-center gap-1.5">
          {verdict}
          {marks}
          {risk}
        </p>
        {body}
      </div>
    );
  return (
    <Card size="sm" data-skip={skip || undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 font-sans text-sm font-medium group-data-[size=sm]/card:text-sm">
          <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${stop.yours ? "border border-foreground/40 bg-card text-foreground" : "bg-foreground text-background"}`}>{index + 1}</span>
          {stop.city.name}
          {marks}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5 text-xs">
          {stop.date ? new Date(`${stop.date}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) : "date tbd"}
          {risk}
        </CardDescription>
        {verdict && <CardAction>{verdict}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{body}</CardContent>
    </Card>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

export function formatMoney(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${formatNumber(Math.round(n))} ${currency}`;
  }
}

const DROPPED = "You dropped this night.";

const VERDICT_LABEL: Record<ShowMoney["verdict"], string> = { headline: "Headline set", "co-headline": "Co-headline", "support slot": "Support slot", skip: "Skip" };

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
