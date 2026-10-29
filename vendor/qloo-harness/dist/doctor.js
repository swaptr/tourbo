import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QLOO_PRODUCTION_BASE_URL,
  probeQlooConnectivity,
  resolveQlooClientConfiguration
} from "./chunks/chunk-ESNY4EJL.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/doctor.js
import { access, stat } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import { resolveQlooPaths } from "./paths.js";
import { inspectQlooResolutionProviderConfiguration, probeTasteResolverHealth } from "./resolution-provider.js";
var PROVIDER_ENVIRONMENT_VARIABLES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY"
];
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeEndpointLabel(value) {
  try {
    const endpoint = new URL(value);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      return "the configured custom endpoint";
    }
    return endpoint.toString();
  } catch {
    return "the configured custom endpoint";
  }
}
function isUsablePiCredential(value) {
  if (!isRecord(value))
    return false;
  if (value.type === "api_key") {
    if (nonEmptyString(value.key))
      return true;
    if (!isRecord(value.env))
      return false;
    const environmentValues = Object.values(value.env);
    return environmentValues.length > 0 && environmentValues.every(nonEmptyString);
  }
  return value.type === "oauth" && nonEmptyString(value.access) && nonEmptyString(value.refresh) && typeof value.expires === "number" && Number.isFinite(value.expires);
}
function inspectPiAuthFile(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { status: "invalid" };
  }
  if (!isRecord(parsed))
    return { status: "invalid" };
  const entries = Object.entries(parsed);
  if (entries.length === 0)
    return { status: "empty" };
  const credentialCount = entries.filter(([provider, credential]) => provider.trim().length > 0 && isUsablePiCredential(credential)).length;
  return credentialCount > 0 ? { status: "usable", credentialCount } : { status: "invalid" };
}
async function defaultFileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
async function defaultDirectoryMode(path) {
  try {
    return (await stat(path)).mode & 511;
  } catch {
    return void 0;
  }
}
async function runDoctor(options) {
  const env = options.env ?? process.env;
  const paths = options.paths ?? resolveQlooPaths({ env });
  const fileExists = options.fileExists ?? defaultFileExists;
  const directoryMode = options.directoryMode ?? defaultDirectoryMode;
  const fileMode = options.fileMode ?? defaultDirectoryMode;
  const readAuthFile = options.readAuthFile ?? ((path) => readFileSync(path, "utf8"));
  const checks = [];
  const qlooConfiguration = resolveQlooClientConfiguration({
    env,
    configPath: paths.configFile,
    ...options.readConfigFile ? { readFile: options.readConfigFile } : {}
  });
  checks.push(qlooConfiguration.apiKeySource !== "missing" ? {
    id: "qloo-auth",
    status: "ok",
    message: qlooConfiguration.apiKeySource === "environment" ? "Qloo API credential is present in the environment." : `Qloo API credential is configured in ${paths.configFile}.`
  } : {
    id: "qloo-auth",
    status: "warning",
    message: "Qloo API credential is missing. Run `qloo setup` for guided configuration, or set QLOO_API_KEY to use live Qloo tools."
  });
  const effectiveBaseUrl = qlooConfiguration.baseUrl ?? QLOO_PRODUCTION_BASE_URL;
  const endpointLabel = safeEndpointLabel(effectiveBaseUrl);
  checks.push(qlooConfiguration.baseUrlTrusted ? {
    id: "qloo-endpoint-trust",
    status: "ok",
    message: qlooConfiguration.baseUrlTrustSource === "official" ? `Qloo API endpoint is official: ${endpointLabel}` : `Qloo API endpoint is explicitly trusted via ${qlooConfiguration.baseUrlTrustSource === "environment" ? "QLOO_TRUSTED_BASE_URL" : paths.configFile}: ${endpointLabel}`
  } : {
    id: "qloo-endpoint-trust",
    status: "warning",
    message: `Custom Qloo API endpoint ${endpointLabel} is not trusted. Run \`qloo config set base-url <url>\` or set QLOO_TRUSTED_BASE_URL to the exact endpoint.`
  });
  const resolutionConfiguration = inspectQlooResolutionProviderConfiguration({
    env,
    fileConfig: qlooConfiguration.fileConfig
  });
  checks.push({
    id: "qloo-resolution",
    status: resolutionConfiguration.valid ? "ok" : "warning",
    message: resolutionConfiguration.valid ? resolutionConfiguration.message : `${resolutionConfiguration.message} ${resolutionConfiguration.recovery ?? "Correct the resolver configuration."}`
  });
  if (options.network) {
    const networkProbe = options.networkProbe ?? probeQlooConnectivity;
    const probe = await networkProbe({
      ...qlooConfiguration.apiKey ? { apiKey: qlooConfiguration.apiKey } : {},
      baseUrl: effectiveBaseUrl,
      allowCustomBaseUrl: qlooConfiguration.baseUrlTrusted,
      timeoutMs: options.networkTimeoutMs ?? 5e3
    });
    checks.push({
      id: "qloo-network",
      status: probe.ok ? "ok" : "warning",
      message: probe.message,
      category: probe.kind,
      durationMs: probe.durationMs,
      retryable: probe.retryable,
      ...probe.status === void 0 ? {} : { statusCode: probe.status },
      ...probe.requestId === void 0 ? {} : { requestId: probe.requestId }
    });
    if (resolutionConfiguration.valid && resolutionConfiguration.providerId === "taste_resolver_assisted" && resolutionConfiguration.endpoint) {
      const resolverProbe = await (options.resolverNetworkProbe ?? probeTasteResolverHealth)({
        baseUrl: resolutionConfiguration.endpoint,
        trustedBaseUrl: resolutionConfiguration.endpoint,
        timeoutMs: options.networkTimeoutMs ?? 5e3
      });
      checks.push({
        id: "qloo-resolution-network",
        status: resolverProbe.ok ? "ok" : "warning",
        message: resolverProbe.message,
        category: resolverProbe.kind,
        durationMs: resolverProbe.durationMs,
        retryable: resolverProbe.retryable,
        ...resolverProbe.status === void 0 ? {} : { statusCode: resolverProbe.status }
      });
    }
  }
  if (qlooConfiguration.apiKeySource === "config") {
    const mode2 = await fileMode(paths.configFile);
    const exposed = mode2 === void 0 || (mode2 & 63) !== 0;
    checks.push(exposed ? {
      id: "qloo-config-permissions",
      status: "warning",
      message: mode2 === void 0 ? `Could not verify permissions for ${paths.configFile}; use 600 for a plaintext API key.` : `Qloo config permissions are ${mode2.toString(8)}; use 600 for a plaintext API key.`
    } : {
      id: "qloo-config-permissions",
      status: "ok",
      message: "Qloo config is private to the current user."
    });
  }
  const providerEnvironment = PROVIDER_ENVIRONMENT_VARIABLES.find((name) => env[name]?.trim());
  const authFileExists = await fileExists(paths.authFile);
  let authFileInspection;
  if (!providerEnvironment && authFileExists) {
    try {
      authFileInspection = inspectPiAuthFile(readAuthFile(paths.authFile));
    } catch {
      authFileInspection = { status: "invalid" };
    }
  }
  checks.push(providerEnvironment ? {
    id: "model-auth",
    status: "ok",
    message: `Model-provider credential is present via ${providerEnvironment}.`
  } : authFileInspection?.status === "usable" ? {
    id: "model-auth",
    status: "ok",
    message: `${paths.authFile} contains ${authFileInspection.credentialCount} structurally usable Pi provider credential${authFileInspection.credentialCount === 1 ? "" : "s"}.`
  } : {
    id: "model-auth",
    status: "warning",
    message: authFileInspection?.status === "invalid" ? `${paths.authFile} does not contain a usable Pi provider credential. Run \`qloo setup --model\` to sign in, then use \`qloo doctor\` to verify it.` : authFileInspection?.status === "empty" ? `${paths.authFile} is empty. Run \`qloo setup --model\` to sign in, then use \`qloo doctor\` to verify it.` : "No model-provider credential was detected. Run `qloo setup --model` to sign in, then use `qloo doctor` to verify it."
  });
  const mode = await directoryMode(paths.agentDir);
  if (mode !== void 0) {
    const exposed = mode & 63;
    checks.push(exposed === 0 ? { id: "state-permissions", status: "ok", message: "Qloo agent state is private to the current user." } : {
      id: "state-permissions",
      status: "warning",
      message: `Qloo agent state permissions are ${mode.toString(8)}; use 700 to keep sessions private.`
    });
  } else {
    checks.push({
      id: "state-permissions",
      status: "ok",
      message: "Qloo agent state has not been created yet; first run will create it with private permissions."
    });
  }
  return {
    schemaVersion: "1.0",
    status: checks.some((check) => check.status === "warning") ? "warning" : "ok",
    versions: {
      harness: options.harnessVersion,
      node: process.versions.node,
      pi: options.piVersion
    },
    paths: {
      qlooHome: paths.qlooDir,
      agentDirectory: paths.agentDir
    },
    checks
  };
}
function formatDoctorReport(report) {
  const lines = [
    `Qloo doctor: ${report.status}`,
    `Harness ${report.versions.harness} | Pi ${report.versions.pi} | Node ${report.versions.node}`,
    `State: ${report.paths.agentDirectory}`,
    "",
    ...report.checks.map((check) => {
      const label = check.category ? `${check.id}/${check.category}` : check.id;
      const duration = check.durationMs === void 0 ? "" : ` (${check.durationMs} ms)`;
      return `${check.status === "ok" ? "ok" : "warn"}  ${label} \u2014 ${check.message}${duration}`;
    })
  ];
  return `${lines.join("\n")}
`;
}
export {
  formatDoctorReport,
  inspectPiAuthFile,
  runDoctor
};
