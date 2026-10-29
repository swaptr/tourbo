// Probe Qloo capabilities the engine depends on (PLAN.md §3).
// Raw responses go to /tmp only; never commit Qloo data.
import { mkdirSync, writeFileSync } from "node:fs";

import {
  heatmap,
  insights,
  searchEntities,
  searchTags,
  type QlooEntity,
} from "../server/core/qloo/api.server.ts";
import { qlooCallCount, qlooGet } from "../server/core/qloo/client.server.ts";

const OUT = "/tmp/qloo-probe";
mkdirSync(OUT, { recursive: true });

const ARTISTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["Taylor Swift", "Japanese Breakfast", "Water From Your Eyes"];
const CITY = "Chicago";
const VENUE_TAG_QUERIES = ["live music", "music venue", "concert", "nightclub", "bar"];

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const start = performance.now();
  try {
    const result = await fn();
    writeFileSync(`${OUT}/${name}.json`, JSON.stringify(result, null, 2));
    console.log(`  ✓ ${name} (${Math.round(performance.now() - start)} ms)`);
    return result;
  } catch (error) {
    console.log(`  ✗ ${name}: ${(error as Error).message}`);
    return undefined;
  }
}

console.log("1. /search artists");
const artists: QlooEntity[] = [];
for (const name of ARTISTS) {
  const results = await step(`search-${slug(name)}`, () =>
    searchEntities(name, { types: ["urn:entity:artist"], take: 3 }),
  );
  const top = results?.[0];
  if (!top) continue;
  console.log(`     ${name} → ${top.name} ${top.entity_id} pop=${fmt(top.popularity)}`);
  artists.push(top);
}
if (!artists.length) process.exit(1);

console.log(`2. heatmap per artist in ${CITY}`);
const hotspots = new Map<string, string>();
for (const artist of artists) {
  const cells = await step(`heatmap-${slug(artist.name)}`, () =>
    heatmap({
      "signal.interests.entities": artist.entity_id,
      "filter.location.query": CITY,
      "output.heatmap.boundary": "urn:geohash",
    }),
  );
  if (!cells?.length) continue;
  const sorted = [...cells].sort((a, b) => b.query.affinity - a.query.affinity);
  hotspots.set(artist.entity_id, sorted[0].location.geohash);
  console.log(
    `     ${artist.name}: ${cells.length} cells, top=${sorted[0].location.geohash} aff=${fmt(sorted[0].query.affinity)} pop=${fmt(sorted[0].query.popularity)}`,
  );
}

console.log("3. venue tags + place insights");
const venueTags = [];
for (const query of VENUE_TAG_QUERIES) {
  const tags = await step(`tags-${slug(query)}`, () => searchTags(query, { take: 5 }));
  console.log(`     "${query}": ${tags?.map((t) => t.id).join(", ") || "none"}`);
  const placeTag = tags?.find((t) => t.id.startsWith("urn:tag:category:place:"));
  if (placeTag) venueTags.push(placeTag);
}
const geohash = hotspots.values().next().value?.slice(0, 5);
for (const tag of venueTags) {
  const byGeohash = await step(`places-geohash-${slug(tag.name)}`, () =>
    insights("urn:entity:place", {
      "filter.tags": tag.id,
      ...(geohash ? { "filter.location.geohash": geohash } : {}),
      "signal.interests.entities": artists[0].entity_id,
      take: 5,
    }),
  );
  const byCity = await step(`places-city-${slug(tag.name)}`, () =>
    insights(
      "urn:entity:place",
      {
        "filter.tags": tag.id,
        "filter.location.query": CITY,
        "signal.interests.entities": artists[0].entity_id,
        take: 5,
      },
      { allowUnlisted: ["filter.location.query"] },
    ),
  );
  console.log(`     ${tag.id}`);
  console.log(`       @${geohash}: ${names(byGeohash?.entities)}`);
  console.log(`       @${CITY}: ${names(byCity?.entities)}`);
}

console.log(`4. local openers (artist insights, signal.location.query=${CITY})`);
const headliner = artists[1] ?? artists[0];
const base = await step("openers-no-location", () =>
  insights("urn:entity:artist", {
    "signal.interests.entities": headliner.entity_id,
    take: 10,
  }),
);
const local = await step("openers-chicago", () =>
  insights(
    "urn:entity:artist",
    {
      "signal.interests.entities": headliner.entity_id,
      "signal.location.query": CITY,
      take: 10,
    },
    { allowUnlisted: ["signal.location.query"] },
  ),
);
const baseNames = base?.entities?.map((e) => e.name) ?? [];
const localNames = local?.entities?.map((e) => e.name) ?? [];
console.log(`     no location: ${baseNames.join(" | ")}`);
console.log(`     ${CITY}:     ${localNames.join(" | ")}`);
console.log(
  `     overlap ${localNames.filter((n) => baseNames.includes(n)).length}/${localNames.length} (lower = location has effect)`,
);

console.log("5. locality insights with artist signal");
const localities = await step("localities", () =>
  qlooGet<{ results?: { entities?: { name: string }[] } }>("/v2/insights", {
    "filter.type": "urn:entity:locality",
    "signal.interests.entities": artists[0].entity_id,
    take: 10,
  }),
);
console.log(
  `     ${localities?.results?.entities?.map((e) => e.name).join(" | ") || "none"}`,
);

console.log(`\nTotal Qloo calls: ${qlooCallCount()}. Raw responses: ${OUT}`);

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function names(entities?: { name: string }[]) {
  return entities?.map((e) => e.name).join(" | ") || "none";
}

function fmt(n?: number) {
  return n === undefined ? "?" : n.toFixed(3);
}
