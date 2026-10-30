import { FX_SNAPSHOT, SOURCE } from "./snapshot.ts";
import type { Feature, Holiday, Weather } from "./types.ts";

// Live, date-dependent features: public holidays (Nager.Date), past weather for the same calendar
// window (Open-Meteo archive, ERA5), FX (ECB via Frankfurter). Every call has a short timeout and
// returns undefined on any failure; callers list it under `missing`. No cache (CLAUDE.md rule).

export type FetchJson = (url: string) => Promise<unknown>;
const TIMEOUT_MS = 4000;
export const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function holidays(country: string, dates: string[], state: string | undefined, get: FetchJson = fetchJson): Promise<Feature<Holiday[]> | undefined> {
  const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
  try {
    const lists = await Promise.all(years.map((y) => get(`https://date.nager.at/api/v3/PublicHolidays/${y}/${country.toUpperCase()}`) as Promise<{ date: string; name: string; global: boolean; counties: string[] | null; types?: string[] }[]>));
    const sub = state ? `${country.toUpperCase()}-${state}` : undefined;
    const value = lists
      .flat()
      .filter((h) => h.global || (sub && h.counties?.includes(sub)))
      .filter((h) => !h.types || h.types.includes("Public"))
      .map((h) => ({ date: h.date, name: h.name, national: h.global }));
    return { value, unit: "public holidays", source: SOURCE.nager, year: years[0]!, confidence: "high", scope: sub ? "region" : "country" };
  } catch {
    return undefined;
  }
}

// Same calendar window (first → last show date, ≤ 14 days) in each of the past 3 complete years.
export function weatherWindows(dates: string[], today = new Date()): { start: string; end: string; year: number }[] {
  const sorted = [...dates].sort();
  const start = new Date(sorted[0]!);
  const end = new Date(Math.min(Date.parse(sorted.at(-1)!), start.getTime() + 13 * 86_400_000));
  const cutoff = today.getTime() - 7 * 86_400_000; // archive lags a few days
  const out: { start: string; end: string; year: number }[] = [];
  for (let back = 1; out.length < 3 && back <= 6; back++) {
    const s = new Date(start);
    const e = new Date(end);
    s.setUTCFullYear(start.getUTCFullYear() - back);
    e.setUTCFullYear(end.getUTCFullYear() - back);
    if (e.getTime() < cutoff) out.push({ start: isoDay(s), end: isoDay(e), year: s.getUTCFullYear() });
  }
  return out;
}

export async function weather(lat: number, lon: number, dates: string[], get: FetchJson = fetchJson, today = new Date()): Promise<Feature<Weather> | undefined> {
  const windows = weatherWindows(dates, today);
  if (!windows.length) return undefined;
  const results = await Promise.allSettled(
    windows.map((w) => get(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start_date=${w.start}&end_date=${w.end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`) as Promise<{ daily?: { temperature_2m_max?: (number | null)[]; temperature_2m_min?: (number | null)[]; precipitation_sum?: (number | null)[] } }>),
  );
  const max: number[] = [], min: number[] = [], rain: number[] = [], years: number[] = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled" || !r.value.daily) return;
    const nums = (xs?: (number | null)[]) => (xs ?? []).filter((x): x is number => typeof x === "number");
    max.push(...nums(r.value.daily.temperature_2m_max));
    min.push(...nums(r.value.daily.temperature_2m_min));
    rain.push(...nums(r.value.daily.precipitation_sum));
    years.push(windows[i]!.year);
  });
  if (!max.length) return undefined;
  const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1)) * 10) / 10;
  return { value: { meanMaxC: mean(max), meanMinC: mean(min), rainMmPerDay: mean(rain), years }, unit: "°C / mm a day, same dates in past years", source: SOURCE.meteo, year: years[0]!, confidence: years.length >= 2 ? "medium" : "low", scope: "city" };
}

// US$ per unit of `currency` (ECB reference rates; the committed snapshot when offline).
export async function usdPer(currency: string, get: FetchJson = fetchJson): Promise<number | undefined> {
  if (currency === "USD") return 1;
  try {
    const list = (await get(`https://api.frankfurter.dev/v2/rates?base=USD&providers=ecb&quotes=${currency}`)) as { rate: number }[];
    if (list[0]?.rate) return 1 / list[0].rate;
  } catch {}
  const snap = FX_SNAPSHOT.rates[currency];
  return snap ? 1 / snap : undefined;
}
