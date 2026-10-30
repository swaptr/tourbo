import { qlooGet } from "../qloo/client.server.ts";
import { searchEntities, type QlooEntity } from "../qloo/api.server.ts";
import { discipline, DISCIPLINES } from "../disciplines/index.ts";
import type { Artist, PerformerKind } from "../shared/types.ts";

// Qloo entity types the act resolves as, in order.
export const entityTypes = (kind: PerformerKind = "musician") => discipline(kind).entityTypes;

function toArtist(top: QlooEntity, kind: PerformerKind): Artist {
  const image = (top.properties?.image as { url?: string } | undefined)?.url;
  const tags = (top.tags ?? [])
    .filter((tag) => tag.type === "urn:tag:genre" || (kind !== "musician" && tag.type?.startsWith("urn:tag:genre")))
    .flatMap((tag) => {
      const id = tag.tag_id ?? tag.id;
      return id ? [{ id, name: tag.name }] : [];
    });
  return { id: top.entity_id, name: top.name, kind, popularity: top.popularity, image, tags, peers: [] };
}

const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^the\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Search is fuzzy (an unknown name still returns somebody), so only accept a hit whose name
// matches the query; otherwise the act is treated as not in Qloo and planned from peers.
export async function resolveArtist(query: string, kind: PerformerKind = "musician"): Promise<Artist | undefined> {
  const results = await searchEntities(query, { types: entityTypes(kind), take: 5 });
  const q = norm(query);
  // Name matches: exact, or the name plus a qualifier ("Zakir Khan, Comedian"). Qloo keeps
  // empty duplicates with no popularity, so the most popular match wins.
  const matches = results.filter((e) => {
    const n = norm(e.name);
    return n === q || (q.length >= 4 && n.startsWith(`${q} `));
  });
  const hit = matches.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1))[0];
  return hit && toArtist(hit, kind);
}

// Headliner plus "sounds like" peers. Unknown headliners still plan from the peers alone
// (the act itself is then a placeholder with no Qloo id of its own).
// notInQloo: the act said the Qloo match isn't them; plan from peers only.
export async function resolvePerformer(query: string, kind: PerformerKind = "musician", peerNames: string[] = [], notInQloo = false) {
  const [artist, ...peers] = await Promise.all([notInQloo ? undefined : resolveArtist(query, kind), ...peerNames.map((p) => resolveArtist(p, kind))]);
  const found = peers.filter((p): p is Artist => !!p && p.id !== artist?.id);
  if (!artist && !found.length) return undefined;
  const base: Artist = artist ?? {
    id: found[0].id, // signal anchor; the UI shows the typed name
    name: query,
    kind,
    popularity: Math.min(...found.map((p) => p.popularity ?? 1)),
    tags: found[0].tags,
    peers: [],
  };
  return { ...base, peers: found.map((p) => ({ id: p.id, name: p.name })), unknown: !artist };
}

// Ids for the fan signal: the act plus its peers.
export const signalIds = (artist: Pick<Artist, "id" | "peers">) => [...new Set([artist.id, ...artist.peers.map((p) => p.id)])];

export async function artistById(id: string, kind: PerformerKind = "musician"): Promise<Artist | undefined> {
  const res = await qlooGet<{ results?: QlooEntity[] | { entities?: QlooEntity[] } }>("/entities", { entity_ids: id });
  const list = Array.isArray(res.results) ? res.results : (res.results?.entities ?? []);
  const top = list.find((e) => e.entity_id === id);
  if (!top) return undefined;
  // Keep the asked discipline when the entity type fits it; otherwise infer from the type.
  const fits = discipline(kind).entityTypes.some((t) => top.types?.includes(t));
  const inferred = Object.values(DISCIPLINES).find((d) => d.entityTypes.some((t) => top.types?.includes(t)))?.key;
  return toArtist(top, fits ? kind : (inferred ?? kind));
}

// Autocomplete for the home form.
export async function searchArtists(query: string, take = 6, kind: PerformerKind = "musician") {
  const results = await searchEntities(query, { types: entityTypes(kind), take });
  return results.map((entity) => ({ id: entity.entity_id, name: entity.name }));
}
