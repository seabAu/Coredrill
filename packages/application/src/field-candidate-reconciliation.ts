import {
  fieldCandidateV1Schema,
  fieldConflictV1Schema,
  type ExtractionMethod,
  type FieldCandidateV1,
  type FieldConflictV1,
  type JsonValue,
} from "@coredrill/contracts";

export const FIELD_CANDIDATE_RECONCILIATION_LIMITS = Object.freeze({
  maxCandidates: 512,
  maxConflictCandidatesPerField: 32,
});

export const FIELD_CANDIDATE_RECONCILIATION_ERROR_CODES = [
  "input_invalid",
  "candidate_invalid",
  "candidate_limit_exceeded",
  "duplicate_candidate_id",
  "incoming_confirmation_forbidden",
  "multiple_confirmed_candidates",
  "conflict_candidate_limit_exceeded",
  "conflict_invalid",
] as const;

export type FieldCandidateReconciliationErrorCode =
  (typeof FIELD_CANDIDATE_RECONCILIATION_ERROR_CODES)[number];

/** Content-free failure for untrusted candidate or confirmation data. */
export class FieldCandidateReconciliationError extends Error {
  public constructor(public readonly code: FieldCandidateReconciliationErrorCode) {
    super("Field-candidate reconciliation rejected invalid input.");
    this.name = "FieldCandidateReconciliationError";
  }
}

export type FieldCandidateSelectionReason = "policy_suggestion" | "user_confirmed";

export interface FieldCandidateResolutionV1 {
  readonly fieldName: string;
  readonly candidates: readonly FieldCandidateV1[];
  readonly selectedCandidateId: string;
  readonly selectionReason: FieldCandidateSelectionReason;
  readonly conflict: FieldConflictV1 | null;
  readonly requiresUserReview: boolean;
}

export interface FieldCandidateReconciliationV1 {
  readonly retainedCandidates: readonly FieldCandidateV1[];
  readonly fields: readonly FieldCandidateResolutionV1[];
  readonly conflicts: readonly FieldConflictV1[];
}

export interface ReconcileFieldCandidatesInputV1 {
  /** Candidates already loaded from the trusted local candidate-history boundary. */
  readonly existingCandidates: readonly FieldCandidateV1[];
  /** Untrusted candidates proposed by the current capture/extraction pass. */
  readonly incomingCandidates: readonly FieldCandidateV1[];
  readonly createConflictId: () => string;
}

const METHOD_PRIORITY: Readonly<Record<ExtractionMethod, number>> = Object.freeze({
  user: 0,
  api: 1,
  jsonld: 1,
  selector: 2,
  readability: 3,
  heuristic: 4,
  llm: 5,
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
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

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareSuggestions(left: FieldCandidateV1, right: FieldCandidateV1): number {
  const method = METHOD_PRIORITY[left.provenance.method] - METHOD_PRIORITY[right.provenance.method];
  if (method !== 0) return method;
  const confidence = right.provenance.confidence - left.provenance.confidence;
  if (confidence !== 0) return confidence;
  const capturedAt = compareText(right.provenance.capturedAt, left.provenance.capturedAt);
  if (capturedAt !== 0) return capturedAt;
  return compareText(left.id, right.id);
}

function parseCandidate(input: unknown): FieldCandidateV1 {
  const parsed = fieldCandidateV1Schema.safeParse(input);
  if (!parsed.success) throw new FieldCandidateReconciliationError("candidate_invalid");
  return deepFreeze(parsed.data);
}

function parseInput(input: ReconcileFieldCandidatesInputV1): {
  readonly existing: readonly FieldCandidateV1[];
  readonly incoming: readonly FieldCandidateV1[];
  readonly createConflictId: () => string;
} {
  const untrusted = input as unknown;
  if (typeof untrusted !== "object" || untrusted === null || Array.isArray(untrusted)) {
    throw new FieldCandidateReconciliationError("input_invalid");
  }
  const record = untrusted as Record<string, unknown>;
  if (
    !Array.isArray(record["existingCandidates"]) ||
    !Array.isArray(record["incomingCandidates"]) ||
    typeof record["createConflictId"] !== "function"
  ) {
    throw new FieldCandidateReconciliationError("input_invalid");
  }
  const total = record["existingCandidates"].length + record["incomingCandidates"].length;
  if (total > FIELD_CANDIDATE_RECONCILIATION_LIMITS.maxCandidates) {
    throw new FieldCandidateReconciliationError("candidate_limit_exceeded");
  }

  const existing = record["existingCandidates"].map(parseCandidate);
  const incoming = record["incomingCandidates"].map(parseCandidate);
  if (incoming.some((candidate) => candidate.userConfirmation !== undefined)) {
    throw new FieldCandidateReconciliationError("incoming_confirmation_forbidden");
  }

  const allIds = [...existing, ...incoming].map((candidate) => candidate.id);
  if (new Set(allIds).size !== allIds.length) {
    throw new FieldCandidateReconciliationError("duplicate_candidate_id");
  }

  return Object.freeze({
    existing: Object.freeze(existing),
    incoming: Object.freeze(incoming),
    createConflictId: record["createConflictId"] as () => string,
  });
}

function createConflict(
  fieldName: string,
  candidateIds: readonly string[],
  createConflictId: () => string,
): FieldConflictV1 {
  let id: string;
  try {
    id = createConflictId();
  } catch {
    throw new FieldCandidateReconciliationError("conflict_invalid");
  }
  const parsed = fieldConflictV1Schema.safeParse({
    specVersion: 1,
    id,
    fieldName,
    candidateIds,
    status: "unresolved",
  });
  if (!parsed.success) throw new FieldCandidateReconciliationError("conflict_invalid");
  return deepFreeze(parsed.data);
}

/**
 * Builds a non-mutating reconciliation plan. Existing durable confirmation is
 * authoritative; method/confidence ordering produces a review suggestion only.
 */
export function reconcileFieldCandidatesV1(
  input: ReconcileFieldCandidatesInputV1,
): FieldCandidateReconciliationV1 {
  const parsed = parseInput(input);
  const retainedCandidates = Object.freeze(
    [...parsed.existing, ...parsed.incoming].sort((left, right) => {
      const field = compareText(left.fieldName, right.fieldName);
      return field === 0 ? compareText(left.id, right.id) : field;
    }),
  );
  const candidatesByField = new Map<string, FieldCandidateV1[]>();
  for (const candidate of retainedCandidates) {
    const group = candidatesByField.get(candidate.fieldName) ?? [];
    group.push(candidate);
    candidatesByField.set(candidate.fieldName, group);
  }

  const fields: FieldCandidateResolutionV1[] = [];
  const conflicts: FieldConflictV1[] = [];
  const reservedIds = new Set(retainedCandidates.map((candidate) => candidate.id));
  for (const fieldName of [...candidatesByField.keys()].sort(compareText)) {
    const candidates = Object.freeze(
      [...(candidatesByField.get(fieldName) ?? [])].sort((left, right) =>
        compareText(left.id, right.id),
      ),
    );
    const confirmed = candidates.filter(
      (candidate) =>
        parsed.existing.includes(candidate) && candidate.userConfirmation !== undefined,
    );
    if (confirmed.length > 1) {
      throw new FieldCandidateReconciliationError("multiple_confirmed_candidates");
    }

    const selected = confirmed[0] ?? [...candidates].sort(compareSuggestions)[0];
    if (selected === undefined) throw new FieldCandidateReconciliationError("input_invalid");
    const hasConflict =
      new Set(candidates.map((candidate) => canonicalJson(candidate.value))).size > 1;
    if (
      hasConflict &&
      candidates.length > FIELD_CANDIDATE_RECONCILIATION_LIMITS.maxConflictCandidatesPerField
    ) {
      throw new FieldCandidateReconciliationError("conflict_candidate_limit_exceeded");
    }
    const conflict = hasConflict
      ? createConflict(
          fieldName,
          candidates.map((candidate) => candidate.id),
          parsed.createConflictId,
        )
      : null;
    if (conflict !== null) {
      if (reservedIds.has(conflict.id)) {
        throw new FieldCandidateReconciliationError("conflict_invalid");
      }
      reservedIds.add(conflict.id);
      conflicts.push(conflict);
    }

    const selectionReason: FieldCandidateSelectionReason =
      confirmed.length === 1 ? "user_confirmed" : "policy_suggestion";
    fields.push(
      Object.freeze({
        fieldName,
        candidates,
        selectedCandidateId: selected.id,
        selectionReason,
        conflict,
        requiresUserReview: selectionReason === "policy_suggestion" || conflict !== null,
      }),
    );
  }

  return Object.freeze({
    retainedCandidates,
    fields: Object.freeze(fields),
    conflicts: Object.freeze(conflicts),
  });
}
