// Deterministic fan-data double for the BDD suite. A tiny HTTP server that answers the endpoints
// the app calls (`/search`, `/v2/insights`, `/v2/tags`, `/v2/trending`, `/entities`,
// `/v2/audiences`, `/v2/analysis/compare`) with SYNTHETIC data: made-up names ("Test Act 7",
// "Test Venue 3"), numbers seeded by the request, never a real response. Wire it with
// QLOO_BASE_URL=http://127.0.0.1:<port>. City coordinates come from the app's own seed list.
//
// Control (test only): POST /__bdd/fail?status=429&count=N makes the next N data requests fail
// (count omitted = until reset); POST /__bdd/reset clears it; GET /__bdd/stats returns counters.
//
// Run alone: node tests/bdd/support/fake-fan-data.ts [port]
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { allSeedCities } from "@tourbo/core/engine/cities.ts";

// ---------- deterministic helpers ----------
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const unit = (s: string) => (hash(s) % 10_000) / 10_000; // 0..1
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x";

const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function geohash(lat: number, lon: number, precision = 7) {
  let [latMin, latMax, lonMin, lonMax] = [-90, 90, -180, 180];
  let out = "";
  let bit = 0;
  let ch = 0;
  let even = true;
  while (out.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) (ch = (ch << 1) | 1), (lonMin = mid);
      else (ch <<= 1), (lonMax = mid);
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) (ch = (ch << 1) | 1), (latMin = mid);
      else (ch <<= 1), (latMax = mid);
    }
    even = !even;
    if (++bit === 5) (out += B32[ch]), (bit = 0), (ch = 0);
  }
  return out;
}
function geohashCenter(gh: string) {
  let [latMin, latMax, lonMin, lonMax] = [-90, 90, -180, 180];
  let even = true;
  for (const c of gh) {
    const v = B32.indexOf(c);
    for (let b = 4; b >= 0; b--) {
      const on = (v >> b) & 1;
      if (even) on ? (lonMin = (lonMin + lonMax) / 2) : (lonMax = (lonMin + lonMax) / 2);
      else on ? (latMin = (latMin + latMax) / 2) : (latMax = (latMin + latMax) / 2);
      even = !even;
    }
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

// ---------- places ----------
const CITIES = allSeedCities();
function cityFor(query: string | undefined) {
  if (!query) return undefined;
  const q = query.toLowerCase().trim();
  return (
    CITIES.find((c) => (c.query ?? c.name).toLowerCase() === q || c.name.toLowerCase() === q) ??
    CITIES.find((c) => q.startsWith(c.name.toLowerCase()) || c.name.toLowerCase().startsWith(q.split(",")[0]))
  );
}
function pointOf(p: URLSearchParams): { lat: number; lon: number; key: string } | undefined {
  const wkt = p.get("filter.location");
  const m = wkt?.match(/POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (m) return { lon: Number(m[1]), lat: Number(m[2]), key: `${Number(m[2]).toFixed(1)},${Number(m[1]).toFixed(1)}` };
  const gh = p.get("filter.location.geohash");
  if (gh) return { ...geohashCenter(gh), key: gh };
  const c = cityFor(p.get("filter.location.query") ?? p.get("signal.location.query") ?? undefined);
  if (c) return { lat: c.lat, lon: c.lon, key: c.name };
  return undefined;
}

// ---------- entities ----------
// One description that passes every discipline's peer filter (openers.ts PERFORMER, registry
// peerPattern): the double is about flows, not about telling a dancer from a chef.
const DESCRIPTION =
  "Test act: a band and singer, stand-up comedian, dancer and choreographer, poet and spoken word writer, artist and painter, author, speaker and storyteller, magician, actor and improv player, photographer, potter and craft maker, circus acrobat, chef and cook, filmmaker and director, yoga teacher.";

const NOUN: Record<string, string> = {
  "urn:entity:artist": "Test Act",
  "urn:entity:person": "Test Person",
  "urn:entity:place": "Test Place",
  "urn:entity:tv_show": "Test Show",
  "urn:entity:movie": "Test Film",
  "urn:entity:podcast": "Test Podcast",
  "urn:entity:book": "Test Book",
  "urn:entity:brand": "Test Brand",
  "urn:entity:destination": "Test Destination",
  "urn:entity:album": "Test Album",
  "urn:entity:videogame": "Test Game",
};
const POOL = 40;
const idOf = (type: string, n: number) => {
  const h = hash(`${type}:${n}`).toString(16).padStart(8, "0");
  return `${h}-${h.slice(0, 4)}-4${h.slice(1, 4)}-8${h.slice(2, 5)}-${h}${h.slice(0, 4)}`.toUpperCase();
};
const ENTITY_BY_ID = new Map<string, { type: string; n: number; name?: string }>();

function entity(type: string, n: number, opts: { seed?: string; name?: string; place?: { lat: number; lon: number }; tags?: string[] } = {}) {
  const name = opts.name ?? `${NOUN[type] ?? "Test Item"} ${n}`;
  const id = opts.name ? idOf(`${type}:named:${slug(opts.name)}`, 0) : idOf(type, n);
  ENTITY_BY_ID.set(id, { type, n, name });
  const seed = opts.seed ?? "";
  const affinity = round(0.35 + 0.64 * unit(`${seed}|${type}|${n}|a`));
  const e: Record<string, unknown> = {
    name,
    entity_id: id,
    type: "urn:entity",
    types: [type],
    subtype: type,
    popularity: round(0.2 + 0.79 * unit(`${type}|${n}|pop`)),
    properties: {
      description: type === "urn:entity:artist" || type === "urn:entity:person" ? DESCRIPTION : `A made-up ${type.split(":").at(-1)} for tests.`,
      instruments: type === "urn:entity:artist" ? ["guitar"] : undefined,
      release_year: 1970 + (hash(`${n}|y`) % 55),
      short_descriptions: [{ value: DESCRIPTION, languages: ["en"] }],
    },
    tags: [
      { tag_id: `urn:tag:genre:music:test_style_${n % 7}`, name: `test style ${n % 7}`, type: "urn:tag:genre" },
      ...(opts.tags ?? []).map((t) => ({ tag_id: t, id: t, name: t.split(":").at(-1)!.replace(/_/g, " "), type: t.split(":").slice(0, 3).join(":") })),
    ],
    query: { affinity, distance: round(unit(`${seed}|${n}|d`) * 3000, 0) },
  };
  if (opts.place) {
    const lat = opts.place.lat + (unit(`${seed}|${n}|lat`) - 0.5) * 0.04;
    const lon = opts.place.lon + (unit(`${seed}|${n}|lon`) - 0.5) * 0.04;
    e.location = { lat: round(lat, 5), lon: round(lon, 5), geohash: geohash(lat, lon, 9) };
    e.properties = { ...(e.properties as object), address: `${n} Test Street`, neighborhood: `Test Quarter ${n % 5}`, business_rating: 4.2 };
  }
  return e;
}

// A seeded list: the same pool of names everywhere, ordered and scored per request seed, so two
// cities share some names with different numbers (over-indexing works) and their tops differ.
function list(type: string, seed: string, take: number, extra: Parameters<typeof entity>[2] = {}) {
  const ns = Array.from({ length: POOL }, (_, i) => i + 1)
    .map((n) => ({ n, s: unit(`${seed}|${type}|${n}|rank`) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, take)
    .map((x) => x.n);
  return ns.map((n) => entity(type, n, { ...extra, seed })).sort((a, b) => (b.query as { affinity: number }).affinity - (a.query as { affinity: number }).affinity);
}

const TAG_KEYWORDS = ["music", "comedy", "magic", "theatre", "cuisine", "yoga", "dance", "poetry", "literary", "film"];
function tagList(query: string, take: number) {
  const q = query.trim() || "scene";
  const base = TAG_KEYWORDS.map((kw, i) => ({
    id: `urn:tag:genre:${kw === "music" ? "music" : kw === "literary" ? "book" : "media"}:test_${kw}_${slug(q)}`,
    name: `test ${kw} ${q}`.slice(0, 40),
    type: "urn:tag:genre",
    i,
  }));
  const music = [1, 2].map((k) => ({ id: `urn:tag:genre:music:test_music_${slug(q)}_${k}`, name: `test music ${q} ${k}`.slice(0, 40), type: "urn:tag:genre", i: 10 + k }));
  return [...base, ...music].slice(0, Math.max(take, 3)).map(({ i, ...t }) => t);
}
function insightTags(seed: string, take: number) {
  return Array.from({ length: Math.min(take, 20) }, (_, i) => {
    const n = (hash(`${seed}|tag|${i}`) % 30) + 1;
    return { tag_id: `urn:tag:keyword:test:theme_${n}`, id: `urn:tag:keyword:test:theme_${n}`, name: `test theme ${n}`, type: "urn:tag:keyword", query: { affinity: round(0.3 + 0.69 * unit(`${seed}|tagaff|${n}`)) } };
  }).filter((t, i, a) => a.findIndex((x) => x.tag_id === t.tag_id) === i);
}

function heatmap(p: URLSearchParams) {
  const at = pointOf(p);
  if (!at) return [];
  const seed = `${p.get("signal.interests.entities") ?? ""}|${p.get("signal.interests.tags") ?? ""}|${at.key}`;
  const cells = 60 + (hash(seed) % 40);
  return Array.from({ length: cells }, (_, i) => {
    const lat = at.lat + (unit(`${seed}|${i}|y`) - 0.5) * 0.5;
    const lon = at.lon + (unit(`${seed}|${i}|x`) - 0.5) * 0.5;
    return {
      location: { latitude: round(lat, 5), longitude: round(lon, 5), geohash: geohash(lat, lon, 6) },
      query: { affinity: round(unit(`${seed}|${i}|a`)), affinity_rank: round(0.2 + 0.8 * unit(`${seed}|${i}|r`)), popularity: round(unit(`${seed}|${i}|p`)) },
    };
  });
}

function demographics(seed: string) {
  const b = (k: string) => round(unit(`${seed}|${k}`) * 0.8 - 0.4, 2);
  return [
    {
      entity_id: idOf("demo", hash(seed) % 1000),
      query: {
        age: { "24_and_younger": b("a1"), "25_to_29": b("a2"), "30_to_34": b("a3"), "35_to_44": b("a4"), "45_to_54": b("a5"), "55_and_older": b("a6") },
        gender: { male: b("m"), female: b("f") },
      },
    },
  ];
}

// ---------- routes ----------
type Json = Record<string, unknown>;
function insights(p: URLSearchParams): Json {
  const type = p.get("filter.type") ?? "urn:entity:artist";
  const take = Math.min(Number(p.get("take") ?? 20) || 20, 50);
  if (type === "urn:heatmap") return { success: true, results: { heatmap: heatmap(p) } };
  if (type === "urn:demographics") return { success: true, results: { demographics: demographics(p.toString()) } };
  const seed = [p.get("signal.interests.entities"), p.get("signal.interests.tags"), p.get("signal.location.query"), p.get("filter.location.query"), p.get("filter.location"), p.get("filter.location.geohash"), p.get("filter.tags"), p.get("bias.trends")].join("|");
  if (type === "urn:tag") return { success: true, results: { tags: insightTags(seed, take) } };
  if (type === "urn:entity:place") {
    const at = pointOf(p);
    if (!at) return { success: true, results: { entities: [] } };
    const tags = (p.get("filter.tags") ?? "").split(",").filter(Boolean);
    const venueLike = tags.some((t) => !/tourist|landmark|park|restaurant|cafe|attraction|mall/.test(t));
    return {
      success: true,
      results: {
        entities: list(type, seed, Math.min(take, 15), { place: at, tags: tags.slice(0, 1) }).map((e) => (venueLike ? { ...e, name: String(e.name).replace("Test Place", "Test Venue") } : e)),
      },
    };
  }
  const exclude = new Set((p.get("filter.exclude.entities") ?? "").split(",").filter(Boolean));
  return { success: true, results: { entities: list(type, seed, take + exclude.size).filter((e) => !exclude.has(String(e.entity_id))).slice(0, take) } };
}

// Names starting "Unlisted" or "Nobody" are not in the fan data: search stays fuzzy (returns
// other names), as the real search does, so the app must refuse the near-miss itself.
const UNKNOWN = /^(unlisted|nobody|not listed)\b/i;
function search(p: URLSearchParams): Json {
  const query = (p.get("query") ?? "").trim();
  const types = (p.get("types") ?? p.get("filter.type") ?? "urn:entity:artist").split(",").filter(Boolean);
  const take = Math.min(Number(p.get("take") ?? 5) || 5, 20);
  const type = types[0];
  const fuzzy = Array.from({ length: take }, (_, i) => entity(type, ((hash(query) + i) % POOL) + 1));
  if (!query || UNKNOWN.test(query)) return { results: UNKNOWN.test(query) ? fuzzy.slice(0, 2) : [] };
  // "Test Act" (autocomplete) → the pool; "Test Act 7" → that entity first.
  const m = query.match(/^test (act|person|show|film|podcast|book)\s*(\d+)?$/i);
  if (m) {
    const t = Object.entries(NOUN).find(([, v]) => v.toLowerCase() === `test ${m[1].toLowerCase()}`)?.[0] ?? type;
    const first = m[2] ? [Number(m[2])] : [];
    const ns = [...first, ...Array.from({ length: take }, (_, i) => i + 1).filter((n) => !first.includes(n))].slice(0, take);
    return { results: ns.map((n) => entity(t, n)) };
  }
  return { results: [entity(type, 0, { name: query }), ...fuzzy.slice(0, take - 1)] };
}

function entities(p: URLSearchParams): Json {
  const ids = (p.get("entity_ids") ?? "").split(",").filter(Boolean);
  return {
    results: ids.flatMap((id) => {
      const e = ENTITY_BY_ID.get(id);
      return e ? [entity(e.type, e.n, e.name && !/^Test /.test(e.name) ? { name: e.name } : {})] : [];
    }),
  };
}

function trending(p: URLSearchParams): Json {
  const seed = p.toString();
  return {
    results: {
      trending: Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(1 + i * 2).padStart(2, "0")}`, population_percentile: round(unit(`${seed}|${i}`)), population_rank: i + 1, population_rank_velocity: round(unit(`${seed}|v${i}`) - 0.5) })),
      entities: list(p.get("filter.type") ?? "urn:entity:tv_show", seed, 10),
    },
  };
}

function audiences(p: URLSearchParams): Json {
  const seed = p.toString();
  return { results: { audiences: Array.from({ length: 6 }, (_, i) => ({ id: `urn:audience:test:group_${i + 1}`, name: `Test Audience ${i + 1}`, entity_id: idOf("aud", i), query: { affinity: round(unit(`${seed}|${i}`)) } })) } };
}

function compare(p: URLSearchParams): Json {
  return { results: { tags: insightTags(p.toString(), 10) } };
}

// ---------- server ----------
export type FakeFanData = { url: string; port: number; close: () => Promise<void>; fail: (status: number, count?: number) => void; reset: () => void; stats: () => Record<string, number> };

export async function startFakeFanData(port = 0): Promise<FakeFanData> {
  let failStatus = 0;
  let failLeft = Infinity;
  const counts: Record<string, number> = {};
  const fail = (status: number, count = Infinity) => ((failStatus = status), (failLeft = count));
  const reset = () => ((failStatus = 0), (failLeft = Infinity));

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const p = url.searchParams;
    if (url.pathname.startsWith("/__bdd/")) {
      if (url.pathname === "/__bdd/fail") fail(Number(p.get("status") ?? 429), p.get("count") ? Number(p.get("count")) : Infinity);
      if (url.pathname === "/__bdd/reset") reset();
      return send(res, 200, { ok: true, counts });
    }
    counts[url.pathname] = (counts[url.pathname] ?? 0) + 1;
    if (!req.headers["x-api-key"]) return send(res, 401, { error: { reason: "missing key", message: "X-Api-Key required (fake)" } });
    if (failStatus && failLeft > 0) {
      failLeft--;
      if (failLeft <= 0) failStatus = 0;
      return send(res, failStatus, { error: { reason: "Rate limit exceeded", message: "fake double: failing on purpose" } }, failStatus === 429 ? { "retry-after": "0" } : {});
    }
    try {
      switch (url.pathname) {
        case "/search":
          return send(res, 200, search(p));
        case "/v2/insights":
        case "/v2/insights/":
          return send(res, 200, insights(p));
        case "/v2/tags":
          return send(res, 200, { success: true, results: { tags: tagList(p.get("filter.query") ?? "", Number(p.get("take") ?? 10)) } });
        case "/v2/trending":
          return send(res, 200, trending(p));
        case "/entities":
          return send(res, 200, entities(p));
        case "/v2/audiences":
          return send(res, 200, audiences(p));
        case "/v2/analysis/compare":
          return send(res, 200, compare(p));
        default:
          return send(res, 404, { error: { reason: "not found", message: `fake double has no ${url.pathname}` } });
      }
    } catch (error) {
      return send(res, 500, { error: { reason: "fake failed", message: String(error) } });
    }
  };
  const server: Server = createServer(handler);
  await new Promise<void>((ok) => server.listen(port, "127.0.0.1", ok));
  const actual = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    fail,
    reset,
    stats: () => ({ ...counts }),
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}

if (import.meta.main) {
  const f = await startFakeFanData(Number(process.argv[2] ?? 3199));
  console.log(`fake fan data on ${f.url}`);
}
