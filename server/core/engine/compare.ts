import type { Baseline, Plan, TraceEvent } from "../shared/types.ts";

export type CompareStop = {
  city: string;
  venue?: string;
  opener?: string;
  note?: string;
  cells: number | null; // artist heatmap cells in this city; null = not among scored cities
  score: number | null; // 0–100 city score from the same run
  onlyHere: boolean;
};

export type Comparison = {
  qloo: CompareStop[];
  baseline: CompareStop[];
  shared: number;
  qlooCells: number;
  baselineCells: number;
  qlooScore: number | null; // mean city score; unscored cities count as 0
  baselineScore: number | null;
};

const norm = (name: string) =>
  name
    .toLowerCase()
    .split(",")[0]
    .replace(/\b(city|metro|greater)\b/g, "")
    .replace(/[^a-z]/g, "");

const same = (a: string, b: string) => {
  const [x, y] = [norm(a), norm(b)];
  return x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)));
};

// Cells and scores come from the run's own trace, so the comparison costs no extra Qloo calls.
export function cityMetrics(events: TraceEvent[]) {
  const cells = new Map<string, number>();
  const scores = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "qloo_call" && typeof e.data?.city === "string" && typeof e.data.cells === "number") {
      cells.set(e.data.city, e.data.cells);
    }
    if (e.data?.scores && typeof e.data.scores === "object") {
      for (const [city, score] of Object.entries(e.data.scores)) scores.set(city, Number(score));
    }
  }
  return { cells, scores };
}

export function compareTours(
  plan: Plan,
  baseline: Baseline,
  { cells, scores }: ReturnType<typeof cityMetrics>,
): Comparison {
  const lookup = (map: Map<string, number>, city: string) => [...map].find(([name]) => same(name, city))?.[1] ?? null;
  const cellsFor = (city: string) => lookup(cells, city);
  const scoreFor = (city: string) => (scores.size ? (lookup(scores, city) ?? 0) : null);
  const qloo = plan.stops.map((s) => ({
    city: s.city.name,
    venue: s.venue?.name,
    opener: s.opener?.name,
    note: s.thinData ? "thin data" : undefined,
    cells: cellsFor(s.city.name),
    score: s.score,
    onlyHere: !baseline.stops.some((b) => same(b.city, s.city.name)),
  }));
  const base = baseline.stops.map((b) => ({
    city: b.city,
    venue: b.venue,
    opener: b.opener ?? undefined,
    note: b.why,
    cells: cellsFor(b.city),
    score: scoreFor(b.city),
    onlyHere: !plan.stops.some((s) => same(b.city, s.city.name)),
  }));
  const sum = (stops: CompareStop[]) => stops.reduce((n, s) => n + (s.cells ?? 0), 0);
  const mean = (stops: CompareStop[]) =>
    scores.size && stops.length ? Math.round(stops.reduce((n, s) => n + (s.score ?? 0), 0) / stops.length) : null;
  return {
    qloo,
    baseline: base,
    shared: qloo.filter((s) => !s.onlyHere).length,
    qlooCells: sum(qloo),
    baselineCells: sum(base),
    qlooScore: mean(qloo),
    baselineScore: mean(base),
  };
}
