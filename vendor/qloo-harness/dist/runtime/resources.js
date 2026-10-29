import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/resources.js
import { readFile } from "node:fs/promises";
import { QLOO_HARNESS_PROFILES } from "../profiles.js";
var defaultResourceRoot = new URL("../../resources/", import.meta.url);
function normalizeResource(name, content) {
  const normalized = content.replace(/^\uFEFF/, "").trim();
  if (normalized.length === 0) {
    throw new Error(`Bundled Qloo resource is empty: ${name}`);
  }
  return normalized;
}
async function loadHarnessResources(options = {}) {
  const resourceRoot = options.resourceRoot ?? defaultResourceRoot;
  const readText = options.readText ?? ((url) => readFile(url, "utf8"));
  const systemUrl = new URL("SYSTEM.md", resourceRoot);
  const profileEntries = await Promise.all(QLOO_HARNESS_PROFILES.map(async (profile) => {
    const name = `${profile.toUpperCase()}.md`;
    return [profile, normalizeResource(name, await readText(new URL(name, resourceRoot)))];
  }));
  const systemPrompt = await readText(systemUrl);
  const profileInstructions = Object.fromEntries(profileEntries);
  return {
    systemPrompt: normalizeResource("SYSTEM.md", systemPrompt),
    exploreInstructions: profileInstructions.explore,
    profileInstructions
  };
}
function instructionsForProfile(resources, profile) {
  return resources.profileInstructions?.[profile] ?? resources.exploreInstructions;
}
export {
  instructionsForProfile,
  loadHarnessResources
};
