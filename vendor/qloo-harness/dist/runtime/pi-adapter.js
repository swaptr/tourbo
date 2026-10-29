import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/pi-adapter.js
import { ensureQlooStateDirectories } from "../paths.js";
import { getQlooToolRuntimeInfo, isQlooWorkflowToolName } from "../qloo-tools.js";
import { QLOO_DEFAULT_PROFILE, QLOO_HARNESS_PROFILES } from "../profiles.js";
import { buildProfileToolNames, createHarnessPolicyExtension } from "./explore-policy.js";
import { applyPiInteractiveCommandPolicy, PINNED_PI_VERSION } from "./pi-command-policy.js";
import { instructionsForProfile } from "./resources.js";
var PI_AGENT_DIR_ENVIRONMENT_VARIABLE = "PI_CODING_AGENT_DIR";
var PI_TELEMETRY_ENVIRONMENT_VARIABLE = "PI_TELEMETRY";
var PI_SKIP_VERSION_CHECK_ENVIRONMENT_VARIABLE = "PI_SKIP_VERSION_CHECK";
var PI_OFFLINE_ENVIRONMENT_VARIABLE = "PI_OFFLINE";
var QLOO_MODEL_RETRY_POLICY = Object.freeze({
  maxRetries: 1,
  baseDelayMs: 1e3,
  providerTimeoutMs: 6e4,
  providerMaxRetries: 0,
  providerMaxRetryDelayMs: 5e3
});
var PI_PRIVACY_DEFAULTS = {
  [PI_TELEMETRY_ENVIRONMENT_VARIABLE]: "0",
  [PI_SKIP_VERSION_CHECK_ENVIRONMENT_VARIABLE]: "1",
  [PI_OFFLINE_ENVIRONMENT_VARIABLE]: "1"
};
function applyQlooModelRetryPolicy(settingsManager) {
  const configured = settingsManager.getGlobalSettings().retry;
  const provider = configured?.provider;
  settingsManager.applyOverrides({
    retry: {
      enabled: configured?.enabled ?? true,
      maxRetries: Math.min(configured?.maxRetries ?? QLOO_MODEL_RETRY_POLICY.maxRetries, QLOO_MODEL_RETRY_POLICY.maxRetries),
      baseDelayMs: Math.min(configured?.baseDelayMs ?? QLOO_MODEL_RETRY_POLICY.baseDelayMs, 2e3),
      provider: {
        timeoutMs: Math.min(provider?.timeoutMs ?? QLOO_MODEL_RETRY_POLICY.providerTimeoutMs, 12e4),
        maxRetries: QLOO_MODEL_RETRY_POLICY.providerMaxRetries,
        maxRetryDelayMs: Math.min(provider?.maxRetryDelayMs ?? QLOO_MODEL_RETRY_POLICY.providerMaxRetryDelayMs, QLOO_MODEL_RETRY_POLICY.providerMaxRetryDelayMs)
      }
    }
  });
}
async function withEnvironmentVariable(name, value, operation) {
  const hadPreviousValue = Object.hasOwn(process.env, name);
  const previousValue = process.env[name];
  process.env[name] = value;
  try {
    return await operation();
  } finally {
    if (hadPreviousValue) {
      process.env[name] = previousValue;
    } else {
      delete process.env[name];
    }
  }
}
async function withPiAgentDirectory(agentDir, operation) {
  return withEnvironmentVariable(PI_AGENT_DIR_ENVIRONMENT_VARIABLE, agentDir, operation);
}
async function withPiPrivacyDefaults(operation) {
  const previous = Object.entries(PI_PRIVACY_DEFAULTS).map(([name, defaultValue]) => ({
    name,
    defaultValue,
    existed: Object.hasOwn(process.env, name),
    value: process.env[name]
  }));
  for (const entry of previous) {
    if (!entry.existed)
      process.env[entry.name] = entry.defaultValue;
  }
  try {
    return await operation();
  } finally {
    for (const entry of previous) {
      if (entry.existed)
        process.env[entry.name] = entry.value;
      else
        delete process.env[entry.name];
    }
  }
}
var MissingModelAuthenticationError = class extends Error {
  authFile;
  constructor(authFile) {
    super([
      "No authenticated model provider is available for Qloo.",
      "Run `qloo setup --model` to sign in to a supported provider, then rerun `qloo`.",
      `Provider state is stored in the Pi ${PINNED_PI_VERSION}-compatible Qloo auth file at ${authFile};`,
      "use `qloo doctor` to validate it before starting chat."
    ].join(" "));
    this.name = "MissingModelAuthenticationError";
    this.authFile = authFile;
  }
};
async function requireAuthenticatedModel(modelRuntime, authFile) {
  const availableModels = await modelRuntime.getAvailable();
  if (availableModels.length === 0) {
    throw new MissingModelAuthenticationError(authFile);
  }
}
function buildExploreResourceOptions(resources, allowedToolNames) {
  return buildHarnessResourceOptions(resources, allowedToolNames, "explore");
}
function buildHarnessResourceOptions(resources, allowedToolNames, profile, runtimeInfo, commandActions) {
  return {
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [createHarnessPolicyExtension(profile, allowedToolNames, runtimeInfo, commandActions, (activeProfile) => instructionsForProfile(resources, activeProfile))],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => resources.systemPrompt,
    appendSystemPromptOverride: () => [instructionsForProfile(resources, profile)]
  };
}
var PiHarnessRuntime = class {
  sessionRuntime;
  runStarted = false;
  disposed = false;
  constructor(sessionRuntime) {
    this.sessionRuntime = sessionRuntime;
  }
  /** Run one model turn through the same session, tools, and policy as the TUI. */
  async runPrompt(prompt) {
    if (this.disposed) {
      throw new Error("Qloo runtime has already been disposed");
    }
    if (this.runStarted) {
      throw new Error("Qloo runtime can only be started once");
    }
    this.runStarted = true;
    return withPiAgentDirectory(this.sessionRuntime.services.agentDir, () => withPiPrivacyDefaults(async () => {
      await this.sessionRuntime.session.prompt(prompt, {
        expandPromptTemplates: false,
        source: "rpc"
      });
      await this.sessionRuntime.session.waitForIdle();
      return this.sessionRuntime.session.getLastAssistantText();
    }));
  }
  async runInteractive(options = {}) {
    if (this.disposed) {
      throw new Error("Qloo runtime has already been disposed");
    }
    if (this.runStarted) {
      throw new Error("Qloo interactive mode can only be started once");
    }
    this.runStarted = true;
    const interactiveOptions = {
      migratedProviders: [],
      initialImages: [],
      initialMessages: [],
      ...options
    };
    if (interactiveOptions.modelFallbackMessage === void 0 && this.sessionRuntime.modelFallbackMessage !== void 0) {
      interactiveOptions.modelFallbackMessage = this.sessionRuntime.modelFallbackMessage;
    }
    await withPiAgentDirectory(this.sessionRuntime.services.agentDir, () => withPiPrivacyDefaults(async () => {
      const { InteractiveMode } = await import("@earendil-works/pi-coding-agent");
      const mode = new InteractiveMode(this.sessionRuntime, interactiveOptions);
      applyPiInteractiveCommandPolicy(mode);
      await mode.run();
    }));
  }
  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.sessionRuntime.dispose();
  }
};
async function createPiHarnessRuntime(options) {
  const customTools = [...options.customTools ?? []];
  const profile = options.profile ?? QLOO_DEFAULT_PROFILE;
  const registeredToolNames = [...new Set(QLOO_HARNESS_PROFILES.flatMap((candidate) => buildProfileToolNames(candidate, customTools)))];
  const toolByName = new Map(customTools.map((tool) => [tool.name, tool]));
  const interactiveCommandActions = {
    ...options.interactiveCommandActions ?? {},
    async retry(toolName, input) {
      const tool = toolByName.get(toolName);
      if (!tool || !isQlooWorkflowToolName(toolName)) {
        throw new Error(`No replayable Qloo tool is registered as ${toolName}.`);
      }
      const result = await tool.execute(`qloo-retry-${Date.now().toString(36)}`, input, AbortSignal.timeout(3e4), void 0, {});
      if (result.details === null || typeof result.details !== "object" || Array.isArray(result.details)) {
        throw new Error(`${toolName} returned no structured details.`);
      }
      return result.details;
    }
  };
  await ensureQlooStateDirectories(options.paths);
  return withPiAgentDirectory(options.paths.agentDir, () => withPiPrivacyDefaults(async () => {
    const { ModelRuntime, SessionManager, SettingsManager, createAgentSessionFromServices, createAgentSessionRuntime, createAgentSessionServices } = await import("@earendil-works/pi-coding-agent");
    const allowedToolNames = new Set(registeredToolNames);
    const modelRuntime = options.modelRuntime ?? await ModelRuntime.create({
      authPath: options.paths.authFile,
      modelsPath: options.paths.modelsFile,
      modelsStorePath: options.paths.modelsStoreFile,
      allowModelNetwork: false
    });
    const createRuntime = async ({ cwd, sessionManager: sessionManager2, sessionStartEvent }) => {
      const settingsManager = SettingsManager.create(cwd, options.paths.agentDir, {
        projectTrusted: false
      });
      applyQlooModelRetryPolicy(settingsManager);
      const services = await createAgentSessionServices({
        cwd,
        agentDir: options.paths.agentDir,
        settingsManager,
        modelRuntime,
        resourceLoaderOptions: buildHarnessResourceOptions(options.resources, allowedToolNames, profile, getQlooToolRuntimeInfo(customTools), interactiveCommandActions)
      });
      await requireAuthenticatedModel(services.modelRuntime, options.paths.authFile);
      for (const settingsError of settingsManager.drainErrors()) {
        services.diagnostics.push({
          type: "warning",
          message: `Could not load Qloo ${settingsError.scope} settings: ${settingsError.error.message}`
        });
      }
      const sessionOptions = {
        services,
        sessionManager: sessionManager2,
        tools: registeredToolNames,
        customTools,
        ...sessionStartEvent === void 0 ? {} : { sessionStartEvent }
      };
      return {
        ...await createAgentSessionFromServices(sessionOptions),
        services,
        diagnostics: services.diagnostics
      };
    };
    const sessionManager = options.sessionManager ?? SessionManager.create(options.cwd, options.paths.sessionDir);
    const sessionRuntime = await createAgentSessionRuntime(createRuntime, {
      cwd: options.cwd,
      agentDir: options.paths.agentDir,
      sessionManager
    });
    return new PiHarnessRuntime(sessionRuntime);
  }));
}
export {
  MissingModelAuthenticationError,
  PI_AGENT_DIR_ENVIRONMENT_VARIABLE,
  PI_OFFLINE_ENVIRONMENT_VARIABLE,
  PI_SKIP_VERSION_CHECK_ENVIRONMENT_VARIABLE,
  PI_TELEMETRY_ENVIRONMENT_VARIABLE,
  PiHarnessRuntime,
  QLOO_MODEL_RETRY_POLICY,
  applyQlooModelRetryPolicy,
  buildExploreResourceOptions,
  buildHarnessResourceOptions,
  createPiHarnessRuntime,
  requireAuthenticatedModel,
  withPiAgentDirectory,
  withPiPrivacyDefaults
};
