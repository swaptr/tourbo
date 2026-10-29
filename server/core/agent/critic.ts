import type { Route } from "../engine/routing.ts";
import type { CityPlan, TourParams } from "../shared/types.ts";

export type Issue = { city?: string; kind: string; detail: string };

const METRIC_REFS = /heatmap|cells|affinity|popularity|score|hotspot/i;
const LONG_LEG_KM = 1500;

// Deterministic critique: cheap, explainable, and the same every run.
export function critique(
  stops: CityPlan[],
  route: Route | undefined,
  params: TourParams,
): Issue[] {
  const issues: Issue[] = [];
  if (!route) issues.push({ kind: "route", detail: "Tour has not been routed yet." });
  if (stops.length < params.shows) {
    issues.push({ kind: "count", detail: `Only ${stops.length} of ${params.shows} cities planned.` });
  }

  for (const stop of stops) {
    const city = stop.city.name;
    if (!stop.venue) issues.push({ city, kind: "venue", detail: "No venue found." });
    else if (stop.venue.affinity === undefined && stop.venue.popularity === undefined) {
      issues.push({ city, kind: "venue", detail: `${stop.venue.name} has no Qloo affinity or popularity.` });
    }
    if (!stop.backupVenue) issues.push({ city, kind: "venue", detail: "No backup venue." });
    if (stop.thinData) {
      issues.push({ city, kind: "thin_data", detail: "Fewer than 50 heatmap cells; consider swapping this city." });
    }
    if (stop.capacity && (stop.capacity.max < params.roomMin / 2 || stop.capacity.min > params.roomMax * 2)) {
      issues.push({
        city,
        kind: "capacity",
        detail: `Estimated ${stop.capacity.min}–${stop.capacity.max} is far from the requested ${params.roomMin}–${params.roomMax}; try the backup.`,
      });
    }
    if (!stop.evidence.length) issues.push({ city, kind: "evidence", detail: "No Qloo evidence cited." });
    const known = knownRefs(stop);
    for (const e of stop.evidence) {
      if (!METRIC_REFS.test(e.ref) && !known.has(normalize(e.ref))) {
        issues.push({ city, kind: "ungrounded", detail: `"${e.claim}" cites "${e.ref}", which is not in the Qloo results.` });
      }
    }
  }

  for (const leg of route?.legs ?? []) {
    if (leg.km > LONG_LEG_KM) {
      issues.push({ kind: "routing", detail: `${leg.from} → ${leg.to} is ${leg.km} km; a nearer shortlisted city may route better.` });
    }
  }
  return issues;
}

function knownRefs(stop: CityPlan) {
  const names = [
    stop.venue?.name,
    stop.backupVenue?.name,
    stop.opener?.name,
    ...(stop.facts?.fanTaste ?? []).map((r) => r.name),
    ...(stop.facts?.cityCulture ?? []).map((r) => r.name),
    ...(stop.facts?.localSpots ?? []).map((r) => r.name),
  ];
  return new Set(names.filter(Boolean).map((n) => normalize(n!)));
}

// Worker input lists items as "Name (type)"; refs may echo that suffix.
function normalize(ref: string) {
  return ref.replace(/\s*\((tv_show|podcast|brand|person|movie|place)\)\s*$/i, "").trim().toLowerCase();
}
