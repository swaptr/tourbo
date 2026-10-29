import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/update-manager.js
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, open, readFile, rm, stat, unlink } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join, posix, win32 } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { HARNESS_VERSION } from "./cli.js";
import { resolveQlooPaths } from "./paths.js";
var QLOO_HARNESS_PACKAGE_NAME = "@qloo/qloo-harness";
var QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE = "QLOO_UPDATE_SPEC";
var QLOO_UPDATE_HELP = `Update Qloo

Usage:
  qloo update                       Update the Qloo harness
  qloo update --self                Update the Qloo harness explicitly
  qloo update --extensions          Update configured Qloo extension packages
  qloo update --all                 Update extensions, then the harness
  qloo update --self --extensions   Update extensions, then the harness
  qloo update --extension <source>  Update one configured extension package

Options:
  --self          Include the Qloo harness
  --extensions    Include all configured Qloo extension packages
  --extension     Update one configured Qloo extension package
  --all           Include extensions and the Qloo harness
  --force         Reinstall the harness even at the same or an older version
  --timeout <s>   Bound each package-manager install (10-900 seconds; default 120)
  -h, --help      Show this help

Update overrides:
  QLOO_UPDATE_SPEC may select an approved absolute .tgz path or an exact Qloo
  package tag or version, such as @qloo/qloo-harness@next.`;
var MODULE_PACKAGE_ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
var MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
var MAX_EXPANDED_ARCHIVE_BYTES = 100 * 1024 * 1024;
var MAX_MANIFEST_BYTES = 1024 * 1024;
var DEFAULT_UPDATE_TIMEOUT_MS = 12e4;
var MIN_UPDATE_TIMEOUT_SECONDS = 10;
var MAX_UPDATE_TIMEOUT_SECONDS = 900;
var UPDATE_HEARTBEAT_MS = 5e3;
var MAX_CAPTURED_COMMAND_BYTES = 1024 * 1024;
var MAX_UNKNOWN_UPDATE_LOCK_AGE_MS = 60 * 60 * 1e3;
function inferPackageRootFromEntrypoint(entrypoint, platform = process.platform) {
  if (!entrypoint)
    return void 0;
  const pathImplementation = platform === "win32" ? win32 : posix;
  const normalizedEntrypoint = pathImplementation.resolve(entrypoint);
  if (pathImplementation.basename(normalizedEntrypoint).toLowerCase() !== "bin.js") {
    return void 0;
  }
  const distDirectory = pathImplementation.dirname(normalizedEntrypoint);
  if (pathImplementation.basename(distDirectory).toLowerCase() !== "dist")
    return void 0;
  return pathImplementation.dirname(distDirectory);
}
var DEFAULT_PACKAGE_ROOT = inferPackageRootFromEntrypoint(process.argv[1]) ?? MODULE_PACKAGE_ROOT;
var UpdateUsageError = class extends Error {
};
function sanitizeTerminalText(value) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "?");
}
function parseUpdateArguments(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return {
      help: true,
      self: false,
      extensions: false,
      force: false,
      timeoutMs: DEFAULT_UPDATE_TIMEOUT_MS
    };
  }
  let self = false;
  let extensions = false;
  let all = false;
  let force = false;
  let extensionSource;
  let timeoutMs = DEFAULT_UPDATE_TIMEOUT_MS;
  let timeoutSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--self") {
      if (self)
        throw new UpdateUsageError("--self may only be specified once");
      self = true;
      continue;
    }
    if (argument === "--extensions") {
      if (extensions)
        throw new UpdateUsageError("--extensions may only be specified once");
      extensions = true;
      continue;
    }
    if (argument === "--all") {
      if (all)
        throw new UpdateUsageError("--all may only be specified once");
      all = true;
      continue;
    }
    if (argument === "--force") {
      if (force)
        throw new UpdateUsageError("--force may only be specified once");
      force = true;
      continue;
    }
    if (argument === "--timeout" || argument?.startsWith("--timeout=")) {
      if (timeoutSeen)
        throw new UpdateUsageError("--timeout may only be specified once");
      timeoutSeen = true;
      const value = argument === "--timeout" ? args[index + 1] : argument.slice("--timeout=".length);
      if (argument === "--timeout")
        index += 1;
      const seconds = Number(value);
      if (!value || !Number.isSafeInteger(seconds) || seconds < MIN_UPDATE_TIMEOUT_SECONDS || seconds > MAX_UPDATE_TIMEOUT_SECONDS) {
        throw new UpdateUsageError(`--timeout must be an integer from ${MIN_UPDATE_TIMEOUT_SECONDS} to ${MAX_UPDATE_TIMEOUT_SECONDS} seconds`);
      }
      timeoutMs = seconds * 1e3;
      continue;
    }
    if (argument === "--extension" || argument?.startsWith("--extension=")) {
      if (extensionSource !== void 0) {
        throw new UpdateUsageError("--extension may only be specified once");
      }
      const value = argument === "--extension" ? args[index + 1] : argument.slice("--extension=".length);
      if (argument === "--extension")
        index += 1;
      if (!value || value.startsWith("-")) {
        throw new UpdateUsageError("--extension requires a configured package source");
      }
      extensionSource = value;
      continue;
    }
    throw new UpdateUsageError(`unknown option ${argument ?? ""}`.trim());
  }
  if (all && (self || extensions || extensionSource !== void 0)) {
    throw new UpdateUsageError("--all cannot be combined with another update target");
  }
  if (extensionSource !== void 0 && (self || extensions)) {
    throw new UpdateUsageError("--extension cannot be combined with --self or --extensions");
  }
  if (all) {
    self = true;
    extensions = true;
  } else if (!self && !extensions && extensionSource === void 0) {
    self = true;
  }
  if (force && !self) {
    throw new UpdateUsageError("--force requires a harness update target");
  }
  return {
    help: false,
    self,
    extensions: extensions || extensionSource !== void 0,
    ...extensionSource === void 0 ? {} : { extensionSource },
    force,
    timeoutMs
  };
}
function parseSemanticVersion(value) {
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match)
    throw new Error(`invalid semantic version: ${value}`);
  const core = match.slice(1, 4).map((part) => Number(part));
  if (core.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`semantic version component is too large: ${value}`);
  }
  const prerelease = match[4] ? match[4].split(".").map((part) => {
    if (/^\d+$/.test(part)) {
      if (part.length > 1 && part.startsWith("0")) {
        throw new Error(`invalid semantic version prerelease: ${value}`);
      }
      const numeric = Number(part);
      if (!Number.isSafeInteger(numeric)) {
        throw new Error(`semantic version prerelease is too large: ${value}`);
      }
      return numeric;
    }
    return part;
  }) : [];
  return {
    major: core[0] ?? 0,
    minor: core[1] ?? 0,
    patch: core[2] ?? 0,
    prerelease
  };
}
function compareSemanticVersions(leftValue, rightValue) {
  const left = parseSemanticVersion(leftValue);
  const right = parseSemanticVersion(rightValue);
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key])
      return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length)
      return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const count = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === void 0 || rightPart === void 0) {
      if (leftPart === rightPart)
        return 0;
      return leftPart === void 0 ? -1 : 1;
    }
    if (leftPart === rightPart)
      continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart < rightPart ? -1 : 1;
    }
    if (typeof leftPart === "number")
      return -1;
    if (typeof rightPart === "number")
      return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}
function isOfflineModeEnabled(env) {
  const value = env.PI_OFFLINE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function packageRootMatches(left, right, platform) {
  return platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function inferGlobalInstallPrefix(packageRoot, platform = process.platform) {
  const pathImplementation = platform === "win32" ? win32 : posix;
  const normalizedRoot = pathImplementation.resolve(packageRoot);
  const parentCount = platform === "win32" ? 3 : 4;
  let prefix = normalizedRoot;
  for (let index = 0; index < parentCount; index += 1)
    prefix = pathImplementation.dirname(prefix);
  const expectedRoot = platform === "win32" ? pathImplementation.join(prefix, "node_modules", "@qloo", "qloo-harness") : pathImplementation.join(prefix, "lib", "node_modules", "@qloo", "qloo-harness");
  return packageRootMatches(normalizedRoot, expectedRoot, platform) ? prefix : void 0;
}
function absoluteConfiguredPath(value, platform) {
  const configured = value?.trim();
  if (!configured)
    return void 0;
  const pathImplementation = platform === "win32" ? win32 : posix;
  return pathImplementation.isAbsolute(configured) ? pathImplementation.resolve(configured) : void 0;
}
function inferGlobalInstall(packageRoot, platform = process.platform, env = process.env) {
  const pathImplementation = platform === "win32" ? win32 : posix;
  const normalizedRoot = pathImplementation.resolve(packageRoot);
  const scopeRoot = pathImplementation.dirname(normalizedRoot);
  const nodeModulesRoot = pathImplementation.dirname(scopeRoot);
  const isolatedInstallRoot = pathImplementation.dirname(nodeModulesRoot);
  const versionRoot = pathImplementation.dirname(isolatedInstallRoot);
  const globalDir = pathImplementation.dirname(versionRoot);
  const versionLabel = pathImplementation.basename(versionRoot);
  const pnpmLayoutVersion = /^v(\d+)$/u.exec(versionLabel);
  const expectedRoot = pathImplementation.join(isolatedInstallRoot, "node_modules", "@qloo", "qloo-harness");
  const pnpmLayout = pathImplementation.basename(scopeRoot) !== "@qloo" || pathImplementation.basename(nodeModulesRoot) !== "node_modules" || !packageRootMatches(normalizedRoot, expectedRoot, platform) || !pnpmLayoutVersion || Number(pnpmLayoutVersion[1]) < 11 ? void 0 : pnpmLayoutVersion;
  if (pnpmLayout) {
    const configuredBinDir = absoluteConfiguredPath(env.PNPM_CONFIG_GLOBAL_BIN_DIR, platform);
    const pnpmHome = absoluteConfiguredPath(env.PNPM_HOME, platform);
    const conventionalHome = pathImplementation.basename(globalDir) === "global" ? pathImplementation.dirname(globalDir) : void 0;
    const globalBinDir = configuredBinDir ?? (pnpmHome ? pathImplementation.join(pnpmHome, "bin") : void 0) ?? (conventionalHome ? pathImplementation.join(conventionalHome, "bin") : void 0);
    if (!globalBinDir)
      return void 0;
    return {
      packageManager: "pnpm",
      globalDir,
      globalBinDir,
      lockDirectory: globalDir
    };
  }
  const npmPrefix = inferGlobalInstallPrefix(packageRoot, platform);
  return npmPrefix ? {
    packageManager: "npm",
    prefix: npmPrefix,
    globalBinDir: platform === "win32" ? npmPrefix : pathImplementation.join(npmPrefix, "bin"),
    lockDirectory: npmPrefix
  } : void 0;
}
function parseTarString(data, offset, length) {
  const end = data.indexOf(0, offset);
  const boundedEnd = end === -1 || end > offset + length ? offset + length : end;
  return data.subarray(offset, boundedEnd).toString("utf8").trim();
}
function parseTarSize(data, offset) {
  const raw = parseTarString(data, offset, 12).replace(/\s+$/g, "");
  if (!/^[0-7]+$/.test(raw))
    throw new Error("artifact contains an invalid tar entry size");
  const size = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("artifact contains an unsupported tar entry size");
  }
  return size;
}
async function readArtifactManifest(archivePath) {
  const archiveStats = await stat(archivePath);
  if (!archiveStats.isFile())
    throw new Error("QLOO_UPDATE_SPEC must point to a .tgz file");
  if (archiveStats.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`update artifact exceeds the ${MAX_ARCHIVE_BYTES}-byte safety limit`);
  }
  const compressed = await readFile(archivePath);
  const archive = gunzipSync(compressed, { maxOutputLength: MAX_EXPANDED_ARCHIVE_BYTES });
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0))
      break;
    const name = parseTarString(header, 0, 100);
    const prefix = parseTarString(header, 345, 155);
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const entrySize = parseTarSize(header, 124);
    const contentStart = offset + 512;
    const contentEnd = contentStart + entrySize;
    if (contentEnd > archive.length)
      throw new Error("update artifact is truncated");
    if (entryPath === "package/package.json") {
      if (entrySize > MAX_MANIFEST_BYTES)
        throw new Error("update artifact manifest is too large");
      const parsed = JSON.parse(archive.subarray(contentStart, contentEnd).toString("utf8"));
      if (!parsed || typeof parsed !== "object")
        throw new Error("update artifact manifest is invalid");
      const manifest = parsed;
      if (manifest.name !== QLOO_HARNESS_PACKAGE_NAME || typeof manifest.version !== "string") {
        throw new Error(`update artifact must contain ${QLOO_HARNESS_PACKAGE_NAME}`);
      }
      parseSemanticVersion(manifest.version);
      return { name: manifest.name, version: manifest.version };
    }
    offset = contentStart + Math.ceil(entrySize / 512) * 512;
  }
  throw new Error("update artifact does not contain package/package.json");
}
async function runExternalCommand(request) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: { ...request.env },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeout;
    let heartbeat;
    let forceKill;
    let finalFallback;
    const appendBounded = (current, text) => {
      const combined = current + text;
      return combined.length <= MAX_CAPTURED_COMMAND_BYTES ? combined : combined.slice(-MAX_CAPTURED_COMMAND_BYTES);
    };
    const clearTimers = () => {
      if (timeout)
        clearTimeout(timeout);
      if (heartbeat)
        clearInterval(heartbeat);
      if (forceKill)
        clearTimeout(forceKill);
      if (finalFallback)
        clearTimeout(finalFallback);
    };
    const finish = (result) => {
      if (settled)
        return;
      settled = true;
      clearTimers();
      resolveResult({ ...result, durationMs: Date.now() - startedAt });
    };
    const terminate = (signal) => {
      try {
        if (process.platform !== "win32" && child.pid !== void 0) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        child.kill(signal);
      }
    };
    if (request.heartbeatMs && request.heartbeatMs > 0) {
      heartbeat = setInterval(() => {
        const description = request.description ?? request.command;
        request.writeOut(`Still ${sanitizeTerminalText(description)} (${Math.round((Date.now() - startedAt) / 1e3)}s elapsed)...
`);
      }, request.heartbeatMs);
      heartbeat.unref?.();
    }
    if (request.timeoutMs && request.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        const description = request.description ?? request.command;
        request.writeError(`${sanitizeTerminalText(description)} exceeded ${Math.max(1, Math.ceil(request.timeoutMs / 1e3))}s; terminating it.
`);
        terminate("SIGTERM");
        forceKill = setTimeout(() => terminate("SIGKILL"), 2e3);
        forceKill.unref?.();
        finalFallback = setTimeout(() => finish({
          exitCode: null,
          signal: "SIGKILL",
          stdout,
          stderr,
          timedOut: true
        }), 5e3);
        finalFallback.unref?.();
      }, request.timeoutMs);
      timeout.unref?.();
    }
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout = appendBounded(stdout, text);
      if (request.streamOutput)
        request.writeOut(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = appendBounded(stderr, text);
      if (request.streamOutput)
        request.writeError(text);
    });
    child.once("error", (error) => {
      finish({ exitCode: null, signal: null, stdout, stderr, error, ...timedOut ? { timedOut } : {} });
    });
    child.once("close", (exitCode, signal) => {
      finish({ exitCode, signal, stdout, stderr, ...timedOut ? { timedOut } : {} });
    });
  });
}
function parseRegistryVersion(stdout, packageManager) {
  const parsed = JSON.parse(stdout.trim());
  if (typeof parsed !== "string") {
    throw new Error(`${packageManager} returned an unexpected version response`);
  }
  parseSemanticVersion(parsed);
  return parsed;
}
async function resolveUpdateTarget(options, install) {
  const metadataTimeoutMs = Math.min(options.timeoutMs, 3e4);
  const packageManager = install.packageManager;
  const packageManagerCommand2 = packageManager === "pnpm" ? options.pnpmCommand : options.npmCommand;
  const commandCwd = packageManager === "pnpm" ? tmpdir() : options.cwd;
  const configuredSpec = options.env[QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE];
  if (configuredSpec !== void 0) {
    const spec = configuredSpec.trim();
    if (!spec)
      throw new Error(`${QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE} cannot be empty`);
    const pathImplementation = options.platform === "win32" ? win32 : posix;
    if (pathImplementation.isAbsolute(spec)) {
      if (!spec.toLowerCase().endsWith(".tgz")) {
        throw new Error(`${QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE} local paths must end in .tgz`);
      }
      const manifest = await readArtifactManifest(spec);
      return { installSpec: spec, version: manifest.version, localArtifact: true };
    }
    const escapedPackageName = QLOO_HARNESS_PACKAGE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const allowedRegistrySpec = new RegExp(`^${escapedPackageName}@[A-Za-z0-9][A-Za-z0-9._+-]*$`);
    if (!allowedRegistrySpec.test(spec)) {
      throw new Error(`${QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE} must be an absolute .tgz path or ${QLOO_HARNESS_PACKAGE_NAME}@<tag-or-version>`);
    }
    if (isOfflineModeEnabled(options.env)) {
      throw new Error("PI_OFFLINE is enabled; a registry update cannot run offline");
    }
    const result2 = await options.runCommand({
      command: packageManagerCommand2,
      args: ["view", spec, "version", "--json"],
      cwd: commandCwd,
      env: options.env,
      streamOutput: false,
      writeOut: options.writeOut,
      writeError: options.writeError,
      timeoutMs: metadataTimeoutMs,
      description: "checking the Qloo update channel"
    });
    if (result2.exitCode !== 0) {
      throw new Error(`unable to resolve ${spec} (${packageManager} exited with status ${result2.exitCode ?? "unknown"})`);
    }
    return {
      installSpec: spec,
      version: parseRegistryVersion(result2.stdout, packageManager),
      localArtifact: false
    };
  }
  if (isOfflineModeEnabled(options.env)) {
    throw new Error("PI_OFFLINE is enabled; the Qloo release channel cannot be checked offline");
  }
  const defaultSpec = `${QLOO_HARNESS_PACKAGE_NAME}@latest`;
  const result = await options.runCommand({
    command: packageManagerCommand2,
    args: ["view", defaultSpec, "version", "--json"],
    cwd: commandCwd,
    env: options.env,
    streamOutput: false,
    writeOut: options.writeOut,
    writeError: options.writeError,
    timeoutMs: metadataTimeoutMs,
    description: "checking the Qloo update channel"
  });
  if (result.exitCode !== 0) {
    throw new Error(`the Qloo npm registry channel is not available (${packageManager} exited with status ${result.exitCode ?? "unknown"}). For an approved local artifact, set ${QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE} to its absolute .tgz path`);
  }
  return {
    installSpec: defaultSpec,
    version: parseRegistryVersion(result.stdout, packageManager),
    localArtifact: false
  };
}
function globalPackageRoot(prefix, platform) {
  const pathImplementation = platform === "win32" ? win32 : posix;
  return platform === "win32" ? pathImplementation.join(prefix, "node_modules", "@qloo", "qloo-harness") : pathImplementation.join(prefix, "lib", "node_modules", "@qloo", "qloo-harness");
}
function npmInstallArguments(prefix, installSpec) {
  return [
    "install",
    "--global",
    "--prefix",
    prefix,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--color=false",
    "--package-lock=false",
    installSpec
  ];
}
function pnpmInstallArguments(installSpec) {
  return [
    "add",
    "--global",
    "--ignore-scripts",
    "--reporter=append-only",
    installSpec
  ];
}
function packageManagerCommand(install, options) {
  return install.packageManager === "pnpm" ? options.pnpmCommand : options.npmCommand;
}
function installArguments(install, installSpec) {
  return install.packageManager === "pnpm" ? pnpmInstallArguments(installSpec) : npmInstallArguments(install.prefix, installSpec);
}
function qlooBinaryPath(install, platform) {
  const pathImplementation = platform === "win32" ? win32 : posix;
  return pathImplementation.join(install.globalBinDir, platform === "win32" ? "qloo.cmd" : "qloo");
}
function installEnvironment(install, env, platform) {
  const configured = { ...env, NO_COLOR: "1" };
  if (install.packageManager !== "pnpm")
    return configured;
  const pathImplementation = platform === "win32" ? win32 : posix;
  const pathKey = platform === "win32" ? Object.keys(configured).find((key) => key.toLowerCase() === "path") ?? "Path" : "PATH";
  const existingPath = configured[pathKey]?.trim();
  configured.PNPM_HOME = pathImplementation.dirname(install.globalBinDir);
  configured.PNPM_CONFIG_GLOBAL_DIR = install.globalDir;
  configured.PNPM_CONFIG_GLOBAL_BIN_DIR = install.globalBinDir;
  configured[pathKey] = existingPath ? `${install.globalBinDir}${platform === "win32" ? ";" : ":"}${existingPath}` : install.globalBinDir;
  return configured;
}
function stagingInstall(active, stagingRoot, platform) {
  const pathImplementation = platform === "win32" ? win32 : posix;
  if (active.packageManager === "npm") {
    return {
      packageManager: "npm",
      prefix: stagingRoot,
      globalBinDir: platform === "win32" ? stagingRoot : pathImplementation.join(stagingRoot, "bin"),
      lockDirectory: stagingRoot
    };
  }
  return {
    packageManager: "pnpm",
    globalDir: pathImplementation.join(stagingRoot, "global"),
    globalBinDir: pathImplementation.join(stagingRoot, "bin"),
    lockDirectory: pathImplementation.join(stagingRoot, "global")
  };
}
async function installedVersion(packageRoot) {
  const installedManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  return installedManifest && typeof installedManifest === "object" ? installedManifest.version : void 0;
}
function installFailureMessage(packageManager, phase, result) {
  if (result.timedOut) {
    return `Qloo update ${phase} timed out after its configured limit; the update process was terminated`;
  }
  const detail = result.error ? `: ${result.error.message}` : "";
  return `${packageManager} could not complete Qloo update ${phase} (status ${result.exitCode ?? "unknown"})${detail}`;
}
function isErrnoException(error, code) {
  return error instanceof Error && error.code === code;
}
function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrnoException(error, "EPERM");
  }
}
async function existingUpdateLockIsActive(lockPath) {
  try {
    const [contents, metadata] = await Promise.all([
      readFile(lockPath, "utf8"),
      stat(lockPath)
    ]);
    try {
      const record = JSON.parse(contents);
      if (typeof record.pid === "number")
        return processIsRunning(record.pid);
    } catch {
    }
    return Date.now() - metadata.mtimeMs <= MAX_UNKNOWN_UPDATE_LOCK_AGE_MS;
  } catch (error) {
    if (isErrnoException(error, "ENOENT"))
      return false;
    throw error;
  }
}
async function acquireQlooUpdateLock(prefix) {
  const lockPath = join(prefix, ".qloo-update.lock");
  const record = {
    pid: process.pid,
    token: randomUUID(),
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 384);
      try {
        await handle.writeFile(`${JSON.stringify(record)}
`, "utf8");
      } catch (error) {
        await handle.close().catch(() => void 0);
        await unlink(lockPath).catch(() => void 0);
        throw error;
      }
      await handle.close();
      return async () => {
        try {
          const current = JSON.parse(await readFile(lockPath, "utf8"));
          if (current.token === record.token)
            await unlink(lockPath);
        } catch (error) {
          if (!isErrnoException(error, "ENOENT"))
            throw error;
        }
      };
    } catch (error) {
      if (!isErrnoException(error, "EEXIST"))
        throw error;
      if (await existingUpdateLockIsActive(lockPath)) {
        throw new Error(`another Qloo update is already running for ${prefix}; wait for it to finish or inspect ${lockPath}`);
      }
      await unlink(lockPath).catch((unlinkError) => {
        if (!isErrnoException(unlinkError, "ENOENT"))
          throw unlinkError;
      });
    }
  }
  throw new Error(`unable to acquire the Qloo update lock at ${lockPath}`);
}
async function updateQlooSelf(options) {
  parseSemanticVersion(options.currentVersion);
  const activeInstall = inferGlobalInstall(options.packageRoot, options.platform, options.env);
  if (!activeInstall) {
    throw new Error("self-update requires a supported global npm or pnpm installation of Qloo; this copy appears to be running from a source checkout or another installer");
  }
  const target = await resolveUpdateTarget(options, activeInstall);
  const comparison = compareSemanticVersions(target.version, options.currentVersion);
  if (comparison === 0 && !options.force) {
    options.writeOut(`Qloo is already up to date (${options.currentVersion}).
`);
    return;
  }
  if (comparison < 0 && !options.force) {
    throw new Error(`refusing to downgrade Qloo from ${options.currentVersion} to ${target.version} without --force`);
  }
  const releaseUpdateLock = await acquireQlooUpdateLock(activeInstall.lockDirectory);
  try {
    const verb = comparison === 0 ? "Reinstalling" : comparison < 0 ? "Downgrading" : "Updating";
    options.writeOut(`${verb} Qloo ${options.currentVersion} -> ${target.version}...
`);
    const stagingRoot = await mkdtemp(join(tmpdir(), "qloo-update-stage-"));
    try {
      const candidateInstall = stagingInstall(activeInstall, stagingRoot, options.platform);
      const managerCommand = packageManagerCommand(activeInstall, options);
      const managerCwd = activeInstall.packageManager === "pnpm" ? stagingRoot : options.cwd;
      options.writeOut("Validating the candidate in an isolated staging prefix...\n");
      const stagedInstall = await options.runCommand({
        command: managerCommand,
        args: installArguments(candidateInstall, target.installSpec),
        cwd: managerCwd,
        env: installEnvironment(candidateInstall, options.env, options.platform),
        streamOutput: false,
        writeOut: options.writeOut,
        writeError: options.writeError,
        timeoutMs: options.timeoutMs,
        heartbeatMs: UPDATE_HEARTBEAT_MS,
        description: "validating the staged Qloo update"
      });
      if (stagedInstall.exitCode !== 0) {
        throw new Error(installFailureMessage(activeInstall.packageManager, "staging", stagedInstall));
      }
      let stagedSmokeCommand;
      let stagedSmokeArguments;
      if (candidateInstall.packageManager === "npm") {
        const stagedPackageRoot = globalPackageRoot(candidateInstall.prefix, options.platform);
        const stagedVersion = await installedVersion(stagedPackageRoot);
        if (stagedVersion !== target.version) {
          throw new Error(`staged Qloo version is ${String(stagedVersion)} instead of ${target.version}`);
        }
        stagedSmokeCommand = process.execPath;
        stagedSmokeArguments = [join(stagedPackageRoot, "dist", "bin.js"), "--version"];
      } else {
        stagedSmokeCommand = qlooBinaryPath(candidateInstall, options.platform);
        stagedSmokeArguments = ["--version"];
      }
      const stagedSmoke = await options.runCommand({
        command: stagedSmokeCommand,
        args: stagedSmokeArguments,
        cwd: managerCwd,
        env: installEnvironment(candidateInstall, options.env, options.platform),
        streamOutput: false,
        writeOut: options.writeOut,
        writeError: options.writeError,
        timeoutMs: Math.min(options.timeoutMs, 15e3),
        description: "checking the staged Qloo executable"
      });
      if (stagedSmoke.exitCode !== 0 || stagedSmoke.stdout.trim() !== target.version) {
        throw new Error("the staged Qloo executable did not pass its version check");
      }
      options.writeOut("Candidate passed staging; activating it in the current global prefix...\n");
      const activation = await options.runCommand({
        command: managerCommand,
        args: installArguments(activeInstall, target.installSpec),
        cwd: managerCwd,
        env: installEnvironment(activeInstall, options.env, options.platform),
        streamOutput: true,
        writeOut: options.writeOut,
        writeError: options.writeError,
        timeoutMs: options.timeoutMs,
        heartbeatMs: UPDATE_HEARTBEAT_MS,
        description: "activating the Qloo update"
      });
      if (activation.exitCode !== 0) {
        throw new Error(`${installFailureMessage(activeInstall.packageManager, "activation", activation)}. The staged candidate passed, but ${activeInstall.packageManager} may have modified the active installation; rerun the same update or reinstall the previous artifact`);
      }
      let activeVersion;
      if (activeInstall.packageManager === "npm") {
        activeVersion = await installedVersion(options.packageRoot);
      } else {
        const activeSmoke = await options.runCommand({
          command: qlooBinaryPath(activeInstall, options.platform),
          args: ["--version"],
          cwd: managerCwd,
          env: installEnvironment(activeInstall, options.env, options.platform),
          streamOutput: false,
          writeOut: options.writeOut,
          writeError: options.writeError,
          timeoutMs: Math.min(options.timeoutMs, 15e3),
          description: "checking the active Qloo executable"
        });
        activeVersion = activeSmoke.exitCode === 0 ? activeSmoke.stdout.trim() : void 0;
      }
      if (activeVersion !== target.version) {
        throw new Error(`${activeInstall.packageManager} completed, but the installed Qloo version is ${String(activeVersion)} instead of ${target.version}`);
      }
    } finally {
      await rm(stagingRoot, { recursive: true, force: true }).catch(() => void 0);
    }
    const completedVerb = comparison === 0 ? "Reinstalled" : comparison < 0 ? "Downgraded" : "Updated";
    options.writeOut(`${completedVerb} Qloo to ${target.version}. Restart any running Qloo sessions.
`);
    if (target.localArtifact) {
      options.writeOut("Installed from the approved local artifact.\n");
    }
  } finally {
    await releaseUpdateLock();
  }
}
function createDefaultExtensionPackageManager(agentDirectory) {
  const storedSettings = SettingsManager.create(agentDirectory, agentDirectory, { projectTrusted: false });
  const settingsErrors = storedSettings.drainErrors().filter(({ scope }) => scope === "global");
  if (settingsErrors.length > 0) {
    throw new Error(`unable to read Qloo extension settings: ${settingsErrors.map(({ error }) => error.message).join("; ")}`);
  }
  const globalSettings = SettingsManager.inMemory(storedSettings.getGlobalSettings(), {
    projectTrusted: false
  });
  return new DefaultPackageManager({
    cwd: agentDirectory,
    agentDir: agentDirectory,
    settingsManager: globalSettings
  });
}
async function updateQlooExtensions(source, options) {
  const paths = resolveQlooPaths({ env: options.env });
  const packageManager = options.createPackageManager(paths.agentDir);
  const configured = packageManager.listConfiguredPackages();
  if (configured.length === 0 && source === void 0) {
    options.writeOut("No Qloo extension packages are configured.\n");
    return;
  }
  if (isOfflineModeEnabled(options.env)) {
    throw new Error("PI_OFFLINE is enabled; Qloo extension packages cannot be updated offline");
  }
  packageManager.setProgressCallback((event) => {
    if (event.type === "start") {
      options.writeOut(`${sanitizeTerminalText(event.message ?? `Updating ${event.source}...`)}
`);
    } else if (event.type === "complete") {
      options.writeOut(`Updated ${sanitizeTerminalText(event.source)}.
`);
    }
  });
  try {
    await packageManager.update(source);
  } finally {
    packageManager.setProgressCallback(void 0);
  }
  if (source) {
    options.writeOut(`Checked Qloo extension package ${sanitizeTerminalText(source)}.
`);
  } else {
    const noun = configured.length === 1 ? "package" : "packages";
    options.writeOut(`Checked ${configured.length} configured Qloo extension ${noun}; pinned and local sources remain unchanged.
`);
  }
}
function defaultWriteOut(text) {
  process.stdout.write(text);
}
function defaultWriteError(text) {
  process.stderr.write(text);
}
async function runQlooUpdate(args, options = {}) {
  const writeOut = options.writeOut ?? defaultWriteOut;
  const writeError = options.writeError ?? defaultWriteError;
  let parsed;
  try {
    parsed = parseUpdateArguments(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`qloo update: ${sanitizeTerminalText(message)}
Run qloo update --help for usage.
`);
    return 2;
  }
  if (parsed.help) {
    writeOut(`${QLOO_UPDATE_HELP}
`);
    return 0;
  }
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? runExternalCommand;
  const createExtensionPackageManager = options.createExtensionPackageManager ?? createDefaultExtensionPackageManager;
  const extensionUpdate = options.extensionUpdate ?? ((source) => updateQlooExtensions(source, {
    env,
    writeOut,
    createPackageManager: createExtensionPackageManager
  }));
  const selfUpdate = options.selfUpdate ?? ((force, timeoutMs) => updateQlooSelf({
    currentVersion: options.currentVersion ?? HARNESS_VERSION,
    packageRoot: options.packageRoot ?? DEFAULT_PACKAGE_ROOT,
    cwd,
    env,
    platform,
    npmCommand: options.npmCommand ?? (platform === "win32" ? "npm.cmd" : "npm"),
    pnpmCommand: options.pnpmCommand ?? (platform === "win32" ? "pnpm.cmd" : "pnpm"),
    force,
    timeoutMs,
    writeOut,
    writeError,
    runCommand
  }));
  try {
    if (parsed.extensions)
      await extensionUpdate(parsed.extensionSource);
    if (parsed.self)
      await selfUpdate(parsed.force, parsed.timeoutMs);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`qloo update: ${sanitizeTerminalText(message)}
`);
    return 1;
  }
}
export {
  QLOO_HARNESS_PACKAGE_NAME,
  QLOO_UPDATE_HELP,
  QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE,
  acquireQlooUpdateLock,
  inferGlobalInstall,
  inferGlobalInstallPrefix,
  inferPackageRootFromEntrypoint,
  runExternalCommand,
  runQlooUpdate
};
