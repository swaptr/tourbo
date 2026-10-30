import { regionPolicy } from "../context/regions.ts";
import countriesRaw from "./data/countries.json" with { type: "json" };
import fxRaw from "./data/fx.json" with { type: "json" };
import statesRaw from "./data/us-states.json" with { type: "json" };
import vdemRaw from "./data/vdem.json" with { type: "json" };
import type { Feature, RawFeatures, Scope } from "./types.ts";

// Slow-changing indicators from the committed snapshots (scripts/places-snapshot.ts). Synchronous.

type Pair = [number, number]; // [value, year]
type CountryRow = Partial<Record<"gdpPppPc" | "gdpUsdPc" | "inflation" | "over65" | "tertiary" | "medianAge", Pair>>;
const COUNTRIES = (countriesRaw as unknown as { countries: Record<string, CountryRow> }).countries;
const VDEM = (vdemRaw as unknown as { freedomOfExpression: Record<string, Pair> }).freedomOfExpression;
type StateRow = { name: string; medianHouseholdIncome?: number; margin2024: number };
const STATES = statesRaw as { usMedianHouseholdIncome: number; incomeYear: number; electionYear: number; states: Record<string, StateRow> };
export const FX_SNAPSHOT = fxRaw as { date: string; rates: Record<string, number> };

export const SOURCE = {
  wb: "World Bank WDI",
  wpp: "UN World Population Prospects 2024",
  vdem: "V-Dem v16",
  saipe: "US Census SAIPE 2024",
  medsl: "MIT Election Lab",
  uscirf: "USCIRF 2023",
  regions: "Tourbo region notes",
  nager: "Nager.Date",
  meteo: "Open-Meteo",
  ecb: "ECB via Frankfurter",
} as const;

// USCIRF 2023 Blasphemy Legislation Factsheet: the five countries where blasphemy can carry the death penalty.
const BLASPHEMY_DEATH = new Set(["IR", "PK", "SA", "MR", "BN"]);

const f = <T>(value: T, unit: string, source: string, year: number, scope: Scope, confidence: Feature["confidence"] = "high"): Feature<T> => ({ value, unit, source, year, confidence, scope });
const r2 = (n: number) => Math.round(n * 100) / 100;

const STATE_BY_NAME = new Map(Object.entries(STATES.states).map(([code, s]) => [s.name.toLowerCase(), code]));
// "TX", "Texas" or "Richmond, Virginia" → "TX".
export function usState(text?: string): string | undefined {
  if (!text) return undefined;
  for (const part of text.split(",").map((s) => s.trim()).reverse()) {
    if (/^[A-Z]{2}$/.test(part) && STATES.states[part]) return part;
    const code = STATE_BY_NAME.get(part.toLowerCase());
    if (code) return code;
  }
  return undefined;
}

export const hasCountry = (code: string) => !!COUNTRIES[code.toUpperCase()];
export const US_MEDIAN_HOUSEHOLD = STATES.usMedianHouseholdIncome;
export const gdpUsd = (code: string) => COUNTRIES[code.toUpperCase()]?.gdpUsdPc?.[0];

export function staticFeatures(country: string | undefined, state?: string): { features: RawFeatures; missing: string[] } {
  const features: RawFeatures = {};
  const missing: string[] = [];
  const cc = country?.toUpperCase();
  const row = cc ? COUNTRIES[cc] : undefined;
  if (!row) missing.push("country indicators");
  if (row?.gdpPppPc) features.gdpPppPc = f(row.gdpPppPc[0], "international $ per person", SOURCE.wb, row.gdpPppPc[1], "country");
  if (row?.gdpUsdPc) features.gdpUsdPc = f(row.gdpUsdPc[0], "US$ per person", SOURCE.wb, row.gdpUsdPc[1], "country");
  // Price level: nominal ÷ PPP GDP per person = local prices relative to US prices.
  if (row?.gdpUsdPc && row.gdpPppPc) features.priceLevel = f(r2(row.gdpUsdPc[0] / row.gdpPppPc[0]), "ratio to US prices", SOURCE.wb, row.gdpUsdPc[1], "country", "medium");
  if (row?.inflation) features.inflation = f(row.inflation[0], "% a year", SOURCE.wb, row.inflation[1], "country");
  if (row?.medianAge) features.medianAge = f(row.medianAge[0], "years", SOURCE.wpp, row.medianAge[1], "country");
  if (row?.over65) features.over65 = f(row.over65[0], "% of people", SOURCE.wb, row.over65[1], "country");
  if (row?.tertiary) features.tertiary = f(row.tertiary[0], "% gross enrolment", SOURCE.wb, row.tertiary[1], "country", "medium");
  const vd = cc ? VDEM[cc] : undefined;
  if (vd) features.freeExpression = f(vd[0], "index 0–1", SOURCE.vdem, vd[1], "country");
  else if (cc) missing.push("free expression index");
  const laws = (regionPolicy(cc)?.notes ?? []).filter((n) => n.kind === "law" && n.avoid.includes("religion"));
  if (laws.length) features.religiousLaw = f(laws.map((n) => n.source.title), "law notes", SOURCE.regions, 2026, "country", "medium");
  if (cc && BLASPHEMY_DEATH.has(cc)) features.blasphemyDeathPenalty = f(true, "yes/no", SOURCE.uscirf, 2023, "country");
  if (cc === "US" && state) {
    const s = STATES.states[state];
    if (s?.medianHouseholdIncome) {
      features.householdIncome = f(s.medianHouseholdIncome, "US$ median household", SOURCE.saipe, STATES.incomeYear, "region");
      features.incomeVsNation = f(r2(s.medianHouseholdIncome / STATES.usMedianHouseholdIncome), "ratio to US median", SOURCE.saipe, STATES.incomeYear, "region");
    }
    if (s) features.electionMargin = f(s.margin2024, "points (D − R)", SOURCE.medsl, STATES.electionYear, "region");
  } else if (cc === "US") missing.push("state income and vote");
  return { features, missing };
}
