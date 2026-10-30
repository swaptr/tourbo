import { useEffect, useRef, useState, type PointerEvent } from "react";

import { num, type PaceShow } from "~/lib/analytics";
import { Key } from "./bars";

// Ticket pace for one show: the plan's curve (grey, context) vs check-ins (cobalt dots + line).
// x = days before the show (left = earlier), one y axis in tickets. Crosshair snaps to the
// nearest day and reads out both series. Width is measured so strokes stay 2 px.
const H = 150;
const PAD = { l: 36, r: 44, t: 10, b: 22 };

export function PaceChart({ show }: { show: PaceShow }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const from = show.curve[0].days;
  const top = niceMax(Math.max(show.expected, ...show.sold.map((s) => s.tickets)));
  const x = (d: number) => PAD.l + ((from - d) / Math.max(1, from)) * (w - PAD.l - PAD.r);
  const y = (t: number) => PAD.t + (1 - t / top) * (H - PAD.t - PAD.b);
  const path = (pts: { days: number; tickets: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.days).toFixed(1)},${y(p.tickets).toFixed(1)}`).join("");
  const ticks = [0, top / 2, top];
  const xTicks = [from, Math.round(from / 2), 0];
  const planAt = (d: number) => show.curve.reduce((a, b) => (Math.abs(b.days - d) < Math.abs(a.days - d) ? b : a)).tickets;
  const last = show.sold.at(-1)!;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const d = Math.round(from - ((px - PAD.l) / (w - PAD.l - PAD.r)) * from);
    setHover(Math.min(from, Math.max(0, d)));
  };
  const soldAt = hover === null ? undefined : show.sold.find((s) => s.days === hover);

  return (
    <div className="relative" data-testid="pace-chart">
      <div className="mb-1 flex items-center gap-3">
        <Key color="var(--viz-0)" label="Plan" shape="line" />
        <Key color="var(--viz-2)" label="Sold" shape="dot" />
      </div>
      {/* Measured box whose width never depends on the svg inside it (no resize loop). */}
      <div ref={box} className="relative w-full" style={{ height: H }}>
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`${show.city}: ${num(last.tickets)} sold ${last.days} days out; plan says ${num(show.expectedNow)} by then and ${num(show.expected)} on the night.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="absolute inset-0 block touch-pan-y overflow-visible"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-muted-foreground text-xs">
              {num(t)}
            </text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text key={d} x={x(d)} y={H - 6} textAnchor={d === from ? "start" : d === 0 ? "end" : "middle"} className="num fill-muted-foreground text-xs">
            {d === 0 ? "show" : `${d}d`}
          </text>
        ))}
        <path d={path(show.curve)} fill="none" stroke="var(--viz-0)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {show.sold.length > 1 && <path d={path(show.sold)} fill="none" stroke="var(--viz-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {show.sold.map((p, i) => (
          <circle key={i} cx={x(p.days)} cy={y(p.tickets)} r={4.5} fill="var(--viz-2)" stroke="var(--card)" strokeWidth={2} />
        ))}
        <text x={w - PAD.r + 4} y={y(show.expected)} dy="0.32em" className="fill-muted-foreground text-xs">
          {num(show.expected)}
        </text>
        <text x={x(last.days) + 8} y={y(last.tickets)} dy="-0.6em" className="fill-foreground text-xs font-medium">
          {num(last.tickets)} sold
        </text>
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted-foreground)" strokeWidth={1} />
        )}
      </svg>
      </div>
      {hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-6 z-20 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md ring-1 ring-foreground/10"
          style={{ left: Math.min(Math.max(x(hover), 64), w - 64) }}
        >
          <div className="font-semibold">{hover === 0 ? "Show night" : `${hover} days before`}</div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: "var(--viz-0)" }} />
            <span className="font-medium">{num(planAt(hover))}</span> <span className="text-muted-foreground">plan</span>
          </div>
          {soldAt && (
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ background: "var(--viz-2)" }} />
              <span className="font-medium">{num(soldAt.tickets)}</span> <span className="text-muted-foreground">sold</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function niceMax(n: number) {
  if (n <= 10) return 10;
  const p = 10 ** Math.floor(Math.log10(n));
  const m = [1, 2, 2.5, 5, 10].find((k) => k * p >= n)!;
  return m * p;
}
