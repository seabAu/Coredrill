import type { ConnectorPolicyRecordV1 } from "./connector-policy.js";

export const GREENHOUSE_JOB_BOARD_CONNECTOR_ID = "greenhouse-job-board" as const;
export const GREENHOUSE_JOB_BOARD_API_HOST = "boards-api.greenhouse.io" as const;
export const GREENHOUSE_JOB_BOARD_POLICY_METHOD = "documented_public_api" as const;
export const GREENHOUSE_JOB_BOARD_SPEC_VERSION = 1 as const;

export const GREENHOUSE_JOB_BOARD_LIMITS = Object.freeze({
  maxSourceUrlLength: 8_192,
  maxBoardTokenLength: 128,
  maxJobIdDigits: 16,
});

export const GREENHOUSE_JOB_BOARD_REQUEST_ERROR_CODES = ["reference_invalid"] as const;
export type GreenhouseJobBoardRequestErrorCode =
  (typeof GREENHOUSE_JOB_BOARD_REQUEST_ERROR_CODES)[number];

export interface GreenhouseJobReferenceV1 {
  readonly specVersion: 1;
  readonly boardToken: string;
  readonly jobId: number;
}

export interface GreenhouseJobBoardRequestV1 {
  readonly specVersion: 1;
  readonly connectorId: typeof GREENHOUSE_JOB_BOARD_CONNECTOR_ID;
  readonly policyMethod: typeof GREENHOUSE_JOB_BOARD_POLICY_METHOD;
  readonly httpMethod: "GET";
  readonly destinationUrl: string;
  readonly credentials: "omit";
  readonly headers: Readonly<{ accept: "application/json" }>;
}

/** Content-free failure for invalid Greenhouse request references. */
export class GreenhouseJobBoardRequestError extends Error {
  public constructor(public readonly code: GreenhouseJobBoardRequestErrorCode) {
    super("Greenhouse Job Board request rejected invalid input.");
    this.name = "GreenhouseJobBoardRequestError";
  }
}

export const GREENHOUSE_JOB_BOARD_POLICY_INPUT_V1: ConnectorPolicyRecordV1 = Object.freeze({
  specVersion: 1,
  id: GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
  owner: "Coredrill maintainers",
  status: "enabled",
  allowedMethods: Object.freeze([GREENHOUSE_JOB_BOARD_POLICY_METHOD]),
  baseDomains: Object.freeze([GREENHOUSE_JOB_BOARD_API_HOST]),
  termsUrl: "https://www.greenhouse.com/legal",
  privacyUrl: "https://www.greenhouse.com/privacy-policy",
  licenseOrReuseBasis:
    "Greenhouse documents Job Board data as publicly available without authentication for GET endpoints. Coredrill limits use to published job-post evidence and excludes application submission and applicant data.",
  reviewedAt: "2026-08-30T00:00:00.000Z",
  reviewDueAt: "2026-09-29T00:00:00.000Z",
  ratePolicy:
    "No Job Board rate limit was published at review. Before any executing client ships, limit each board to one user-initiated GET per second with one request in flight, a 24-hour unchanged-detail cache, Retry-After handling, and fail-closed backoff.",
  retention:
    "Retain only the user-selected posting snapshot and derived evidence in the local vault until the user deletes that record. Never retain application questions, demographic/compliance fields, or candidate data.",
  attribution: "required",
  credentials: "none",
  userVisibleDataFlow:
    "After an explicit user action, retrieve one published posting from boards-api.greenhouse.io, parse it locally into provisional evidence, and retain it only in the user's local vault.",
  killSwitch: true,
});

const HOSTED_JOB_BOARD_DOMAINS = Object.freeze([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
]);
const BOARD_TOKEN = /^[A-Za-z0-9_-]{1,128}$/u;
const JOB_ID = /^[1-9][0-9]{0,15}$/u;
const JOB_PATH = /^\/([A-Za-z0-9_-]{1,128})\/jobs\/([1-9][0-9]{0,15})\/?$/u;
const BOARD_PATH = /^\/([A-Za-z0-9_-]{1,128})\/?$/u;
const REFERENCE_KEYS = Object.freeze(["specVersion", "boardToken", "jobId"]);

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

function parseJobId(value: string): number | null {
  if (!JOB_ID.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function createReference(boardToken: string, jobIdText: string): GreenhouseJobReferenceV1 | null {
  if (!BOARD_TOKEN.test(boardToken)) return null;
  const jobId = parseJobId(jobIdText);
  if (jobId === null) return null;
  return Object.freeze({ specVersion: GREENHOUSE_JOB_BOARD_SPEC_VERSION, boardToken, jobId });
}

/** Recognizes only official Greenhouse-hosted job URLs that expose both board token and job ID. */
export function recognizeGreenhouseJobPostUrlV1(
  sourceUrl: unknown,
): GreenhouseJobReferenceV1 | null {
  if (
    typeof sourceUrl !== "string" ||
    sourceUrl.length === 0 ||
    sourceUrl.length > GREENHOUSE_JOB_BOARD_LIMITS.maxSourceUrlLength ||
    sourceUrl.trim() !== sourceUrl
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    (parsed.port !== "" && parsed.port !== "443") ||
    !HOSTED_JOB_BOARD_DOMAINS.includes(parsed.hostname.toLowerCase())
  ) {
    return null;
  }

  const pathMatch = JOB_PATH.exec(parsed.pathname);
  if (pathMatch !== null) {
    const reference = createReference(pathMatch[1] ?? "", pathMatch[2] ?? "");
    if (reference === null) return null;
    const queryIds = parsed.searchParams.getAll("gh_jid");
    if (queryIds.length > 1 || (queryIds.length === 1 && queryIds[0] !== String(reference.jobId))) {
      return null;
    }
    return reference;
  }

  const boardMatch = BOARD_PATH.exec(parsed.pathname);
  const queryIds = parsed.searchParams.getAll("gh_jid");
  if (boardMatch === null || queryIds.length !== 1) return null;
  return createReference(boardMatch[1] ?? "", queryIds[0] ?? "");
}

/** Builds a non-executing, GET-only descriptor. The connector layer must still authorize it. */
export function createGreenhouseJobBoardRequestV1(
  input: GreenhouseJobReferenceV1,
): GreenhouseJobBoardRequestV1 {
  const untrusted = input as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, REFERENCE_KEYS) ||
    untrusted["specVersion"] !== GREENHOUSE_JOB_BOARD_SPEC_VERSION ||
    typeof untrusted["boardToken"] !== "string" ||
    !BOARD_TOKEN.test(untrusted["boardToken"]) ||
    typeof untrusted["jobId"] !== "number" ||
    !Number.isSafeInteger(untrusted["jobId"]) ||
    untrusted["jobId"] <= 0 ||
    !JOB_ID.test(String(untrusted["jobId"]))
  ) {
    throw new GreenhouseJobBoardRequestError("reference_invalid");
  }

  const destinationUrl = `https://${GREENHOUSE_JOB_BOARD_API_HOST}/v1/boards/${untrusted["boardToken"]}/jobs/${String(untrusted["jobId"])}?pay_transparency=true`;
  return Object.freeze({
    specVersion: GREENHOUSE_JOB_BOARD_SPEC_VERSION,
    connectorId: GREENHOUSE_JOB_BOARD_CONNECTOR_ID,
    policyMethod: GREENHOUSE_JOB_BOARD_POLICY_METHOD,
    httpMethod: "GET",
    destinationUrl,
    credentials: "omit",
    headers: Object.freeze({ accept: "application/json" as const }),
  });
}
