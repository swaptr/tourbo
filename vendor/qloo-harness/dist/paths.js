import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/paths.js
import { createHash } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, parse, resolve } from "node:path";
function expandConfiguredHome(value, homeDirectory) {
  if (value === "~") {
    return homeDirectory;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homeDirectory, value.slice(2));
  }
  return resolve(value);
}
function sessionDirectoryName(cwd) {
  const label = basename(cwd).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "root";
  const digest = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
  return `${label}-${digest}`;
}
function resolveQlooPaths(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const configuredRoot = env.QLOO_HOME?.trim();
  const qlooDir = configuredRoot ? expandConfiguredHome(configuredRoot, homeDirectory) : join(homeDirectory, ".qloo");
  if (configuredRoot && (qlooDir === homeDirectory || qlooDir === parse(qlooDir).root)) {
    throw new Error("QLOO_HOME must name a dedicated subdirectory, not a home or filesystem root.");
  }
  const agentDir = join(qlooDir, "agent");
  const sessionsDir = join(agentDir, "sessions");
  const projectsDir = join(agentDir, "projects");
  const projectDir = join(projectsDir, sessionDirectoryName(cwd));
  return {
    qlooDir,
    configFile: join(qlooDir, "config"),
    agentDir,
    authFile: join(agentDir, "auth.json"),
    modelsFile: join(agentDir, "models.json"),
    modelsStoreFile: join(agentDir, "models-store.json"),
    settingsFile: join(agentDir, "settings.json"),
    trustFile: join(agentDir, "trust.json"),
    sessionsDir,
    sessionDir: join(sessionsDir, sessionDirectoryName(cwd)),
    projectsDir,
    projectDir,
    projectContextFile: join(projectDir, "context.json"),
    plansDir: join(projectDir, "plans"),
    artifactsDir: join(projectDir, "artifacts"),
    cacheDir: join(agentDir, "cache"),
    logsDir: join(agentDir, "logs")
  };
}
async function ensureQlooStateDirectories(paths, options = {}) {
  const directories = [
    paths.qlooDir,
    paths.agentDir,
    paths.sessionsDir,
    paths.sessionDir,
    paths.projectsDir,
    paths.projectDir,
    paths.plansDir,
    paths.artifactsDir,
    paths.cacheDir,
    paths.logsDir
  ];
  for (const directory of directories) {
    const firstCreatedDirectory = await mkdir(directory, { recursive: true, mode: 448 });
    if (firstCreatedDirectory !== void 0 && (options.platform ?? process.platform) !== "win32") {
      await chmod(directory, 448);
    }
  }
}
export {
  ensureQlooStateDirectories,
  resolveQlooPaths
};
