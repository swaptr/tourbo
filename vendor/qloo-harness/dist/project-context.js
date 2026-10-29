import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/project-context.js
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { Type } from "typebox";
var QLOO_PROJECT_CONTEXT_SCHEMA_VERSION = "1.1";
var MAX_MANIFEST_BYTES = 256 * 1024;
var CANDIDATE_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "pyproject.toml",
  "requirements.txt",
  "uv.lock",
  "poetry.lock",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "serverless.yml",
  "serverless.yaml"
];
var CANDIDATE_MARKER_FILES = [".env.example"];
var CANDIDATE_SOURCE_ROOTS = [
  "app",
  "apps",
  "cmd",
  "infra",
  "lib",
  "packages",
  "src",
  "test",
  "tests"
];
var FRAMEWORK_NAMES = [
  "@aws-sdk",
  "@modelcontextprotocol",
  "angular",
  "aws-cdk",
  "django",
  "express",
  "fastapi",
  "fastify",
  "flask",
  "hono",
  "nestjs",
  "next",
  "react",
  "serverless",
  "svelte",
  "terraform",
  "vue"
];
var CAPABILITY_DEPENDENCIES = {
  http_clients: [
    "aiohttp",
    "axios",
    "got",
    "httpx",
    "node-fetch",
    "requests",
    "undici"
  ],
  data_modeling: [
    "@sinclair/typebox",
    "mongoose",
    "prisma",
    "pydantic",
    "sqlalchemy",
    "typebox",
    "zod"
  ],
  configuration: [
    "config",
    "dotenv",
    "dynaconf",
    "pydantic-settings"
  ],
  test_frameworks: [
    "ava",
    "jest",
    "mocha",
    "playwright",
    "pytest",
    "vitest"
  ]
};
async function readCandidate(cwd, name) {
  const path = join(cwd, name);
  try {
    const linkMetadata = await lstat(path);
    if (!linkMetadata.isFile() || linkMetadata.isSymbolicLink())
      return void 0;
    const metadata = linkMetadata;
    if (metadata.size > MAX_MANIFEST_BYTES) {
      return {
        name,
        size: metadata.size,
        modifiedMs: metadata.mtimeMs,
        content: ""
      };
    }
    return {
      name,
      size: metadata.size,
      modifiedMs: metadata.mtimeMs,
      content: await readFile(path, "utf8")
    };
  } catch {
    return void 0;
  }
}
async function readMarker(cwd, name, kind) {
  try {
    const metadata = await lstat(join(cwd, name));
    if (metadata.isSymbolicLink())
      return void 0;
    if (kind === "file" ? !metadata.isFile() : !metadata.isDirectory())
      return void 0;
    return { name, kind, modifiedMs: metadata.mtimeMs };
  } catch {
    return void 0;
  }
}
function sorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
function packageMetadata(packageJson) {
  try {
    const parsed = JSON.parse(packageJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { dependencies: [], scripts: [], scriptCommands: {} };
    }
    const manifest = parsed;
    const dependencies = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies"
    ].flatMap((key) => {
      const value = manifest[key];
      return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
    });
    const scriptValue = manifest.scripts;
    const scriptCommands = scriptValue && typeof scriptValue === "object" && !Array.isArray(scriptValue) ? Object.fromEntries(Object.entries(scriptValue).filter((entry) => typeof entry[1] === "string")) : {};
    return {
      dependencies,
      scripts: Object.keys(scriptCommands),
      scriptCommands
    };
  } catch {
    return { dependencies: [], scripts: [], scriptCommands: {} };
  }
}
function pythonDependencyNames(files) {
  const content = files.filter(({ name }) => name === "pyproject.toml" || name === "requirements.txt").map(({ content: value }) => value).join("\n").toLocaleLowerCase("en-US");
  const known = [
    ...FRAMEWORK_NAMES,
    ...Object.values(CAPABILITY_DEPENDENCIES).flat(),
    "qloo",
    "qloo-client",
    "qloo-mcp"
  ];
  return sorted(known.filter((name) => {
    const normalized = name.toLocaleLowerCase("en-US");
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(^|[^a-z0-9_.-])${escaped}([^a-z0-9_.-]|$)`, "u").test(content);
  }));
}
function detectedCapabilities(names, capability) {
  const normalized = new Set(names.map((name) => name.toLocaleLowerCase("en-US")));
  return sorted(CAPABILITY_DEPENDENCIES[capability].filter((name) => normalized.has(name)));
}
function verificationCommands(packageManager, metadata) {
  const relevant = metadata.scripts.filter((name) => /^(?:build|check|lint|test|typecheck)(?::[a-z0-9:_-]+)?$/u.test(name));
  const prefix = packageManager === "pnpm" ? "pnpm" : packageManager === "Yarn" ? "yarn" : packageManager === "Bun" ? "bun run" : "npm run";
  const packageCommands = relevant.map((name) => packageManager === "npm" && name === "test" ? "npm test" : `${prefix} ${name}`);
  const scriptBodies = Object.values(metadata.scriptCommands).join("\n").toLocaleLowerCase("en-US");
  const inferred = [
    scriptBodies.includes("node --test") ? "Node test runner" : void 0,
    scriptBodies.includes("tsc ") || scriptBodies.startsWith("tsc") ? "TypeScript compiler" : void 0
  ].filter((value) => value !== void 0);
  return sorted([...packageCommands, ...inferred]);
}
function packageProjectName(packageJson) {
  try {
    const parsed = JSON.parse(packageJson);
    const name = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Reflect.get(parsed, "name") : void 0;
    return typeof name === "string" && name.trim() ? name.trim() : void 0;
  } catch {
    return void 0;
  }
}
function pythonProjectName(pyproject) {
  const match = pyproject.match(/^name\s*=\s*["']([^"']+)["']/mu);
  return match?.[1]?.trim() || void 0;
}
function detectContext(cwd, files, markers, now) {
  const byName = new Map(files.map((file) => [file.name, file]));
  const markerFiles = markers.filter(({ kind }) => kind === "file");
  const sourceRoots = markers.filter(({ kind }) => kind === "directory").map(({ name }) => name);
  const detectedNames = sorted([
    ...files.map(({ name }) => name),
    ...markerFiles.map(({ name }) => name)
  ]);
  const languages = /* @__PURE__ */ new Set();
  const packageManagers = /* @__PURE__ */ new Set();
  const infrastructure = /* @__PURE__ */ new Set();
  if (byName.has("package.json"))
    languages.add("JavaScript/TypeScript");
  if (byName.has("package-lock.json"))
    packageManagers.add("npm");
  if (byName.has("pnpm-lock.yaml"))
    packageManagers.add("pnpm");
  if (byName.has("yarn.lock"))
    packageManagers.add("Yarn");
  if (byName.has("bun.lock"))
    packageManagers.add("Bun");
  if (byName.has("pyproject.toml") || byName.has("requirements.txt"))
    languages.add("Python");
  if (byName.has("uv.lock"))
    packageManagers.add("uv");
  if (byName.has("poetry.lock"))
    packageManagers.add("Poetry");
  if (byName.has("go.mod"))
    languages.add("Go");
  if (byName.has("Cargo.toml"))
    languages.add("Rust");
  if (byName.has("pom.xml") || byName.has("build.gradle") || byName.has("build.gradle.kts")) {
    languages.add("JVM");
  }
  if (detectedNames.some((name) => name === "Dockerfile" || name.includes("compose"))) {
    infrastructure.add("Docker");
  }
  if (detectedNames.some((name) => name.startsWith("serverless."))) {
    infrastructure.add("Serverless Framework");
  }
  const packageContent = byName.get("package.json")?.content ?? "";
  const packageInfo = packageMetadata(packageContent);
  const pythonDependencies = pythonDependencyNames(files);
  const dependencies = sorted([...packageInfo.dependencies, ...pythonDependencies]);
  const searchable = `${dependencies.join("\n")}
${files.map(({ content }) => content).join("\n")}`.toLocaleLowerCase("en-US");
  const frameworks = FRAMEWORK_NAMES.filter((name) => searchable.includes(name));
  const qlooDependencies = sorted(dependencies.filter((name) => name.toLowerCase().includes("qloo")));
  const httpClients = detectedCapabilities(dependencies, "http_clients");
  const dataModeling = detectedCapabilities(dependencies, "data_modeling");
  const testFrameworks = detectedCapabilities(dependencies, "test_frameworks");
  const configuration = detectedCapabilities(dependencies, "configuration");
  if (markerFiles.some(({ name }) => name === ".env.example")) {
    configuration.push("environment template");
  }
  const jsPackageManager = packageManagers.has("pnpm") ? "pnpm" : packageManagers.has("Yarn") ? "Yarn" : packageManagers.has("Bun") ? "Bun" : packageManagers.has("npm") ? "npm" : void 0;
  const verificationScripts = verificationCommands(jsPackageManager, packageInfo);
  if (testFrameworks.includes("pytest"))
    verificationScripts.push("pytest");
  const fingerprint = createHash("sha256").update([
    ...files.map(({ name, size, modifiedMs }) => `file:${name}:${size}:${modifiedMs}`),
    ...markers.map(({ kind, name, modifiedMs }) => `${kind}:${name}:${modifiedMs}`)
  ].join("\n")).digest("hex");
  const projectName = packageProjectName(packageContent) ?? pythonProjectName(byName.get("pyproject.toml")?.content ?? "") ?? basename(cwd);
  return {
    schema_version: QLOO_PROJECT_CONTEXT_SCHEMA_VERSION,
    project_name: projectName,
    project_root: cwd,
    fingerprint,
    generated_at: now.toISOString(),
    languages: sorted(languages),
    package_managers: sorted(packageManagers),
    frameworks: sorted(frameworks),
    infrastructure: sorted(infrastructure),
    source_roots: sorted(sourceRoots),
    http_clients: httpClients,
    data_modeling: dataModeling,
    configuration: sorted(configuration),
    test_frameworks: testFrameworks,
    verification_scripts: sorted(verificationScripts),
    qloo_dependencies: qlooDependencies,
    detected_files: detectedNames
  };
}
async function readCachedContext(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Reflect.get(parsed, "schema_version") !== QLOO_PROJECT_CONTEXT_SCHEMA_VERSION)
      return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
async function writeCachedContext(path, context) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 448 });
  await writeFile(temporaryPath, `${JSON.stringify(context, null, 2)}
`, {
    encoding: "utf8",
    mode: 384
  });
  await rename(temporaryPath, path);
}
async function inspectProjectContext(options) {
  const cwd = resolve(options.cwd);
  const candidates = (await Promise.all(CANDIDATE_FILES.map((name) => readCandidate(cwd, name)))).filter((value) => value !== void 0);
  const markers = (await Promise.all([
    ...CANDIDATE_MARKER_FILES.map((name) => readMarker(cwd, name, "file")),
    ...CANDIDATE_SOURCE_ROOTS.map((name) => readMarker(cwd, name, "directory"))
  ])).filter((value) => value !== void 0);
  const detected = detectContext(cwd, candidates, markers, (options.now ?? (() => /* @__PURE__ */ new Date()))());
  if (!options.refresh) {
    const cached = await readCachedContext(options.paths.projectContextFile);
    if (cached?.project_root === cwd && cached.fingerprint === detected.fingerprint) {
      return { cache: "hit", context: cached };
    }
  }
  await writeCachedContext(options.paths.projectContextFile, detected);
  return { cache: "refreshed", context: detected };
}
function createProjectContextTool(options) {
  const parameters = Type.Object({
    refresh: Type.Optional(Type.Boolean({ default: false }))
  }, { additionalProperties: false });
  const tool = {
    name: "qloo_project_context",
    label: "Qloo project context",
    description: "Inspect bounded, non-secret project manifests and structural markers to identify integration boundaries, HTTP clients, data modeling, configuration, and verification commands without reading application source or environment values.",
    promptSnippet: "Inspect the current project's integration context",
    promptGuidelines: [
      "Use this once near the start of an integration or planning request.",
      "Use the result to map local domain inputs to Qloo signals and filters, then map normalized Qloo results and errors back to the project's data model and HTTP boundary.",
      "Treat source_roots as locations to inspect with read-only workspace tools; this tool deliberately does not read their contents.",
      "Use refresh only after relevant project manifests changed."
    ],
    parameters,
    async execute(_toolCallId, params) {
      const result = await inspectProjectContext({
        cwd: options.cwd,
        paths: options.paths,
        refresh: params.refresh ?? false
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result
      };
    }
  };
  return tool;
}
export {
  QLOO_PROJECT_CONTEXT_SCHEMA_VERSION,
  createProjectContextTool,
  inspectProjectContext
};
