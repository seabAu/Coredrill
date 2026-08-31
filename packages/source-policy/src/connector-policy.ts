import { GREENHOUSE_JOB_BOARD_POLICY_INPUT_V1 } from "./greenhouse-job-board.js";
import { LEVER_POSTINGS_POLICY_INPUT_V1 } from "./lever-postings.js";
import { USAJOBS_SEARCH_POLICY_INPUT_V1 } from "./usajobs-search.js";

export const CONNECTOR_POLICY_SPEC_VERSION = 1 as const;

export const CONNECTOR_NETWORK_METHODS = [
  "documented_public_api",
  "configured_official_api",
] as const;
export type ConnectorNetworkMethod = (typeof CONNECTOR_NETWORK_METHODS)[number];

export const CONNECTOR_POLICY_STATUSES = ["enabled", "disabled"] as const;
export type ConnectorPolicyStatus = (typeof CONNECTOR_POLICY_STATUSES)[number];

export const CONNECTOR_CREDENTIAL_MODES = ["none", "user_configured"] as const;
export type ConnectorCredentialMode = (typeof CONNECTOR_CREDENTIAL_MODES)[number];

export const CONNECTOR_ATTRIBUTION_POLICIES = ["required", "not_required"] as const;
export type ConnectorAttributionPolicy = (typeof CONNECTOR_ATTRIBUTION_POLICIES)[number];

export const CONNECTOR_POLICY_DENIAL_REASONS = [
  "unknown_connector",
  "connector_disabled",
  "runtime_kill_switch",
  "review_not_current",
  "method_not_allowed",
  "destination_not_allowed",
] as const;
export type ConnectorPolicyDenialReason = (typeof CONNECTOR_POLICY_DENIAL_REASONS)[number];

export const CONNECTOR_POLICY_ERROR_CODES = [
  "record_invalid",
  "record_limit_exceeded",
  "duplicate_record_id",
  "request_invalid",
  "runtime_control_invalid",
] as const;
export type ConnectorPolicyErrorCode = (typeof CONNECTOR_POLICY_ERROR_CODES)[number];

export const CONNECTOR_POLICY_LIMITS = Object.freeze({
  maxRecords: 64,
  maxMethodsPerRecord: CONNECTOR_NETWORK_METHODS.length,
  maxDomainsPerRecord: 16,
  maxRuntimeDisabledConnectors: 64,
  maxIdentifierLength: 128,
  maxOwnerLength: 128,
  maxPolicyTextLength: 1_024,
  maxUrlLength: 8_192,
});

export interface ConnectorPolicyRecordV1 {
  readonly specVersion: 1;
  readonly id: string;
  readonly owner: string;
  readonly status: ConnectorPolicyStatus;
  readonly allowedMethods: readonly ConnectorNetworkMethod[];
  /** Exact lowercase HTTPS destination hostnames; no wildcard or subdomain expansion. */
  readonly baseDomains: readonly string[];
  readonly termsUrl: string;
  readonly privacyUrl: string;
  readonly licenseOrReuseBasis: string;
  readonly reviewedAt: string;
  readonly reviewDueAt: string;
  readonly ratePolicy: string;
  readonly retention: string;
  readonly attribution: ConnectorAttributionPolicy;
  readonly credentials: ConnectorCredentialMode;
  readonly userVisibleDataFlow: string;
  readonly killSwitch: true;
}

export interface ConnectorRuntimeControlV1 {
  readonly disableAllNetworkConnectors: boolean;
  readonly disabledConnectorIds: readonly string[];
}

export type SourceAcquisitionRequestV1 =
  | { readonly kind: "manual_capture" }
  | {
      readonly kind: "network_connector";
      readonly connectorId: string;
      readonly method: string;
      readonly destinationUrl: string;
      readonly now: string;
    };

export type ConnectorPolicyDecisionV1 =
  | {
      readonly allowed: true;
      readonly reason: "manual_capture";
      readonly connectorId: null;
    }
  | {
      readonly allowed: true;
      readonly reason: "connector_allowed";
      readonly connectorId: string;
    }
  | {
      readonly allowed: false;
      readonly reason: ConnectorPolicyDenialReason;
      readonly connectorId: string;
    };

export interface ConnectorPolicyRegistryV1 {
  readonly records: readonly ConnectorPolicyRecordV1[];
  readonly authorize: (
    request: SourceAcquisitionRequestV1,
    runtimeControl?: ConnectorRuntimeControlV1,
  ) => ConnectorPolicyDecisionV1;
}

/** Content-free failure for malformed policy records or authorization inputs. */
export class ConnectorPolicyError extends Error {
  public constructor(public readonly code: ConnectorPolicyErrorCode) {
    super("Connector policy rejected invalid input.");
    this.name = "ConnectorPolicyError";
  }
}

const SAFE_IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u;
const POLICY_RECORD_KEYS = Object.freeze([
  "specVersion",
  "id",
  "owner",
  "status",
  "allowedMethods",
  "baseDomains",
  "termsUrl",
  "privacyUrl",
  "licenseOrReuseBasis",
  "reviewedAt",
  "reviewDueAt",
  "ratePolicy",
  "retention",
  "attribution",
  "credentials",
  "userVisibleDataFlow",
  "killSwitch",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function requireIdentifier(value: unknown, code: ConnectorPolicyErrorCode): string {
  if (
    typeof value !== "string" ||
    value.length > CONNECTOR_POLICY_LIMITS.maxIdentifierLength ||
    !SAFE_IDENTIFIER.test(value)
  ) {
    throw new ConnectorPolicyError(code);
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function requireText(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    hasControlCharacter(value)
  ) {
    throw new ConnectorPolicyError("record_invalid");
  }
  return value;
}

function requireHttpsPolicyUrl(value: unknown): string {
  const text = requireText(value, CONNECTOR_POLICY_LIMITS.maxUrlLength);
  try {
    const parsed = new URL(text);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      (parsed.port !== "" && parsed.port !== "443")
    ) {
      throw new TypeError("Unsafe policy URL.");
    }
    return text;
  } catch {
    throw new ConnectorPolicyError("record_invalid");
  }
}

function requireInstant(value: unknown): string {
  if (typeof value !== "string") throw new ConnectorPolicyError("record_invalid");
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new ConnectorPolicyError("record_invalid");
  }
  return value;
}

function requireDomain(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    value !== value.toLowerCase() ||
    value.includes("*") ||
    value.endsWith(".")
  ) {
    throw new ConnectorPolicyError("record_invalid");
  }
  const labels = value.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !DOMAIN_LABEL.test(label)) ||
    !/[a-z]/u.test(labels.at(-1) ?? "")
  ) {
    throw new ConnectorPolicyError("record_invalid");
  }
  return value;
}

function requireUniqueArray<T>(
  value: unknown,
  maximum: number,
  parse: (entry: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new ConnectorPolicyError("record_invalid");
  }
  const parsed = value.map(parse);
  if (new Set(parsed).size !== parsed.length) {
    throw new ConnectorPolicyError("record_invalid");
  }
  return Object.freeze(parsed);
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ConnectorPolicyError("record_invalid");
  }
  return value as T;
}

export function parseConnectorPolicyRecordV1(input: unknown): ConnectorPolicyRecordV1 {
  if (!isRecord(input) || !hasExactKeys(input, POLICY_RECORD_KEYS)) {
    throw new ConnectorPolicyError("record_invalid");
  }
  if (input["specVersion"] !== CONNECTOR_POLICY_SPEC_VERSION || input["killSwitch"] !== true) {
    throw new ConnectorPolicyError("record_invalid");
  }
  const reviewedAt = requireInstant(input["reviewedAt"]);
  const reviewDueAt = requireInstant(input["reviewDueAt"]);
  if (reviewDueAt <= reviewedAt) throw new ConnectorPolicyError("record_invalid");

  return Object.freeze({
    specVersion: CONNECTOR_POLICY_SPEC_VERSION,
    id: requireIdentifier(input["id"], "record_invalid"),
    owner: requireText(input["owner"], CONNECTOR_POLICY_LIMITS.maxOwnerLength),
    status: requireEnum(input["status"], CONNECTOR_POLICY_STATUSES),
    allowedMethods: requireUniqueArray(
      input["allowedMethods"],
      CONNECTOR_POLICY_LIMITS.maxMethodsPerRecord,
      (method) => requireEnum(method, CONNECTOR_NETWORK_METHODS),
    ),
    baseDomains: requireUniqueArray(
      input["baseDomains"],
      CONNECTOR_POLICY_LIMITS.maxDomainsPerRecord,
      requireDomain,
    ),
    termsUrl: requireHttpsPolicyUrl(input["termsUrl"]),
    privacyUrl: requireHttpsPolicyUrl(input["privacyUrl"]),
    licenseOrReuseBasis: requireText(
      input["licenseOrReuseBasis"],
      CONNECTOR_POLICY_LIMITS.maxPolicyTextLength,
    ),
    reviewedAt,
    reviewDueAt,
    ratePolicy: requireText(input["ratePolicy"], CONNECTOR_POLICY_LIMITS.maxPolicyTextLength),
    retention: requireText(input["retention"], CONNECTOR_POLICY_LIMITS.maxPolicyTextLength),
    attribution: requireEnum(input["attribution"], CONNECTOR_ATTRIBUTION_POLICIES),
    credentials: requireEnum(input["credentials"], CONNECTOR_CREDENTIAL_MODES),
    userVisibleDataFlow: requireText(
      input["userVisibleDataFlow"],
      CONNECTOR_POLICY_LIMITS.maxPolicyTextLength,
    ),
    killSwitch: true,
  });
}

function parseRuntimeControl(input: ConnectorRuntimeControlV1 | undefined): {
  readonly disableAllNetworkConnectors: boolean;
  readonly disabledConnectorIds: ReadonlySet<string>;
} {
  const untrusted = input as unknown;
  if (
    !isRecord(untrusted) ||
    !hasExactKeys(untrusted, ["disableAllNetworkConnectors", "disabledConnectorIds"]) ||
    typeof untrusted["disableAllNetworkConnectors"] !== "boolean" ||
    !Array.isArray(untrusted["disabledConnectorIds"]) ||
    untrusted["disabledConnectorIds"].length > CONNECTOR_POLICY_LIMITS.maxRuntimeDisabledConnectors
  ) {
    throw new ConnectorPolicyError("runtime_control_invalid");
  }
  let disabled: string[];
  try {
    disabled = untrusted["disabledConnectorIds"].map((id) =>
      requireIdentifier(id, "runtime_control_invalid"),
    );
  } catch (error) {
    if (error instanceof ConnectorPolicyError) {
      throw new ConnectorPolicyError("runtime_control_invalid");
    }
    throw error;
  }
  if (new Set(disabled).size !== disabled.length) {
    throw new ConnectorPolicyError("runtime_control_invalid");
  }
  return Object.freeze({
    disableAllNetworkConnectors: untrusted["disableAllNetworkConnectors"],
    disabledConnectorIds: new Set(disabled),
  });
}

function parseRequest(input: SourceAcquisitionRequestV1): SourceAcquisitionRequestV1 {
  const untrusted = input as unknown;
  if (!isRecord(untrusted) || typeof untrusted["kind"] !== "string") {
    throw new ConnectorPolicyError("request_invalid");
  }
  if (untrusted["kind"] === "manual_capture") {
    if (!hasExactKeys(untrusted, ["kind"])) {
      throw new ConnectorPolicyError("request_invalid");
    }
    return Object.freeze({ kind: "manual_capture" });
  }
  if (
    untrusted["kind"] !== "network_connector" ||
    !hasExactKeys(untrusted, ["kind", "connectorId", "method", "destinationUrl", "now"]) ||
    typeof untrusted["method"] !== "string" ||
    untrusted["method"].length === 0 ||
    untrusted["method"].length > CONNECTOR_POLICY_LIMITS.maxIdentifierLength ||
    typeof untrusted["destinationUrl"] !== "string" ||
    untrusted["destinationUrl"].length === 0 ||
    untrusted["destinationUrl"].length > CONNECTOR_POLICY_LIMITS.maxUrlLength
  ) {
    throw new ConnectorPolicyError("request_invalid");
  }
  let now: string;
  try {
    now = requireInstant(untrusted["now"]);
  } catch {
    throw new ConnectorPolicyError("request_invalid");
  }
  return Object.freeze({
    kind: "network_connector",
    connectorId: requireIdentifier(untrusted["connectorId"], "request_invalid"),
    method: untrusted["method"],
    destinationUrl: untrusted["destinationUrl"],
    now,
  });
}

function destinationAllowed(destinationUrl: string, exactDomains: readonly string[]): boolean {
  try {
    const parsed = new URL(destinationUrl);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      (parsed.port === "" || parsed.port === "443") &&
      exactDomains.includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function allowedDecision(
  reason: "manual_capture" | "connector_allowed",
  connectorId: string | null,
): ConnectorPolicyDecisionV1 {
  return Object.freeze({ allowed: true, reason, connectorId }) as ConnectorPolicyDecisionV1;
}

function deniedDecision(
  reason: ConnectorPolicyDenialReason,
  connectorId: string,
): ConnectorPolicyDecisionV1 {
  return Object.freeze({ allowed: false, reason, connectorId });
}

export function createConnectorPolicyRegistryV1(
  recordInputs: readonly unknown[],
): ConnectorPolicyRegistryV1 {
  if (!Array.isArray(recordInputs)) throw new ConnectorPolicyError("record_invalid");
  if (recordInputs.length > CONNECTOR_POLICY_LIMITS.maxRecords) {
    throw new ConnectorPolicyError("record_limit_exceeded");
  }
  const records = recordInputs
    .map(parseConnectorPolicyRecordV1)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  if (new Set(records.map(({ id }) => id)).size !== records.length) {
    throw new ConnectorPolicyError("duplicate_record_id");
  }
  const recordsById = new Map(records.map((record) => [record.id, record] as const));

  return Object.freeze({
    records: Object.freeze(records),
    authorize: (
      requestInput: SourceAcquisitionRequestV1,
      runtimeControlInput?: ConnectorRuntimeControlV1,
    ): ConnectorPolicyDecisionV1 => {
      const request = parseRequest(requestInput);
      if (request.kind === "manual_capture") {
        return allowedDecision("manual_capture", null);
      }
      const runtimeControl = parseRuntimeControl(runtimeControlInput);

      const record = recordsById.get(request.connectorId);
      if (record === undefined) return deniedDecision("unknown_connector", request.connectorId);
      if (record.status !== "enabled") {
        return deniedDecision("connector_disabled", request.connectorId);
      }
      if (
        runtimeControl.disableAllNetworkConnectors ||
        runtimeControl.disabledConnectorIds.has(request.connectorId)
      ) {
        return deniedDecision("runtime_kill_switch", request.connectorId);
      }
      if (request.now < record.reviewedAt || request.now >= record.reviewDueAt) {
        return deniedDecision("review_not_current", request.connectorId);
      }
      if (!record.allowedMethods.includes(request.method as ConnectorNetworkMethod)) {
        return deniedDecision("method_not_allowed", request.connectorId);
      }
      if (!destinationAllowed(request.destinationUrl, record.baseDomains)) {
        return deniedDecision("destination_not_allowed", request.connectorId);
      }
      return allowedDecision("connector_allowed", request.connectorId);
    },
  });
}

export const GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1 = parseConnectorPolicyRecordV1(
  GREENHOUSE_JOB_BOARD_POLICY_INPUT_V1,
);

export const LEVER_POSTINGS_CONNECTOR_POLICY_V1 = parseConnectorPolicyRecordV1(
  LEVER_POSTINGS_POLICY_INPUT_V1,
);

export const USAJOBS_SEARCH_CONNECTOR_POLICY_V1 = parseConnectorPolicyRecordV1(
  USAJOBS_SEARCH_POLICY_INPUT_V1,
);

/** Only connectors with a current source-specific review are registered here. */
export const CHECKED_IN_CONNECTOR_POLICY_RECORDS_V1: readonly ConnectorPolicyRecordV1[] =
  Object.freeze([
    GREENHOUSE_JOB_BOARD_CONNECTOR_POLICY_V1,
    LEVER_POSTINGS_CONNECTOR_POLICY_V1,
    USAJOBS_SEARCH_CONNECTOR_POLICY_V1,
  ]);

export const checkedInConnectorPolicyRegistryV1 = createConnectorPolicyRegistryV1(
  CHECKED_IN_CONNECTOR_POLICY_RECORDS_V1,
);
