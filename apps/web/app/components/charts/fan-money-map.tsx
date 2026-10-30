import "maplibre-gl/dist/maplibre-gl.css";
import { basemapStyle } from "~/lib/map-style";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";

import type { CityPlan } from "@tourbo/core/shared/types.ts";
import { Skeleton } from "~/components/ui/skeleton";
import { tokenColor } from "~/lib/css-color";
import { signed } from "~/lib/analytics";
import { Key } from "./bars";

// Same base map as components/tour-map.tsx. Each stop is a circle: area ~ fan strength,
// colour = does the night make money (cobalt) or lose it (tomato); grey = dropped / no estimate.
// Two hues + grey (all-pairs safe). DOM markers so the theme's oklch tokens apply directly.
const color = (s: CityPlan) => (!s.money || s.money.verdict === "skip" ? "var(--viz-0)" : s.money.profit >= 0 ? "var(--viz-2)" : "var(--viz-1)");
const diameter = (score: number) => Math.round(14 + Math.sqrt(Math.max(0, score) / 100) * 30);

export function FanMoneyMap({ stops }: { stops: CityPlan[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!container.current || !stops.length) return;
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    import("maplibre-gl")
      .then((maplibre) => {
        if (disposed || !container.current) return;
        maplibre.setWorkerUrl(workerUrl);
        map = new maplibre.Map({ container: container.current, style: basemapStyle(), attributionControl: { compact: true }, cooperativeGestures: true });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }));
        const bounds = new maplibre.LngLatBounds();
        stops.forEach((s) => bounds.extend([s.city.lon, s.city.lat]));
        map.fitBounds(bounds, { padding: 56, maxZoom: 7, animate: false });
        map.on("error", () => !disposed && setFailed((f) => f || !map?.loaded()));
        map.on("load", () => {
          if (disposed || !map) return;
          container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: stops.map((s) => [s.city.lon, s.city.lat]) } } });
          map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": tokenColor("muted-foreground", 0.7), "line-width": 2 } });
          setReady(true);
        });
        stops.forEach((s, i) => {
          const el = document.createElement("button");
          el.type = "button";
          const d = diameter(s.score);
          el.style.cssText = `width:${d}px;height:${d}px;background:${color(s)};`;
          el.className = "rounded-full ring-2 ring-card opacity-90 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring";
          const verdict = !s.money ? "no money estimate" : s.money.verdict === "skip" ? "dropped" : `${signed(s.money.profit, s.money.currency)} for you`;
          const text = `${i + 1}. ${s.city.name}: fan strength ${Math.round(s.score)}, ${verdict}`;
          el.setAttribute("aria-label", text);
          el.title = text;
          new maplibre.Marker({ element: el }).setLngLat([s.city.lon, s.city.lat]).setPopup(new maplibre.Popup({ offset: d / 2 + 4, closeButton: false }).setText(text)).addTo(map!);
        });
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [stops]);

  return (
    <div className="space-y-2" data-testid="fan-money-map">
      <div className="relative h-72 overflow-hidden rounded-lg ring-1 ring-foreground/10 sm:h-96">
        <div ref={container} className="h-full w-full" />
        {!ready && !failed && <Skeleton className="absolute inset-0 rounded-none" />}
        {failed && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">The map didn't load. Reload the page to try again.</p>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Key color="var(--viz-2)" label="Makes money" shape="dot" />
        <Key color="var(--viz-1)" label="Loses money" shape="dot" />
        <Key color="var(--viz-0)" label="Dropped or no estimate" shape="dot" />
        <span className="text-xs text-muted-foreground">Bigger circle = more fans</span>
      </div>
    </div>
  );
}
