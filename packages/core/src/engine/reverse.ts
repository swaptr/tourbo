import { heatmap, insights, searchEntities } from "../qloo/api.server.ts";
import type { PerformerKind } from "../shared/types.ts";
import { dedupeArtists, isMusician } from "./openers.ts";
import { discipline } from "../disciplines/index.ts";
import { noopEmit, type Emit } from "./trace.ts";

// Promoter mode: which acts does this room's crowd like? Signal = the venue entity; acts are
// ranked by Qloo affinity, then checked for heatmap presence in the venue's city.
export async function actsForVenue(opts: { venue: string; city: string; kind?: PerformerKind; limit?: number }, emit: Emit = noopEmit) {
  const kind = opts.kind ?? "musician";
  const [place] = await searchEntities(`${opts.venue} ${opts.city}`, { types: ["urn:entity:place"], take: 1 });
  if (!place) return { found: false, hint: `No place "${opts.venue}" in ${opts.city} in Qloo.` };
  emit("qloo_call", `Venue ${place.name} resolved`, { id: place.entity_id });
  const { entities = [] } = await insights(discipline(kind).peerType, { "signal.interests.entities": place.entity_id, take: 40 });
  const acts = dedupeArtists(discipline(kind).musicFilter ? entities.filter(isMusician) : entities).slice(0, (opts.limit ?? 10) + 5);
  const withLocal = await Promise.all(
    acts.map(async (a) => ({
      id: a.entity_id,
      name: a.name,
      affinity: a.query?.affinity,
      popularity: a.popularity,
      localCells: await heatmap({ "signal.interests.entities": a.entity_id, "filter.location.query": opts.city, "output.heatmap.boundary": "urn:geohash" })
        .then((c) => c.length)
        .catch(() => 0),
    })),
  );
  const ranked = withLocal
    .map((a) => ({ ...a, fit: Math.round(((a.affinity ?? 0) * 0.6 + Math.min(1, Math.log1p(a.localCells) / 8) * 0.4) * 100) }))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, opts.limit ?? 10);
  return {
    found: true,
    venue: { id: place.entity_id, name: place.name, address: place.properties?.address, popularity: place.popularity },
    acts: ranked,
    note: "fit = 0.6 × Qloo affinity to this room's crowd + 0.4 × local heatmap presence (log-scaled).",
  };
}
