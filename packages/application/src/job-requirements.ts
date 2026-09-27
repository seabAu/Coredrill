import {
  DomainValidationError,
  confidence,
  entityId,
  instant,
  jobRequirementCategory,
  type Confidence,
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
  parseJobRequirementProposals,
  validateJobRequirementProposal,
  type JobRequirementParseResultDto,
  type JobRequirementProposalDto,
  type ParseJobRequirementsInput,
} from "./job-requirement-parser.js";

export interface JobRequirementDto {
  readonly id: EntityId<"job-requirement">;
  readonly jobId: EntityId<"job">;
  readonly category: JobRequirementCategory;
  readonly sourceCategory: JobRequirementCategory;
  readonly normalizedText: string;
  readonly rawText: string;
  readonly provenanceId: EntityId<"provenance">;
  readonly sourcePointer: string;
  readonly sourceExcerpt: string;
  readonly extractionMethod: string;
  readonly confidence: Confidence;
  readonly userConfirmed: boolean;
  readonly sortOrder: number;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface RecordJobRequirementInput {
  readonly jobId: string;
  readonly category: JobRequirementCategory;
  readonly normalizedText: string;
  readonly rawText: string;
  readonly provenanceId: string;
  readonly sortOrder?: number;
}

export interface CorrectJobRequirementInput {
  readonly id: string;
  readonly category: JobRequirementCategory;
  readonly expectedRowVersion: number;
}

export interface ListJobRequirementsInput {
  readonly jobId: string;
}

export interface AcceptJobRequirementProposalInput {
  readonly category: JobRequirementCategory;
  readonly proposal: JobRequirementProposalDto;
}

export interface RecordJobRequirementPortInput {
  readonly id: EntityId<"job-requirement">;
  readonly jobId: EntityId<"job">;
  readonly category: JobRequirementCategory;
  readonly sourceCategory: JobRequirementCategory;
  readonly normalizedText: string;
  readonly rawText: string;
  readonly provenanceId: EntityId<"provenance">;
  readonly sortOrder: number;
  readonly createdAt: Instant;
  readonly userConfirmed: boolean;
}

export interface CorrectJobRequirementPortInput {
  readonly id: EntityId<"job-requirement">;
  readonly category: JobRequirementCategory;
  readonly expectedRowVersion: number;
  readonly updatedAt: Instant;
}

export interface JobRequirementPort {
  recordRequirement(input: RecordJobRequirementPortInput): Promise<JobRequirementDto>;
  correctRequirement(input: CorrectJobRequirementPortInput): Promise<JobRequirementDto>;
  listRequirements(jobId: EntityId<"job">): Promise<readonly JobRequirementDto[]>;
}

export type JobRequirementErrorCode =
  "busy" | "conflict" | "invalid_state" | "permission_denied" | "read_only" | "unavailable";

export class JobRequirementError extends Error {
  public override readonly name = "JobRequirementError";
  public constructor(public readonly code: JobRequirementErrorCode) {
    super("The job requirement port reported a failure.");
  }
}

export interface JobRequirementOperationDependencies {
  readonly requirements: JobRequirementPort;
  readonly createId: (kind: "job-requirement") => string;
}

export interface JobRequirementOperations {
  readonly recordRequirementCommand: ApplicationCommand<
    RecordJobRequirementInput,
    JobRequirementDto
  >;
  readonly correctRequirementCommand: ApplicationCommand<
    CorrectJobRequirementInput,
    JobRequirementDto
  >;
  readonly parseRequirementsQuery: ApplicationQuery<
    ParseJobRequirementsInput,
    JobRequirementParseResultDto
  >;
  readonly acceptRequirementProposalCommand: ApplicationCommand<
    AcceptJobRequirementProposalInput,
    JobRequirementDto
  >;
  readonly listRequirementsQuery: ApplicationQuery<
    ListJobRequirementsInput,
    readonly JobRequirementDto[]
  >;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const boundedText = (value: unknown, maximum: number): string | null => {
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) return null;
  const cleaned = value.trim();
  return cleaned.length === 0 ? null : cleaned;
};

const boundedExactText = (value: unknown, maximum: number): string | null => {
  if (
    typeof value !== "string" ||
    value.includes("\u0000") ||
    value.length > maximum ||
    value.trim().length === 0
  ) {
    return null;
  }
  return value;
};

const copyRequirement = (value: unknown): JobRequirementDto => {
  if (!isRecord(value)) throw new TypeError("Invalid job requirement.");
  const normalizedText = boundedText(value["normalizedText"], 4_096);
  const rawText = boundedText(value["rawText"], 16_384);
  const sourcePointer = boundedExactText(value["sourcePointer"], 2_048);
  const sourceExcerpt = boundedExactText(value["sourceExcerpt"], 4_096);
  const extractionMethod = boundedText(value["extractionMethod"], 128);
  if (
    normalizedText === null ||
    rawText === null ||
    sourcePointer === null ||
    sourceExcerpt === null ||
    extractionMethod === null ||
    typeof value["userConfirmed"] !== "boolean" ||
    !Number.isSafeInteger(value["sortOrder"]) ||
    (value["sortOrder"] as number) < 0 ||
    !Number.isSafeInteger(value["rowVersion"]) ||
    (value["rowVersion"] as number) < 1
  ) {
    throw new TypeError("Invalid job requirement.");
  }
  return Object.freeze({
    id: entityId("job-requirement", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    category: jobRequirementCategory(value["category"] as string),
    sourceCategory: jobRequirementCategory(value["sourceCategory"] as string),
    normalizedText,
    rawText,
    provenanceId: entityId("provenance", value["provenanceId"] as string),
    sourcePointer,
    sourceExcerpt,
    extractionMethod,
    confidence: confidence(value["confidence"] as number),
    userConfirmed: value["userConfirmed"],
    sortOrder: value["sortOrder"] as number,
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: value["rowVersion"] as number,
  });
};

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the requirement fields and try again.",
  retryable: false,
});
const UNKNOWN_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local requirement operation failed safely.",
  retryable: false,
});
const PORT_ERRORS: Readonly<Record<JobRequirementErrorCode, ApplicationError>> = Object.freeze({
  busy: Object.freeze({
    code: "conflict",
    message: "Requirement storage is busy.",
    retryable: true,
  }),
  conflict: Object.freeze({
    code: "conflict",
    message: "This requirement changed elsewhere. Reload before saving.",
    retryable: true,
  }),
  invalid_state: UNKNOWN_ERROR,
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access local requirements.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "Local requirement storage is read-only.",
    retryable: false,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local requirement storage is unavailable.",
    retryable: true,
  }),
});

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof JobRequirementError ? PORT_ERRORS[error.code] : UNKNOWN_ERROR,
  );

const isInputValidationError = (error: unknown): boolean =>
  error instanceof TypeError || error instanceof DomainValidationError;

export const createJobRequirementOperations = (
  dependencies: JobRequirementOperationDependencies,
): JobRequirementOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.requirements) ||
    typeof dependencies.requirements.recordRequirement !== "function" ||
    typeof dependencies.requirements.correctRequirement !== "function" ||
    typeof dependencies.requirements.listRequirements !== "function" ||
    typeof dependencies.createId !== "function"
  ) {
    throw new TypeError("Job requirement operations require a complete local persistence port.");
  }

  const recordRequirementCommand = defineCommand<RecordJobRequirementInput, JobRequirementDto>(
    "RecordJobRequirementCommand",
    async (input, context) => {
      if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
      const normalizedText = boundedText(input.normalizedText, 4_096);
      const rawText = boundedText(input.rawText, 16_384);
      const sortOrder = input.sortOrder ?? 0;
      if (
        normalizedText === null ||
        rawText === null ||
        !Number.isSafeInteger(sortOrder) ||
        sortOrder < 0
      ) {
        return applicationFailure(VALIDATION_ERROR);
      }
      try {
        const category = jobRequirementCategory(input.category);
        return applicationSuccess(
          copyRequirement(
            await dependencies.requirements.recordRequirement({
              id: entityId("job-requirement", dependencies.createId("job-requirement")),
              jobId: entityId("job", input.jobId),
              category,
              sourceCategory: category,
              normalizedText,
              rawText,
              provenanceId: entityId("provenance", input.provenanceId),
              sortOrder,
              createdAt: instant(context.initiatedAt),
              userConfirmed: false,
            }),
          ),
        );
      } catch (error) {
        return isInputValidationError(error)
          ? applicationFailure(VALIDATION_ERROR)
          : failureFrom(error);
      }
    },
  );

  const correctRequirementCommand = defineCommand<CorrectJobRequirementInput, JobRequirementDto>(
    "CorrectJobRequirementCommand",
    async (input, context) => {
      if (
        !isRecord(input) ||
        !Number.isSafeInteger(input.expectedRowVersion) ||
        input.expectedRowVersion < 1
      ) {
        return applicationFailure(VALIDATION_ERROR);
      }
      try {
        return applicationSuccess(
          copyRequirement(
            await dependencies.requirements.correctRequirement({
              id: entityId("job-requirement", input.id),
              category: jobRequirementCategory(input.category),
              expectedRowVersion: input.expectedRowVersion,
              updatedAt: instant(context.initiatedAt),
            }),
          ),
        );
      } catch (error) {
        return isInputValidationError(error)
          ? applicationFailure(VALIDATION_ERROR)
          : failureFrom(error);
      }
    },
  );

  const listRequirementsQuery = defineQuery<ListJobRequirementsInput, readonly JobRequirementDto[]>(
    "ListJobRequirementsQuery",
    async (input) => {
      if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
      try {
        const values = (
          await dependencies.requirements.listRequirements(entityId("job", input.jobId))
        ).map(copyRequirement);
        if (new Set(values.map(({ id }) => id)).size !== values.length) {
          throw new TypeError("Job requirement identities must be unique.");
        }
        return applicationSuccess(Object.freeze(values));
      } catch (error) {
        return isInputValidationError(error)
          ? applicationFailure(VALIDATION_ERROR)
          : failureFrom(error);
      }
    },
  );

  const parseRequirementsQuery = defineQuery<
    ParseJobRequirementsInput,
    JobRequirementParseResultDto
  >("ParseJobRequirementsQuery", (input) => {
    try {
      return Promise.resolve(applicationSuccess(parseJobRequirementProposals(input)));
    } catch (error) {
      return Promise.resolve(
        isInputValidationError(error) ? applicationFailure(VALIDATION_ERROR) : failureFrom(error),
      );
    }
  });

  const acceptRequirementProposalCommand = defineCommand<
    AcceptJobRequirementProposalInput,
    JobRequirementDto
  >("AcceptJobRequirementProposalCommand", async (input, context) => {
    if (!isRecord(input)) return applicationFailure(VALIDATION_ERROR);
    try {
      const proposal = validateJobRequirementProposal(input.proposal);
      return applicationSuccess(
        copyRequirement(
          await dependencies.requirements.recordRequirement({
            id: entityId("job-requirement", dependencies.createId("job-requirement")),
            jobId: proposal.jobId,
            category: jobRequirementCategory(input.category),
            sourceCategory: proposal.sourceCategory,
            normalizedText: proposal.normalizedText,
            rawText: proposal.rawText,
            provenanceId: proposal.provenanceId,
            sortOrder: proposal.sortOrder,
            createdAt: instant(context.initiatedAt),
            userConfirmed: true,
          }),
        ),
      );
    } catch (error) {
      return isInputValidationError(error)
        ? applicationFailure(VALIDATION_ERROR)
        : failureFrom(error);
    }
  });

  return Object.freeze({
    acceptRequirementProposalCommand,
    recordRequirementCommand,
    correctRequirementCommand,
    listRequirementsQuery,
    parseRequirementsQuery,
  });
};
