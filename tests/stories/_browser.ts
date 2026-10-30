// Headless browser for UI story tests (playwright-core + the system Chromium; no download).
// Set STORY_CHROMIUM to point at another Chromium build.
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";

const CANDIDATES = [process.env.STORY_CHROMIUM, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].filter(Boolean) as string[];
export const chromiumPath = CANDIDATES.find((p) => existsSync(p));

// The machine's GPU when there is one (STORY_GPU=0 forces software rendering, e.g. in CI).
const GPU = ["--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu"];
const SOFTWARE = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
export const useGpu = process.env.STORY_GPU !== "0" && existsSync("/dev/dri");
export async function browser(): Promise<Browser> {
  return chromium.launch({ executablePath: chromiumPath, args: useGpu ? GPU : SOFTWARE });
}
