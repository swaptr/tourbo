import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/profiles.js
var QLOO_HARNESS_PROFILES = [
  "explore",
  "integrate",
  "plan",
  "build"
];
var profileSet = new Set(QLOO_HARNESS_PROFILES);
function isQlooHarnessProfile(value) {
  return profileSet.has(value);
}
var QLOO_DEFAULT_PROFILE = "explore";
var QLOO_PROFILE_DEFINITIONS = Object.freeze({
  explore: Object.freeze({
    id: "explore",
    summary: "Ask grounded questions of Qloo and inspect relevant local context.",
    authorityNotice: "Can query Qloo and read or search files inside the folder Qloo started in. It cannot run shell commands or modify project files. Dedicated artifact and plan tools may write only to private Qloo state.",
    workspaceTools: Object.freeze(["read", "grep", "find", "ls"]),
    approvalTools: Object.freeze([]),
    allowDirectShell: false,
    maxToolCallsPerTurn: 12,
    maxIdenticalToolCallsPerTurn: 2
  }),
  integrate: Object.freeze({
    id: "integrate",
    summary: "Inspect an existing system and design a Qloo integration.",
    authorityNotice: "Can query Qloo, read or search files, and run shell commands you enter directly. Agent-requested shell commands require approval and run with your user permissions, so they can execute programs or modify accessible files.",
    workspaceTools: Object.freeze(["read", "grep", "find", "ls", "bash"]),
    approvalTools: Object.freeze(["bash"]),
    allowDirectShell: true,
    maxToolCallsPerTurn: 20,
    maxIdenticalToolCallsPerTurn: 2
  }),
  plan: Object.freeze({
    id: "plan",
    summary: "Produce an implementation plan without modifying the workspace.",
    authorityNotice: "Can query Qloo and read or search files inside the folder Qloo started in to create a plan. It cannot run shell commands or modify project files. Validated plans and requested artifacts may be written only to private Qloo state.",
    workspaceTools: Object.freeze(["read", "grep", "find", "ls"]),
    approvalTools: Object.freeze([]),
    allowDirectShell: false,
    maxToolCallsPerTurn: 12,
    maxIdenticalToolCallsPerTurn: 2
  }),
  build: Object.freeze({
    id: "build",
    summary: "Implement and verify an approved Qloo integration.",
    authorityNotice: "Can query Qloo, read or search files, and run shell commands you enter directly. Agent-requested shell, edit, and write actions require approval and run with your user permissions, so they can execute programs or modify accessible files.",
    workspaceTools: Object.freeze(["read", "grep", "find", "ls", "bash", "edit", "write"]),
    approvalTools: Object.freeze(["bash", "edit", "write"]),
    allowDirectShell: true,
    maxToolCallsPerTurn: 30,
    maxIdenticalToolCallsPerTurn: 3
  })
});
function getQlooProfileDefinition(profile) {
  return QLOO_PROFILE_DEFINITIONS[profile];
}
export {
  QLOO_DEFAULT_PROFILE,
  QLOO_HARNESS_PROFILES,
  QLOO_PROFILE_DEFINITIONS,
  getQlooProfileDefinition,
  isQlooHarnessProfile
};
