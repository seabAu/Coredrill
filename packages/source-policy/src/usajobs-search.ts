import type { ConnectorPolicyRecordV1 } from "./connector-policy.js";

export const USAJOBS_SEARCH_CONNECTOR_ID = "usajobs-search" as const;
export const USAJOBS_SEARCH_API_HOST = "data.usajobs.gov" as const;
export const USAJOBS_SEARCH_API_ENDPOINT = `https://${USAJOBS_SEARCH_API_HOST}/api/search` as const;
export const USAJOBS_SEARCH_POLICY_METHOD = "configured_official_api" as const;
export const USAJOBS_SEARCH_SPEC_VERSION = 1 as const;

export const USAJOBS_SEARCH_LIMITS = Object.freeze({
  maxKeywordLength: 256,
  maxPositionTitleLength: 256,
  maxLocationLength: 256,
  maxLocations: 10,
  maxJobCategoryCodes: 16,
  maxPage: 100,
  maxResultsPerPage: 100,
  maxDatePostedDays: 60,
});

export const USAJOBS_SEARCH_ERROR_CODES = [
  "configuration_invalid",
  "query_invalid",
  "query_too_broad",
] as const;
export type UsaJobsSearchErrorCode = (typeof USAJOBS_SEARCH_ERROR_CODES)[number];

export interface UsaJobsSearchConfigurationAttestationV1 {
  readonly specVersion: 1;
  readonly registrationOwner: "user";
  readonly registeredEmailConfigured: true;
  readonly apiKeyConfigured: true;
  readonly termsAccepted: true;
  readonly termsAcceptedAt: string;
}

export interface UsaJobsSearchConfigurationV1 {
  readonly specVersion: 1;
  readonly connectorId: typeof USAJOBS_SEARCH_CONNECTOR_ID;
  readonly registrationOwner: "user";
  readonly credentialMode: "user_configured";
  readonly termsAccepted: true;
  readonly termsAcceptedAt: string;
  readonly requiredHeaderBindings: Readonly<{
    Host: Readonly<{ binding: "destination_host" }>;
    "User-Agent": Readonly<{ binding: "registered_email" }>;
    "Authorization-Key": Readonly<{ binding: "api_key" }>;
  }>;
  readonly publicJobsOnly: true;
  readonly executionBoundary: "privileged_connector_only";
}

export interface UsaJobsPublicSearchQueryV1 {
  readonly specVersion: 1;
  readonly keyword: string | null;
  readonly positionTitle: string | null;
  readonly locations: readonly string[];
  readonly jobCategoryCodes: readonly string[];
  readonly remoteIndicator: boolean | null;
  readonly datePosted: number | null;
  readonly page: number;
  readonly resultsPerPage: number;
}

export interface UsaJobsSearchRequestV1 {
  readonly specVersion: 1;
  readonly connectorId: typeof USAJOBS_SEARCH_CONNECTOR_ID;
  readonly policyMethod: typeof USAJOBS_SEARCH_POLICY_METHOD;
  readonly httpMethod: "GET";
  readonly destinationUrl: string;
  readonly credentials: "user_configured";
  readonly headers: Readonly<{ accept: "application/json" }>;
  readonly requiredHeaderBindings: UsaJobsSearchConfigurationV1["requiredHeaderBindings"];
  readonly publicJobsOnly: true;
  readonly executionBoundary: "privileged_connector_only";
}

/** Content-free failure for invalid USAJOBS configuration or search input. */
export class UsaJobsSearchError extends Error {
  public constructor(public readonly code: UsaJobsSearchErrorCode) {
    super("USAJOBS search descriptor rejected invalid input.");
    this.name = "UsaJobsSearchError";
  }
}

const REVIEWED_AT = "2026-08-30T00:00:00.000Z";
const REVIEW_DUE_AT = "2026-09-29T00:00:00.000Z";

export const USAJOBS_SEARCH_POLICY_INPUT_V1: ConnectorPolicyRecordV1 = Object.freeze({
  specVersion: 1,
  id: USAJOBS_SEARCH_CONNECTOR_ID,
  owner: "Coredrill maintainers",
  status: "enabled",
  allowedMethods: Object.freeze([USAJOBS_SEARCH_POLICY_METHOD]),
  baseDomains: Object.freeze([USAJOBS_SEARCH_API_HOST]),
  termsUrl: "https://developer.usajobs.gov/apirequest/index",
  privacyUrl: "https://developer.usajobs.gov/guides/terms-of-use",
  licenseOrReuseBasis:
    "USAJOBS permits the registered requesting individual to store and reformat public JOA API data for internal application use when displayed values remain unchanged, USAJOBS is credited, and users are directed to USAJOBS. Standalone redistribution and competing job-data products are excluded.",
  reviewedAt: REVIEWED_AT,
  reviewDueAt: REVIEW_DUE_AT,
  ratePolicy:
    "The public Search API documents at most 10,000 rows per query and 500 rows per page but no request-per-time allowance. Coredrill further caps descriptors at 100 rows and 100 pages. Before transport ships, require an explicit user action, one request in flight, a 24-hour unchanged-query cache, Retry-After handling, and fail-closed backoff because USAJOBS may impose limits at any time.",
  retention:
    "Retain only user-selected public JOA snapshots and derived evidence in the registered user's local vault until deletion. Do not retain registered email or API-key values with source content, map public contact data, redistribute a feed, or access Status/internal announcements.",
  attribution: "required",
  credentials: "user_configured",
  userVisibleDataFlow:
    "After explicit user configuration and a targeted search action, bind the user's registered email and API key only at a privileged connector boundary, retrieve Public announcements from data.usajobs.gov, parse selected results locally, credit USAJOBS, and direct the user to USAJOBS to view or apply.",
  killSwitch: true,
});

const CONFIGURATION_INPUT_KEYS = Object.freeze([
  "specVersion",
  "registrationOwner",
  "registeredEmailConfigured",
  "apiKeyConfigured",
  "termsAccepted",
  "termsAcceptedAt",
]);
const CONFIGURATION_KEYS = Object.freeze([
  "specVersion",
  "connectorId",
  "registrationOwner",
  "credentialMode",
  "termsAccepted",
  "termsAcceptedAt",
  "requiredHeaderBindings",
  "publicJobsOnly",
  "executionBoundary",
]);
const QUERY_KEYS = Object.freeze([
  "specVersion",
  "keyword",
  "positionTitle",
  "locations",
  "jobCategoryCodes",
  "remoteIndicator",
  "datePosted",
  "page",
  "resultsPerPage",
]);
const HEADER_BINDING_KEYS = Object.freeze(["Host", "User-Agent", "Authorization-Key"]);
const HEADER_BINDINGS = deepFreeze({
  Host: { binding: "destination_host" as const },
  "User-Agent": { binding: "registered_email" as const },
  "Authorization-Key": { binding: "api_key" as const },
});
const JOB_CATEGORY_CODE = /^[0-9]{4}$/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function parseOptionalText(value: unknown, maximum: number): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    hasControlCharacter(value)
  ) {
    throw new UsaJobsSearchError("query_invalid");
  }
  return value;
}

function parseUniqueStrings(
  value: unknown,
  maximum: number,
  parse: (entry: unknown) => string,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new UsaJobsSearchError("query_invalid");
  }
  const parsed = value.map(parse);
  if (new Set(parsed).size !== parsed.length) {
    throw new UsaJobsSearchError("query_invalid");
  }
  return Object.freeze(parsed);
}

function parseLocation(value: unknown): string {
  const parsed = parseOptionalText(value, USAJOBS_SEARCH_LIMITS.maxLocationLength);
  if (parsed === null || parsed.includes(";")) throw new UsaJobsSearchError("query_invalid");
  return parsed;
}

function parseJobCategoryCode(value: unknown): string {
  if (typeof value !== "string" || !JOB_CATEGORY_CODE.test(value)) {
    throw new UsaJobsSearchError("query_invalid");
  }
  return value;
}

function parseBoundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new UsaJobsSearchError("query_invalid");
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function configurationIsValid(input: unknown): input is UsaJobsSearchConfigurationV1 {
  if (!isPlainRecord(input) || !hasExactKeys(input, CONFIGURATION_KEYS)) return false;
  const bindings = input["requiredHeaderBindings"];
  return (
    input["specVersion"] === USAJOBS_SEARCH_SPEC_VERSION &&
    input["connectorId"] === USAJOBS_SEARCH_CONNECTOR_ID &&
    input["registrationOwner"] === "user" &&
    input["credentialMode"] === "user_configured" &&
    input["termsAccepted"] === true &&
    isCanonicalInstant(input["termsAcceptedAt"]) &&
    input["termsAcceptedAt"] >= REVIEWED_AT &&
    input["termsAcceptedAt"] < REVIEW_DUE_AT &&
    input["publicJobsOnly"] === true &&
    input["executionBoundary"] === "privileged_connector_only" &&
    isPlainRecord(bindings) &&
    hasExactKeys(bindings, HEADER_BINDING_KEYS) &&
    isPlainRecord(bindings["Host"]) &&
    hasExactKeys(bindings["Host"], ["binding"]) &&
    bindings["Host"]["binding"] === "destination_host" &&
    isPlainRecord(bindings["User-Agent"]) &&
    hasExactKeys(bindings["User-Agent"], ["binding"]) &&
    bindings["User-Agent"]["binding"] === "registered_email" &&
    isPlainRecord(bindings["Authorization-Key"]) &&
    hasExactKeys(bindings["Authorization-Key"], ["binding"]) &&
    bindings["Authorization-Key"]["binding"] === "api_key"
  );
}

/** Records readiness without accepting, returning, or logging the email or API-key values. */
export function createUsaJobsSearchConfigurationV1(
  input: UsaJobsSearchConfigurationAttestationV1,
): UsaJobsSearchConfigurationV1 {
  const untrusted = input as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, CONFIGURATION_INPUT_KEYS) ||
    untrusted["specVersion"] !== USAJOBS_SEARCH_SPEC_VERSION ||
    untrusted["registrationOwner"] !== "user" ||
    untrusted["registeredEmailConfigured"] !== true ||
    untrusted["apiKeyConfigured"] !== true ||
    untrusted["termsAccepted"] !== true ||
    !isCanonicalInstant(untrusted["termsAcceptedAt"]) ||
    untrusted["termsAcceptedAt"] < REVIEWED_AT ||
    untrusted["termsAcceptedAt"] >= REVIEW_DUE_AT
  ) {
    throw new UsaJobsSearchError("configuration_invalid");
  }

  return deepFreeze({
    specVersion: USAJOBS_SEARCH_SPEC_VERSION,
    connectorId: USAJOBS_SEARCH_CONNECTOR_ID,
    registrationOwner: "user" as const,
    credentialMode: "user_configured" as const,
    termsAccepted: true as const,
    termsAcceptedAt: untrusted["termsAcceptedAt"],
    requiredHeaderBindings: HEADER_BINDINGS,
    publicJobsOnly: true as const,
    executionBoundary: "privileged_connector_only" as const,
  });
}

/** Builds a bounded non-executing descriptor for a targeted Public-only USAJOBS search. */
export function createUsaJobsSearchRequestV1(
  configuration: UsaJobsSearchConfigurationV1,
  query: UsaJobsPublicSearchQueryV1,
): UsaJobsSearchRequestV1 {
  if (!configurationIsValid(configuration)) {
    throw new UsaJobsSearchError("configuration_invalid");
  }
  const untrusted = query as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, QUERY_KEYS) ||
    untrusted["specVersion"] !== USAJOBS_SEARCH_SPEC_VERSION ||
    (untrusted["remoteIndicator"] !== null && typeof untrusted["remoteIndicator"] !== "boolean") ||
    (untrusted["datePosted"] !== null && typeof untrusted["datePosted"] !== "number")
  ) {
    throw new UsaJobsSearchError("query_invalid");
  }

  const keyword = parseOptionalText(untrusted["keyword"], USAJOBS_SEARCH_LIMITS.maxKeywordLength);
  const positionTitle = parseOptionalText(
    untrusted["positionTitle"],
    USAJOBS_SEARCH_LIMITS.maxPositionTitleLength,
  );
  const locations = parseUniqueStrings(
    untrusted["locations"],
    USAJOBS_SEARCH_LIMITS.maxLocations,
    parseLocation,
  );
  const jobCategoryCodes = parseUniqueStrings(
    untrusted["jobCategoryCodes"],
    USAJOBS_SEARCH_LIMITS.maxJobCategoryCodes,
    parseJobCategoryCode,
  );
  const datePosted =
    untrusted["datePosted"] === null
      ? null
      : parseBoundedInteger(untrusted["datePosted"], 0, USAJOBS_SEARCH_LIMITS.maxDatePostedDays);
  const page = parseBoundedInteger(untrusted["page"], 1, USAJOBS_SEARCH_LIMITS.maxPage);
  const resultsPerPage = parseBoundedInteger(
    untrusted["resultsPerPage"],
    1,
    USAJOBS_SEARCH_LIMITS.maxResultsPerPage,
  );

  if (
    keyword === null &&
    positionTitle === null &&
    locations.length === 0 &&
    jobCategoryCodes.length === 0
  ) {
    throw new UsaJobsSearchError("query_too_broad");
  }

  const parameters = new URLSearchParams();
  if (keyword !== null) parameters.set("Keyword", keyword);
  if (positionTitle !== null) parameters.set("PositionTitle", positionTitle);
  if (locations.length > 0) parameters.set("LocationName", locations.join(";"));
  if (jobCategoryCodes.length > 0) {
    parameters.set("JobCategoryCode", jobCategoryCodes.join(";"));
  }
  if (untrusted["remoteIndicator"] !== null) {
    parameters.set("RemoteIndicator", untrusted["remoteIndicator"] ? "True" : "False");
  }
  if (datePosted !== null) parameters.set("DatePosted", String(datePosted));
  parameters.set("Page", String(page));
  parameters.set("ResultsPerPage", String(resultsPerPage));
  parameters.set("WhoMayApply", "Public");
  parameters.set("Fields", "Full");

  return deepFreeze({
    specVersion: USAJOBS_SEARCH_SPEC_VERSION,
    connectorId: USAJOBS_SEARCH_CONNECTOR_ID,
    policyMethod: USAJOBS_SEARCH_POLICY_METHOD,
    httpMethod: "GET" as const,
    destinationUrl: `${USAJOBS_SEARCH_API_ENDPOINT}?${parameters.toString()}`,
    credentials: "user_configured" as const,
    headers: { accept: "application/json" as const },
    requiredHeaderBindings: configuration.requiredHeaderBindings,
    publicJobsOnly: true as const,
    executionBoundary: "privileged_connector_only" as const,
  });
}
