import { City, type Region } from "../shared/types.ts";
import raw from "./data/cities.json" with { type: "json" };

const CITIES = City.array().parse(raw);

export function seedCities(region: Region): City[] {
  return CITIES.filter((city) => city.region === region);
}
