import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/qloo-header.js
var QLOO_LOGO_WIDTH = 39;
var QLOO_LOGO_ART = [
  "          \u256D\u2500\u2500\u2500\u2500\u256E\u2577 \u256D\u2500\u2500\u2500\u256E \u256D\u2500\u2500\u2500\u256E          ",
  "  \u25CF\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2502    \u2502\u2502 \u2502   \u251C\u2500\u2524   \u2502\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u25CF  ",
  "          \u2570\u2500\u2500\u252C\u2500\u256F\u2570\u2500\u2570\u2500\u2500\u2500\u256F \u2570\u2500\u2500\u2500\u256F          ",
  "             \u2570\u2574                        "
];
var QLOO_MEDIUM_LOGO_WIDTH = 57;
var QLOO_MEDIUM_LOGO_ART = [
  "\u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E    \u2577           \u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E   \u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E",
  "\u2502            \u2502    \u2502           \u2502          \u2502   \u2502          \u2502",
  "\u2502            \u2502    \u2502           \u2502          \u2502   \u2502          \u2502",
  "\u2502            \u2502    \u2502           \u2502          \u251C\u2500\u2500\u2500\u2524          \u2502",
  "\u2502            \u2502    \u2502           \u2502          \u2502   \u2502          \u2502",
  "\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F    \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F   \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F",
  "          \u2570\u2500\u2500\u2574"
];
var QLOO_HERO_LOGO_WIDTH = 86;
var QLOO_HERO_LOGO_ART = [
  "\u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E    \u2577                     \u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E    \u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E",
  "\u2502                  \u2502    \u2502                     \u2502                \u2502    \u2502                \u2502",
  "\u2502                  \u2502    \u2502                     \u2502                \u2502    \u2502                \u2502",
  "\u2502                  \u2502    \u2502                     \u2502                \u251C\u2500\u2500\u2500\u2500\u2524                \u2502",
  "\u2502                  \u2502    \u2502                     \u2502                \u2502    \u2502                \u2502",
  "\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F    \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500    \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F    \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F",
  "              \u2570\u2500\u2500\u2500\u2500\u2574"
];
var QLOO_MEDIUM_MIN_TERMINAL_WIDTH = QLOO_MEDIUM_LOGO_WIDTH + 4;
var QLOO_HERO_MIN_TERMINAL_WIDTH = QLOO_HERO_LOGO_WIDTH + 4;
var QLOO_HERO_MAX_BANNER_WIDTH = 160;
var QLOO_HEADER_TAGLINE = "how AI understands taste";
var QLOO_BRAND_GRADIENT = [
  { red: 93, green: 37, blue: 182 },
  { red: 57, green: 62, blue: 195 },
  { red: 16, green: 89, blue: 205 }
];
function interpolateChannel(start, end, amount) {
  return Math.round(start + (end - start) * amount);
}
function interpolateColor(start, end, amount) {
  return {
    red: interpolateChannel(start.red, end.red, amount),
    green: interpolateChannel(start.green, end.green, amount),
    blue: interpolateChannel(start.blue, end.blue, amount)
  };
}
function gradientColor(index, length) {
  const progress = length <= 1 ? 0 : index / (length - 1);
  if (progress <= 0.5) {
    return interpolateColor(QLOO_BRAND_GRADIENT[0], QLOO_BRAND_GRADIENT[1], progress * 2);
  }
  return interpolateColor(QLOO_BRAND_GRADIENT[1], QLOO_BRAND_GRADIENT[2], (progress - 0.5) * 2);
}
function ansi256(color) {
  const red = Math.round(color.red / 255 * 5);
  const green = Math.round(color.green / 255 * 5);
  const blue = Math.round(color.blue / 255 * 5);
  return 16 + 36 * red + 6 * green + blue;
}
function foreground(color, mode) {
  if (mode === "truecolor") {
    return `\x1B[38;2;${color.red};${color.green};${color.blue}m`;
  }
  return `\x1B[38;5;${ansi256(color)}m`;
}
function background(color, mode) {
  if (mode === "truecolor") {
    return `\x1B[48;2;${color.red};${color.green};${color.blue}m`;
  }
  return `\x1B[48;5;${ansi256(color)}m`;
}
function renderLogoLine(line, mode) {
  const characters = [...line];
  const white = mode === "truecolor" ? "\x1B[38;2;255;255;255m" : "\x1B[38;5;15m";
  const painted = characters.map((character, index) => `${background(gradientColor(index, characters.length), mode)}${character}`).join("");
  return `${white}${painted}\x1B[39;49m`;
}
function renderCenteredLogoLine(line, width, mode) {
  const padding = Math.max(0, Math.floor((width - [...line].length) / 2));
  return `${" ".repeat(padding)}${renderLogoLine(line, mode)}`;
}
function expandLogoArt(art, coreWidth, availableWidth, railRow) {
  const bannerWidth = Math.min(availableWidth - 2, QLOO_HERO_MAX_BANNER_WIDTH);
  const railSpace = bannerWidth - coreWidth - 2;
  const left = Math.floor(railSpace / 2);
  const right = railSpace - left;
  return art.map((source, index) => {
    const line = source.padEnd(coreWidth);
    if (index === railRow) {
      return `\u25CF${"\u2500".repeat(left)}${line}${"\u2500".repeat(right)}\u25CF`;
    }
    return `${" ".repeat(left + 1)}${line}${" ".repeat(right + 1)}`;
  });
}
function renderBrandWord(word, mode) {
  const characters = [...word];
  const painted = characters.map((character, index) => `${foreground(gradientColor(index, characters.length), mode)}${character}`).join("");
  return `${painted}\x1B[39m`;
}
function clip(text, width) {
  const characters = [...text];
  if (characters.length <= width)
    return text;
  if (width <= 0)
    return "";
  if (width === 1)
    return "\u2026";
  return `${characters.slice(0, width - 1).join("")}\u2026`;
}
function centered(text, width) {
  const padding = Math.max(0, Math.floor((width - [...text].length) / 2));
  return `${" ".repeat(padding)}${text}`;
}
function instructionForWidth(width, profile) {
  const authority = {
    explore: "Qloo + read-only files",
    integrate: "Qloo + files + approved shell",
    plan: "Qloo + read-only files",
    build: "Qloo + approved shell/writes"
  }[profile];
  if (width >= 76) {
    return `${profile} \xB7 ${authority} \xB7 /start guided help \xB7 ctrl+c/ctrl+d clear/exit`;
  }
  if (width >= 44)
    return `${profile} \xB7 ${authority} \xB7 /start`;
  return `${profile} \xB7 ${authority}`;
}
function promptForWidth(width, profile) {
  const prompt = {
    explore: "Ask Qloo about an audience, entity, place, trend, or recommendation.",
    integrate: "Describe your system and the Qloo integration you want to design.",
    plan: "Ask for a project-grounded Qloo implementation plan.",
    build: "Describe the approved Qloo integration work to implement and verify."
  }[profile];
  if (width >= 38)
    return prompt;
  return profile === "explore" ? "Ask Qloo anything." : `${profile} with Qloo.`;
}
function renderQlooHeader(theme, availableWidth, profile = "explore") {
  const width = Math.max(1, Math.floor(availableWidth));
  const mode = theme.getColorMode();
  const heroLogo = width >= QLOO_HERO_MIN_TERMINAL_WIDTH;
  const mediumLogo = !heroLogo && width >= QLOO_MEDIUM_MIN_TERMINAL_WIDTH;
  const compactLogo = !heroLogo && !mediumLogo && width >= QLOO_LOGO_WIDTH;
  const expandedArt = heroLogo ? expandLogoArt(QLOO_HERO_LOGO_ART, QLOO_HERO_LOGO_WIDTH, width, 3) : mediumLogo ? expandLogoArt(QLOO_MEDIUM_LOGO_ART, QLOO_MEDIUM_LOGO_WIDTH, width, 3) : void 0;
  const logo = expandedArt ? expandedArt.map((line) => renderCenteredLogoLine(line, width, mode)) : compactLogo ? QLOO_LOGO_ART.map((line) => renderCenteredLogoLine(line, width, mode)) : [theme.bold(renderBrandWord(centered(clip("Qloo", width), width), mode))];
  const fullLogo = heroLogo || mediumLogo || compactLogo;
  const taglineText = centered(clip(QLOO_HEADER_TAGLINE, width), width);
  const tagline = fullLogo ? theme.bold(renderBrandWord(taglineText, mode)) : theme.fg("muted", taglineText);
  return [
    "",
    ...logo,
    ...heroLogo || mediumLogo ? [""] : [],
    tagline,
    theme.fg("muted", centered(clip(instructionForWidth(width, profile), width), width)),
    theme.fg("dim", centered(clip(promptForWidth(width, profile), width), width)),
    ""
  ];
}
export {
  QLOO_HEADER_TAGLINE,
  QLOO_HERO_LOGO_ART,
  QLOO_HERO_LOGO_WIDTH,
  QLOO_LOGO_ART,
  QLOO_LOGO_WIDTH,
  QLOO_MEDIUM_LOGO_ART,
  QLOO_MEDIUM_LOGO_WIDTH,
  renderQlooHeader
};
