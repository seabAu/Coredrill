import {
  compareDateOnly,
  dateOnly,
  entityId,
  instant,
  type DateOnly,
  type EntityId,
  type Instant,
  type StatusDefinitionId,
} from "@coredrill/domain";

import { defineCommand, type ApplicationCommand } from "./operation.js";
import { copyFreshMutationUndoToken, type MutationUndoTokenDto } from "./mutation-undo.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export interface CreatedJobDto {
  readonly id: EntityId<"job">;
  readonly companyId: EntityId<"company"> | null;
  readonly title: string;
  readonly currentStatusId: StatusDefinitionId | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface StatusEventDto {
  readonly id: EntityId<"status-event">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly fromStatusId: StatusDefinitionId | null;
  readonly toStatusId: StatusDefinitionId;
  readonly occurredAt: Instant;
  readonly note: string | null;
  readonly createdAt: Instant;
  readonly rowVersion: number;
}

export interface UndoableStatusChangeDto {
  readonly statusEvent: StatusEventDto;
  readonly undoToken: MutationUndoTokenDto;
}

export interface CreateManualJobPortInput {
  readonly id: EntityId<"job">;
  readonly companyId: EntityId<"company"> | null;
  readonly title: string;
  readonly normalizedTitle: null;
  readonly descriptionText: string;
  readonly employmentType: string | null;
  readonly workplaceType: string | null;
  readonly seniority: string | null;
  readonly locationId: EntityId<"location"> | null;
  readonly remoteRegion: null;
  readonly datePosted: DateOnly | null;
  readonly validThrough: DateOnly | null;
  readonly currentStatusId: null;
  readonly nextActionAt: null;
  readonly archivedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface ChangeStatusPortInput {
  readonly eventId: EntityId<"status-event">;
  readonly undoTokenId: EntityId<"mutation-undo-token">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly toStatusId: StatusDefinitionId;
  readonly occurredAt: Instant;
  readonly note: string | null;
  readonly allowReopen: boolean;
}

/**
 * Runtime-owned local persistence boundary for the first pipeline use cases.
 * changeStatus MUST update every projection and append its event in one transaction.
 */
export interface JobPipelinePort {
  createManualJob(input: CreateManualJobPortInput): Promise<CreatedJobDto>;
  changeStatus(input: ChangeStatusPortInput): Promise<UndoableStatusChangeDto>;
}

export const JOB_PIPELINE_ERROR_CODES = [
  "already_exists",
  "not_found",
  "same_status",
  "reopen_confirmation_required",
  "projection_conflict",
  "busy",
  "unavailable",
  "permission_denied",
  "read_only",
  "invalid_state",
] as const;
export type JobPipelineErrorCode = (typeof JOB_PIPELINE_ERROR_CODES)[number];

/** Content-free typed failure for implementations of JobPipelinePort. */
export class JobPipelineError extends Error {
  public readonly code: JobPipelineErrorCode;

  public constructor(code: JobPipelineErrorCode) {
    if (!JOB_PIPELINE_ERROR_CODES.includes(code)) {
      throw new TypeError("Job pipeline failures require a reviewed stable code.");
    }
    super("The job pipeline port reported a failure.");
    this.name = "JobPipelineError";
    this.code = code;
  }
}

export interface CreateJobInput {
  readonly title: string;
  readonly companyId?: string | null;
  readonly descriptionText?: string;
  readonly employmentType?: string | null;
  readonly workplaceType?: string | null;
  readonly seniority?: string | null;
  readonly locationId?: string | null;
  readonly datePosted?: string | null;
  readonly validThrough?: string | null;
}

export interface ChangeStatusInput {
  readonly jobId: string;
  readonly applicationId?: string | null;
  readonly toStatusId: string;
  readonly note?: string | null;
  readonly allowReopen?: boolean;
}

export interface JobPipelineOperationDependencies {
  readonly pipeline: JobPipelinePort;
  readonly createJobId: () => EntityId<"job">;
  readonly createStatusEventId: () => EntityId<"status-event">;
  readonly createUndoTokenId: () => EntityId<"mutation-undo-token">;
}

export interface JobPipelineOperations {
  readonly createJobCommand: ApplicationCommand<CreateJobInput, CreatedJobDto>;
  readonly changeStatusCommand: ApplicationCommand<ChangeStatusInput, UndoableStatusChangeDto>;
}

const VALID_JOB_TITLE_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Enter a job title between 1 and 1024 characters without control characters.",
  retryable: false,
});
const VALID_MANUAL_JOB_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the manual job fields and try again.",
  retryable: false,
});
const VALID_STATUS_CHANGE_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose valid local pipeline records and status-change details.",
  retryable: false,
});
const UNKNOWN_PIPELINE_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local pipeline operation failed safely.",
  retryable: false,
});

const PIPELINE_ERRORS: Readonly<Record<JobPipelineErrorCode, ApplicationError>> = Object.freeze({
  already_exists: Object.freeze({
    code: "conflict",
    message: "The local job already exists.",
    retryable: false,
  }),
  not_found: Object.freeze({
    code: "not_found",
    message: "The requested local pipeline record was not found.",
    retryable: false,
  }),
  same_status: Object.freeze({
    code: "conflict",
    message: "Choose a different pipeline stage.",
    retryable: false,
  }),
  reopen_confirmation_required: Object.freeze({
    code: "conflict",
    message: "Confirm that you want to reopen this closed pipeline item.",
    retryable: false,
  }),
  projection_conflict: Object.freeze({
    code: "conflict",
    message: "The pipeline changed. Review it, then retry.",
    retryable: true,
  }),
  busy: Object.freeze({
    code: "conflict",
    message: "The local job store is busy. Retry shortly.",
    retryable: true,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local job storage is unavailable.",
    retryable: true,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access local job storage.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local job store is read-only.",
    retryable: false,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local pipeline is not in a usable state.",
    retryable: false,
  }),
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

const requireJobTitle = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 1024 ||
    hasControlCharacter(value)
  ) {
    throw new TypeError("Invalid job title.");
  }
  return value;
};

const optionalText = (value: unknown, maximum: number): string | null => {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.includes("\u0000")
  ) {
    throw new TypeError("Invalid optional job text.");
  }
  return value;
};

const nullableResultText = (value: unknown, maximum: number): string | null => {
  if (value === null) return null;
  if (value === undefined) throw new TypeError("Missing pipeline text field.");
  return optionalText(value, maximum);
};

const descriptionText = (value: unknown): string => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 2_000_000 || value.includes("\u0000")) {
    throw new TypeError("Invalid job description.");
  }
  return value;
};

const optionalInputEntityId = <Entity extends string>(
  type: Entity,
  value: unknown,
): EntityId<Entity> | null =>
  value === undefined || value === null ? null : entityId(type, value as string);

const nullableResultEntityId = <Entity extends string>(
  type: Entity,
  value: unknown,
): EntityId<Entity> | null => (value === null ? null : entityId(type, value as string));

const optionalInputDate = (value: unknown): DateOnly | null =>
  value === undefined || value === null ? null : dateOnly(value as string);

const requireRowVersion = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Invalid pipeline row version.");
  }
  return value;
};

interface ExpectedCreatedJob {
  readonly id: EntityId<"job">;
  readonly companyId: EntityId<"company"> | null;
  readonly title: string;
  readonly createdAt: Instant;
}

const copyCreatedJob = (value: unknown, expected: ExpectedCreatedJob): CreatedJobDto => {
  if (!isRecord(value)) throw new TypeError("Invalid created job result.");
  const copied: CreatedJobDto = Object.freeze({
    id: entityId("job", value["id"] as string),
    companyId: nullableResultEntityId("company", value["companyId"]),
    title: requireJobTitle(value["title"]),
    currentStatusId: nullableResultEntityId("status_definition", value["currentStatusId"]),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.companyId !== expected.companyId ||
    copied.title !== expected.title ||
    copied.currentStatusId !== null ||
    copied.createdAt !== expected.createdAt ||
    copied.updatedAt !== expected.createdAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Created job result does not match the requested operation.");
  }
  return copied;
};

interface ExpectedStatusEvent {
  readonly id: EntityId<"status-event">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly toStatusId: StatusDefinitionId;
  readonly occurredAt: Instant;
  readonly note: string | null;
}

const copyStatusEvent = (value: unknown, expected: ExpectedStatusEvent): StatusEventDto => {
  if (!isRecord(value)) throw new TypeError("Invalid status-event result.");
  const copied: StatusEventDto = Object.freeze({
    id: entityId("status-event", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    applicationId: nullableResultEntityId("application", value["applicationId"]),
    fromStatusId: nullableResultEntityId("status_definition", value["fromStatusId"]),
    toStatusId: entityId("status_definition", value["toStatusId"] as string),
    occurredAt: instant(value["occurredAt"] as string),
    note: nullableResultText(value["note"], 200_000),
    createdAt: instant(value["createdAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.jobId !== expected.jobId ||
    copied.applicationId !== expected.applicationId ||
    copied.toStatusId !== expected.toStatusId ||
    copied.occurredAt !== expected.occurredAt ||
    copied.note !== expected.note ||
    copied.createdAt !== expected.occurredAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Status-event result does not match the requested operation.");
  }
  return copied;
};

const copyUndoableStatusChange = (
  value: unknown,
  expected: ExpectedStatusEvent,
  undoTokenId: EntityId<"mutation-undo-token">,
): UndoableStatusChangeDto => {
  if (!isRecord(value)) throw new TypeError("Invalid undoable status-change result.");
  return Object.freeze({
    statusEvent: copyStatusEvent(value["statusEvent"], expected),
    undoToken: copyFreshMutationUndoToken(value["undoToken"], {
      id: undoTokenId,
      kind: "status_change",
      jobId: expected.jobId,
      createdAt: expected.occurredAt,
    }),
  });
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof JobPipelineError ? PIPELINE_ERRORS[error.code] : UNKNOWN_PIPELINE_ERROR,
  );

export const createJobPipelineOperations = (
  dependencies: JobPipelineOperationDependencies,
): JobPipelineOperations => {
  const untrustedDependencies = dependencies as unknown;
  if (
    !isRecord(untrustedDependencies) ||
    !isRecord(untrustedDependencies["pipeline"]) ||
    typeof untrustedDependencies["pipeline"]["createManualJob"] !== "function" ||
    typeof untrustedDependencies["pipeline"]["changeStatus"] !== "function" ||
    typeof untrustedDependencies["createJobId"] !== "function" ||
    typeof untrustedDependencies["createStatusEventId"] !== "function" ||
    typeof untrustedDependencies["createUndoTokenId"] !== "function"
  ) {
    throw new TypeError("Job pipeline operations require a complete local persistence port.");
  }

  const createJobCommand = defineCommand<CreateJobInput, CreatedJobDto>(
    "CreateJobCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_MANUAL_JOB_ERROR);

      let title: string;
      try {
        title = requireJobTitle(untrustedInput["title"]);
      } catch {
        return applicationFailure(VALID_JOB_TITLE_ERROR);
      }

      let portInput: Omit<CreateManualJobPortInput, "id" | "createdAt" | "updatedAt">;
      try {
        const datePosted = optionalInputDate(untrustedInput["datePosted"]);
        const validThrough = optionalInputDate(untrustedInput["validThrough"]);
        if (
          datePosted !== null &&
          validThrough !== null &&
          compareDateOnly(datePosted, validThrough) > 0
        ) {
          throw new TypeError("Job dates are inverted.");
        }
        portInput = {
          companyId: optionalInputEntityId("company", untrustedInput["companyId"]),
          title,
          normalizedTitle: null,
          descriptionText: descriptionText(untrustedInput["descriptionText"]),
          employmentType: optionalText(untrustedInput["employmentType"], 128),
          workplaceType: optionalText(untrustedInput["workplaceType"], 128),
          seniority: optionalText(untrustedInput["seniority"], 128),
          locationId: optionalInputEntityId("location", untrustedInput["locationId"]),
          remoteRegion: null,
          datePosted,
          validThrough,
          currentStatusId: null,
          nextActionAt: null,
          archivedAt: null,
        };
      } catch {
        return applicationFailure(VALID_MANUAL_JOB_ERROR);
      }

      try {
        const id = entityId("job", dependencies.createJobId());
        const createdAt = instant(operationContext.initiatedAt);
        return applicationSuccess(
          copyCreatedJob(
            await dependencies.pipeline.createManualJob({
              id,
              ...portInput,
              createdAt,
              updatedAt: createdAt,
            }),
            { id, companyId: portInput.companyId, title, createdAt },
          ),
        );
      } catch (error) {
        return failureFrom<CreatedJobDto>(error);
      }
    },
  );

  const changeStatusCommand = defineCommand<ChangeStatusInput, UndoableStatusChangeDto>(
    "ChangeStatusCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_STATUS_CHANGE_ERROR);

      let parsed: Omit<ChangeStatusPortInput, "eventId" | "occurredAt" | "undoTokenId">;
      try {
        const allowReopen = untrustedInput["allowReopen"];
        if (allowReopen !== undefined && typeof allowReopen !== "boolean") {
          throw new TypeError("Invalid reopen flag.");
        }
        parsed = {
          jobId: entityId("job", untrustedInput["jobId"] as string),
          applicationId: optionalInputEntityId("application", untrustedInput["applicationId"]),
          toStatusId: entityId("status_definition", untrustedInput["toStatusId"] as string),
          note: optionalText(untrustedInput["note"], 200_000),
          allowReopen: allowReopen ?? false,
        };
      } catch {
        return applicationFailure(VALID_STATUS_CHANGE_ERROR);
      }

      try {
        const eventId = entityId("status-event", dependencies.createStatusEventId());
        const undoTokenId = entityId("mutation-undo-token", dependencies.createUndoTokenId());
        const occurredAt = instant(operationContext.initiatedAt);
        const expected: ExpectedStatusEvent = {
          id: eventId,
          jobId: parsed.jobId,
          applicationId: parsed.applicationId,
          toStatusId: parsed.toStatusId,
          occurredAt,
          note: parsed.note,
        };
        return applicationSuccess(
          copyUndoableStatusChange(
            await dependencies.pipeline.changeStatus({
              eventId,
              undoTokenId,
              ...parsed,
              occurredAt,
            }),
            expected,
            undoTokenId,
          ),
        );
      } catch (error) {
        return failureFrom<UndoableStatusChangeDto>(error);
      }
    },
  );

  return Object.freeze({ createJobCommand, changeStatusCommand });
};
