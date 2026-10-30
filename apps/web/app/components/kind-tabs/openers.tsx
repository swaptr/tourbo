import { Mail } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";

import { Hint } from "~/components/hint";
import { FactChip } from "~/components/insight";
import { formatNumber } from "~/components/trace";
import { KindTabFrame, NightRows, useLeadNight } from "./frame";
import type { KindTabData } from "./index";

// Musicians and DJs: who could open each night. "Local" only when the act is one the city's own
// crowd likes (fan data, source local); otherwise it shares your fans. The bar is the act's local
// presence against the tour's strongest; a pick used on several nights says so.
export function OpenersTab({ data }: { data: KindTabData }) {
  const role = data.support;
  const Role = role[0].toUpperCase() + role.slice(1);
  const stops = data.plan.stops;
  const lead = useLeadNight(stops, (i) => !!stops[i]?.opener);
  const maxCells = Math.max(1, ...stops.map((s) => s.opener?.localCells ?? 0));
  // Thin evidence (few parts of the city): hedged chip and softer words.
  const weak = (o: { localCells?: number }) => !o.localCells || o.localCells / maxCells < 0.4;
  const nightsOf = new Map<string, number[]>();
  stops.forEach((s, i) => s.opener && nightsOf.set(s.opener.name, [...(nightsOf.get(s.opener.name) ?? []), i + 1]));
  return (
    <KindTabFrame title={`${Role}s`} line={`An act per night who shares your crowd. Ask them to open: they bring their own fans.`}>
      <NightRows
        stops={stops}
        empty={`No ${role} stood out here. Play the full night yourself.`}
        render={(s, i) => {
          const o = s.opener;
          const others = (s.localArtists ?? []).filter((a) => a.name !== o?.name).slice(0, 3);
          if (!o && !others.length) return null;
          const again = o ? (nightsOf.get(o.name) ?? []).filter((n) => n !== i + 1) : [];
          return (
            <div className="space-y-2">
              {o && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-base font-semibold">{o.name}</span>
                  <span className="inline-flex flex-nowrap items-center gap-2">
                  <FactChip text={weak(o) ? (o.source === "local" ? "known locally" : "some shared fans") : o.source === "local" ? "local favourite" : "shares your fans"} meter={o.localCells ? o.localCells / maxCells : undefined} hedged={weak(o)} />
                  <Hint text="why?" label={`why ${o.name} in ${s.city.name}`}>
                    {o.source === "local" ? `${s.city.name}'s own crowd ranks ${o.name} high, and they share your audience` : `${o.name}'s fans overlap with yours`}
                    {o.localCells ? `; they have fans in ${formatNumber(o.localCells)} parts of ${s.city.name}` : ""}
                    {o.affinity !== undefined ? ` (fan data, match ${o.affinity.toFixed(2)})` : " (fan data)"}.
                  </Hint>
                  </span>
                  {again.length > 0 && <span className="text-xs text-muted-foreground">fits night {again.join(" and ")} too, so book them once</span>}
                </p>
              )}
              {others.length > 0 && <p className="text-sm text-muted-foreground">Also popular with your crowd here: {others.map((a) => a.name).join(", ")}</p>}
              {o && data.hasPermits && (
                <Button size="sm" variant={i === lead ? "default" : "outline"} data-primary={i === lead || undefined} nativeButton={false} render={<Link to={`/plan/${data.id}/pipeline?night=${i + 1}`} />}>
                  <Mail /> Ask {o.name} in the booking email
                </Button>
              )}
            </div>
          );
        }}
      />
    </KindTabFrame>
  );
}
