import "maplibre-gl/dist/maplibre-gl.css";
import { basemapStyle } from "~/lib/map-style";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";

import type { CityPlan } from "@tourbo/core/shared/types.ts";
import { Skeleton } from "~/components/ui/skeleton";
import { addRampRoute, nightMarker, paintRampRoute } from "~/components/map-marks";
import { signed } from "~/lib/analytics";
import { Key } from "./bars";

// Same marks as the Plan map (components/map-marks.ts): numbered night markers ringed in the fan
// ramp, the route on that ramp, and each night's own label (city + what you keep) beside its marker
// so no marker covers a city name. DOM markers so the theme's tokens apply directly.
const money = (s: CityPlan) => (!s.money ? "no estimate" : s.money.verdict === "skip" ? "dropped" : signed(s.money.profit, s.money.currency));

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
        // Room on the right for each marker's label (city + money), so none runs off the edge.
        const fit = () => map?.fitBounds(bounds, { padding: { top: 40, bottom: 40, left: 40, right: 130 }, maxZoom: 7, animate: false });
        fit();
        map.on("error", () => !disposed && setFailed((f) => f || !map?.loaded()));
        map.on("load", () => {
          if (disposed || !map) return;
          map.resize();
          fit(); // the box has its final size now
          container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          const route = stops.filter((s) => s.money?.verdict !== "skip");
          const points = route.map((s): [number, number] => [s.city.lon, s.city.lat]);
          map.addSource("route", { type: "geojson", lineMetrics: true, data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } } });
          addRampRoute(map, "route");
          paintRampRoute(map, points, route.map((s) => s.score));
          setReady(true);
        });
        stops.forEach((s, i) => {
          const el = nightMarker(s, i, { label: `${s.city.name.split(",")[0]} ${money(s)}`, labelClass: "num", detail: `night ${i + 1}, fan strength ${Math.round(s.score)}` });
          el.classList.add("focus-visible:outline-2", "focus-visible:outline-ring");
          const text = `Night ${i + 1}, ${s.city.name}: fan strength ${Math.round(s.score)}, ${!s.money ? "no money estimate" : s.money.verdict === "skip" ? "dropped" : `${signed(s.money.profit, s.money.currency)} for you`}`;
          new maplibre.Marker({ element: el }).setLngLat([s.city.lon, s.city.lat]).setPopup(new maplibre.Popup({ offset: 18, closeButton: false }).setText(text)).addTo(map!);
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
        <Key color="var(--score-1)" label="Fewer fans" shape="ring" />
        <Key color="var(--score-4)" label="More fans" shape="ring" />
        <span className="text-xs text-muted-foreground">Number = night · beside it, what you keep</span>
      </div>
    </div>
  );
}
