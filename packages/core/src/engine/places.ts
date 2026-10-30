// Place names that show up as music "genre" tags in fan data (e.g. "wisconsin", "usa"). A tag that
// is a place, or a place's scene ("chicago rock"), is not a style: covers and angles drop it.
// Client-safe (no I/O).
const LIST = [
  // US states
  "alabama,alaska,arizona,arkansas,california,colorado,connecticut,delaware,florida,georgia,hawaii,idaho,illinois,indiana,iowa,kansas,kentucky,louisiana,maine,maryland,massachusetts,michigan,minnesota,mississippi,missouri,montana,nebraska,nevada,new hampshire,new jersey,new mexico,new york,north carolina,north dakota,ohio,oklahoma,oregon,pennsylvania,rhode island,south carolina,south dakota,tennessee,texas,utah,vermont,virginia,washington,west virginia,wisconsin,wyoming",
  // Canadian provinces
  "ontario,quebec,alberta,manitoba,saskatchewan,nova scotia,new brunswick,british columbia,newfoundland",
  // Countries and regions
  "us,usa,u.s.,uk,america,united states,united kingdom,england,scotland,wales,ireland,canada,mexico,brazil,argentina,chile,colombia,peru,cuba,jamaica,france,germany,spain,portugal,italy,netherlands,belgium,sweden,norway,denmark,finland,iceland,poland,russia,ukraine,greece,turkey,india,pakistan,bangladesh,japan,korea,china,taiwan,australia,new zealand,nigeria,ghana,south africa,kenya,egypt,europe,asia,africa,scandinavia",
  // Demonyms and regions as adjectives
  "american,british,english,scottish,welsh,irish,canadian,mexican,brazilian,argentinian,chilean,colombian,cuban,jamaican,french,german,spanish,portuguese,italian,dutch,belgian,swedish,norwegian,danish,finnish,icelandic,polish,russian,ukrainian,greek,turkish,indian,pakistani,japanese,korean,chinese,taiwanese,australian,nigerian,ghanaian,european,asian,latin american,nordic,scandinavian,midwest,midwestern,west coast,east coast,texan,californian",
  // Cities that appear as scene tags
  "chicago,los angeles,new orleans,nashville,memphis,detroit,atlanta,seattle,portland,boston,philadelphia,austin,houston,dallas,miami,brooklyn,bronx,toronto,montreal,vancouver,london,manchester,liverpool,glasgow,dublin,paris,berlin,madrid,barcelona,mumbai,delhi,tokyo,seoul,sydney,melbourne,bay area,minneapolis,milwaukee,st. louis,kansas city,baltimore",
].join(",");

const PLACES = new Set(LIST.split(","));
const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// `extra`: places from the plan itself (tour city names), so any city is caught, not just the list.
export function isPlace(tag: string, extra: string[] = []): boolean {
  const known = (t: string) => PLACES.has(t) || extra.some((x) => clean(x) === t);
  const t = clean(tag);
  if (known(t)) return true;
  const scene = t.match(/^(.+?) (rock|hip hop|rap|country|folk|indie|pop|punk|metal|soul|blues|jazz|house|techno|scene)$/);
  return !!scene && known(scene[1]);
}

// A tag that reads as a music style. Fan-data genre tags also hold labels and collectives
// ("doomtree"); only tags with a style word in them are used as a genre in copy.
const STYLE = /(rock|pop|hop|rap|jazz|soul|folk|country|blues|metal|punk|indie|r ?& ?b|electr|dance|house|techno|ambient|classical|gospel|funk|reggae|latin|alternative|emo|grunge|disco|trap|drill|grime|dub|edm|lo-fi|gaze|psych|songwriter|americana|bluegrass|soundtrack|afro|world|experimental|noise|core|ska|swing|opera|chamber|synth|wave|beat|garage|orchestral|choral|instrumental|acoustic|cumbia|salsa|bachata|reggaeton|bossa|samba|tango|flamenco|fado|qawwali|bhangra|ghazal|carnatic|hindustani|bollywood|filmi|soca|zouk|highlife|kwaito|amapiano|gqom|k-pop|j-pop|j-rock|chill|lounge|jungle|breaks|bass|step|hardstyle|trance|industrial|goth|new age|cabaret|musical|show tunes|crooner|doo-wop|motown|r&b|neo|lofi|bedroom|math|post-|prog|stoner|sludge|doom metal|black metal|thrash|hardcore|screamo|ballad|singer|cantautor|chanson|schlager|polka|zydeco|cajun|tejano|norteño|mariachi|ranchera|corrido|bolero|merengue|kizomba|semba|mbalax|benga|taarab|chaabi|gnawa|dabke|arabesk|klezmer|celtic|gaelic|shanty|western|honky|outlaw|roots|cosmic)/i;
export function isGenre(tag: string, places: string[] = []): boolean {
  return STYLE.test(tag) && !isPlace(tag, places);
}
