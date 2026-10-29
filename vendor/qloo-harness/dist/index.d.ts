import { ToolDefinition, InlineExtension, ModelRuntime, SessionManager, InteractiveModeOptions, AgentSessionRuntime, CreateAgentSessionServicesOptions, InteractiveMode, ProgressCallback } from '@earendil-works/pi-coding-agent';
export { ToolDefinition as QlooHarnessToolDefinition } from '@earendil-works/pi-coding-agent';
import { Static, Type } from 'typebox';

interface ResolveQlooPathsOptions {
    cwd?: string;
    env?: Readonly<Record<string, string | undefined>>;
    homeDirectory?: string;
}
interface QlooPaths {
    qlooDir: string;
    configFile: string;
    agentDir: string;
    authFile: string;
    modelsFile: string;
    modelsStoreFile: string;
    settingsFile: string;
    trustFile: string;
    sessionsDir: string;
    sessionDir: string;
    projectsDir: string;
    projectDir: string;
    projectContextFile: string;
    plansDir: string;
    artifactsDir: string;
    cacheDir: string;
    logsDir: string;
}
declare function resolveQlooPaths(options?: ResolveQlooPathsOptions): QlooPaths;
interface EnsureQlooStateOptions {
    platform?: NodeJS.Platform;
}
declare function ensureQlooStateDirectories(paths: QlooPaths, options?: EnsureQlooStateOptions): Promise<void>;

declare const QLOO_HARNESS_PROFILES: readonly ["explore", "integrate", "plan", "build"];
type QlooHarnessProfile = (typeof QLOO_HARNESS_PROFILES)[number];
declare function isQlooHarnessProfile(value: string): value is QlooHarnessProfile;
declare const QLOO_DEFAULT_PROFILE: QlooHarnessProfile;
interface QlooProfileDefinition {
    readonly id: QlooHarnessProfile;
    readonly summary: string;
    readonly authorityNotice: string;
    readonly workspaceTools: readonly string[];
    readonly approvalTools: readonly string[];
    readonly allowDirectShell: boolean;
    readonly maxToolCallsPerTurn: number;
    readonly maxIdenticalToolCallsPerTurn: number;
}
declare const QLOO_PROFILE_DEFINITIONS: Readonly<Record<QlooHarnessProfile, QlooProfileDefinition>>;
declare function getQlooProfileDefinition(profile: QlooHarnessProfile): QlooProfileDefinition;

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | null | undefined;
type QlooQuery = Readonly<Record<string, QueryValue>>;
interface QlooRequestOptions {
    readonly signal?: AbortSignal;
    readonly correlationId?: string;
}
interface QlooApiResponse {
    readonly success?: boolean;
    readonly duration?: number;
    readonly results?: unknown;
    readonly code?: number | string;
    readonly reason?: string;
    readonly message?: string;
    readonly [key: string]: unknown;
}

type QlooConnectivityKind = "authentication" | "cancelled" | "configuration" | "connection" | "dns" | "http" | "proxy" | "rate-limit" | "ready" | "reachable" | "service" | "timeout" | "tls";
interface QlooConnectivityProbeResult {
    readonly ok: boolean;
    readonly reachable: boolean;
    readonly kind: QlooConnectivityKind;
    readonly message: string;
    readonly durationMs: number;
    readonly retryable: boolean;
    readonly status?: number;
    readonly requestId?: string;
    readonly systemCode?: string;
}
interface ProbeQlooConnectivityOptions {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    /** Required for any base URL other than the exact production Qloo endpoint. */
    readonly allowCustomBaseUrl?: boolean;
    readonly timeoutMs?: number;
    readonly fetch?: typeof globalThis.fetch;
    readonly now?: () => number;
}

interface QlooFileConfig {
    readonly api_key?: string;
    readonly base_url?: string;
    readonly trusted_base_url?: string;
    readonly taste_resolver_url?: string;
}

declare const QLOO_TOOL_RESULT_SCHEMA_VERSION: "1.0-preview.1";
declare const QLOO_WORKFLOW_OPERATION_IDS: readonly ["recommend", "rank", "describe", "where_popular", "compare_audiences", "entity_tags", "audience_demographics", "trends", "find_tags"];
type QlooWorkflowOperationId = (typeof QLOO_WORKFLOW_OPERATION_IDS)[number];

declare const QLOO_WORKFLOW_INPUT_SCHEMAS: {
    readonly recommend: Type.TObject<{
        target_type: Type.TString;
        signals: Type.TOptional<Type.TArray<Type.TString>>;
        signal_tags: Type.TOptional<Type.TArray<Type.TString>>;
        signal_tags_operator: Type.TOptional<Type.TString>;
        signal_location: Type.TOptional<Type.TString>;
        demographic: Type.TOptional<Type.TString>;
        filter_location: Type.TOptional<Type.TString>;
        include_tags: Type.TOptional<Type.TArray<Type.TString>>;
        include_tags_operator: Type.TOptional<Type.TString>;
        exclude_tags: Type.TOptional<Type.TArray<Type.TString>>;
        exclude_tags_operator: Type.TOptional<Type.TString>;
        explain: Type.TOptional<Type.TBoolean>;
        limit: Type.TOptional<Type.TInteger>;
    }>;
    readonly rank: Type.TObject<{
        options: Type.TArray<Type.TString>;
        option_type: Type.TString;
        signals: Type.TOptional<Type.TArray<Type.TString>>;
        signal_location: Type.TOptional<Type.TString>;
        demographic: Type.TOptional<Type.TString>;
        include_tags: Type.TOptional<Type.TArray<Type.TString>>;
        exclude_tags: Type.TOptional<Type.TArray<Type.TString>>;
    }>;
    readonly describe: Type.TObject<{
        entity: Type.TString;
        type: Type.TOptional<Type.TString>;
    }>;
    readonly where_popular: Type.TObject<{
        entity: Type.TString;
        entity_type: Type.TOptional<Type.TString>;
        within: Type.TString;
        limit: Type.TOptional<Type.TInteger>;
    }>;
    readonly compare_audiences: Type.TObject<{
        group_a: Type.TArray<Type.TString>;
        group_b: Type.TArray<Type.TString>;
        target_type: Type.TOptional<Type.TString>;
        limit: Type.TOptional<Type.TInteger>;
    }>;
    readonly entity_tags: Type.TObject<{
        entities: Type.TArray<Type.TString>;
        entity_type: Type.TOptional<Type.TString>;
        limit: Type.TOptional<Type.TInteger>;
    }>;
    readonly audience_demographics: Type.TObject<{
        entity: Type.TString;
        entity_type: Type.TOptional<Type.TString>;
        limit: Type.TOptional<Type.TInteger>;
    }>;
    readonly trends: Type.TObject<{
        entities: Type.TArray<Type.TString>;
        entity_type: Type.TString;
        start_date: Type.TString;
        end_date: Type.TString;
        limit: Type.TOptional<Type.TInteger>;
    }>;
    readonly find_tags: Type.TObject<{
        query: Type.TString;
        semantic: Type.TOptional<Type.TBoolean>;
        limit: Type.TOptional<Type.TInteger>;
    }>;
};
type QlooWorkflowResolutionInputKind = "entity" | "tag";
type QlooRecommendInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.recommend>;
type QlooRankInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.rank>;
type QlooDescribeInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.describe>;
type QlooWherePopularInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.where_popular>;
type QlooCompareAudiencesInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.compare_audiences>;
type QlooEntityTagsInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.entity_tags>;
type QlooAudienceDemographicsInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.audience_demographics>;
type QlooTrendsInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.trends>;
type QlooFindTagsInput = Static<typeof QLOO_WORKFLOW_INPUT_SCHEMAS.find_tags>;
type QlooWorkflowInputByOperation = {
    readonly recommend: QlooRecommendInput;
    readonly rank: QlooRankInput;
    readonly describe: QlooDescribeInput;
    readonly where_popular: QlooWherePopularInput;
    readonly compare_audiences: QlooCompareAudiencesInput;
    readonly entity_tags: QlooEntityTagsInput;
    readonly audience_demographics: QlooAudienceDemographicsInput;
    readonly trends: QlooTrendsInput;
    readonly find_tags: QlooFindTagsInput;
};

declare const QLOO_RESOLUTION_PROVIDER_DESCRIPTOR_SCHEMA: Type.TObject<{
    contract_version: Type.TLiteral<"1.0-preview.1">;
    provider_id: Type.TString;
    name: Type.TString;
    entity_strategy: Type.TString;
    tag_strategy: Type.TString;
    remote: Type.TBoolean;
    uses_model: Type.TBoolean;
    fallback: Type.TLiteral<"none">;
}>;
declare const QLOO_RESOLUTION_OUTCOME_SCHEMA: Type.TUnion<[Type.TObject<{
    status: Type.TLiteral<"resolved">;
    match: Type.TUnion<[Type.TLiteral<"identifier">, Type.TLiteral<"exact">, Type.TLiteral<"semantic">]>;
    selected: Type.TObject<{
        id: Type.TString;
        name: Type.TString;
        type: Type.TOptional<Type.TString>;
        rank: Type.TOptional<Type.TInteger>;
        score: Type.TOptional<Type.TNumber>;
        popularity: Type.TOptional<Type.TNumber>;
        parent_types: Type.TOptional<Type.TArray<Type.TString>>;
        description: Type.TOptional<Type.TString>;
        release_year: Type.TOptional<Type.TInteger>;
        address: Type.TOptional<Type.TUnknown>;
    }>;
    alternatives: Type.TOptional<Type.TArray<Type.TObject<{
        id: Type.TString;
        name: Type.TString;
        type: Type.TOptional<Type.TString>;
        rank: Type.TOptional<Type.TInteger>;
        score: Type.TOptional<Type.TNumber>;
        popularity: Type.TOptional<Type.TNumber>;
        parent_types: Type.TOptional<Type.TArray<Type.TString>>;
        description: Type.TOptional<Type.TString>;
        release_year: Type.TOptional<Type.TInteger>;
        address: Type.TOptional<Type.TUnknown>;
    }>>>;
    input: Type.TString;
    provenance: Type.TObject<{
        contract_version: Type.TLiteral<"1.0-preview.1">;
        provider_id: Type.TString;
        provider_name: Type.TString;
        endpoint: Type.TString;
        strategy: Type.TString;
        remote: Type.TBoolean;
        uses_model: Type.TBoolean;
        provider_version: Type.TOptional<Type.TString>;
        cache_status: Type.TOptional<Type.TString>;
    }>;
    warnings: Type.TOptional<Type.TArray<Type.TString>>;
}>, Type.TObject<{
    status: Type.TLiteral<"ambiguous">;
    candidates: Type.TArray<Type.TObject<{
        id: Type.TString;
        name: Type.TString;
        type: Type.TOptional<Type.TString>;
        rank: Type.TOptional<Type.TInteger>;
        score: Type.TOptional<Type.TNumber>;
        popularity: Type.TOptional<Type.TNumber>;
        parent_types: Type.TOptional<Type.TArray<Type.TString>>;
        description: Type.TOptional<Type.TString>;
        release_year: Type.TOptional<Type.TInteger>;
        address: Type.TOptional<Type.TUnknown>;
    }>>;
    input: Type.TString;
    provenance: Type.TObject<{
        contract_version: Type.TLiteral<"1.0-preview.1">;
        provider_id: Type.TString;
        provider_name: Type.TString;
        endpoint: Type.TString;
        strategy: Type.TString;
        remote: Type.TBoolean;
        uses_model: Type.TBoolean;
        provider_version: Type.TOptional<Type.TString>;
        cache_status: Type.TOptional<Type.TString>;
    }>;
    warnings: Type.TOptional<Type.TArray<Type.TString>>;
}>, Type.TObject<{
    status: Type.TLiteral<"not_found">;
    candidates: Type.TOptional<Type.TArray<Type.TObject<{
        id: Type.TString;
        name: Type.TString;
        type: Type.TOptional<Type.TString>;
        rank: Type.TOptional<Type.TInteger>;
        score: Type.TOptional<Type.TNumber>;
        popularity: Type.TOptional<Type.TNumber>;
        parent_types: Type.TOptional<Type.TArray<Type.TString>>;
        description: Type.TOptional<Type.TString>;
        release_year: Type.TOptional<Type.TInteger>;
        address: Type.TOptional<Type.TUnknown>;
    }>>>;
    input: Type.TString;
    provenance: Type.TObject<{
        contract_version: Type.TLiteral<"1.0-preview.1">;
        provider_id: Type.TString;
        provider_name: Type.TString;
        endpoint: Type.TString;
        strategy: Type.TString;
        remote: Type.TBoolean;
        uses_model: Type.TBoolean;
        provider_version: Type.TOptional<Type.TString>;
        cache_status: Type.TOptional<Type.TString>;
    }>;
    warnings: Type.TOptional<Type.TArray<Type.TString>>;
}>]>;
type QlooResolutionProviderDescriptor = Static<typeof QLOO_RESOLUTION_PROVIDER_DESCRIPTOR_SCHEMA>;
type QlooResolutionOutcome = Static<typeof QLOO_RESOLUTION_OUTCOME_SCHEMA>;

type QlooTransportKind = "cli" | "direct" | "mcp";
interface QlooTransportDescriptor {
    readonly kind: QlooTransportKind;
    readonly name: string;
    readonly remote?: boolean;
}
interface QlooWorkflowExecutionContext {
    readonly signal?: AbortSignal;
    readonly correlationId?: string;
}
interface QlooWorkflowResultEnvelope extends Record<string, unknown> {
    readonly schema_version: typeof QLOO_TOOL_RESULT_SCHEMA_VERSION;
    readonly operation: string;
}
interface QlooWorkflowExecution<Operation extends QlooWorkflowOperationId> {
    readonly operation: Operation;
    readonly transport: QlooTransportDescriptor;
    readonly correlationId: string;
    readonly durationMs: number;
    readonly result: QlooWorkflowResultEnvelope;
}
interface QlooWorkflowFailure {
    readonly operation: QlooWorkflowOperationId;
    readonly transport: QlooTransportDescriptor;
    readonly correlationId: string;
    readonly durationMs: number;
    readonly error: QlooWorkflowExecutionError;
}
type QlooWorkflowFailureLayer = "qloo" | "resolver" | "tool_input" | "transport" | "harness";
type QlooWorkflowFailureCode = "CANCELLED" | "HARNESS_INTERNAL" | "QLOO_AUTH" | "QLOO_CONNECT" | "QLOO_CONTRACT" | "QLOO_DNS" | "QLOO_RATE_LIMIT" | "QLOO_TIMEOUT" | "QLOO_TLS" | "QLOO_UPSTREAM" | "RESOLVER_AUTH" | "RESOLVER_CONNECT" | "RESOLVER_CONTRACT" | "RESOLVER_TIMEOUT" | "RESOLVER_UPSTREAM" | "TOOL_INPUT";
interface QlooWorkflowExecutionObserver {
    onExecution?(execution: QlooWorkflowExecution<QlooWorkflowOperationId>): void | Promise<void>;
    onFailure?(failure: QlooWorkflowFailure): void | Promise<void>;
}
interface QlooWorkflowExecutor {
    readonly transport: QlooTransportDescriptor;
    readonly resolution?: QlooResolutionProviderDescriptor;
    execute<Operation extends QlooWorkflowOperationId>(operation: Operation, input: QlooWorkflowInputByOperation[Operation], context?: QlooWorkflowExecutionContext): Promise<QlooWorkflowExecution<Operation>>;
}
interface CreateDelegatingQlooExecutorOptions {
    readonly transport: QlooTransportDescriptor;
    readonly resolution?: QlooResolutionProviderDescriptor;
    readonly invoke: <Operation extends QlooWorkflowOperationId>(operation: Operation, input: QlooWorkflowInputByOperation[Operation], context: QlooWorkflowExecutionContext) => Promise<Record<string, unknown>>;
    readonly now?: () => number;
    readonly createCorrelationId?: () => string;
    readonly observer?: QlooWorkflowExecutionObserver;
}
declare class QlooWorkflowExecutionError extends Error {
    readonly operation: QlooWorkflowOperationId;
    readonly transport: QlooTransportDescriptor;
    readonly code: QlooWorkflowFailureCode;
    readonly layer: QlooWorkflowFailureLayer;
    readonly retryable: boolean;
    readonly expected: boolean;
    readonly recovery: string;
    readonly correlationId?: string;
    readonly durationMs?: number;
    constructor(operation: QlooWorkflowOperationId, transport: QlooTransportDescriptor, message: string, cause?: unknown, metadata?: {
        readonly code?: QlooWorkflowFailureCode;
        readonly layer?: QlooWorkflowFailureLayer;
        readonly retryable?: boolean;
        readonly expected?: boolean;
        readonly recovery?: string;
        readonly correlationId?: string;
        readonly durationMs?: number;
    });
}
/**
 * Adapt a direct client, embedded CLI workflow, or MCP workflow invoker to one
 * versioned execution boundary. Selection happens outside this function and is
 * never changed silently after a failure.
 */
declare function createDelegatingQlooWorkflowExecutor(options: CreateDelegatingQlooExecutorOptions): QlooWorkflowExecutor;
declare function createCliQlooWorkflowExecutor(invoke: CreateDelegatingQlooExecutorOptions["invoke"]): QlooWorkflowExecutor;
declare function createMcpQlooWorkflowExecutor(invoke: CreateDelegatingQlooExecutorOptions["invoke"], name?: string): QlooWorkflowExecutor;

declare const QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE = "QLOO_RESOLUTION_PROVIDER";
declare const TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE = "TASTE_RESOLVER_URL";
declare const TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE = "TASTE_RESOLVER_API_KEY";
declare const QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE = "QLOO_TRUSTED_TASTE_RESOLVER_URL";
declare const QLOO_TASTE_RESOLVER_TAG_ENDPOINT_ENVIRONMENT_VARIABLE = "QLOO_TASTE_RESOLVER_TAG_ENDPOINT";
declare const QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE = "QLOO_TASTE_RESOLVER_MIN_SCORE";
declare const QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE = "QLOO_TASTE_RESOLVER_MIN_MARGIN";
type QlooTagResolutionPurpose = "signal" | "include_filter" | "exclude_filter";
interface QlooResolutionContext {
    readonly signal?: AbortSignal;
    readonly correlationId: string;
}
interface QlooEntityResolutionRequest {
    readonly inputs: readonly string[];
    readonly type?: string;
}
interface QlooTagResolutionRequest {
    readonly inputs: readonly string[];
    readonly targetType?: string;
    readonly purpose: QlooTagResolutionPurpose;
}
interface QlooResolutionBatch {
    readonly outcomes: readonly QlooResolutionOutcome[];
}
interface QlooResolutionProvider {
    readonly descriptor: QlooResolutionProviderDescriptor;
    resolveEntities(request: QlooEntityResolutionRequest, context: QlooResolutionContext): Promise<QlooResolutionBatch>;
    resolveTags(request: QlooTagResolutionRequest, context: QlooResolutionContext): Promise<QlooResolutionBatch>;
}
interface QlooResolutionClient {
    searchEntities(query: QlooQuery, options?: QlooRequestOptions): Promise<QlooApiResponse>;
    entities(entityIds: readonly string[], options?: QlooRequestOptions): Promise<QlooApiResponse>;
    tags(query?: QlooQuery, options?: QlooRequestOptions): Promise<QlooApiResponse>;
}
interface NativeQlooResolutionProviderOptions {
    readonly cacheTtlMs?: number;
    readonly cacheMaxEntries?: number;
    readonly now?: () => number;
}
type QlooResolutionProviderErrorCode = "RESOLVER_ABORTED" | "RESOLVER_AUTH" | "RESOLVER_CONFIGURATION" | "RESOLVER_CONNECT" | "RESOLVER_CONTRACT" | "RESOLVER_TIMEOUT" | "RESOLVER_UPSTREAM";
declare class QlooResolutionProviderError extends Error {
    readonly code: QlooResolutionProviderErrorCode;
    readonly retryable: boolean;
    readonly recovery: string;
    readonly status?: number;
    constructor(code: QlooResolutionProviderErrorCode, message: string, options: {
        readonly retryable?: boolean;
        readonly recovery: string;
        readonly status?: number;
        readonly cause?: unknown;
    });
}
interface TasteResolverResolutionProviderOptions {
    readonly baseUrl: string;
    readonly trustedBaseUrl?: string;
    readonly apiKey?: string;
    readonly entityProvider: QlooResolutionProvider;
    readonly fetch?: typeof globalThis.fetch;
    readonly timeoutMs?: number;
    readonly maxResponseBytes?: number;
    readonly tagEndpoint?: TasteResolverTagEndpoint;
    readonly minimumSemanticScore?: number;
    readonly minimumSemanticScoreMargin?: number;
    readonly cacheTtlMs?: number;
    readonly cacheMaxEntries?: number;
    readonly now?: () => number;
}
type TasteResolverTagEndpoint = "legacy" | "structured";
type TasteResolverHealthKind = "resolver-healthy" | "resolver-degraded" | "resolver-http" | "resolver-timeout" | "resolver-connect" | "resolver-contract";
interface TasteResolverHealthProbeOptions {
    readonly baseUrl: string;
    readonly trustedBaseUrl?: string;
    readonly fetch?: typeof globalThis.fetch;
    readonly timeoutMs?: number;
    readonly maxResponseBytes?: number;
    readonly signal?: AbortSignal;
}
interface TasteResolverHealthProbeResult {
    readonly ok: boolean;
    readonly kind: TasteResolverHealthKind;
    readonly message: string;
    readonly durationMs: number;
    readonly retryable: boolean;
    readonly status?: number;
}
interface CreateQlooResolutionProviderFromEnvironmentOptions {
    readonly client: QlooResolutionClient;
    readonly env?: NodeJS.ProcessEnv;
    readonly fileConfig?: QlooFileConfig;
    readonly fetch?: typeof globalThis.fetch;
}
interface InspectQlooResolutionProviderConfigurationOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly fileConfig?: QlooFileConfig;
}
interface QlooResolutionProviderConfigurationInspection {
    readonly selection: string;
    readonly valid: boolean;
    readonly providerId?: string;
    readonly endpoint?: string;
    readonly trusted: boolean;
    readonly authenticated: boolean;
    readonly usesModel: boolean;
    readonly tagEndpoint?: TasteResolverTagEndpoint;
    readonly minimumSemanticScore?: number;
    readonly minimumSemanticScoreMargin?: number;
    readonly message: string;
    readonly recovery?: string;
}
declare function createNativeQlooResolutionProvider(client: QlooResolutionClient, options?: NativeQlooResolutionProviderOptions): QlooResolutionProvider;
/** @deprecated Use createNativeQlooResolutionProvider for the server-free default. */
declare function createPublicQlooResolutionProvider(client: QlooResolutionClient, options?: NativeQlooResolutionProviderOptions): QlooResolutionProvider;
declare function inspectQlooResolutionProviderConfiguration(options?: InspectQlooResolutionProviderConfigurationOptions): QlooResolutionProviderConfigurationInspection;
/** Probe the standalone taste-resolver's public, side-effect-free v1 health route. */
declare function probeTasteResolverHealth(options: TasteResolverHealthProbeOptions): Promise<TasteResolverHealthProbeResult>;
declare function createTasteResolverAssistedResolutionProvider(options: TasteResolverResolutionProviderOptions): QlooResolutionProvider;
declare function createQlooResolutionProviderFromEnvironment(options: CreateQlooResolutionProviderFromEnvironmentOptions): QlooResolutionProvider;

declare function isQlooWorkflowToolName(value: string): boolean;
interface QlooToolClient extends QlooResolutionClient {
    insights(query: QlooQuery, options?: QlooRequestOptions): Promise<QlooApiResponse>;
    compare(query: QlooQuery, options?: QlooRequestOptions): Promise<QlooApiResponse>;
    trending(query: QlooQuery, options?: QlooRequestOptions): Promise<QlooApiResponse>;
}
interface CreateQlooToolsOptions {
    readonly client?: QlooToolClient;
    readonly executor?: QlooWorkflowExecutor;
    readonly executionObserver?: QlooWorkflowExecutionObserver;
    readonly resolutionProvider?: QlooResolutionProvider;
}
interface QlooToolRuntimeInfo {
    readonly transport: "cli" | "direct" | "mcp" | "none";
    readonly transportName: string;
    readonly remote: boolean;
    readonly fallback: "none";
    readonly resolution?: QlooResolutionProviderDescriptor;
}
declare function getQlooToolRuntimeInfo(tools: readonly ToolDefinition[]): QlooToolRuntimeInfo | undefined;
declare function createDirectQlooWorkflowExecutor(client: QlooToolClient, observer?: QlooWorkflowExecutionObserver, resolutionProvider?: QlooResolutionProvider): QlooWorkflowExecutor;
declare function createQlooTools(options?: CreateQlooToolsOptions): ToolDefinition[];
interface CreateQlooToolsFromEnvironmentOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly client?: QlooToolClient;
    readonly executor?: QlooWorkflowExecutor;
    readonly executionObserver?: QlooWorkflowExecutionObserver;
    readonly resolutionProvider?: QlooResolutionProvider;
    readonly configPath?: string;
    readonly readConfigFile?: (path: string) => string;
}
type CreateDirectQlooWorkflowExecutorFromEnvironmentOptions = Omit<CreateQlooToolsFromEnvironmentOptions, "client" | "executor">;
/**
 * Resolve one direct executor from Qloo's shared credential and endpoint
 * configuration. Returning undefined is an explicit unauthenticated state;
 * callers must not replace it with another transport silently.
 */
declare function createDirectQlooWorkflowExecutorFromEnvironment(options?: CreateDirectQlooWorkflowExecutorFromEnvironmentOptions): QlooWorkflowExecutor | undefined;
declare function createQlooToolsFromEnvironment(options?: CreateQlooToolsFromEnvironmentOptions): ToolDefinition[];

declare const QLOO_WORKSPACE_TOOL_NAMES: readonly string[];
declare const QLOO_SESSION_STATE_ENTRY_TYPE: "qloo.workflow-state";
declare const QLOO_SESSION_STATE_SCHEMA_VERSION: "1.5";
declare const QLOO_JOURNEY_STATE_ENTRY_TYPE: "qloo.journey-state";
declare const QLOO_ARTIFACT_STATE_ENTRY_TYPE: "qloo.artifact-state";
interface QlooInteractiveCommandActions {
    readonly doctor?: (network: boolean) => Promise<unknown>;
    readonly retry?: (toolName: string, input: Readonly<Record<string, unknown>>) => Promise<Record<string, unknown>>;
}
type QlooProfileInstructionLoader = (profile: QlooHarnessProfile) => string;
declare function buildExploreToolNames(tools: readonly ToolDefinition[]): string[];
declare function buildProfileToolNames(profile: QlooHarnessProfile, tools: readonly ToolDefinition[]): string[];
declare function validateExploreTools(tools: readonly ToolDefinition[]): void;
declare function createHarnessPolicyExtension(profile: QlooHarnessProfile, allowedToolNames: ReadonlySet<string>, runtimeInfo?: {
    readonly transport: string;
    readonly transportName: string;
    readonly remote: boolean;
    readonly fallback: "none";
    readonly resolution?: {
        readonly name: string;
        readonly tag_strategy: string;
        readonly uses_model: boolean;
        readonly fallback: "none";
    };
}, commandActions?: QlooInteractiveCommandActions, loadProfileInstructions?: QlooProfileInstructionLoader): InlineExtension;
declare function createExplorePolicyExtension(allowedToolNames: ReadonlySet<string>): InlineExtension;

interface HarnessResources {
    systemPrompt: string;
    exploreInstructions: string;
    profileInstructions?: Readonly<Record<QlooHarnessProfile, string>>;
}
interface LoadHarnessResourcesOptions {
    resourceRoot?: URL;
    readText?: (url: URL) => Promise<string>;
}
declare function loadHarnessResources(options?: LoadHarnessResourcesOptions): Promise<HarnessResources>;

declare const PI_AGENT_DIR_ENVIRONMENT_VARIABLE = "PI_CODING_AGENT_DIR";
declare const PI_TELEMETRY_ENVIRONMENT_VARIABLE = "PI_TELEMETRY";
declare const PI_SKIP_VERSION_CHECK_ENVIRONMENT_VARIABLE = "PI_SKIP_VERSION_CHECK";
declare const PI_OFFLINE_ENVIRONMENT_VARIABLE = "PI_OFFLINE";
declare const QLOO_MODEL_RETRY_POLICY: Readonly<{
    maxRetries: 1;
    baseDelayMs: 1000;
    providerTimeoutMs: 60000;
    providerMaxRetries: 0;
    providerMaxRetryDelayMs: 5000;
}>;
interface RetryPolicySettingsManager {
    getGlobalSettings(): {
        retry?: {
            enabled?: boolean;
            maxRetries?: number;
            baseDelayMs?: number;
            provider?: {
                timeoutMs?: number;
                maxRetries?: number;
                maxRetryDelayMs?: number;
            };
        };
    };
    applyOverrides(overrides: {
        retry: {
            enabled: boolean;
            maxRetries: number;
            baseDelayMs: number;
            provider: {
                timeoutMs: number;
                maxRetries: number;
                maxRetryDelayMs: number;
            };
        };
    }): void;
}
/** Bound Pi's model retry layers without persisting changes to user settings. */
declare function applyQlooModelRetryPolicy(settingsManager: RetryPolicySettingsManager): void;
declare function withPiAgentDirectory<T>(agentDir: string, operation: () => Promise<T>): Promise<T>;
/**
 * Scope Qloo's privacy defaults without overriding explicit caller choices.
 * PI_OFFLINE prevents Pi's automatic catalog, package, tool-download, and
 * update egress; caller-provided values are preserved verbatim.
 */
declare function withPiPrivacyDefaults<T>(operation: () => Promise<T>): Promise<T>;
declare class MissingModelAuthenticationError extends Error {
    readonly authFile: string;
    constructor(authFile: string);
}
interface ModelAvailability {
    getAvailable(): Promise<readonly unknown[]>;
}
declare function requireAuthenticatedModel(modelRuntime: ModelAvailability, authFile: string): Promise<void>;
type ResourceLoaderOptions = NonNullable<CreateAgentSessionServicesOptions["resourceLoaderOptions"]>;
declare function buildExploreResourceOptions(resources: HarnessResources, allowedToolNames: ReadonlySet<string>): ResourceLoaderOptions;
declare function buildHarnessResourceOptions(resources: HarnessResources, allowedToolNames: ReadonlySet<string>, profile: QlooHarnessProfile, runtimeInfo?: ReturnType<typeof getQlooToolRuntimeInfo>, commandActions?: QlooInteractiveCommandActions): ResourceLoaderOptions;
interface CreatePiHarnessRuntimeOptions {
    cwd: string;
    paths: QlooPaths;
    resources: HarnessResources;
    customTools?: readonly ToolDefinition[];
    profile?: QlooHarnessProfile;
    modelRuntime?: ModelRuntime;
    sessionManager?: SessionManager;
    interactiveCommandActions?: Pick<QlooInteractiveCommandActions, "doctor">;
}
interface HarnessRuntime {
    /**
     * Runs the interactive UI. Pi's InteractiveMode owns normal shutdown and
     * disposes the underlying AgentSessionRuntime before it exits.
     */
    runInteractive(options?: InteractiveModeOptions): Promise<void>;
    /** Releases a partially started or non-interactive runtime. Idempotent here. */
    dispose(): Promise<void>;
}
declare class PiHarnessRuntime implements HarnessRuntime {
    readonly sessionRuntime: AgentSessionRuntime;
    private runStarted;
    private disposed;
    constructor(sessionRuntime: AgentSessionRuntime);
    /** Run one model turn through the same session, tools, and policy as the TUI. */
    runPrompt(prompt: string): Promise<string | undefined>;
    runInteractive(options?: InteractiveModeOptions): Promise<void>;
    dispose(): Promise<void>;
}
declare function createPiHarnessRuntime(options: CreatePiHarnessRuntimeOptions): Promise<PiHarnessRuntime>;

interface HarnessPrerequisiteContext {
    cwd: string;
    paths: QlooPaths;
}
interface HarnessPrerequisite {
    name: string;
    check(context: HarnessPrerequisiteContext): Promise<void>;
}
interface HarnessRuntimeFactory {
    create(options: CreatePiHarnessRuntimeOptions): Promise<HarnessRuntime>;
}
interface LaunchInteractiveHarnessOptions {
    cwd?: string;
    paths?: QlooPaths;
    pathOptions?: Omit<ResolveQlooPathsOptions, "cwd">;
    resources?: HarnessResources;
    resourceOptions?: LoadHarnessResourcesOptions;
    customTools?: readonly ToolDefinition[];
    profile?: QlooHarnessProfile;
    prerequisites?: readonly HarnessPrerequisite[];
    interactiveOptions?: InteractiveModeOptions;
    runtimeFactory?: HarnessRuntimeFactory;
    ensureState?: (paths: QlooPaths) => Promise<void>;
    interactiveCommandActions?: Pick<QlooInteractiveCommandActions, "doctor">;
}
declare function launchInteractiveHarness(options?: LaunchInteractiveHarnessOptions): Promise<void>;

declare const QLOO_CREATE_ARTIFACT_TOOL_NAME: "qloo_create_artifact";
declare const QLOO_ARTIFACT_SCHEMA_VERSION: "1.0";
declare const QLOO_ARTIFACT_MAX_BYTES: number;
declare const QLOO_ARTIFACT_MEDIA_TYPES: readonly ["text/html", "image/svg+xml", "text/csv", "application/json", "text/markdown"];
type QlooArtifactMediaType = (typeof QLOO_ARTIFACT_MEDIA_TYPES)[number];
declare const artifactParameters: Type.TObject<{
    filename: Type.TString;
    media_type: Type.TUnion<[Type.TLiteral<"text/html">, Type.TLiteral<"image/svg+xml">, Type.TLiteral<"text/csv">, Type.TLiteral<"application/json">, Type.TLiteral<"text/markdown">]>;
    content: Type.TString;
    title: Type.TOptional<Type.TString>;
    source_correlation_ids: Type.TOptional<Type.TArray<Type.TString>>;
}>;
type AnyToolDefinition = ToolDefinition<any, any, any>;
interface QlooArtifactDetails {
    readonly schema_version: typeof QLOO_ARTIFACT_SCHEMA_VERSION;
    readonly status: "created";
    readonly filename: string;
    readonly title?: string;
    readonly media_type: QlooArtifactMediaType;
    readonly path: string;
    readonly relative_path: string;
    readonly size_bytes: number;
    readonly sha256: string;
    readonly active_content: boolean;
    readonly source_correlation_ids: readonly string[];
}
interface CreateQlooArtifactToolOptions {
    readonly artifactsDir: string;
}
declare function isQlooArtifactDetails(value: unknown): value is QlooArtifactDetails;
declare function createQlooArtifactTool(options: CreateQlooArtifactToolOptions): ToolDefinition<typeof artifactParameters, QlooArtifactDetails> & AnyToolDefinition;

declare const HARNESS_VERSION = "0.1.26";
declare const HARNESS_HELP = "Qloo terminal harness\n\nUsage:\n  qloo              Start guided Qloo chat\n  qloo chat         Start guided Qloo chat explicitly\n  qloo explore      Ask grounded Qloo questions (read-only workspace)\n  qloo integrate    Inspect and design a Qloo integration\n  qloo plan         Open interactive read-only planning\n  qloo plan \"<goal>\" --json\n                    Create a typed, evidence-backed plan\n  qloo build        Open approval-gated build mode\n  qloo build --plan <plan-id>\n                    Build from a validated integration plan\n  qloo chat --mode <explore|integrate|plan|build>\n  qloo --help       Show this help\n  qloo --version    Show the harness version\n\nThe deterministic API CLI and additional harness commands are attached by the\ntop-level qloo command router.";
interface HarnessCliDependencies {
    launch: (profile: QlooHarnessProfile) => Promise<void>;
    isInteractiveTerminal: () => boolean;
    writeOut: (text: string) => void;
    writeError: (text: string) => void;
}
declare function runHarnessCli(args?: readonly string[], dependencies?: HarnessCliDependencies): Promise<number>;

declare const QLOO_INTEGRATION_PLAN_SCHEMA_VERSION: "1.0";
declare const QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME: "qloo_create_integration_plan";
declare const QLOO_INTEGRATION_PLAN_MAX_BYTES: number;
declare const QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES: number;
declare const QLOO_INTEGRATION_PLAN_MAX_EVIDENCE_BYTES: number;
declare const QLOO_INTEGRATION_PLAN_ID_PATTERN: RegExp;
declare const QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA: Type.TObject<{
    status: Type.TUnion<[Type.TLiteral<"ready">, Type.TLiteral<"needs_input">]>;
    summary: Type.TString;
    operation: Type.TUnion<[Type.TLiteral<"recommend">, Type.TLiteral<"rank">, Type.TLiteral<"describe">, Type.TLiteral<"where_popular">, Type.TLiteral<"compare_audiences">, Type.TLiteral<"entity_tags">, Type.TLiteral<"audience_demographics">, Type.TLiteral<"trends">, Type.TLiteral<"find_tags">]>;
    transport: Type.TUnion<[Type.TLiteral<"direct">, Type.TLiteral<"mcp">]>;
    field_mapping: Type.TArray<Type.TObject<{
        local_field: Type.TString;
        qloo_role: Type.TUnion<[Type.TLiteral<"signal">, Type.TLiteral<"filter">, Type.TLiteral<"output">]>;
        qloo_field: Type.TString;
        normalized_result_field: Type.TUnion<[Type.TString, Type.TNull]>;
        owning_boundary: Type.TString;
        transformation: Type.TString;
    }>>;
    boundaries: Type.TObject<{
        http_client: Type.TString;
        configuration: Type.TString;
        data_model: Type.TString;
        error_boundary: Type.TString;
    }>;
    error_handling: Type.TArray<Type.TObject<{
        condition: Type.TString;
        behavior: Type.TString;
    }>>;
    privacy_constraints: Type.TArray<Type.TString>;
    changes: Type.TArray<Type.TObject<{
        path: Type.TString;
        action: Type.TUnion<[Type.TLiteral<"create">, Type.TLiteral<"modify">]>;
        purpose: Type.TString;
        verification: Type.TString;
    }>>;
    verification: Type.TArray<Type.TObject<{
        command: Type.TString;
        purpose: Type.TString;
    }>>;
    rollout: Type.TArray<Type.TString>;
    rollback: Type.TArray<Type.TString>;
    assumptions: Type.TArray<Type.TString>;
    unresolved_decisions: Type.TArray<Type.TString>;
    evidence: Type.TArray<Type.TObject<{
        path: Type.TString;
        relevance: Type.TString;
    }>>;
}>;
declare const QLOO_INTERACTIVE_INTEGRATION_PLAN_SCHEMA: Type.TObject<{
    goal: Type.TString;
    plan: Type.TObject<{
        status: Type.TUnion<[Type.TLiteral<"ready">, Type.TLiteral<"needs_input">]>;
        summary: Type.TString;
        operation: Type.TUnion<[Type.TLiteral<"recommend">, Type.TLiteral<"rank">, Type.TLiteral<"describe">, Type.TLiteral<"where_popular">, Type.TLiteral<"compare_audiences">, Type.TLiteral<"entity_tags">, Type.TLiteral<"audience_demographics">, Type.TLiteral<"trends">, Type.TLiteral<"find_tags">]>;
        transport: Type.TUnion<[Type.TLiteral<"direct">, Type.TLiteral<"mcp">]>;
        field_mapping: Type.TArray<Type.TObject<{
            local_field: Type.TString;
            qloo_role: Type.TUnion<[Type.TLiteral<"signal">, Type.TLiteral<"filter">, Type.TLiteral<"output">]>;
            qloo_field: Type.TString;
            normalized_result_field: Type.TUnion<[Type.TString, Type.TNull]>;
            owning_boundary: Type.TString;
            transformation: Type.TString;
        }>>;
        boundaries: Type.TObject<{
            http_client: Type.TString;
            configuration: Type.TString;
            data_model: Type.TString;
            error_boundary: Type.TString;
        }>;
        error_handling: Type.TArray<Type.TObject<{
            condition: Type.TString;
            behavior: Type.TString;
        }>>;
        privacy_constraints: Type.TArray<Type.TString>;
        changes: Type.TArray<Type.TObject<{
            path: Type.TString;
            action: Type.TUnion<[Type.TLiteral<"create">, Type.TLiteral<"modify">]>;
            purpose: Type.TString;
            verification: Type.TString;
        }>>;
        verification: Type.TArray<Type.TObject<{
            command: Type.TString;
            purpose: Type.TString;
        }>>;
        rollout: Type.TArray<Type.TString>;
        rollback: Type.TArray<Type.TString>;
        assumptions: Type.TArray<Type.TString>;
        unresolved_decisions: Type.TArray<Type.TString>;
        evidence: Type.TArray<Type.TObject<{
            path: Type.TString;
            relevance: Type.TString;
        }>>;
    }>;
}>;
declare const QLOO_INTEGRATION_PLAN_SCHEMA: Type.TObject<{
    schema_version: Type.TLiteral<"1.0">;
    plan_id: Type.TString;
    generated_at: Type.TString;
    goal: Type.TString;
    status: Type.TUnion<[Type.TLiteral<"ready">, Type.TLiteral<"needs_input">]>;
    summary: Type.TString;
    project: Type.TObject<{
        name: Type.TString;
        fingerprint: Type.TString;
        context_schema_version: Type.TLiteral<"1.1">;
        languages: Type.TArray<Type.TString>;
        package_managers: Type.TArray<Type.TString>;
        frameworks: Type.TArray<Type.TString>;
        source_roots: Type.TArray<Type.TString>;
        http_clients: Type.TArray<Type.TString>;
        data_modeling: Type.TArray<Type.TString>;
        configuration: Type.TArray<Type.TString>;
        test_frameworks: Type.TArray<Type.TString>;
        verification_scripts: Type.TArray<Type.TString>;
    }>;
    qloo: Type.TObject<{
        operation: Type.TUnion<[Type.TLiteral<"recommend">, Type.TLiteral<"rank">, Type.TLiteral<"describe">, Type.TLiteral<"where_popular">, Type.TLiteral<"compare_audiences">, Type.TLiteral<"entity_tags">, Type.TLiteral<"audience_demographics">, Type.TLiteral<"trends">, Type.TLiteral<"find_tags">]>;
        tool_name: Type.TString;
        transport: Type.TUnion<[Type.TLiteral<"direct">, Type.TLiteral<"mcp">]>;
        manifest_schema_version: Type.TString;
        contract_version: Type.TString;
        contract_checksum: Type.TString;
        result_schema_version: Type.TString;
    }>;
    field_mapping: Type.TArray<Type.TObject<{
        local_field: Type.TString;
        qloo_role: Type.TUnion<[Type.TLiteral<"signal">, Type.TLiteral<"filter">, Type.TLiteral<"output">]>;
        qloo_field: Type.TString;
        normalized_result_field: Type.TUnion<[Type.TString, Type.TNull]>;
        owning_boundary: Type.TString;
        transformation: Type.TString;
    }>>;
    boundaries: Type.TObject<{
        http_client: Type.TString;
        configuration: Type.TString;
        data_model: Type.TString;
        error_boundary: Type.TString;
    }>;
    error_handling: Type.TArray<Type.TObject<{
        condition: Type.TString;
        behavior: Type.TString;
    }>>;
    privacy_constraints: Type.TArray<Type.TString>;
    changes: Type.TArray<Type.TObject<{
        path: Type.TString;
        action: Type.TUnion<[Type.TLiteral<"create">, Type.TLiteral<"modify">]>;
        purpose: Type.TString;
        verification: Type.TString;
    }>>;
    verification: Type.TArray<Type.TObject<{
        command: Type.TString;
        purpose: Type.TString;
    }>>;
    rollout: Type.TArray<Type.TString>;
    rollback: Type.TArray<Type.TString>;
    assumptions: Type.TArray<Type.TString>;
    unresolved_decisions: Type.TArray<Type.TString>;
    evidence: Type.TArray<Type.TObject<{
        path: Type.TString;
        relevance: Type.TString;
        sha256: Type.TString;
    }>>;
}>;
type QlooIntegrationPlanDraft = Static<typeof QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA>;
type QlooIntegrationPlan = Static<typeof QLOO_INTEGRATION_PLAN_SCHEMA>;
type QlooIntegrationPlanErrorCode = "PLAN_INVALID" | "PLAN_NOT_FOUND" | "PLAN_NOT_READY" | "PLAN_STALE";
declare class QlooIntegrationPlanError extends Error {
    readonly code: QlooIntegrationPlanErrorCode;
    constructor(code: QlooIntegrationPlanErrorCode, message: string);
}
interface CreateIntegrationPlanArtifactOptions {
    readonly cwd: string;
    readonly paths: QlooPaths;
    readonly goal: string;
    readonly draft: unknown;
    readonly now?: () => Date;
}
declare function createIntegrationPlanArtifact(options: CreateIntegrationPlanArtifactOptions): Promise<QlooIntegrationPlan>;
declare function saveIntegrationPlanArtifact(plan: QlooIntegrationPlan, paths: QlooPaths): Promise<string>;
interface LoadIntegrationPlanArtifactOptions {
    readonly cwd: string;
    readonly paths: QlooPaths;
    readonly planId: string;
    readonly requireReady?: boolean;
}
declare function loadIntegrationPlanArtifact(options: LoadIntegrationPlanArtifactOptions): Promise<QlooIntegrationPlan>;
interface IntegrationPlanSubmission {
    readonly tool: ToolDefinition;
    getArtifact(): QlooIntegrationPlan | undefined;
}
interface QlooInteractiveIntegrationPlanDetails {
    readonly schema_version: typeof QLOO_INTEGRATION_PLAN_SCHEMA_VERSION;
    readonly plan_id: string;
    readonly status: "ready" | "needs_input";
    readonly path: string;
}
interface CreateInteractiveIntegrationPlanToolOptions {
    readonly cwd: string;
    readonly paths: QlooPaths;
    readonly now?: () => Date;
}
declare function isQlooInteractiveIntegrationPlanDetails(value: unknown): value is QlooInteractiveIntegrationPlanDetails;
/** Create a versioned plan from an interactive journey without granting workspace writes. */
declare function createInteractiveIntegrationPlanTool(options: CreateInteractiveIntegrationPlanToolOptions): ToolDefinition<typeof QLOO_INTERACTIVE_INTEGRATION_PLAN_SCHEMA, QlooInteractiveIntegrationPlanDetails> & ToolDefinition<any, any, any>;
interface CreateIntegrationPlanSubmissionOptions {
    readonly cwd: string;
    readonly paths: QlooPaths;
    readonly goal: string;
    readonly now?: () => Date;
}
declare function createIntegrationPlanSubmissionTool(options: CreateIntegrationPlanSubmissionOptions): IntegrationPlanSubmission;

declare const QLOO_BUILD_HELP = "Build from a validated Qloo integration plan\n\nUsage:\n  qloo build --plan <plan-id>\n  qloo build --help\n\nThe plan must be ready, match the current Qloo contract and project structure,\nand retain the same hashes for every evidence file. Starting build grants only\nthis session's build profile; each model shell, edit, and write still requires\nseparate approval.";
interface RunQlooBuildOptions {
    readonly cwd?: string;
    readonly paths?: QlooPaths;
    readonly env?: NodeJS.ProcessEnv;
    readonly isInteractiveTerminal?: () => boolean;
    readonly writeOut?: (text: string) => void;
    readonly writeError?: (text: string) => void;
    readonly loadArtifact?: (options: Parameters<typeof loadIntegrationPlanArtifact>[0]) => Promise<QlooIntegrationPlan>;
    readonly launch: (artifact: QlooIntegrationPlan, initialMessage: string) => Promise<void>;
}
declare function createBuildHandoffPrompt(plan: QlooIntegrationPlan): string;
declare function runQlooBuild(argv: readonly string[], options: RunQlooBuildOptions): Promise<number>;

declare const QLOO_PLAN_HELP = "Create an evidence-backed Qloo integration plan without modifying the project\n\nUsage:\n  qloo plan \"<integration goal>\"\n  qloo plan \"<integration goal>\" --json\n  qloo plan --help\n\nThe model may inspect bounded project context, relevant source files, and the\nlocal Qloo workflow contract. It cannot use shell, edit, or write tools. A\nversioned plan is stored privately and can be handed to build with:\n\n  qloo build --plan <plan-id>";
interface QlooPromptRuntime {
    runPrompt(prompt: string): Promise<string | undefined>;
    dispose(): Promise<void>;
}
interface RunQlooPlanOptions {
    readonly cwd?: string;
    readonly paths?: QlooPaths;
    readonly env?: NodeJS.ProcessEnv;
    readonly resources?: HarnessResources;
    readonly modelRuntime?: ModelRuntime;
    readonly writeOut?: (text: string) => void;
    readonly writeError?: (text: string) => void;
    readonly now?: () => Date;
    readonly createRuntime?: (options: CreatePiHarnessRuntimeOptions) => Promise<QlooPromptRuntime>;
    readonly createQlooTools?: (env: NodeJS.ProcessEnv) => readonly ToolDefinition[];
    readonly saveArtifact?: (artifact: QlooIntegrationPlan, paths: QlooPaths) => Promise<string>;
}
declare function createIntegrationPlanPrompt(goal: string): string;
declare function runQlooPlan(argv: readonly string[], options?: RunQlooPlanOptions): Promise<number>;

type DoctorStatus = "ok" | "warning";
interface DoctorCheck {
    readonly id: string;
    readonly status: DoctorStatus;
    readonly message: string;
    readonly category?: QlooConnectivityKind | TasteResolverHealthKind;
    readonly durationMs?: number;
    readonly retryable?: boolean;
    readonly statusCode?: number;
    readonly requestId?: string;
}
interface DoctorReport {
    readonly schemaVersion: "1.0";
    readonly status: DoctorStatus;
    readonly versions: {
        readonly harness: string;
        readonly node: string;
        readonly pi: string;
    };
    readonly paths: {
        readonly qlooHome: string;
        readonly agentDirectory: string;
    };
    readonly checks: readonly DoctorCheck[];
}
interface RunDoctorOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly paths?: QlooPaths;
    readonly harnessVersion: string;
    readonly piVersion: string;
    readonly fileExists?: (path: string) => Promise<boolean>;
    readonly directoryMode?: (path: string) => Promise<number | undefined>;
    readonly fileMode?: (path: string) => Promise<number | undefined>;
    readonly readConfigFile?: (path: string) => string;
    readonly readAuthFile?: (path: string) => string;
    /** Run one bounded, side-effect-free request against the configured Qloo endpoint. */
    readonly network?: boolean;
    readonly networkTimeoutMs?: number;
    readonly networkProbe?: (options: ProbeQlooConnectivityOptions) => Promise<QlooConnectivityProbeResult>;
    readonly resolverNetworkProbe?: (options: TasteResolverHealthProbeOptions) => Promise<TasteResolverHealthProbeResult>;
}
type PiAuthFileInspection = {
    readonly status: "usable";
    readonly credentialCount: number;
} | {
    readonly status: "empty" | "invalid";
};
/** Validate the credential shapes consumed by pinned Pi 0.84.2 without returning secrets. */
declare function inspectPiAuthFile(content: string): PiAuthFileInspection;
declare function runDoctor(options: RunDoctorOptions): Promise<DoctorReport>;
declare function formatDoctorReport(report: DoctorReport): string;

interface QlooPresentationTheme {
    fg(color: "accent" | "dim" | "error" | "muted" | "success" | "warning", text: string): string;
    bold(text: string): string;
}
interface QlooTextComponent {
    render(width: number): string[];
    invalidate(): void;
}
interface QlooResolutionChoice {
    readonly input: string;
    readonly selectedId: string;
    readonly selectedName?: string;
    readonly selectedType?: string;
    readonly field?: string;
    readonly inputKind?: QlooWorkflowResolutionInputKind;
    readonly scope?: string;
    readonly purpose?: "signal" | "include_filter" | "exclude_filter";
}
interface QlooResolutionCandidateIssue {
    readonly input: string;
    readonly candidates: readonly Record<string, unknown>[];
    readonly field?: string;
    readonly inputKind?: QlooWorkflowResolutionInputKind;
    readonly scope?: string;
    readonly purpose?: "signal" | "include_filter" | "exclude_filter";
}
interface QlooResolutionInputContext {
    readonly field: string;
    readonly inputKind: QlooWorkflowResolutionInputKind;
    readonly scope?: string;
    readonly purpose?: "signal" | "include_filter" | "exclude_filter";
}
declare function formatQlooResolutionCandidateLabels(candidates: readonly Readonly<Record<string, unknown>>[]): string[];
declare function renderQlooCallLines(toolName: string, input: Readonly<Record<string, unknown>>, width: number): string[];
declare function renderQlooResultLines(detailsValue: unknown, options?: {
    readonly expanded?: boolean;
    readonly width?: number;
}): string[];
declare function createQlooCallComponent(toolName: string, input: Readonly<Record<string, unknown>>, theme: QlooPresentationTheme): QlooTextComponent;
declare function createQlooResultComponent(details: unknown, expanded: boolean, theme: QlooPresentationTheme): QlooTextComponent;
declare function paginateQlooResult(detailsValue: Readonly<Record<string, unknown>>, requestedPage: number, pageSize?: number): Record<string, unknown>;
declare function parseQlooRawPage(argument: string, currentPage: number): number | undefined;
declare function resolutionInputContexts(toolName: string, input: Readonly<Record<string, unknown>>): readonly QlooResolutionInputContext[];
declare function resolutionCandidates(detailsValue: unknown, toolName?: string, toolInput?: Readonly<Record<string, unknown>>): readonly QlooResolutionCandidateIssue[];
declare function applyResolutionChoices(toolName: string, input: Readonly<Record<string, unknown>>, choices: readonly QlooResolutionChoice[]): Record<string, unknown> | undefined;

/**
 * Qloo CLI - Command line interface for Qloo's Insights API
 */

interface ApiCliRunOptions {
    /** Write command data and Commander help output. Defaults to process.stdout. */
    readonly writeOut?: (value: string) => void;
    /** Write diagnostics and Commander usage errors. Defaults to process.stderr. */
    readonly writeErr?: (value: string) => void;
    /** Environment used for API key and resolver lookup. Defaults to process.env. */
    readonly env?: NodeJS.ProcessEnv;
    /** Input stream passed to the MCP stdio command. Defaults to process.stdin. */
    readonly stdin?: NodeJS.ReadableStream;
    /** Controls table-vs-JSON defaults. Defaults to process.stdout.isTTY. */
    readonly stdoutIsTTY?: boolean;
}

declare const PI_VERSION = "0.84.2";
declare const QLOO_HELP = "Qloo terminal agent\n\nUsage:\n  qloo                         Start guided Qloo chat (TTY only)\n  qloo chat                    Start guided Qloo chat explicitly\n  qloo explore                 Grounded Qloo discovery (read-only workspace)\n  qloo integrate               Inspect and design a Qloo integration\n  qloo plan                    Open interactive read-only planning\n  qloo plan \"<goal>\" --json    Create a typed, evidence-backed plan\n  qloo build                   Open interactive approval-gated build\n  qloo build --plan <plan-id>  Build from a validated plan\n  qloo exec <workflow> [...]   Execute one shared workflow as JSON/JSONL\n  qloo setup [options]         Configure Qloo data and a model provider\n  qloo doctor [--network]      Inspect local Qloo and model readiness\n  qloo doctor --network --json Emit active diagnostics as JSON\n  qloo update [options]        Update Qloo and/or its extension packages\n  qloo mcp                     Start the canonical nine-workflow MCP server\n  qloo api <command> [...]     Run a deterministic Qloo API command\n  qloo <legacy-command> [...]  Run a legacy API command unchanged\n  qloo --help                  Show this help\n  qloo --version               Show the harness version\n\nExamples:\n  qloo\n  qloo setup\n  qloo setup --status --json\n  qloo doctor\n  qloo update\n  qloo update --extensions\n  qloo plan \"Add taste-based recommendations\" --json\n  qloo build --plan qplan_<id>\n  qloo exec find_tags --input '{\"query\":\"sneakers\",\"limit\":1}'\n  qloo api search --query \"Beyonce\" --json\n  qloo insights --type movie --signal-entities <entity-id>\n\nInside chat:\n  /journey                     Choose a resumable capability walkthrough\n  /journey insight             Natural-language query, refinement, and interpretation\n  /journey artifact            Query, inspect /request, and create a private file\n  /journey integration         Query, map the project, and create a typed plan\n  /request [next|prev|first|latest|number]\n                               Inspect API requests made for the latest answer\n  /artifacts                   List files created in this session\n  /trace [category]            Inspect durable approvals, files, verification, and other events\n\nThe authoritative API documentation is https://docs.qloo.com.";
interface QlooRouterDependencies {
    readonly launchChat: (profile: QlooHarnessProfile, options?: {
        readonly initialMessage?: string;
    }) => Promise<void>;
    readonly runApi: (argv: readonly string[], options: ApiCliRunOptions) => Promise<number>;
    readonly legacyVerbs: ReadonlySet<string>;
    /** Legacy CLI global option name to whether it consumes the following argument. */
    readonly legacyGlobalOptions: ReadonlyMap<string, boolean>;
    readonly doctor: (network: boolean) => Promise<DoctorReport>;
    readonly runExec: (argv: readonly string[]) => Promise<number>;
    readonly runPlan: (argv: readonly string[]) => Promise<number>;
    readonly runBuild: (argv: readonly string[]) => Promise<number>;
    readonly runMcp: (argv: readonly string[]) => Promise<number> | number;
    readonly runSetup: (argv: readonly string[]) => Promise<number>;
    readonly runUpdate: (argv: readonly string[], options: {
        readonly env: Readonly<NodeJS.ProcessEnv>;
        readonly writeOut: (text: string) => void;
        readonly writeError: (text: string) => void;
    }) => Promise<number>;
    readonly isInteractiveTerminal: () => boolean;
    readonly isOutputTerminal: () => boolean;
    readonly writeOut: (text: string) => void;
    readonly writeError: (text: string) => void;
    readonly env: NodeJS.ProcessEnv;
    readonly stdin: NodeJS.ReadableStream;
}
declare function runQloo(argv?: readonly string[], dependencies?: QlooRouterDependencies): Promise<number>;

declare const QLOO_EXEC_EVENT_SCHEMA_VERSION: "1.0";
declare const QLOO_EXEC_MAX_INPUT_BYTES = 1048576;
declare const QLOO_EXEC_HELP: string;
type QlooExecEventName = "started" | "completed" | "failed";
interface QlooExecEventBase {
    readonly schema_version: typeof QLOO_EXEC_EVENT_SCHEMA_VERSION;
    readonly event: QlooExecEventName;
    readonly sequence: number;
    readonly operation: QlooWorkflowOperationId;
    readonly correlation_id: string;
}
interface QlooExecStartedEvent extends QlooExecEventBase {
    readonly event: "started";
    readonly sequence: 1;
    readonly transport: "direct";
}
interface QlooExecCompletedEvent extends QlooExecEventBase {
    readonly event: "completed";
    readonly sequence: 2;
    readonly duration_ms: number;
    readonly result: Record<string, unknown>;
}
interface QlooExecFailedEvent extends QlooExecEventBase {
    readonly event: "failed";
    readonly sequence: 1 | 2;
    readonly error: {
        readonly code: string;
        readonly layer: string;
        readonly retryable: boolean;
        readonly recovery: string;
    };
}
type QlooExecEvent = QlooExecStartedEvent | QlooExecCompletedEvent | QlooExecFailedEvent;
interface RunQlooExecOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly stdin?: NodeJS.ReadableStream;
    readonly stdinIsTTY?: boolean;
    readonly signal?: AbortSignal;
    readonly writeOut?: (text: string) => void;
    readonly writeError?: (text: string) => void;
    readonly createExecutor?: () => QlooWorkflowExecutor | undefined;
    readonly createCorrelationId?: () => string;
    readonly readInputFile?: (path: string, maximumBytes: number) => Promise<string>;
    readonly maximumInputBytes?: number;
}
/** Execute one shared Qloo workflow without loading a model or interactive UI. */
declare function runQlooExec(argv: readonly string[], options?: RunQlooExecOptions): Promise<number>;

declare const QLOO_LEDGER_ENTRY_TYPE: "qloo.ledger-event";
declare const QLOO_LEDGER_SCHEMA_VERSION: "1.0";
declare const QLOO_LEDGER_MAX_RESTORED_EVENTS = 1000;
declare const QLOO_LEDGER_CATEGORIES: readonly ["session", "goal", "clarification", "decision", "profile", "approval", "workflow", "file", "artifact", "verification", "compaction", "journey", "plan"];
type QlooLedgerCategory = (typeof QLOO_LEDGER_CATEGORIES)[number];
type QlooLedgerDetailValue = string | number | boolean | null | readonly string[];
interface QlooLedgerReferences {
    readonly turn_index?: number;
    readonly tool_call_id?: string;
    readonly correlation_id?: string;
}
interface QlooLedgerEvent {
    readonly schema_version: typeof QLOO_LEDGER_SCHEMA_VERSION;
    readonly sequence: number;
    readonly recorded_at: string;
    readonly category: QlooLedgerCategory;
    readonly action: string;
    readonly profile: QlooHarnessProfile;
    readonly summary: string;
    readonly references?: QlooLedgerReferences | undefined;
    readonly details?: Readonly<Record<string, QlooLedgerDetailValue>> | undefined;
}
interface QlooLedgerEventInput {
    readonly category: QlooLedgerCategory;
    readonly action: string;
    readonly summary: string;
    readonly references?: QlooLedgerReferences | undefined;
    readonly details?: Readonly<Record<string, QlooLedgerDetailValue>> | undefined;
}
interface QlooLedgerSink {
    (customType: typeof QLOO_LEDGER_ENTRY_TYPE, event: QlooLedgerEvent): void;
}
interface QlooSessionLedgerOptions {
    readonly now?: () => Date;
}
interface QlooLedgerFileReference {
    readonly path: string;
    readonly scope: "workspace" | "outside_workspace";
}
type QlooVerificationKind = "test" | "typecheck" | "lint" | "build" | "smoke";
declare function isQlooLedgerEvent(value: unknown): value is QlooLedgerEvent;
declare class QlooSessionLedger {
    #private;
    constructor(options?: QlooSessionLedgerOptions);
    restore(entries: readonly unknown[]): void;
    record(sink: QlooLedgerSink | undefined, profile: QlooHarnessProfile, input: QlooLedgerEventInput): QlooLedgerEvent;
    list(category?: QlooLedgerCategory): readonly QlooLedgerEvent[];
}
declare function fingerprintQlooLedgerText(value: string): {
    readonly sha256: string;
    readonly size_bytes: number;
};
declare function qlooLedgerFileReference(value: unknown, cwd: string): QlooLedgerFileReference | undefined;
declare function classifyQlooVerificationCommand(command: unknown): {
    readonly kind: QlooVerificationKind;
    readonly sha256: string;
    readonly size_bytes: number;
} | undefined;
declare function formatQlooLedgerEvent(event: QlooLedgerEvent): string;

declare const QLOO_PROJECT_CONTEXT_SCHEMA_VERSION: "1.1";
interface QlooProjectContext {
    readonly schema_version: typeof QLOO_PROJECT_CONTEXT_SCHEMA_VERSION;
    readonly project_name: string;
    readonly project_root: string;
    readonly fingerprint: string;
    readonly generated_at: string;
    readonly languages: readonly string[];
    readonly package_managers: readonly string[];
    readonly frameworks: readonly string[];
    readonly infrastructure: readonly string[];
    readonly source_roots: readonly string[];
    readonly http_clients: readonly string[];
    readonly data_modeling: readonly string[];
    readonly configuration: readonly string[];
    readonly test_frameworks: readonly string[];
    readonly verification_scripts: readonly string[];
    readonly qloo_dependencies: readonly string[];
    readonly detected_files: readonly string[];
}
interface ProjectContextResult {
    readonly cache: "hit" | "refreshed";
    readonly context: QlooProjectContext;
}
interface InspectProjectContextOptions {
    readonly cwd: string;
    readonly paths: QlooPaths;
    readonly refresh?: boolean;
    readonly now?: () => Date;
}
declare function inspectProjectContext(options: InspectProjectContextOptions): Promise<ProjectContextResult>;
interface CreateProjectContextToolOptions {
    readonly cwd: string;
    readonly paths: QlooPaths;
}
declare function createProjectContextTool(options: CreateProjectContextToolOptions): ToolDefinition;

declare const QLOO_RESOLUTION_CHOICE_ENTRY_TYPE: "qloo.resolution-choice";
declare const QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION: "1.0";
interface QlooConfirmedResolutionBinding {
    readonly tool_name: string;
    readonly input: string;
    readonly input_kind: QlooWorkflowResolutionInputKind;
    readonly field: string;
    readonly scope?: string;
    readonly purpose?: "signal" | "include_filter" | "exclude_filter";
    readonly selected: {
        readonly id: string;
        readonly name: string;
        readonly type?: string;
    };
    readonly source: "user";
}
type QlooResolutionChoiceEvent = {
    readonly schema_version: typeof QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION;
    readonly action: "remember";
    readonly choices: readonly QlooConfirmedResolutionBinding[];
} | {
    readonly schema_version: typeof QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION;
    readonly action: "forget";
    readonly binding: Pick<QlooConfirmedResolutionBinding, "input" | "input_kind" | "scope">;
} | {
    readonly schema_version: typeof QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION;
    readonly action: "clear";
};
interface QlooResolutionMemoryApplication {
    readonly input: Record<string, unknown>;
    readonly reused: readonly QlooConfirmedResolutionBinding[];
}
declare class QlooResolutionMemory {
    #private;
    clear(): void;
    list(): readonly QlooConfirmedResolutionBinding[];
    remember(toolName: string, choices: readonly QlooResolutionChoice[]): readonly QlooConfirmedResolutionBinding[];
    forget(binding: Pick<QlooConfirmedResolutionBinding, "input" | "input_kind" | "scope">): boolean;
    restore(entries: readonly unknown[]): void;
    apply(toolName: string, input: Readonly<Record<string, unknown>>): QlooResolutionMemoryApplication | undefined;
}
declare function rememberResolutionChoicesEvent(choices: readonly QlooConfirmedResolutionBinding[]): QlooResolutionChoiceEvent;
declare function forgetResolutionChoiceEvent(binding: Pick<QlooConfirmedResolutionBinding, "input" | "input_kind" | "scope">): QlooResolutionChoiceEvent;
declare function clearResolutionChoicesEvent(): QlooResolutionChoiceEvent;

declare const PINNED_PI_VERSION = "0.84.2";
declare const BLOCKED_PI_INTERACTIVE_COMMANDS: ReadonlySet<string>;
declare const PI_SHARE_BLOCK_MESSAGE = "External session sharing is disabled in the Qloo harness.";
declare const PI_TRUST_BLOCK_MESSAGE = "Project trust changes are disabled in Qloo's explore profile.";
declare class PiCommandPolicyCompatibilityError extends Error {
    constructor(method: string);
}
/** Return true when an autocomplete value represents a blocked built-in command. */
declare function isBlockedPiInteractiveCommand(value: string): boolean;
/**
 * Fail-closed compatibility adapter for Pi 0.84.2.
 *
 * Pi dispatches its built-in `/share` and `/trust` commands inside
 * InteractiveMode before extension `input` hooks run. It also unconditionally
 * probes for managed fd and ripgrep binaries during TUI initialization, with
 * no public option to disable that setup when their consumers are absent.
 * Qloo replaces those pinned instance seams before `run()`: unsafe commands
 * are blocked, and only the exact offline absence notices are omitted. Pi
 * still performs its local PATH probes, while PI_OFFLINE prevents downloads.
 * Startup fails if a future Pi version changes a seam instead of silently
 * weakening policy or filtering unrelated diagnostics.
 */
declare function applyPiInteractiveCommandPolicy(mode: InteractiveMode): void;

type QlooGuidedGoalId = "ask" | "audience" | "integrate" | "diagnose" | "blank";
interface QlooGuidedStarter {
    readonly label: string;
    readonly prompt: string;
}
interface QlooGuidedGoal {
    readonly id: QlooGuidedGoalId;
    readonly label: string;
    readonly description: string;
    readonly profile?: QlooHarnessProfile;
    readonly starters: readonly QlooGuidedStarter[];
}
declare const QLOO_GUIDED_GOALS: readonly QlooGuidedGoal[];
interface QlooNextAction {
    readonly id: string;
    readonly label: string;
    readonly kind: "command" | "prompt";
    readonly value: string;
    readonly profile?: QlooHarnessProfile;
}
declare function qlooNextActions(workflow: Readonly<Record<string, unknown>>): QlooNextAction[];
declare function findGuidedGoal(label: string): QlooGuidedGoal | undefined;
declare function guidedGoalLabel(goal: QlooGuidedGoal): string;
declare const QLOO_JOURNEY_SCHEMA_VERSION: "1.0";
type QlooJourneyId = "question-to-insight" | "question-to-artifact" | "question-to-integration";
type QlooJourneyStatus = "active" | "paused" | "completed" | "cancelled";
type QlooJourneyStepId = "query" | "refine" | "refined-query" | "inspect-request" | "interpret" | "create-artifact" | "deliver-artifact" | "map-integration" | "handoff-plan";
interface QlooJourneyMilestone {
    readonly id: QlooJourneyStepId;
    readonly label: string;
}
interface QlooJourneyDefinition {
    readonly id: QlooJourneyId;
    readonly aliases: readonly string[];
    readonly label: string;
    readonly description: string;
    readonly profile: QlooHarnessProfile;
    readonly starterPrompt: string;
    readonly milestones: readonly QlooJourneyMilestone[];
}
interface QlooJourneyArtifact {
    readonly filename: string;
    readonly media_type: QlooArtifactMediaType;
    readonly path: string;
    readonly size_bytes: number;
    readonly sha256: string;
}
interface QlooJourneyPlan {
    readonly plan_id: string;
    readonly status: "ready" | "needs_input";
    readonly path: string;
}
interface QlooJourneyState {
    readonly schema_version: typeof QLOO_JOURNEY_SCHEMA_VERSION;
    readonly journey_id: QlooJourneyId;
    readonly status: QlooJourneyStatus;
    readonly current_step: QlooJourneyStepId;
    readonly completed_steps: readonly QlooJourneyStepId[];
    readonly successful_queries: number;
    readonly request_inspected: boolean;
    readonly artifact?: QlooJourneyArtifact;
    readonly plan?: QlooJourneyPlan;
}
declare const QLOO_JOURNEYS: readonly QlooJourneyDefinition[];
declare function findQlooJourney(value: string): QlooJourneyDefinition | undefined;
declare function qlooJourneyLabel(journey: QlooJourneyDefinition): string;
declare function createQlooJourneyState(journeyId: QlooJourneyId): QlooJourneyState;
/** Parse persisted state defensively; malformed or stale entries are ignored. */
declare function parseQlooJourneyState(value: unknown): QlooJourneyState | undefined;
declare function advanceQlooJourneyForUserPrompt(state: QlooJourneyState): QlooJourneyState;
declare function advanceQlooJourneyForWorkflow(state: QlooJourneyState, workflowStatus: unknown): QlooJourneyState;
declare function advanceQlooJourneyForRequest(state: QlooJourneyState): QlooJourneyState;
declare function advanceQlooJourneyForArtifact(state: QlooJourneyState, artifact: QlooJourneyArtifact): QlooJourneyState;
declare function advanceQlooJourneyForPlan(state: QlooJourneyState, plan: QlooJourneyPlan): QlooJourneyState;
declare function completeQlooJourneyAfterAgent(state: QlooJourneyState): QlooJourneyState;
declare function setQlooJourneyStatus(state: QlooJourneyState, status: Extract<QlooJourneyStatus, "active" | "paused" | "cancelled">): QlooJourneyState;
declare function skipQlooJourneyStep(state: QlooJourneyState): QlooJourneyState;
declare function qlooJourneyProgress(state: QlooJourneyState): {
    readonly current: number;
    readonly total: number;
    readonly label: string;
};
declare function qlooJourneyInstructions(state: QlooJourneyState): string;

declare const QLOO_SETUP_SCHEMA_VERSION: "1.0";
declare const QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE = "QLOO_NO_GUIDED_START";
declare const QLOO_SETUP_HELP = "Configure Qloo chat\n\nUsage:\n  qloo setup                 Configure missing Qloo and model authentication\n  qloo setup --qloo          Configure or replace the Qloo API credential\n  qloo setup --model         Sign in to a model provider\n  qloo setup --status        Show readiness without changing configuration\n  qloo setup --status --json Emit machine-readable readiness\n\nInteractive secret values are hidden and are never printed in the setup report.";
interface QlooSetupChoice {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}
interface QlooSetupIO {
    readonly interactive: boolean;
    select(title: string, choices: readonly QlooSetupChoice[]): Promise<string | undefined>;
    text(message: string, placeholder?: string): Promise<string | undefined>;
    secret(message: string): Promise<string | undefined>;
    write(message: string): void;
}
interface QlooSetupProvider {
    readonly id: string;
    readonly name: string;
    readonly auth: {
        readonly apiKey?: {
            readonly name?: string;
            readonly login?: unknown;
        };
        readonly oauth?: {
            readonly name?: string;
            readonly login?: unknown;
        };
    };
}
interface QlooSetupModelRuntime {
    getAvailable(providerId?: string): Promise<readonly unknown[]>;
    getProviders(): readonly QlooSetupProvider[];
    login(providerId: string, type: "api_key" | "oauth", interaction: {
        readonly signal?: AbortSignal;
        prompt(prompt: {
            readonly type: "text" | "secret" | "select" | "manual_code";
            readonly message: string;
            readonly placeholder?: string;
            readonly options?: readonly {
                readonly id: string;
                readonly label: string;
                readonly description?: string;
            }[];
            readonly signal?: AbortSignal;
        }): Promise<string>;
        notify(event: Readonly<Record<string, unknown>>): void;
    }): Promise<unknown>;
}
interface QlooSetupReport {
    readonly schemaVersion: typeof QLOO_SETUP_SCHEMA_VERSION;
    readonly readyForChat: boolean;
    readonly qloo: {
        readonly ready: boolean;
        readonly source: "environment" | "config" | "missing";
        readonly mode: "live" | "learning";
    };
    readonly model: {
        readonly ready: boolean;
        readonly availableModels: number;
    };
    readonly changes: readonly ("model-auth" | "qloo-auth")[];
}
interface QlooSetupOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly paths: QlooPaths;
    readonly io?: QlooSetupIO;
    readonly configureQloo?: boolean;
    readonly configureModel?: boolean;
    readonly allowLearningMode?: boolean;
    readonly modelRuntime?: QlooSetupModelRuntime;
    readonly createModelRuntime?: (paths: QlooPaths) => Promise<QlooSetupModelRuntime>;
    readonly networkProbe?: (options: {
        readonly apiKey: string;
        readonly baseUrl: string;
        readonly allowCustomBaseUrl: boolean;
        readonly timeoutMs: number;
    }) => Promise<QlooConnectivityProbeResult>;
    readonly saveApiKey?: (apiKey: string, configPath: string) => void;
}
interface RunQlooSetupOptions extends Omit<QlooSetupOptions, "configureQloo" | "configureModel"> {
    readonly writeOut?: (text: string) => void;
    readonly writeError?: (text: string) => void;
}
declare function createTerminalSetupIO(input?: NodeJS.ReadStream, output?: NodeJS.WriteStream): QlooSetupIO;
declare function setupQloo(options: QlooSetupOptions): Promise<QlooSetupReport>;
declare function formatQlooSetupReport(report: QlooSetupReport): string;
declare function runQlooSetup(argv: readonly string[], options: RunQlooSetupOptions): Promise<number>;

declare const QLOO_HARNESS_PACKAGE_NAME = "@qloo/qloo-harness";
declare const QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE = "QLOO_UPDATE_SPEC";
declare const QLOO_UPDATE_HELP = "Update Qloo\n\nUsage:\n  qloo update                       Update the Qloo harness\n  qloo update --self                Update the Qloo harness explicitly\n  qloo update --extensions          Update configured Qloo extension packages\n  qloo update --all                 Update extensions, then the harness\n  qloo update --self --extensions   Update extensions, then the harness\n  qloo update --extension <source>  Update one configured extension package\n\nOptions:\n  --self          Include the Qloo harness\n  --extensions    Include all configured Qloo extension packages\n  --extension     Update one configured Qloo extension package\n  --all           Include extensions and the Qloo harness\n  --force         Reinstall the harness even at the same or an older version\n  --timeout <s>   Bound each package-manager install (10-900 seconds; default 120)\n  -h, --help      Show this help\n\nUpdate overrides:\n  QLOO_UPDATE_SPEC may select an approved absolute .tgz path or an exact Qloo\n  package tag or version, such as @qloo/qloo-harness@next.";
interface ExternalCommandRequest {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<NodeJS.ProcessEnv>;
    readonly streamOutput: boolean;
    readonly writeOut: (text: string) => void;
    readonly writeError: (text: string) => void;
    readonly timeoutMs?: number;
    readonly heartbeatMs?: number;
    readonly description?: string;
}
interface ExternalCommandResult {
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly error?: Error;
    readonly timedOut?: boolean;
    readonly durationMs?: number;
}
type ExternalCommandRunner = (request: ExternalCommandRequest) => Promise<ExternalCommandResult>;
interface QlooExtensionPackageManager {
    listConfiguredPackages(): Array<{
        readonly source: string;
        readonly scope: "user" | "project";
        readonly filtered: boolean;
        readonly installedPath?: string;
    }>;
    setProgressCallback(callback: ProgressCallback | undefined): void;
    update(source?: string): Promise<void>;
}
interface RunQlooUpdateOptions {
    readonly currentVersion?: string;
    readonly packageRoot?: string;
    readonly cwd?: string;
    readonly env?: Readonly<NodeJS.ProcessEnv>;
    readonly platform?: NodeJS.Platform;
    readonly npmCommand?: string;
    readonly pnpmCommand?: string;
    readonly writeOut?: (text: string) => void;
    readonly writeError?: (text: string) => void;
    readonly runCommand?: ExternalCommandRunner;
    readonly createExtensionPackageManager?: (agentDirectory: string) => QlooExtensionPackageManager;
    readonly selfUpdate?: (force: boolean, timeoutMs: number) => Promise<void>;
    readonly extensionUpdate?: (source: string | undefined) => Promise<void>;
}
declare function inferGlobalInstallPrefix(packageRoot: string, platform?: NodeJS.Platform): string | undefined;
declare function runQlooUpdate(args: readonly string[], options?: RunQlooUpdateOptions): Promise<number>;

declare const QLOO_EXECUTION_LOG_SCHEMA_VERSION: "1.0";
interface QlooExecutionLogRecord {
    readonly schema_version: typeof QLOO_EXECUTION_LOG_SCHEMA_VERSION;
    readonly timestamp: string;
    readonly event: "workflow_completed" | "workflow_failed";
    readonly operation: string;
    readonly transport: string;
    readonly correlation_id: string;
    readonly duration_ms: number;
    readonly status?: string;
    readonly result_count?: number;
    readonly error_code?: string;
    readonly retryable?: boolean;
}
interface CreateFileExecutionObserverOptions {
    readonly logsDirectory: string;
    readonly now?: () => Date;
    readonly append?: (path: string, content: string) => Promise<void>;
    readonly ensureDirectory?: (path: string) => Promise<void>;
}
/**
 * Append privacy-minimized workflow telemetry to a daily local JSONL file.
 * Inputs, result entities, prompts, file paths, commands, and error messages
 * are deliberately excluded.
 */
declare function createFileExecutionObserver(options: CreateFileExecutionObserverOptions): QlooWorkflowExecutionObserver;

/** Canonical Qloo MCP stdio adapter over the shared workflow executor. */

declare const QLOO_MCP_CONTRACT_RESOURCE_URI: "qloo://contracts/workflows";
declare const QLOO_MCP_HELP = "Start the canonical Qloo MCP stdio server\n\nUsage:\n  qloo mcp\n\nThe server exposes qloo_capabilities and the nine shared Qloo workflow tools.\nUse qloo api mcp only when you explicitly need the legacy endpoint-shaped server.";
type WriteOutput = (value: string) => void;
interface CanonicalMcpServerOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly input?: NodeJS.ReadableStream;
    readonly writeOut?: WriteOutput;
    readonly tools?: readonly ToolDefinition[];
    readonly serverVersion?: string;
}
interface CanonicalMcpServerLifecycle {
    close(): void;
}
/** Start the canonical MCP JSON-RPC loop and return its readline lifecycle handle. */
declare function startCanonicalMcpServer(options?: CanonicalMcpServerOptions): CanonicalMcpServerLifecycle;
declare function runQlooMcp(argv: readonly string[], options?: CanonicalMcpServerOptions): number;

export { BLOCKED_PI_INTERACTIVE_COMMANDS, HARNESS_HELP, HARNESS_VERSION, MissingModelAuthenticationError, PINNED_PI_VERSION, PI_AGENT_DIR_ENVIRONMENT_VARIABLE, PI_OFFLINE_ENVIRONMENT_VARIABLE, PI_SHARE_BLOCK_MESSAGE, PI_SKIP_VERSION_CHECK_ENVIRONMENT_VARIABLE, PI_TELEMETRY_ENVIRONMENT_VARIABLE, PI_TRUST_BLOCK_MESSAGE, PI_VERSION, PiCommandPolicyCompatibilityError, PiHarnessRuntime, QLOO_ARTIFACT_MAX_BYTES, QLOO_ARTIFACT_MEDIA_TYPES, QLOO_ARTIFACT_SCHEMA_VERSION, QLOO_ARTIFACT_STATE_ENTRY_TYPE, QLOO_BUILD_HELP, QLOO_CREATE_ARTIFACT_TOOL_NAME, QLOO_CREATE_INTEGRATION_PLAN_TOOL_NAME, QLOO_DEFAULT_PROFILE, QLOO_EXECUTION_LOG_SCHEMA_VERSION, QLOO_EXEC_EVENT_SCHEMA_VERSION, QLOO_EXEC_HELP, QLOO_EXEC_MAX_INPUT_BYTES, QLOO_GUIDED_GOALS, QLOO_HARNESS_PACKAGE_NAME, QLOO_HARNESS_PROFILES, QLOO_HELP, QLOO_INTEGRATION_PLAN_DRAFT_SCHEMA, QLOO_INTEGRATION_PLAN_ID_PATTERN, QLOO_INTEGRATION_PLAN_MAX_BYTES, QLOO_INTEGRATION_PLAN_MAX_EVIDENCE_BYTES, QLOO_INTEGRATION_PLAN_MAX_GOAL_BYTES, QLOO_INTEGRATION_PLAN_SCHEMA, QLOO_INTEGRATION_PLAN_SCHEMA_VERSION, QLOO_INTERACTIVE_INTEGRATION_PLAN_SCHEMA, QLOO_JOURNEYS, QLOO_JOURNEY_SCHEMA_VERSION, QLOO_JOURNEY_STATE_ENTRY_TYPE, QLOO_LEDGER_CATEGORIES, QLOO_LEDGER_ENTRY_TYPE, QLOO_LEDGER_MAX_RESTORED_EVENTS, QLOO_LEDGER_SCHEMA_VERSION, QLOO_MCP_CONTRACT_RESOURCE_URI, QLOO_MCP_HELP, QLOO_MODEL_RETRY_POLICY, QLOO_NO_GUIDED_START_ENVIRONMENT_VARIABLE, QLOO_PLAN_HELP, QLOO_PROFILE_DEFINITIONS, QLOO_PROJECT_CONTEXT_SCHEMA_VERSION, QLOO_RESOLUTION_CHOICE_ENTRY_TYPE, QLOO_RESOLUTION_CHOICE_SCHEMA_VERSION, QLOO_RESOLUTION_PROVIDER_ENVIRONMENT_VARIABLE, QLOO_SESSION_STATE_ENTRY_TYPE, QLOO_SESSION_STATE_SCHEMA_VERSION, QLOO_SETUP_HELP, QLOO_SETUP_SCHEMA_VERSION, QLOO_TASTE_RESOLVER_MIN_MARGIN_ENVIRONMENT_VARIABLE, QLOO_TASTE_RESOLVER_MIN_SCORE_ENVIRONMENT_VARIABLE, QLOO_TASTE_RESOLVER_TAG_ENDPOINT_ENVIRONMENT_VARIABLE, QLOO_TRUSTED_TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE, QLOO_UPDATE_HELP, QLOO_UPDATE_SPEC_ENVIRONMENT_VARIABLE, QLOO_WORKSPACE_TOOL_NAMES, QlooIntegrationPlanError, QlooResolutionMemory, QlooResolutionProviderError, QlooSessionLedger, QlooWorkflowExecutionError, TASTE_RESOLVER_API_KEY_ENVIRONMENT_VARIABLE, TASTE_RESOLVER_URL_ENVIRONMENT_VARIABLE, advanceQlooJourneyForArtifact, advanceQlooJourneyForPlan, advanceQlooJourneyForRequest, advanceQlooJourneyForUserPrompt, advanceQlooJourneyForWorkflow, applyPiInteractiveCommandPolicy, applyQlooModelRetryPolicy, applyResolutionChoices, buildExploreResourceOptions, buildExploreToolNames, buildHarnessResourceOptions, buildProfileToolNames, classifyQlooVerificationCommand, clearResolutionChoicesEvent, completeQlooJourneyAfterAgent, createBuildHandoffPrompt, createCliQlooWorkflowExecutor, createDelegatingQlooWorkflowExecutor, createDirectQlooWorkflowExecutor, createDirectQlooWorkflowExecutorFromEnvironment, createExplorePolicyExtension, createFileExecutionObserver, createHarnessPolicyExtension, createIntegrationPlanArtifact, createIntegrationPlanPrompt, createIntegrationPlanSubmissionTool, createInteractiveIntegrationPlanTool, createMcpQlooWorkflowExecutor, createNativeQlooResolutionProvider, createPiHarnessRuntime, createProjectContextTool, createPublicQlooResolutionProvider, createQlooArtifactTool, createQlooCallComponent, createQlooJourneyState, createQlooResolutionProviderFromEnvironment, createQlooResultComponent, createQlooTools, createQlooToolsFromEnvironment, createTasteResolverAssistedResolutionProvider, createTerminalSetupIO, ensureQlooStateDirectories, findGuidedGoal, findQlooJourney, fingerprintQlooLedgerText, forgetResolutionChoiceEvent, formatDoctorReport, formatQlooLedgerEvent, formatQlooResolutionCandidateLabels, formatQlooSetupReport, getQlooProfileDefinition, getQlooToolRuntimeInfo, guidedGoalLabel, inferGlobalInstallPrefix, inspectPiAuthFile, inspectProjectContext, inspectQlooResolutionProviderConfiguration, isBlockedPiInteractiveCommand, isQlooArtifactDetails, isQlooHarnessProfile, isQlooInteractiveIntegrationPlanDetails, isQlooLedgerEvent, isQlooWorkflowToolName, launchInteractiveHarness, loadHarnessResources, loadIntegrationPlanArtifact, paginateQlooResult, parseQlooJourneyState, parseQlooRawPage, probeTasteResolverHealth, qlooJourneyInstructions, qlooJourneyLabel, qlooJourneyProgress, qlooLedgerFileReference, qlooNextActions, rememberResolutionChoicesEvent, renderQlooCallLines, renderQlooResultLines, requireAuthenticatedModel, resolutionCandidates, resolutionInputContexts, resolveQlooPaths, runDoctor, runHarnessCli, runQloo, runQlooBuild, runQlooExec, runQlooMcp, runQlooPlan, runQlooSetup, runQlooUpdate, saveIntegrationPlanArtifact, setQlooJourneyStatus, setupQloo, skipQlooJourneyStep, startCanonicalMcpServer, validateExploreTools, withPiAgentDirectory, withPiPrivacyDefaults };
export type { CanonicalMcpServerLifecycle, CanonicalMcpServerOptions, CreateDelegatingQlooExecutorOptions, CreateDirectQlooWorkflowExecutorFromEnvironmentOptions, CreateFileExecutionObserverOptions, CreateIntegrationPlanArtifactOptions, CreateIntegrationPlanSubmissionOptions, CreateInteractiveIntegrationPlanToolOptions, CreatePiHarnessRuntimeOptions, CreateProjectContextToolOptions, CreateQlooArtifactToolOptions, CreateQlooResolutionProviderFromEnvironmentOptions, CreateQlooToolsFromEnvironmentOptions, CreateQlooToolsOptions, DoctorCheck, DoctorReport, EnsureQlooStateOptions, HarnessPrerequisite, HarnessPrerequisiteContext, HarnessResources, HarnessRuntime, HarnessRuntimeFactory, InspectProjectContextOptions, InspectQlooResolutionProviderConfigurationOptions, IntegrationPlanSubmission, LaunchInteractiveHarnessOptions, LoadHarnessResourcesOptions, LoadIntegrationPlanArtifactOptions, NativeQlooResolutionProviderOptions, PiAuthFileInspection, ProjectContextResult, QlooArtifactDetails, QlooArtifactMediaType, QlooConfirmedResolutionBinding, QlooEntityResolutionRequest, QlooExecCompletedEvent, QlooExecEvent, QlooExecFailedEvent, QlooExecStartedEvent, QlooExecutionLogRecord, QlooGuidedGoal, QlooGuidedGoalId, QlooGuidedStarter, QlooHarnessProfile, QlooIntegrationPlan, QlooIntegrationPlanDraft, QlooIntegrationPlanErrorCode, QlooInteractiveCommandActions, QlooInteractiveIntegrationPlanDetails, QlooJourneyArtifact, QlooJourneyDefinition, QlooJourneyId, QlooJourneyMilestone, QlooJourneyPlan, QlooJourneyState, QlooJourneyStatus, QlooJourneyStepId, QlooLedgerCategory, QlooLedgerDetailValue, QlooLedgerEvent, QlooLedgerEventInput, QlooLedgerFileReference, QlooLedgerReferences, QlooLedgerSink, QlooNextAction, QlooPaths, QlooPresentationTheme, QlooProfileDefinition, QlooProfileInstructionLoader, QlooProjectContext, QlooResolutionBatch, QlooResolutionCandidateIssue, QlooResolutionChoice, QlooResolutionChoiceEvent, QlooResolutionClient, QlooResolutionContext, QlooResolutionInputContext, QlooResolutionMemoryApplication, QlooResolutionProvider, QlooResolutionProviderConfigurationInspection, QlooResolutionProviderErrorCode, QlooRouterDependencies, QlooSessionLedgerOptions, QlooSetupChoice, QlooSetupIO, QlooSetupModelRuntime, QlooSetupOptions, QlooSetupReport, QlooTagResolutionPurpose, QlooTagResolutionRequest, QlooTextComponent, QlooToolClient, QlooToolRuntimeInfo, QlooTransportDescriptor, QlooTransportKind, QlooVerificationKind, QlooWorkflowExecution, QlooWorkflowExecutionContext, QlooWorkflowExecutionObserver, QlooWorkflowExecutor, QlooWorkflowFailure, QlooWorkflowResultEnvelope, ResolveQlooPathsOptions, RunDoctorOptions, RunQlooBuildOptions, RunQlooExecOptions, RunQlooPlanOptions, RunQlooSetupOptions, RunQlooUpdateOptions, TasteResolverHealthKind, TasteResolverHealthProbeOptions, TasteResolverHealthProbeResult, TasteResolverResolutionProviderOptions, TasteResolverTagEndpoint };
