import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef } from "react";

import type { CityPlan } from "../../server/core/shared/types";

const STYLE = "https://tiles.openfreemap.org/styles/positron";

// Client-only: maplibre is imported lazily inside the effect, so SSR never touches it.
export function TourMap({ stops }: { stops: CityPlan[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || stops.length === 0) return;
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;

    import("maplibre-gl").then((maplibre) => {
      if (disposed || !container.current) return;
      maplibre.setWorkerUrl(workerUrl);
      map = new maplibre.Map({ container: container.current, style: STYLE, attributionControl: { compact: true } });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }));

      const bounds = new maplibre.LngLatBounds();
      stops.forEach((stop) => bounds.extend([stop.city.lon, stop.city.lat]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 8, animate: false });

      map.on("load", () => {
        if (!map) return;
        map.addSource("hotspots", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: stops.flatMap((stop) =>
              stop.hotspots.map((h) => ({
                type: "Feature" as const,
                properties: { weight: h.affinity * h.popularity },
                geometry: { type: "Point" as const, coordinates: [h.lon, h.lat] },
              })),
            ),
          },
        });
        map.addLayer({
          id: "hotspots",
          type: "heatmap",
          source: "hotspots",
          paint: {
            "heatmap-weight": ["get", "weight"],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 18, 10, 40],
            "heatmap-intensity": 1.5,
            "heatmap-opacity": 0.75,
          },
        });
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: stops.map((s) => [s.city.lon, s.city.lat]) },
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#4f46e5", "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
      });

      stops.forEach((stop, i) => {
        const el = document.createElement("div");
        el.className =
          "flex size-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white shadow ring-2 ring-white";
        el.textContent = String(i + 1);
        const popup = new maplibre.Popup({ offset: 14, closeButton: false }).setText(
          `${stop.city.name}${stop.venue ? ` — ${stop.venue.name}` : ""}${stop.date ? ` (${stop.date})` : ""}`,
        );
        new maplibre.Marker({ element: el }).setLngLat([stop.city.lon, stop.city.lat]).setPopup(popup).addTo(map!);
      });
    });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [stops]);

  if (stops.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        The map appears once the tour is routed.
      </div>
    );
  }
  return <div ref={container} className="h-full w-full" />;
}
