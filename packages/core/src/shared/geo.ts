// Great-circle distance; shared by server code and the browser (area picker).
const toRad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
