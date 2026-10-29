import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/guided-journey.js
import { QLOO_ARTIFACT_MAX_BYTES, QLOO_ARTIFACT_MEDIA_TYPES } from "./artifact-tool.js";
var QLOO_GUIDED_GOALS = [
  {
    id: "ask",
    label: "Ask Qloo a question",
    description: "Recommendations, comparisons, trends, places, and cultural context",
    profile: "explore",
    starters: [
      {
        label: "Find recommendations for an audience",
        prompt: "Recommend five [things] for [audience] who like [interests], in [place]. Explain how you interpreted my request."
      },
      {
        label: "Compare two tastes",
        prompt: "Compare the audiences and taste affinities around [first entity] and [second entity]. Explain the strongest differences."
      },
      {
        label: "Explore what is trending",
        prompt: "What is trending for [category] in [place] during [date range], and what does the result support?"
      }
    ]
  },
  {
    id: "audience",
    label: "Explore an audience or idea",
    description: "Turn everyday language into Qloo entities, tags, and useful audience signals",
    profile: "explore",
    starters: [
      {
        label: "Understand an audience",
        prompt: "Help me understand people in [place] who like [entities or ideas]. Resolve the concepts through Qloo, ask only about choices that would materially change the answer, and summarize the resulting taste profile."
      },
      {
        label: "Ground an aesthetic or concept",
        prompt: "Show me how Qloo represents the idea \u201C[concept or aesthetic]\u201D. Explain meaningful candidate differences before asking me to choose."
      },
      {
        label: "Find related brands or experiences",
        prompt: "Find [brands, places, artists, or experiences] associated with people who like [entities, tags, or aesthetics]."
      }
    ]
  },
  {
    id: "integrate",
    label: "Integrate Qloo into my product",
    description: "Map Qloo inputs and results onto the project in this directory",
    profile: "plan",
    starters: [
      {
        label: "Design an integration",
        prompt: "Inspect this project's bounded integration context and design a Qloo integration for [product behavior]. Map our domain fields to Qloo signals and filters, map Qloo results back to our data model, and include auth, errors, retries, pagination, and focused tests."
      },
      {
        label: "Translate an existing use case",
        prompt: "I currently need to [describe use case]. Inspect this project and show exactly where Qloo fits, including a field-by-field request and response mapping and the safest implementation boundary."
      },
      {
        label: "Review an existing integration",
        prompt: "Inspect this project's Qloo integration and identify contract, normalization, error-handling, privacy, and test gaps. Start with a read-only assessment."
      }
    ]
  },
  {
    id: "diagnose",
    label: "Diagnose my Qloo setup",
    description: "Check credentials, endpoint trust, resolution, and network reachability",
    starters: []
  },
  {
    id: "blank",
    label: "Start with a blank prompt",
    description: "Keep the current profile and write your own request",
    starters: []
  }
];
function clipGuidedLine(text, width) {
  const characters = [...text];
  if (characters.length <= width)
    return text;
  if (width === 1)
    return "\u2026";
  return `${characters.slice(0, width - 1).join("")}\u2026`;
}
function qlooStarterIdeaLines(availableWidth) {
  const width = Math.max(1, Math.floor(availableWidth));
  const detailed = width >= 96;
  const goals = QLOO_GUIDED_GOALS.filter(({ id }) => id !== "blank");
  const title = width >= 42 ? "Start typing, or try one of these:" : "Start typing \u2014 ideas:";
  const footer = width >= 54 ? "Type anything now \xB7 /start opens guided, editable prompts" : "Type anything \xB7 /start for guided prompts";
  return [
    title,
    ...goals.map((goal) => detailed ? `  \u2022 ${goal.label} \u2014 ${goal.description}` : `  \u2022 ${goal.label}`),
    footer
  ].map((line) => clipGuidedLine(line, width));
}
var COMMON_SUCCESS_ACTIONS = [
  {
    id: "explain",
    label: "Explain what this result means (and does not mean)",
    kind: "prompt",
    value: "Explain the latest Qloo result in plain language. Separate what the data supports from assumptions, and call out important limitations."
  },
  {
    id: "refine",
    label: "Refine the question or audience",
    kind: "prompt",
    value: "Help me refine the latest Qloo question. Suggest the two or three changes most likely to produce a meaningfully different result, without asking me for API parameter names."
  },
  {
    id: "request",
    label: "Inspect the underlying Qloo request",
    kind: "command",
    value: "request"
  },
  {
    id: "integrate",
    label: "Turn this into an integration plan",
    kind: "prompt",
    profile: "plan",
    value: "Turn the latest Qloo workflow into a project-grounded integration plan. Map application inputs to Qloo signals and filters, and map normalized Qloo results back to the application data model."
  }
];
function operationPrompt(operation) {
  switch (operation) {
    case "recommend":
    case "rank":
      return {
        id: "compare",
        label: "Compare with another audience or signal",
        kind: "prompt",
        value: "Run a useful comparison against the latest result by changing one material audience or taste signal. Ask me which signal if the choice is not clear."
      };
    case "compare":
    case "compare_audiences":
      return {
        id: "deepen-compare",
        label: "Explore the strongest difference",
        kind: "prompt",
        value: "Take the strongest meaningful difference in the latest comparison and explore it further with the narrowest relevant Qloo workflow."
      };
    case "trends":
      return {
        id: "trend-window",
        label: "Try another place or time window",
        kind: "prompt",
        value: "Help me rerun the latest trend question for a useful comparison place or time window. Ask for the one missing choice in everyday language."
      };
    case "where_popular":
      return {
        id: "location-detail",
        label: "Explore another location",
        kind: "prompt",
        value: "Compare where the latest entity is popular with another location. Ask me for the comparison location if needed."
      };
    case "describe":
    case "entity_tags":
    case "find_tags":
      return {
        id: "use-signal",
        label: "Use this as a taste signal",
        kind: "prompt",
        value: "Use the latest resolved Qloo entity or tag as a taste signal in a concrete recommendation. Ask me what kind of output and location I want if those are missing."
      };
    case "audience_demographics":
      return {
        id: "audience-recommendation",
        label: "Use this audience in a recommendation",
        kind: "prompt",
        value: "Use the latest audience understanding to run a relevant Qloo recommendation. Ask me for the output category if it is not already clear."
      };
    default:
      return void 0;
  }
}
function qlooNextActions(workflow) {
  const status = workflow.status;
  if (status === "error" || status === "needs_input") {
    return [
      {
        id: "why",
        label: "See how Qloo interpreted the request",
        kind: "command",
        value: "why"
      },
      {
        id: "doctor",
        label: "Diagnose credentials and connectivity",
        kind: "command",
        value: "doctor network"
      },
      {
        id: "retry",
        label: "Retry the exact Qloo workflow once",
        kind: "command",
        value: "retry"
      },
      {
        id: "rephrase",
        label: "Rephrase the request in plain language",
        kind: "prompt",
        value: "Help me rephrase the latest request using everyday language. Preserve my goal while resolving only the ambiguity or missing information that blocked it."
      }
    ];
  }
  const specific = operationPrompt(workflow.operation);
  return specific ? [specific, ...COMMON_SUCCESS_ACTIONS] : [...COMMON_SUCCESS_ACTIONS];
}
function findGuidedGoal(label) {
  return QLOO_GUIDED_GOALS.find((goal) => `${goal.label} \u2014 ${goal.description}` === label);
}
function guidedGoalLabel(goal) {
  return `${goal.label} \u2014 ${goal.description}`;
}
var QLOO_JOURNEY_SCHEMA_VERSION = "1.0";
var QLOO_JOURNEYS = [
  {
    id: "question-to-insight",
    aliases: ["insight"],
    label: "Question to insight",
    description: "Clarify a natural-language question, query Qloo, refine it, and interpret the evidence",
    profile: "explore",
    starterPrompt: "Help me answer this question with Qloo: [question, audience, or idea]. Ask one clarification only if it would materially change the query; otherwise state a reasonable assumption and continue.",
    milestones: [
      { id: "query", label: "Clarify and run the first Qloo query" },
      { id: "refine", label: "Choose a meaningful refinement" },
      { id: "refined-query", label: "Run the refined Qloo query" },
      { id: "interpret", label: "Explain the supported insight and limits" }
    ]
  },
  {
    id: "question-to-artifact",
    aliases: ["artifact"],
    label: "Question to artifact",
    description: "Refine a Qloo result, inspect its API request, and save a self-contained local file",
    profile: "explore",
    starterPrompt: "Use Qloo to answer [question]. After we refine the result and inspect the API request, create a self-contained [HTML, SVG, CSV, JSON, or Markdown] artifact named [filename].",
    milestones: [
      { id: "query", label: "Clarify and run the first Qloo query" },
      { id: "refine", label: "Choose a meaningful refinement" },
      { id: "refined-query", label: "Run the refined Qloo query" },
      { id: "inspect-request", label: "Inspect the exact safe API request" },
      { id: "create-artifact", label: "Create a private self-contained file" },
      { id: "deliver-artifact", label: "Show the saved file and explain it" }
    ]
  },
  {
    id: "question-to-integration",
    aliases: ["integration", "integrate"],
    label: "Question to integration",
    description: "Ground a product idea in Qloo, inspect the request, map project fields, and create a buildable plan",
    profile: "plan",
    starterPrompt: "I want to use Qloo to [product behavior] in this project. Start with the user-visible question and a representative Qloo query; ask about only the decisions that would materially change the integration.",
    milestones: [
      { id: "query", label: "Ground the product idea with Qloo" },
      { id: "inspect-request", label: "Inspect the exact safe API request" },
      { id: "map-integration", label: "Map fields and create a typed integration plan" },
      { id: "handoff-plan", label: "Review the plan and optional build handoff" }
    ]
  }
];
var journeyStatusValues = /* @__PURE__ */ new Set([
  "active",
  "paused",
  "completed",
  "cancelled"
]);
function journeyDefinition(id) {
  const definition = QLOO_JOURNEYS.find((journey) => journey.id === id);
  if (!definition)
    throw new Error(`Unknown Qloo journey: ${id}`);
  return definition;
}
function findQlooJourney(value) {
  const normalized = value.trim().toLowerCase();
  return QLOO_JOURNEYS.find((journey) => journey.id === normalized || journey.aliases.includes(normalized) || qlooJourneyLabel(journey).toLowerCase() === normalized);
}
function qlooJourneyLabel(journey) {
  return `${journey.label} \u2014 ${journey.description}`;
}
function createQlooJourneyState(journeyId) {
  const definition = journeyDefinition(journeyId);
  const first = definition.milestones[0];
  if (!first)
    throw new Error(`Qloo journey ${journeyId} has no milestones`);
  return {
    schema_version: QLOO_JOURNEY_SCHEMA_VERSION,
    journey_id: journeyId,
    status: "active",
    current_step: first.id,
    completed_steps: [],
    successful_queries: 0,
    request_inspected: false
  };
}
function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isJourneyArtifact(value) {
  if (!isPlainRecord(value))
    return false;
  return typeof value.filename === "string" && value.filename.length <= 120 && typeof value.media_type === "string" && QLOO_ARTIFACT_MEDIA_TYPES.includes(value.media_type) && typeof value.path === "string" && value.path.length <= 4096 && Number.isSafeInteger(value.size_bytes) && value.size_bytes > 0 && value.size_bytes <= QLOO_ARTIFACT_MAX_BYTES && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/u.test(value.sha256);
}
function isJourneyPlan(value) {
  if (!isPlainRecord(value))
    return false;
  return typeof value.plan_id === "string" && /^qplan_[a-f0-9]{24}$/u.test(value.plan_id) && (value.status === "ready" || value.status === "needs_input") && typeof value.path === "string" && value.path.length <= 4096;
}
function parseQlooJourneyState(value) {
  if (!isPlainRecord(value))
    return void 0;
  if (value.schema_version !== QLOO_JOURNEY_SCHEMA_VERSION)
    return void 0;
  const definition = typeof value.journey_id === "string" ? findQlooJourney(value.journey_id) : void 0;
  if (!definition || !journeyStatusValues.has(value.status))
    return void 0;
  const validSteps = new Set(definition.milestones.map(({ id }) => id));
  if (typeof value.current_step !== "string" || !validSteps.has(value.current_step)) {
    return void 0;
  }
  if (!Array.isArray(value.completed_steps))
    return void 0;
  const completedSteps = value.completed_steps.filter((step) => typeof step === "string" && validSteps.has(step));
  if (completedSteps.length !== value.completed_steps.length || new Set(completedSteps).size !== completedSteps.length) {
    return void 0;
  }
  const stepOrder = new Map(definition.milestones.map(({ id }, index) => [id, index]));
  const currentIndex = stepOrder.get(value.current_step);
  if (currentIndex === void 0)
    return void 0;
  let previousIndex = -1;
  for (const step of completedSteps) {
    const index = stepOrder.get(step);
    if (index === void 0 || index <= previousIndex || index > currentIndex)
      return void 0;
    if (index === currentIndex && value.status !== "completed")
      return void 0;
    previousIndex = index;
  }
  if (value.status === "completed" && (currentIndex !== definition.milestones.length - 1 || completedSteps.at(-1) !== value.current_step))
    return void 0;
  if (!Number.isSafeInteger(value.successful_queries) || value.successful_queries < 0 || value.successful_queries > 100) {
    return void 0;
  }
  if (typeof value.request_inspected !== "boolean")
    return void 0;
  if (value.artifact !== void 0 && !isJourneyArtifact(value.artifact))
    return void 0;
  if (value.plan !== void 0 && !isJourneyPlan(value.plan))
    return void 0;
  const artifact = value.artifact;
  const plan = value.plan;
  return {
    schema_version: QLOO_JOURNEY_SCHEMA_VERSION,
    journey_id: definition.id,
    status: value.status,
    current_step: value.current_step,
    completed_steps: [...completedSteps],
    successful_queries: value.successful_queries,
    request_inspected: value.request_inspected,
    ...artifact ? {
      artifact: {
        filename: artifact.filename,
        media_type: artifact.media_type,
        path: artifact.path,
        size_bytes: artifact.size_bytes,
        sha256: artifact.sha256
      }
    } : {},
    ...plan ? {
      plan: {
        plan_id: plan.plan_id,
        status: plan.status,
        path: plan.path
      }
    } : {}
  };
}
function moveJourneyTo(state, nextStep, additions = {}) {
  const definition = journeyDefinition(state.journey_id);
  if (!definition.milestones.some(({ id }) => id === nextStep))
    return state;
  const completedSteps = state.completed_steps.includes(state.current_step) ? state.completed_steps : [...state.completed_steps, state.current_step];
  return {
    ...state,
    ...additions,
    current_step: nextStep,
    completed_steps: completedSteps
  };
}
function advanceQlooJourneyForUserPrompt(state) {
  if (state.status !== "active" || state.current_step !== "refine")
    return state;
  return moveJourneyTo(state, "refined-query");
}
function advanceQlooJourneyForWorkflow(state, workflowStatus) {
  if (state.status !== "active" || workflowStatus !== "ok" && workflowStatus !== "partial") {
    return state;
  }
  if (state.current_step === "query") {
    const nextStep = state.journey_id === "question-to-integration" ? "inspect-request" : "refine";
    return moveJourneyTo(state, nextStep, {
      successful_queries: state.successful_queries + 1
    });
  }
  if (state.current_step === "refined-query") {
    const nextStep = state.journey_id === "question-to-insight" ? "interpret" : "inspect-request";
    return moveJourneyTo(state, nextStep, {
      successful_queries: state.successful_queries + 1
    });
  }
  return state;
}
function advanceQlooJourneyForRequest(state) {
  if (state.status !== "active" || state.current_step !== "inspect-request")
    return state;
  return moveJourneyTo(state, state.journey_id === "question-to-artifact" ? "create-artifact" : "map-integration", { request_inspected: true });
}
function advanceQlooJourneyForArtifact(state, artifact) {
  if (state.status !== "active" || state.journey_id !== "question-to-artifact" || state.current_step !== "create-artifact")
    return state;
  return moveJourneyTo(state, "deliver-artifact", { artifact });
}
function advanceQlooJourneyForPlan(state, plan) {
  if (state.status !== "active" || state.journey_id !== "question-to-integration" || state.current_step !== "map-integration")
    return state;
  if (plan.status === "needs_input")
    return { ...state, plan };
  return moveJourneyTo(state, "handoff-plan", { plan });
}
function completeQlooJourneyAfterAgent(state) {
  if (state.status !== "active")
    return state;
  if (!(/* @__PURE__ */ new Set([
    "interpret",
    "deliver-artifact",
    "handoff-plan"
  ])).has(state.current_step))
    return state;
  const completedSteps = state.completed_steps.includes(state.current_step) ? state.completed_steps : [...state.completed_steps, state.current_step];
  return { ...state, status: "completed", completed_steps: completedSteps };
}
function setQlooJourneyStatus(state, status) {
  if (state.status === "completed" || state.status === "cancelled")
    return state;
  if (status === "active" && state.status !== "paused")
    return state;
  if (status === "paused" && state.status !== "active")
    return state;
  return { ...state, status };
}
function skipQlooJourneyStep(state) {
  if (state.status !== "active")
    return state;
  if (state.current_step === "refine" || state.current_step === "refined-query") {
    return moveJourneyTo(state, state.journey_id === "question-to-insight" ? "interpret" : "inspect-request");
  }
  if (state.current_step === "inspect-request") {
    return moveJourneyTo(state, state.journey_id === "question-to-artifact" ? "create-artifact" : "map-integration");
  }
  return state;
}
function qlooJourneyProgress(state) {
  const definition = journeyDefinition(state.journey_id);
  const milestone = definition.milestones.find(({ id }) => id === state.current_step);
  return {
    current: state.status === "completed" ? definition.milestones.length : Math.min(state.completed_steps.length + 1, definition.milestones.length),
    total: definition.milestones.length,
    label: milestone?.label ?? state.current_step
  };
}
function qlooJourneyInstructions(state) {
  const definition = journeyDefinition(state.journey_id);
  const progress = qlooJourneyProgress(state);
  const common = [
    `The user explicitly activated the \u201C${definition.label}\u201D Qloo Journey.`,
    `Current milestone ${progress.current}/${progress.total}: ${progress.label}.`,
    "Follow the milestone in natural language. Do not claim later milestones are complete, change profiles, or approve tools on the user's behalf."
  ];
  const instruction = (() => {
    switch (state.current_step) {
      case "query":
        return [
          "Understand the user's everyday-language goal and run one suitable canonical Qloo workflow.",
          "If one missing choice would materially change the result, ask one concise clarification and stop; otherwise state the assumption and continue.",
          state.journey_id === "question-to-integration" ? "After the result, briefly connect it to the product behavior and tell the user that /request is the next milestone." : "After the result, explain it briefly and invite one meaningful refinement without exposing API parameter vocabulary."
        ].join(" ");
      case "refine":
        return "Help the user choose one material refinement. Do not run another workflow until they provide or accept it.";
      case "refined-query":
        return "Treat the latest user message as the refinement, run the narrowest suitable Qloo workflow, compare the meaningful change, and explain what the evidence supports.";
      case "inspect-request":
        return "Do not reconstruct the request. Tell the user to run /request so the harness can show its recorded safe API preview.";
      case "interpret":
        return "Finish with a concise supported insight, assumptions, important limitations, and provenance. Do not run another query.";
      case "create-artifact":
        return "Create the requested self-contained file with qloo_create_artifact using only the Qloo evidence already in this session. Do not print the full file in chat. The tool may write only to Qloo's private artifact directory.";
      case "deliver-artifact":
        return "Give the exact saved path, summarize what the artifact shows, and disclose important data or rendering limitations. Do not paste the file contents.";
      case "map-integration":
        return "Call qloo_project_context once, inspect only focused relevant files, retrieve the selected workflow contract with qloo_capabilities, map local fields in both directions, and call qloo_create_integration_plan with a typed plan. If a material decision is unresolved, ask the user instead of inventing it.";
      case "handoff-plan":
        return "Summarize the validated plan, its exact path, and the optional qloo build --plan command. Do not switch to build or modify the project automatically.";
    }
  })();
  return ["## Active Qloo Journey", ...common, instruction].join("\n\n");
}
export {
  QLOO_GUIDED_GOALS,
  QLOO_JOURNEYS,
  QLOO_JOURNEY_SCHEMA_VERSION,
  advanceQlooJourneyForArtifact,
  advanceQlooJourneyForPlan,
  advanceQlooJourneyForRequest,
  advanceQlooJourneyForUserPrompt,
  advanceQlooJourneyForWorkflow,
  completeQlooJourneyAfterAgent,
  createQlooJourneyState,
  findGuidedGoal,
  findQlooJourney,
  guidedGoalLabel,
  parseQlooJourneyState,
  qlooJourneyInstructions,
  qlooJourneyLabel,
  qlooJourneyProgress,
  qlooNextActions,
  qlooStarterIdeaLines,
  setQlooJourneyStatus,
  skipQlooJourneyStep
};
