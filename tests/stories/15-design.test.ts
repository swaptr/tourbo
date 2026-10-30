// Story 15 (PLAN Q7 theme): one calm editorial look everywhere. Token checks read app.css (no app
// needed); the console check needs the app running and Chromium.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";

import { appUp, BASE } from "./_mcp.ts";
import { browser, chromiumPath } from "./_browser.ts";

const WEB = new URL("../../apps/web/app/", import.meta.url).pathname;
const css = (await readFile(join(WEB, "app.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");

// `--name: value;` declarations of one block (`:root {` or `.dark {`).
function block(selector: string) {
  // At the start of a line, so `html.dark {` doesn't count as `.dark {`.
  const start = css.search(new RegExp(`^${selector.replace(".", "\\.")} \\{`, "m"));
  assert.ok(start >= 0, `${selector} block in app.css`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const MODES = { light: block(":root"), dark: { ...block(":root"), ...block(".dark") } };

type Oklch = { l: number; c: number; h: number; alpha: number };
function parseOklch(value: string): Oklch {
  const m = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/);
  assert.ok(m, `oklch() colour: ${value}`);
  const alpha = m[5] === undefined ? 1 : Number(m[5]) / (m[6] ? 100 : 1);
  return { l: Number(m[1]) / (m[2] ? 100 : 1), c: Number(m[3]), h: Number(m[4]), alpha };
}

// oklch → OKLab → linear sRGB (Björn Ottosson's matrices), clipped to the sRGB gamut.
function linearRgb({ l, c, h }: Oklch) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clip(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clip(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clip(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}
// WCAG relative luminance takes linear-light sRGB, which is what OKLab converts to.
const luminance = (color: Oklch) => {
  const [r, g, b] = linearRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function contrast(fg: string, bg: string) {
  const [a, b] = [luminance(parseOklch(fg)), luminance(parseOklch(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// Text token on surface token, as the components use them.
const PAIRS: [fg: string, bg: string][] = [
  ...["background", "card", "popover", "primary", "secondary", "muted", "accent", "destructive", "success", "warning", "info", "sidebar", "sidebar-primary", "sidebar-accent"].map(
    (t): [string, string] => [t === "background" ? "foreground" : `${t}-foreground`, t],
  ),
  // Coloured and quiet text straight on the page or a card.
  ...["muted-foreground", "primary", "destructive", "success", "warning", "info"].flatMap((fg): [string, string][] => [
    [fg, "background"],
    [fg, "card"],
  ]),
  ["muted-foreground", "muted"],
];

test("theme: one strong accent and a secondary, both clearly coloured in both modes", () => {
  for (const [mode, tokens] of Object.entries(MODES)) {
    for (const name of ["primary", "secondary"]) {
      const { c } = parseOklch(tokens[name]);
      assert.ok(c > 0.1, `${mode} --${name} chroma ${c} > 0.1`);
    }
  }
});

test("theme: WCAG AA (4.5:1) for every text/surface pair in light and dark", () => {
  const fails: string[] = [];
  for (const [mode, tokens] of Object.entries(MODES)) {
    for (const [fg, bg] of PAIRS) {
      assert.ok(tokens[fg] && tokens[bg], `${mode}: --${fg} and --${bg} exist`);
      const ratio = contrast(tokens[fg], tokens[bg]);
      if (ratio < 4.5) fails.push(`${mode} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(fails, []);
});

test("theme: no glow or neon, two font families, no monospace", async () => {
  const names = Object.keys({ ...MODES.light, ...MODES.dark });
  assert.deepEqual(names.filter((n) => /glow|neon/i.test(n)), [], "no glow/neon tokens");
  assert.doesNotMatch(css, /text-shadow/, "no text-shadow glows in app.css");

  const families = [...css.matchAll(/--font-[\w-]+:\s*([^;]+);/g)].map((m) => m[1].split(",")[0].trim().replace(/['"]/g, ""));
  assert.equal(new Set(families).size, 2, `two font families: ${families.join(", ")}`);
  const imports = new Set([...css.matchAll(/@import\s+"@fontsource(?:-variable)?\/([\w-]+)/g)].map((m) => m[1]));
  assert.equal(imports.size, 2, `two font packages: ${[...imports].join(", ")}`);
  assert.doesNotMatch(css, /monospace|--font-mono/, "no monospace in app.css");

  for (const file of await sources(WEB)) {
    // Comments may name what's banned; only code counts.
    const text = (await readFile(file, "utf8")).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
    const rel = relative(WEB, file);
    assert.doesNotMatch(text, /\bfont-mono\b|monospace/, `${rel}: no monospace`);
    if (!rel.startsWith("components/ui/")) assert.doesNotMatch(text, /text-shadow|drop-shadow-|bg-gradient|linear-gradient|neon/i, `${rel}: no glow or gradient`);
  }
});

// Allow-list: components/ui/ is generated shadcn (styled through tokens, not ours to hand-edit);
// globe.tsx draws on a canvas and reads the theme tokens at runtime, so any literal there is a
// fallback, not a palette. Everything else must use tokens.
const HEX_ALLOWED = [/^ui\//, /^globe\.tsx$/];
test("theme: no hard-coded hex colours in app/components", async () => {
  const hits: string[] = [];
  for (const file of await sources(join(WEB, "components"))) {
    const rel = relative(join(WEB, "components"), file);
    if (HEX_ALLOWED.some((re) => re.test(rel))) continue;
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (/(?<![&\w])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(line)) hits.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

const up = await appUp();
const noUi = (!up && "app not running") || (!chromiumPath && "no Chromium found");
test("theme: home, wizard and connect render with no console errors", { skip: noUi, timeout: 120_000 }, async () => {
  const b = await browser();
  try {
    for (const path of ["/", "/start", "/connect"]) {
      const page = await b.newPage();
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
      assert.equal(res?.status(), 200, `${path} status`);
      await page.waitForTimeout(1500);
      assert.deepEqual(errors, [], `${path}: console errors`);
      await page.close();
    }
  } finally {
    await b.close();
  }
});

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sources(p)));
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
