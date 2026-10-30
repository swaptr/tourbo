// An idea's "why?" in plain words (the engine's sentence keeps the raw terms for assistants):
// "#3 of the TV shows Chicago over-indexes on, vs #9 on average in the other cities (fan data,
// affinity 0.8, local score 0.72)." → "#3 of the TV shows Chicago likes more than most places,
// vs #9 on average in the other cities." + "Fan data · local strength 72 of 100".
export function plainWhy(why: string): { line: string; strength?: number } {
  const m = why.match(/^(.*?)\s*\(fan data(?:, affinity [\d.]+)?(?:, local (?:lift|score) ([\d.]+))?\)\.?\s*$/);
  const body = (m?.[1] ?? why).replace(/ over-indexes on/g, " likes more than most places").replace(/[.\s]+$/, "");
  const v = m?.[2] ? Number(m[2]) : NaN;
  return { line: `${body}.`, strength: Number.isFinite(v) ? Math.round(Math.min(1, v) * 100) : undefined };
}
