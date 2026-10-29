import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/workspace-scope.js
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
var WORKSPACE_SCOPED_PROFILES = /* @__PURE__ */ new Set(["explore", "plan"]);
var WORKSPACE_SCOPED_TOOL_NAMES = /* @__PURE__ */ new Set(["read", "grep", "find", "ls"]);
var UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/gu;
var ALLOWED = Object.freeze({ allowed: true });
var blocked = (reason) => ({ allowed: false, reason });
function isWorkspaceScopedCall(profile, toolName) {
  return WORKSPACE_SCOPED_PROFILES.has(profile) && WORKSPACE_SCOPED_TOOL_NAMES.has(toolName);
}
function windowsShellPath(path) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    return path;
  const match = /^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/iu.exec(path);
  if (!match)
    return path;
  const [, drive = "", suffix = ""] = match;
  return `${drive.toUpperCase()}:\\${suffix.replaceAll("/", "\\")}`;
}
function readPathCandidates(resolved) {
  const nfd = resolved.normalize("NFD");
  const curly = (path) => path.replaceAll("'", "\u2019");
  return [.../* @__PURE__ */ new Set([
    resolved,
    resolved.replace(/ (AM|PM)\./giu, "\u202F$1."),
    nfd,
    curly(resolved),
    curly(nfd)
  ])];
}
function resolveRequestedToolPath(requested, cwd, homeDirectory, platform = process.platform) {
  if (requested === void 0)
    return resolve(cwd);
  const spaced = requested.replace(UNICODE_SPACES, " ");
  const unprefixedPath = spaced.startsWith("@") ? spaced.slice(1) : spaced;
  const unprefixed = platform === "win32" ? windowsShellPath(unprefixedPath) : unprefixedPath;
  const expanded = unprefixed === "~" ? homeDirectory : unprefixed.startsWith("~/") || unprefixed.startsWith("~\\") ? join(homeDirectory, unprefixed.slice(2)) : unprefixed.startsWith("file://") ? fileURLToPath(unprefixed) : unprefixed;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}
async function canonicalPath(candidate) {
  try {
    return await realpath(candidate);
  } catch {
    const parent = dirname(candidate);
    return parent === candidate ? candidate : join(await canonicalPath(parent), basename(candidate));
  }
}
var isSameOrInside = (directory, candidate) => {
  const path = relative(directory, candidate);
  return path === "" || path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
async function checkWorkspaceScope(requested, scope) {
  const resolved = resolveRequestedToolPath(requested, scope.cwd, scope.homeDirectory);
  const [workspace, home, targets, protectedDirectories] = await Promise.all([
    canonicalPath(resolve(scope.cwd)),
    canonicalPath(resolve(scope.homeDirectory)),
    Promise.all(readPathCandidates(resolved).map(canonicalPath)),
    Promise.all(scope.protectedDirectories.map((directory) => canonicalPath(resolve(directory))))
  ]);
  if (isSameOrInside(workspace, home) || workspace === parse(workspace).root) {
    return blocked("Workspace files are unavailable because Qloo started in your home folder, above it, or at the file system root. Start qloo in a project folder.");
  }
  if (!targets.every((target) => isSameOrInside(workspace, target))) {
    return blocked("That path is outside the folder Qloo started in. Read-only profiles can use only files inside that folder.");
  }
  if (targets.some((target) => protectedDirectories.some((directory) => isSameOrInside(directory, target) || isSameOrInside(target, directory)))) {
    return blocked("That path contains private Qloo state, which workspace tools cannot read.");
  }
  return ALLOWED;
}
export {
  checkWorkspaceScope,
  isWorkspaceScopedCall,
  readPathCandidates,
  resolveRequestedToolPath,
  windowsShellPath
};
