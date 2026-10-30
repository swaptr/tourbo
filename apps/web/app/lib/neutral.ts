// Display-time copy rule (PLAN Q5): engine and agent text may name the data vendor or the model;
// the UI speaks as Tourbo. Applied only where that text is rendered, never to stored data.
const RULES: [RegExp, string][] = [
  [/\bQloo[- ]off\b/gi, "without fan data"],
  [/\bQloo[- ]on\b/gi, "with fan data"],
  [/\b(?:no|without) Qloo\b/gi, "without fan data"],
  [/\bQloo heatmaps?\b/gi, "fan map"],
  [/\bQloo[- ](?:data|results|fan data)\b/gi, "fan data"],
  [/\bQloo[- ]backed\b/gi, "fan-data"],
  [/\bQloo (popularity|demand|affinity|score|scores|brief|reference|references|picks?)\b/gi, "fan-data $1"],
  [/\b(?:from|on|in|via|by) Qloo\b/gi, "in the fan data"],
  [/\bQloo\b/gi, "fan data"],
  [/\b(?:Anthropic(?:'s)? )?Claude(?: (?:Opus|Sonnet|Haiku)[\w.\- ]*)?\b/g, "Tourbo"],
  [/\bAnthropic\b/g, "Tourbo"],
];

export function neutral(text: string): string;
export function neutral(text: string | undefined): string | undefined;
export function neutral(text: string | undefined) {
  if (!text) return text;
  return RULES.reduce((s, [re, to]) => s.replace(re, to), text);
}
