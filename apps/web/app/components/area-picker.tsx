import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { tokenColor } from "~/lib/css-color";
import { useEffect, useMemo, useRef, useState } from "react";

import { distanceKm } from "@tourbo/core/shared/geo.ts";

const STYLE = "https://tiles.openfreemap.org/styles/positron";

export type SeedCity = { name: string; lat: number; lon: number; region: string };
export type AreaValue = { lat: number; lon: number; radiusKm: number };

// Circle as a 64-point polygon (good enough at tour scale).
function circle({ lat, lon, radiusKm }: AreaValue) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    const dLat = (radiusKm / 6371) * (180 / Math.PI) * Math.sin(t);
    const dLon = ((radiusKm / 6371) * (180 / Math.PI) * Math.cos(t)) / Math.cos((lat * Math.PI) / 180);
    coords.push([lon + dLon, lat + dLat]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

// Same rule as the server (citiesNear): cities in the nearest city's region, inside the circle.
export function citiesInside(cities: SeedCity[], area: AreaValue) {
  const ranked = cities.map((c) => ({ ...c, km: distanceKm(area, c) })).sort((a, b) => a.km - b.km);
  const region = ranked[0]?.region;
  return { region, nearest: ranked[0], inside: ranked.filter((c) => c.region === region && c.km <= area.radiusKm) };
}

const cityPoints = (cities: SeedCity[], inside: Set<string>) => ({
  type: "FeatureCollection" as const,
  features: cities.map((c) => ({
    type: "Feature" as const,
    properties: { name: c.name, inside: inside.has(c.name) ? 1 : 0 },
    geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
  })),
});

// Click the map to set where the tour happens; cities inside the circle are the candidates.
export function AreaPicker({ cities, value, onChange }: { cities: SeedCity[]; value: AreaValue; onChange: (v: AreaValue) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const { inside } = useMemo(() => citiesInside(cities, value), [cities, value]);
  const insideNames = useMemo(() => new Set(inside.map((c) => c.name)), [inside]);
  const latest = useRef({ value, onChange, insideNames });
  latest.current = { value, onChange, insideNames };

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    import("maplibre-gl")
      .then((maplibre) => {
        if (disposed || !container.current) return;
        maplibre.setWorkerUrl(workerUrl);
        const map = new maplibre.Map({
          container: container.current,
          style: STYLE,
          center: [value.lon, value.lat],
          zoom: 4,
          locale: { "Map.Title": "Area map" },
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }));
        map.on("error", () => {});
        map.on("load", () => {
          // Compact attribution starts expanded; collapse it so it doesn't cover the map on phones.
          container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          map.addSource("area", { type: "geojson", data: circle(latest.current.value) });
          map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": tokenColor("primary"), "fill-opacity": 0.08 } });
          map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": tokenColor("primary"), "line-width": 1.5 } });
          map.addSource("cities", { type: "geojson", data: cityPoints(cities, latest.current.insideNames) });
          map.addLayer({
            id: "cities",
            type: "circle",
            source: "cities",
            paint: {
              "circle-radius": ["case", ["==", ["get", "inside"], 1], 5, 3],
              "circle-color": ["case", ["==", ["get", "inside"], 1], tokenColor("primary"), tokenColor("muted-foreground")],
              "circle-stroke-color": tokenColor("background"),
              "circle-stroke-width": 1.5,
            },
          });
          map.addLayer({
            id: "city-labels",
            type: "symbol",
            source: "cities",
            filter: ["==", ["get", "inside"], 1],
            layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top" },
            paint: { "text-color": tokenColor("foreground"), "text-halo-color": tokenColor("background"), "text-halo-width": 1.2 },
          });
        });
        map.on("click", (e) => latest.current.onChange({ ...latest.current.value, lat: e.lngLat.lat, lon: e.lngLat.lng }));
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
    // Map is created once; updates flow through the effect below.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      (map.getSource("area") as import("maplibre-gl").GeoJSONSource | undefined)?.setData(circle(value));
      (map.getSource("cities") as import("maplibre-gl").GeoJSONSource | undefined)?.setData(cityPoints(cities, insideNames));
    };
    if (map.getSource("area")) update();
    else map.once("load", update);
    const r = value.radiusKm / 111;
    map.fitBounds(
      [
        [value.lon - r / Math.cos((value.lat * Math.PI) / 180), value.lat - r],
        [value.lon + r / Math.cos((value.lat * Math.PI) / 180), value.lat + r],
      ],
      { padding: 24, duration: 400 },
    );
  }, [value, cities, insideNames]);

  if (failed) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">The map couldn't load. Pick a city below instead.</div>;
  return <div ref={container} className="h-full w-full cursor-crosshair" aria-label="Map: click to choose where to tour" />;
}
