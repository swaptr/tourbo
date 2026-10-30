// Usage: node packages/core/scripts/places-snapshot.ts
// Rebuilds the committed place-feature snapshots (packages/core/src/places/data/*.json) from open
// sources (see packages/core/src/places/SOURCES.md for licences). Downloads to /tmp; writes only
// processed numbers (a few per country / US state). No keys needed.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = new URL("../src/places/data/", import.meta.url).pathname;
const TMP = "/tmp/tourbo-places";
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
const today = new Date().toISOString().slice(0, 10);

const get = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
};
const r = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// World Bank WDI (CC BY 4.0): most recent non-empty value per country.
const WB = { gdpPppPc: "NY.GDP.PCAP.PP.CD", gdpUsdPc: "NY.GDP.PCAP.CD", inflation: "FP.CPI.TOTL.ZG", over65: "SP.POP.65UP.TO.ZS", tertiary: "SE.TER.ENRR" } as const;
const meta = (await (await get("https://api.worldbank.org/v2/country?format=json&per_page=400")).json()) as [unknown, { id: string; iso2Code: string; region: { id: string } }[]];
const iso3to2 = new Map(meta[1].filter((c) => c.region.id !== "NA").map((c) => [c.id, c.iso2Code]));
type Row = Record<string, [number, number]>; // indicator → [value, year]
const countries: Record<string, Row> = {};
for (const [key, id] of Object.entries(WB)) {
  const body = (await (await get(`https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&mrnev=1&per_page=400`)).json()) as [unknown, { countryiso3code: string; date: string; value: number | null }[]];
  for (const x of body[1] ?? []) {
    const iso2 = iso3to2.get(x.countryiso3code);
    if (!iso2 || x.value == null) continue;
    (countries[iso2] ??= {})[key] = [r(x.value, key.startsWith("gdp") ? 0 : 1), Number(x.date)];
  }
}

// UN WPP 2024 median age via Our World in Data (UN WPP CC BY 3.0 IGO; OWID processing CC BY 4.0).
const median = await (await get("https://ourworldindata.org/grapher/median-age.csv?v=1&csvType=full&useColumnShortNames=true")).text();
const latest = new Map<string, [number, number]>();
for (const line of median.split("\n").slice(1)) {
  const [, code, year, est] = line.split(",");
  const iso2 = iso3to2.get(code ?? "");
  if (!iso2 || !est) continue;
  const y = Number(year);
  if ((latest.get(iso2)?.[1] ?? 0) < y) latest.set(iso2, [r(Number(est)), y]);
}
for (const [iso2, v] of latest) (countries[iso2] ??= {}).medianAge = v;

writeFileSync(`${OUT}countries.json`, JSON.stringify({ retrieved: today, sources: ["World Bank WDI (CC BY 4.0)", "UN WPP 2024 via Our World in Data (CC BY 3.0 IGO / CC BY 4.0)"], countries }) + "\n");

// V-Dem v16 freedom of expression index via OWID (CC BY-SA 4.0: this file stays under CC BY-SA 4.0).
const vdemCsv = await (await get("https://ourworldindata.org/grapher/freedom-of-expression-index.csv?v=1&csvType=full&useColumnShortNames=true")).text();
const vdem = new Map<string, [number, number]>();
for (const line of vdemCsv.split("\n").slice(1)) {
  const m = line.match(/^(?:"[^"]*"|[^,]*),([A-Z]{3}),(\d{4}),([\d.]+)/);
  const iso2 = m && iso3to2.get(m[1]!);
  if (!m || !iso2) continue;
  if ((vdem.get(iso2)?.[1] ?? 0) < Number(m[2])) vdem.set(iso2, [Number(m[3]), Number(m[2])]);
}
writeFileSync(`${OUT}vdem.json`, JSON.stringify({ retrieved: today, license: "CC BY-SA 4.0", source: "V-Dem Country-Year Dataset v16 (Coppedge et al. 2026, doi:10.23696/vdemds26) via Our World in Data", freedomOfExpression: Object.fromEntries(vdem) }) + "\n");

// US states: Census SAIPE 2024 median household income (public domain) + MEDSL 2024 presidential
// margin (CC0). State FIPS → postal code from the MEDSL file.
const saipe = `${TMP}/est24all.txt`;
execFileSync("curl", ["-fsSL", "-o", saipe, "https://www2.census.gov/programs-surveys/saipe/datasets/2024/2024-state-and-county/est24all.txt"]);
const income = new Map<number, number>();
for (const line of readFileSync(saipe, "latin1").split("\n")) {
  const t = line.trim().split(/\s+/);
  if (t.length > 21 && t[1] === "0") income.set(Number(t[0]), Number(t[20]));
}
const pres = await (await get("https://dataverse.harvard.edu/api/access/datafile/13887042")).text(); // MEDSL U.S. President 1976–2024, doi:10.7910/DVN/42MVDX
const votes = new Map<string, { fips: number; name: string; dem: number; rep: number; total: number }>();
for (const line of pres.split("\n")) {
  if (!line.startsWith("2024,")) continue;
  const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
  const [, state, po, fips, , , , , , , cand, total, , , party] = cells;
  const v = votes.get(po!) ?? { fips: Number(fips), name: state!, dem: 0, rep: 0, total: Number(total) };
  if (party === "DEMOCRAT") v.dem += Number(cand);
  if (party === "REPUBLICAN") v.rep += Number(cand);
  votes.set(po!, v);
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const states = Object.fromEntries(
  [...votes].map(([po, v]) => [po, { name: titleCase(v.name), medianHouseholdIncome: income.get(v.fips), margin2024: r(((v.dem - v.rep) / v.total) * 100) }]),
);
writeFileSync(`${OUT}us-states.json`, JSON.stringify({ retrieved: today, usMedianHouseholdIncome: income.get(0), incomeYear: 2024, electionYear: 2024, note: "margin2024 = (Democratic − Republican) / total votes × 100, presidential, statewide", states }) + "\n");

// ECB reference rates via Frankfurter (fallback when the live call fails).
const fx = (await (await get("https://api.frankfurter.dev/v2/rates?base=USD&providers=ecb&quotes=EUR,INR,AUD")).json()) as { date: string; quote: string; rate: number }[];
writeFileSync(`${OUT}fx.json`, JSON.stringify({ retrieved: today, base: "USD", date: fx[0]?.date, rates: Object.fromEntries(fx.map((x) => [x.quote, x.rate])) }) + "\n");

console.log(`countries ${Object.keys(countries).length}, vdem ${vdem.size}, states ${Object.keys(states).length}, fx ${fx.length} → ${OUT}`);
