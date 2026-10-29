import { haversineKm } from "./routing.ts";

// Venue access from OpenStreetMap: nearest rail station and airport via Photon (photon.komoot.io),
// transit stops + parking nearby via Overpass when it answers in time. Not Qloo data; cached
// in memory per rounded location.
const PHOTON = "https://photon.komoot.io/api/";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const UA = { "User-Agent": "tourbo/0.1 (tour planning demo)", Accept: "application/json" };
const cache = new Map<string, Promise<Access>>();

export type Place = { name: string; km: number; kind: string };
export type Access = {
  nearestStation?: Place;
  nearestAirport?: Place;
  transitStops800m?: number; // undefined when Overpass did not answer
  parking500m?: number;
  score: number; // 0–100: station walkable, transit nearby, airport within an hour
  source: "OpenStreetMap";
};

type Feature = { geometry: { coordinates: [number, number] }; properties: { name?: string } };

export function accessFor(lat: number, lon: number): Promise<Access> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = compute(lat, lon);
    cache.set(key, hit);
  }
  return hit;
}

const km = (lat: number, lon: number, [plon, plat]: [number, number]) =>
  Math.round(haversineKm({ name: "", region: "na", lat, lon }, { name: "", region: "na", lat: plat, lon: plon }) * 10) / 10;

async function nearest(lat: number, lon: number, q: string, tag: string, kind: string, maxKm: number): Promise<Place | undefined> {
  const url = `${PHOTON}?${new URLSearchParams({ q, osm_tag: tag, lat: String(lat), lon: String(lon), limit: "10", location_bias_scale: "0.1" })}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  if (!res?.ok) return undefined;
  const { features = [] } = (await res.json()) as { features?: Feature[] };
  const best = features
    .map((f) => ({ name: f.properties.name ?? kind, km: km(lat, lon, f.geometry.coordinates), kind }))
    .filter((p) => p.km <= maxKm)
    .sort((a, b) => a.km - b.km)[0];
  return best;
}

async function nearby(lat: number, lon: number) {
  const ql = `[out:json][timeout:8];(node["highway"="bus_stop"](around:800,${lat},${lon});node["public_transport"="platform"](around:800,${lat},${lon});node["railway"~"^(subway_entrance|tram_stop)$"](around:800,${lat},${lon}););out ids 200;nwr["amenity"="parking"](around:500,${lat},${lon});out ids 50;`;
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: ql }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const { elements = [] } = (await res.json()) as { elements?: { type: string; tags?: Record<string, string> }[] };
    return { stops: elements.filter((e) => e.type === "node").length, parking: elements.filter((e) => e.type !== "node").length };
  } catch {
    return undefined;
  }
}

async function compute(lat: number, lon: number): Promise<Access> {
  const [station, airport, around] = await Promise.all([
    nearest(lat, lon, "station", "railway:station", "station", 30),
    nearest(lat, lon, "airport", "aeroway:aerodrome", "airport", 120),
    nearby(lat, lon),
  ]);
  const score = Math.round(
    (station ? Math.max(0, 45 - station.km * 9) : 0) +
      (airport ? Math.max(0, 25 - airport.km / 3) : 0) +
      (around ? Math.min(25, around.stops * 2.5) + Math.min(5, around.parking) : 15), // unknown transit: neutral
  );
  return { nearestStation: station, nearestAirport: airport, transitStops800m: around?.stops, parking500m: around?.parking, score: Math.min(100, score), source: "OpenStreetMap" };
}
