import { heatmap, insights, type QlooEntity } from "../qloo/api.server.ts";
import {
  locationQuery,
  type Artist,
  type CityScore,
  type Opener,
} from "../shared/types.ts";
import { noopEmit, type Emit } from "./trace.ts";

const CANDIDATES = 8;
const LOCAL_TAKE = 25;
// Local acts may sit slightly below the similar-artist shortlist: local pull sells tickets too.
const LOCAL_MARGIN = 0.05;

export type OpenerCandidate = Omit<Opener, "localCells" | "source">;

// Qloo's artist type also holds photographers, TV hosts, authors and ambiguous Last.fm names
// (e.g. "BVG"). Those have no instruments; real bands sometimes don't either, so fall back to
// the description.
const PERFORMER = /\b(band|musician|singer|rapper|dj|producer|duo|trio|group|songwriter|composer|vocalist|guitarist|collective|act|project)\b/i;
const NOT_PERFORMER = /\bambiguous artist name\b/i;

export function isMusician(entity: QlooEntity) {
  const props = entity.properties ?? {};
  const description = typeof props.description === "string" ? props.description : "";
  if (NOT_PERFORMER.test(description)) return false;
  const instruments = Array.isArray(props.instruments) ? props.instruments : [];
  if (instruments.length) return true;
  return PERFORMER.test(description.split(".")[0] ?? "");
}

const normName = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function editDistanceAtMostOne(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function aliases(entity: QlooEntity) {
  const props = entity.properties ?? {};
  const raw = [props.aliases, props.akas].flat().filter(Boolean) as unknown[];
  return raw.flatMap((a) => {
    if (typeof a === "string") return [a];
    if (a && typeof a === "object" && "value" in a && typeof a.value === "string") return [a.value];
    return [];
  });
}

// Drops spelling variants (Jassie Gill / Jassi Gill) and alias duplicates (Utada / 宇多田ヒカル),
// keeping the first (highest-ranked) entity.
export function dedupeArtists(entities: QlooEntity[]) {
  const kept: { entity: QlooEntity; names: string[] }[] = [];
  for (const entity of entities) {
    const names = [entity.name, ...aliases(entity)].map(normName).filter(Boolean);
    const duplicate = kept.some((k) =>
      names.some((n) => k.names.some((m) => n === m || (Math.min(n.length, m.length) >= 6 && editDistanceAtMostOne(n, m)))),
    );
    if (!duplicate) kept.push({ entity, names });
  }
  return kept.map((k) => k.entity);
}

const cleanArtists = (entities: QlooEntity[], headlinerId: string) =>
  dedupeArtists(entities.filter((e) => e.entity_id !== headlinerId && isMusician(e)));

// Similar artists smaller than the headliner. Computed once per tour, checked per city.
export async function openerCandidates(artist: Artist): Promise<OpenerCandidate[]> {
  const { entities = [] } = await insights("urn:entity:artist", {
    "signal.interests.entities": artist.id,
    "filter.exclude.entities": artist.id,
    ...(artist.popularity ? { "filter.popularity.max": artist.popularity } : {}),
    take: 20,
  });
  return cleanArtists(entities, artist.id)
    .slice(0, CANDIDATES)
    .map((e) => ({ id: e.entity_id, name: e.name, popularity: e.popularity, affinity: e.query?.affinity }));
}

// The city's favourite acts (location signal). National stars top every city's list, so an act
// counts as local only if it is in at most a third of the tour cities' lists.
async function localActs(artist: Artist, cities: CityScore[]) {
  const lists = await Promise.all(
    cities.map((city) =>
      insights(
        "urn:entity:artist",
        { "signal.location.query": locationQuery(city.city), take: LOCAL_TAKE },
        { allowUnlisted: ["signal.location.query"] },
      )
        .then(({ entities = [] }) =>
          cleanArtists(entities, artist.id).filter(
            (e) => artist.popularity === undefined || (e.popularity ?? 0) <= artist.popularity,
          ),
        )
        .catch(() => [] as QlooEntity[]),
    ),
  );
  const seen = new Map<string, number>();
  for (const list of lists) for (const e of list) seen.set(e.entity_id, (seen.get(e.entity_id) ?? 0) + 1);
  const maxCities = Math.max(1, Math.floor(cities.length / 3));
  return lists.map((list) => list.filter((e) => (seen.get(e.entity_id) ?? 0) <= maxCities));
}

// Scores a city's local acts against the headliner's audience (`filter.results.entities`); only
// acts within LOCAL_MARGIN of the similar-artist shortlist's affinity count.
async function localOpener(artist: Artist, city: CityScore, acts: QlooEntity[], minAffinity: number) {
  if (!acts.length) return undefined;
  const { entities: scored = [] } = await insights("urn:entity:artist", {
    "signal.interests.entities": artist.id,
    "filter.results.entities": acts.map((e) => e.entity_id).join(","),
    take: acts.length,
  });
  const best = scored.find((e) => (e.query?.affinity ?? 0) >= minAffinity);
  if (!best) return undefined;
  const cells = await heatmap({
    "signal.interests.entities": best.entity_id,
    "filter.location.query": locationQuery(city.city),
    "output.heatmap.boundary": "urn:geohash",
  })
    .then((r) => r.length)
    .catch(() => 0);
  return {
    id: best.entity_id,
    name: best.name,
    popularity: best.popularity,
    affinity: best.query?.affinity,
    localCells: cells,
    source: "local" as const,
  };
}

// Per city: a local act that shares the audience wins; otherwise the look-alike with the most
// local pull. `signal.location` barely moves similar-artist results (probe: 8/10 overlap), so
// local pull is measured from heatmaps: lift (cells here ÷ mean across tour cities) × log1p(cells).
export async function pickOpeners(
  artist: Artist,
  candidates: OpenerCandidate[],
  cities: CityScore[],
  emit: Emit = noopEmit,
): Promise<Map<string, Opener>> {
  const minAffinity = Math.min(...candidates.map((c) => c.affinity ?? 1)) - LOCAL_MARGIN;
  const [cells, locals] = await Promise.all([
    Promise.all(
      candidates.map((candidate) =>
        Promise.all(
          cities.map((city) =>
            heatmap({
              "signal.interests.entities": candidate.id,
              "filter.location.query": locationQuery(city.city),
              "output.heatmap.boundary": "urn:geohash",
            })
              .then((result) => result.length)
              .catch(() => 0),
          ),
        ),
      ),
    ),
    localActs(artist, cities).then((acts) =>
      Promise.all(
        cities.map((city, ci) =>
          candidates.length ? localOpener(artist, city, acts[ci], minAffinity).catch(() => undefined) : undefined,
        ),
      ),
    ),
  ]);

  const picks = new Map<string, Opener>();
  cities.forEach((city, ci) => {
    const local = locals[ci];
    if (local) {
      picks.set(city.city.name, local);
      emit(
        "decision",
        `${city.city.name}: opener ${local.name} (local favourite, audience affinity ${local.affinity?.toFixed(2)}, ${local.localCells} local cells)`,
        { city: city.city.name, opener: local.name, source: "local" },
      );
      return;
    }
    let best: { opener: Opener; score: number } | undefined;
    candidates.forEach((candidate, ki) => {
      const here = cells[ki][ci];
      const mean = cells[ki].reduce((sum, n) => sum + n, 0) / cities.length;
      if (!here || !mean) return;
      const score = (here / mean) * Math.log1p(here);
      if (!best || score > best.score) {
        best = { opener: { ...candidate, localCells: here, source: "similar" }, score };
      }
    });
    if (best) picks.set(city.city.name, best.opener);
    emit(
      "decision",
      best
        ? `${city.city.name}: opener ${best.opener.name} (${best.opener.localCells} local cells, lift ${(best.score / Math.log1p(best.opener.localCells)).toFixed(2)})`
        : `${city.city.name}: no opener with local presence`,
      { city: city.city.name, opener: best?.opener.name, source: "similar" },
    );
  });
  return picks;
}
