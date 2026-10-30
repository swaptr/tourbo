import type { City, CityScore, Leg } from "../shared/types.ts";

const MAX_DRIVE_KM = 500; // per travel day
const FLY_KM = 1200; // beyond this assume a flight: one travel day
const SHOWS_BEFORE_OFF = 4;

export function haversineKm(a: City, b: City) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type RoutedStop = { city: CityScore; date: string };
export type Route = { stops: RoutedStop[]; legs: Leg[]; totalKm: number };

// Nearest-neighbour from the home base (or the top city), then 2-opt on the open path.
export function routeTour(
  picks: CityScore[],
  startDate: string,
  home?: City,
  stayDays = 1, // exhibitions and residencies stay several days per city
): Route {
  if (!picks.length) return { stops: [], legs: [], totalKm: 0 };
  const order = twoOpt(nearestNeighbour(picks, home), home);

  const stops: RoutedStop[] = [];
  const legs: Leg[] = [];
  let day = new Date(`${startDate}T00:00:00Z`);
  order.forEach((city, i) => {
    if (i > 0) {
      const prev = order[i - 1].city;
      const km = haversineKm(prev, city.city);
      legs.push({ from: prev.name, to: city.city.name, km: Math.round(km) });
      day = addDays(day, stayDays > 1 ? stayDays - 1 + travelDays(km) : travelDays(km) + (i % SHOWS_BEFORE_OFF === 0 ? 1 : 0));
    }
    stops.push({ city, date: day.toISOString().slice(0, 10) });
  });
  const totalKm = legs.reduce((sum, leg) => sum + leg.km, 0);
  return { stops, legs, totalKm };
}

function travelDays(km: number) {
  if (km > FLY_KM) return 1;
  return Math.max(1, Math.ceil(km / MAX_DRIVE_KM));
}

function nearestNeighbour(picks: CityScore[], home?: City) {
  const left = [...picks];
  let current = home ?? left[0].city;
  const order: CityScore[] = [];
  while (left.length) {
    let best = 0;
    left.forEach((c, i) => {
      if (haversineKm(current, c.city) < haversineKm(current, left[best].city)) best = i;
    });
    const [next] = left.splice(best, 1);
    order.push(next);
    current = next.city;
  }
  return order;
}

function pathKm(order: CityScore[], home?: City) {
  const cities = home ? [home, ...order.map((c) => c.city)] : order.map((c) => c.city);
  let km = 0;
  for (let i = 1; i < cities.length; i++) km += haversineKm(cities[i - 1], cities[i]);
  return km;
}

function twoOpt(order: CityScore[], home?: City) {
  let best = order;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        if (pathKm(candidate, home) < pathKm(best, home) - 1e-6) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
