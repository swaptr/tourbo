import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "../chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/runtime/explore-policy.js
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isQlooArtifactDetails, QLOO_CREATE_ARTIFACT_TOOL_NAME } from "../artifact-tool.js";
import { advanceQlooJourneyForArtifact, advanceQlooJourneyForPlan, advanceQlooJourneyForRequest, advanceQlooJourneyForUserPrompt, advanceQlooJourneyForWorkflow, completeQlooJourneyAfterAgent, createQlooJourneyState, findGuidedGoal, findQlooJourney, guidedGoalLabel, QLOO_GUIDED_GOALS, QLOO_JOURNEYS, qlooJourneyInstructions, qlooJourneyLabel, qlooJourneyProgress, qlooNextActions, qlooStarterIdeaLines, parseQlooJourneyState, setQlooJourneyStatus, skipQlooJourneyStep } from "../guided-journey.js";
import { isQlooInteractiveIntegrationPlanDetails, QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME } from "../integration-plan.js";
import { getQlooProfileDefinition, isQlooHarnessProfile, QLOO_HARNESS_PROFILES } from "../profiles.js";
import { applyResolutionChoices, paginateQlooResult, parseQlooRawPage, resolutionCandidates } from "../qloo-presentation.js";
import { isQlooWorkflowToolName } from "../qloo-tools.js";
import { classifyQlooVerificationCommand, fingerprintQlooLedgerText, formatQlooLedgerEvent, QLOO_LEDGER_CATEGORIES, QlooSessionLedger, qlooLedgerFileReference } from "../session-ledger.js";
import { resolveQlooPaths } from "../paths.js";
import { QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE } from "../setup.js";
import { isBlockedPiInteractiveCommand } from "./pi-command-policy.js";
import { renderQlooHeader } from "./qloo-header.js";
import { selectQlooResolutionChoices } from "./resolution-choice-ui.js";
import { checkWorkspaceScope, isWorkspaceScopedCall } from "./workspace-scope.js";
import { QLOO_RESOLUTION_CHOICE_ENTRY_TYPE, QlooResolutionMemory, clearResolutionChoicesEvent, forgetResolutionChoiceEvent, rememberResolutionChoicesEvent } from "./resolution-memory.js";
var QLOO_WORKSPACE_TOOL_NAMES = [
  ...getQlooProfileDefinition("build").workspaceTools
];
var QLOO_SESSION_STATE_ENTRY_TYPE = "qloo.workflow-state";
var QLOO_SESSION_STATE_SCHEMA_VERSION = "1.5";
var QLOO_JOURNEY_STATE_ENTRY_TYPE = "qloo.journey-state";
var QLOO_ARTIFACT_STATE_ENTRY_TYPE = "qloo.artifact-state";
var QLOO_JOURNEY_WIDGET_KEY = "qloo-journey-progress";
var QLOO_NEXT_WIDGET_KEY = "qloo-next-actions";
var QLOO_START_WIDGET_KEY = "qloo-start-ideas";
var QLOO_REQUEST_WORKFLOW_HISTORY_LIMIT = 32;
var AUTOMATIC_DIAGNOSTIC_CODES = /* @__PURE__ */ new Set([
  "QLOO_AUTH",
  "QLOO_CONNECT",
  "QLOO_DNS",
  "QLOO_TIMEOUT",
  "QLOO_TLS",
  "RESOLVER_CONNECT",
  "RESOLVER_TIMEOUT"
]);
function formatContextUsage(usage) {
  const tokens = usage?.tokens ?? "unknown";
  const contextWindow = usage?.contextWindow ?? "unknown";
  const percentage = usage?.percent === null || usage?.percent === void 0 ? "percentage unavailable" : `${usage.percent.toFixed(1)}%`;
  return `${tokens} / ${contextWindow} tokens (${percentage})`;
}
var reservedBuiltInTools = /* @__PURE__ */ new Set([
  ...QLOO_WORKSPACE_TOOL_NAMES,
  "grep",
  "find",
  "ls"
]);
function buildExploreToolNames(tools) {
  return buildProfileToolNames("explore", tools);
}
function buildProfileToolNames(profile, tools) {
  validateExploreTools(tools);
  return [
    ...getQlooProfileDefinition(profile).workspaceTools,
    ...tools.map(({ name }) => name)
  ];
}
function validateExploreTools(tools) {
  const names = /* @__PURE__ */ new Set();
  for (const tool of tools) {
    const name = tool.name.trim();
    if (name.length === 0) {
      throw new Error("Qloo tool names must not be empty");
    }
    if (reservedBuiltInTools.has(name)) {
      throw new Error(`Qloo tool name conflicts with a reserved Pi built-in: ${name}`);
    }
    if (names.has(name)) {
      throw new Error(`Duplicate Qloo tool name: ${name}`);
    }
    names.add(name);
  }
}
function safeApprovalDetail(toolName, input) {
  const candidate = toolName === "bash" ? input.command : input.path ?? input.file_path;
  if (typeof candidate !== "string" || candidate.trim().length === 0)
    return toolName;
  const sanitized = candidate.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  return sanitized.length > 240 ? `${sanitized.slice(0, 240)}\u2026` : sanitized;
}
function stableToolSignature(toolName, input) {
  const normalize = (value) => {
    if (Array.isArray(value))
      return value.map(normalize);
    if (value === null || typeof value !== "object")
      return value;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  };
  return `${toolName}:${JSON.stringify(normalize(input))}`;
}
var sensitiveResultKey = /(?:api[_-]?key|authorization|credential|password|secret|token)/iu;
function redactSensitiveResult(value, depth = 0) {
  if (depth >= 8)
    return "[detail omitted]";
  if (Array.isArray(value))
    return value.map((item) => redactSensitiveResult(item, depth + 1));
  if (value === null || typeof value !== "object")
    return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveResultKey.test(key) ? "[redacted]" : redactSensitiveResult(item, depth + 1)
  ]));
}
function boundedJsonValue(value, maximumBytes) {
  try {
    const serialized = JSON.stringify(redactSensitiveResult(value));
    if (Buffer.byteLength(serialized) > maximumBytes)
      return void 0;
    return JSON.parse(serialized);
  } catch {
    return void 0;
  }
}
function boundedWorkflowInput(input) {
  return boundedJsonValue(input, 16384);
}
function branchHasConversation(entries) {
  return entries.some((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      return false;
    const record = entry;
    return record.type === "message" || record.type === "custom_message" || record.type === "compaction";
  });
}
function compactDoctorRecovery(report, recovery) {
  const record = report !== null && typeof report === "object" && !Array.isArray(report) ? report : void 0;
  const checks = Array.isArray(record?.checks) ? record.checks.filter((check) => check !== null && typeof check === "object" && !Array.isArray(check)).filter((check) => check.status !== "ok").slice(0, 3).map((check) => typeof check.message === "string" ? check.message : void 0).filter((message) => Boolean(message)) : [];
  const next = checks[0] ?? (typeof recovery === "string" && recovery.trim() ? recovery : "Run /doctor network before retrying.");
  return [
    "Qloo automatically checked the failing connection.",
    `Diagnosis: ${String(record?.status ?? "unavailable")}`,
    `Next step: ${next}`,
    "Use /doctor network for the full report or /trace for the recorded failure."
  ].join("\n");
}
function requestPreviews(workflow) {
  const provenance = workflow.provenance;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
    return void 0;
  }
  const requests = provenance.requests;
  return Array.isArray(requests) ? requests : void 0;
}
function recordedRequestPreviews(workflows) {
  const stages = workflows.flatMap((workflow) => {
    const requests = requestPreviews(workflow);
    if (!requests || requests.length === 0)
      return [];
    const operation = typeof workflow.operation === "string" ? workflow.operation : typeof workflow.tool_name === "string" ? workflow.tool_name : "qloo_workflow";
    return [{ operation, requests }];
  });
  return stages.flatMap(({ operation, requests }, stageIndex) => requests.map((request, requestIndex) => ({
    request,
    operation,
    stageNumber: stageIndex + 1,
    stageCount: stages.length,
    requestNumberWithinStage: requestIndex + 1,
    requestCountWithinStage: requests.length
  })));
}
function requestPreviewSelection(args, currentIndex, requestCount) {
  const value = args.trim().toLowerCase();
  if (value === "" || value === "latest" || value === "last")
    return requestCount - 1;
  if (value === "first")
    return 0;
  const activeIndex = currentIndex >= 0 && currentIndex < requestCount ? currentIndex : requestCount - 1;
  if (value === "prev" || value === "previous") {
    return (activeIndex - 1 + requestCount) % requestCount;
  }
  if (value === "next")
    return (activeIndex + 1) % requestCount;
  if (/^[1-9][0-9]*$/u.test(value)) {
    const requestedIndex = Number(value) - 1;
    return requestedIndex < requestCount ? requestedIndex : void 0;
  }
  return void 0;
}
function agentRunHasDeliveredText(messages) {
  return messages.some((message) => {
    if (message === null || typeof message !== "object" || Array.isArray(message))
      return false;
    const record = message;
    if (record.role !== "assistant" || !Array.isArray(record.content))
      return false;
    return record.content.some((block) => {
      if (block === null || typeof block !== "object" || Array.isArray(block))
        return false;
      const content = block;
      return content.type === "text" && typeof content.text === "string" && content.text.trim().length > 0;
    });
  });
}
function createHarnessPolicyExtension(profile, allowedToolNames, runtimeInfo, commandActions = {}, loadProfileInstructions) {
  return {
    name: `qloo-${profile}-policy`,
    hidden: true,
    factory(pi) {
      let autocompletePolicyInstalled = false;
      let starterIdeasShown = false;
      let diagnosedThisTurn = false;
      let resolutionPromptCancelledThisTurn = false;
      let resolutionFlowTail = Promise.resolve();
      let toolCallsThisTurn = 0;
      const identicalCallsThisTurn = /* @__PURE__ */ new Map();
      let lastQlooResult;
      let lastQlooRawResult;
      let lastQlooInput;
      let lastQlooToolName;
      let rawPage = 1;
      let currentAnswerId;
      let requestPreviewCursor = -1;
      let latestAnswerScopeStarted = false;
      const currentAnswerWorkflows = [];
      let activeProfile = profile;
      let activeJourney;
      let currentTurnIndex;
      let freeformGoalRecorded = false;
      const createdArtifacts = [];
      const observedWorkflowCorrelations = /* @__PURE__ */ new Map();
      const ledger = new QlooSessionLedger();
      const resolutionMemory = new QlooResolutionMemory();
      const enqueueResolutionFlow = async (operation) => {
        const previous = resolutionFlowTail;
        let release = () => {
        };
        resolutionFlowTail = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await operation();
        } finally {
          release();
        }
      };
      const customToolNames = [...allowedToolNames].filter((name) => !reservedBuiltInTools.has(name));
      const activeDefinition = () => getQlooProfileDefinition(activeProfile);
      const beginAnswerRequestScope = () => {
        currentAnswerId = `answer-${randomUUID()}`;
        currentAnswerWorkflows.splice(0, currentAnswerWorkflows.length);
        requestPreviewCursor = -1;
        latestAnswerScopeStarted = true;
      };
      const ensureAnswerRequestScope = () => {
        if (!currentAnswerId)
          currentAnswerId = `answer-${randomUUID()}`;
        latestAnswerScopeStarted = true;
        return currentAnswerId;
      };
      const activeAllowedToolNames = () => /* @__PURE__ */ new Set([
        ...activeDefinition().workspaceTools,
        ...customToolNames
      ]);
      const ledgerSink = typeof pi.appendEntry === "function" ? (customType, event) => pi.appendEntry(customType, event) : void 0;
      const recordLedger = (input, eventProfile = activeProfile) => {
        ledger.record(ledgerSink, eventProfile, input);
      };
      const ledgerReferences = (values = {}) => {
        const references = {};
        if (currentTurnIndex !== void 0)
          references.turn_index = currentTurnIndex;
        if (typeof values.toolCallId === "string" && values.toolCallId.length > 0) {
          references.tool_call_id = values.toolCallId.slice(0, 200);
        }
        if (typeof values.correlationId === "string" && values.correlationId.length > 0) {
          references.correlation_id = values.correlationId.slice(0, 200);
        }
        return Object.keys(references).length > 0 ? references : void 0;
      };
      const workflowCorrelationId = (details) => {
        const execution = details?.execution;
        if (execution === null || typeof execution !== "object" || Array.isArray(execution)) {
          return void 0;
        }
        const correlationId = execution.correlation_id;
        return typeof correlationId === "string" && correlationId.length > 0 ? correlationId.slice(0, 200) : void 0;
      };
      const safeDetails = (values) => Object.fromEntries(Object.entries(values).filter((entry) => entry[1] !== void 0));
      const setJourneyWidget = (context) => {
        if (context.mode !== "tui" || typeof context.ui.setWidget !== "function")
          return;
        if (!activeJourney) {
          context.ui.setWidget(QLOO_JOURNEY_WIDGET_KEY, void 0);
          return;
        }
        const definition = findQlooJourney(activeJourney.journey_id);
        const progress = qlooJourneyProgress(activeJourney);
        const status = activeJourney.status === "active" ? "" : ` \xB7 ${activeJourney.status}`;
        context.ui.setWidget(QLOO_JOURNEY_WIDGET_KEY, (_tui, theme) => ({
          render: () => [
            [
              theme.fg("accent", "Journey"),
              theme.fg("text", ` \xB7 ${definition?.label ?? activeJourney?.journey_id}`),
              theme.fg("text", ` \xB7 ${progress.current}/${progress.total}${status}`),
              theme.fg("text", ` \xB7 ${progress.label}`)
            ].join("")
          ],
          invalidate() {
          }
        }), { placement: "belowEditor" });
      };
      const persistJourney = (nextState, context, actionOverride) => {
        const previous = activeJourney;
        activeJourney = nextState;
        pi.appendEntry(QLOO_JOURNEY_STATE_ENTRY_TYPE, nextState);
        const action = actionOverride ?? (previous?.journey_id !== nextState.journey_id ? "started" : previous.status !== nextState.status ? {
          active: "resumed",
          paused: "paused",
          completed: "completed",
          cancelled: "cancelled"
        }[nextState.status] : "advanced");
        const definition = findQlooJourney(nextState.journey_id);
        recordLedger({
          category: "journey",
          action,
          summary: action === "started" ? `${definition?.label ?? nextState.journey_id} started` : `${definition?.label ?? nextState.journey_id} ${action}: ${nextState.current_step}`,
          details: safeDetails({
            journey_id: nextState.journey_id,
            from_step: previous?.journey_id === nextState.journey_id ? previous.current_step : void 0,
            to_step: nextState.current_step,
            status: nextState.status
          })
        });
        if (action === "started") {
          freeformGoalRecorded = true;
          recordLedger({
            category: "goal",
            action: "selected",
            summary: `${definition?.label ?? nextState.journey_id} selected as the active goal`,
            details: {
              goal_type: "journey",
              goal_id: nextState.journey_id
            }
          });
        }
        setJourneyWidget(context);
      };
      const transitionJourney = (transition, context, actionOverride) => {
        if (!activeJourney)
          return false;
        const nextState = transition(activeJourney);
        if (nextState === activeJourney)
          return false;
        persistJourney(nextState, context, actionOverride);
        return true;
      };
      const profileOption = (candidate) => {
        const current = candidate === activeProfile ? " (current)" : "";
        return `${candidate}${current} \u2014 ${getQlooProfileDefinition(candidate).summary}`;
      };
      const activateProfile = (nextProfile, context, reason = "resume") => {
        const previousProfile = activeProfile;
        activeProfile = nextProfile;
        pi.setActiveTools([...activeAllowedToolNames()]);
        if (previousProfile !== nextProfile) {
          recordLedger({
            category: "profile",
            action: "changed",
            summary: `${previousProfile} \u2192 ${nextProfile} (${reason})`,
            details: {
              from_profile: previousProfile,
              to_profile: nextProfile,
              reason
            }
          });
        }
        const definition = activeDefinition();
        const status = `Qloo \xB7 ${nextProfile}`;
        context?.ui?.setStatus?.("qloo-profile", context.ui.theme?.fg("accent", status) ?? status);
        const message = reason === "resume" ? `Qloo resumed in the read-only ${nextProfile} profile; prior build authority was not restored.` : reason === "journey" ? `Qloo switched to the ${nextProfile} profile for this guided path.` : `Qloo switched to the ${nextProfile} profile.`;
        context?.ui?.notify(`${message}
${definition.authorityNotice}`, reason === "resume" || definition.allowDirectShell ? "warning" : "info");
      };
      const restoreLastQlooResult = (context) => {
        const entries = context.sessionManager?.getBranch() ?? [];
        ledger.restore(entries);
        freeformGoalRecorded = ledger.list("goal").length > 0;
        observedWorkflowCorrelations.clear();
        for (const event of ledger.list("workflow")) {
          const correlationId = event.references?.correlation_id;
          const operation = event.details?.operation;
          if (correlationId && typeof operation === "string") {
            observedWorkflowCorrelations.set(correlationId, operation);
          }
        }
        resolutionMemory.restore(entries);
        lastQlooResult = void 0;
        lastQlooRawResult = void 0;
        lastQlooInput = void 0;
        lastQlooToolName = void 0;
        rawPage = 1;
        currentAnswerId = void 0;
        currentAnswerWorkflows.splice(0, currentAnswerWorkflows.length);
        requestPreviewCursor = -1;
        latestAnswerScopeStarted = false;
        activeJourney = void 0;
        createdArtifacts.splice(0, createdArtifacts.length);
        for (const entry of entries) {
          if (entry === null || typeof entry !== "object" || Array.isArray(entry))
            continue;
          const record = entry;
          if (record.type !== "custom" || record.customType !== QLOO_ARTIFACT_STATE_ENTRY_TYPE)
            continue;
          if (isQlooArtifactDetails(record.data))
            createdArtifacts.push(record.data);
        }
        if (createdArtifacts.length > 20) {
          createdArtifacts.splice(0, createdArtifacts.length - 20);
        }
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          const entry = entries[index];
          if (entry === null || typeof entry !== "object" || Array.isArray(entry))
            continue;
          const record = entry;
          if (record.type !== "custom" || record.customType !== QLOO_JOURNEY_STATE_ENTRY_TYPE)
            continue;
          activeJourney = parseQlooJourneyState(record.data);
          if (activeJourney)
            break;
        }
        const restoredWorkflows = [];
        let restoredAnswerId;
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          const entry = entries[index];
          if (entry === null || typeof entry !== "object")
            continue;
          const record = entry;
          if (record.type !== "custom" || record.customType !== QLOO_SESSION_STATE_ENTRY_TYPE)
            continue;
          const data = record.data;
          if (data === null || typeof data !== "object" || Array.isArray(data))
            continue;
          const state = data;
          const workflow = state.workflow;
          if (workflow === null || typeof workflow !== "object" || Array.isArray(workflow))
            continue;
          const answerId = typeof state.answer_id === "string" && state.answer_id.length > 0 ? state.answer_id : void 0;
          if (restoredWorkflows.length === 0) {
            restoredAnswerId = answerId;
          } else if (!restoredAnswerId || answerId !== restoredAnswerId) {
            break;
          }
          restoredWorkflows.push(workflow);
          if (!restoredAnswerId || restoredWorkflows.length >= QLOO_REQUEST_WORKFLOW_HISTORY_LIMIT)
            break;
        }
        restoredWorkflows.reverse();
        currentAnswerWorkflows.push(...restoredWorkflows);
        currentAnswerId = restoredAnswerId;
        latestAnswerScopeStarted = restoredWorkflows.length > 0;
        lastQlooResult = currentAnswerWorkflows.at(-1);
        if (lastQlooResult) {
          const restoredInput = lastQlooResult.input;
          if (restoredInput !== null && typeof restoredInput === "object" && !Array.isArray(restoredInput)) {
            lastQlooInput = restoredInput;
          }
          if (typeof lastQlooResult.tool_name === "string") {
            lastQlooToolName = lastQlooResult.tool_name;
          }
          const correlationId = workflowCorrelationId(lastQlooResult);
          if (correlationId) {
            observedWorkflowCorrelations.set(correlationId, typeof lastQlooResult.operation === "string" ? lastQlooResult.operation : "qloo_workflow");
          }
        }
      };
      const notifyReadable = (context, label, body) => {
        const message = context.mode === "tui" ? [
          context.ui.theme.fg("accent", label),
          context.ui.theme.fg("text", body)
        ].join("\n") : `${label}
${body}`;
        context.ui.notify(message);
      };
      const renderBoundedJson = (value, maximumCharacters) => {
        const serialized = JSON.stringify(redactSensitiveResult(value), null, 2);
        return serialized.length > maximumCharacters ? `${serialized.slice(0, maximumCharacters)}
\u2026` : serialized;
      };
      const notifyJson = (context, label, value, maximumCharacters = 4e3) => {
        notifyReadable(context, label, renderBoundedJson(value, maximumCharacters));
      };
      const setNextWidget = (context) => {
        if (context?.mode !== "tui" || !context.ui?.setWidget)
          return;
        context.ui.setWidget(QLOO_NEXT_WIDGET_KEY, ["Next: /next follow-up \xB7 /why interpretation \xB7 /request API request \xB7 /matches remembered choices"], { placement: "belowEditor" });
      };
      const bindingLabel = (binding, index) => {
        const prefix = index === void 0 ? "" : `${index + 1}. `;
        const scope = binding.scope ? ` \xB7 ${binding.scope.replace(/^urn:entity:/u, "")}` : "";
        return `${prefix}${binding.input} \u2192 ${binding.selected.name} \xB7 ${binding.input_kind}${scope}`;
      };
      const decorateConfirmedChoices = (details, bindings) => {
        if (bindings.length === 0)
          return { ...details };
        const resolution = details.resolution !== null && typeof details.resolution === "object" && !Array.isArray(details.resolution) ? details.resolution : {};
        return {
          ...details,
          resolution: {
            ...resolution,
            confirmed_choices: bindings.map((binding) => ({
              input: binding.input,
              input_kind: binding.input_kind,
              field: binding.field,
              ...binding.scope ? { scope: binding.scope } : {},
              selected: { ...binding.selected },
              instruction: "Reuse this Qloo identifier verbatim for this meaning in later calls."
            }))
          }
        };
      };
      const showRememberedMatches = async (args, context) => {
        if (args.trim().length > 0) {
          context.ui.notify("Usage: /matches", "warning");
          return;
        }
        const bindings = resolutionMemory.list();
        if (bindings.length === 0) {
          context.ui.notify("No user-confirmed Qloo matches are remembered in this session.");
          return;
        }
        const visible = bindings.slice(-20);
        const forgetLabels = visible.map((binding2, index2) => `Forget ${bindingLabel(binding2, index2)}`);
        const clearLabel = `Forget all ${bindings.length} remembered matches`;
        const cancelLabel = "Keep remembered matches";
        const selected = await context.ui.select("Remembered Qloo matches", [...forgetLabels, clearLabel, cancelLabel]);
        if (!selected || selected === cancelLabel)
          return;
        if (selected === clearLabel) {
          const confirmed = await context.ui.confirm("Forget all remembered Qloo matches?", "The harness will ask again when any of these inputs are ambiguous.");
          if (!confirmed)
            return;
          resolutionMemory.clear();
          pi.appendEntry(QLOO_RESOLUTION_CHOICE_ENTRY_TYPE, clearResolutionChoicesEvent());
          recordLedger({
            category: "decision",
            action: "resolution_cleared",
            summary: `Cleared ${bindings.length} remembered Qloo resolution decisions`,
            details: { choice_count: bindings.length }
          });
          context.ui.notify("Forgot all remembered Qloo matches.");
          return;
        }
        const index = forgetLabels.indexOf(selected);
        const binding = visible[index];
        if (index < 0 || !binding || !resolutionMemory.forget(binding))
          return;
        pi.appendEntry(QLOO_RESOLUTION_CHOICE_ENTRY_TYPE, forgetResolutionChoiceEvent(binding));
        recordLedger({
          category: "decision",
          action: "resolution_forgotten",
          summary: `Forgot the remembered match for ${binding.input.slice(0, 100)}`,
          details: {
            input_kind: binding.input_kind,
            selected_id: binding.selected.id,
            selected_name: binding.selected.name
          }
        });
        context.ui.notify(`Forgot \u201C${binding.input}\u201D \u2192 ${binding.selected.name}.`);
      };
      const recordQlooResult = (toolName, input, details, context) => {
        const boundedInput = boundedWorkflowInput(input);
        const boundedResolution = boundedJsonValue(details.resolution, 24576);
        const boundedWarnings = boundedJsonValue(details.warnings, 4096);
        const boundedProvenance = boundedJsonValue(details.provenance, 24576);
        const boundedExecution = boundedJsonValue(details.execution, 4096);
        lastQlooRawResult = details;
        rawPage = 1;
        lastQlooInput = boundedInput;
        lastQlooToolName = toolName;
        lastQlooResult = {
          schema_version: details.schema_version,
          operation: details.operation,
          tool_name: toolName,
          ...boundedInput ? { input: boundedInput } : {},
          status: details.status,
          result_count: details.result_count,
          query_intent: details.query_intent,
          error: details.error,
          ...boundedResolution !== void 0 ? { resolution: boundedResolution } : {},
          ...boundedWarnings !== void 0 ? { warnings: boundedWarnings } : {},
          ...boundedProvenance !== void 0 ? { provenance: boundedProvenance } : {},
          ...boundedExecution !== void 0 ? { execution: boundedExecution } : {}
        };
        const answerId = ensureAnswerRequestScope();
        currentAnswerWorkflows.push(lastQlooResult);
        if (currentAnswerWorkflows.length > QLOO_REQUEST_WORKFLOW_HISTORY_LIMIT) {
          currentAnswerWorkflows.splice(0, currentAnswerWorkflows.length - QLOO_REQUEST_WORKFLOW_HISTORY_LIMIT);
        }
        requestPreviewCursor = -1;
        pi.appendEntry(QLOO_SESSION_STATE_ENTRY_TYPE, {
          schema_version: QLOO_SESSION_STATE_SCHEMA_VERSION,
          profile: activeProfile,
          answer_id: answerId,
          workflow: lastQlooResult
        });
        const operation = typeof details.operation === "string" ? details.operation.slice(0, 100) : toolName.slice(0, 100);
        const status = typeof details.status === "string" ? details.status.slice(0, 100) : "unknown";
        const correlationId = workflowCorrelationId(details);
        if (correlationId)
          observedWorkflowCorrelations.set(correlationId, operation);
        const execution = details.execution !== null && typeof details.execution === "object" && !Array.isArray(details.execution) ? details.execution : void 0;
        const resultCount = Number.isSafeInteger(details.result_count) ? details.result_count : void 0;
        recordLedger({
          category: "workflow",
          action: status === "error" ? "failed" : "completed",
          summary: `${operation} ${status}${resultCount === void 0 ? "" : ` with ${resultCount} results`}`,
          ...ledgerReferences({ correlationId }) ? {
            references: ledgerReferences({ correlationId })
          } : {},
          details: safeDetails({
            operation,
            tool_name: toolName,
            status,
            result_count: resultCount,
            transport: typeof execution?.transport === "string" ? execution.transport.slice(0, 100) : void 0
          })
        });
        setNextWidget(context);
        const advanced = transitionJourney((state) => advanceQlooJourneyForWorkflow(state, details.status), context);
        if (advanced && activeJourney?.current_step === "inspect-request") {
          context.ui.notify("Journey milestone ready: run /request to inspect the recorded API request.");
        }
      };
      const recordArtifact = (details, context) => {
        createdArtifacts.push(details);
        if (createdArtifacts.length > 20)
          createdArtifacts.splice(0, createdArtifacts.length - 20);
        pi.appendEntry(QLOO_ARTIFACT_STATE_ENTRY_TYPE, details);
        const sourceCorrelationId = details.source_correlation_ids.at(-1);
        recordLedger({
          category: "artifact",
          action: "created",
          summary: `${details.filename} created privately (${details.media_type}, ${details.size_bytes} bytes)`,
          ...ledgerReferences({ correlationId: sourceCorrelationId }) ? {
            references: ledgerReferences({ correlationId: sourceCorrelationId })
          } : {},
          details: {
            filename: details.filename,
            relative_path: details.relative_path,
            media_type: details.media_type,
            size_bytes: details.size_bytes,
            sha256: details.sha256,
            active_html: details.active_content,
            source_correlation_ids: details.source_correlation_ids
          }
        });
        const artifact = {
          filename: details.filename,
          media_type: details.media_type,
          path: details.path,
          size_bytes: details.size_bytes,
          sha256: details.sha256
        };
        transitionJourney((state) => advanceQlooJourneyForArtifact(state, artifact), context);
      };
      const recordIntegrationPlan = (details, context) => {
        const plan = {
          plan_id: details.plan_id,
          status: details.status,
          path: details.path
        };
        recordLedger({
          category: "plan",
          action: "created",
          summary: `Integration plan ${details.plan_id} saved with status ${details.status}`,
          details: {
            plan_id: details.plan_id,
            status: details.status
          }
        });
        transitionJourney((state) => advanceQlooJourneyForPlan(state, plan), context);
        if (details.status === "needs_input") {
          context.ui.notify("The typed plan was saved with unresolved decisions. The journey will remain on project mapping until those decisions are resolved.", "warning");
        }
      };
      const showArtifacts = (args, context) => {
        if (args.trim().length > 0) {
          context.ui.notify("Usage: /artifacts", "warning");
          return;
        }
        if (createdArtifacts.length === 0) {
          context.ui.notify("No files have been created in this Qloo session yet.");
          return;
        }
        const lines = createdArtifacts.slice(-10).reverse().flatMap((artifact, index) => [
          `${index + 1}. ${artifact.title ? `${artifact.title} \xB7 ` : ""}${artifact.filename} \xB7 ${artifact.media_type} \xB7 ${artifact.size_bytes} bytes`,
          `   ${artifact.path}${artifact.active_content ? " \xB7 active local HTML; review before opening" : ""}`,
          ...artifact.source_correlation_ids.length > 0 ? [`   Qloo sources: ${artifact.source_correlation_ids.join(", ")}`] : []
        ]);
        notifyReadable(context, "Qloo session artifacts", lines.join("\n"));
      };
      const showTrace = (args, context) => {
        const requested = args.trim().toLowerCase();
        const aliases = {
          goals: "goal",
          clarifications: "clarification",
          decisions: "decision",
          profiles: "profile",
          approvals: "approval",
          workflows: "workflow",
          files: "file",
          artifacts: "artifact",
          verifications: "verification",
          journeys: "journey",
          plans: "plan"
        };
        const category = requested === "" || requested === "all" ? void 0 : aliases[requested] ?? (QLOO_LEDGER_CATEGORIES.includes(requested) ? requested : void 0);
        if (requested !== "" && requested !== "all" && category === void 0) {
          context.ui.notify(`Usage: /trace [all|${QLOO_LEDGER_CATEGORIES.join("|")}]`, "warning");
          return;
        }
        const limit = requested === "all" ? 50 : 20;
        const events = ledger.list(category).slice(-limit);
        if (events.length === 0) {
          context.ui.notify(category ? `No ${category} events are recorded in this Qloo session branch.` : "No durable Qloo events are recorded in this session branch yet.");
          return;
        }
        notifyReadable(context, "Qloo durable session trace", [
          ...events.map(formatQlooLedgerEvent),
          "Prompts, result bodies, file contents, command text, and credentials are excluded."
        ].join("\n"));
      };
      const recordToolOutcome = (event, context) => {
        const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
        if (event.toolName === "read" || event.toolName === "edit" || event.toolName === "write") {
          const reference = qlooLedgerFileReference(event.input.path ?? event.input.file_path, cwd);
          if (reference) {
            const action = event.toolName === "read" ? "read" : "changed";
            const status2 = event.isError ? "failed" : "succeeded";
            recordLedger({
              category: "file",
              action,
              summary: `${event.toolName} ${reference.path} ${status2}`,
              ...ledgerReferences({ toolCallId: event.toolCallId }) ? {
                references: ledgerReferences({ toolCallId: event.toolCallId })
              } : {},
              details: {
                operation: event.toolName,
                path: reference.path,
                scope: reference.scope,
                status: status2
              }
            });
          }
        }
        if (event.toolName !== "bash")
          return;
        const verification = classifyQlooVerificationCommand(event.input.command);
        if (!verification)
          return;
        const status = event.isError ? "failed" : "passed";
        recordLedger({
          category: "verification",
          action: "completed",
          summary: `${verification.kind} verification ${status}`,
          ...ledgerReferences({ toolCallId: event.toolCallId }) ? {
            references: ledgerReferences({ toolCallId: event.toolCallId })
          } : {},
          details: {
            verification_kind: verification.kind,
            status,
            invocation_sha256: verification.sha256,
            invocation_size_bytes: verification.size_bytes,
            initiated_by: "agent"
          }
        });
      };
      const approvalDetails = (toolName, input, cwd) => {
        if (toolName === "bash") {
          const fingerprint = typeof input.command === "string" ? fingerprintQlooLedgerText(input.command) : void 0;
          const verification = classifyQlooVerificationCommand(input.command);
          return safeDetails({
            tool_name: toolName,
            target_kind: verification ? `verification:${verification.kind}` : "shell",
            invocation_sha256: fingerprint?.sha256,
            invocation_size_bytes: fingerprint?.size_bytes
          });
        }
        const reference = qlooLedgerFileReference(input.path ?? input.file_path, cwd);
        return safeDetails({
          tool_name: toolName,
          target_kind: reference ? "file" : "tool",
          path: reference?.path,
          scope: reference?.scope
        });
      };
      const runDoctorAction = async (context, network, compact = false, recovery) => {
        if (!commandActions.doctor) {
          context.ui.notify("In-chat diagnostics are unavailable in this embedded runtime. Run qloo doctor --network.", "warning");
          return;
        }
        context.ui.notify(network ? "Running bounded Qloo network diagnostics\u2026" : "Running Qloo diagnostics\u2026");
        try {
          const report = await commandActions.doctor(network);
          if (compact) {
            context.ui.notify(compactDoctorRecovery(report, recovery));
          } else {
            notifyJson(context, "Qloo doctor", report, 8e3);
          }
        } catch {
          context.ui.notify("Qloo diagnostics could not complete. Run qloo doctor --network from the terminal.", "error");
        }
      };
      const showRequestAction = (context, args = "") => {
        if (latestAnswerScopeStarted && currentAnswerWorkflows.length === 0) {
          context.ui.notify("No Qloo API request was recorded while answering the latest user prompt.", "warning");
          return false;
        }
        const workflows = currentAnswerWorkflows.length > 0 ? currentAnswerWorkflows : lastQlooResult ? [lastQlooResult] : [];
        if (workflows.length === 0) {
          context.ui.notify("No Qloo workflow request has been recorded in this session yet.", "warning");
          return false;
        }
        const requests = recordedRequestPreviews(workflows);
        if (requests.length === 0) {
          context.ui.notify("This transport did not expose a safe request preview. Use /why and /sources to inspect the normalized workflow.", "warning");
          return false;
        }
        const selectedIndex = requestPreviewSelection(args, requestPreviewCursor, requests.length);
        if (selectedIndex === void 0) {
          context.ui.notify(`Usage: /request [next|prev|first|latest|1-${requests.length}]`, "warning");
          return false;
        }
        requestPreviewCursor = selectedIndex;
        const selected = requests[selectedIndex];
        if (!selected)
          return false;
        const withinStage = selected.requestCountWithinStage > 1 ? ` \xB7 query ${selected.requestNumberWithinStage} of ${selected.requestCountWithinStage}` : "";
        const label = [
          selectedIndex === requests.length - 1 ? "Latest Qloo API request" : "Qloo API request",
          `${selectedIndex + 1} of ${requests.length}`,
          `stage ${selected.stageNumber} of ${selected.stageCount}`,
          selected.operation
        ].join(" \xB7 ") + withinStage;
        const navigation = requests.length > 1 ? `Navigate: /request prev \xB7 /request next \xB7 /request first \xB7 /request latest \xB7 /request <1-${requests.length}>` : "Only one API request was recorded for the latest answer.";
        notifyReadable(context, label, `${renderBoundedJson(selected.request, 12e3)}

${navigation}`);
        const advanced = transitionJourney(advanceQlooJourneyForRequest, context);
        if (advanced && activeJourney?.current_step === "create-artifact") {
          context.ui.setEditorText("Create the requested self-contained artifact from the latest Qloo result. Use the filename and format I specified; if either is still missing, ask me for it.");
          context.ui.notify("Request inspected. The artifact milestone is ready in your editor.");
        } else if (advanced && activeJourney?.current_step === "map-integration") {
          context.ui.setEditorText("Map this Qloo request onto the current project and create a typed integration plan. Ask me only about unresolved decisions that would materially change the implementation.");
          context.ui.notify("Request inspected. The project-mapping milestone is ready in your editor.");
        }
        return true;
      };
      const retryLastWorkflow = async (context) => {
        if (!lastQlooToolName || !lastQlooInput) {
          context.ui.notify("No replayable Qloo workflow input has been recorded in this session yet.", "warning");
          return;
        }
        if (!commandActions.retry) {
          context.ui.notify("Retry is unavailable in this embedded runtime.", "warning");
          return;
        }
        context.ui.notify(`Retrying ${lastQlooToolName} once on ${runtimeInfo?.transport ?? "the selected transport"}\u2026`);
        try {
          const details = await commandActions.retry(lastQlooToolName, lastQlooInput);
          recordQlooResult(lastQlooToolName, lastQlooInput, details, context);
          context.ui.notify([
            `${lastQlooToolName} retry completed.`,
            `Status: ${String(details.status ?? "unknown")}`,
            `Results: ${String(details.result_count ?? "unknown")}`,
            "Use /next, /raw, /why, /request, /sources, or /trace to inspect it."
          ].join("\n"));
        } catch {
          context.ui.notify("The Qloo retry failed inside the harness. Use /trace or qloo doctor --network.", "error");
        }
      };
      const activateGuidedGoal = (goal, context) => {
        if (goal.profile && goal.profile !== activeProfile) {
          activateProfile(goal.profile, context, "journey");
        }
      };
      const showGuidedStart = async (context) => {
        if (context.mode !== "tui" || !context.hasUI) {
          context.ui.notify("Guided start is available in the interactive terminal.", "warning");
          return;
        }
        context.ui.setWidget(QLOO_START_WIDGET_KEY, void 0);
        const selected = await context.ui.select("What would you like to do with Qloo?", QLOO_GUIDED_GOALS.map(guidedGoalLabel));
        if (!selected)
          return;
        const goal = findGuidedGoal(selected);
        if (!goal)
          return;
        freeformGoalRecorded = true;
        recordLedger({
          category: "goal",
          action: "selected",
          summary: `${goal.label} selected from guided start`,
          details: {
            goal_type: "guided_start",
            goal_id: goal.id
          }
        });
        activateGuidedGoal(goal, context);
        if (goal.id === "diagnose") {
          await runDoctorAction(context, true);
          return;
        }
        if (goal.id === "blank" || goal.starters.length === 0)
          return;
        const ownPrompt = "Write my own prompt";
        const starterLabel = await context.ui.select(goal.label, [...goal.starters.map(({ label }) => label), ownPrompt]);
        if (!starterLabel || starterLabel === ownPrompt)
          return;
        const starter = goal.starters.find(({ label }) => label === starterLabel);
        if (!starter)
          return;
        context.ui.setEditorText(starter.prompt);
        context.ui.notify("Starter added to the editor. Replace the bracketed details, then press Enter.");
      };
      const journeyRequirements = (journey) => {
        const required = journey.id === "question-to-artifact" ? [QLOO_CREATE_ARTIFACT_TOOL_NAME] : journey.id === "question-to-integration" ? ["qloo_capabilities", "qloo_project_context", QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME] : [];
        if (![...allowedToolNames].some(isQlooWorkflowToolName)) {
          return ["a canonical Qloo workflow tool", ...required.filter((name) => !allowedToolNames.has(name))];
        }
        return required.filter((name) => !allowedToolNames.has(name));
      };
      const startJourney = async (journey, context) => {
        const missing = journeyRequirements(journey);
        if (missing.length > 0) {
          context.ui.notify(`This embedded runtime cannot start ${journey.label}; missing ${missing.join(", ")}.`, "warning");
          return;
        }
        if (activeJourney && (activeJourney.status === "active" || activeJourney.status === "paused")) {
          if (!context.hasUI) {
            context.ui.notify("Stop the active Qloo Journey before starting another one.", "warning");
            return;
          }
          const current = findQlooJourney(activeJourney.journey_id);
          const confirmed = await context.ui.confirm(`Replace ${current?.label ?? "the active journey"}?`, "Its recorded progress will remain in session history, but the new journey becomes active.");
          if (!confirmed)
            return;
        }
        if (journey.profile !== activeProfile)
          activateProfile(journey.profile, context, "journey");
        persistJourney(createQlooJourneyState(journey.id), context);
        if (context.mode === "tui") {
          context.ui.setWidget(QLOO_START_WIDGET_KEY, void 0);
          context.ui.setEditorText(journey.starterPrompt);
        }
        context.ui.notify([
          `${journey.label} started in the ${journey.profile} profile.`,
          getQlooProfileDefinition(journey.profile).authorityNotice,
          "Edit the starter prompt and press Enter. Controls: /journey status|pause|resume|skip|stop"
        ].join("\n"));
      };
      const showJourneyStatus = (context) => {
        if (!activeJourney) {
          context.ui.notify("No Qloo Journey has been started. Run /journey to choose one.");
          return;
        }
        const definition = findQlooJourney(activeJourney.journey_id);
        const progress = qlooJourneyProgress(activeJourney);
        notifyReadable(context, "Qloo Journey", [
          `Journey: ${definition?.label ?? activeJourney.journey_id}`,
          `Status: ${activeJourney.status}`,
          `Progress: ${progress.current} / ${progress.total}`,
          `Milestone: ${progress.label}`,
          `Successful Qloo queries: ${activeJourney.successful_queries}`,
          `Request inspected: ${activeJourney.request_inspected ? "yes" : "no"}`,
          ...activeJourney.artifact ? [`Artifact: ${activeJourney.artifact.path}`] : [],
          ...activeJourney.plan ? [
            `Plan: ${activeJourney.plan.plan_id} (${activeJourney.plan.status})`,
            `Plan path: ${activeJourney.plan.path}`
          ] : []
        ].join("\n"));
      };
      const seedJourneyStep = (context) => {
        if (activeJourney?.current_step === "create-artifact") {
          context.ui.setEditorText("Create the requested self-contained artifact from the latest Qloo result. Ask me for the filename or format only if it is still missing.");
        } else if (activeJourney?.current_step === "map-integration") {
          context.ui.setEditorText("Map the latest Qloo workflow onto this project and create a typed integration plan. Ask only about material unresolved decisions.");
        } else if (activeJourney?.current_step === "interpret") {
          context.ui.setEditorText("Finish this journey by explaining the strongest supported insight, assumptions, limitations, and provenance from the latest Qloo result.");
        }
      };
      const handleJourneyCommand = async (args, context) => {
        const requested = args.trim().toLowerCase();
        if (requested === "status") {
          showJourneyStatus(context);
          return;
        }
        if (requested === "pause" || requested === "resume" || requested === "stop") {
          if (!activeJourney) {
            context.ui.notify("No Qloo Journey has been started.", "warning");
            return;
          }
          const targetStatus = requested === "pause" ? "paused" : requested === "resume" ? "active" : "cancelled";
          const next = setQlooJourneyStatus(activeJourney, targetStatus);
          if (next === activeJourney) {
            context.ui.notify(`Journey cannot ${requested} from status ${activeJourney.status}.`, "warning");
            return;
          }
          persistJourney(next, context);
          context.ui.notify(`Qloo Journey ${targetStatus}.`);
          return;
        }
        if (requested === "skip") {
          if (!activeJourney) {
            context.ui.notify("No Qloo Journey has been started.", "warning");
            return;
          }
          const next = skipQlooJourneyStep(activeJourney);
          if (next === activeJourney) {
            context.ui.notify("This journey milestone is required and cannot be skipped.", "warning");
            return;
          }
          persistJourney(next, context, "skipped");
          seedJourneyStep(context);
          context.ui.notify(`Skipped to: ${qlooJourneyProgress(next).label}`);
          return;
        }
        let journey = requested ? findQlooJourney(requested) : void 0;
        if (!requested) {
          if (context.mode !== "tui" || !context.hasUI) {
            context.ui.notify("Usage: /journey [insight|artifact|integration|status|pause|resume|skip|stop]", "warning");
            return;
          }
          const selected = await context.ui.select("Choose a Qloo Journey", QLOO_JOURNEYS.map(qlooJourneyLabel));
          if (!selected)
            return;
          journey = findQlooJourney(selected);
        }
        if (!journey) {
          context.ui.notify("Usage: /journey [insight|artifact|integration|status|pause|resume|skip|stop]", "warning");
          return;
        }
        await startJourney(journey, context);
      };
      const showStarterIdeas = (context) => {
        if (context.mode !== "tui" || !context.hasUI)
          return;
        context.ui.setWidget(QLOO_START_WIDGET_KEY, (_tui, theme) => ({
          render(width) {
            const lines = qlooStarterIdeaLines(width);
            return lines.map((line, index) => {
              if (index === 0)
                return theme.bold(theme.fg("accent", line));
              if (index === lines.length - 1)
                return theme.fg("dim", line);
              return theme.fg("muted", line);
            });
          },
          invalidate() {
          }
        }));
      };
      const showOrSwitchProfile = async (args, context) => {
        const requested = args.trim().toLowerCase();
        let nextProfile;
        if (requested.length === 0) {
          if (context.mode !== "tui" || !context.hasUI) {
            context.ui.notify(`Usage: /mode [${QLOO_HARNESS_PROFILES.join("|")}]`, "warning");
            return;
          }
          const options = QLOO_HARNESS_PROFILES.map(profileOption);
          const selected = await context.ui.select("Choose a Qloo profile", options);
          nextProfile = QLOO_HARNESS_PROFILES.find((candidate) => profileOption(candidate) === selected);
          if (!nextProfile)
            return;
        } else if (isQlooHarnessProfile(requested)) {
          nextProfile = requested;
        } else {
          context.ui.notify(`Usage: /mode [${QLOO_HARNESS_PROFILES.join("|")}]`, "warning");
          return;
        }
        const definition = getQlooProfileDefinition(nextProfile);
        if (nextProfile === activeProfile) {
          notifyReadable(context, `Qloo \xB7 ${nextProfile} profile`, definition.authorityNotice);
          return;
        }
        if (context.mode !== "tui" || !context.hasUI) {
          context.ui.notify("Profile switching requires the interactive terminal so Qloo can show and confirm the new authority.", "warning");
          return;
        }
        const confirmed = await context.ui.confirm(`Switch from ${activeProfile} to ${nextProfile}?`, definition.authorityNotice);
        if (!confirmed) {
          context.ui.notify(`Profile unchanged: ${activeProfile}.`);
          return;
        }
        activateProfile(nextProfile, context, "mode");
      };
      const showNextActions = async (context) => {
        if (!lastQlooResult) {
          context.ui.notify("No Qloo result is available yet. Use /start for guided examples.", "warning");
          return;
        }
        const actions = qlooNextActions(lastQlooResult);
        const selected = await context.ui.select("What would you like to do next?", actions.map(({ label }) => label));
        const action = actions.find(({ label }) => label === selected);
        if (!action)
          return;
        if (action.kind === "prompt") {
          if (action.profile && action.profile !== activeProfile) {
            activateProfile(action.profile, context, "journey");
          }
          context.ui.setEditorText(action.value);
          return;
        }
        if (action.value === "request")
          showRequestAction(context);
        else if (action.value === "why") {
          notifyJson(context, "Latest Qloo query intent", lastQlooResult.query_intent);
        } else if (action.value === "doctor network") {
          await runDoctorAction(context, true);
        } else if (action.value === "retry") {
          await retryLastWorkflow(context);
        }
      };
      const maybeRunAutomaticDiagnosis = async (details, context) => {
        if (diagnosedThisTurn || !commandActions.doctor || details.status !== "error")
          return;
        const error = details.error;
        if (error === null || typeof error !== "object" || Array.isArray(error))
          return;
        const errorRecord = error;
        if (typeof errorRecord.code !== "string" || !AUTOMATIC_DIAGNOSTIC_CODES.has(errorRecord.code)) {
          return;
        }
        diagnosedThisTurn = true;
        await runDoctorAction(context, true, true, errorRecord.recovery);
      };
      pi.registerCommand("start", {
        description: "Choose a guided Qloo goal and editable starter prompt",
        handler: async (_args, context) => showGuidedStart(context)
      });
      pi.registerCommand("journey", {
        description: "Start or manage a resumable Qloo capability journey",
        handler: async (args, context) => handleJourneyCommand(args, context)
      });
      pi.registerCommand("mode", {
        description: "Show or switch Qloo profiles with an authority warning",
        handler: async (args, context) => showOrSwitchProfile(args, context)
      });
      pi.registerCommand("exit", {
        description: "Exit the Qloo harness cleanly",
        handler: async (_args, context) => context.shutdown()
      });
      pi.registerCommand("status", {
        description: "Show Qloo profile, transport, model, workspace, and context usage",
        handler: async (_args, context) => {
          const usage = context.getContextUsage();
          const model = context.model ? `${context.model.provider}/${context.model.id}` : "unavailable";
          notifyReadable(context, "Qloo status", [
            `Profile: ${activeProfile}`,
            `Transport: ${runtimeInfo ? `${runtimeInfo.transport} (${runtimeInfo.transportName})` : "not declared"}`,
            `Resolution: ${runtimeInfo?.resolution ? `${runtimeInfo.resolution.name} (${runtimeInfo.resolution.tag_strategy}${runtimeInfo.resolution.uses_model ? ", model-assisted" : ""})` : "not declared"}`,
            `Fallback: ${runtimeInfo?.fallback ?? "none"}`,
            `Model: ${model}`,
            `Workspace: ${context.cwd}`,
            `Remembered matches: ${resolutionMemory.list().length}`,
            `Journey: ${activeJourney ? `${findQlooJourney(activeJourney.journey_id)?.label ?? activeJourney.journey_id} (${activeJourney.status})` : "none"}`,
            `Session artifacts: ${createdArtifacts.length}`,
            `Context: ${formatContextUsage(usage)}`,
            `Turn budget: ${activeDefinition().maxToolCallsPerTurn} calls; ${activeDefinition().maxIdenticalToolCallsPerTurn} identical calls`
          ].join("\n"));
        }
      });
      pi.registerCommand("usage", {
        description: "Show current model context-window usage",
        handler: async (_args, context) => {
          const model = context.model ? `${context.model.provider}/${context.model.id}` : "unavailable";
          notifyReadable(context, "Qloo context usage", [
            `Model: ${model}`,
            `Context used: ${formatContextUsage(context.getContextUsage())}`
          ].join("\n"));
        }
      });
      pi.registerCommand("why", {
        description: "Show the normalized intent for the latest Qloo workflow",
        handler: async (_args, context) => {
          if (!lastQlooResult?.query_intent) {
            context.ui.notify("No Qloo workflow intent has been recorded in this session yet.", "warning");
            return;
          }
          notifyJson(context, "Latest Qloo query intent", lastQlooResult.query_intent);
        }
      });
      pi.registerCommand("sources", {
        description: "Show contract and API provenance for the latest Qloo workflow",
        handler: async (_args, context) => {
          if (!lastQlooResult) {
            context.ui.notify("No Qloo workflow provenance has been recorded in this session yet.", "warning");
            return;
          }
          notifyJson(context, "Latest Qloo provenance", {
            schema_version: lastQlooResult.schema_version,
            operation: lastQlooResult.operation,
            resolution: lastQlooResult.resolution,
            warnings: lastQlooResult.warnings,
            provenance: lastQlooResult.provenance
          });
        }
      });
      pi.registerCommand("request", {
        description: "Inspect API requests for the latest answer; pass next, prev, first, latest, or a number",
        handler: async (args, context) => {
          showRequestAction(context, args);
        }
      });
      pi.registerCommand("artifacts", {
        description: "List files created privately in this Qloo session",
        handler: async (args, context) => showArtifacts(args, context)
      });
      pi.registerCommand("trace", {
        description: "Show the durable causal history; optionally filter by event category",
        handler: async (args, context) => showTrace(args, context)
      });
      pi.registerCommand("raw", {
        description: "Show a bounded result page; pass a page number, next, or prev",
        handler: async (args, context) => {
          if (!lastQlooRawResult) {
            context.ui.notify(lastQlooResult ? "The latest raw result is not duplicated across resume. Use /retry to execute the recorded input again." : "No Qloo workflow result has been recorded in this session yet.", "warning");
            return;
          }
          const requestedPage = parseQlooRawPage(args, rawPage);
          if (requestedPage === void 0) {
            context.ui.notify("Usage: /raw [page|next|prev]", "warning");
            return;
          }
          const page = paginateQlooResult(lastQlooRawResult, requestedPage);
          const pageInfo = page.page;
          if (pageInfo !== null && typeof pageInfo === "object" && !Array.isArray(pageInfo)) {
            const normalizedPage = pageInfo.number;
            if (typeof normalizedPage === "number")
              rawPage = normalizedPage;
          }
          notifyJson(context, `Latest normalized Qloo result \xB7 page ${rawPage}`, redactSensitiveResult(page), 12e3);
        }
      });
      pi.registerCommand("next", {
        description: "Choose a useful follow-up for the latest Qloo workflow",
        handler: async (_args, context) => showNextActions(context)
      });
      pi.registerCommand("doctor", {
        description: "Run static Qloo diagnostics; pass network for one active API probe",
        handler: async (args, context) => {
          const value = args.trim();
          if (value !== "" && value !== "network" && value !== "--network") {
            context.ui.notify("Usage: /doctor [network]", "warning");
            return;
          }
          const network = value !== "";
          await runDoctorAction(context, network);
        }
      });
      pi.registerCommand("retry", {
        description: "Replay the latest recorded Qloo workflow input once on the same transport",
        handler: async (args, context) => {
          if (args.trim().length > 0) {
            context.ui.notify("Usage: /retry", "warning");
            return;
          }
          await retryLastWorkflow(context);
        }
      });
      pi.registerCommand("matches", {
        description: "Inspect or forget user-confirmed Qloo entity and tag matches",
        handler: async (args, context) => showRememberedMatches(args, context)
      });
      pi.on("session_start", async (event, context) => {
        restoreLastQlooResult(context);
        const sessionReason = event.reason ?? "startup";
        recordLedger({
          category: "session",
          action: "started",
          summary: `Session ${sessionReason}`,
          details: {
            reason: sessionReason,
            resumed: sessionReason === "resume" || sessionReason === "fork"
          }
        });
        const journeyProfile = activeJourney && (activeJourney.status === "active" || activeJourney.status === "paused") ? findQlooJourney(activeJourney.journey_id)?.profile : void 0;
        const resumedProfile = journeyProfile ?? (activeProfile === "build" && sessionReason !== "startup" ? "plan" : activeProfile);
        if (resumedProfile !== activeProfile) {
          activateProfile(resumedProfile, context);
        } else {
          pi.setActiveTools([...activeAllowedToolNames()]);
        }
        if (context.mode !== "tui")
          return;
        context.ui.setTitle("Qloo");
        context.ui.setHeader((_tui, theme) => ({
          render: (width) => renderQlooHeader(theme, width, activeProfile),
          invalidate() {
          }
        }));
        context.ui.setStatus("qloo-profile", context.ui.theme.fg("accent", `Qloo \xB7 ${activeProfile}`));
        setJourneyWidget(context);
        if (!autocompletePolicyInstalled) {
          context.ui.addAutocompleteProvider((current) => ({
            ...current.triggerCharacters ? { triggerCharacters: [...current.triggerCharacters] } : {},
            async getSuggestions(lines, cursorLine, cursorCol, options) {
              const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
              if (!suggestions)
                return null;
              return {
                ...suggestions,
                items: suggestions.items.filter((item) => !isBlockedPiInteractiveCommand(item.value))
              };
            },
            applyCompletion: (...args) => current.applyCompletion(...args),
            ...current.shouldTriggerFileCompletion ? {
              shouldTriggerFileCompletion: (...args) => current.shouldTriggerFileCompletion?.(...args) ?? false
            } : {}
          }));
          autocompletePolicyInstalled = true;
        }
        const guidedStartEnabled = process.env[QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE] !== "1";
        const currentBranch = context.sessionManager?.getBranch?.() ?? [];
        const freshSession = (sessionReason === "startup" || sessionReason === "new") && !branchHasConversation(currentBranch);
        if (guidedStartEnabled && freshSession && !starterIdeasShown) {
          starterIdeasShown = true;
          showStarterIdeas(context);
        }
      });
      pi.on("session_before_compact", (event) => {
        recordLedger({
          category: "compaction",
          action: "started",
          summary: `${event.reason} compaction started`,
          details: {
            reason: event.reason,
            will_retry: event.willRetry
          }
        });
      });
      pi.on("session_compact", (event) => {
        recordLedger({
          category: "compaction",
          action: "completed",
          summary: `${event.reason} compaction completed`,
          details: {
            reason: event.reason,
            will_retry: event.willRetry,
            tokens_before: event.compactionEntry.tokensBefore,
            from_extension: event.fromExtension
          }
        });
      });
      pi.on("session_tree", (event, context) => {
        restoreLastQlooResult(context);
        recordLedger({
          category: "session",
          action: "navigated",
          summary: "Session branch changed; durable state restored from the selected branch",
          details: safeDetails({
            previous_leaf_id: event.oldLeafId ?? void 0,
            selected_leaf_id: event.newLeafId ?? void 0
          })
        });
      });
      pi.on("session_shutdown", (event) => {
        recordLedger({
          category: "session",
          action: "stopped",
          summary: `Session stopped for ${event.reason}`,
          details: { reason: event.reason }
        });
      });
      pi.on("before_agent_start", (event, context) => {
        beginAnswerRequestScope();
        const submittedPrompt = typeof event.prompt === "string" ? event.prompt : "";
        const fingerprint = submittedPrompt.length > 0 ? fingerprintQlooLedgerText(submittedPrompt) : void 0;
        if (fingerprint && activeJourney?.status === "active" && activeJourney.current_step === "refine") {
          recordLedger({
            category: "clarification",
            action: "received",
            summary: `Clarification received for ${activeJourney.journey_id}; text excluded`,
            details: {
              journey_id: activeJourney.journey_id,
              milestone: activeJourney.current_step,
              text_sha256: fingerprint.sha256,
              text_size_bytes: fingerprint.size_bytes
            }
          });
        } else if (fingerprint && !freeformGoalRecorded) {
          freeformGoalRecorded = true;
          recordLedger({
            category: "goal",
            action: "received",
            summary: "Natural-language goal received; text excluded",
            details: {
              goal_type: "natural_language",
              text_sha256: fingerprint.sha256,
              text_size_bytes: fingerprint.size_bytes
            }
          });
        }
        transitionJourney(advanceQlooJourneyForUserPrompt, context);
        let systemPrompt = event.systemPrompt;
        if (loadProfileInstructions && activeProfile !== profile) {
          const initialInstructions = loadProfileInstructions(profile);
          const activeInstructions = loadProfileInstructions(activeProfile);
          const instructionOffset = systemPrompt.lastIndexOf(initialInstructions);
          systemPrompt = instructionOffset < 0 ? [
            systemPrompt,
            `## Active Qloo ${activeProfile} profile override`,
            "This section replaces any earlier profile-specific instructions.",
            activeInstructions
          ].join("\n\n") : [
            systemPrompt.slice(0, instructionOffset),
            activeInstructions,
            systemPrompt.slice(instructionOffset + initialInstructions.length)
          ].join("");
        }
        if (activeJourney?.status === "active") {
          systemPrompt = [systemPrompt, qlooJourneyInstructions(activeJourney)].join("\n\n");
        }
        return systemPrompt === event.systemPrompt ? void 0 : { systemPrompt };
      });
      pi.on("agent_end", (_event, context) => {
        if (!agentRunHasDeliveredText(_event.messages))
          return;
        const completed = transitionJourney(completeQlooJourneyAfterAgent, context);
        if (completed) {
          const definition = activeJourney && findQlooJourney(activeJourney.journey_id);
          context.ui.notify(`${definition?.label ?? "Qloo Journey"} complete.`);
        }
      });
      pi.on("project_trust", () => ({ trusted: "no", remember: false }));
      pi.on("turn_start", (_event, context) => {
        currentTurnIndex = Number.isSafeInteger(_event.turnIndex) ? _event.turnIndex : void 0;
        diagnosedThisTurn = false;
        resolutionPromptCancelledThisTurn = false;
        toolCallsThisTurn = 0;
        identicalCallsThisTurn.clear();
        if (context.mode === "tui") {
          context.ui.setWidget(QLOO_START_WIDGET_KEY, void 0);
          context.ui.setWidget(QLOO_NEXT_WIDGET_KEY, void 0);
        }
      });
      pi.on("tool_execution_start", (event, context) => {
        if (!event.toolName.startsWith("qloo_"))
          return;
        const message = event.toolName === QLOO_CREATE_ARTIFACT_TOOL_NAME ? "Qloo \xB7 validating and saving artifact\u2026" : event.toolName === QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME ? "Qloo \xB7 validating integration plan\u2026" : isQlooWorkflowToolName(event.toolName) ? typeof event.args?.target_type === "string" ? `Qloo \xB7 ${event.args.target_type.replaceAll("_", " ")} \xB7 resolving and querying\u2026` : "Qloo \xB7 resolving and querying\u2026" : "Qloo \xB7 inspecting context\u2026";
        context.ui.setWorkingMessage(message);
      });
      pi.on("tool_execution_end", (event, context) => {
        if (!event.toolName.startsWith("qloo_"))
          return;
        context.ui.setWorkingMessage();
      });
      pi.on("message_end", (event) => {
        if (event.message.role !== "bashExecution")
          return;
        const verification = classifyQlooVerificationCommand(event.message.command);
        if (!verification)
          return;
        const passed = event.message.exitCode === 0 && !event.message.cancelled;
        recordLedger({
          category: "verification",
          action: "completed",
          summary: `${verification.kind} verification ${passed ? "passed" : "failed"}`,
          ...ledgerReferences() ? { references: ledgerReferences() } : {},
          details: {
            verification_kind: verification.kind,
            status: passed ? "passed" : "failed",
            invocation_sha256: verification.sha256,
            invocation_size_bytes: verification.size_bytes,
            initiated_by: "user"
          }
        });
      });
      pi.on("tool_result", async (event, context) => {
        recordToolOutcome(event, context);
        if (event.toolName === QLOO_CREATE_ARTIFACT_TOOL_NAME) {
          if (isQlooArtifactDetails(event.details))
            recordArtifact(event.details, context);
          return;
        }
        if (event.toolName === QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME) {
          if (isQlooInteractiveIntegrationPlanDetails(event.details)) {
            recordIntegrationPlan(event.details, context);
          }
          return;
        }
        if (!isQlooWorkflowToolName(event.toolName))
          return;
        if (event.details === null || typeof event.details !== "object" || Array.isArray(event.details))
          return;
        const details = event.details;
        const issues = resolutionCandidates(details, event.toolName, event.input);
        const retry = commandActions.retry;
        if (issues.length === 0 || !context.hasUI || !retry) {
          recordQlooResult(event.toolName, event.input, details, context);
          await maybeRunAutomaticDiagnosis(details, context);
          return;
        }
        return enqueueResolutionFlow(async () => {
          if (resolutionPromptCancelledThisTurn) {
            recordQlooResult(event.toolName, event.input, details, context);
            return;
          }
          const choices = await selectQlooResolutionChoices(context.ui, issues, context.mode === "tui");
          if (!choices) {
            resolutionPromptCancelledThisTurn = true;
            recordQlooResult(event.toolName, event.input, details, context);
            return;
          }
          const patchedInput = applyResolutionChoices(event.toolName, event.input, choices);
          if (!patchedInput) {
            recordQlooResult(event.toolName, event.input, details, context);
            return;
          }
          const remembered = resolutionMemory.remember(event.toolName, choices);
          if (remembered.length > 0) {
            pi.appendEntry(QLOO_RESOLUTION_CHOICE_ENTRY_TYPE, rememberResolutionChoicesEvent(remembered));
            for (const binding of remembered) {
              recordLedger({
                category: "decision",
                action: "resolution_selected",
                summary: `${binding.input.slice(0, 100)} \u2192 ${binding.selected.name.slice(0, 120)}`,
                details: safeDetails({
                  input_kind: binding.input_kind,
                  field: binding.field,
                  scope: binding.scope,
                  selected_id: binding.selected.id,
                  selected_name: binding.selected.name,
                  selected_type: binding.selected.type
                })
              });
            }
          }
          try {
            context.ui.setWorkingMessage("Qloo \xB7 applying your selection\u2026");
            const retriedDetails = await retry(event.toolName, patchedInput);
            const confirmedDetails = decorateConfirmedChoices(retriedDetails, remembered);
            recordQlooResult(event.toolName, patchedInput, confirmedDetails, context);
            await maybeRunAutomaticDiagnosis(confirmedDetails, context);
            return {
              content: [{ type: "text", text: JSON.stringify(confirmedDetails) }],
              details: confirmedDetails,
              isError: false
            };
          } catch {
            context.ui.notify("Qloo could not rerun the workflow with that selection. The original ambiguity is preserved.", "error");
            recordQlooResult(event.toolName, event.input, details, context);
            return;
          } finally {
            context.ui.setWorkingMessage();
          }
        });
      });
      pi.on("tool_call", async (event, context) => {
        const definition = activeDefinition();
        if (!activeAllowedToolNames().has(event.toolName)) {
          return {
            block: true,
            reason: `Tool "${event.toolName}" is unavailable in Qloo's ${activeProfile} profile.`
          };
        }
        if (isWorkspaceScopedCall(activeProfile, event.toolName)) {
          const cwd2 = typeof context.cwd === "string" ? context.cwd : process.cwd();
          const requestedPath = Reflect.get(event.input ?? {}, "path");
          const requested = typeof requestedPath === "string" ? requestedPath : void 0;
          const decision = await checkWorkspaceScope(requested, {
            cwd: cwd2,
            homeDirectory: homedir(),
            protectedDirectories: [resolveQlooPaths({ cwd: cwd2 }).qlooDir]
          });
          if (!decision.allowed)
            return { block: true, reason: decision.reason };
        }
        if (isQlooWorkflowToolName(event.toolName)) {
          const remembered = resolutionMemory.apply(event.toolName, event.input);
          if (remembered)
            Object.assign(event.input, remembered.input);
        }
        if (event.toolName === QLOO_CREATE_ARTIFACT_TOOL_NAME) {
          const requested = Array.isArray(event.input.source_correlation_ids) ? event.input.source_correlation_ids.filter((value) => typeof value === "string" && observedWorkflowCorrelations.has(value)) : [];
          const lastObserved = [...observedWorkflowCorrelations.keys()].at(-1);
          event.input.source_correlation_ids = [
            ...new Set(requested.length > 0 ? requested : lastObserved ? [lastObserved] : [])
          ].slice(-16);
        }
        toolCallsThisTurn += 1;
        if (toolCallsThisTurn > definition.maxToolCallsPerTurn) {
          return {
            block: true,
            terminate: true,
            reason: `Qloo stopped this turn after ${definition.maxToolCallsPerTurn} tool calls. Summarize progress or ask the user before continuing.`
          };
        }
        const signature = stableToolSignature(event.toolName, event.input);
        const identicalCount = (identicalCallsThisTurn.get(signature) ?? 0) + 1;
        identicalCallsThisTurn.set(signature, identicalCount);
        if (identicalCount > definition.maxIdenticalToolCallsPerTurn) {
          return {
            block: true,
            terminate: true,
            reason: `Qloo stopped a repeated ${event.toolName} call with unchanged input. Inspect the previous result or ask the user before retrying.`
          };
        }
        if (!new Set(definition.approvalTools).has(event.toolName))
          return void 0;
        const cwd = typeof context.cwd === "string" ? context.cwd : process.cwd();
        const references = ledgerReferences({ toolCallId: event.toolCallId });
        const details = approvalDetails(event.toolName, event.input, cwd);
        recordLedger({
          category: "approval",
          action: "requested",
          summary: `${event.toolName} approval requested for ${String(details.target_kind ?? "tool")}`,
          ...references ? { references } : {},
          details
        });
        if (!context.hasUI) {
          recordLedger({
            category: "approval",
            action: "unavailable",
            summary: `${event.toolName} approval unavailable outside the interactive terminal`,
            ...references ? { references } : {},
            details
          });
          return {
            block: true,
            reason: `Tool "${event.toolName}" requires interactive approval in Qloo's ${activeProfile} profile.`
          };
        }
        const approved = await context.ui.confirm(`Approve ${event.toolName}`, safeApprovalDetail(event.toolName, event.input));
        recordLedger({
          category: "approval",
          action: approved ? "approved" : "denied",
          summary: `${event.toolName} ${approved ? "approved" : "denied"} by the user`,
          ...references ? { references } : {},
          details
        });
        return approved ? void 0 : {
          block: true,
          reason: `User denied ${event.toolName} in Qloo's ${activeProfile} profile.`
        };
      });
      pi.on("user_bash", () => {
        if (activeDefinition().allowDirectShell)
          return void 0;
        return {
          result: {
            output: `Direct shell execution is unavailable in Qloo's ${activeProfile} profile. Use qloo integrate or qloo build.
`,
            exitCode: 1,
            cancelled: false,
            truncated: false
          }
        };
      });
    }
  };
}
function createExplorePolicyExtension(allowedToolNames) {
  return createHarnessPolicyExtension("explore", allowedToolNames);
}
export {
  QLOO_ARTIFACT_STATE_ENTRY_TYPE,
  QLOO_JOURNEY_STATE_ENTRY_TYPE,
  QLOO_SESSION_STATE_ENTRY_TYPE,
  QLOO_SESSION_STATE_SCHEMA_VERSION,
  QLOO_WORKSPACE_TOOL_NAMES,
  buildExploreToolNames,
  buildProfileToolNames,
  createExplorePolicyExtension,
  createHarnessPolicyExtension,
  validateExploreTools
};
