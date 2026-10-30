// Place features (PLAN §18 Q18): supporting numbers from open data that sharpen fan-data
// suggestions. Fan data stays the hero; a place feature only surfaces when it changes a
// suggestion, otherwise it sits behind "why?" or stays hidden. Client-safe.

export type Scope = "country" | "region" | "city";
export type Confidence = "high" | "medium" | "low";

// One raw feature: a number (or small list) with where it came from.
export type Feature<T = number> = {
  value: T;
  unit: string;
  source: string; // short source name; full URL + licence in SOURCES.md / SOURCE_URL
  year: number;
  confidence: Confidence;
  scope: Scope;
};

export type Holiday = { date: string; name: string; national: boolean };
export type Weather = { meanMaxC: number; meanMinC: number; rainMmPerDay: number; years: number[] };

export type RawFeatures = {
  gdpPppPc?: Feature; // GDP per person, PPP (international $)
  gdpUsdPc?: Feature; // GDP per person, current US$
  priceLevel?: Feature; // gdpUsdPc / gdpPppPc: local prices vs the US (1 = US prices)
  inflation?: Feature; // CPI, annual %
  medianAge?: Feature;
  over65?: Feature; // % of people 65+
  tertiary?: Feature; // gross tertiary enrolment % (student presence, country level)
  freeExpression?: Feature; // V-Dem freedom of expression index 0–1 (1 = most free)
  religiousLaw?: Feature<string[]>; // law notes on religious offence for this country (titles)
  blasphemyDeathPenalty?: Feature<boolean>;
  householdIncome?: Feature; // US state median household income (US$)
  incomeVsNation?: Feature; // state median / US median
  electionMargin?: Feature; // US state 2024 presidential margin, points (D − R); used only as "split room" signal
  holidays?: Feature<Holiday[]>;
  weather?: Feature<Weather>;
};

export type PlaceRef = { name: string; country?: string; state?: string; lat: number; lon: number; region?: string };

export type PriceNudge = { factor: number; elasticity: number; incomeRatio: number; anchor?: string };
export type YoungerCrowd = { score: number; skew: "younger" | "older" | "even"; fromFanData: boolean };
export type Tone = { points: number; strictness: "standard" | "careful" | "strict"; addTopics: ("religion" | "politics" | "head_of_state")[]; advice: string[] };
export type DateRisk = { level: "low" | "medium" | "high"; reasons: string[]; holidays: Holiday[] };
export type SpendHeadroom = { share: number; relative: number; level: "tight" | "ok" | "roomy"; spendUsd: number; monthlyIncomeUsd: number };

export type Derived = {
  priceNudge?: PriceNudge;
  youngerCrowd?: YoungerCrowd;
  tone?: Tone;
  dateRisk?: DateRisk;
  spendHeadroom?: SpendHeadroom;
};
export type DerivedKey = keyof Derived;

// A fact for the explanation service / critic: one plain claim and the feature ids it rests on.
export type PlaceFact = { id: string; text: string; refs: string[]; strength: "strong" | "weak"; source: string };

export type PlaceFeatures = {
  place: PlaceRef;
  features: RawFeatures;
  derived: Derived;
  surfaced: DerivedKey[]; // derived features that change a suggestion (shown inline); the rest stay in "why?"
  changes: Partial<Record<DerivedKey, string>>; // one plain line per surfaced feature: what it changes
  facts: PlaceFact[];
  missing: string[]; // features we tried and could not get (offline, unknown country, …)
};
