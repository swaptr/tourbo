import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QLOO_PRODUCTION_BASE_URL,
  probeQlooConnectivity,
  resolveQlooClientConfiguration,
  saveQlooConfigValue
} from "./chunks/chunk-ESNY4EJL.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/setup.js
import { createInterface } from "node:readline/promises";
import { ensureQlooStateDirectories } from "./paths.js";
var QLOO_SETUP_SCHEMA_VERSION = "1.0";
var QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE = "QLOO_NO_GUIDED_START";
var QLOO_SETUP_HELP = `Configure Qloo chat

Usage:
  qloo setup                 Configure missing Qloo and model authentication
  qloo setup --qloo          Configure or replace the Qloo API credential
  qloo setup --model         Sign in to a model provider
  qloo setup --status        Show readiness without changing configuration
  qloo setup --status --json Emit machine-readable readiness

Interactive secret values are hidden and are never printed in the setup report.`;
var SetupCancelledError = class extends Error {
  constructor() {
    super("Qloo setup was cancelled.");
    this.name = "SetupCancelledError";
  }
};
function cleanLine(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
}
async function lineQuestion(input, output, message) {
  const reader = createInterface({ input, output, terminal: true });
  try {
    return (await reader.question(message)).trim() || void 0;
  } catch {
    return void 0;
  } finally {
    reader.close();
  }
}
async function secretQuestion(input, output, message) {
  if (!input.isTTY || typeof input.setRawMode !== "function")
    return void 0;
  output.write(`${message}: `);
  const previousRawMode = input.isRaw;
  const wasPaused = input.isPaused();
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve) => {
    let value = "";
    const finish = (result) => {
      input.off("data", onData);
      input.setRawMode(previousRawMode);
      if (wasPaused)
        input.pause();
      output.write("\n");
      resolve(result);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "" || character === "") {
          finish(void 0);
          return;
        }
        if (character === "\r" || character === "\n") {
          finish(value.trim() || void 0);
          return;
        }
        if (character === "\x7F" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          output.write("\u2022");
        }
      }
    };
    input.on("data", onData);
  });
}
function createTerminalSetupIO(input = process.stdin, output = process.stdout) {
  return {
    interactive: input.isTTY === true && output.isTTY === true,
    async select(title, choices) {
      output.write(`
${title}
`);
      choices.forEach((choice, index) => {
        output.write(`  ${index + 1}. ${choice.label}${choice.description ? ` \u2014 ${choice.description}` : ""}
`);
      });
      while (true) {
        const answer = await lineQuestion(input, output, `Choose 1\u2013${choices.length}: `);
        if (answer === void 0)
          return void 0;
        const index = Number(answer) - 1;
        if (Number.isSafeInteger(index) && index >= 0 && index < choices.length) {
          return choices[index]?.id;
        }
        output.write("Please enter one of the listed numbers.\n");
      }
    },
    text: (message, placeholder) => lineQuestion(input, output, `${message}${placeholder ? ` (${placeholder})` : ""}: `),
    secret: (message) => secretQuestion(input, output, message),
    write: (message) => output.write(message.endsWith("\n") ? message : `${message}
`)
  };
}
async function defaultModelRuntime(paths) {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  return ModelRuntime.create({
    authPath: paths.authFile,
    modelsPath: paths.modelsFile,
    modelsStorePath: paths.modelsStoreFile,
    allowModelNetwork: false
  });
}
async function inspectSetup(options, modelRuntime, changes = [], learningMode = false) {
  const env = options.env ?? process.env;
  const configuration = resolveQlooClientConfiguration({ env, configPath: options.paths.configFile });
  const availableModels = await modelRuntime.getAvailable();
  const qlooReady = configuration.apiKeySource !== "missing";
  return {
    schemaVersion: QLOO_SETUP_SCHEMA_VERSION,
    readyForChat: availableModels.length > 0 && (qlooReady || learningMode || options.allowLearningMode !== false),
    qloo: {
      ready: qlooReady,
      source: configuration.apiKeySource,
      mode: qlooReady ? "live" : "learning"
    },
    model: {
      ready: availableModels.length > 0,
      availableModels: availableModels.length
    },
    changes: [...changes]
  };
}
function providerPriority(provider) {
  const priorities = ["anthropic", "openai-codex", "openai", "github-copilot", "google"];
  const index = priorities.indexOf(provider.id);
  return index < 0 ? priorities.length : index;
}
function loginProviders(runtime) {
  return [...runtime.getProviders()].filter((provider) => provider.auth.apiKey?.login || provider.auth.oauth?.login).sort((left, right) => providerPriority(left) - providerPriority(right) || left.name.localeCompare(right.name));
}
function authEventText(event) {
  if (event.type === "auth_url" && typeof event.url === "string") {
    return [
      typeof event.instructions === "string" ? event.instructions : "Open this URL to continue sign-in:",
      event.url
    ].join("\n");
  }
  if (event.type === "device_code") {
    return [
      typeof event.verificationUri === "string" ? `Open ${event.verificationUri}` : "Open the provider's device-login page.",
      typeof event.userCode === "string" ? `Enter code: ${event.userCode}` : ""
    ].filter(Boolean).join("\n");
  }
  return typeof event.message === "string" ? cleanLine(event.message) : void 0;
}
async function loginModelProvider(runtime, io) {
  const providers = loginProviders(runtime);
  if (providers.length === 0) {
    io.write("No interactive model-provider login is available. Set a supported provider credential and rerun qloo setup.");
    return false;
  }
  const selectedProviderId = await io.select("Choose a model provider", providers.map((provider2) => ({
    id: provider2.id,
    label: provider2.name,
    description: provider2.id
  })));
  if (!selectedProviderId)
    return false;
  const provider = providers.find(({ id }) => id === selectedProviderId);
  if (!provider)
    return false;
  const methods = [
    ...provider.auth.oauth?.login ? [{ id: "oauth", label: "Subscription or account sign-in", description: "Use the provider's supported login flow" }] : [],
    ...provider.auth.apiKey?.login ? [{ id: "api_key", label: provider.auth.apiKey.name ?? "API key", description: "Store the credential privately for Qloo" }] : []
  ];
  const selectedMethod = methods.length === 1 ? methods[0]?.id : await io.select(`Authenticate with ${provider.name}`, methods);
  if (selectedMethod !== "api_key" && selectedMethod !== "oauth")
    return false;
  try {
    await runtime.login(provider.id, selectedMethod, {
      async prompt(prompt) {
        if (prompt.signal?.aborted)
          throw new SetupCancelledError();
        const answer = prompt.type === "secret" ? await io.secret(prompt.message) : prompt.type === "select" ? await io.select(prompt.message, prompt.options ?? []) : await io.text(prompt.message, prompt.placeholder);
        if (answer === void 0)
          throw new SetupCancelledError();
        return answer;
      },
      notify(event) {
        const message = authEventText(event);
        if (message)
          io.write(message);
      }
    });
    const available = await runtime.getAvailable(provider.id);
    if (available.length === 0) {
      io.write(`${provider.name} accepted the login, but no usable model is currently available. Run qloo doctor for details.`);
      return false;
    }
    io.write(`${provider.name} is ready for Qloo chat.`);
    return true;
  } catch (error) {
    if (error instanceof SetupCancelledError)
      return false;
    io.write(`${provider.name} sign-in did not complete. No credential value was displayed; retry or run qloo doctor.`);
    return false;
  }
}
async function configureQlooCredential(options, io) {
  const env = options.env ?? process.env;
  const configuration = resolveQlooClientConfiguration({ env, configPath: options.paths.configFile });
  const choice = await io.select("Connect Qloo data", [
    { id: "configure", label: "Enter a Qloo API key", description: "Validate it without displaying it, then store it privately" },
    ...options.allowLearningMode === false ? [] : [{ id: "learning", label: "Continue in learning mode", description: "Explore capabilities and integration guidance without live results" }],
    ...options.allowLearningMode === false ? [{ id: "cancel", label: "Cancel setup" }] : []
  ]);
  if (choice === "learning")
    return "learning";
  if (choice !== "configure")
    return "cancelled";
  while (true) {
    const apiKey = await io.secret("Qloo API key (input is hidden)");
    if (!apiKey)
      return "cancelled";
    io.write("Checking Qloo connectivity and authentication\u2026");
    const probe = await (options.networkProbe ?? probeQlooConnectivity)({
      apiKey,
      baseUrl: configuration.baseUrl ?? QLOO_PRODUCTION_BASE_URL,
      allowCustomBaseUrl: configuration.baseUrlTrusted,
      timeoutMs: 5e3
    });
    if (probe.ok) {
      (options.saveApiKey ?? ((value, path) => saveQlooConfigValue("api_key", value, path)))(apiKey, options.paths.configFile);
      io.write("Qloo is connected. The API key was stored in the private Qloo config.");
      return "configured";
    }
    if (probe.kind === "authentication") {
      io.write("Qloo is reachable, but it rejected that credential. Check the key and try again.");
      continue;
    }
    io.write(probe.message);
    const recovery = await io.select("The key could not be validated from this network", [
      { id: "save", label: "Save it and diagnose later", description: "Useful when VPN or routing is temporarily unavailable" },
      { id: "retry", label: "Try another key" },
      { id: "cancel", label: "Cancel setup" }
    ]);
    if (recovery === "save") {
      (options.saveApiKey ?? ((value, path) => saveQlooConfigValue("api_key", value, path)))(apiKey, options.paths.configFile);
      io.write("The key was stored. Run qloo doctor --network after connecting the required network or VPN.");
      return "configured";
    }
    if (recovery !== "retry")
      return "cancelled";
  }
}
async function setupQloo(options) {
  const io = options.io ?? createTerminalSetupIO();
  await ensureQlooStateDirectories(options.paths);
  const modelRuntime = options.modelRuntime ?? await (options.createModelRuntime ?? defaultModelRuntime)(options.paths);
  let report = await inspectSetup(options, modelRuntime);
  const changes = [];
  let learningMode = !report.qloo.ready && options.allowLearningMode !== false;
  if ((options.configureQloo ?? !report.qloo.ready) && io.interactive) {
    const result = await configureQlooCredential(options, io);
    if (result === "configured") {
      changes.push("qloo-auth");
      learningMode = false;
    } else if (result === "learning") {
      learningMode = true;
    }
  }
  report = await inspectSetup(options, modelRuntime, changes, learningMode);
  if ((options.configureModel ?? !report.model.ready) && io.interactive) {
    if (await loginModelProvider(modelRuntime, io))
      changes.push("model-auth");
  }
  return inspectSetup(options, modelRuntime, changes, learningMode);
}
function formatQlooSetupReport(report) {
  return [
    "Qloo setup",
    `  Qloo data: ${report.qloo.ready ? `ready (${report.qloo.source})` : "learning mode; no API credential"}`,
    `  Model: ${report.model.ready ? `ready (${report.model.availableModels} available)` : "not configured"}`,
    `  Chat: ${report.readyForChat ? "ready" : "requires model-provider sign-in"}`,
    report.changes.length > 0 ? `  Updated: ${report.changes.join(", ")}` : "  Updated: nothing"
  ].join("\n") + "\n";
}
async function runQlooSetup(argv, options) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    (options.writeOut ?? ((text) => process.stdout.write(text)))(`${QLOO_SETUP_HELP}
`);
    return 0;
  }
  const supported = /* @__PURE__ */ new Set(["--status", "--json", "--qloo", "--model"]);
  const unknown = argv.filter((argument) => !supported.has(argument));
  if (unknown.length > 0) {
    (options.writeError ?? ((text) => process.stderr.write(text)))("qloo setup: supported options are --status, --json, --qloo, and --model\n");
    return 2;
  }
  const statusOnly = argv.includes("--status");
  const io = options.io ?? createTerminalSetupIO();
  if (!statusOnly && !io.interactive) {
    (options.writeError ?? ((text) => process.stderr.write(text)))("qloo setup: interactive setup requires a TTY. Use qloo setup --status --json for automation.\n");
    return 2;
  }
  const report = await setupQloo({
    ...options,
    io: statusOnly ? { ...io, interactive: false } : io,
    ...argv.includes("--qloo") ? { configureQloo: true } : {},
    ...argv.includes("--model") ? { configureModel: true } : {}
  });
  const output = argv.includes("--json") ? `${JSON.stringify(report)}
` : formatQlooSetupReport(report);
  (options.writeOut ?? ((text) => process.stdout.write(text)))(output);
  return report.readyForChat ? 0 : 1;
}
export {
  QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE,
  QLOO_SETUP_HELP,
  QLOO_SETUP_SCHEMA_VERSION,
  createTerminalSetupIO,
  formatQlooSetupReport,
  runQlooSetup,
  setupQloo
};
