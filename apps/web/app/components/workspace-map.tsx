import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Flame, MapPinned, Route as RouteIcon, Store, LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CityOption, Pool, VenueOption } from "@tourbo/core/engine/edit.ts";
import { stopKey } from "@tourbo/core/engine/edit.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { prefersReducedMotion, tokenColor } from "~/lib/css-color";
import { isDarkPage, MAP_STYLE } from "~/lib/map-style";
import { cn } from "~/lib/utils";
import { addRampRoute, nightMarker, paintRampRoute } from "~/components/map-marks";

const STYLE = MAP_STYLE;
const isDark = isDarkPage;
const OURS = ["hotspots", "route-casing", "route", "alts", "alts-label", "venues", "venue-clusters", "venue-count", "venues-label"];
const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};
const TOUR_ZOOM = 9; // the whole tour, or a lone city pin with nothing around it (stays regional)

export type Layers = { venues: boolean; fans: boolean; alternatives: boolean; route: boolean };
export type MapPick = { type: "night"; key: string } | { type: "city"; name: string } | { type: "venue"; id: string; city: string };

type Props = {
  plan: Plan;
  pool?: Pool;
  selected?: string; // night key
  cityOptions: CityOption[]; // for the selected night (with deltas)
  venueOptions: VenueOption[];
  focus?: { type: "city"; name: string } | { type: "venue"; id: string };
  fmt: (n: number) => string;
  onPick: (pick: MapPick) => void;
  reframe?: number; // bump to fit the whole tour again (plan changed elsewhere)
  mini?: boolean; // the small map over the nights rail: no layer toggles or zoom buttons
};

const played = (s: Plan["stops"][number]) => s.money?.verdict !== "skip";
const signed = (fmt: (n: number) => string, n: number) => (n === 0 ? "±0" : `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`);

// The plan workspace's canvas (PLAN Q19): the route, numbered night pins (at the chosen room when it
// has coordinates), every room candidate the run found (clustered), fan hotspots, and the other
// cities Tourbo checked as hollow circles sized by fan strength. Selecting a night here selects it
// in the list and the other way round. Client-only: maplibre loads inside the effect.
export function WorkspaceMap({ plan, pool, selected, cityOptions, venueOptions, focus, fmt, onPick, reframe, mini = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | undefined>(undefined);
  const markers = useRef<import("maplibre-gl").Marker[]>([]);
  const lib = useRef<typeof import("maplibre-gl") | undefined>(undefined);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const routeRef = useRef<{ points: [number, number][]; scores: number[] } | undefined>(undefined);
  const [narrow, setNarrow] = useState(false);
  const [layers, setLayers] = useState<Layers>({ venues: true, fans: true, alternatives: true, route: true });

  // Map once.
  useEffect(() => {
    if (!box.current) return;
    let disposed = false;
    // No WebGL (old device, locked-down browser): a drawn sketch of the route instead.
    if (!hasWebGL()) {
      setFailed(true);
      return;
    }
    let themeWatch: MutationObserver | undefined;
    import("maplibre-gl")
      .then((maplibre) => {
        if (disposed || !box.current) return;
        lib.current = maplibre;
        maplibre.setWorkerUrl(workerUrl);
        const map = new maplibre.Map({ container: box.current, style: isDark() ? STYLE.dark : STYLE.light, locale: { "Map.Title": mini ? "Overview map" : "Interactive tour map" }, attributionControl: { compact: true }, cooperativeGestures: window.matchMedia("(max-width: 1023px)").matches });
        mapRef.current = map;
        // Style or tiles never arrive (offline, blocked): show the sketch rather than a blank box.
        const slow = setTimeout(() => !disposed && setFailed(true), 10000);
        map.once("load", () => {
          clearTimeout(slow);
          setFailed(false);
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
        map.on("error", () => {});
        // Theme switch: swap the basemap, carry Tourbo's own sources and layers over.
        let dark = isDark();
        themeWatch = new MutationObserver(() => {
          if (isDark() === dark) return;
          dark = isDark();
          map.setStyle(dark ? STYLE.dark : STYLE.light, {
            transformStyle: (prev, next) => {
              if (!prev) return next;
              const sources = { ...next.sources };
              for (const id of ["hotspots", "route", "alts", "venues"]) if (prev.sources[id]) sources[id] = prev.sources[id];
              return { ...next, sources, layers: [...next.layers, ...prev.layers.filter((l) => OURS.includes(l.id))] };
            },
          });
        });
        // The ramp's dark-mode tokens differ: repaint the route once the new style is in.
        map.on("style.load", () => routeRef.current && map.getLayer("route") && paintRampRoute(map, routeRef.current.points, routeRef.current.scores));
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        map.on("load", () => {
          box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          const primary = tokenColor("primary");
          const fg = tokenColor("foreground");
          const muted = tokenColor("muted-foreground");
          const bg = tokenColor("background");
          const empty = { type: "FeatureCollection" as const, features: [] };
          map.addSource("hotspots", { type: "geojson", data: empty });
          map.addLayer({ id: "hotspots", type: "heatmap", source: "hotspots", paint: { "heatmap-weight": ["get", "w"], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 16, 11, 40], "heatmap-intensity": 1.2, "heatmap-opacity": 0.6, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, tokenColor("score-1", 0.35), 0.5, tokenColor("score-2", 0.5), 0.8, tokenColor("score-3", 0.6), 1, tokenColor("score-4", 0.7)] } });
          map.addSource("route", { type: "geojson", data: empty, lineMetrics: true });
          addRampRoute(map, "route");
          map.addSource("alts", { type: "geojson", data: empty, promoteId: "name" });
          map.addLayer({
            id: "alts",
            type: "circle",
            source: "alts",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["get", "fans"], 0, 6, 100, 18],
              "circle-color": ["case", ["boolean", ["feature-state", "focus"], false], tokenColor("primary", 0.25), "rgba(0,0,0,0)"],
              "circle-stroke-width": ["case", ["boolean", ["feature-state", "focus"], false], 3, 2],
              "circle-stroke-color": ["case", ["get", "gain"], tokenColor("success"), muted],
            },
          });
          map.addLayer({ id: "alts-label", type: "symbol", source: "alts", layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.6], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": fg, "text-halo-color": bg, "text-halo-width": 1.5 } });
          map.addSource("venues", { type: "geojson", data: empty, cluster: true, clusterRadius: 36, clusterMaxZoom: 13, promoteId: "id" });
          map.addLayer({ id: "venue-clusters", type: "circle", source: "venues", filter: ["has", "point_count"], paint: { "circle-color": bg, "circle-opacity": 0.9, "circle-radius": ["step", ["get", "point_count"], 10, 10, 13, 30, 16], "circle-stroke-color": muted, "circle-stroke-width": 1, "circle-stroke-opacity": 0.8 } });
          map.addLayer({ id: "venue-count", type: "symbol", source: "venues", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 10 }, paint: { "text-color": muted } });
          map.addLayer({
            id: "venues",
            type: "circle",
            source: "venues",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": ["case", ["boolean", ["feature-state", "focus"], false], 8, ["get", "near"], 6, 4],
              "circle-color": ["case", ["boolean", ["feature-state", "focus"], false], primary, ["get", "near"], bg, tokenColor("muted-foreground", 0.5)],
              "circle-stroke-color": ["case", ["boolean", ["feature-state", "focus"], false], primary, fg],
              "circle-stroke-width": ["case", ["get", "near"], 2, 0.5],
            },
          });
          map.addLayer({ id: "venues-label", type: "symbol", source: "venues", filter: ["all", ["!", ["has", "point_count"]], ["get", "near"]], minzoom: 11, layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top" }, paint: { "text-color": fg, "text-halo-color": bg, "text-halo-width": 1.5 } });
          for (const id of ["alts", "venues", "venue-clusters"]) {
            map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
          }
          map.on("click", "alts", (e) => {
            const name = e.features?.[0]?.properties?.name;
            if (typeof name === "string") pick.current({ type: "city", name });
          });
          map.on("click", "venues", (e) => {
            const p = e.features?.[0]?.properties;
            if (p && typeof p.id === "string") pick.current({ type: "venue", id: p.id, city: String(p.city) });
          });
          map.on("click", "venue-clusters", async (e) => {
            const f = e.features?.[0];
            const src = map.getSource("venues") as import("maplibre-gl").GeoJSONSource | undefined;
            if (!f || !src) return;
            const zoom = await src.getClusterExpansionZoom(Number(f.properties?.cluster_id)).catch(() => map.getZoom() + 2);
            map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: prefersReducedMotion() ? 0 : 400 });
          });
          setReady(true);
        });
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      themeWatch?.disconnect();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  // Data: route, nights, hotspots, alternatives, rooms.
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = lib.current;
    if (!ready || !map || !maplibre) return;
    const stops = plan.stops.filter(played);
    const set = (id: string, data: GeoJSON.GeoJSON) => (map.getSource(id) as import("maplibre-gl").GeoJSONSource | undefined)?.setData(data);
    const at = (s: Plan["stops"][number]): [number, number] => (s.venue?.lat !== undefined && s.venue.lon !== undefined ? [s.venue.lon, s.venue.lat] : [s.city.lon, s.city.lat]);
    const points = stops.map(at);
    set("route", { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } });
    routeRef.current = { points, scores: stops.map((s) => s.score) };
    paintRampRoute(map, points, routeRef.current.scores);
    const inPlan = new Set(plan.stops.map((s) => s.city.name.toLowerCase()));
    const hs = [...plan.stops.flatMap((s) => s.hotspots), ...(pool?.cities.filter((c) => !inPlan.has(c.name.toLowerCase())).flatMap((c) => c.hotspots) ?? [])];
    set("hotspots", { type: "FeatureCollection", features: hs.map((h) => ({ type: "Feature", properties: { w: h.affinity * h.popularity }, geometry: { type: "Point", coordinates: [h.lon, h.lat] } })) });
    const opt = new Map(cityOptions.map((o) => [o.city.name, o]));
    const maxFan = Math.max(1, ...(pool?.cities.map((c) => c.fanIndex) ?? [1]));
    set("alts", {
      type: "FeatureCollection",
      features: (pool?.cities ?? [])
        .filter((c) => !plan.stops.some((s) => played(s) && s.city.name === c.name))
        .map((c) => {
          const o = opt.get(c.name);
          return { type: "Feature", properties: { name: c.name, fans: Math.round((Math.sqrt(c.fanIndex / maxFan)) * 100), gain: (o?.profit ?? -1) >= 0, label: o ? `${c.name} ${signed(fmt, o.profit)}` : c.name }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } };
        }),
    });
    const chosen = new Set(stops.map((s) => s.venue?.id));
    const sel = plan.stops.find((s) => stopKey(s) === selected);
    const vopt = new Map(venueOptions.map((o) => [o.venue.id, o]));
    const rooms = new Map<string, GeoJSON.Feature>();
    for (const c of pool?.cities ?? [])
      for (const v of c.venues) {
        if (v.lat === undefined || v.lon === undefined || chosen.has(v.id) || rooms.has(v.id)) continue;
        const near = !!sel && sel.city.name === c.name;
        const o = vopt.get(v.id);
        rooms.set(v.id, { type: "Feature", properties: { id: v.id, city: c.name, near, label: o ? `${v.name} ${signed(fmt, o.profit)}` : v.name }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } });
      }
    set("venues", { type: "FeatureCollection", features: [...rooms.values()] });

    markers.current.forEach((m) => m.remove());
    markers.current = plan.stops.map((s, i) => {
      const key = stopKey(s);
      const el = nightMarker(s, i, { selected: key === selected, label: mini ? false : undefined, detail: `${mini ? `${s.city.name}, ` : ""}night ${i + 1}${s.venue ? `, ${s.venue.name}` : ""}` });
      el.tabIndex = -1; // pointer shortcut only: the Nights list is the keyboard path (markers can sit outside the visible map)
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pick.current({ type: "night", key });
      });
      return new maplibre.Marker({ element: el }).setLngLat(at(s)).addTo(map);
    });
  }, [ready, plan, pool, selected, cityOptions, venueOptions]);

  // Focus highlight (feature-state) for the candidate being confirmed.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.removeFeatureState({ source: "alts" });
    map.removeFeatureState({ source: "venues" });
    if (focus?.type === "city") map.setFeatureState({ source: "alts", id: focus.name }, { focus: true });
    if (focus?.type === "venue") map.setFeatureState({ source: "venues", id: focus.id }, { focus: true });
  }, [ready, focus, plan]);

  // Camera: always the whole tour (every night stays on screen; the picked night is the ringed pin).
  // Confirming a swap adds the city it would move to.
  const frame = (whole = false) => {
    const map = mapRef.current;
    const maplibre = lib.current;
    if (!map || !maplibre) return;
    const bounds = new maplibre.LngLatBounds();
    const other = !whole && !mini && focus?.type === "city" ? pool?.cities.find((c) => c.name === focus.name) : undefined;
    const stops = plan.stops.filter(played);
    for (const s of stops.length ? stops : plan.stops) bounds.extend([s.city.lon, s.city.lat]);
    if (other) bounds.extend([other.lon, other.lat]);
    if (bounds.isEmpty()) return;
    const box = map.getContainer().getBoundingClientRect();
    // A hidden or tiny box can't hold the padding (maplibre would leave the world view); the
    // resize observer frames again once it has a size.
    if (box.width < 40 || box.height < 40) return;
    const pad = mini ? 24 : Math.max(24, Math.min(64, Math.round(Math.min(box.width, box.height) / 8)));
    // Layer toggles sit top-left on the full map: a little more room at the top; each night's label
    // sits right of its pin: more room on the right so none runs off the edge.
    map.fitBounds(bounds, { padding: { top: pad + (mini ? 0 : 28), bottom: pad, left: pad, right: pad + (mini ? 0 : 72) }, maxZoom: TOUR_ZOOM, duration: prefersReducedMotion() || !ready ? 0 : 600 });
  };
  // A swapped night is re-keyed right after the edit (same position): that is no new pick, so the
  // whole-tour view after the edit stays.
  const framedPlan = useRef<Plan | undefined>(undefined);
  const framedAt = useRef(-1);
  useEffect(() => {
    if (!ready) return;
    const at = plan.stops.findIndex((s) => stopKey(s) === selected);
    // -2: the edit left the selection pointing at a key that's gone; its re-key comes next.
    const rekeyed = framedPlan.current === plan && (at === framedAt.current || framedAt.current === -2) && focus?.type !== "city";
    framedAt.current = at < 0 && framedPlan.current !== plan ? -2 : at;
    if (framedPlan.current !== plan) {
      framedPlan.current = plan;
      frame(true);
    } else if (!rekeyed) frame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, plan, selected, focus?.type === "city" ? focus.name : undefined]);

  useEffect(() => {
    if (ready && reframe) frame(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reframe]);

  // Keep the canvas matched to its box (sheet / sidebar / viewport changes), so tiles never blank.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !box.current) return;
    let last = { w: 0, h: 0 };
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([e]) => {
      map.resize();
      const { width: w, height: h } = e.contentRect;
      setNarrow(w < 640);
      const big = Math.abs(w - last.w) > 80 || Math.abs(h - last.h) > 80;
      last = { w, h };
      if (big && w > 0 && h > 0) {
        clearTimeout(t);
        t = setTimeout(() => frame(), 60);
      }
    });
    ro.observe(box.current);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    for (const id of ["venues", "venue-clusters", "venue-count", "venues-label"]) map.setLayoutProperty(id, "visibility", vis(layers.venues));
    map.setLayoutProperty("hotspots", "visibility", vis(layers.fans));
    map.setLayoutProperty("alts", "visibility", vis(layers.alternatives));
    // Phone-width map: other cities' labels would run off the edge; their circles stay (tap one for its numbers).
    map.setLayoutProperty("alts-label", "visibility", vis(layers.alternatives && !narrow));
    for (const id of ["route", "route-casing"]) map.setLayoutProperty(id, "visibility", vis(layers.route));
  }, [ready, layers, narrow]);

  const toggles: { key: keyof Layers; label: string; icon: typeof Store }[] = [
    { key: "venues", label: "Rooms", icon: Store },
    { key: "fans", label: "Fans", icon: Flame },
    { key: "alternatives", label: "Other cities", icon: MapPinned },
    { key: "route", label: "Route", icon: RouteIcon },
  ];
  return (
    <div className={cn("relative h-full w-full bg-muted/40", mini && "[&_.maplibregl-ctrl-bottom-right]:hidden")}>
      <div ref={box} className="h-full w-full" />
      {failed && <RouteSketch plan={plan} selected={selected} mini={mini} onPick={(key) => pick.current({ type: "night", key })} />}
      <div className={cn("absolute top-2 left-2 flex flex-wrap gap-1 max-sm:right-2 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[scrollbar-width:none]", (mini || failed) && "hidden")} role="group" aria-label="Map layers">
        {toggles.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={layers[t.key]}
            onClick={() => setLayers((l) => ({ ...l, [t.key]: !l[t.key] }))}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium shadow-sm ring-1 ring-border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              layers[t.key] ? "bg-background text-foreground" : "bg-background/70 text-muted-foreground line-through",
            )}
          >
            <t.icon className="size-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => frame(true)} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-background px-2.5 text-xs font-medium shadow-sm ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LocateFixed className="size-3.5" aria-hidden /> Whole tour
        </button>
      </div>
    </div>
  );
}

// The map without WebGL or tiles: the tour's nights as numbered dots on a plain projection, joined
// in order. Same picks as the real map.
function RouteSketch({ plan, selected, mini, onPick }: { plan: Plan; selected?: string; mini: boolean; onPick: (key: string) => void }) {
  const stops = plan.stops;
  const xs = stops.map((s) => s.city.lon);
  const ys = stops.map((s) => -s.city.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 0.5);
  const at = (s: Plan["stops"][number]) => ({ x: 10 + ((s.city.lon - x0) / span) * 80 + (span - (x1 - x0)) / span * 40, y: 10 + ((-s.city.lat - y0) / span) * 80 + (span - (y1 - y0)) / span * 40 });
  const ps = stops.filter(played);
  const pts = ps.map(at);
  return (
    <div className="absolute inset-0 flex flex-col bg-muted/40">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="min-h-0 flex-1" role="img" aria-label="Sketch of the tour route">
        {/* Route on the fan ramp: each leg in the colour of the night it leaves. */}
        {pts.slice(1).map((p, i) => (
          <line key={i} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y} stroke={`var(--score-${Math.min(4, Math.max(1, Math.floor(ps[i].score / 25) + 1))})`} strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {stops.map((s, i) => {
          const p = at(s);
          const key = stopKey(s);
          return (
            <g key={key} className="cursor-pointer" onClick={() => onPick(key)}>
              <circle cx={p.x} cy={p.y} r={key === selected ? 3.2 : 2.6} className={!played(s) ? "fill-muted" : "fill-foreground"} stroke={key === selected ? "var(--foreground)" : "none"} strokeOpacity={0.3} strokeWidth={1.2} />
              <text x={p.x} y={p.y + 0.9} textAnchor="middle" fontSize={2.6} className="fill-background font-medium">{i + 1}</text>
              {!mini && <text x={p.x} y={p.y + 6.5} textAnchor="middle" fontSize={2.8} className="fill-muted-foreground">{s.city.name}</text>}
            </g>
          );
        })}
      </svg>
      {!mini && <p className="px-3 pb-2 text-center text-xs text-muted-foreground">The full map can't load in this browser. Pick nights here or in the list.</p>}
    </div>
  );
}
