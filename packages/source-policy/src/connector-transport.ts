import {
  checkedInConnectorPolicyRegistryV1,
  type ConnectorPolicyRecordV1,
  type ConnectorPolicyRegistryV1,
  type ConnectorRuntimeControlV1,
} from "./connector-policy.js";
import {
  GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
  GREENHOUSE_JOB_BOARD_POLICY_METHOD,
} from "./greenhouse-job-board.js";
import { LEVER_POSTINGS_CONNECTOR_ID, LEVER_POSTINGS_POLICY_METHOD } from "./lever-postings.js";
import { USAJOBS_SEARCH_CONNECTOR_ID, USAJOBS_SEARCH_POLICY_METHOD } from "./usajobs-search.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const CONNECTOR_TRANSPORT_LIMITS_V1 = Object.freeze({
  cacheTtlMs: DAY_MS,
  maxCacheEntries: 128,
  maxResponseBytes: 2 * 1_024 * 1_024,
  minRequestIntervalMs: 1_000,
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 30_000,
});

export const CONNECTOR_TRANSPORT_ERROR_CODES = [
  "connector_not_enabled",
  "request_not_user_initiated",
  "request_not_get",
  "request_shape_invalid",
  "policy_denied",
  "request_in_flight",
  "response_invalid",
  "response_too_large",
  "retry_after_exceeds_limit",
  "retry_exhausted",
  "http_terminal",
] as const;

export type ConnectorTransportErrorCode = (typeof CONNECTOR_TRANSPORT_ERROR_CODES)[number];

export interface ConnectorTransportRequestV1 {
  readonly connectorId: string;
  readonly policyMethod: string;
  readonly destinationUrl: string;
  readonly httpMethod: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ConnectorHttpResponseV1 {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface ConnectorTransportAttributionV1 {
  readonly label: string;
  readonly sourceUrl: string;
  readonly termsUrl: string;
  readonly reviewedAt: string;
  readonly reviewDueAt: string;
  readonly reviewAgeDays: number;
}

export interface ConnectorTransportResultV1 {
  readonly connectorId: string;
  readonly source: "network" | "memory_cache";
  readonly attempts: number;
  readonly response: ConnectorHttpResponseV1;
  readonly attribution: ConnectorTransportAttributionV1;
  readonly cache: {
    readonly storedAt: string;
    readonly expiresAt: string;
    readonly retention: "memory_only";
  };
}

export interface ConnectorTransportExecutionV1 {
  readonly request: ConnectorTransportRequestV1;
  readonly userInitiated: boolean;
  readonly enabledConnectorIds: readonly string[];
  readonly runtimeControl?: ConnectorRuntimeControlV1;
}

export interface ConnectorPolicyDisclosureV1 {
  readonly connectorId: string;
  readonly label: string;
  readonly effectiveState: "off" | "ready" | "blocked";
  readonly reviewState: "not_yet_valid" | "current" | "due_soon" | "expired";
  readonly reviewedAt: string;
  readonly reviewDueAt: string;
  readonly reviewAgeDays: number;
  readonly reviewDueInDays: number;
  readonly lastUsedAt: string | null;
  readonly destinationDomains: readonly string[];
  readonly attributionLabel: string;
  readonly termsUrl: string;
  readonly privacyUrl: string;
  readonly credentials: ConnectorPolicyRecordV1["credentials"];
  readonly ratePolicy: string;
  readonly retention: string;
  readonly userVisibleDataFlow: string;
}

interface ConnectorTransportProfileV1 {
  readonly connectorId: string;
  readonly label: string;
  readonly attributionLabel: string;
  readonly scopeFor: (request: ConnectorTransportRequestV1, url: URL) => string | null;
}

interface CachedResponseV1 {
  readonly response: ConnectorHttpResponseV1;
  readonly storedAtMs: number;
  readonly expiresAtMs: number;
}

export interface ConnectorTransportV1 {
  readonly execute: (
    execution: ConnectorTransportExecutionV1,
  ) => Promise<ConnectorTransportResultV1>;
  readonly disclosures: (
    now: string,
    enabledConnectorIds?: readonly string[],
    runtimeControl?: ConnectorRuntimeControlV1,
  ) => readonly ConnectorPolicyDisclosureV1[];
  readonly clearMemoryCache: () => void;
}

export interface ConnectorTransportDependenciesV1 {
  readonly registry?: ConnectorPolicyRegistryV1;
  readonly request: (request: ConnectorTransportRequestV1) => Promise<unknown>;
  readonly now?: () => number;
  readonly delay?: (milliseconds: number) => Promise<void>;
}

export class ConnectorTransportError extends Error {
  readonly code: ConnectorTransportErrorCode;
  readonly connectorId: string;
  readonly attempts: number;
  readonly status: number | null;

  constructor(
    code: ConnectorTransportErrorCode,
    connectorId: string,
    options: { readonly attempts?: number; readonly status?: number | null } = {},
  ) {
    super(code);
    this.name = "ConnectorTransportError";
    this.code = code;
    this.connectorId = connectorId;
    this.attempts = options.attempts ?? 0;
    this.status = options.status ?? null;
  }
}

const pathSegments = (url: URL): readonly string[] =>
  url.pathname.split("/").filter((segment) => segment.length > 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (record: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const BASE_REQUEST_KEYS = Object.freeze([
  "specVersion",
  "connectorId",
  "policyMethod",
  "httpMethod",
  "destinationUrl",
  "credentials",
  "headers",
]);
const USAJOBS_REQUEST_KEYS = Object.freeze([
  ...BASE_REQUEST_KEYS,
  "requiredHeaderBindings",
  "publicJobsOnly",
  "executionBoundary",
]);
const GREENHOUSE_BOARD_TOKEN = /^[A-Za-z0-9_-]{1,128}$/u;
const GREENHOUSE_JOB_ID = /^[1-9][0-9]{0,15}$/u;
const LEVER_SITE = /^[a-z0-9][a-z0-9_-]{0,127}$/u;
const LEVER_POSTING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const hasExactAcceptHeader = (value: unknown): boolean =>
  isPlainRecord(value) && hasExactKeys(value, ["accept"]) && value["accept"] === "application/json";

const hasExactRequestBase = (
  request: ConnectorTransportRequestV1,
  expectedKeys: readonly string[],
  connectorId: string,
  policyMethod: string,
  credentials: "omit" | "user_configured",
): boolean => {
  const record = request as unknown;
  return (
    isPlainRecord(record) &&
    hasExactKeys(record, expectedKeys) &&
    record["specVersion"] === 1 &&
    record["connectorId"] === connectorId &&
    record["policyMethod"] === policyMethod &&
    record["httpMethod"] === "GET" &&
    typeof record["destinationUrl"] === "string" &&
    record["credentials"] === credentials &&
    hasExactAcceptHeader(record["headers"])
  );
};

const hasExactUsaJobsHeaderBindings = (value: unknown): boolean => {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["Host", "User-Agent", "Authorization-Key"])) {
    return false;
  }
  return (
    isPlainRecord(value["Host"]) &&
    hasExactKeys(value["Host"], ["binding"]) &&
    value["Host"]["binding"] === "destination_host" &&
    isPlainRecord(value["User-Agent"]) &&
    hasExactKeys(value["User-Agent"], ["binding"]) &&
    value["User-Agent"]["binding"] === "registered_email" &&
    isPlainRecord(value["Authorization-Key"]) &&
    hasExactKeys(value["Authorization-Key"], ["binding"]) &&
    value["Authorization-Key"]["binding"] === "api_key"
  );
};

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

const isBoundedText = (value: string | null, maximum: number): value is string =>
  value !== null &&
  value.length > 0 &&
  value.length <= maximum &&
  value.trim() === value &&
  !hasControlCharacter(value);

const isBoundedIntegerText = (value: string | null, minimum: number, maximum: number): boolean =>
  value !== null &&
  /^(0|[1-9][0-9]*)$/u.test(value) &&
  Number(value) >= minimum &&
  Number(value) <= maximum;

const isUniqueBoundedList = (
  value: string | null,
  maximumEntries: number,
  maximumEntryLength: number,
  pattern?: RegExp,
): boolean => {
  if (value === null) return true;
  const entries = value.split(";");
  return (
    entries.length > 0 &&
    entries.length <= maximumEntries &&
    new Set(entries).size === entries.length &&
    entries.every(
      (entry) =>
        isBoundedText(entry, maximumEntryLength) && (pattern === undefined || pattern.test(entry)),
    )
  );
};

const USAJOBS_QUERY_KEYS = Object.freeze([
  "Keyword",
  "PositionTitle",
  "LocationName",
  "JobCategoryCode",
  "RemoteIndicator",
  "DatePosted",
  "Page",
  "ResultsPerPage",
  "WhoMayApply",
  "Fields",
]);

const hasExactUsaJobsQuery = (url: URL): boolean => {
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => !USAJOBS_QUERY_KEYS.includes(key)) ||
    USAJOBS_QUERY_KEYS.some((key) => url.searchParams.getAll(key).length > 1) ||
    url.searchParams.get("WhoMayApply") !== "Public" ||
    url.searchParams.get("Fields") !== "Full" ||
    !isBoundedIntegerText(url.searchParams.get("Page"), 1, 100) ||
    !isBoundedIntegerText(url.searchParams.get("ResultsPerPage"), 1, 100)
  ) {
    return false;
  }

  const keyword = url.searchParams.get("Keyword");
  const positionTitle = url.searchParams.get("PositionTitle");
  const locationName = url.searchParams.get("LocationName");
  const jobCategoryCode = url.searchParams.get("JobCategoryCode");
  if (
    (keyword !== null && !isBoundedText(keyword, 256)) ||
    (positionTitle !== null && !isBoundedText(positionTitle, 256)) ||
    !isUniqueBoundedList(locationName, 10, 256) ||
    !isUniqueBoundedList(jobCategoryCode, 16, 4, /^[0-9]{4}$/u) ||
    [keyword, positionTitle, locationName, jobCategoryCode].every((value) => value === null)
  ) {
    return false;
  }

  const remoteIndicator = url.searchParams.get("RemoteIndicator");
  const datePosted = url.searchParams.get("DatePosted");
  return (
    (remoteIndicator === null || remoteIndicator === "True" || remoteIndicator === "False") &&
    (datePosted === null || isBoundedIntegerText(datePosted, 0, 60))
  );
};

const greenhouseScope = (request: ConnectorTransportRequestV1, url: URL): string | null => {
  const segments = pathSegments(url);
  const boardToken = segments[2] ?? "";
  if (
    !hasExactRequestBase(
      request,
      BASE_REQUEST_KEYS,
      GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
      GREENHOUSE_JOB_BOARD_POLICY_METHOD,
      "omit",
    ) ||
    segments.length !== 5 ||
    segments[0] !== "v1" ||
    segments[1] !== "boards" ||
    segments[3] !== "jobs" ||
    !GREENHOUSE_BOARD_TOKEN.test(boardToken) ||
    !GREENHOUSE_JOB_ID.test(segments[4] ?? "") ||
    url.search !== "?pay_transparency=true" ||
    url.hash !== ""
  ) {
    return null;
  }
  return `greenhouse:${boardToken}`;
};

const leverScope = (request: ConnectorTransportRequestV1, url: URL): string | null => {
  const segments = pathSegments(url);
  const site = segments[2] ?? "";
  if (
    !hasExactRequestBase(
      request,
      BASE_REQUEST_KEYS,
      LEVER_POSTINGS_CONNECTOR_ID,
      LEVER_POSTINGS_POLICY_METHOD,
      "omit",
    ) ||
    segments.length !== 4 ||
    segments[0] !== "v0" ||
    segments[1] !== "postings" ||
    !LEVER_SITE.test(site) ||
    !LEVER_POSTING_ID.test(segments[3] ?? "") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return null;
  }
  return `lever:${url.hostname}:${site}`;
};

const usaJobsScope = (request: ConnectorTransportRequestV1, url: URL): string | null => {
  const record = request as unknown as Record<string, unknown>;
  return hasExactRequestBase(
    request,
    USAJOBS_REQUEST_KEYS,
    USAJOBS_SEARCH_CONNECTOR_ID,
    USAJOBS_SEARCH_POLICY_METHOD,
    "user_configured",
  ) &&
    hasExactUsaJobsHeaderBindings(record["requiredHeaderBindings"]) &&
    record["publicJobsOnly"] === true &&
    record["executionBoundary"] === "privileged_connector_only" &&
    url.pathname === "/api/search" &&
    url.hash === "" &&
    hasExactUsaJobsQuery(url)
    ? `usajobs:${url.hostname}`
    : null;
};

const CONNECTOR_TRANSPORT_PROFILES_V1: Readonly<Record<string, ConnectorTransportProfileV1>> =
  Object.freeze({
    [GREENHOUSE_JOB_BOARD_CONNECTOR_ID]: Object.freeze({
      connectorId: GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
      label: "Greenhouse Job Board",
      attributionLabel: "Greenhouse Job Board API",
      scopeFor: greenhouseScope,
    }),
    [LEVER_POSTINGS_CONNECTOR_ID]: Object.freeze({
      connectorId: LEVER_POSTINGS_CONNECTOR_ID,
      label: "Lever Postings",
      attributionLabel: "Lever Postings API",
      scopeFor: leverScope,
    }),
    [USAJOBS_SEARCH_CONNECTOR_ID]: Object.freeze({
      connectorId: USAJOBS_SEARCH_CONNECTOR_ID,
      label: "USAJOBS Search",
      attributionLabel: "USAJOBS",
      scopeFor: usaJobsScope,
    }),
  });

const defaultDelay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const requireInstant = (value: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new TypeError("now must be a canonical UTC instant");
  }
  return timestamp;
};

const reviewFacts = (
  record: ConnectorPolicyRecordV1,
  nowMs: number,
): Pick<ConnectorPolicyDisclosureV1, "reviewState" | "reviewAgeDays" | "reviewDueInDays"> => {
  const reviewedAtMs = Date.parse(record.reviewedAt);
  const reviewDueAtMs = Date.parse(record.reviewDueAt);
  const reviewAgeDays = Math.floor((nowMs - reviewedAtMs) / DAY_MS);
  const reviewDueInDays = Math.ceil((reviewDueAtMs - nowMs) / DAY_MS);
  const reviewState =
    nowMs < reviewedAtMs
      ? "not_yet_valid"
      : nowMs >= reviewDueAtMs
        ? "expired"
        : reviewDueInDays <= 7
          ? "due_soon"
          : "current";
  return { reviewState, reviewAgeDays, reviewDueInDays };
};

const runtimeBlocks = (
  connectorId: string,
  runtimeControl: ConnectorRuntimeControlV1 | undefined,
): boolean =>
  runtimeControl?.disableAllNetworkConnectors === true ||
  runtimeControl?.disabledConnectorIds.includes(connectorId) === true;

export function createConnectorPolicyDisclosuresV1(
  now: string,
  enabledConnectorIds: readonly string[] = [],
  runtimeControl?: ConnectorRuntimeControlV1,
  lastUsedAt: ReadonlyMap<string, string> = new Map(),
  registry: ConnectorPolicyRegistryV1 = checkedInConnectorPolicyRegistryV1,
): readonly ConnectorPolicyDisclosureV1[] {
  const nowMs = requireInstant(now);
  const enabled = new Set(enabledConnectorIds);

  return Object.freeze(
    registry.records.map((record) => {
      const profile = CONNECTOR_TRANSPORT_PROFILES_V1[record.id];
      if (profile === undefined) {
        throw new ConnectorTransportError("request_shape_invalid", record.id);
      }
      const review = reviewFacts(record, nowMs);
      const blocked =
        record.status !== "enabled" ||
        runtimeBlocks(record.id, runtimeControl) ||
        review.reviewState === "expired" ||
        review.reviewState === "not_yet_valid";
      return Object.freeze({
        connectorId: record.id,
        label: profile.label,
        effectiveState: blocked ? "blocked" : enabled.has(record.id) ? "ready" : "off",
        ...review,
        reviewedAt: record.reviewedAt,
        reviewDueAt: record.reviewDueAt,
        lastUsedAt: lastUsedAt.get(record.id) ?? null,
        destinationDomains: record.baseDomains,
        attributionLabel: profile.attributionLabel,
        termsUrl: record.termsUrl,
        privacyUrl: record.privacyUrl,
        credentials: record.credentials,
        ratePolicy: record.ratePolicy,
        retention: record.retention,
        userVisibleDataFlow: record.userVisibleDataFlow,
      });
    }),
  );
}

const normalizeResponse = (connectorId: string, input: unknown): ConnectorHttpResponseV1 => {
  if (!isRecord(input)) {
    throw new ConnectorTransportError("response_invalid", connectorId);
  }
  const status = input["status"];
  const body = input["body"];
  const responseHeaders = input["headers"];
  if (
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599 ||
    typeof body !== "string" ||
    !isRecord(responseHeaders)
  ) {
    throw new ConnectorTransportError("response_invalid", connectorId);
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(responseHeaders)) {
    if (typeof value !== "string") {
      throw new ConnectorTransportError("response_invalid", connectorId);
    }
    headers[name.toLowerCase()] = value;
  }
  if (new TextEncoder().encode(body).byteLength > CONNECTOR_TRANSPORT_LIMITS_V1.maxResponseBytes) {
    throw new ConnectorTransportError("response_too_large", connectorId, { status });
  }
  return Object.freeze({
    status,
    headers: Object.freeze(headers),
    body,
  });
};

const retryAfterMilliseconds = (headerValue: string | undefined, nowMs: number): number | null => {
  if (headerValue === undefined) return null;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : null;
};

const retryableStatus = (status: number): boolean =>
  status === 429 || status === 502 || status === 503 || status === 504;

const freezeAttribution = (
  profile: ConnectorTransportProfileV1,
  record: ConnectorPolicyRecordV1,
  sourceUrl: string,
  nowMs: number,
): ConnectorTransportAttributionV1 =>
  Object.freeze({
    label: profile.attributionLabel,
    sourceUrl,
    termsUrl: record.termsUrl,
    reviewedAt: record.reviewedAt,
    reviewDueAt: record.reviewDueAt,
    reviewAgeDays: Math.floor((nowMs - Date.parse(record.reviewedAt)) / DAY_MS),
  });

export function createConnectorTransportV1({
  registry = checkedInConnectorPolicyRegistryV1,
  request: sendRequest,
  now = Date.now,
  delay = defaultDelay,
}: ConnectorTransportDependenciesV1): ConnectorTransportV1 {
  const records = new Map(registry.records.map((record) => [record.id, record] as const));
  const cache = new Map<string, CachedResponseV1>();
  const inFlightScopes = new Set<string>();
  const lastStartedAt = new Map<string, number>();
  const lastUsedAt = new Map<string, string>();

  const pruneCache = (nowMs: number): void => {
    for (const [key, entry] of cache) {
      if (entry.expiresAtMs <= nowMs) cache.delete(key);
    }
    while (cache.size > CONNECTOR_TRANSPORT_LIMITS_V1.maxCacheEntries) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  };

  const buildResult = (
    execution: ConnectorTransportExecutionV1,
    response: ConnectorHttpResponseV1,
    source: ConnectorTransportResultV1["source"],
    attempts: number,
    storedAtMs: number,
    expiresAtMs: number,
  ): ConnectorTransportResultV1 => {
    const record = records.get(execution.request.connectorId);
    const profile = CONNECTOR_TRANSPORT_PROFILES_V1[execution.request.connectorId];
    if (record === undefined || profile === undefined) {
      throw new ConnectorTransportError("policy_denied", execution.request.connectorId);
    }
    return Object.freeze({
      connectorId: execution.request.connectorId,
      source,
      attempts,
      response,
      attribution: freezeAttribution(profile, record, execution.request.destinationUrl, now()),
      cache: Object.freeze({
        storedAt: new Date(storedAtMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        retention: "memory_only",
      }),
    });
  };

  return Object.freeze({
    execute: async (
      execution: ConnectorTransportExecutionV1,
    ): Promise<ConnectorTransportResultV1> => {
      const { request } = execution;
      if (!execution.userInitiated) {
        throw new ConnectorTransportError("request_not_user_initiated", request.connectorId);
      }
      if (request.httpMethod !== "GET") {
        throw new ConnectorTransportError("request_not_get", request.connectorId);
      }
      if (!execution.enabledConnectorIds.includes(request.connectorId)) {
        throw new ConnectorTransportError("connector_not_enabled", request.connectorId);
      }

      let destination: URL;
      try {
        destination = new URL(request.destinationUrl);
      } catch {
        throw new ConnectorTransportError("request_shape_invalid", request.connectorId);
      }
      const profile = CONNECTOR_TRANSPORT_PROFILES_V1[request.connectorId];
      const scope = profile?.scopeFor(request, destination) ?? null;
      if (profile === undefined || scope === null) {
        throw new ConnectorTransportError("request_shape_invalid", request.connectorId);
      }

      const authorizeAtCurrentTime = (): number => {
        const timestamp = now();
        const decision = registry.authorize(
          {
            kind: "network_connector",
            connectorId: request.connectorId,
            method: request.policyMethod,
            destinationUrl: request.destinationUrl,
            now: new Date(timestamp).toISOString(),
          },
          execution.runtimeControl ?? {
            disableAllNetworkConnectors: false,
            disabledConnectorIds: [],
          },
        );
        if (!decision.allowed) {
          throw new ConnectorTransportError("policy_denied", request.connectorId);
        }
        return timestamp;
      };
      const authorizedAt = authorizeAtCurrentTime();

      pruneCache(authorizedAt);
      const cacheKey = `${request.connectorId}\n${request.destinationUrl}`;
      const cached = cache.get(cacheKey);
      if (cached !== undefined && cached.expiresAtMs > authorizedAt) {
        cache.delete(cacheKey);
        cache.set(cacheKey, cached);
        return buildResult(
          execution,
          cached.response,
          "memory_cache",
          0,
          cached.storedAtMs,
          cached.expiresAtMs,
        );
      }
      if (inFlightScopes.has(scope)) {
        throw new ConnectorTransportError("request_in_flight", request.connectorId);
      }

      inFlightScopes.add(scope);
      let attempts = 0;
      try {
        while (attempts < CONNECTOR_TRANSPORT_LIMITS_V1.maxAttempts) {
          const previousStart = lastStartedAt.get(scope);
          const waitForRateLimit =
            previousStart === undefined
              ? 0
              : Math.max(
                  0,
                  previousStart + CONNECTOR_TRANSPORT_LIMITS_V1.minRequestIntervalMs - now(),
                );
          if (waitForRateLimit > 0) await delay(waitForRateLimit);
          authorizeAtCurrentTime();
          lastStartedAt.set(scope, now());
          attempts += 1;

          let response: ConnectorHttpResponseV1;
          try {
            response = normalizeResponse(request.connectorId, await sendRequest(request));
          } catch (error) {
            if (error instanceof ConnectorTransportError) throw error;
            if (attempts >= CONNECTOR_TRANSPORT_LIMITS_V1.maxAttempts) {
              throw new ConnectorTransportError("retry_exhausted", request.connectorId, {
                attempts,
              });
            }
            const backoff = Math.min(
              CONNECTOR_TRANSPORT_LIMITS_V1.initialBackoffMs * 2 ** (attempts - 1),
              CONNECTOR_TRANSPORT_LIMITS_V1.maxBackoffMs,
            );
            await delay(backoff);
            continue;
          }

          if (response.status >= 200 && response.status < 300) {
            const storedAtMs = now();
            const expiresAtMs = storedAtMs + CONNECTOR_TRANSPORT_LIMITS_V1.cacheTtlMs;
            cache.set(cacheKey, Object.freeze({ response, storedAtMs, expiresAtMs }));
            pruneCache(storedAtMs);
            lastUsedAt.set(request.connectorId, new Date(storedAtMs).toISOString());
            return buildResult(execution, response, "network", attempts, storedAtMs, expiresAtMs);
          }

          if (!retryableStatus(response.status)) {
            throw new ConnectorTransportError("http_terminal", request.connectorId, {
              attempts,
              status: response.status,
            });
          }
          if (attempts >= CONNECTOR_TRANSPORT_LIMITS_V1.maxAttempts) {
            throw new ConnectorTransportError("retry_exhausted", request.connectorId, {
              attempts,
              status: response.status,
            });
          }

          const backoff = Math.min(
            CONNECTOR_TRANSPORT_LIMITS_V1.initialBackoffMs * 2 ** (attempts - 1),
            CONNECTOR_TRANSPORT_LIMITS_V1.maxBackoffMs,
          );
          const retryAfter = retryAfterMilliseconds(response.headers["retry-after"], now());
          if (retryAfter !== null && retryAfter > CONNECTOR_TRANSPORT_LIMITS_V1.maxBackoffMs) {
            throw new ConnectorTransportError("retry_after_exceeds_limit", request.connectorId, {
              attempts,
              status: response.status,
            });
          }
          await delay(Math.max(backoff, retryAfter ?? 0));
        }
        throw new ConnectorTransportError("retry_exhausted", request.connectorId, { attempts });
      } finally {
        inFlightScopes.delete(scope);
      }
    },
    disclosures: (
      nowInstant: string,
      enabledConnectorIds: readonly string[] = [],
      runtimeControl?: ConnectorRuntimeControlV1,
    ) =>
      createConnectorPolicyDisclosuresV1(
        nowInstant,
        enabledConnectorIds,
        runtimeControl,
        lastUsedAt,
        registry,
      ),
    clearMemoryCache: () => {
      cache.clear();
    },
  });
}
