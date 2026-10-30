import { countryOf } from "../context/regions.ts";
import { citiesNear } from "../engine/cities.ts";
import { refPrice, REGION_DEFAULTS } from "../engine/economics.ts";
import type { PerformerKind, Region } from "../shared/types.ts";
import { changes, dateRisk, monthlySpend, placeFacts, priceNudge, REGION_ANCHOR, spendHeadroom, tone, youngerCrowd } from "./derive.ts";
import { fetchJson, holidays, usdPer, weather, type FetchJson } from "./live.server.ts";
import { hasCountry, staticFeatures, US_MEDIAN_HOUSEHOLD, usState } from "./snapshot.ts";
import type { DerivedKey, PlaceFeatures, PlaceRef } from "./types.ts";

export * from "./types.ts";
export { REGION_ANCHOR } from "./derive.ts";

export type PlaceInput = { name: string; lat: number; lon: number; region?: Region | string; country?: string; query?: string; admin1?: string };
export type PlaceOptions = {
  kind?: PerformerKind;
  ticket?: number; // in the region's currency; default: the region's reference ticket for this kind
  merch?: number; // per head, same currency
  fanYouth?: number; // AudienceSide.youth from fan data (context/audience.ts), city side preferred
  edge?: { lean: "edgier" | "cleaner" | "neutral" }; // edgeFromTaste() on the city's fan data
  fetch?: FetchJson; // tests inject fixtures
  today?: Date;
};

// Country (ISO2) for a city: given → named in the query → nearest world city within 60 km.
export function resolvePlace(city: PlaceInput): PlaceRef {
  let country = city.country?.length === 2 ? city.country.toUpperCase() : countryOf(city);
  let near: { country?: string; query?: string; km: number } | undefined;
  const nearest = () => (near ??= citiesNear({ lat: city.lat, lon: city.lon, radiusKm: 50 }).nearest as { country?: string; query?: string; km: number });
  if ((!country || !hasCountry(country)) && nearest().country && nearest().km <= 60) country = nearest().country;
  // US state: admin1 / query, else the nearest world city's "City, ST" query (seed cities have none).
  const state = country === "US" ? (usState(city.admin1) ?? usState(city.query) ?? (nearest().km <= 40 ? usState(nearest().query) : undefined)) : undefined;
  return { name: city.name, country, state, lat: city.lat, lon: city.lon, region: city.region };
}

// Place features for one city and (optionally) show dates (YYYY-MM-DD). Static indicators come
// from the committed snapshots; holidays, past weather and FX are live with short timeouts and
// simply go missing offline. `surfaced` lists only the derived features that change a suggestion.
export async function placeFeatures(city: PlaceInput, dates: string[] = [], opts: PlaceOptions = {}): Promise<PlaceFeatures> {
  const place = resolvePlace(city);
  const get = opts.fetch ?? fetchJson;
  const { features, missing } = staticFeatures(place.country, place.state);
  const region = place.region && place.region in REGION_DEFAULTS ? (place.region as Region) : undefined;
  const days = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const currency = region ? REGION_DEFAULTS[region].currency : "USD";
  const [hol, wx, fx] = await Promise.all([
    days.length && place.country ? holidays(place.country, days, place.state, get) : undefined,
    days.length ? weather(place.lat, place.lon, days, get, opts.today) : undefined,
    usdPer(currency, get),
  ]);
  if (hol) features.holidays = hol;
  else if (days.length) missing.push("public holidays");
  if (wx) features.weather = wx;
  else if (days.length) missing.push("seasonal weather");

  // Features chain: the price nudge sets the ticket (unless the act fixed one), headroom is judged
  // at that ticket against the anchor market at the reference ticket.
  const nudge = priceNudge(features, region, place.country);
  const ref = region ? refPrice(region, opts.kind ?? "musician") : undefined;
  const ticket = opts.ticket ?? (ref ? ref * (nudge?.factor ?? 1) : undefined);
  const anchorCode = region ? REGION_ANCHOR[region] : undefined;
  const anchorMonthly = features.householdIncome ? US_MEDIAN_HOUSEHOLD / 12 / 2.5 : anchorCode ? monthlySpend(staticFeatures(anchorCode).features) : undefined;
  const anchor = ref && fx && anchorMonthly ? { monthlyUsd: anchorMonthly, spendUsd: (ref + (opts.merch ?? 0)) * fx } : undefined;
  const derived = {
    priceNudge: nudge,
    youngerCrowd: youngerCrowd(features, opts.fanYouth),
    tone: tone(features, opts.edge),
    dateRisk: dateRisk(features, days),
    spendHeadroom: ticket && fx ? spendHeadroom(features, { ticket, merch: opts.merch, usdPerUnit: fx }, anchor) : undefined,
  };
  for (const k of Object.keys(derived) as DerivedKey[]) if (derived[k] === undefined) delete derived[k];
  const surfacedLines = changes(derived);
  return {
    place,
    features,
    derived,
    surfaced: Object.keys(surfacedLines) as DerivedKey[],
    changes: surfacedLines,
    facts: placeFacts(place.name, features, derived, surfacedLines),
    missing,
  };
}
