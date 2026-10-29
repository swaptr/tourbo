import { MapPin, Music, TriangleAlert } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { AngleFacts, CityPlan, Reference, Venue } from "../../server/core/shared/types";
import { Chip, formatNumber } from "./trace";

export function CityCard({ stop, index }: { stop: CityPlan; index: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">
            {index + 1}
          </span>
          {stop.city.name}
        </CardTitle>
        <CardDescription>{stop.date ?? "date tbd"}</CardDescription>
        <CardAction className="flex gap-1">
          {stop.thinData && (
            <Badge variant="destructive">
              <TriangleAlert /> thin data
            </Badge>
          )}
          <Badge variant="secondary" title="Fan footprint + over-indexing vs other candidate cities">
            score {stop.score}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {stop.venue ? <VenueLine venue={stop.venue} /> : <p className="text-muted-foreground">No venue found</p>}
        {stop.backupVenue && (
          <p className="text-xs text-muted-foreground">
            Backup: <span className="text-foreground">{stop.backupVenue.name}</span>
          </p>
        )}
        {stop.capacity && (
          <p className="text-xs text-muted-foreground">
            Capacity ~{formatNumber(stop.capacity.min)}–{formatNumber(stop.capacity.max)}{" "}
            <span className="italic">(estimate)</span>
          </p>
        )}
        {stop.opener && (
          <p className="flex flex-wrap items-center gap-1.5">
            <Music className="size-3.5 text-muted-foreground" />
            Opener: <span className="font-medium">{stop.opener.name}</span>
            {stop.opener.source === "local" && <Badge variant="outline">local favourite</Badge>}
            <Chip>local cells {formatNumber(stop.opener.localCells)}</Chip>
          </p>
        )}
        {stop.angle && <p className="border-l-2 border-indigo-300 pl-2 italic">{stop.angle}</p>}
        {stop.facts && <LocalScene facts={stop.facts} />}
        {stop.fit && <p className="text-xs text-muted-foreground">{stop.fit}</p>}
        {stop.evidence.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stop.evidence.map((e, i) => (
              <Chip key={i} className="cursor-help">
                <span title={e.claim}>
                  {e.ref}
                  {e.value && ` · ${e.value}`}
                </span>
              </Chip>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VenueLine({ venue }: { venue: Venue }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 font-medium">
        <MapPin className="size-3.5 text-muted-foreground" />
        {venue.website ? (
          <a href={venue.website} target="_blank" rel="noreferrer" className="hover:underline">
            {venue.name}
          </a>
        ) : (
          venue.name
        )}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {venue.neighborhood && <Chip className="bg-muted text-muted-foreground">{venue.neighborhood}</Chip>}
        {venue.popularity !== undefined && <Chip>popularity {formatNumber(venue.popularity)}</Chip>}
        {venue.affinity !== undefined && <Chip>affinity {formatNumber(venue.affinity)}</Chip>}
        <Chip className="bg-muted text-muted-foreground">found: {venue.foundBy}</Chip>
      </div>
    </div>
  );
}

const SCENE: { label: string; pick: (facts: AngleFacts) => Reference[] }[] = [
  { label: "TV", pick: (f) => f.cityCulture.filter((r) => r.type === "tv_show") },
  { label: "Brands & teams", pick: (f) => f.cityCulture.filter((r) => r.type === "brand") },
  { label: "People", pick: (f) => f.cityCulture.filter((r) => r.type === "person") },
  { label: "Fans' local spots", pick: (f) => f.localSpots },
];

// What this city loves (Qloo, location signal only) and where this artist's fans go there.
function LocalScene({ facts }: { facts: AngleFacts }) {
  const rows = SCENE.map((row) => ({ label: row.label, items: row.pick(facts).slice(0, 4) })).filter(
    (row) => row.items.length,
  );
  if (!rows.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Local scene</summary>
      <dl className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">{row.label}</dt>
            <dd>{row.items.map((r) => r.name).join(" · ")}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
