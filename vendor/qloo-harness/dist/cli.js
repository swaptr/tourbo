import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/cli.js
import { launchInteractiveHarness } from "./app.js";
import { isQlooHarnessProfile, QLOO_DEFAULT_PROFILE, QLOO_HARNESS_PROFILES } from "./profiles.js";
import { MissingModelAuthenticationError } from "./runtime/pi-adapter.js";
var HARNESS_VERSION = "0.1.26";
var HARNESS_HELP = `Qloo terminal harness

Usage:
  qloo              Start guided Qloo chat
  qloo chat         Start guided Qloo chat explicitly
  qloo explore      Ask grounded Qloo questions (read-only workspace)
  qloo integrate    Inspect and design a Qloo integration
  qloo plan         Open interactive read-only planning
  qloo plan "<goal>" --json
                    Create a typed, evidence-backed plan
  qloo build        Open approval-gated build mode
  qloo build --plan <plan-id>
                    Build from a validated integration plan
  qloo chat --mode <explore|integrate|plan|build>
  qloo --help       Show this help
  qloo --version    Show the harness version

The deterministic API CLI and additional harness commands are attached by the
top-level qloo command router.`;
var defaultDependencies = {
  launch: (profile) => launchInteractiveHarness({ profile }),
  isInteractiveTerminal: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
  writeOut: (text) => {
    process.stdout.write(text);
  },
  writeError: (text) => {
    process.stderr.write(text);
  }
};
function startupErrorMessage(error) {
  if (error instanceof MissingModelAuthenticationError) {
    return `qloo: ${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `qloo: unable to start interactive chat: ${message}`;
}
function parseChatProfile(args) {
  if (args.length === 0 || args.length === 1 && args[0] === "chat") {
    return QLOO_DEFAULT_PROFILE;
  }
  if (args.length === 1 && args[0] && isQlooHarnessProfile(args[0]))
    return args[0];
  if (args[0] !== "chat")
    return void 0;
  const modeArgument = args[1];
  const value = modeArgument === "--mode" ? args[2] : modeArgument?.startsWith("--mode=") ? modeArgument.slice("--mode=".length) : void 0;
  const expectedLength = modeArgument === "--mode" ? 3 : 2;
  return args.length === expectedLength && value && isQlooHarnessProfile(value) ? value : void 0;
}
async function runHarnessCli(args = process.argv.slice(2), dependencies = defaultDependencies) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    dependencies.writeOut(`${HARNESS_HELP}
`);
    return 0;
  }
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) {
    dependencies.writeOut(`${HARNESS_VERSION}
`);
    return 0;
  }
  const profile = parseChatProfile(args);
  if (!profile) {
    dependencies.writeError(`qloo: unknown command or invalid chat profile: ${args.join(" ")}
Choose one of: ${QLOO_HARNESS_PROFILES.join(", ")}

${HARNESS_HELP}
`);
    return 2;
  }
  if (!dependencies.isInteractiveTerminal()) {
    dependencies.writeError("qloo: interactive chat requires a TTY on stdin and stdout. Use an explicit non-interactive qloo command for scripts.\n");
    return 2;
  }
  try {
    await dependencies.launch(profile);
    return 0;
  } catch (error) {
    dependencies.writeError(`${startupErrorMessage(error)}
`);
    return 1;
  }
}
export {
  HARNESS_HELP,
  HARNESS_VERSION,
  runHarnessCli
};
