export const CAPTURE_SOURCE_STATE_KINDS_V1 = [
  "available",
  "expired",
  "changed",
  "blocked",
  "unsupported",
] as const;

export type CaptureSourceStateKindV1 = (typeof CAPTURE_SOURCE_STATE_KINDS_V1)[number];

export const CAPTURE_SOURCE_POLICY_BLOCK_REASONS_V1 = [
  "connector_disabled",
  "runtime_kill_switch",
  "review_not_current",
] as const;

export type CaptureSourcePolicyBlockReasonV1 =
  (typeof CAPTURE_SOURCE_POLICY_BLOCK_REASONS_V1)[number];

export interface CaptureSourceStateInputV1 {
  readonly specVersion: 1;
  readonly observedAt: string;
  readonly sourceExpiresAt: string | null;
  readonly sourceUrl: string | null;
  readonly captureMethod: "extension" | "paste" | "file" | "connector" | "manual";
  readonly sourceKind: string;
  readonly retainedSectionCount: number;
  readonly retainedCandidateCount: number;
  readonly policy:
    | { readonly status: "allowed" }
    | {
        readonly status: "blocked";
        readonly reason: CaptureSourcePolicyBlockReasonV1;
      };
  readonly storedSourceComparison: "not_checked" | "same" | "changed";
}

export interface CaptureSourceManualFallbackV1 {
  readonly mode: "manual" | "paste";
  readonly label: string;
  readonly instruction: string;
}

export interface CaptureSourceStateV1 {
  readonly specVersion: 1;
  readonly kind: CaptureSourceStateKindV1;
  readonly heading: string;
  readonly explanation: string;
  readonly retainedEvidence: string;
  readonly promotionAllowed: boolean;
  readonly refreshPerformed: false;
  readonly manualFallback: CaptureSourceManualFallbackV1 | null;
}

export class CaptureSourceStateError extends Error {
  public constructor() {
    super("Capture source state rejected invalid input.");
    this.name = "CaptureSourceStateError";
  }
}

const INPUT_KEYS = [
  "specVersion",
  "observedAt",
  "sourceExpiresAt",
  "sourceUrl",
  "captureMethod",
  "sourceKind",
  "retainedSectionCount",
  "retainedCandidateCount",
  "policy",
  "storedSourceComparison",
] as const;
const CAPTURE_METHODS = ["extension", "paste", "file", "connector", "manual"] as const;
const SOURCE_COMPARISONS = ["not_checked", "same", "changed"] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

function invalid(): never {
  throw new CaptureSourceStateError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isExactInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isSafeSourceUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 8_192) return false;
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function isSourceExpiration(value: unknown): value is string | null {
  if (value === null) return true;
  if (isExactInstant(value)) return true;
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(value);
}

function sourceExpired(sourceExpiresAt: string | null, observedAt: string): boolean {
  if (sourceExpiresAt === null) return false;
  if (DATE_ONLY.test(sourceExpiresAt)) return observedAt.slice(0, 10) > sourceExpiresAt;
  return observedAt >= sourceExpiresAt;
}

function parseInput(input: unknown): CaptureSourceStateInputV1 {
  if (!isRecord(input) || !hasExactKeys(input, INPUT_KEYS) || input["specVersion"] !== 1) {
    invalid();
  }
  const policy = input["policy"];
  if (!isRecord(policy) || typeof policy["status"] !== "string") invalid();
  if (policy["status"] === "allowed") {
    if (!hasExactKeys(policy, ["status"])) invalid();
  } else if (policy["status"] === "blocked") {
    if (
      !hasExactKeys(policy, ["status", "reason"]) ||
      !CAPTURE_SOURCE_POLICY_BLOCK_REASONS_V1.includes(
        policy["reason"] as CaptureSourcePolicyBlockReasonV1,
      )
    ) {
      invalid();
    }
  } else {
    invalid();
  }
  if (
    !isExactInstant(input["observedAt"]) ||
    !isSourceExpiration(input["sourceExpiresAt"]) ||
    !isSafeSourceUrl(input["sourceUrl"]) ||
    !CAPTURE_METHODS.includes(input["captureMethod"] as (typeof CAPTURE_METHODS)[number]) ||
    typeof input["sourceKind"] !== "string" ||
    input["sourceKind"].length === 0 ||
    input["sourceKind"].length > 128 ||
    input["sourceKind"].trim() !== input["sourceKind"] ||
    !Number.isInteger(input["retainedSectionCount"]) ||
    (input["retainedSectionCount"] as number) < 0 ||
    (input["retainedSectionCount"] as number) > 8 ||
    !Number.isInteger(input["retainedCandidateCount"]) ||
    (input["retainedCandidateCount"] as number) < 0 ||
    (input["retainedCandidateCount"] as number) > 256 ||
    !SOURCE_COMPARISONS.includes(
      input["storedSourceComparison"] as (typeof SOURCE_COMPARISONS)[number],
    )
  ) {
    invalid();
  }
  return input as unknown as CaptureSourceStateInputV1;
}

function state(
  kind: CaptureSourceStateKindV1,
  heading: string,
  explanation: string,
  promotionAllowed: boolean,
  manualFallback: CaptureSourceManualFallbackV1 | null,
): CaptureSourceStateV1 {
  return Object.freeze({
    specVersion: 1 as const,
    kind,
    heading,
    explanation,
    retainedEvidence:
      "The original capture, field candidates, source paths, and provenance remain in this local review.",
    promotionAllowed,
    refreshPerformed: false as const,
    manualFallback: manualFallback === null ? null : Object.freeze(manualFallback),
  });
}

/**
 * Produces an explainable source-condition projection from explicit local
 * observations. It has no network, persistence, extraction, or mutation
 * capability and never treats a source condition as verified job truth.
 */
export function evaluateCaptureSourceStateV1(
  input: CaptureSourceStateInputV1,
): CaptureSourceStateV1 {
  const parsed = parseInput(input);
  if (parsed.policy.status === "blocked") {
    return state(
      "blocked",
      "Source use is blocked",
      "The current source policy does not permit automated use of this source. The retained capture cannot be promoted.",
      false,
      {
        mode: "manual",
        label: "Enter job manually",
        instruction:
          "Enter only facts you choose to provide and keep the source URL as a note. No page will be fetched.",
      },
    );
  }
  if (sourceExpired(parsed.sourceExpiresAt, parsed.observedAt)) {
    return state(
      "expired",
      "Listing appears expired",
      "The retained listing deadline or validity date has passed. This does not delete the capture or the saved job.",
      true,
      {
        mode: "manual",
        label: "Enter current details manually",
        instruction:
          "Use the retained evidence as context and enter only details you can verify. No page will be refreshed.",
      },
    );
  }
  if (parsed.storedSourceComparison === "changed") {
    return state(
      "changed",
      "Source content changed",
      "This capture matches a stored source identity but has different content. Confirmed fields will not be overwritten.",
      true,
      {
        mode: "paste",
        label: "Paste updated listing",
        instruction:
          "Paste or import the version you want to compare. Coredrill will not fetch the source automatically.",
      },
    );
  }
  if (
    parsed.sourceUrl !== null &&
    parsed.retainedSectionCount === 0 &&
    parsed.retainedCandidateCount === 0
  ) {
    return state(
      "unsupported",
      "Page content is unsupported",
      "No supported listing content or field candidates were retained from this page.",
      true,
      {
        mode: "paste",
        label: "Paste listing text",
        instruction:
          "Paste selected listing text, import a saved file, or switch to manual entry. The URL will not be fetched.",
      },
    );
  }
  return state(
    "available",
    "Retained source is ready for review",
    "Review uses only the local capture. Source freshness has not been checked automatically.",
    true,
    null,
  );
}
