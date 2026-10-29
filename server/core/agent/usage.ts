// Token + cost accounting per process (per run when used from the demo CLI).
// $ per 1M tokens: [input, output, cache read, cache write 5m]
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

const totals = new Map<string, { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number }>();

export function recordUsage(model: string, usage: Usage) {
  const t = totals.get(model) ?? { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  t.calls++;
  t.input += usage.input_tokens;
  t.output += usage.output_tokens;
  t.cacheRead += usage.cache_read_input_tokens ?? 0;
  t.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  totals.set(model, t);
}

export function usageSummary() {
  return [...totals].map(([model, t]) => {
    const [i, o, cr, cw] = PRICES[model] ?? [0, 0, 0, 0];
    const cost = (t.input * i + t.output * o + t.cacheRead * cr + t.cacheWrite * cw) / 1e6;
    return { model, ...t, cost: Math.round(cost * 10000) / 10000 };
  });
}
