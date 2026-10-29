import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);
import {
  QLOO_WORKFLOW_OPERATION_IDS,
  getQlooAdapterContractManifest
} from "./chunks/chunk-MCLV3P4I.js";
import "./chunks/chunk-KTNGVO26.js";

// apps/qloo-harness/dist/integration-plan.js
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve } from "node:path";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { inspectProjectContext, QLOO_PROJECT_CONTEXT_SCHEMA_VERSION } from "./project-context.js";
var QLOO_INTEGRATION_PLAN_SCHEMA_VERSION = "1.0";
var QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME = "qloo_create_integration_plan";
var QLOO_INTEGRATION_PLAN_MAX_BYTES = 64 * 1024;
var QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES = 8 * 1024;
var QLOO_INTEGRATION_PLAN_MAX_EVIDENCE_BYTES = 1024 * 1024;
var QLOO_INTEGRATION_PLAN_ID_PATTERN = /^qplan_[a-f0-9]{24}$/u;
var shortText = Type.String({ minLength: 1, maxLength: 500 });
var longText = Type.String({ minLength: 1, maxLength: 2e3 });
var relativePath = Type.String({ minLength: 1, maxLength: 500 });
var operation = Type.Union([
  Type.Literal("recommend"),
  Type.Literal("rank"),
  Type.Literal("describe"),
  Type.Literal("where_popular"),
  Type.Literal("compare_audiences"),
  Type.Literal("entity_tags"),
  Type.Literal("audience_demographics"),
  Type.Literal("trends"),
  Type.Literal("find_tags")
]);
var fieldMapping = Type.Object({
  local_field: shortText,
  qloo_role: Type.Union([
    Type.Literal("signal"),
    Type.Literal("filter"),
    Type.Literal("output")
  ]),
  qloo_field: shortText,
  normalized_result_field: Type.Union([shortText, Type.Null()]),
  owning_boundary: shortText,
  transformation: longText
}, { additionalProperties: false });
var boundaries = Type.Object({
  http_client: longText,
  configuration: longText,
  data_model: longText,
  error_boundary: longText
}, { additionalProperties: false });
var errorHandling = Type.Object({
  condition: shortText,
  behavior: longText
}, { additionalProperties: false });
var change = Type.Object({
  path: relativePath,
  action: Type.Union([Type.Literal("create"), Type.Literal("modify")]),
  purpose: longText,
  verification: longText
}, { additionalProperties: false });
var verification = Type.Object({
  command: Type.String({ minLength: 1, maxLength: 1e3 }),
  purpose: longText
}, { additionalProperties: false });
var draftEvidence = Type.Object({
  path: relativePath,
  relevance: longText
}, { additionalProperties: false });
var hashedEvidence = Type.Object({
  path: relativePath,
  relevance: longText,
  sha256: Type.String({ pattern: "^[a-f0-9]{64}$" })
}, { additionalProperties: false });
var QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("needs_input")]),
  summary: longText,
  operation,
  transport: Type.Union([Type.Literal("direct"), Type.Literal("mcp")]),
  field_mapping: Type.Array(fieldMapping, { minItems: 1, maxItems: 32 }),
  boundaries,
  error_handling: Type.Array(errorHandling, { minItems: 1, maxItems: 16 }),
  privacy_constraints: Type.Array(longText, { minItems: 1, maxItems: 16 }),
  changes: Type.Array(change, { minItems: 1, maxItems: 32 }),
  verification: Type.Array(verification, { minItems: 1, maxItems: 16 }),
  rollout: Type.Array(longText, { minItems: 1, maxItems: 16 }),
  rollback: Type.Array(longText, { minItems: 1, maxItems: 16 }),
  assumptions: Type.Array(longText, { maxItems: 24 }),
  unresolved_decisions: Type.Array(longText, { maxItems: 16 }),
  evidence: Type.Array(draftEvidence, { minItems: 1, maxItems: 32 })
}, { additionalProperties: false });
var QLOO_INTERACTIVE_INTEGRATION_PLAN_SCHEMA = Type.Object({
  goal: Type.String({ minLength: 1, maxLength: QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES }),
  plan: QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA
}, { additionalProperties: false });
var projectIdentity = Type.Object({
  name: shortText,
  fingerprint: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  context_schema_version: Type.Literal(QLOO_PROJECT_CONTEXT_SCHEMA_VERSION),
  languages: Type.Array(shortText, { maxItems: 16 }),
  package_managers: Type.Array(shortText, { maxItems: 16 }),
  frameworks: Type.Array(shortText, { maxItems: 32 }),
  source_roots: Type.Array(relativePath, { maxItems: 32 }),
  http_clients: Type.Array(shortText, { maxItems: 16 }),
  data_modeling: Type.Array(shortText, { maxItems: 16 }),
  configuration: Type.Array(shortText, { maxItems: 16 }),
  test_frameworks: Type.Array(shortText, { maxItems: 16 }),
  verification_scripts: Type.Array(shortText, { maxItems: 32 })
}, { additionalProperties: false });
var qlooContract = Type.Object({
  operation,
  tool_name: Type.String({ pattern: "^qloo_[a-z_]+$" }),
  transport: Type.Union([Type.Literal("direct"), Type.Literal("mcp")]),
  manifest_schema_version: shortText,
  contract_version: shortText,
  contract_checksum: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
  result_schema_version: shortText
}, { additionalProperties: false });
var QLOO_INTEGRATION_PLAN_SCHEMA = Type.Object({
  schema_version: Type.Literal(QLOO_INTEGRATION_PLAN_SCHEMA_VERSION),
  plan_id: Type.String({ pattern: "^qplan_[a-f0-9]{24}$" }),
  generated_at: Type.String({ minLength: 20, maxLength: 40 }),
  goal: Type.String({ minLength: 1, maxLength: QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES }),
  status: Type.Union([Type.Literal("ready"), Type.Literal("needs_input")]),
  summary: longText,
  project: projectIdentity,
  qloo: qlooContract,
  field_mapping: Type.Array(fieldMapping, { minItems: 1, maxItems: 32 }),
  boundaries,
  error_handling: Type.Array(errorHandling, { minItems: 1, maxItems: 16 }),
  privacy_constraints: Type.Array(longText, { minItems: 1, maxItems: 16 }),
  changes: Type.Array(change, { minItems: 1, maxItems: 32 }),
  verification: Type.Array(verification, { minItems: 1, maxItems: 16 }),
  rollout: Type.Array(longText, { minItems: 1, maxItems: 16 }),
  rollback: Type.Array(longText, { minItems: 1, maxItems: 16 }),
  assumptions: Type.Array(longText, { maxItems: 24 }),
  unresolved_decisions: Type.Array(longText, { maxItems: 16 }),
  evidence: Type.Array(hashedEvidence, { minItems: 1, maxItems: 32 })
}, { additionalProperties: false });
var QlooIntegrationPlanError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "QlooIntegrationPlanError";
  }
};
function validationMessage(schema, value) {
  return [...Value.Errors(schema, value)].slice(0, 8).map((issue) => `${issue.instancePath || "/"}: ${issue.message}`).join("; ");
}
function parseDraft(value) {
  if (!Value.Check(QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA, value)) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `submitted plan does not match schema: ${validationMessage(QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA, value)}`);
  }
  return structuredClone(value);
}
function rejectUnsafeText(value, location = "/") {
  if (typeof value === "string") {
    if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value)) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `${location} contains an unsafe control character`);
    }
    const assignment = value.match(/(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9+/_.=-]{12,})/iu);
    const assignedValue = assignment?.[1];
    const looksLikePlaceholder = assignedValue === void 0 || /^(?:configured|environment|placeholder|redacted|unknown)$/iu.test(assignedValue) || /^[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)$/u.test(assignedValue);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/iu.test(value) || /authorization\s*[:=]\s*bearer\s+[A-Za-z0-9+/_.=-]{8,}/iu.test(value) || !looksLikePlaceholder) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `${location} appears to contain a credential value`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUnsafeText(item, `${location}${index}/`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      rejectUnsafeText(item, `${location}${key}/`);
    }
  }
}
function canonicalRelativePath(value) {
  const candidate = value.trim();
  const normalized = posix.normalize(candidate.replace(/^\.\//u, ""));
  if (candidate.length === 0 || candidate.includes("\\") || /[\u0000-\u001f\u007f]/u.test(candidate) || isAbsolute(candidate) || /^[A-Za-z]:/u.test(candidate) || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `plan path must stay project-relative: ${JSON.stringify(value)}`);
  }
  const segments = normalized.split("/");
  const fileName = segments.at(-1)?.toLocaleLowerCase("en-US") ?? "";
  const safeEnvironmentTemplate = /^\.env\.(?:example|sample|template)$/u.test(fileName);
  if (segments.some((segment) => [".git", ".qloo", ".ssh", "node_modules"].includes(segment.toLocaleLowerCase("en-US"))) || /^\.env(?:\..+)?$/u.test(fileName) && !safeEnvironmentTemplate || [".npmrc", ".pypirc", "id_rsa", "id_ed25519"].includes(fileName)) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `plan path targets protected or credential-bearing state: ${JSON.stringify(value)}`);
  }
  return normalized;
}
function canonicalizeDraft(draft) {
  const changes = draft.changes.map((item) => ({
    ...item,
    path: canonicalRelativePath(item.path)
  }));
  const evidence = draft.evidence.map((item) => ({
    ...item,
    path: canonicalRelativePath(item.path)
  }));
  for (const [label, paths] of [
    ["change", changes.map(({ path }) => path)],
    ["evidence", evidence.map(({ path }) => path)]
  ]) {
    if (new Set(paths).size !== paths.length) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `plan contains duplicate ${label} paths`);
    }
  }
  if (draft.status === "ready" && draft.unresolved_decisions.length > 0) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "a ready plan cannot contain unresolved decisions; use status needs_input");
  }
  if (draft.status === "needs_input" && draft.unresolved_decisions.length === 0) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "a needs_input plan must identify at least one unresolved decision");
  }
  const evidencePaths = new Set(evidence.map(({ path }) => path));
  for (const item of changes) {
    if (item.action === "modify" && !evidencePaths.has(item.path)) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `every modified file must also be cited as evidence: ${item.path}`);
    }
  }
  for (const item of draft.verification) {
    if (/\r|\n|[;&|`$<>]/u.test(item.command)) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `verification command must be one non-composed command: ${JSON.stringify(item.command)}`);
    }
  }
  return { ...draft, changes, evidence };
}
function schemaProperties(schema) {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema))
    return /* @__PURE__ */ new Set();
  const properties = Reflect.get(schema, "properties");
  return properties !== null && typeof properties === "object" && !Array.isArray(properties) ? new Set(Object.keys(properties)) : /* @__PURE__ */ new Set();
}
function qlooFieldRoot(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\[\])?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\])?)*$/u.test(value)) {
    return void 0;
  }
  return value.match(/^[A-Za-z_][A-Za-z0-9_]*/u)?.[0];
}
function validateFieldMapping(mapping, inputSchema, resultSchema) {
  const inputFields = schemaProperties(inputSchema);
  const resultFields = schemaProperties(resultSchema);
  let inputCount = 0;
  let outputCount = 0;
  mapping.forEach((item, index) => {
    const root = qlooFieldRoot(item.qloo_field);
    if (item.qloo_role === "output") {
      outputCount += 1;
      if (!root || !resultFields.has(root)) {
        throw new QlooIntegrationPlanError("PLAN_INVALID", `/field_mapping/${index}/qloo_field is not in the normalized Qloo result schema: ${item.qloo_field}`);
      }
      if (item.normalized_result_field === null) {
        throw new QlooIntegrationPlanError("PLAN_INVALID", `/field_mapping/${index}/normalized_result_field is required for an output mapping`);
      }
      return;
    }
    inputCount += 1;
    if (!root || !inputFields.has(root)) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `/field_mapping/${index}/qloo_field is not in the selected Qloo input schema: ${item.qloo_field}`);
    }
    if (item.normalized_result_field !== null) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `/field_mapping/${index}/normalized_result_field must be null for a signal or filter mapping`);
    }
  });
  if (inputCount === 0 || outputCount === 0) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "field_mapping must contain at least one Qloo input and one normalized output");
  }
}
function projectIdentityFromContext(context) {
  return {
    name: context.project_name,
    fingerprint: context.fingerprint,
    context_schema_version: context.schema_version,
    languages: [...context.languages],
    package_managers: [...context.package_managers],
    frameworks: [...context.frameworks],
    source_roots: [...context.source_roots],
    http_clients: [...context.http_clients],
    data_modeling: [...context.data_modeling],
    configuration: [...context.configuration],
    test_frameworks: [...context.test_frameworks],
    verification_scripts: [...context.verification_scripts]
  };
}
function isInside(root, target) {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot);
}
async function hashEvidenceFile(cwd, path) {
  const projectRoot = await realpath(resolve(cwd));
  const target = resolve(projectRoot, path);
  let metadata;
  try {
    metadata = await lstat(target);
  } catch {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `evidence file does not exist: ${path}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `evidence must be a regular file: ${path}`);
  }
  const realTarget = await realpath(target);
  if (!isInside(projectRoot, realTarget)) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `evidence escapes the project: ${path}`);
  }
  if (metadata.size > QLOO_INTEGRATION_PLAN_MAX_EVIDENCE_BYTES) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `evidence file exceeds the ${QLOO_INTEGRATION_PLAN_MAX_EVIDENCE_BYTES}-byte limit: ${path}`);
  }
  return createHash("sha256").update(await readFile(realTarget)).digest("hex");
}
function planId(unsigned) {
  return `qplan_${createHash("sha256").update(JSON.stringify(unsigned)).digest("hex").slice(0, 24)}`;
}
function validateGoal(goal) {
  const normalized = goal.trim();
  if (normalized.length === 0) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "the integration goal must not be empty");
  }
  if (Buffer.byteLength(normalized) > QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `the integration goal exceeds the ${QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES}-byte limit`);
  }
  rejectUnsafeText(normalized, "/goal/");
  return normalized;
}
async function createIntegrationPlanArtifact(options) {
  const goal = validateGoal(options.goal);
  const draft = canonicalizeDraft(parseDraft(options.draft));
  rejectUnsafeText(draft);
  const { context } = await inspectProjectContext({
    cwd: options.cwd,
    paths: options.paths,
    refresh: true,
    ...options.now === void 0 ? {} : { now: options.now }
  });
  const manifest = getQlooAdapterContractManifest();
  const operationContract = manifest.operations.find(({ id }) => id === draft.operation);
  if (!operationContract) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `unsupported Qloo operation: ${draft.operation}`);
  }
  validateFieldMapping(draft.field_mapping, operationContract.input_schema, manifest.result_schema);
  const evidence = await Promise.all(draft.evidence.map(async (item) => ({
    ...item,
    sha256: await hashEvidenceFile(options.cwd, item.path)
  })));
  const { operation: selectedOperation, transport, evidence: _draftEvidence, ...implementation } = draft;
  const unsigned = {
    schema_version: QLOO_INTEGRATION_PLAN_SCHEMA_VERSION,
    generated_at: (options.now ?? (() => /* @__PURE__ */ new Date()))().toISOString(),
    goal,
    ...implementation,
    project: projectIdentityFromContext(context),
    qloo: {
      operation: selectedOperation,
      tool_name: operationContract.shared_tool_name,
      transport,
      manifest_schema_version: manifest.manifest_schema_version,
      contract_version: manifest.contract_version,
      contract_checksum: manifest.contract_checksum,
      result_schema_version: manifest.result_schema_version
    },
    evidence
  };
  const artifact = { ...unsigned, plan_id: planId(unsigned) };
  if (!Value.Check(QLOO_INTEGRATION_PLAN_SCHEMA, artifact)) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `finalized plan does not match schema: ${validationMessage(QLOO_INTEGRATION_PLAN_SCHEMA, artifact)}`);
  }
  if (Buffer.byteLength(JSON.stringify(artifact)) > QLOO_INTEGRATION_PLAN_MAX_BYTES) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `finalized plan exceeds the ${QLOO_INTEGRATION_PLAN_MAX_BYTES}-byte limit`);
  }
  return artifact;
}
async function saveIntegrationPlanArtifact(plan, paths) {
  const validated = parseArtifact(plan);
  await mkdir(paths.plansDir, { recursive: true, mode: 448 });
  const target = join(paths.plansDir, `${validated.plan_id}.json`);
  const temporary = join(paths.plansDir, `.${validated.plan_id}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}
`, {
      encoding: "utf8",
      flag: "wx",
      mode: 384
    });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => void 0);
    throw error;
  }
  return target;
}
function parseArtifact(value) {
  if (!Value.Check(QLOO_INTEGRATION_PLAN_SCHEMA, value)) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", `stored plan does not match schema: ${validationMessage(QLOO_INTEGRATION_PLAN_SCHEMA, value)}`);
  }
  const artifact = structuredClone(value);
  if (validateGoal(artifact.goal) !== artifact.goal) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "stored integration goal is not canonical");
  }
  const { plan_id: storedId, ...unsigned } = artifact;
  if (storedId !== planId(unsigned)) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "stored plan integrity check failed");
  }
  if (!Number.isFinite(Date.parse(artifact.generated_at))) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "stored plan has an invalid generation time");
  }
  rejectUnsafeText(artifact);
  canonicalizeDraft({
    status: artifact.status,
    summary: artifact.summary,
    operation: artifact.qloo.operation,
    transport: artifact.qloo.transport,
    field_mapping: artifact.field_mapping,
    boundaries: artifact.boundaries,
    error_handling: artifact.error_handling,
    privacy_constraints: artifact.privacy_constraints,
    changes: artifact.changes,
    verification: artifact.verification,
    rollout: artifact.rollout,
    rollback: artifact.rollback,
    assumptions: artifact.assumptions,
    unresolved_decisions: artifact.unresolved_decisions,
    evidence: artifact.evidence.map(({ path, relevance }) => ({ path, relevance }))
  });
  for (const item of [...artifact.changes, ...artifact.evidence]) {
    if (canonicalRelativePath(item.path) !== item.path) {
      throw new QlooIntegrationPlanError("PLAN_INVALID", `stored plan path is not canonical: ${item.path}`);
    }
  }
  return artifact;
}
async function loadIntegrationPlanArtifact(options) {
  if (!QLOO_INTEGRATION_PLAN_ID_PATTERN.test(options.planId)) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "--plan must be a Qloo plan ID");
  }
  const path = join(options.paths.plansDir, `${options.planId}.json`);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new QlooIntegrationPlanError("PLAN_NOT_FOUND", `integration plan not found: ${options.planId}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "stored integration plan is not a regular file");
  }
  if (metadata.size > QLOO_INTEGRATION_PLAN_MAX_BYTES) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "stored integration plan exceeds its size limit");
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "stored integration plan is not valid JSON");
  }
  const artifact = parseArtifact(parsed);
  if (artifact.plan_id !== options.planId) {
    throw new QlooIntegrationPlanError("PLAN_INVALID", "stored plan ID does not match its filename");
  }
  if ((options.requireReady ?? true) && artifact.status !== "ready") {
    throw new QlooIntegrationPlanError("PLAN_NOT_READY", `integration plan ${artifact.plan_id} still needs input: ${artifact.unresolved_decisions.join("; ")}`);
  }
  const manifest = getQlooAdapterContractManifest();
  const operationContract = manifest.operations.find(({ id }) => id === artifact.qloo.operation);
  if (artifact.qloo.contract_checksum !== manifest.contract_checksum || artifact.qloo.contract_version !== manifest.contract_version || artifact.qloo.manifest_schema_version !== manifest.manifest_schema_version || artifact.qloo.result_schema_version !== manifest.result_schema_version || !QLOO_WORKFLOW_OPERATION_IDS.includes(artifact.qloo.operation) || operationContract?.shared_tool_name !== artifact.qloo.tool_name) {
    throw new QlooIntegrationPlanError("PLAN_STALE", "the Qloo workflow contract changed after this plan was generated; create a new plan");
  }
  validateFieldMapping(artifact.field_mapping, operationContract.input_schema, manifest.result_schema);
  const { context } = await inspectProjectContext({
    cwd: options.cwd,
    paths: options.paths,
    refresh: true
  });
  if (artifact.project.name !== context.project_name || artifact.project.fingerprint !== context.fingerprint) {
    throw new QlooIntegrationPlanError("PLAN_STALE", "the project manifest or structure changed after this plan was generated; create a new plan");
  }
  for (const item of artifact.evidence) {
    let currentHash;
    try {
      currentHash = await hashEvidenceFile(options.cwd, item.path);
    } catch {
      throw new QlooIntegrationPlanError("PLAN_STALE", `plan evidence is no longer available: ${item.path}`);
    }
    if (currentHash !== item.sha256) {
      throw new QlooIntegrationPlanError("PLAN_STALE", `plan evidence changed after generation: ${item.path}`);
    }
  }
  return artifact;
}
function isQlooInteractiveIntegrationPlanDetails(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const record = value;
  return record.schema_version === QLOO_INTEGRATION_PLAN_SCHEMA_VERSION && typeof record.plan_id === "string" && QLOO_INTEGRATION_PLAN_ID_PATTERN.test(record.plan_id) && (record.status === "ready" || record.status === "needs_input") && typeof record.path === "string" && record.path.length <= 4096;
}
function createInteractiveIntegrationPlanTool(options) {
  return {
    name: QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME,
    label: "Create Qloo integration plan",
    description: "Validate and privately save one typed Qloo integration plan after inspecting bounded project context, the selected workflow contract, and focused source evidence. This does not modify the project.",
    promptSnippet: "Create a validated, versioned Qloo integration plan",
    promptGuidelines: [
      "Use qloo_create_integration_plan only after the user requests a plan or an active Qloo Journey reaches its integration-mapping milestone.",
      "Call qloo_project_context exactly once, retrieve the selected workflow contract, and cite every existing file in the proposed build scope as evidence.",
      "Use needs_input instead of inventing a material product or architecture decision."
    ],
    parameters: QLOO_INTERACTIVE_INTEGRATION_PLAN_SCHEMA,
    executionMode: "sequential",
    renderShell: "self",
    renderCall(params, theme) {
      const goal = typeof params.goal === "string" ? params.goal.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim() : "integration plan";
      return {
        render(width) {
          const maximum = Math.max(1, Math.trunc(width));
          const label = `Qloo integration plan \xB7 ${goal}`;
          const clipped = [...label].length <= maximum ? label : `${[...label].slice(0, Math.max(0, maximum - 1)).join("")}\u2026`;
          return [theme.fg("accent", theme.bold(clipped))];
        },
        invalidate() {
        }
      };
    },
    renderResult(result, _renderOptions, theme) {
      const details = result.details;
      const valid = isQlooInteractiveIntegrationPlanDetails(details);
      return {
        render(width) {
          if (!valid)
            return [theme.fg("error", "Qloo integration plan \xB7 validation failed")];
          const lines = [
            `${details.status === "ready" ? "Ready" : "Needs input"} \xB7 ${details.plan_id}`,
            `  ${details.path}`
          ];
          return lines.map((line, index) => {
            const maximum = Math.max(1, Math.trunc(width));
            const clipped = [...line].length <= maximum ? line : `${[...line].slice(0, Math.max(0, maximum - 1)).join("")}\u2026`;
            return index === 0 ? theme.fg(details.status === "ready" ? "success" : "warning", theme.bold(clipped)) : theme.fg("text", clipped);
          });
        },
        invalidate() {
        }
      };
    },
    async execute(_toolCallId, params) {
      const artifact = await createIntegrationPlanArtifact({
        ...options,
        goal: params.goal,
        draft: params.plan
      });
      const path = await saveIntegrationPlanArtifact(artifact, options.paths);
      const details = {
        schema_version: artifact.schema_version,
        plan_id: artifact.plan_id,
        status: artifact.status,
        path
      };
      return {
        content: [{
          type: "text",
          text: [
            `Created typed Qloo integration plan ${artifact.plan_id}.`,
            `Status: ${artifact.status}`,
            `Saved privately: ${path}`,
            artifact.status === "ready" ? `Optional build handoff: qloo build --plan ${artifact.plan_id}` : `Resolve before building: ${artifact.unresolved_decisions.join("; ")}`
          ].join("\n")
        }],
        details
      };
    }
  };
}
function createIntegrationPlanSubmissionTool(options) {
  let artifact;
  const tool = {
    name: "qloo_submit_integration_plan",
    label: "Submit Qloo integration plan",
    description: "Finalize one typed, evidence-backed Qloo integration plan. Call exactly once after inspecting project context, relevant source files, and the selected Qloo workflow contract.",
    promptSnippet: "Submit the final typed Qloo integration plan",
    promptGuidelines: [
      "Call only after all read-only planning work is complete.",
      "Use project-relative regular files as evidence and include only implementation files that the build should create or modify.",
      "Set status to needs_input when a material decision remains; a ready plan cannot contain unresolved decisions."
    ],
    parameters: QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA,
    async execute(_toolCallId, params) {
      if (artifact) {
        throw new QlooIntegrationPlanError("PLAN_INVALID", "an integration plan was already submitted");
      }
      artifact = await createIntegrationPlanArtifact({
        ...options,
        draft: params
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            accepted: true,
            plan_id: artifact.plan_id,
            status: artifact.status
          })
        }],
        details: {
          schema_version: artifact.schema_version,
          plan_id: artifact.plan_id,
          status: artifact.status
        },
        terminate: true
      };
    }
  };
  return {
    tool,
    getArtifact: () => artifact
  };
}
export {
  QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME,
  QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA,
  QLOO_INTEGRATION_PLAN_ID_PATTERN,
  QLOO_INTEGRATION_PLAN_MAX_BYTES,
  QLOO_INTEGRATION_PLAN_MAX_EVIDENCE_BYTES,
  QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES,
  QLOO_INTEGRATION_PLAN_SCHEMA,
  QLOO_INTEGRATION_PLAN_SCHEMA_VERSION,
  QLOO_INTERACTIVE_INTEGRATION_PLAN_SCHEMA,
  QlooIntegrationPlanError,
  createIntegrationPlanArtifact,
  createIntegrationPlanSubmissionTool,
  createInteractiveIntegrationPlanTool,
  isQlooInteractiveIntegrationPlanDetails,
  loadIntegrationPlanArtifact,
  saveIntegrationPlanArtifact
};
