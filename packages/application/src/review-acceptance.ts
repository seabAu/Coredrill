import {
  fieldCandidateV1Schema,
  fieldConflictV1Schema,
  type FieldCandidateV1,
  type FieldConflictV1,
  type JsonValue,
} from "@coredrill/contracts";

import type { FieldCandidateResolutionV1 } from "./field-candidate-reconciliation.js";

export const REVIEW_HIGH_CONFIDENCE_THRESHOLD_V1 = 0.95 as const;

export const REVIEW_ACCEPTANCE_LIMITS = Object.freeze({
  maxFields: 256,
  maxCandidates: 512,
});

export const REVIEW_ACCEPTANCE_SUPPORTED_FIELDS_V1 = Object.freeze([
  "applicant_locations",
  "apply_url",
  "certification",
  "company",
  "compensation",
  "currency",
  "description",
  "education",
  "employment_type",
  "external_id",
  "location",
  "locations",
  "posted_at",
  "qualifications",
  "remote_work",
  "requirements",
  "responsibilities",
  "salary",
  "source",
  "title",
  "valid_through",
  "work_authorization",
  "work_mode",
  "workplace_type",
] as const);

export type ReviewAcceptanceSupportedFieldV1 =
  (typeof REVIEW_ACCEPTANCE_SUPPORTED_FIELDS_V1)[number];

export const REVIEW_ACCEPTANCE_REASONS_V1 = [
  "high_confidence",
  "already_user_confirmed",
  "user_confirmation_preserved",
  "unsupported_field",
  "unknown_value",
  "unresolved_conflict",
  "below_high_confidence_threshold",
] as const;

export type ReviewAcceptanceReasonV1 = (typeof REVIEW_ACCEPTANCE_REASONS_V1)[number];
export type ReviewAcceptanceDispositionV1 = "accept" | "preserve" | "review_required";

export interface PlanHighConfidenceFieldAcceptanceInputV1 {
  readonly specVersion: 1;
  readonly fields: readonly FieldCandidateResolutionV1[];
}

export interface ReviewAcceptanceDecisionV1 {
  readonly fieldName: string;
  readonly selectedCandidateId: string;
  readonly selectedConfidence: number;
  readonly disposition: ReviewAcceptanceDispositionV1;
  readonly reasons: readonly ReviewAcceptanceReasonV1[];
}

export interface HighConfidenceFieldAcceptancePlanV1 {
  readonly specVersion: 1;
  readonly minimumConfidence: typeof REVIEW_HIGH_CONFIDENCE_THRESHOLD_V1;
  readonly acceptedCandidateIds: readonly string[];
  readonly preservedCandidateIds: readonly string[];
  readonly decisions: readonly ReviewAcceptanceDecisionV1[];
}

/** Content-free failure for a malformed or internally inconsistent review plan. */
export class ReviewAcceptanceError extends Error {
  public constructor() {
    super("High-confidence review acceptance rejected invalid input.");
    this.name = "ReviewAcceptanceError";
  }
}

interface ParsedResolution {
  readonly fieldName: string;
  readonly candidates: readonly FieldCandidateV1[];
  readonly selected: FieldCandidateV1;
  readonly selectionReason: "policy_suggestion" | "user_confirmed";
  readonly conflict: FieldConflictV1 | null;
}

const SUPPORTED_FIELDS = new Set<string>(REVIEW_ACCEPTANCE_SUPPORTED_FIELDS_V1);

function invalid(): never {
  throw new ReviewAcceptanceError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalJson(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Object.is(value, -0) ? "0" : JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
    .join(",")}}`;
}

function hasUnknownTopLevelValue(value: JsonValue): boolean {
  if (value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  if (new Set(left).size !== left.length) return false;
  const rightIds = new Set(right);
  return rightIds.size === right.length && left.every((id) => rightIds.has(id));
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseResolution(input: unknown): ParsedResolution {
  if (!isRecord(input)) invalid();
  if (
    !hasExactKeys(input, [
      "fieldName",
      "candidates",
      "selectedCandidateId",
      "selectionReason",
      "conflict",
      "requiresUserReview",
    ]) ||
    typeof input["fieldName"] !== "string" ||
    !Array.isArray(input["candidates"]) ||
    input["candidates"].length === 0 ||
    typeof input["selectedCandidateId"] !== "string" ||
    !["policy_suggestion", "user_confirmed"].includes(String(input["selectionReason"])) ||
    typeof input["requiresUserReview"] !== "boolean"
  ) {
    invalid();
  }

  const fieldName = input["fieldName"];
  const candidates = input["candidates"].map((candidate) => {
    const parsed = fieldCandidateV1Schema.safeParse(candidate);
    if (!parsed.success || parsed.data.fieldName !== fieldName) invalid();
    return Object.freeze(parsed.data);
  });
  const candidateIds = candidates.map(({ id }) => id);
  if (new Set(candidateIds).size !== candidateIds.length) invalid();
  const selected = candidates.find(({ id }) => id === input["selectedCandidateId"]);
  if (selected === undefined) invalid();

  const selectionReason = input["selectionReason"] as "policy_suggestion" | "user_confirmed";
  const confirmed = candidates.filter(({ userConfirmation }) => userConfirmation !== undefined);
  if (
    (selectionReason === "user_confirmed" &&
      (confirmed.length !== 1 || confirmed[0]?.id !== selected.id)) ||
    (selectionReason === "policy_suggestion" && confirmed.length !== 0)
  ) {
    invalid();
  }

  const canonicalValues = new Set(candidates.map(({ value }) => canonicalJson(value)));
  const hasConflict = canonicalValues.size > 1;
  let conflict: FieldConflictV1 | null = null;
  if (input["conflict"] !== null) {
    const parsed = fieldConflictV1Schema.safeParse(input["conflict"]);
    if (
      !parsed.success ||
      parsed.data.status !== "unresolved" ||
      parsed.data.fieldName !== fieldName ||
      !sameIds(parsed.data.candidateIds, candidateIds)
    ) {
      invalid();
    }
    conflict = Object.freeze(parsed.data);
  }
  if (hasConflict !== (conflict !== null)) invalid();

  const expectedReview = selectionReason === "policy_suggestion" || hasConflict;
  if (input["requiresUserReview"] !== expectedReview) invalid();

  return Object.freeze({
    fieldName,
    candidates: Object.freeze(candidates),
    selected,
    selectionReason,
    conflict,
  });
}

function parseInput(input: unknown): readonly ParsedResolution[] {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["specVersion", "fields"]) ||
    input["specVersion"] !== 1 ||
    !Array.isArray(input["fields"]) ||
    input["fields"].length > REVIEW_ACCEPTANCE_LIMITS.maxFields
  ) {
    invalid();
  }

  let rawCandidateCount = 0;
  for (const field of input["fields"]) {
    if (!isRecord(field) || !Array.isArray(field["candidates"])) invalid();
    rawCandidateCount += field["candidates"].length;
    if (rawCandidateCount > REVIEW_ACCEPTANCE_LIMITS.maxCandidates) invalid();
  }

  const fields = input["fields"].map(parseResolution);
  const fieldNames = fields.map(({ fieldName }) => fieldName);
  const candidateIds = fields.flatMap(({ candidates }) => candidates.map(({ id }) => id));
  const conflictIds = fields.flatMap(({ conflict }) => (conflict === null ? [] : [conflict.id]));
  if (
    new Set(fieldNames).size !== fieldNames.length ||
    candidateIds.length > REVIEW_ACCEPTANCE_LIMITS.maxCandidates ||
    new Set(candidateIds).size !== candidateIds.length ||
    new Set(conflictIds).size !== conflictIds.length ||
    conflictIds.some((id) => candidateIds.includes(id))
  ) {
    invalid();
  }
  return Object.freeze(
    [...fields].sort((left, right) => compareText(left.fieldName, right.fieldName)),
  );
}

/**
 * Produces a deterministic, non-persisting bulk-acceptance plan. The caller
 * remains responsible for an explicit user action and a later transactional
 * confirmation boundary.
 */
export function planHighConfidenceFieldAcceptanceV1(
  input: PlanHighConfidenceFieldAcceptanceInputV1,
): HighConfidenceFieldAcceptancePlanV1 {
  const fields = parseInput(input);
  const decisions: ReviewAcceptanceDecisionV1[] = [];
  const acceptedCandidateIds: string[] = [];
  const preservedCandidateIds: string[] = [];

  for (const field of fields) {
    const selected = field.selected;
    if (field.selectionReason === "user_confirmed" && field.conflict === null) {
      preservedCandidateIds.push(selected.id);
      decisions.push(
        Object.freeze({
          fieldName: field.fieldName,
          selectedCandidateId: selected.id,
          selectedConfidence: selected.provenance.confidence,
          disposition: "preserve" as const,
          reasons: Object.freeze(["already_user_confirmed"] as const),
        }),
      );
      continue;
    }

    const reasons: ReviewAcceptanceReasonV1[] = [];
    if (!SUPPORTED_FIELDS.has(field.fieldName)) reasons.push("unsupported_field");
    if (hasUnknownTopLevelValue(selected.value)) reasons.push("unknown_value");
    if (field.conflict !== null) reasons.push("unresolved_conflict");
    if (field.selectionReason === "user_confirmed") {
      reasons.push("user_confirmation_preserved");
    } else if (selected.provenance.confidence < REVIEW_HIGH_CONFIDENCE_THRESHOLD_V1) {
      reasons.push("below_high_confidence_threshold");
    }

    if (reasons.length === 0) {
      acceptedCandidateIds.push(selected.id);
      decisions.push(
        Object.freeze({
          fieldName: field.fieldName,
          selectedCandidateId: selected.id,
          selectedConfidence: selected.provenance.confidence,
          disposition: "accept" as const,
          reasons: Object.freeze(["high_confidence"] as const),
        }),
      );
    } else {
      decisions.push(
        Object.freeze({
          fieldName: field.fieldName,
          selectedCandidateId: selected.id,
          selectedConfidence: selected.provenance.confidence,
          disposition: "review_required" as const,
          reasons: Object.freeze(reasons),
        }),
      );
    }
  }

  return Object.freeze({
    specVersion: 1 as const,
    minimumConfidence: REVIEW_HIGH_CONFIDENCE_THRESHOLD_V1,
    acceptedCandidateIds: Object.freeze(acceptedCandidateIds),
    preservedCandidateIds: Object.freeze(preservedCandidateIds),
    decisions: Object.freeze(decisions),
  });
}
