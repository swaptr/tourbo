import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/pi-command-policy.js
var PINNED_PI_VERSION = "0.84.2";
var BLOCKED_PI_INTERACTIVE_COMMANDS = /* @__PURE__ */ new Set(["share", "trust"]);
var PI_SHARE_BLOCK_MESSAGE = "External session sharing is disabled in the Qloo harness.";
var PI_TRUST_BLOCK_MESSAGE = "Project trust changes are disabled in Qloo's explore profile.";
var PI_SUPPRESSED_OFFLINE_MANAGED_TOOL_WARNINGS = /* @__PURE__ */ new Set([
  "fd not found. Offline mode enabled, skipping download.",
  "ripgrep not found. Offline mode enabled, skipping download."
]);
var REQUIRED_PI_INTERNAL_METHODS = [
  "handleShareCommand",
  "showTrustSelector",
  "showError",
  "showManagedToolStatus"
];
var PiCommandPolicyCompatibilityError = class extends Error {
  constructor(method) {
    super(`Qloo cannot safely start with Pi ${PINNED_PI_VERSION}: required interactive policy seam "${method}" is unavailable.`);
    this.name = "PiCommandPolicyCompatibilityError";
  }
};
function isBlockedPiInteractiveCommand(value) {
  const firstToken = value.trim().split(/\s+/u, 1)[0] ?? "";
  const command = firstToken.replace(/^\/+/, "");
  return BLOCKED_PI_INTERACTIVE_COMMANDS.has(command);
}
function applyPiInteractiveCommandPolicy(mode) {
  const internals = mode;
  for (const method of REQUIRED_PI_INTERNAL_METHODS) {
    if (typeof internals[method] !== "function") {
      throw new PiCommandPolicyCompatibilityError(method);
    }
  }
  const showError = internals.showError.bind(mode);
  const showManagedToolStatus = internals.showManagedToolStatus.bind(mode);
  Object.defineProperties(internals, {
    handleShareCommand: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: async () => showError(PI_SHARE_BLOCK_MESSAGE)
    },
    showTrustSelector: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: () => showError(PI_TRUST_BLOCK_MESSAGE)
    },
    showManagedToolStatus: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: (status) => {
        if (status.type === "warning" && PI_SUPPRESSED_OFFLINE_MANAGED_TOOL_WARNINGS.has(status.message)) {
          return;
        }
        showManagedToolStatus(status);
      }
    }
  });
}
export {
  BLOCKED_PI_INTERACTIVE_COMMANDS,
  PINNED_PI_VERSION,
  PI_SHARE_BLOCK_MESSAGE,
  PI_SUPPRESSED_OFFLINE_MANAGED_TOOL_WARNINGS,
  PI_TRUST_BLOCK_MESSAGE,
  PiCommandPolicyCompatibilityError,
  applyPiInteractiveCommandPolicy,
  isBlockedPiInteractiveCommand
};
