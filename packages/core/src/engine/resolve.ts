import { qlooGet } from "../qloo/client.server.ts";
import { insights, searchEntities, searchTags, type QlooEntity } from "../qloo/api.server.ts";
import type { QlooParams } from "../qloo/client.server.ts";
import { discipline, DISCIPLINES } from "../disciplines/index.ts";
import type { Artist, Basis, PerformerKind } from "../shared/types.ts";
import { dedupeArtists, isMusician } from "./openers.ts";

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
  const hit = await matchEntity(query, entityTypes(kind));
  return hit && toArtist(hit, kind);
}

async function matchEntity(query: string, types: readonly string[]) {
  const results = await searchEntities(query, { types: [...types], take: 5 });
  const q = norm(query);
  // Name matches: exact, or the name plus a qualifier ("Zakir Khan, Comedian"). Qloo keeps
  // empty duplicates with no popularity, so the most popular match wins.
  const matches = results.filter((e) => {
    const n = norm(e.name);
    return n === q || (q.length >= 4 && n.startsWith(`${q} `));
  });
  return matches.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1))[0];
}

// "I sound like…" accepts any kind of act: a comic may sound like a singer or a podcast.
export const PEER_TYPES = ["urn:entity:artist", "urn:entity:person", "urn:entity:podcast", "urn:entity:tv_show", "urn:entity:book", "urn:entity:movie"] as const;
export async function resolvePeer(query: string, kind: PerformerKind = "musician"): Promise<Artist | undefined> {
  const own = await resolveArtist(query, kind);
  if (own) return own;
  const hit = await matchEntity(query, PEER_TYPES);
  return hit && toArtist(hit, kind);
}

// Autocomplete for "I sound like…": any entity type, with a short type label.
export async function searchPeers(query: string, take = 6) {
  const results = await searchEntities(query, { types: [...PEER_TYPES], take });
  return results.map((e) => ({ id: e.entity_id, name: e.name, type: (e.types?.[0] ?? "").replace("urn:entity:", "").replace("_", " ") }));
}

// "My style is…": genre/scene names (or urn:tag ids) to fan-data tags, preferring genre tags.
const tagName = (id: string) => id.split(":").at(-1)!.replace(/_/g, " ");
export async function resolveStyles(styles: string[], kind: PerformerKind = "musician") {
  const tags = await Promise.all(
    styles.map(async (g) => {
      if (g.startsWith("urn:tag:")) return { id: g, name: tagName(g) };
      const found = await styleTags(g, kind, 10);
      return found[0];
    }),
  );
  const seen = new Set<string>();
  return tags.filter((t): t is { id: string; name: string } => !!t && !seen.has(t.id) && !!seen.add(t.id));
}

// Tag search for the style chips, ranked toward the discipline (music genres for singers and DJs,
// comedy for comics). Dishes and attractions that share a word drop out.
const DISCIPLINE_TAG: Partial<Record<PerformerKind, RegExp>> = {
  musician: /:music:/,
  dj: /:music:/,
  comedian: /comed|stand.?up|humou?r|satir|sketch/i,
  magician: /magic|illusion/i,
  theatre: /theat|improv|drama|musical/i,
  chef: /cuisine|food|culinar/i,
  teacher: /yoga|dance|fitness/i,
  dancer: /dance|ballet/i,
  poet: /poet|spoken/i,
  author: /:book:|literar|fiction/i,
  filmmaker: /:media:|film|documentar/i,
};
export async function styleTags(query: string, kind: PerformerKind = "musician", take = 8) {
  const found = await searchTags(query, { take: 25 });
  const genres = found.filter((t) => t.id.startsWith("urn:tag:genre:") && !t.id.startsWith("urn:tag:genre:place:") && !t.id.includes(":brand"));
  const want = DISCIPLINE_TAG[kind];
  const fit = want ? genres.filter((t) => want.test(t.id) || want.test(t.name)) : genres;
  const pick = fit.length ? fit : genres.length ? genres : found;
  return pick.slice(0, take).map((t) => ({ id: t.id, name: t.name }));
}

// Stand-in acts for an unlisted performer: the discipline's acts most liked by fans of a style,
// or by people in an area (`fits` keeps only acts of the discipline). Their fans become the plan's signal; the plan says which basis it used.
const COMIC = /\b(comedian|comic|comedy|stand-?up|humou?rist)\b/i;
export function fits(e: QlooEntity, kind: PerformerKind) {
  const d = discipline(kind);
  if (d.musicFilter) return isMusician(e);
  const pattern = kind === "comedian" ? COMIC : d.peerPattern;
  if (!pattern) return true;
  const text = [e.name, String(e.properties?.description ?? ""), JSON.stringify(e.properties?.short_descriptions ?? ""), ...(e.tags ?? []).map((t) => t.name)].join(" ");
  return pattern.test(text);
}

async function standIns(kind: PerformerKind, tries: { tags?: string[]; near?: string }[], take = 3): Promise<Artist[]> {
  const d = discipline(kind);
  for (const t of tries) {
    const base: QlooParams = { take: 40, ...(t.near ? { "signal.location.query": t.near } : {}) };
    const variants: QlooParams[] = t.tags?.length
      ? [
          { ...base, "filter.tags": t.tags.join(","), "operator.filter.tags": "union" },
          { ...base, "signal.interests.tags": t.tags.join(",") },
        ]
      : [base];
    for (const params of variants) {
      const { entities = [] } = await insights(d.peerType, params, { allowUnlisted: ["signal.location.query"] }).catch(() => ({ entities: [] as QlooEntity[] }));
      const fit = dedupeArtists(entities.filter((e) => fits(e, kind)));
      if (fit.length) return fit.slice(0, take).map((e) => toArtist(e, kind));
    }
  }
  return [];
}

export type PerformerOpts = {
  notInQloo?: boolean; // "Not me": skip the name match
  styles?: string[]; // "My style is…"
  basis?: Basis; // the act's choice; "city" = no peers, plan from the area's taste
  near?: string; // the area's main city (city basis, and the fallback when nothing else matched)
};

// Headliner plus "sounds like" peers. Unknown headliners plan from the peers, a style, or the
// area's taste (the act itself is then a placeholder with no Qloo id of its own).
// `unmatched` lists peer names that matched nobody, so the caller can say so.
export async function resolvePerformer(query: string, kind: PerformerKind = "musician", peerNames: string[] = [], opts: boolean | PerformerOpts = {}) {
  const o: PerformerOpts = typeof opts === "boolean" ? { notInQloo: opts } : opts;
  const wantStyles = o.basis === "styles" || (!o.basis && !!o.styles?.length);
  const wantCity = o.basis === "city";
  const skipAct = o.notInQloo || wantStyles || wantCity;
  const names = wantCity ? [] : peerNames;
  const [artist, ...hits] = await Promise.all([skipAct ? undefined : resolveArtist(query, kind), ...names.map((p) => resolvePeer(p, kind))]);
  const unmatched = names.filter((_, i) => !hits[i]);
  let found = hits.filter((p): p is Artist => !!p && p.id !== artist?.id);
  let basis: Basis = artist ? "act" : "peers";
  let styles: { id: string; name: string }[] | undefined;

  if (!artist && wantStyles && o.styles?.length) {
    styles = await resolveStyles(o.styles, kind);
    if (styles.length) {
      found = [...found, ...(await standIns(kind, [{ tags: styles.map((t) => t.id) }]))];
      basis = "styles";
    }
  }
  if (!artist && (wantCity || !found.length) && o.near) {
    const scene = await resolveStyles(discipline(kind).scene.split(",").map((x) => x.trim()), kind).catch(() => []);
    const ids = scene.map((t) => t.id);
    found = await standIns(kind, [{ near: o.near }, { near: o.near, tags: ids }, { tags: ids }]);
    basis = "city";
    styles = undefined;
  }
  const seen = new Set<string>();
  found = found.filter((p) => !seen.has(p.id) && !!seen.add(p.id));
  if (!artist && !found.length) return undefined;
  const base: Artist = artist ?? {
    id: found[0].id, // signal anchor; the UI shows the typed name
    name: query,
    kind,
    popularity: Math.min(...found.map((p) => p.popularity ?? 1)),
    tags: styles ?? found[0].tags,
    peers: [],
  };
  return { ...base, peers: found.map((p) => ({ id: p.id, name: p.name })), unknown: !artist, basis, styles, unmatched };
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
