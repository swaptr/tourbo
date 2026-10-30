// Usage: npm run examples:prewarm [-- <act-filter>] [--missing] [--fan-only] [--rebuild | --recompute]
// --missing skips acts already stored; --fan-only rebuilds only the worldwide fan density;
// --only=<feature> rebuilds just that decision type; --rebuild redoes every example from the
// cache (stored density and AI-written lines kept, so ~0 spend); --recompute is --rebuild with the
// network off (no fan-data or AI calls): an act any of whose calls misses the cache keeps its stored
// rows; --dry-run estimates Qloo calls first.
// Every run ends with a usage line (Qloo calls, cache hits, AI tokens and $).
// Builds the home-page examples (≥ 50 acts people know, six continents) through the Tourbo
// engine and stores them in Postgres (home_examples). Each example leads with one decision
// (route + money, venue fit, counter-offer, ticket pace, show-prep lines, rehearsal reactions).
// Needs QLOO_API_KEY; ANTHROPIC_API_KEY for the prep and rehearsal lines (deterministic
// fallbacks otherwise). Nothing is written to the repo. Re-runs hit the Qloo cache.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { closeDb, db } from "@tourbo/core/db/client.server.ts";
import { briefNames, cityBrief, normalizeRef } from "@tourbo/core/engine/brief.ts";
import { citiesNear, topCities, type WorldCity } from "@tourbo/core/engine/cities.ts";
import { defaultCapacity, estimateDemand, legCosts, median, optimise } from "@tourbo/core/engine/economics.ts";
import { assessOffer } from "@tourbo/core/engine/negotiate.ts";
import { ticketPace } from "@tourbo/core/engine/pace.ts";
import { groundReactions, personas } from "@tourbo/core/engine/rehearsal.ts";
import { resolveArtist, resolvePerformer, signalIds } from "@tourbo/core/engine/resolve.ts";
import { routeTour } from "@tourbo/core/engine/routing.ts";
import { scoreCities } from "@tourbo/core/engine/score.ts";
import { findVenues, roomType } from "@tourbo/core/engine/venues.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import type { Compare, CompareCity, Continent, ScoreWhy, ExampleFeature, FanDensity, FanPoint, HomeExample } from "@tourbo/core/examples/types.ts";
import { exampleProblem, reconcileExample } from "@tourbo/core/examples/check.ts";
import { distanceKm } from "@tourbo/core/shared/geo.ts";
import { heatmap } from "@tourbo/core/qloo/api.server.ts";
import { cacheKey, readCache } from "@tourbo/core/qloo/cache.server.ts";
import { qlooCacheHits, qlooCallCount } from "@tourbo/core/qloo/client.server.ts";
import { getEnv } from "@tourbo/core/env.server.ts";
import { cacheSummary, recordUsage, usageSummary } from "../server/agent/usage.ts";
import { locationQuery, type CityScore, type PerformerKind } from "@tourbo/core/shared/types.ts";
import { WORKER_MODEL } from "../server/agent/models.ts";

type Seed = { act: string; kind?: PerformerKind; peers?: string[]; city: string; country: string; continent: Continent; lat: number; lon: number; km?: number };

// Acts people know + a few mid-size ones; comedians known but not superstars. Coordinates are
// the home city's; each act is dropped if Qloo doesn't resolve it by exact name.
const SEEDS: Seed[] = [
  // Oceania
  { act: "AC/DC", city: "Sydney", country: "AU", continent: "oceania", lat: -33.87, lon: 151.21, km: 3600 },
  { act: "Tame Impala", city: "Perth", country: "AU", continent: "oceania", lat: -31.95, lon: 115.86, km: 3000 },
  { act: "RÜFÜS DU SOL", city: "Melbourne", country: "AU", continent: "oceania", lat: -37.81, lon: 144.96, km: 1200 },
  { act: "Lorde", city: "Auckland", country: "NZ", continent: "oceania", lat: -36.85, lon: 174.76, km: 2500 },
  { act: "Kylie Minogue", city: "Melbourne", country: "AU", continent: "oceania", lat: -37.81, lon: 144.96, km: 1500 },
  { act: "Sia", city: "Adelaide", country: "AU", continent: "oceania", lat: -34.93, lon: 138.6, km: 1500 },
  { act: "Tim Minchin", kind: "comedian", city: "Sydney", country: "AU", continent: "oceania", lat: -33.87, lon: 151.21, km: 1200 },
  // Asia
  { act: "BTS", city: "Seoul", country: "KR", continent: "asia", lat: 37.57, lon: 126.98, km: 1500 },
  { act: "BLACKPINK", city: "Bangkok", country: "TH", continent: "asia", lat: 13.76, lon: 100.5, km: 1500 },
  { act: "Ronny Chieng", kind: "comedian", city: "Kuala Lumpur", country: "MY", continent: "asia", lat: 3.14, lon: 101.69, km: 1500 },
  { act: "Joji", city: "Tokyo", country: "JP", continent: "asia", lat: 35.68, lon: 139.69, km: 900 },
  { act: "Jay Chou", city: "Taipei", country: "TW", continent: "asia", lat: 25.03, lon: 121.57, km: 1500 },
  { act: "Kenshi Yonezu", city: "Osaka", country: "JP", continent: "asia", lat: 34.69, lon: 135.5, km: 900 },
  { act: "A.R. Rahman", city: "Chennai", country: "IN", continent: "asia", lat: 13.08, lon: 80.27, km: 1200 },
  { act: "Diljit Dosanjh", city: "New Delhi", country: "IN", continent: "asia", lat: 28.61, lon: 77.21, km: 900 },
  { act: "Vir Das", kind: "comedian", city: "Mumbai", country: "IN", continent: "asia", lat: 19.08, lon: 72.88, km: 900 },
  { act: "Arijit Singh", city: "Kolkata", country: "IN", continent: "asia", lat: 22.57, lon: 88.36, km: 1200 },
  { act: "Prateek Kuhad", city: "Bengaluru", country: "IN", continent: "asia", lat: 12.97, lon: 77.59, km: 900 },
  // Europe
  { act: "Jimmy Carr", kind: "comedian", city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 500 },
  { act: "ABBA", city: "Stockholm", country: "SE", continent: "europe", lat: 59.33, lon: 18.07, km: 900 },
  { act: "Arctic Monkeys", city: "Manchester", country: "GB", continent: "europe", lat: 53.48, lon: -2.24, km: 500 },
  { act: "Daft Punk", city: "Paris", country: "FR", continent: "europe", lat: 48.86, lon: 2.35, km: 700 },
  { act: "Rosalía", city: "Barcelona", country: "ES", continent: "europe", lat: 41.39, lon: 2.17, km: 800 },
  { act: "Sigur Rós", city: "Reykjavík", country: "IS", continent: "europe", lat: 64.15, lon: -21.94, km: 2200 },
  { act: "Gad Elmaleh", kind: "comedian", city: "Paris", country: "FR", continent: "europe", lat: 48.86, lon: 2.35, km: 700 },
  { act: "Dua Lipa", city: "Milan", country: "IT", continent: "europe", lat: 45.46, lon: 9.19, km: 700 },
  { act: "Ed Sheeran", city: "Dublin", country: "IE", continent: "europe", lat: 53.35, lon: -6.26, km: 700 },
  { act: "Queen", city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 600 },
  { act: "Robyn", city: "Copenhagen", country: "DK", continent: "europe", lat: 55.68, lon: 12.57, km: 800 },
  // North America (incl. Mexico and the Caribbean)
  { act: "Metallica", city: "San Francisco", country: "US", continent: "north_america", lat: 37.77, lon: -122.42, km: 900 },
  { act: "Red Hot Chili Peppers", city: "Los Angeles", country: "US", continent: "north_america", lat: 34.05, lon: -118.24, km: 900 },
  { act: "Billie Eilish", city: "Seattle", country: "US", continent: "north_america", lat: 47.61, lon: -122.33, km: 900 },
  { act: "Nate Bargatze", kind: "comedian", city: "Nashville", country: "US", continent: "north_america", lat: 36.16, lon: -86.78, km: 700 },
  { act: "Taylor Tomlinson", kind: "comedian", city: "San Diego", country: "US", continent: "north_america", lat: 32.72, lon: -117.16, km: 900 },
  { act: "Hasan Minhaj", kind: "comedian", city: "New York", country: "US", continent: "north_america", lat: 40.71, lon: -74.01, km: 600 },
  { act: "Ali Wong", kind: "comedian", city: "Vancouver", country: "CA", continent: "north_america", lat: 49.28, lon: -123.12, km: 900 },
  { act: "Khruangbin", city: "Houston", country: "US", continent: "north_america", lat: 29.76, lon: -95.37, km: 900 },
  { act: "Japanese Breakfast", city: "Philadelphia", country: "US", continent: "north_america", lat: 39.95, lon: -75.17, km: 600 },
  { act: "Coldplay", city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 600 },
  { act: "Natalia Lafourcade", city: "Mexico City", country: "MX", continent: "north_america", lat: 19.43, lon: -99.13, km: 900 },
  { act: "Bad Bunny", city: "San Juan", country: "PR", continent: "north_america", lat: 18.47, lon: -66.11, km: 2500 },
  // South America
  { act: "Shakira", city: "Bogotá", country: "CO", continent: "south_america", lat: 4.71, lon: -74.07, km: 900 },
  { act: "Karol G", city: "Medellín", country: "CO", continent: "south_america", lat: 6.24, lon: -75.58, km: 900 },
  { act: "Bizarrap", city: "Buenos Aires", country: "AR", continent: "south_america", lat: -34.6, lon: -58.38, km: 1200 },
  { act: "Anitta", city: "Rio de Janeiro", country: "BR", continent: "south_america", lat: -22.91, lon: -43.17, km: 1200 },
  { act: "Mon Laferte", city: "Santiago", country: "CL", continent: "south_america", lat: -33.45, lon: -70.67, km: 1500 },
  { act: "Soda Stereo", city: "Buenos Aires", country: "AR", continent: "south_america", lat: -34.6, lon: -58.38, km: 1500 },
  // Africa
  { act: "Burna Boy", city: "Lagos", country: "NG", continent: "africa", lat: 6.52, lon: 3.38, km: 1200 },
  { act: "Tems", city: "Accra", country: "GH", continent: "africa", lat: 5.6, lon: -0.19, km: 1200 },
  { act: "Trevor Noah", kind: "comedian", city: "Johannesburg", country: "ZA", continent: "africa", lat: -26.2, lon: 28.05, km: 1200 },
  { act: "Sauti Sol", city: "Nairobi", country: "KE", continent: "africa", lat: -1.29, lon: 36.82, km: 900 },
  { act: "Tyla", city: "Johannesburg", country: "ZA", continent: "africa", lat: -26.2, lon: 28.05, km: 1500 },
  { act: "Amr Diab", city: "Cairo", country: "EG", continent: "africa", lat: 30.04, lon: 31.24, km: 1500 },
  { act: "Wizkid", city: "Lagos", country: "NG", continent: "africa", lat: 6.52, lon: 3.38, km: 1500 },
  { act: "Muse", city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 600 },
  { act: "Taylor Swift", city: "Nashville", country: "US", continent: "north_america", lat: 36.16, lon: -86.78, km: 900 },
  // DJs
  { act: "David Guetta", kind: "dj", city: "Paris", country: "FR", continent: "europe", lat: 48.86, lon: 2.35, km: 700 },
  { act: "Peggy Gou", kind: "dj", city: "Seoul", country: "KR", continent: "asia", lat: 37.57, lon: 126.98, km: 1500 },
  { act: "Black Coffee", kind: "dj", city: "Johannesburg", country: "ZA", continent: "africa", lat: -26.2, lon: 28.05, km: 1500 },
  // Visual artists
  { act: "Banksy", kind: "visual_artist", city: "Bristol", country: "GB", continent: "europe", lat: 51.45, lon: -2.59, km: 600 },
  { act: "Yayoi Kusama", kind: "visual_artist", city: "Tokyo", country: "JP", continent: "asia", lat: 35.68, lon: 139.69, km: 900 },
  { act: "KAWS", kind: "visual_artist", city: "New York", country: "US", continent: "north_america", lat: 40.71, lon: -74.01, km: 600 },
  // Authors
  { act: "Haruki Murakami", kind: "author", city: "Tokyo", country: "JP", continent: "asia", lat: 35.68, lon: 139.69, km: 900 },
  { act: "Chimamanda Ngozi Adichie", kind: "author", city: "Lagos", country: "NG", continent: "africa", lat: 6.52, lon: 3.38, km: 1500 },
  { act: "Brandon Sanderson", kind: "author", city: "Salt Lake City", country: "US", continent: "north_america", lat: 40.76, lon: -111.89, km: 1200 },
  // Podcasts
  { act: "SmartLess", kind: "podcaster", city: "Los Angeles", country: "US", continent: "north_america", lat: 34.05, lon: -118.24, km: 900 },
  { act: "My Favorite Murder", kind: "podcaster", city: "Los Angeles", country: "US", continent: "north_america", lat: 34.05, lon: -118.24, km: 1200 },
  { act: "The Rest Is History", kind: "podcaster", city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 600 },
  // Poets
  { act: "Rupi Kaur", kind: "poet", city: "Toronto", country: "CA", continent: "north_america", lat: 43.65, lon: -79.38, km: 800 },
  { act: "Amanda Gorman", kind: "poet", city: "Los Angeles", country: "US", continent: "north_america", lat: 34.05, lon: -118.24, km: 900 },
  { act: "Kae Tempest", kind: "poet", city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 600 },
  // Dance companies
  { act: "Alvin Ailey American Dance Theater", kind: "dancer", city: "New York", country: "US", continent: "north_america", lat: 40.71, lon: -74.01, km: 600 },
  { act: "Batsheva Dance Company", kind: "dancer", peers: ["Alvin Ailey American Dance Theater", "Cirque du Soleil"], city: "Tel Aviv", country: "IL", continent: "asia", lat: 32.09, lon: 34.78, km: 1500 },
  { act: "Akram Khan Company", kind: "dancer", peers: ["Alvin Ailey American Dance Theater", "Cirque du Soleil"], city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 600 },
  { act: "Tanztheater Wuppertal Pina Bausch", kind: "dancer", peers: ["Alvin Ailey American Dance Theater", "Cirque du Soleil"], city: "Wuppertal", country: "DE", continent: "europe", lat: 51.26, lon: 7.15, km: 700 },
  // More acts to fill the whole globe (Gulf, China, Russia, Central/SE/South Asia, Africa, Latin America, Canada)
  { act: "Hussain Al Jassmi", city: "Dubai", country: "AE", continent: "asia", lat: 25.2, lon: 55.27, km: 1500 },
  { act: "Mohammed Abdu", city: "Riyadh", country: "SA", continent: "asia", lat: 24.71, lon: 46.68, km: 1500 },
  { act: "Nancy Ajram", city: "Beirut", country: "LB", continent: "asia", lat: 33.89, lon: 35.5, km: 1500 },
  { act: "Fairuz", city: "Beirut", country: "LB", continent: "asia", lat: 33.89, lon: 35.5, km: 1500 },
  { act: "Tarkan", city: "Istanbul", country: "TR", continent: "asia", lat: 41.01, lon: 28.98, km: 1200 },
  { act: "Cem Yılmaz", kind: "comedian", city: "Istanbul", country: "TR", continent: "asia", lat: 41.01, lon: 28.98, km: 1200 },
  { act: "Googoosh", city: "Tehran", country: "IR", continent: "asia", lat: 35.69, lon: 51.39, km: 1500 },
  { act: "Dimash Kudaibergen", city: "Almaty", country: "KZ", continent: "asia", lat: 43.24, lon: 76.89, km: 2000 },
  { act: "The HU", city: "Ulaanbaatar", country: "MN", continent: "asia", lat: 47.89, lon: 106.91, km: 2500 },
  { act: "G.E.M.", city: "Hong Kong", country: "HK", continent: "asia", lat: 22.32, lon: 114.17, km: 1200 },
  { act: "Faye Wong", city: "Beijing", country: "CN", continent: "asia", lat: 39.9, lon: 116.41, km: 1200 },
  { act: "Joker Xue", city: "Shanghai", country: "CN", continent: "asia", lat: 31.23, lon: 121.47, km: 1200 },
  { act: "Ai Weiwei", kind: "visual_artist", city: "Beijing", country: "CN", continent: "asia", lat: 39.9, lon: 116.41, km: 1200 },
  { act: "JJ Lin", city: "Singapore", country: "SG", continent: "asia", lat: 1.35, lon: 103.82, km: 1500 },
  { act: "Little Big", city: "Saint Petersburg", country: "RU", continent: "europe", lat: 59.93, lon: 30.36, km: 1200 },
  { act: "Zemfira", city: "Moscow", country: "RU", continent: "europe", lat: 55.76, lon: 37.62, km: 1200 },
  { act: "Okean Elzy", city: "Kyiv", country: "UA", continent: "europe", lat: 50.45, lon: 30.52, km: 900 },
  { act: "Dawid Podsiadło", city: "Warsaw", country: "PL", continent: "europe", lat: 52.23, lon: 21.01, km: 700 },
  { act: "Dubioza Kolektiv", city: "Sarajevo", country: "BA", continent: "europe", lat: 43.86, lon: 18.41, km: 800 },
  { act: "NIKI", city: "Jakarta", country: "ID", continent: "asia", lat: -6.21, lon: 106.85, km: 1500 },
  { act: "Rich Brian", city: "Jakarta", country: "ID", continent: "asia", lat: -6.21, lon: 106.85, km: 1500 },
  { act: "Ben&Ben", city: "Manila", country: "PH", continent: "asia", lat: 14.6, lon: 120.98, km: 1200 },
  { act: "Jo Koy", kind: "comedian", city: "Manila", country: "PH", continent: "asia", lat: 14.6, lon: 120.98, km: 1200 },
  { act: "Sơn Tùng M-TP", city: "Ho Chi Minh City", country: "VN", continent: "asia", lat: 10.82, lon: 106.63, km: 1500 },
  { act: "Atif Aslam", city: "Lahore", country: "PK", continent: "asia", lat: 31.55, lon: 74.34, km: 1200 },
  { act: "Ali Sethi", city: "Lahore", country: "PK", continent: "asia", lat: 31.55, lon: 74.34, km: 1200 },
  { act: "Habib Wahid", city: "Dhaka", country: "BD", continent: "asia", lat: 23.81, lon: 90.41, km: 900 },
  { act: "Yohani", city: "Colombo", country: "LK", continent: "asia", lat: 6.93, lon: 79.86, km: 900 },
  { act: "Youssou N'Dour", city: "Dakar", country: "SN", continent: "africa", lat: 14.72, lon: -17.47, km: 1500 },
  { act: "Diamond Platnumz", city: "Dar es Salaam", country: "TZ", continent: "africa", lat: -6.79, lon: 39.21, km: 1500 },
  { act: "Teddy Afro", city: "Addis Ababa", country: "ET", continent: "africa", lat: 9.03, lon: 38.74, km: 1200 },
  { act: "Saad Lamjarred", city: "Casablanca", country: "MA", continent: "africa", lat: 33.57, lon: -7.59, km: 1200 },
  { act: "Angélique Kidjo", city: "Cotonou", country: "BJ", continent: "africa", lat: 6.37, lon: 2.39, km: 1200 },
  { act: "Fally Ipupa", city: "Kinshasa", country: "CD", continent: "africa", lat: -4.44, lon: 15.27, km: 1500 },
  { act: "Basketmouth", kind: "comedian", city: "Lagos", country: "NG", continent: "africa", lat: 6.52, lon: 3.38, km: 1200 },
  { act: "Eddy Kenzo", city: "Kampala", country: "UG", continent: "africa", lat: 0.35, lon: 32.58, km: 1200 },
  { act: "Ivete Sangalo", city: "Salvador", country: "BR", continent: "south_america", lat: -12.97, lon: -38.5, km: 1500 },
  { act: "Gian Marco", city: "Lima", country: "PE", continent: "south_america", lat: -12.05, lon: -77.04, km: 1500 },
  { act: "Paulo Coelho", kind: "author", city: "Rio de Janeiro", country: "BR", continent: "south_america", lat: -22.91, lon: -43.17, km: 1200 },
  { act: "Jorge Drexler", city: "Montevideo", country: "UY", continent: "south_america", lat: -34.9, lon: -56.16, km: 1200 },
  { act: "Ricardo Montaner", city: "Caracas", country: "VE", continent: "south_america", lat: 10.48, lon: -66.9, km: 1500 },
  { act: "Buena Vista Social Club", city: "Havana", country: "CU", continent: "north_america", lat: 23.11, lon: -82.37, km: 1500 },
  { act: "Bob Marley & The Wailers", city: "Kingston", country: "JM", continent: "north_america", lat: 18.0, lon: -76.79, km: 1500 },
  { act: "Juan Luis Guerra", city: "Santo Domingo", country: "DO", continent: "north_america", lat: 18.49, lon: -69.93, km: 1500 },
  { act: "Drake", city: "Toronto", country: "CA", continent: "north_america", lat: 43.65, lon: -79.38, km: 800 },
  { act: "Celine Dion", city: "Montreal", country: "CA", continent: "north_america", lat: 45.5, lon: -73.57, km: 800 },
  { act: "Arcade Fire", city: "Montreal", country: "CA", continent: "north_america", lat: 45.5, lon: -73.57, km: 800 },
  { act: "Russell Peters", kind: "comedian", city: "Toronto", country: "CA", continent: "north_america", lat: 43.65, lon: -79.38, km: 800 },
  { act: "Cirque du Soleil", kind: "dancer", city: "Montreal", country: "CA", continent: "north_america", lat: 45.5, lon: -73.57, km: 800 },
  { act: "Måneskin", city: "Rome", country: "IT", continent: "europe", lat: 41.9, lon: 12.5, km: 700 },
  { act: "Stromae", city: "Brussels", country: "BE", continent: "europe", lat: 50.85, lon: 4.35, km: 600 },
  { act: "Rammstein", city: "Berlin", country: "DE", continent: "europe", lat: 52.52, lon: 13.4, km: 700 },
  { act: "Hardwell", kind: "dj", city: "Amsterdam", country: "NL", continent: "europe", lat: 52.37, lon: 4.9, km: 600 },
  { act: "Mariza", city: "Lisbon", country: "PT", continent: "europe", lat: 38.72, lon: -9.14, km: 800 },
  { act: "a-ha", city: "Oslo", country: "NO", continent: "europe", lat: 59.91, lon: 10.75, km: 900 },
  { act: "Nightwish", city: "Helsinki", country: "FI", continent: "europe", lat: 60.17, lon: 24.94, km: 900 },
  { act: "Six60", city: "Auckland", country: "NZ", continent: "oceania", lat: -36.85, lon: 174.76, km: 2500 },
  { act: "Hilltop Hoods", city: "Adelaide", country: "AU", continent: "oceania", lat: -34.93, lon: 138.6, km: 1500 },
  // North American breadth (dense data region)
  { act: "Chris Stapleton", city: "Nashville", country: "US", continent: "north_america", lat: 36.16, lon: -86.78, km: 900 },
  { act: "Kendrick Lamar", city: "Los Angeles", country: "US", continent: "north_america", lat: 34.05, lon: -118.24, km: 900 },
  { act: "Olivia Rodrigo", city: "Los Angeles", country: "US", continent: "north_america", lat: 34.05, lon: -118.24, km: 900 },
  { act: "Zach Bryan", city: "Tulsa", country: "US", continent: "north_america", lat: 36.15, lon: -95.99, km: 900 },
  { act: "Noah Kahan", city: "Burlington", country: "US", continent: "north_america", lat: 44.48, lon: -73.21, km: 600 },
  { act: "John Mulaney", kind: "comedian", city: "Chicago", country: "US", continent: "north_america", lat: 41.88, lon: -87.63, km: 700 },
  { act: "Shane Gillis", kind: "comedian", city: "Philadelphia", country: "US", continent: "north_america", lat: 39.95, lon: -75.17, km: 600 },
  { act: "Matt Rife", kind: "comedian", city: "Columbus", country: "US", continent: "north_america", lat: 39.96, lon: -83.0, km: 700 },
  { act: "The Weeknd", city: "Toronto", country: "CA", continent: "north_america", lat: 43.65, lon: -79.38, km: 800 },
  { act: "Shania Twain", city: "Toronto", country: "CA", continent: "north_america", lat: 43.65, lon: -79.38, km: 900 },
  { act: "Tegan and Sara", city: "Calgary", country: "CA", continent: "north_america", lat: 51.05, lon: -114.07, km: 1200 },
  { act: "Brené Brown", kind: "author", city: "Houston", country: "US", continent: "north_america", lat: 29.76, lon: -95.37, km: 900 },
  { act: "Stephen King", kind: "author", city: "Portland", country: "US", continent: "north_america", lat: 43.66, lon: -70.26, km: 700 },
  { act: "Joe Rogan", kind: "podcaster", city: "Austin", country: "US", continent: "north_america", lat: 30.27, lon: -97.74, km: 900 },
  { act: "Diplo", kind: "dj", city: "Miami", country: "US", continent: "north_america", lat: 25.76, lon: -80.19, km: 1000 },
  { act: "Shepard Fairey", kind: "visual_artist", city: "Los Angeles", country: "US", continent: "north_america", lat: 34.05, lon: -118.24, km: 900 },
  { act: "Phish", city: "Burlington", country: "US", continent: "north_america", lat: 44.48, lon: -73.21, km: 700 },
  { act: "Morgan Wallen", city: "Knoxville", country: "US", continent: "north_america", lat: 35.96, lon: -83.92, km: 800 },
  { act: "Leon Bridges", city: "Fort Worth", country: "US", continent: "north_america", lat: 32.76, lon: -97.33, km: 900 },
  { act: "Mitski", city: "Atlanta", country: "US", continent: "north_america", lat: 33.75, lon: -84.39, km: 900 },
  // Dance swaps (Batsheva, Akram Khan, Pina Bausch don't resolve)
  { act: "Riverdance", kind: "dancer", city: "Dublin", country: "IE", continent: "europe", lat: 53.35, lon: -6.26, km: 700 },
  { act: "Matthew Bourne", kind: "dancer", city: "London", country: "GB", continent: "europe", lat: 51.51, lon: -0.13, km: 600 },
  { act: "Shen Yun", kind: "dancer", city: "New York", country: "US", continent: "north_america", lat: 40.71, lon: -74.01, km: 600 },
  // Act-less dance (not in the fan data): planned from comparable companies, said on the card.
  { act: "Dance Theatre of Harlem", kind: "dancer", peers: ["Alvin Ailey American Dance Theater", "Cirque du Soleil"], city: "New York", country: "US", continent: "north_america", lat: 40.81, lon: -73.95, km: 900 },
  { act: "Pilobolus", kind: "dancer", peers: ["Alvin Ailey American Dance Theater", "Cirque du Soleil"], city: "Hartford", country: "US", continent: "north_america", lat: 41.76, lon: -72.67, km: 900 },
];

const FEATURES: ExampleFeature[] = ["route", "venue", "offer", "pace", "prep", "rehearsal"];
const slug = (s: string) => s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-");
// Money as a plain amount; callers say "loses"/"less" for negatives, but a stray sign renders as "−$5", never "$-5".
const fmt = (n: number, cur: string) => `${n < 0 ? "−" : ""}${cur === "USD" ? "$" : cur === "AUD" ? "A$" : cur === "EUR" ? "€" : cur === "INR" ? "₹" : `${cur} `}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const nets = (n: number, cur: string) => (n < 0 ? `loses ~${fmt(-n, cur)}` : `nets ~${fmt(n, cur)}`);
const RECOMPUTE = process.argv.includes("--recompute");
const client = process.env.ANTHROPIC_API_KEY && !RECOMPUTE ? new Anthropic() : undefined;
// --recompute: any fan-data request that misses the cache fails here instead of going out; the
// count tells the loop which acts were rebuilt purely from cache.
let offlineMisses = 0;
if (RECOMPUTE) {
  const qloo = new URL(getEnv().QLOO_BASE_URL).host;
  const real = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host !== qloo) return real(input, init);
    offlineMisses++;
    return Promise.reject(new Error(`--recompute: ${url.pathname} not cached`));
  }) as typeof fetch;
}

// Worldwide fan density: one heatmap per country (a global call needs a location; continents
// don't resolve), gridded at 0.25° where Qloo has > 500 cells and 0.5° elsewhere. Each country
// keeps ~60% of its grid cells (min 100). Then metro heatmaps (Qloo returns geohash 6–7 for a city
// query) for the biggest cities in the act's top fan countries, at full resolution. Weight blends
// the share of the country's/metro's peak with a log-scaled global weight, so the US doesn't
// flatten everyone else; thin countries are scaled down and flagged in `coverage`.
const FINE_CELLS = 500; // countries with more cells than this use the fine grid
const GRID_FINE = 0.25;
const GRID_COARSE = 0.5;
const KEEP_SHARE = 0.6;
const MIN_PER_COUNTRY = 100;
const MAX_POINTS = 25_000;
const THIN_CELLS = 40; // fewer heatmap cells than this = thin coverage
const LOG_K = 1000;
const METRO_COUNTRIES = 5;
const METROS_PER_COUNTRY = 8;
const METRO_KM = 40; // metros closer than this to a bigger one are the same metro
const METRO_BUDGET = 10_000; // metro detail never takes more than this share of MAX_POINTS

async function fanCountries(): Promise<{ code: string; name: string }[]> {
  const sql = await db();
  return sql<{ code: string; name: string }[]>`
    select k.code, k.name from countries k where exists (select 1 from cities c where c.country = k.code) order by k.name`;
}

type Cell = Awaited<ReturnType<typeof heatmap>>[number];
const cellWeight = (c: Cell) => (c.query?.affinity ?? 0) * (c.query?.popularity ?? 0);

function gridded(cells: Cell[], deg: number) {
  const grid = new Map<string, number>();
  for (const c of cells) {
    const key = `${Math.round(c.location.latitude / deg) * deg},${Math.round(c.location.longitude / deg) * deg}`;
    grid.set(key, (grid.get(key) ?? 0) + cellWeight(c));
  }
  return [...grid.entries()].map(([k, w]) => {
    const [lat, lon] = k.split(",").map(Number);
    return { lat, lon, w };
  });
}

async function fanPoints(signal: string[], countries: { code: string; name: string }[]): Promise<FanDensity> {
  const params = (query: string) => ({ "signal.interests.entities": signal.join(","), "filter.location.query": query, "output.heatmap.boundary": "urn:geohash" });
  const perCountry = await Promise.all(
    countries.map(async (country) => {
      const cells = await heatmap(params(country.name)).catch(() => [] as Cell[]);
      return { code: country.code, cells: cells.length, points: gridded(cells, cells.length > FINE_CELLS ? GRID_FINE : GRID_COARSE) };
    }),
  );
  // Metro detail for the top fan countries (by summed weight).
  const top = [...perCountry].sort((a, b) => b.points.reduce((n, p) => n + p.w, 0) - a.points.reduce((n, p) => n + p.w, 0)).slice(0, METRO_COUNTRIES).filter((c) => c.cells);
  const metros = top.flatMap((c) => {
    const kept: WorldCity[] = [];
    for (const city of topCities(40_000) as WorldCity[]) {
      if (city.country !== c.code) continue;
      if (kept.some((k) => distanceKm(k, city) < METRO_KM)) continue;
      kept.push(city);
      if (kept.length >= METROS_PER_COUNTRY) break;
    }
    return kept;
  });
  const perMetro = await Promise.all(
    metros.map(async (m) => {
      const cells = await heatmap(params(locationQuery(m))).catch(() => [] as Cell[]);
      // Only cells near the metro: a query can resolve wide.
      return cells.filter((c) => distanceKm(m, { lat: c.location.latitude, lon: c.location.longitude }) < METRO_KM * 1.5).map((c) => ({ lat: Math.round(c.location.latitude * 100) / 100, lon: Math.round(c.location.longitude * 100) / 100, w: cellWeight(c) }));
    }),
  );

  const globalMax = Math.max(...perCountry.flatMap((c) => c.points.map((p) => p.w)), 1e-9);
  const logGlobal = (w: number) => Math.min(1, Math.log1p(w * LOG_K) / Math.log1p(globalMax * LOG_K));
  const coverage: FanDensity["coverage"] = {};
  const scaled = (pts: { lat: number; lon: number; w: number }[], thinScale = 1): FanPoint[] => {
    const localMax = Math.max(...pts.map((p) => p.w), 1e-9);
    return pts.map((p) => [p.lat, p.lon, Math.round((0.5 * (p.w / localMax) + 0.5 * logGlobal(p.w)) * thinScale * 1000) / 1000] as FanPoint).sort((a, b) => b[2] - a[2]);
  };
  const countryPts: FanPoint[][] = [];
  for (const c of perCountry) {
    if (!c.cells) continue;
    coverage[c.code] = { cells: c.cells, thin: c.cells < THIN_CELLS };
    const pts = scaled(c.points, Math.min(1, 0.4 + (0.6 * c.cells) / THIN_CELLS));
    countryPts.push(pts.slice(0, Math.max(MIN_PER_COUNTRY, Math.ceil(pts.length * KEEP_SHARE))));
  }
  const metroAll = perMetro.filter((m) => m.length).map((m) => scaled(m));
  const metroShare = Math.min(1, METRO_BUDGET / Math.max(1, metroAll.reduce((n, m) => n + m.length, 0)));
  const metroPts = metroAll.map((m) => m.slice(0, Math.max(1, Math.round(m.length * metroShare))));
  const metroCount = metroPts.reduce((n, m) => n + m.length, 0);
  // Over budget: trim every country by the same share (strongest points kept).
  const countryCount = countryPts.reduce((n, c) => n + c.length, 0);
  const share = Math.min(1, Math.max(0, MAX_POINTS - metroCount) / Math.max(1, countryCount));
  const fanPoints = [...countryPts.flatMap((c) => c.slice(0, Math.max(1, Math.round(c.length * share)))), ...metroPts.flat()].slice(0, MAX_POINTS);
  return { fanPoints, coverage };
}

const Lines = z.object({ lines: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })).min(2).max(3) });

async function prepLines(act: string, kind: PerformerKind, city: string, venue: string | undefined, brief: Awaited<ReturnType<typeof cityBrief>>) {
  const known = briefNames(brief);
  if (client) {
    const res = await client.messages
      .parse({
        model: WORKER_MODEL,
        max_tokens: 800,
        output_config: { effort: "low", format: zodOutputFormat(Lines) },
        system: `Write 2 or 3 short, concrete show-prep lines for ${act}'s ${kind === "comedian" ? "stand-up set" : kind === "musician" || kind === "dj" ? "show" : "event"} in ${city}${venue ? ` at ${venue}` : ""}: an opening line, a local nod, a crowd moment. Use ONLY names from the brief; list them in refs. Plain, specific, no hype.`,
        messages: [{ role: "user", content: JSON.stringify({ fanTaste: brief.fanTaste.map((r) => r.name), cityCulture: brief.cityCulture.map((r) => r.name), localArtists: brief.localArtists.map((r) => r.name), localSpots: brief.localSpots.map((r) => r.name) }) }],
      })
      .catch(() => undefined);
    if (res) recordUsage(WORKER_MODEL, res.usage);
    const grounded = res?.parsed_output?.lines.filter((l) => l.refs.length && l.refs.every((r) => known.has(normalizeRef(r)))) ?? [];
    if (grounded.length >= 2) return grounded.map((l) => l.text);
  }
  // No deterministic fallback: a canned line reads worse than no example.
  return [];
}

const Reacts = z.object({ reactions: z.array(z.object({ item: z.number().int(), reaction: z.enum(["loves", "meh", "misfire"]), why: z.string(), refs: z.array(z.string()) })).max(4) });

async function rehearsalLines(lines: string[], brief: Awaited<ReturnType<typeof cityBrief>>, city: string) {
  const panel = personas(brief, city).slice(0, 3);
  if (!client || !panel.length) return [];
  const out: string[] = [];
  await Promise.all(
    panel.map(async (p) => {
      const res = await client.messages
        .parse({
          model: WORKER_MODEL,
          max_tokens: 600,
          output_config: { effort: "low", format: zodOutputFormat(Reacts) },
          system: `You are one audience member. ${p.who} You care about: ${p.slice.map((r) => r.name).join("; ")}. React to 1–2 lines (loves / meh / misfire), one short sentence why in your voice, refs = names from your list.`,
          messages: [{ role: "user", content: JSON.stringify(lines.map((text, item) => ({ item, text }))) }],
        })
        .catch(() => undefined);
      if (res) recordUsage(WORKER_MODEL, res.usage);
      const { kept } = groundReactions(res?.parsed_output?.reactions ?? [], p, lines.length);
      const r = kept.find((x) => x.reaction !== "meh") ?? kept[0];
      if (r) out.push(`${p.name} ${r.reaction === "loves" ? "loved" : r.reaction === "misfire" ? "winced at" : "shrugged at"} line ${r.item + 1}: “${r.why}”`);
    }),
  );
  return out;
}

// Night count comes from the data (PLAN Q11): a bar of 65 gave 3–8 nights with no count over
// ~25% across the stored acts (60 → 31% at 8, 70 → 37% at 3).
const NIGHT_BAR = 65;
const MIN_NIGHTS = 3;
const MAX_NIGHTS = 8;
function tourNights(scores: CityScore[], radiusKm: number): CityScore[] {
  const km = (s: CityScore) => Number((s.city as { km?: number }).km ?? 0);
  const cap = Math.max(MIN_NIGHTS, Math.min(MAX_NIGHTS, scores.length - 1));
  const picked = scores.filter((s) => km(s) <= radiusKm && s.score >= NIGHT_BAR).slice(0, cap);
  for (const s of scores) if (picked.length < MIN_NIGHTS && !picked.includes(s)) picked.push(s);
  return picked.sort((a, b) => b.score - a.score);
}

type Ctx = Awaited<ReturnType<typeof prepare>> & {};

// Everything an act's examples share: resolve, score the cities around home, rooms, money, briefs,
// and the chosen-vs-skipped comparison. Cached Qloo calls make the per-feature step cheap.
async function prepare(seed: Seed) {
  const kind = seed.kind ?? "musician";
  // Acts not in the fan data plan from comparable acts (the product's act-less mode); the card says so.
  const artist = seed.peers?.length ? await resolvePerformer(seed.act, kind, seed.peers) : await resolveArtist(seed.act, kind);
  if (!artist) {
    console.error(`skip ${seed.act}: not found`);
    return undefined;
  }
  const comparable = "unknown" in artist && artist.unknown ? artist.peers.map((p) => p.name) : undefined;
  const signal = signalIds(artist);
  const area = citiesNear({ lat: seed.lat, lon: seed.lon, radiusKm: seed.km ?? 900 }, 6, 15);
  const scores = await scoreCities(signal, area.cities);
  if (scores.length < 3 || !scores[0].cells) {
    console.error(`skip ${seed.act}: thin data near ${seed.city}`);
    return undefined;
  }
  const med = median(scores.map((s) => s.fanIndex ?? 0)) || 1;
  const top = scores.slice(0, 5);
  const best = top[0];
  const lean = (s: CityScore) => Math.round(((s.fanIndex ?? 0) / med) * 100) / 100;
  const pop = (s: CityScore) => Number((s.city as { population?: number }).population ?? 0);
  const word = (n: number) => (n >= 80 ? "very strong" : n >= 60 ? "strong" : n >= 40 ? "average" : n >= 20 ? "weak" : "very weak");
  const why = (s: CityScore): ScoreWhy => {
    const rank = scores.indexOf(s) + 1;
    const reach = s.reach ?? 0;
    const pull = s.lean ?? 0;
    const lead = rank === 1 ? `The most fans of the ${scores.length} cities near ${seed.city}` : `#${rank} of ${scores.length} cities near ${seed.city} for fans`;
    return { reach, pull, rank, of: scores.length, hotspots: s.cells, line: `${lead} (reach ${reach}/100) and a ${word(pull)} lean to the act (${pull}/100). Fan strength = 60% reach + 40% lean, from ${s.cells.toLocaleString("en-US")} fan clusters in the city.` };
  };

  // Best real room near the top fan hotspot (festivals and events are filtered out upstream).
  const venues = await findVenues(signal, best, undefined, kind).catch(() => []);
  const ranked = [...venues].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  const room = ranked[0];
  const capacity = room ? defaultCapacity(roomType(room.tag)) : 1200;
  const night = (s: CityScore, km: number, rooms: { name: string; capacity: number }[] = []) =>
    optimise({ region: area.region, kind, demand: estimateDemand({ fanIndex: s.fanIndex ?? 0, medianFanIndex: med, roomMin: 800, roomMax: 3000 }), rooms, costs: legCosts(km, 4, true) });
  const rec = night(best, 300, room ? [{ name: room.name, capacity }] : []);
  const demand = estimateDemand({ fanIndex: best.fanIndex ?? 0, medianFanIndex: med, roomMin: 800, roomMax: 3000 });
  const cur = rec.currency;

  // --recompute: a brief with uncached calls counts as no brief (it only adds the optional "fans
  // also go to …" lines), so those misses don't block the act; the stored line is reused below.
  const briefOf = async (s: CityScore) => {
    const before = offlineMisses;
    const b = await cityBrief({ signal, city: locationQuery(s.city), kind }).catch(() => undefined);
    if (offlineMisses === before) return b;
    offlineMisses = before;
    return undefined;
  };
  const tasteLine = (city: string, b: Awaited<ReturnType<typeof briefOf>>) =>
    b && (b.localSpots[0] || b.cityCulture[0]) ? `Fans in ${city} also go to ${b.localSpots[0]?.name ?? "local spots"}${b.cityCulture[0] ? ` and love ${b.cityCulture[0].name}` : ""}.` : undefined;
  const brief = await briefOf(best);
  const localTaste = tasteLine(best.city.name, brief) ?? (RECOMPUTE ? [...storedRows.values()].find((e) => e.fanKey === slug(seed.act) && e.localTaste?.city === best.city.name)?.localTaste?.line : undefined);

  // Surprise: a top-5 city out-scoring a much bigger one.
  const biggest = [...scores].sort((a, b) => pop(b) - pop(a))[0];
  const sIdx = top.findIndex((s) => s !== biggest && pop(s) > 0 && pop(s) < pop(biggest) / 2 && s.score > biggest.score);
  const surprise = sIdx >= 0 ? { city: top[sIdx].city.name, line: `${top[sIdx].city.name} out-scores ${biggest.city.name}, a city ${Math.round(pop(biggest) / pop(top[sIdx]))}× its size.` } : undefined;

  // The tour's nights, from the data: cities inside the circle with fan strength ≥ NIGHT_BAR,
  // clamped to MIN_NIGHTS–MAX_NIGHTS (topped up with the next-best cities when too few clear it),
  // leaving at least one candidate out for the chosen-vs-skipped comparison.
  const nights = tourNights(scores, seed.km ?? 900);
  const shown = [...top, ...nights.filter((s) => !top.includes(s))];
  // Chosen vs skipped: a tour night against a bigger city the tour leaves out. The pair must be
  // honest: either the chosen night earns at least as much, or the skipped city has a reason the
  // engine itself used (too far off the route, or too little fan data to bet on). Otherwise try the
  // next pair; no honest pair = no compare.
  const homeKm = (s: CityScore) => Math.round(distanceKm(seed, s.city));
  const nightProfit = new Map<CityScore, ReturnType<typeof night>>();
  const money = (s: CityScore) => nightProfit.get(s) ?? nightProfit.set(s, s === best ? rec : night(s, homeKm(s))).get(s)!;
  const tourKm = Math.max(...nights.map(homeKm));
  const reasonFor = (o: CityScore, chosen: CityScore): string | undefined => {
    if (money(chosen).best.profit >= money(o).best.profit) return undefined; // money speaks for itself
    if (o.thinData) return `too little fan data in ${o.city.name} to bet a night on (${o.cells} fan clusters)`;
    if (homeKm(o) > tourKm * 1.4 + 300) return `${o.city.name} is ${homeKm(o).toLocaleString("en-US")} km from ${seed.city}, far off a route that stays within ${tourKm.toLocaleString("en-US")} km`;
    return "";
  };
  let out: CityScore | undefined;
  let played: CityScore = best;
  let reason: string | undefined;
  for (const o of scores.filter((s) => !nights.includes(s)).sort((a, b) => pop(b) - pop(a))) {
    const c = nights.filter((s) => pop(s) > 0 && pop(s) < pop(o)).sort((a, b) => money(b).best.profit - money(a).best.profit)[0] ?? best;
    const r = reasonFor(o, c);
    if (r === "") continue; // skipped city earns more and the engine has no reason: not an honest pair
    out = o;
    played = c;
    reason = r;
    break;
  }

  let compare: Compare | undefined;
  if (out) {
    const outBrief = await briefOf(out);
    const side = (s: CityScore, b: Awaited<ReturnType<typeof briefOf>>): CompareCity => {
      const m = money(s);
      const space = s === best && room ? `${roomType(room.tag)}, ~${capacity.toLocaleString("en-US")} seats` : `${m.best.scenario.capacity.toLocaleString("en-US")}-cap room`;
      return { name: s.city.name, fanStrength: s.score, why: why(s), lean: lean(s), tickets: m.best.tickets, roomFit: `${space} for ~${m.best.tickets.toLocaleString("en-US")} expected`, profit: Math.round(m.best.profit), travelKm: homeKm(s), localTaste: tasteLine(s.city.name, b) };
    };
    const chosen = side(played, played === best ? brief : await briefOf(played));
    const skippedSide = side(out, outBrief);
    const ratio = skippedSide.lean > 0 ? chosen.lean / skippedSide.lean : 0;
    const pull = ratio > 10 ? "over 10× the fan pull for its size" : ratio >= 1.15 ? `${ratio.toFixed(1)}× the fan pull for its size` : `fan strength ${chosen.fanStrength} vs ${skippedSide.fanStrength}`;
    const delta = chosen.profit - skippedSide.profit;
    const moneyLine = skippedSide.profit < 0 ? `a night in ${out.city.name} loses ~${fmt(-skippedSide.profit, cur)}` : reason ? reason : `~${fmt(Math.abs(delta), cur)} more per night`;
    compare = { line: `${played.city.name} over ${out.city.name}: ${pull}; ${moneyLine}.`, currency: cur, chosen, skipped: skippedSide, reason: reason || undefined };
  }
  // The tour in play order with each night's money, and the worst candidate night if it loses.
  const route = routeTour(nights, new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10));
  const stopMoney = route.stops.map((s, i) => night(s.city, route.legs[i - 1]?.km ?? Math.round(distanceKm(seed, s.city.city))));
  const routeOut = route.stops.map((s, i) => ({ name: s.city.city.name, lat: s.city.city.lat, lon: s.city.city.lon, date: s.date, profit: Math.round(stopMoney[i].best.profit) }));
  const profitable = routeOut.filter((r) => r.profit > 0);
  const tourProfit = { amount: profitable.reduce((n, r) => n + r.profit, 0), currency: cur, nights: profitable.length };
  const worst = [...new Set([...nights, ...scores.slice(0, 8)])].map((s) => ({ s, profit: Math.round(night(s, Math.round(distanceKm(seed, s.city))).best.profit) })).sort((a, b) => a.profit - b.profit)[0];
  const stop = worst && routeOut.find((r) => r.name === worst.s.city.name);
  const day = stop && new Date(`${stop.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  // The weakest candidate night: usually one that loses money; for big acts every nearby night
  // may pay, and then it's the thinnest margin (loses: false), said as such.
  const losingNight = worst && {
    city: worst.s.city.name,
    amount: -worst.profit,
    currency: cur,
    loses: worst.profit < 0,
    line: worst.profit < 0
      ? stop ? `${worst.s.city.name} on a ${day} loses ~${fmt(-worst.profit, cur)}: move it to a weekend or a smaller room.` : `${worst.s.city.name} would lose ~${fmt(-worst.profit, cur)}, so it's left out.`
      : `Every nearby night pays; the thinnest is ${worst.s.city.name} at ~${fmt(worst.profit, cur)}.`,
  };
  return { comparable, seed, kind, artist, signal, area, scores, med, top, shown, best, lean, pop, why, room, ranked, capacity, night, rec, demand, cur, brief, localTaste, surprise, nights, out, played, compare, route, stopMoney, routeOut, tourProfit, losingNight };
}

async function decide(ctx: NonNullable<Ctx>, feature: ExampleFeature, reuse?: HomeExample["decision"]): Promise<HomeExample | undefined> {
  const { seed, kind, artist, area, scores, top, best, room, ranked, capacity, night, rec, demand, cur, brief, nights, out, played, compare } = ctx;
  let decision: HomeExample["decision"];
  let skipped: HomeExample["skipped"];
  if (feature === "route") {
    const { route, stopMoney: money } = ctx;
    const total = money.reduce((n, m) => n + Math.max(0, m.best.profit), 0);
    const skip = out && played !== best && !nights.includes(out);
    if (skip) skipped = { name: out.city.name, lat: out.city.lat, lon: out.city.lon, fanStrength: out.score };
    decision = {
      // "Skip" only when the left-out night loses money; otherwise it's a pick on margin.
      headline: !skip || !compare ? `${route.stops.length} nights, ${fmt(total, cur)} estimated profit` : compare.skipped.profit < 0 ? `${artist.name} from ${seed.city}: skip ${out.city.name}, play ${played.city.name}` : `${artist.name} from ${seed.city}: pick ${played.city.name} over ${out.city.name}, ${compare.reason ? `${out.city.name} is off the plan` : `~${fmt(Math.abs(compare.chosen.profit - compare.skipped.profit), cur)} more per night`}`,
      lines: [route.stops.map((s) => s.city.city.name).join(" → ") + ` · ${route.totalKm.toLocaleString("en-US")} km · ${fmt(total, cur)} estimated profit`, ...(skip && compare ? [compare.line] : []), ...money.slice(0, 2).map((m, i) => `${route.stops[i].city.city.name}: ${m.verdict}, ${m.best.tickets.toLocaleString("en-US")} tickets`)],
    };
  } else if (feature === "venue") {
    if (!room) return undefined;
    const alt = ranked.slice(1).find((v) => v.name !== room.name);
    const seats = `~${capacity.toLocaleString("en-US")} seats`;
    decision = {
      // A decision, not a label: book this room over that one. Rooms are ranked by how much the
      // act's fans favour them; say what the room is (a bare "FINAL" reads like a typo).
      headline: alt ? `${artist.name} in ${best.city.name}: book ${room.name} (${seats}) over ${alt.name}` : `${artist.name} in ${best.city.name}: book ${room.name}, a ${roomType(room.tag)} (${seats})`,
      lines: [`Right size for ~${rec.best.tickets.toLocaleString("en-US")} expected (${roomType(room.tag)}, ${seats})`, alt ? `${artist.name} fans favour it over ${alt.name}` : `The room ${artist.name} fans favour most in ${best.city.name}`, `Best deal: ${rec.best.scenario.deal.replace("_", " ")} at ${fmt(rec.best.scenario.price, cur)}`],
    };
  } else if (feature === "offer") {
    const planned = rec.best;
    const lowball = Math.round((planned.artistTake * 0.45) / 100) * 100;
    if (lowball <= 0) return undefined;
    const a = assessOffer({ region: area.region, kind, draw: demand.draw, capacity: planned.scenario.capacity, price: planned.scenario.price || 20, costs: planned.costs, plannedProfit: planned.profit, plannedDeal: planned.scenario.deal, offer: { deal: "guarantee", guarantee: lowball } });
    decision = {
      headline: a.decision === "counter" && a.counter ? `Counter: ${fmt(a.counter.guarantee ?? 0, cur)} vs ${Math.round((a.counter.split ?? 0.7) * 100)}% of the door` : a.decision === "accept" ? `Accept the ${fmt(lowball, cur)} offer` : "Walk away politely",
      lines: [`${room?.name ?? best.city.name} offered ${fmt(lowball, cur)} flat`, `That ${nets(a.offered.profit, cur)}; the plan ${nets(planned.profit, cur).replace("nets", "expects")}`, a.counter ? `The counter ${nets(a.counter.profit, cur)} and still leaves the room its margin` : a.reasons[0] ?? ""].filter(Boolean),
    };
  } else if (feature === "pace") {
    // A plausible sales snapshot, different per act (seeded by its name, so re-runs are stable):
    // some nights behind, some on pace, some ahead; 10–45 days out.
    const seedN = [...seed.act].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rand = (k: number) => ((seedN >>> k) % 1000) / 1000;
    const expected = rec.best.tickets;
    const days = 10 + Math.round(rand(3) * 35);
    const share = 0.15 + rand(7) * 0.7; // of the tickets expected by now, sold
    const byNow = expected * Math.min(1, 0.35 + 0.65 * (1 - days / 60));
    const sold = Math.max(1, Math.round(byNow * share * 1.4));
    const p = ticketPace({ expectedTickets: expected, capacity: rec.best.scenario.capacity, sold, daysToShow: days, promoLeft: 1500, hasSmallerRoom: true, currency: cur });
    decision = { headline: `${best.city.name}: ${p.status}, ${sold.toLocaleString("en-US")} of ${expected.toLocaleString("en-US")} sold with ${days} days to go`, lines: [`On pace for ~${p.projected.toLocaleString("en-US")} of ${expected.toLocaleString("en-US")} planned`, ...p.actions.slice(0, 2)] };
  } else if (reuse) {
    decision = reuse;
  } else {
    if (!brief) return undefined;
    const lines = await prepLines(artist.name, kind, best.city.name, room?.name, brief);
    if (!lines.length) return undefined;
    if (feature === "prep") decision = { headline: `Show notes for ${best.city.name}`, lines };
    else {
      const reacts = await rehearsalLines(lines, brief, best.city.name);
      if (!reacts.length) return undefined;
      decision = { headline: `Rehearsal in ${best.city.name}: “${lines[0].slice(0, 70)}${lines[0].length > 70 ? "…" : ""}”`, lines: reacts };
    }
  }

  return {
    id: `${slug(seed.act)}-${slug(seed.city)}-${feature}`,
    feature,
    decision,
    act: { name: artist.name, kind, image: ctx.comparable ? undefined : artist.image, ...(ctx.comparable ? { comparable: ctx.comparable } : {}) },
    home: { city: seed.city, country: seed.country, continent: seed.continent, lat: seed.lat, lon: seed.lon },
    cities: ctx.shown.map((s) => ({ name: s.city.name, country: (s.city as { country?: string }).country ?? seed.country, lat: s.city.lat, lon: s.city.lon, fanStrength: s.score, lean: ctx.lean(s), why: ctx.why(s) })),
    medianFanStrength: Math.round(median(scores.map((s) => s.score))),
    surprise: ctx.surprise,
    skipped,
    room: room && { name: room.name, type: roomType(room.tag), city: best.city.name, capacity },
    profit: { amount: rec.best.profit, currency: cur, city: best.city.name },
    localTaste: ctx.localTaste ? { city: best.city.name, line: ctx.localTaste } : undefined,
    compare,
    route: ctx.routeOut,
    tourProfit: ctx.tourProfit,
    losingNight: ctx.losingNight,
    fanKey: slug(seed.act),
    checkedAt: new Date().toISOString().slice(0, 10),
  };
}

await ensureWorld();
const filter = process.argv.slice(2).find((a) => !a.startsWith("--"))?.toLowerCase();
const countries = await fanCountries();
const sql = await db();
const runStarted = Date.now();
let ok = 0;
const saveDensity = async (fanKey: string, signal: string[]) => {
  const d = await fanPoints(signal, countries);
  await sql`insert into home_fan_density (fan_key, density) values (${fanKey}, ${sql.json(d as never)}) on conflict (fan_key) do update set density = excluded.density, updated_at = now()`;
  return d;
};
const fanOnly = process.argv.includes("--fan-only");
// --dry-run: count the country heatmaps not yet cached (the bulk of the spend), spend nothing else.
// Each new act also costs ~40 metro heatmaps + ~30 scoring/venue/brief calls (estimated below).
if (process.argv.includes("--dry-run")) {
  const base = getEnv().QLOO_BASE_URL;
  let misses = 0;
  let newActs = 0;
  for (const seed of SEEDS) {
    if (filter && !seed.act.toLowerCase().includes(filter)) continue;
    const artist = await resolveArtist(seed.act, seed.kind ?? "musician");
    if (!artist) continue;
    let actMisses = 0;
    for (const c of countries) {
      const url = new URL("/v2/insights", base);
      const params: Record<string, string> = { "signal.interests.entities": signalIds(artist).join(","), "filter.location.query": c.name, "output.heatmap.boundary": "urn:geohash", "filter.type": "urn:heatmap" };
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      if ((await readCache(cacheKey(url))) === undefined) actMisses++;
    }
    misses += actMisses;
    if (actMisses) newActs++;
  }
  console.log(`dry run: ${misses.toLocaleString("en-US")} uncached country heatmaps across ${newActs} acts; ~${(misses + newActs * 70).toLocaleString("en-US")} Qloo calls in total (incl. ~70 metro/scoring calls per new act); resolve lookups so far: ${qlooCallCount()} calls`);
  await closeDb();
  process.exit(0);
}
// --missing: skip acts whose examples and density are already stored.
const storedIds = new Set((await sql<{ id: string }[]>`select id from home_examples`).map((r) => r.id));
const storedFans = new Set((await sql<{ fan_key: string }[]>`select fan_key from home_fan_density`).map((r) => r.fan_key));
const missing = process.argv.includes("--missing");
// --rebuild: rebuild every example from the cache; keeps stored density and AI-written lines.
const rebuild = RECOMPUTE || process.argv.includes("--rebuild");
const storedRows = new Map(rebuild ? (await sql<{ id: string; example: HomeExample }[]>`select id, example from home_examples`).map((r) => [r.id, r.example]) : []);
for (const [i, seed] of SEEDS.entries()) {
  if (filter && !seed.act.toLowerCase().includes(filter)) continue;
  // Each act gets three different decision types, rotated so neighbours differ.
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const features = [0, 2, 4].map((k) => FEATURES[(i + k) % FEATURES.length]).filter((f) => !only || f === only);
  if (!features.length) continue;
  const key = slug(seed.act);
  const ids = features.map((f) => `${key}-${slug(seed.city)}-${f}`);
  if (missing && storedFans.has(key) && ids.every((id) => storedIds.has(id))) continue;
  const started = Date.now();
  const missesBefore = offlineMisses;
  try {
    if (RECOMPUTE && !storedFans.has(key)) {
      console.error(`keep ${seed.act}: no stored fan density`);
      continue;
    }
    const ctx = await prepare(seed);
    if (!ctx) {
      if (RECOMPUTE && offlineMisses > missesBefore) console.error(`keep ${seed.act}: ${offlineMisses - missesBefore} fan-data calls not cached`);
      continue;
    }
    const density = (missing || rebuild) && storedFans.has(key) ? undefined : await saveDensity(key, ctx.signal);
    if (fanOnly) {
      console.log(`${key}: ${density?.fanPoints.length ?? "kept"} fan points`);
      continue;
    }
    const built: HomeExample[] = [];
    for (const f of features) {
      const prior = storedRows.get(`${key}-${slug(seed.city)}-${f}`);
      // --fresh-ai: redo the AI-written lines too (a few cents; needed when the brief filters change).
      const reuse = rebuild && !process.argv.includes("--fresh-ai") && prior && (f === "prep" || f === "rehearsal") ? prior.decision : undefined;
      const raw = await decide(ctx, f, reuse);
      if (!raw) continue;
      const ex = reconcileExample(raw);
      const bad = exampleProblem(ex);
      if (bad) {
        console.error(`reject ${ex.id}: ${bad}`);
        continue;
      }
      built.push(ex);
    }
    if (RECOMPUTE && offlineMisses > missesBefore) {
      console.error(`keep ${seed.act}: ${offlineMisses - missesBefore} fan-data calls not cached`);
      continue;
    }
    for (const ex of built) {
      await sql`insert into home_examples (id, example) values (${ex.id}, ${sql.json(ex as never)}) on conflict (id) do update set example = excluded.example, updated_at = now()`;
      ok++;
      console.log(`${ex.id}: ${ex.decision.headline} (${ex.route?.length ?? 0} nights)`);
    }
    // Recomputed purely from cache: this act's rows that no longer pass go (full rebuilds prune below).
    if (RECOMPUTE && !only) {
      const keep = built.map((e) => e.id);
      const gone = await sql`delete from home_examples where id = any(${ids}) and not (id = any(${keep.length ? keep : [""]})) returning id`;
      if (gone.length) console.log(`  dropped ${gone.map((r) => r.id).join(", ")}`);
    }
    console.log(`  ${seed.act}: ${density ? `${density.fanPoints.length} fan points, ${Object.keys(density.coverage).length} countries` : "density kept"} · ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (e) {
    console.error(`fail ${seed.act}: ${(e as Error).message.slice(0, 160)}`);
  }
}
// Only a FULL --rebuild (no act filter, no --only) replaces the set: rows it didn't regenerate go.
// --recompute never prunes globally: acts it couldn't rebuild from cache keep their rows.
if (rebuild && !RECOMPUTE && !filter && !process.argv.some((a) => a.startsWith("--only="))) {
  const gone = await sql`delete from home_examples where updated_at < ${new Date(runStarted)} returning id`;
  console.log(`pruned ${gone.length} stale examples`);
}

// The always-on "world of fans" layer: every act's density summed on a 1° grid, normalised (log).
// Stored as fan_key "_world"; the globe draws it as a faint base wave under the examples.
const WORLD_DEG = 1;
const world = new Map<string, number>();
for (const { density } of await sql<{ density: FanDensity }[]>`select density from home_fan_density where fan_key <> '_world'`)
  for (const [lat, lon, w] of density.fanPoints) {
    const k = `${Math.round(lat / WORLD_DEG) * WORLD_DEG},${Math.round(lon / WORLD_DEG) * WORLD_DEG}`;
    world.set(k, (world.get(k) ?? 0) + w);
  }
const worldMax = Math.max(...world.values(), 1e-9);
const worldPoints = [...world.entries()].map(([k, w]) => [...k.split(",").map(Number), Math.round((Math.log1p(w) / Math.log1p(worldMax)) * 1000) / 1000] as FanPoint);
if (worldPoints.length) await sql`insert into home_fan_density (fan_key, density) values ('_world', ${sql.json({ fanPoints: worldPoints, coverage: {} } as never)}) on conflict (fan_key) do update set density = excluded.density, updated_at = now()`;
console.log(`world layer: ${worldPoints.length} points`);
const [{ n, continents, acts }] = await sql<{ n: number; continents: number; acts: number }[]>`
  select count(*)::int as n, count(distinct example->'home'->>'continent')::int as continents, count(distinct example->>'fanKey')::int as acts from home_examples`;
const spread = await sql<{ nights: number; n: number }[]>`select jsonb_array_length(example->'route') as nights, count(*)::int as n from home_examples group by 1 order by 1`;
console.log(`nights per example: ${spread.map((r) => `${r.nights} ×${r.n}`).join(", ")}`);
console.log(`${ok} built this run; ${n} examples, ${acts} acts, ${continents} continents in Postgres`);
const ai = usageSummary();
console.log(`usage: ${qlooCallCount().toLocaleString("en-US")} Qloo calls, ${qlooCacheHits().toLocaleString("en-US")} cache hits; ${ai.map((u) => `${u.model} ${u.calls} calls, ${u.input + u.output} tokens, $${u.cost}`).join("; ") || "no AI calls"}; cache ${JSON.stringify(cacheSummary())}`);
await closeDb();
