import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

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

export interface RequirementEvidenceItemDto {
  readonly evidenceId: EntityId;
  readonly evidenceKind: RequirementEvidenceKind;
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
  readonly requirementId: EntityId<"job-requirement">;
  readonly selectedAt: Instant;
}

export interface RequirementEvidenceRetrievalDto {
  readonly candidates: readonly RequirementEvidenceCandidateDto[];
  readonly capability: {
    readonly fallbackReason: RequirementEvidenceFallbackReason | null;
    readonly mode: RequirementEvidenceSearchMode;
  };
  readonly queryTerms: readonly string[];
  readonly requirementId: EntityId<"job-requirement">;
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
    typeof dependencies.evidence.remove !== "function"
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

  return Object.freeze({
    retrieveCandidatesQuery,
    selectEvidenceCommand,
    removeEvidenceCommand,
  });
};
