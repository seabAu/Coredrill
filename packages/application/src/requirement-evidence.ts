import {
  entityId,
  instant,
  type EntityId,
  type Instant,
  type JobRequirementCategory,
} from "@coredrill/domain";

import {
  defineCommand,
  defineQuery,
  type ApplicationCommand,
  type ApplicationQuery,
} from "./operation.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";
import {
  classifyApplicationQuestion,
  type ApplicationQuestionPolicyDto,
} from "./application-question-policy.js";
import type {
  RequirementCoverageRerunDiffV1,
  RequirementCoverageSnapshotV1,
} from "./requirement-coverage-rerun.js";

export const REQUIREMENT_EVIDENCE_KINDS = Object.freeze([
  "employment",
  "education",
  "project",
  "skill",
  "accomplishment",
  "certification",
  "publication",
  "volunteer",
  "story",
] as const);
export type RequirementEvidenceKind = (typeof REQUIREMENT_EVIDENCE_KINDS)[number];

export const REQUIREMENT_EVIDENCE_REASONS = Object.freeze([
  "exact-skill",
  "lexical",
  "skill-relation",
  "story-relation",
  "accomplishment-parent",
] as const);
export type RequirementEvidenceReason = (typeof REQUIREMENT_EVIDENCE_REASONS)[number];
export type RequirementEvidenceVerificationState =
  "disputed" | "imported" | "source_backed" | "stale" | "user_confirmed";
export type RequirementEvidenceSearchMode = "fts5" | "normalized-token";
export type RequirementEvidenceFallbackReason =
  "fts5-initialization-failed" | "fts5-query-failed" | "module-unavailable" | "policy-disabled";

export const REQUIREMENT_COVERAGE_STATES = Object.freeze([
  "strength",
  "partial",
  "gap",
  "unknown",
  "not_applicable",
] as const);
export type RequirementCoverageState = (typeof REQUIREMENT_COVERAGE_STATES)[number];
export const REQUIREMENT_COVERAGE_RULE_VERSION = "requirement-coverage-v2" as const;
export type RequirementCoverageSource = "deterministic-rule" | "user-confirmed";

export interface RequirementEvidenceItemDto {
  readonly evidenceId: EntityId;
  readonly evidenceKind: RequirementEvidenceKind;
  readonly evidenceUpdatedAt: Instant;
  readonly label: string;
  readonly summary: string;
  readonly verificationState: RequirementEvidenceVerificationState;
  readonly privacyTags: readonly string[];
}

export interface RequirementEvidenceCandidateDto extends RequirementEvidenceItemDto {
  readonly matchedTerms: readonly string[];
  readonly reasons: readonly RequirementEvidenceReason[];
  readonly score: number;
}

export interface SelectedRequirementEvidenceDto extends RequirementEvidenceItemDto {
  readonly matchedTerms: readonly string[];
  readonly reasons: readonly RequirementEvidenceReason[];
  readonly requirementId: EntityId<"job-requirement">;
  readonly selectedAt: Instant;
  readonly sourceDocument: RequirementEvidenceSourceDocumentDto | null;
}

export interface RequirementEvidenceSourceDocumentDto {
  readonly documentId: EntityId<"document">;
  readonly latestVersion: {
    readonly contentHash: string;
    readonly id: EntityId<"document-version">;
    readonly versionNumber: number;
  } | null;
}

export interface StoredRequirementCoverageDecisionDto {
  readonly decidedAt: Instant;
  readonly requirementRowVersion: number;
  readonly rowVersion: number;
  readonly selectionBasis: string;
  readonly state: RequirementCoverageState;
}

export interface RequirementCoverageDecisionDto {
  readonly decidedAt: Instant | null;
  readonly explanation: string;
  readonly ruleVersion: typeof REQUIREMENT_COVERAGE_RULE_VERSION;
  readonly rowVersion: number | null;
  readonly source: RequirementCoverageSource;
  readonly stale: boolean;
  readonly state: RequirementCoverageState;
}

export interface DeriveRequirementCoverageInput {
  readonly category: JobRequirementCategory;
  readonly requirementText: string;
  readonly requirementRowVersion: number;
  readonly selectedEvidence: readonly SelectedRequirementEvidenceDto[];
  readonly storedDecision: StoredRequirementCoverageDecisionDto | null;
}

export interface RequirementEvidenceRetrievalDto {
  readonly answerPolicy: ApplicationQuestionPolicyDto;
  readonly candidates: readonly RequirementEvidenceCandidateDto[];
  readonly capability: {
    readonly fallbackReason: RequirementEvidenceFallbackReason | null;
    readonly mode: RequirementEvidenceSearchMode;
  };
  readonly queryTerms: readonly string[];
  readonly requirementId: EntityId<"job-requirement">;
  readonly coverage: RequirementCoverageDecisionDto;
  readonly selectedEvidence: readonly SelectedRequirementEvidenceDto[];
}

export interface RetrieveRequirementEvidenceInput {
  readonly requirementId: string;
  readonly limit?: number;
}

export interface SelectRequirementEvidenceInput {
  readonly requirementId: string;
  readonly evidenceKind: RequirementEvidenceKind;
  readonly evidenceId: string;
}

export type RemoveRequirementEvidenceInput = SelectRequirementEvidenceInput;

export interface SetRequirementCoverageDecisionInput {
  readonly expectedRowVersion: number | null;
  readonly requirementId: string;
  readonly state: RequirementCoverageState;
}

export interface ResetRequirementCoverageDecisionInput {
  readonly expectedRowVersion: number;
  readonly requirementId: string;
}

export interface RerunRequirementCoverageInput {
  readonly baseline: RequirementCoverageSnapshotV1;
  readonly requirementId: string;
}

export interface RerunRequirementCoverageDto {
  readonly comparison: RequirementCoverageRerunDiffV1;
  readonly current: RequirementEvidenceRetrievalDto;
}

export interface RequirementEvidencePort {
  retrieve(input: {
    readonly requirementId: EntityId<"job-requirement">;
    readonly limit: number;
  }): Promise<RequirementEvidenceRetrievalDto>;
  select(input: {
    readonly requirementId: EntityId<"job-requirement">;
    readonly evidenceKind: RequirementEvidenceKind;
    readonly evidenceId: EntityId;
    readonly selectedAt: Instant;
  }): Promise<SelectedRequirementEvidenceDto>;
  remove(input: {
    readonly requirementId: EntityId<"job-requirement">;
    readonly evidenceKind: RequirementEvidenceKind;
    readonly evidenceId: EntityId;
  }): Promise<boolean>;
  setCoverageDecision(input: {
    readonly decidedAt: Instant;
    readonly expectedRowVersion: number | null;
    readonly requirementId: EntityId<"job-requirement">;
    readonly state: RequirementCoverageState;
  }): Promise<RequirementCoverageDecisionDto>;
  resetCoverageDecision(input: {
    readonly expectedRowVersion: number;
    readonly requirementId: EntityId<"job-requirement">;
  }): Promise<RequirementCoverageDecisionDto>;
}

export type RequirementEvidenceErrorCode =
  | "busy"
  | "conflict"
  | "invalid_state"
  | "not_found"
  | "permission_denied"
  | "read_only"
  | "unavailable";

export class RequirementEvidenceError extends Error {
  public override readonly name = "RequirementEvidenceError";
  public constructor(public readonly code: RequirementEvidenceErrorCode) {
    super("The requirement evidence port reported a failure.");
  }
}

export interface RequirementEvidenceOperationDependencies {
  readonly evidence: RequirementEvidencePort;
}

export interface RequirementEvidenceOperations {
  readonly retrieveCandidatesQuery: ApplicationQuery<
    RetrieveRequirementEvidenceInput,
    RequirementEvidenceRetrievalDto
  >;
  readonly selectEvidenceCommand: ApplicationCommand<
    SelectRequirementEvidenceInput,
    SelectedRequirementEvidenceDto
  >;
  readonly removeEvidenceCommand: ApplicationCommand<RemoveRequirementEvidenceInput, boolean>;
  readonly setCoverageDecisionCommand: ApplicationCommand<
    SetRequirementCoverageDecisionInput,
    RequirementCoverageDecisionDto
  >;
  readonly resetCoverageDecisionCommand: ApplicationCommand<
    ResetRequirementCoverageDecisionInput,
    RequirementCoverageDecisionDto
  >;
  readonly rerunCoverageQuery: ApplicationQuery<
    RerunRequirementCoverageInput,
    RerunRequirementCoverageDto
  >;
}

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the evidence selection and try again.",
  retryable: false,
});
const UNKNOWN_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local evidence operation failed safely.",
  retryable: false,
});
const PORT_ERRORS: Readonly<Record<RequirementEvidenceErrorCode, ApplicationError>> = Object.freeze(
  {
    busy: Object.freeze({
      code: "conflict",
      message: "Evidence storage is busy.",
      retryable: true,
    }),
    conflict: Object.freeze({
      code: "conflict",
      message: "The evidence selection changed elsewhere. Reload before saving.",
      retryable: true,
    }),
    invalid_state: UNKNOWN_ERROR,
    not_found: Object.freeze({
      code: "not_found",
      message: "The requirement or evidence is no longer available.",
      retryable: false,
    }),
    permission_denied: Object.freeze({
      code: "permission_denied",
      message: "Coredrill cannot access local evidence.",
      retryable: true,
    }),
    read_only: Object.freeze({
      code: "permission_denied",
      message: "Local evidence storage is read-only.",
      retryable: false,
    }),
    unavailable: Object.freeze({
      code: "unavailable",
      message: "Local evidence storage is unavailable.",
      retryable: true,
    }),
  },
);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const evidenceKind = (value: unknown): RequirementEvidenceKind => {
  if (
    typeof value !== "string" ||
    !REQUIREMENT_EVIDENCE_KINDS.includes(value as RequirementEvidenceKind)
  ) {
    throw new TypeError("Evidence kind is invalid.");
  }
  return value as RequirementEvidenceKind;
};

const coverageState = (value: unknown): RequirementCoverageState => {
  if (
    typeof value !== "string" ||
    !REQUIREMENT_COVERAGE_STATES.includes(value as RequirementCoverageState)
  ) {
    throw new TypeError("Requirement coverage state is invalid.");
  }
  return value as RequirementCoverageState;
};

function positiveRowVersion(value: unknown, allowNull: false): number;
function positiveRowVersion(value: unknown, allowNull: true): number | null;
function positiveRowVersion(value: unknown, allowNull: boolean): number | null {
  if (allowNull && value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError("Requirement coverage row version is invalid.");
  }
  return value as number;
}

export const requirementCoverageSelectionBasis = (
  selectedEvidence: readonly SelectedRequirementEvidenceDto[],
): string =>
  [...selectedEvidence]
    .map(
      ({
        evidenceId,
        evidenceKind: kind,
        evidenceUpdatedAt,
        sourceDocument,
        verificationState,
      }) => {
        const sourceBasis =
          sourceDocument === null
            ? "no-source-document"
            : `${sourceDocument.documentId}:${sourceDocument.latestVersion?.id ?? "no-version"}:${sourceDocument.latestVersion?.contentHash ?? "no-content"}`;
        return `${kind}:${evidenceId}:${evidenceUpdatedAt}:${verificationState}:${sourceBasis}`;
      },
    )
    .sort()
    .join("|");

const evidenceLabel = (items: readonly SelectedRequirementEvidenceDto[]): string => {
  const first = items[0];
  if (first === undefined) return "No selected evidence";
  if (items.length === 1) return `“${first.label}”`;
  return `“${first.label}” and ${String(items.length - 1)} other selected evidence item${items.length === 2 ? "" : "s"}`;
};

const manualExplanation = (
  state: RequirementCoverageState,
  selectedEvidence: readonly SelectedRequirementEvidenceDto[],
): string => {
  const evidence = evidenceLabel(selectedEvidence);
  switch (state) {
    case "strength":
      return `You marked this as Strength using ${evidence}. This is your evidence judgment, not employer verification or a hiring probability.`;
    case "partial":
      return `You marked this as Partial using ${evidence}. The linked evidence supports only part of the requirement.`;
    case "gap":
      return selectedEvidence.length === 0
        ? "You marked this as a Gap after review. No selected evidence currently supports the requirement."
        : `You marked this as a Gap after reviewing ${evidence}; it remains linked only as truthful transferable context.`;
    case "unknown":
      return selectedEvidence.length === 0
        ? "You marked this as Unknown because available information does not establish whether the requirement is covered."
        : `You marked this as Unknown after reviewing ${evidence}; the selected evidence does not establish a decision yet.`;
    case "not_applicable":
      return "You marked this requirement Not Applicable. It is excluded from qualification evidence coverage without being deleted.";
  }
};

const deterministicCoverage = (
  category: JobRequirementCategory,
  requirementText: string,
  selectedEvidence: readonly SelectedRequirementEvidenceDto[],
): RequirementCoverageDecisionDto => {
  if (classifyApplicationQuestion(requirementText).handling === "direct-private-answer") {
    return Object.freeze({
      decidedAt: null,
      explanation:
        "This eligibility or demographic question requires your direct private answer. Coredrill will not infer it from Career Profile, evidence, documents, or saved answers.",
      ruleVersion: REQUIREMENT_COVERAGE_RULE_VERSION,
      rowVersion: null,
      source: "deterministic-rule",
      stale: false,
      state: "unknown",
    });
  }
  if (category === "context") {
    return Object.freeze({
      decidedAt: null,
      explanation:
        "This is job context rather than a qualification, so no qualification evidence is expected.",
      ruleVersion: REQUIREMENT_COVERAGE_RULE_VERSION,
      rowVersion: null,
      source: "deterministic-rule",
      stale: false,
      state: "not_applicable",
    });
  }
  if (selectedEvidence.length === 0) {
    return Object.freeze({
      decidedAt: null,
      explanation:
        "No evidence is selected. Coverage is Unknown—not a Gap—until you review or add evidence.",
      ruleVersion: REQUIREMENT_COVERAGE_RULE_VERSION,
      rowVersion: null,
      source: "deterministic-rule",
      stale: false,
      state: "unknown",
    });
  }

  const strong = selectedEvidence.find(
    ({ reasons, verificationState }) =>
      (verificationState === "user_confirmed" || verificationState === "source_backed") &&
      reasons.some((reason) => reason !== "lexical"),
  );
  if (strong !== undefined) {
    return Object.freeze({
      decidedAt: null,
      explanation: `${evidenceLabel([strong])} has a structured requirement relation and is ${strong.verificationState.replaceAll("_", " ")}. This supports Strength, not a hiring probability.`,
      ruleVersion: REQUIREMENT_COVERAGE_RULE_VERSION,
      rowVersion: null,
      source: "deterministic-rule",
      stale: false,
      state: "strength",
    });
  }

  return Object.freeze({
    decidedAt: null,
    explanation: `${evidenceLabel(selectedEvidence)} is relevant, but the selected evidence does not combine a structured relation with user-confirmed or source-backed verification. Coverage is Partial.`,
    ruleVersion: REQUIREMENT_COVERAGE_RULE_VERSION,
    rowVersion: null,
    source: "deterministic-rule",
    stale: false,
    state: "partial",
  });
};

export const deriveRequirementCoverageDecision = (
  input: DeriveRequirementCoverageInput,
): RequirementCoverageDecisionDto => {
  if (!Number.isSafeInteger(input.requirementRowVersion) || input.requirementRowVersion < 1) {
    throw new TypeError("Requirement coverage input row version is invalid.");
  }
  const answerPolicy = classifyApplicationQuestion(input.requirementText);
  const automatic = deterministicCoverage(
    input.category,
    input.requirementText,
    input.selectedEvidence,
  );
  if (input.storedDecision === null) return automatic;

  const state = coverageState(input.storedDecision.state);
  const stale =
    input.storedDecision.requirementRowVersion !== input.requirementRowVersion ||
    input.storedDecision.selectionBasis !==
      requirementCoverageSelectionBasis(input.selectedEvidence);
  const explanation =
    answerPolicy.handling === "direct-private-answer"
      ? `A previous ${state.replaceAll("_", " ")} coverage label is retained for review, but it is not an answer. Coredrill will not infer or prefill this private question.`
      : stale
        ? `You previously marked this as ${state.replaceAll("_", " ")}, but the requirement or selected evidence changed afterward. Review the decision; Coredrill has not overwritten it.`
        : manualExplanation(state, input.selectedEvidence);
  return Object.freeze({
    decidedAt: instant(input.storedDecision.decidedAt),
    explanation,
    ruleVersion: REQUIREMENT_COVERAGE_RULE_VERSION,
    rowVersion: positiveRowVersion(input.storedDecision.rowVersion, false),
    source: "user-confirmed",
    stale,
    state,
  });
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof RequirementEvidenceError ? PORT_ERRORS[error.code] : UNKNOWN_ERROR,
  );

export const createRequirementEvidenceOperations = (
  dependencies: RequirementEvidenceOperationDependencies,
): RequirementEvidenceOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.evidence) ||
    typeof dependencies.evidence.retrieve !== "function" ||
    typeof dependencies.evidence.select !== "function" ||
    typeof dependencies.evidence.remove !== "function" ||
    typeof dependencies.evidence.setCoverageDecision !== "function" ||
    typeof dependencies.evidence.resetCoverageDecision !== "function"
  ) {
    throw new TypeError("Requirement evidence operations require a complete local port.");
  }

  const retrieveCandidatesQuery = defineQuery<
    RetrieveRequirementEvidenceInput,
    RequirementEvidenceRetrievalDto
  >("RetrieveRequirementEvidenceQuery", async (input) => {
    if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
    const limit = input.limit ?? 12;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      return applicationFailure(VALIDATION_ERROR);
    }
    try {
      return applicationSuccess(
        await dependencies.evidence.retrieve({
          requirementId: entityId("job-requirement", input.requirementId),
          limit,
        }),
      );
    } catch (error) {
      return error instanceof TypeError ? applicationFailure(VALIDATION_ERROR) : failureFrom(error);
    }
  });

  const selectEvidenceCommand = defineCommand<
    SelectRequirementEvidenceInput,
    SelectedRequirementEvidenceDto
  >("SelectRequirementEvidenceCommand", async (input, context) => {
    if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
    try {
      return applicationSuccess(
        await dependencies.evidence.select({
          requirementId: entityId("job-requirement", input.requirementId),
          evidenceKind: evidenceKind(input.evidenceKind),
          evidenceId: entityId("career-evidence", input.evidenceId),
          selectedAt: instant(context.initiatedAt),
        }),
      );
    } catch (error) {
      return error instanceof TypeError ? applicationFailure(VALIDATION_ERROR) : failureFrom(error);
    }
  });

  const removeEvidenceCommand = defineCommand<RemoveRequirementEvidenceInput, boolean>(
    "RemoveRequirementEvidenceCommand",
    async (input) => {
      if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
      try {
        return applicationSuccess(
          await dependencies.evidence.remove({
            requirementId: entityId("job-requirement", input.requirementId),
            evidenceKind: evidenceKind(input.evidenceKind),
            evidenceId: entityId("career-evidence", input.evidenceId),
          }),
        );
      } catch (error) {
        return error instanceof TypeError
          ? applicationFailure(VALIDATION_ERROR)
          : failureFrom(error);
      }
    },
  );

  const setCoverageDecisionCommand = defineCommand<
    SetRequirementCoverageDecisionInput,
    RequirementCoverageDecisionDto
  >("SetRequirementCoverageDecisionCommand", async (input, context) => {
    if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
    try {
      return applicationSuccess(
        await dependencies.evidence.setCoverageDecision({
          decidedAt: instant(context.initiatedAt),
          expectedRowVersion: positiveRowVersion(input.expectedRowVersion, true),
          requirementId: entityId("job-requirement", input.requirementId),
          state: coverageState(input.state),
        }),
      );
    } catch (error) {
      return error instanceof TypeError ? applicationFailure(VALIDATION_ERROR) : failureFrom(error);
    }
  });

  const resetCoverageDecisionCommand = defineCommand<
    ResetRequirementCoverageDecisionInput,
    RequirementCoverageDecisionDto
  >("ResetRequirementCoverageDecisionCommand", async (input) => {
    if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
    try {
      return applicationSuccess(
        await dependencies.evidence.resetCoverageDecision({
          expectedRowVersion: positiveRowVersion(input.expectedRowVersion, false),
          requirementId: entityId("job-requirement", input.requirementId),
        }),
      );
    } catch (error) {
      return error instanceof TypeError ? applicationFailure(VALIDATION_ERROR) : failureFrom(error);
    }
  });

  const rerunCoverageQuery = defineQuery<
    RerunRequirementCoverageInput,
    RerunRequirementCoverageDto
  >("RerunRequirementCoverageQuery", async (input) => {
    if (!isRecord(input) || !isRecord(input.baseline)) {
      return applicationFailure(VALIDATION_ERROR);
    }
    try {
      const requirementId = entityId("job-requirement", input.requirementId);
      const current = await dependencies.evidence.retrieve({ requirementId, limit: 12 });
      const { captureRequirementCoverageSnapshotV1, compareRequirementCoverageRunsV1 } =
        await import("./requirement-coverage-rerun.js");
      return applicationSuccess(
        Object.freeze({
          comparison: compareRequirementCoverageRunsV1(
            input.baseline,
            captureRequirementCoverageSnapshotV1(current),
          ),
          current,
        }),
      );
    } catch (error) {
      return error instanceof TypeError ? applicationFailure(VALIDATION_ERROR) : failureFrom(error);
    }
  });

  return Object.freeze({
    retrieveCandidatesQuery,
    selectEvidenceCommand,
    removeEvidenceCommand,
    setCoverageDecisionCommand,
    resetCoverageDecisionCommand,
    rerunCoverageQuery,
  });
};
