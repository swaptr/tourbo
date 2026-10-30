# Place feature sources

All retrieved 2026-10-30. Snapshots (`data/*.json`, ~38 KB) are rebuilt by `node packages/core/scripts/places-snapshot.ts`; they hold processed numbers only. Live sources are called per request with a 4 s timeout and simply go missing offline.

| Feature | Source | URL | Licence | Use |
|---|---|---|---|---|
| GDP per person (PPP and US$), CPI inflation, 65+ share, tertiary enrolment | World Bank WDI (`NY.GDP.PCAP.PP.CD`, `NY.GDP.PCAP.CD`, `FP.CPI.TOTL.ZG`, `SP.POP.65UP.TO.ZS`, `SE.TER.ENRR`) | https://api.worldbank.org/v2/ (licence: https://datacatalog.worldbank.org/public-licenses) | CC BY 4.0 | snapshot `data/countries.json` |
| Price level | derived: `NY.GDP.PCAP.CD ÷ NY.GDP.PCAP.PP.CD` (WDI's own `PA.NUS.PPPC.RF` is archived) | as above | CC BY 4.0 | snapshot |
| Median age | UN World Population Prospects 2024, via Our World in Data | https://ourworldindata.org/grapher/median-age | UN WPP: CC BY 3.0 IGO; OWID processing: CC BY 4.0 | snapshot `data/countries.json` |
| Freedom of expression index (0–1) | V-Dem Country-Year Dataset v16 (Coppedge et al. 2026, doi:10.23696/vdemds26), via Our World in Data | https://www.v-dem.net/data/the-v-dem-dataset/ · https://ourworldindata.org/grapher/freedom-of-expression-index | CC BY-SA 4.0 (share-alike: `data/vdem.json` is itself CC BY-SA 4.0) | snapshot `data/vdem.json`; tone only |
| US state median household income 2024 | US Census Bureau SAIPE (`est24all.txt`) | https://www2.census.gov/programs-surveys/saipe/datasets/2024/2024-state-and-county/ | US government work, public domain | snapshot `data/us-states.json` |
| US state 2024 presidential margin | MIT Election Data + Science Lab, "U.S. President 1976–2024" | https://doi.org/10.7910/DVN/42MVDX | CC0 1.0 | snapshot `data/us-states.json`; only as "politics splits this room" (aggregate, state level, never targeting) |
| Religious-offence law notes | Tourbo region registry `context/regions.ts` (each note cites its public source) | see that file | facts with citations | tone |
| Blasphemy death-penalty countries (IR, PK, SA, MR, BN) | USCIRF 2023 Blasphemy Legislation Factsheet (reported by Baptist Standard / Baptist News) | https://www.uscirf.gov/news-room/releases-statements/uscirf-releases-updated-blasphemy-factsheet-and-blasphemy-law | US government work, public domain | tone |
| Public holidays | Nager.Date API v3 (`/api/v3/PublicHolidays/{year}/{CC}`) | https://date.nager.at · terms https://nagerholidays.com/legal/termsofservice | code MIT; API free for private/non-profit use, commercial use needs sponsorship | live |
| Weather on the same dates in past 3 years | Open-Meteo Historical Weather API (ERA5) | https://archive-api.open-meteo.com/v1/archive · https://open-meteo.com/en/licence · https://open-meteo.com/en/terms | data CC BY 4.0 ("Weather data by Open-Meteo.com"); free API non-commercial, < 10k calls/day | live |
| FX (USD per EUR / INR / AUD) | ECB reference rates via Frankfurter (`/v2/rates?providers=ecb`) | https://frankfurter.dev | MIT (service); ECB data free reuse with attribution | live, snapshot fallback `data/fx.json` |

Skipped: US Census ACS API (now needs a key; median age by place), RSF World Press Freedom Index (licence for reuse unclear), Eurostat / India sub-national income (no clean lat/lon → region mapping without extra data), full USCIRF blasphemy list (PDF blocks automated download; the registry notes cover the main touring countries).

Attribution when shown: "Public data: World Bank, UN, V-Dem, US Census, MIT Election Lab, Nager.Date, Open-Meteo.com, ECB" behind "why?".
