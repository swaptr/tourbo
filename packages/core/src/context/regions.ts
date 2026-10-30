import type { Region } from "../shared/types.ts";

// Region policy registry (PLAN §18 Q15): per-country notes on laws and recent controversies
// that matter for comedy and talks, each with a public source. Guidance, not legal advice: laws
// change and enforcement varies; the act should check locally. Researched 2026-10-30 (sources
// verified to load or appear in search results). Client-safe.
//
// `avoid` topics feed the avoid list (sensitivity.ts TOPICS) for every act playing there;
// `terms` add place-specific words the critic matches (on top of the topic's own words).

export type TopicId = "religion" | "royalty" | "head_of_state" | "military" | "national_tragedy" | "politics" | "ethnicity" | "sexuality" | "obscenity";
export type RegionNote = {
  kind: "law" | "case" | "norm";
  text: string; // one plain sentence
  avoid: TopicId[];
  terms?: string[];
  source: { title: string; url: string };
};
export type RegionPolicy = { code: string; name: string; aliases: string[]; cities?: string[]; notes: RegionNote[] };

const n = (kind: RegionNote["kind"], text: string, avoid: TopicId[], title: string, url: string, terms?: string[]): RegionNote => ({ kind, text, avoid, terms, source: { title, url } });

export const REGIONS: RegionPolicy[] = [
  {
    code: "IN",
    name: "India",
    aliases: ["india", "bharat"],
    cities: ["mumbai", "delhi", "new delhi", "bengaluru", "bangalore", "pune", "hyderabad", "chennai", "kolkata", "ahmedabad", "jaipur", "indore", "lucknow", "goa", "chandigarh", "kochi"],
    notes: [
      n("law", "Deliberately outraging religious feelings is a crime (BNS 299, formerly IPC 295A), up to 3 years.", ["religion"], "BNS Section 299", "https://devgan.in/bns/section/299/"),
      n("law", "Promoting enmity between groups on religion, caste or language is a crime (BNS 196, formerly IPC 153A).", ["religion", "ethnicity"], "Hate speech laws in India", "https://en.wikipedia.org/wiki/Hate_speech_laws_in_India"),
      n("case", "Munawar Faruqui was jailed in Indore in 2021 over jokes he had not yet told.", ["religion"], "Al Jazeera, Jan 2021", "https://www.aljazeera.com/news/2021/1/26/indian-muslim-comic-in-jail-for-weeks-for-jokes-he-didnt-tell"),
      n("case", "India's Got Latent (2025): police complaints in several states over an obscene joke; later quashed.", ["obscenity"], "Bar & Bench", "https://www.barandbench.com/news/litigation/indias-got-latent-row-supreme-court-quashes-firs-against-samay-raina-ranveer-allahbadia-others"),
      n("case", "Kunal Kamra (2025): a Mumbai venue was vandalised over a joke about a state leader.", ["politics"], "Scroll, Mar 2025", "https://scroll.in/latest/1080605/12-shinde-sena-workers-arrested-for-vandalising-kumal-kamra-performance-venue-in-mumbai"),
    ],
  },
  {
    code: "PK",
    name: "Pakistan",
    aliases: ["pakistan"],
    cities: ["karachi", "lahore", "islamabad"],
    notes: [n("law", "Blasphemy laws (PPC 295-C) carry the death penalty.", ["religion"], "Blasphemy in Pakistan", "https://en.wikipedia.org/wiki/Blasphemy_in_Pakistan")],
  },
  {
    code: "BD",
    name: "Bangladesh",
    aliases: ["bangladesh"],
    cities: ["dhaka", "chittagong"],
    notes: [
      n("law", "Hurting religious sentiment is an offence under the Cyber Security Act and is used against performers.", ["religion"], "Prothom Alo", "https://en.prothomalo.com/bangladesh/8hw9uao1lt"),
      n("case", "A Baul singer was arrested for hurting religious sentiment.", ["religion"], "Amnesty UK", "https://www.amnesty.org.uk/urgent-actions/singer-arrested-hurting-religious-sentiment"),
    ],
  },
  {
    code: "ID",
    name: "Indonesia",
    aliases: ["indonesia"],
    cities: ["jakarta", "bali", "denpasar", "surabaya", "bandung", "yogyakarta"],
    notes: [
      n("law", "Blasphemy is a crime (KUHP 156a); Jakarta's governor got 2 years in 2017.", ["religion"], "HRW, May 2017", "https://www.hrw.org/news/2017/05/09/indonesia-sends-jakarta-governor-prison-blasphemy"),
      n("law", "The new penal code (in force Jan 2026) widens offences against religion.", ["religion"], "2023 Indonesian Penal Code", "https://en.wikipedia.org/wiki/2023_Indonesian_Penal_Code"),
    ],
  },
  {
    code: "MY",
    name: "Malaysia",
    aliases: ["malaysia"],
    cities: ["kuala lumpur", "penang", "george town", "johor bahru"],
    notes: [
      n("case", "A comic at a Kuala Lumpur open mic was charged under s.298A (2022) and fined (2023).", ["religion"], "Malay Mail, Apr 2023", "https://www.malaymail.com/news/malaysia/2023/04/17/crackhouse-comedy-performer-fined-rm8000-after-pleading-guilty-to-alternative-charge/65211"),
      n("case", "Jocelyn Chia's MH370 joke (2023) led Malaysian police to seek Interpol help.", ["national_tragedy"], "CBS News", "https://cbsnews.com/minnesota/news/malaysia-asks-interpol-track-us-comedian-jocelyn-chia-joke-mh370", ["mh370", "plane crash", "missing plane"]),
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    aliases: ["singapore"],
    cities: ["singapore"],
    notes: [n("law", "The Maintenance of Religious Harmony Act lets the state act against speech that hurts religious harmony.", ["religion", "ethnicity"], "Singapore Statutes Online: MRHA", "https://sso.agc.gov.sg/SL/MRHA1990-S862-2022")],
  },
  {
    code: "TH",
    name: "Thailand",
    aliases: ["thailand"],
    cities: ["bangkok", "chiang mai", "phuket", "pattaya"],
    notes: [n("law", "Insulting the monarchy (Article 112) carries 3–15 years per count.", ["royalty"], "FIDH Q&A on lèse-majesté", "https://www.fidh.org/IMG/pdf/the_unsayable_-_q_a_on_thailand_s_lese_majeste-3.pdf")],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    aliases: ["saudi arabia", "saudi", "ksa"],
    cities: ["riyadh", "jeddah"],
    notes: [n("norm", "Riyadh Comedy Festival (2025) contracts barred jokes about the royal family, government and religion.", ["royalty", "head_of_state", "religion", "politics"], "Chortle, Sep 2025", "https://www.chortle.co.uk/news/2025/09/28/59143/revealed:_the_rules_riyadh_festival_comics_must_follow")],
  },
  {
    code: "EG",
    name: "Egypt",
    aliases: ["egypt"],
    cities: ["cairo", "alexandria"],
    notes: [n("law", "Contempt of religion (Penal Code 98(f)) carries 6 months to 5 years.", ["religion"], "USCIRF", "https://www.uscirf.gov/news-room/releases-statements/egypt-use-blasphemy-charges-must-end")],
  },
  {
    code: "TR",
    name: "Türkiye",
    aliases: ["turkey", "turkiye", "türkiye"],
    cities: ["istanbul", "ankara", "izmir"],
    notes: [n("law", "Insulting the president (Article 299) carries 1–4 years and is widely used.", ["head_of_state"], "Article 299 of the Turkish Penal Code", "https://en.wikipedia.org/wiki/Article_299_of_the_Turkish_Penal_Code", ["erdogan", "erdoğan"])],
  },
  {
    code: "RU",
    name: "Russia",
    aliases: ["russia"],
    cities: ["moscow", "saint petersburg", "st petersburg"],
    notes: [
      n("law", "Offending believers' feelings (Article 148) is a crime.", ["religion"], "USCIRF 2025", "https://www.uscirf.gov/sites/default/files/2025-04/2025%20Issue%20Update%20Prosecuting%20Blasphemy%20in%20Russia.pdf"),
      n("case", "Comic Idrak Mirzalizade was jailed and banned for life (2021) over a joke about ethnic groups renting flats.", ["ethnicity"], "HRW, Aug 2021", "https://www.hrw.org/news/2021/08/30/russia-jails-comedian-then-expels-him"),
    ],
  },
  {
    code: "CN",
    name: "China",
    aliases: ["china"],
    cities: ["beijing", "shanghai", "shenzhen", "guangzhou", "chengdu"],
    notes: [n("case", "A comic's joke about the army (2023) brought a 14.7M yuan fine on his company.", ["military", "politics", "head_of_state"], "Chortle, May 2023", "https://www.chortle.co.uk/news/2023/05/18/53152/%C2%A31.6m_fine_for_chinese_comedians_gag", ["pla", "people's liberation army"])],
  },
  {
    code: "DE",
    name: "Germany",
    aliases: ["germany", "deutschland"],
    cities: ["berlin", "hamburg", "munich", "münchen", "cologne", "köln", "frankfurt"],
    notes: [
      n("law", "Insulting religions in a way that can disturb public peace is an offence (§166 StGB).", ["religion"], "§166 StGB", "https://www.gesetze-im-internet.de/stgb/__166.html"),
      n("law", "Incitement to hatred against groups, including Holocaust denial, is a crime (§130 StGB).", ["ethnicity"], "§130 StGB", "https://www.gesetze-im-internet.de/stgb/__130.html", ["holocaust", "nazi"]),
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    aliases: ["united kingdom", "uk", "england", "scotland", "wales", "northern ireland", "great britain"],
    cities: ["london", "manchester", "glasgow", "edinburgh", "birmingham", "bristol", "leeds", "liverpool", "cardiff", "belfast", "brighton"],
    notes: [
      n("law", "Stirring up religious hatred is an offence, but criticism, ridicule and insult of religions are protected (Public Order Act s.29J).", [], "Public Order Act 1986 s.29J", "https://www.legislation.gov.uk/ukpga/1986/64/section/29J"),
      n("law", "Clips posted online fall under the Online Safety Act's illegal-content duties.", [], "Online Safety Act explainer", "https://gov.uk/government/publications/online-safety-act-explainer/online-safety-act-explainer"),
    ],
  },
  {
    code: "IE",
    name: "Ireland",
    aliases: ["ireland"],
    cities: ["dublin", "cork", "galway"],
    notes: [n("law", "Blasphemy was removed from the constitution in 2018 and abolished as an offence in 2019.", [], "Irish Legal News", "https://www.irishlegal.com/articles/blasphemy-officially-abolished-as-a-criminal-offence")],
  },
  {
    code: "DK",
    name: "Denmark",
    aliases: ["denmark"],
    cities: ["copenhagen", "aarhus"],
    notes: [n("law", "Improper treatment of holy texts is banned since Dec 2023 (fine or up to 2 years).", ["religion"], "Al Jazeera, Dec 2023", "https://www.aljazeera.com/news/2023/12/7/denmarks-parliament-adopts-law-banning-quran-burnings", ["quran", "koran", "bible", "holy book"])],
  },
  {
    code: "FR",
    name: "France",
    aliases: ["france"],
    cities: ["paris", "lyon", "marseille", "toulouse", "bordeaux", "lille", "nantes"],
    notes: [n("law", "Incitement to racial hatred is a crime (Pleven law, 1972).", ["ethnicity"], "Le DDV", "https://www.leddv.fr/histoire/loi-contre-le-racisme-du-1er-juillet-1972-un-moment-decisif-20220701")],
  },
  {
    code: "PL",
    name: "Poland",
    aliases: ["poland", "polska"],
    cities: ["warsaw", "kraków", "krakow", "wrocław", "wroclaw", "gdańsk", "gdansk"],
    notes: [n("law", "Offending religious feelings (Article 196) has been used against performers.", ["religion"], "Offending religious feelings (Poland)", "https://en.wikipedia.org/wiki/Offending_religious_feelings_(Poland)")],
  },
  {
    code: "US",
    name: "United States",
    aliases: ["united states", "usa", "us", "america"],
    notes: [n("law", "Jokes, satire and parody are broadly protected speech; venues and platforms set their own rules.", [], "Freedom Forum", "https://www.freedomforum.org/funny-or-not-speech-is-still-free/")],
  },
  {
    code: "CA",
    name: "Canada",
    aliases: ["canada"],
    cities: ["toronto", "montreal", "montréal", "vancouver", "calgary", "ottawa", "edmonton", "winnipeg"],
    notes: [n("case", "The Supreme Court (2021, 5–4) ruled Mike Ward's routine about a disabled singer was not discrimination; it was still costly to fight.", ["ethnicity"], "Al Jazeera, Oct 2021", "https://www.aljazeera.com/news/2021/10/29/canadas-top-court-backs-comedian-in-free-speech-row")],
  },
  {
    code: "AU",
    name: "Australia",
    aliases: ["australia"],
    cities: ["sydney", "melbourne", "brisbane", "perth", "adelaide", "hobart", "canberra"],
    notes: [n("law", "Offending or humiliating people on racial grounds is unlawful (civil, s.18C), with artistic exemptions (s.18D).", ["ethnicity"], "Section 18C", "https://en.wikipedia.org/wiki/Section_18C_of_the_Racial_Discrimination_Act_1975")],
  },
  {
    code: "BR",
    name: "Brazil",
    aliases: ["brazil", "brasil"],
    cities: ["são paulo", "sao paulo", "rio de janeiro", "belo horizonte", "brasília", "brasilia", "salvador", "curitiba", "porto alegre"],
    notes: [n("case", "Comic Léo Lins got 8 years at first instance (2025) for prejudiced jokes; under appeal.", ["ethnicity", "sexuality"], "Chortle, Jun 2025", "https://www.chortle.co.uk/news/2025/06/05/58224")],
  },
  {
    code: "NG",
    name: "Nigeria",
    aliases: ["nigeria"],
    cities: ["lagos", "abuja", "kano"],
    notes: [n("case", "A Kano Sharia court sentenced a singer to death for blasphemy (2020); a retrial was ordered.", ["religion"], "Amnesty, Aug 2020", "https://www.amnesty.org/en/latest/news/2020/08/nigeria-authorities-must-quash-the-conviction-and-death-sentence-imposed-on-kano-based-singer/")],
  },
];

const BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Country of a place: ISO2 code if known (world table), else a country name or known city in the
// locality query ("Pune, India", "Kuala Lumpur"); US queries are "City, State" so `na` falls back
// to the US unless Canada/Mexico is named. Undefined = no notes (universal rules still apply).
export function countryOf(place: { country?: string; query?: string; name?: string; region?: Region | string }): string | undefined {
  if (place.country && place.country.length === 2) return place.country.toUpperCase();
  const text = norm(`${place.name ?? ""}, ${place.query ?? ""}`);
  const parts = text.split(/\s*,\s*/).filter(Boolean);
  for (const r of REGIONS) if (r.aliases.some((a) => parts.includes(norm(a)))) return r.code;
  for (const r of REGIONS) if (r.cities?.some((c) => parts.includes(norm(c)))) return r.code;
  if (place.region === "in") return "IN";
  if (place.region === "na" && !/\bmexico\b/.test(text)) return "US";
  return undefined;
}

export const regionPolicy = (code?: string) => (code ? BY_CODE.get(code.toUpperCase()) : undefined);
