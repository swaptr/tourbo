import { createRequire as __qlooCreateRequire } from "node:module";
const require = __qlooCreateRequire(import.meta.url);

// packages/qloo-client-ts/dist/config.js
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
var QLOO_PRODUCTION_BASE_URL = "https://api.qloo.com";
function nonEmptyString(value) {
  if (typeof value !== "string")
    return void 0;
  const trimmed = value.trim();
  return trimmed || void 0;
}
function selectFileConfig(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return {};
  const record = value;
  const apiKey = nonEmptyString(record.api_key);
  const baseUrl = nonEmptyString(record.base_url);
  const trustedBaseUrl = nonEmptyString(record.trusted_base_url);
  const tasteResolverUrl = nonEmptyString(record.taste_resolver_url);
  return {
    ...apiKey ? { api_key: apiKey } : {},
    ...baseUrl ? { base_url: baseUrl } : {},
    ...trustedBaseUrl ? { trusted_base_url: trustedBaseUrl } : {},
    ...tasteResolverUrl ? { taste_resolver_url: tasteResolverUrl } : {}
  };
}
function comparableBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash)
      return void 0;
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.toString();
  } catch {
    return void 0;
  }
}
function areEquivalentQlooBaseUrls(left, right) {
  const normalizedLeft = comparableBaseUrl(left);
  return normalizedLeft !== void 0 && normalizedLeft === comparableBaseUrl(right);
}
function isOfficialQlooBaseUrl(value) {
  return areEquivalentQlooBaseUrls(value, QLOO_PRODUCTION_BASE_URL);
}
function parseQlooConfig(content) {
  const trimmed = content.trim();
  if (!trimmed)
    return {};
  if (trimmed.startsWith("{"))
    return selectFileConfig(JSON.parse(trimmed));
  const values = {};
  for (const line of content.split(/\r?\n/u)) {
    const candidate = line.trim();
    if (!candidate || candidate.startsWith("#"))
      continue;
    const separator = candidate.indexOf("=");
    if (separator < 0)
      continue;
    const key = candidate.slice(0, separator).trim();
    let value = candidate.slice(separator + 1).trim();
    if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return selectFileConfig(values);
}
function loadQlooConfig(configPath, readFile) {
  try {
    const content = readFile ? readFile(configPath) : readFileSync(configPath, "utf8");
    return parseQlooConfig(content);
  } catch {
    return {};
  }
}
function serializeQlooConfig(config) {
  const lines = [
    ["api_key", config.api_key],
    ["base_url", config.base_url],
    ["trusted_base_url", config.trusted_base_url],
    ["taste_resolver_url", config.taste_resolver_url]
  ].flatMap(([key, value]) => value ? [`${key}=${value}`] : []);
  return `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`;
}
function saveQlooConfigValue(key, value, configPath = resolveQlooConfigPath()) {
  const normalized = nonEmptyString(value);
  if (!normalized || /[\r\n\u0000]/u.test(normalized)) {
    throw new Error("Qloo configuration values must be non-empty single-line strings.");
  }
  const current = loadQlooConfig(configPath);
  const directory = dirname(configPath);
  const created = mkdirSync(directory, { recursive: true, mode: 448 });
  if (created !== void 0 && process.platform !== "win32")
    chmodSync(directory, 448);
  writeFileSync(configPath, serializeQlooConfig({ ...current, [key]: normalized }), {
    encoding: "utf8",
    mode: 384
  });
  if (process.platform !== "win32")
    chmodSync(configPath, 384);
}
function resolveQlooConfigPath(options = {}) {
  const env = options.env ?? process.env;
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const configuredRoot = nonEmptyString(env.QLOO_HOME);
  if (!configuredRoot)
    return join(homeDirectory, ".qloo", "config");
  const root = configuredRoot === "~" ? homeDirectory : configuredRoot.startsWith("~/") || configuredRoot.startsWith("~\\") ? join(homeDirectory, configuredRoot.slice(2)) : isAbsolute(configuredRoot) ? resolve(configuredRoot) : resolve(configuredRoot);
  if (root === homeDirectory || root === parse(root).root) {
    throw new Error("QLOO_HOME must name a dedicated subdirectory, not a home or filesystem root.");
  }
  return join(root, "config");
}
function resolveQlooClientConfiguration(options = {}) {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? resolveQlooConfigPath({ env });
  const fileConfig = loadQlooConfig(configPath, options.readFile);
  const environmentApiKey = nonEmptyString(env.QLOO_API_KEY);
  const environmentBaseUrl = nonEmptyString(env.QLOO_BASE_URL);
  const environmentTrustedBaseUrl = nonEmptyString(env.QLOO_TRUSTED_BASE_URL);
  const apiKey = environmentApiKey ?? fileConfig.api_key;
  const baseUrl = environmentBaseUrl ?? fileConfig.base_url;
  const effectiveBaseUrl = baseUrl ?? QLOO_PRODUCTION_BASE_URL;
  const baseUrlTrustSource = isOfficialQlooBaseUrl(effectiveBaseUrl) ? "official" : environmentTrustedBaseUrl && areEquivalentQlooBaseUrls(effectiveBaseUrl, environmentTrustedBaseUrl) ? "environment" : fileConfig.trusted_base_url && areEquivalentQlooBaseUrls(effectiveBaseUrl, fileConfig.trusted_base_url) ? "config" : "missing";
  return {
    ...apiKey ? { apiKey } : {},
    apiKeySource: environmentApiKey ? "environment" : fileConfig.api_key ? "config" : "missing",
    ...baseUrl ? { baseUrl } : {},
    baseUrlSource: environmentBaseUrl ? "environment" : fileConfig.base_url ? "config" : "default",
    baseUrlTrusted: baseUrlTrustSource !== "missing",
    baseUrlTrustSource,
    fileConfig
  };
}

// packages/qloo-client-ts/dist/errors.js
var QlooClientError = class extends Error {
  code;
  retryable;
  status;
  requestId;
  details;
  constructor(code, message, options = {}) {
    super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
    this.name = "QlooClientError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== void 0)
      this.status = options.status;
    if (options.requestId !== void 0)
      this.requestId = options.requestId;
    if (options.details !== void 0)
      this.details = options.details;
  }
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...this.status === void 0 ? {} : { status: this.status },
      ...this.requestId === void 0 ? {} : { requestId: this.requestId },
      ...this.details === void 0 ? {} : { details: this.details }
    };
  }
};
var DNS_CODES = /* @__PURE__ */ new Set([
  "EAI_AGAIN",
  "EAI_FAIL",
  "ENODATA",
  "ENOTFOUND",
  "ENOTIMP",
  "ENOTINITIALIZED",
  "ESERVFAIL"
]);
var CONNECTION_CODES = /* @__PURE__ */ new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTDOWN",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET"
]);
var TLS_CODES = /* @__PURE__ */ new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);
var PROXY_CODES = /* @__PURE__ */ new Set([
  "ERR_PROXY_AUTH_UNSUPPORTED",
  "UND_ERR_PRX"
]);
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function safeErrorCode(value) {
  if (!isRecord(value))
    return void 0;
  const code = value.code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(code) ? code : void 0;
}
function errorChain(value) {
  const chain = [];
  const seen = /* @__PURE__ */ new Set();
  let current = value;
  for (let depth = 0; depth < 8 && current !== void 0 && !seen.has(current); depth += 1) {
    chain.push(current);
    seen.add(current);
    if (!isRecord(current))
      break;
    if (Array.isArray(current.errors) && current.errors.length > 0) {
      chain.push(...current.errors.slice(0, 4));
    }
    current = current.cause;
  }
  return chain;
}
function classifyQlooNetworkFailure(cause) {
  const chain = errorChain(cause);
  const systemCode = chain.map(safeErrorCode).find((value) => value !== void 0);
  const names = chain.map((value) => isRecord(value) && typeof value.name === "string" ? value.name : void 0).filter((value) => value !== void 0);
  if (names.includes("AbortError") || systemCode === "ABORT_ERR") {
    return {
      code: "QLOO_ABORTED",
      kind: "aborted",
      message: "Qloo API request was cancelled.",
      retryable: false,
      ...systemCode ? { systemCode } : {}
    };
  }
  if (systemCode && DNS_CODES.has(systemCode)) {
    return {
      code: "QLOO_DNS_ERROR",
      kind: "dns",
      message: "Could not resolve the Qloo API hostname. Check DNS and VPN configuration.",
      retryable: true,
      systemCode
    };
  }
  if (systemCode && (TLS_CODES.has(systemCode) || systemCode.startsWith("ERR_TLS_") || systemCode.startsWith("ERR_SSL_"))) {
    return {
      code: "QLOO_TLS_ERROR",
      kind: "tls",
      message: "Could not establish a trusted TLS connection to the Qloo API.",
      retryable: false,
      systemCode
    };
  }
  if (systemCode && PROXY_CODES.has(systemCode)) {
    return {
      code: "QLOO_PROXY_ERROR",
      kind: "proxy",
      message: "The configured network proxy could not reach the Qloo API.",
      retryable: true,
      systemCode
    };
  }
  if (systemCode && CONNECTION_CODES.has(systemCode)) {
    return {
      code: "QLOO_CONNECTION_ERROR",
      kind: "connection",
      message: "Could not open a connection to the Qloo API. Check VPN, routing, and firewall configuration.",
      retryable: true,
      systemCode
    };
  }
  return {
    code: "QLOO_NETWORK_ERROR",
    kind: "network",
    message: "Unable to reach the Qloo API because of an unclassified network failure.",
    retryable: true,
    ...systemCode ? { systemCode } : {}
  };
}

// packages/qloo-client-ts/dist/client.js
var DEFAULT_TIMEOUT_MS = 2e4;
var DEFAULT_MAX_ATTEMPTS = 3;
var DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
var DEFAULT_MAX_RETRY_DELAY_MS = 3e4;
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
function validatePositiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new QlooClientError("QLOO_CONFIGURATION_ERROR", `${name} must be a positive integer.`);
  }
}
function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new QlooClientError("QLOO_CONFIGURATION_ERROR", "Qloo base URL is invalid.", {
      cause
    });
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new QlooClientError("QLOO_CONFIGURATION_ERROR", "Qloo base URL must use HTTPS (HTTP is allowed only for a loopback test server).");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new QlooClientError("QLOO_CONFIGURATION_ERROR", "Qloo base URL cannot contain credentials, query parameters, or a fragment.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url;
}
function appendQuery(url, query) {
  for (const [key, value] of Object.entries(query)) {
    if (value === void 0 || value === null || value === "")
      continue;
    const serialized = Array.isArray(value) ? value.join(",") : String(value);
    if (serialized !== "")
      url.searchParams.set(key, serialized);
  }
}
function requestIdFrom(response) {
  return response.headers.get("x-qloo-request-id") ?? response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? void 0;
}
function responseErrorMetadata(response) {
  const requestId = requestIdFrom(response);
  return {
    status: response.status,
    ...requestId ? { requestId } : {}
  };
}
function retryAfterMilliseconds(response, now = Date.now()) {
  const value = response.headers.get("retry-after");
  if (!value)
    return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return seconds * 1e3;
  const date = Date.parse(value);
  if (!Number.isNaN(date))
    return Math.max(0, date - now);
  return void 0;
}
function responseMessage(body, response) {
  if (body && typeof body === "object") {
    for (const key of ["message", "reason", "error"]) {
      const value = Reflect.get(body, key);
      if (typeof value === "string" && value.trim())
        return value;
    }
  }
  return `Qloo API request failed with ${response.status} ${response.statusText || "HTTP error"}.`;
}
function createAttemptSignal(parent, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Qloo request timed out."));
  }, timeoutMs);
  timeout.unref?.();
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted)
    onParentAbort();
  else
    parent?.addEventListener("abort", onParentAbort, { once: true });
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", onParentAbort);
    }
  };
}
async function defaultSleep(milliseconds, signal) {
  if (signal?.aborted)
    throw signal.reason;
  await new Promise((resolve2, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve2();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
async function readBoundedBody(response, maxBytes) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    await response.body?.cancel();
    throw new QlooClientError("QLOO_RESPONSE_TOO_LARGE", `Qloo API response exceeded the ${maxBytes}-byte limit.`, responseErrorMetadata(response));
  }
  if (!response.body)
    return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done)
      break;
    if (!value)
      continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new QlooClientError("QLOO_RESPONSE_TOO_LARGE", `Qloo API response exceeded the ${maxBytes}-byte limit.`, responseErrorMetadata(response));
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
function parseJsonBody(text, response) {
  if (!text.trim())
    return {};
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new QlooClientError("QLOO_RESPONSE_ERROR", "Qloo API returned invalid JSON.", {
      cause,
      retryable: response.status >= 500,
      ...responseErrorMetadata(response)
    });
  }
}
var QlooClient = class {
  baseUrl;
  #apiKey;
  #baseUrl;
  #timeoutMs;
  #maxAttempts;
  #maxResponseBytes;
  #maxRetryDelayMs;
  #userAgent;
  #fetch;
  #sleep;
  #random;
  constructor(options) {
    if (!options.apiKey?.trim()) {
      throw new QlooClientError("QLOO_CONFIGURATION_ERROR", "Qloo API key is required.");
    }
    this.#apiKey = options.apiKey;
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? QLOO_PRODUCTION_BASE_URL);
    if (!isOfficialQlooBaseUrl(this.#baseUrl.toString()) && !options.allowCustomBaseUrl) {
      throw new QlooClientError("QLOO_CONFIGURATION_ERROR", "Custom Qloo base URL is not trusted. Approve the exact endpoint before sending credentials.");
    }
    this.baseUrl = this.#baseUrl.toString().replace(/\/$/, "");
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.#maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.#userAgent = options.userAgent ?? "agentic-qloo-client/0.1.0";
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#random = options.random ?? Math.random;
    validatePositiveInteger("timeoutMs", this.#timeoutMs);
    validatePositiveInteger("maxAttempts", this.#maxAttempts);
    validatePositiveInteger("maxResponseBytes", this.#maxResponseBytes);
    validatePositiveInteger("maxRetryDelayMs", this.#maxRetryDelayMs);
  }
  async get(path, query = {}, options = {}) {
    if (path.includes("\\") || path.startsWith("//") || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(path) || /[?#\u0000-\u001f\u007f]/u.test(path)) {
      throw new QlooClientError("QLOO_CONFIGURATION_ERROR", "Qloo request path must be a relative API path without a query or fragment.");
    }
    const relativePath = path.replace(/^\/+/, "");
    const url = new URL(relativePath, this.#baseUrl);
    if (url.origin !== this.#baseUrl.origin || !url.pathname.startsWith(this.#baseUrl.pathname)) {
      throw new QlooClientError("QLOO_CONFIGURATION_ERROR", "Qloo request path cannot escape the trusted API base URL.");
    }
    appendQuery(url, query);
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      if (options.signal?.aborted)
        throw options.signal.reason;
      const attemptSignal = createAttemptSignal(options.signal, this.#timeoutMs);
      let response;
      let body;
      try {
        response = await this.#fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Api-Key": this.#apiKey,
            "User-Agent": this.#userAgent,
            ...options.correlationId ? { "X-Correlation-Id": options.correlationId } : {}
          },
          signal: attemptSignal.signal
        });
        const text = await readBoundedBody(response, this.#maxResponseBytes);
        body = parseJsonBody(text, response);
      } catch (cause) {
        const timedOut = attemptSignal.didTimeout();
        attemptSignal.dispose();
        if (options.signal?.aborted)
          throw options.signal.reason;
        if (cause instanceof QlooClientError) {
          if (cause.retryable && attempt < this.#maxAttempts) {
            await this.#sleep(this.#retryDelay(attempt), options.signal);
            continue;
          }
          throw cause;
        }
        if (timedOut) {
          if (attempt < this.#maxAttempts) {
            await this.#sleep(this.#retryDelay(attempt), options.signal);
            continue;
          }
          throw new QlooClientError("QLOO_TIMEOUT", "Qloo API request timed out.", {
            cause,
            retryable: true
          });
        }
        if (attempt < this.#maxAttempts) {
          await this.#sleep(this.#retryDelay(attempt), options.signal);
          continue;
        }
        const failure = classifyQlooNetworkFailure(cause);
        throw new QlooClientError(failure.code, failure.message, {
          cause,
          retryable: failure.retryable,
          details: {
            kind: failure.kind,
            attempts: this.#maxAttempts,
            ...failure.systemCode ? { systemCode: failure.systemCode } : {}
          }
        });
      } finally {
        attemptSignal.dispose();
      }
      if (response.ok)
        return body;
      const retryable = RETRYABLE_STATUS_CODES.has(response.status);
      if (retryable && attempt < this.#maxAttempts) {
        const retryAfter = retryAfterMilliseconds(response);
        await this.#sleep(Math.min(retryAfter ?? this.#retryDelay(attempt), this.#maxRetryDelayMs), options.signal);
        continue;
      }
      throw new QlooClientError("QLOO_HTTP_ERROR", responseMessage(body, response), {
        retryable,
        details: body,
        ...responseErrorMetadata(response)
      });
    }
    throw new QlooClientError("QLOO_NETWORK_ERROR", "Unable to reach the Qloo API.", {
      retryable: true
    });
  }
  apiInformation(options) {
    return this.get("/", {}, options);
  }
  insights(query, options) {
    return this.get("/v2/insights", query, options);
  }
  searchEntities(query, options) {
    return this.get("/search", query, options);
  }
  entities(entityIds, options) {
    return this.get("/entities", { entity_ids: entityIds }, options);
  }
  audiences(query = {}, options) {
    return this.get("/v2/audiences", query, options);
  }
  audienceTypes(query = {}, options) {
    return this.get("/v2/audiences/types", query, options);
  }
  tags(query = {}, options) {
    return this.get("/v2/tags", query, options);
  }
  tagTypes(query = {}, options) {
    return this.get("/v2/tags/types", query, options);
  }
  compare(query, options) {
    return this.get("/v2/analysis/compare", query, options);
  }
  trending(query, options) {
    return this.get("/v2/trending", query, options);
  }
  #retryDelay(attempt) {
    const exponential = 250 * 2 ** (attempt - 1);
    const jittered = exponential * (0.75 + this.#random() * 0.5);
    return Math.min(Math.round(jittered), this.#maxRetryDelayMs);
  }
};

// packages/qloo-client-ts/dist/diagnostics.js
var DEFAULT_PROBE_TIMEOUT_MS = 5e3;
function elapsed(startedAt, now) {
  return Math.max(0, Math.round(now() - startedAt));
}
function configurationFailure(message, durationMs) {
  return {
    ok: false,
    reachable: false,
    kind: "configuration",
    message,
    durationMs,
    retryable: false
  };
}
function normalizedProbeUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Qloo base URL must use HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Qloo base URL contains unsupported URL components.");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url;
}
function httpFailure(status, durationMs, requestId) {
  const metadata = {
    durationMs,
    reachable: true,
    status,
    ...requestId ? { requestId } : {}
  };
  if (status === 401 || status === 403) {
    return {
      ...metadata,
      ok: false,
      kind: "authentication",
      message: `Qloo API is reachable but rejected the configured credential (HTTP ${status}).`,
      retryable: false
    };
  }
  if (status === 429) {
    return {
      ...metadata,
      ok: false,
      kind: "rate-limit",
      message: "Qloo API is reachable but the credential is currently rate limited.",
      retryable: true
    };
  }
  if (status >= 500) {
    return {
      ...metadata,
      ok: false,
      kind: "service",
      message: `Qloo API is reachable but returned a service error (HTTP ${status}).`,
      retryable: true
    };
  }
  return {
    ...metadata,
    ok: false,
    kind: "http",
    message: `Qloo API is reachable but the readiness request failed (HTTP ${status}).`,
    retryable: false
  };
}
function clientFailure(error, durationMs) {
  if (error.code === "QLOO_HTTP_ERROR" && error.status !== void 0) {
    return httpFailure(error.status, durationMs, error.requestId);
  }
  if (error.code === "QLOO_TIMEOUT") {
    return {
      ok: false,
      reachable: false,
      kind: "timeout",
      message: "Timed out while connecting to the Qloo API. Check VPN routing and firewall configuration.",
      durationMs,
      retryable: true
    };
  }
  if (error.code === "QLOO_CONFIGURATION_ERROR") {
    return configurationFailure(error.message, durationMs);
  }
  const details = error.details && typeof error.details === "object" ? error.details : {};
  const systemCode = typeof details.systemCode === "string" ? details.systemCode : void 0;
  const kind = error.code === "QLOO_DNS_ERROR" ? "dns" : error.code === "QLOO_TLS_ERROR" ? "tls" : error.code === "QLOO_CONNECTION_ERROR" || error.code === "QLOO_PROXY_ERROR" ? "connection" : error.code === "QLOO_ABORTED" ? "cancelled" : "connection";
  return {
    ok: false,
    reachable: false,
    kind,
    message: error.message,
    durationMs,
    retryable: error.retryable,
    ...systemCode ? { systemCode } : {}
  };
}
async function probeQlooConnectivity(options = {}) {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const baseUrl = options.baseUrl ?? QLOO_PRODUCTION_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return configurationFailure("Qloo connectivity timeout must be a positive integer.", elapsed(startedAt, now));
  }
  if (!isOfficialQlooBaseUrl(baseUrl) && !options.allowCustomBaseUrl) {
    return configurationFailure("Custom Qloo endpoint is not trusted; connectivity probe was not sent.", elapsed(startedAt, now));
  }
  if (options.apiKey?.trim()) {
    try {
      const client = new QlooClient({
        apiKey: options.apiKey,
        baseUrl,
        ...options.allowCustomBaseUrl === void 0 ? {} : { allowCustomBaseUrl: options.allowCustomBaseUrl },
        timeoutMs,
        maxAttempts: 1,
        ...options.fetch ? { fetch: options.fetch } : {}
      });
      await client.apiInformation();
      return {
        ok: true,
        reachable: true,
        kind: "ready",
        message: "Qloo API is reachable and accepted the configured credential.",
        durationMs: elapsed(startedAt, now),
        retryable: false
      };
    } catch (error) {
      if (error instanceof QlooClientError)
        return clientFailure(error, elapsed(startedAt, now));
      const failure = classifyQlooNetworkFailure(error);
      return {
        ok: false,
        reachable: false,
        kind: failure.kind === "aborted" ? "cancelled" : failure.kind === "network" ? "connection" : failure.kind,
        message: failure.message,
        durationMs: elapsed(startedAt, now),
        retryable: failure.retryable,
        ...failure.systemCode ? { systemCode: failure.systemCode } : {}
      };
    }
  }
  let url;
  try {
    url = normalizedProbeUrl(baseUrl);
  } catch {
    return configurationFailure("Qloo base URL is invalid.", elapsed(startedAt, now));
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timeout.unref?.();
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "agentic-qloo-doctor/0.1.0"
      },
      redirect: "manual",
      signal: controller.signal
    });
    await response.body?.cancel();
    return {
      ok: true,
      reachable: true,
      kind: "reachable",
      message: `Qloo API endpoint is reachable (HTTP ${response.status}); authentication was not tested.`,
      durationMs: elapsed(startedAt, now),
      retryable: false,
      status: response.status,
      ...(() => {
        const requestId = response.headers.get("x-request-id");
        return requestId ? { requestId } : {};
      })()
    };
  } catch (error) {
    if (timedOut) {
      return {
        ok: false,
        reachable: false,
        kind: "timeout",
        message: "Timed out while connecting to the Qloo API. Check VPN routing and firewall configuration.",
        durationMs: elapsed(startedAt, now),
        retryable: true
      };
    }
    const failure = classifyQlooNetworkFailure(error);
    return {
      ok: false,
      reachable: false,
      kind: failure.kind === "aborted" ? "cancelled" : failure.kind === "network" ? "connection" : failure.kind,
      message: failure.message,
      durationMs: elapsed(startedAt, now),
      retryable: failure.retryable,
      ...failure.systemCode ? { systemCode: failure.systemCode } : {}
    };
  } finally {
    clearTimeout(timeout);
  }
}

export {
  QLOO_PRODUCTION_BASE_URL,
  areEquivalentQlooBaseUrls,
  isOfficialQlooBaseUrl,
  parseQlooConfig,
  saveQlooConfigValue,
  resolveQlooConfigPath,
  resolveQlooClientConfiguration,
  QlooClientError,
  QlooClient,
  probeQlooConnectivity
};
