import type { ConnectorPolicyRecordV1 } from "./connector-policy.js";

export const LEVER_POSTINGS_CONNECTOR_ID = "lever-postings" as const;
export const LEVER_POSTINGS_POLICY_METHOD = "documented_public_api" as const;
export const LEVER_POSTINGS_SPEC_VERSION = 1 as const;
export const LEVER_POSTINGS_REGIONS = ["global", "eu"] as const;
export type LeverPostingsRegion = (typeof LEVER_POSTINGS_REGIONS)[number];

export const LEVER_POSTINGS_API_HOSTS = Object.freeze({
  global: "api.lever.co",
  eu: "api.eu.lever.co",
});

export const LEVER_POSTINGS_LIMITS = Object.freeze({
  maxSourceUrlLength: 8_192,
  maxSiteLength: 128,
});

export const LEVER_POSTINGS_REQUEST_ERROR_CODES = ["reference_invalid"] as const;
export type LeverPostingsRequestErrorCode = (typeof LEVER_POSTINGS_REQUEST_ERROR_CODES)[number];

export interface LeverPostingReferenceV1 {
  readonly specVersion: 1;
  readonly region: LeverPostingsRegion;
  readonly site: string;
  readonly postingId: string;
}

export interface LeverPostingRequestV1 {
  readonly specVersion: 1;
  readonly connectorId: typeof LEVER_POSTINGS_CONNECTOR_ID;
  readonly policyMethod: typeof LEVER_POSTINGS_POLICY_METHOD;
  readonly httpMethod: "GET";
  readonly destinationUrl: string;
  readonly credentials: "omit";
  readonly headers: Readonly<{ accept: "application/json" }>;
}

/** Content-free failure for invalid Lever posting references. */
export class LeverPostingsRequestError extends Error {
  public constructor(public readonly code: LeverPostingsRequestErrorCode) {
    super("Lever Postings request rejected invalid input.");
    this.name = "LeverPostingsRequestError";
  }
}

export const LEVER_POSTINGS_POLICY_INPUT_V1: ConnectorPolicyRecordV1 = Object.freeze({
  specVersion: 1,
  id: LEVER_POSTINGS_CONNECTOR_ID,
  owner: "Coredrill maintainers",
  status: "enabled",
  allowedMethods: Object.freeze([LEVER_POSTINGS_POLICY_METHOD]),
  baseDomains: Object.freeze([LEVER_POSTINGS_API_HOSTS.global, LEVER_POSTINGS_API_HOSTS.eu]),
  termsUrl: "https://www.lever.co/legal",
  privacyUrl: "https://www.employinc.com/privacy/",
  licenseOrReuseBasis:
    "Lever documents its Postings API as a public-job-site interface and explicitly states that published postings are publicly viewable and may be scraped by third parties. Coredrill excludes authenticated Hire APIs and application submission.",
  reviewedAt: "2026-08-30T00:00:00.000Z",
  reviewDueAt: "2026-09-29T00:00:00.000Z",
  ratePolicy:
    "No public-posting GET rate limit was published at review. Before any executing client ships, limit each site to one user-initiated GET per second with one request in flight, a 24-hour unchanged-detail cache, Retry-After handling, and fail-closed backoff.",
  retention:
    "Retain only the user-selected published posting snapshot and derived evidence in the local vault until the user deletes that record. Never submit or retain applicant, application, consent, or candidate data through this connector.",
  attribution: "required",
  credentials: "none",
  userVisibleDataFlow:
    "After an explicit user action, retrieve one published posting from Lever's exact global or EU Postings API host, parse it locally into provisional evidence, and retain it only in the user's local vault.",
  killSwitch: true,
});

const SITE = /^[a-z0-9][a-z0-9_-]{0,127}$/u;
const POSTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const POSTING_PATH =
  /^\/([a-z0-9][a-z0-9_-]{0,127})\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\/?$/u;
const REFERENCE_KEYS = Object.freeze(["specVersion", "region", "site", "postingId"]);

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

function isRegion(value: unknown): value is LeverPostingsRegion {
  return typeof value === "string" && LEVER_POSTINGS_REGIONS.includes(value as LeverPostingsRegion);
}

function hostedRegion(hostname: string): LeverPostingsRegion | null {
  if (hostname === "jobs.lever.co") return "global";
  if (hostname === "jobs.eu.lever.co") return "eu";
  return null;
}

/** Recognizes only exact global/EU Lever-hosted public job-detail URLs. */
export function recognizeLeverHostedPostingUrlV1(
  sourceUrl: unknown,
): LeverPostingReferenceV1 | null {
  if (
    typeof sourceUrl !== "string" ||
    sourceUrl.length === 0 ||
    sourceUrl.length > LEVER_POSTINGS_LIMITS.maxSourceUrlLength ||
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
  const region = hostedRegion(parsed.hostname.toLowerCase());
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    (parsed.port !== "" && parsed.port !== "443") ||
    region === null ||
    parsed.searchParams.has("key")
  ) {
    return null;
  }

  const match = POSTING_PATH.exec(parsed.pathname);
  if (match === null) return null;
  const site = match[1] ?? "";
  const postingId = (match[2] ?? "").toLowerCase();
  if (!SITE.test(site) || !POSTING_ID.test(postingId)) return null;
  return Object.freeze({ specVersion: LEVER_POSTINGS_SPEC_VERSION, region, site, postingId });
}

/** Builds a non-executing, exact-host GET descriptor. Policy authorization is still required. */
export function createLeverPostingRequestV1(input: LeverPostingReferenceV1): LeverPostingRequestV1 {
  const untrusted = input as unknown;
  if (
    !isPlainRecord(untrusted) ||
    !hasExactKeys(untrusted, REFERENCE_KEYS) ||
    untrusted["specVersion"] !== LEVER_POSTINGS_SPEC_VERSION ||
    !isRegion(untrusted["region"]) ||
    typeof untrusted["site"] !== "string" ||
    !SITE.test(untrusted["site"]) ||
    typeof untrusted["postingId"] !== "string" ||
    !POSTING_ID.test(untrusted["postingId"])
  ) {
    throw new LeverPostingsRequestError("reference_invalid");
  }

  const destinationUrl = `https://${LEVER_POSTINGS_API_HOSTS[untrusted["region"]]}/v0/postings/${untrusted["site"]}/${untrusted["postingId"]}`;
  return Object.freeze({
    specVersion: LEVER_POSTINGS_SPEC_VERSION,
    connectorId: LEVER_POSTINGS_CONNECTOR_ID,
    policyMethod: LEVER_POSTINGS_POLICY_METHOD,
    httpMethod: "GET",
    destinationUrl,
    credentials: "omit",
    headers: Object.freeze({ accept: "application/json" as const }),
  });
}
