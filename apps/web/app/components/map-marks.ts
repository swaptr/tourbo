import type { ExpressionSpecification, Map as MapLike } from "maplibre-gl";

import type { CityPlan } from "@tourbo/core/shared/types.ts";
import { tokenColor } from "~/lib/css-color";
import { cn } from "~/lib/utils";

// Shared marks for every tour map (Plan workspace, Numbers, tour map): numbered night markers ringed
// in the fan ramp, and the route drawn on that ramp. Client-only (DOM + computed theme tokens).

const played = (s: CityPlan) => s.money?.verdict !== "skip";
const RING = ["ring-score-1", "ring-score-2", "ring-score-3", "ring-score-4"] as const;
const tier = (score: number) => Math.min(3, Math.max(0, Math.floor(score / 25)));

// A night: ink circle with its number, ring = that city's fan strength; "your pick" is outlined, a
// dropped night is muted and struck. Its own city label sits beside it (the pin covers the map's).
// Its accessible name starts with the visible text ("1 Chicago …", WCAG 2.5.3), then `detail`.
export function nightMarker(s: CityPlan, i: number, opts: { selected?: boolean; label?: string | false; labelClass?: string; detail?: string } = {}) {
  const el = document.createElement("button");
  el.type = "button";
  // No CSS transform/transition on the element: MapLibre positions markers with transform.
  el.className = cn(
    "relative flex cursor-pointer items-center justify-center rounded-full text-xs font-semibold shadow ring-[3px]",
    played(s) ? RING[tier(s.score)] : "ring-background",
    opts.selected ? "size-9 text-sm outline-2 outline-offset-2 outline-foreground" : "size-7",
    !played(s) ? "bg-muted text-muted-foreground line-through" : s.yours ? "bg-background text-foreground" : "bg-foreground text-background",
  );
  el.append(String(i + 1));
  if (opts.label !== false) {
    const label = document.createElement("span");
    label.className = cn("pointer-events-none absolute top-1/2 left-full ml-1.5 -translate-y-1/2 rounded bg-background/85 px-1 text-xs font-medium whitespace-nowrap text-foreground no-underline", opts.labelClass);
    label.textContent = ` ${opts.label ?? s.city.name.split(",")[0]}`;
    el.append(label);
  }
  const shown = (el.textContent ?? "").trim();
  el.setAttribute("aria-label", opts.detail ? `${shown}${opts.label === false ? " " : ", "}${opts.detail}` : shown);
  return el;
}

// Route on the fan ramp: each leg blends from one night's fan colour to the next, over a faint ink
// casing so the light end of the ramp still reads on the paper basemap. The source needs
// lineMetrics: true (line-gradient requirement).
const merc = ([lon, lat]: [number, number]) => [lon / 360, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)];

export function rampGradient(points: [number, number][], scores: number[]): ExpressionSpecification {
  const colors = scores.map((sc) => tokenColor(`score-${tier(sc) + 1}`));
  const flat = (c?: string): ExpressionSpecification => ["to-color", c ?? tokenColor("score-2")];
  if (points.length < 2) return flat(colors[0]);
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = merc(points[i - 1]);
    const [bx, by] = merc(points[i]);
    along.push(along[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = along.at(-1) || 1;
  const stops: (number | string)[] = [];
  let last = -1;
  along.forEach((d, i) => {
    const t = Math.min(1, d / total);
    if (t <= last) return; // line-progress stops must rise strictly
    stops.push(t, colors[i]);
    last = t;
  });
  if (stops.length < 4) return flat(colors[0]);
  return ["interpolate", ["linear"], ["line-progress"], ...stops] as ExpressionSpecification;
}

export function addRampRoute(map: MapLike, source: string, id = "route") {
  map.addLayer({ id: `${id}-casing`, type: "line", source, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": tokenColor("foreground", 0.28), "line-width": 6 } });
  map.addLayer({ id, type: "line", source, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": tokenColor("score-2"), "line-width": 3.5 } });
}

export function paintRampRoute(map: MapLike, points: [number, number][], scores: number[], id = "route") {
  map.setPaintProperty(id, "line-gradient", rampGradient(points, scores));
  map.setPaintProperty(`${id}-casing`, "line-color", tokenColor("foreground", 0.28));
}
