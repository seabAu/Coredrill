import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import {
  defineCommand,
  defineQuery,
  type ApplicationCommand,
  type ApplicationQuery,
} from "./operation.js";
import { applicationFailure, applicationSuccess, type ApplicationError } from "./result.js";

export const APPLICATION_EXPORT_FORMATS = Object.freeze(["docx", "pdf", "plain-text"] as const);
export type ApplicationExportFormat = (typeof APPLICATION_EXPORT_FORMATS)[number];

export type ApplicationSubmissionRole = "answer" | "cover_letter" | "resume";
export type ApplicationSubmissionFormat = "file" | "plain_text";

export interface ApplicationExportArtifactDto {
  readonly contentId: string;
  readonly attachmentPurpose: string;
  readonly format: ApplicationExportFormat;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly logicalName: string;
  readonly recordedAt: Instant;
}

export interface ApplicationSubmissionDocumentDto {
  readonly role: ApplicationSubmissionRole;
  readonly documentId: EntityId<"document">;
  readonly documentVersionId: EntityId<"document-version">;
  readonly title: string;
  readonly versionNumber: number;
  readonly sortOrder: number;
  readonly artifacts: readonly ApplicationExportArtifactDto[];
}

export interface AppliedStatusOptionDto {
  readonly id: EntityId<"status_definition">;
  readonly name: string;
}

export interface SubmittedApplicationItemDto {
  readonly id: EntityId<"submitted-snapshot-item">;
  readonly role: ApplicationSubmissionRole;
  readonly documentVersionId: EntityId<"document-version">;
  readonly submissionFormat: ApplicationSubmissionFormat;
  readonly contentId: string | null;
  readonly attachmentPurpose: string | null;
  readonly logicalName: string | null;
  readonly mediaType: string | null;
  readonly sortOrder: number;
}

export interface SubmittedApplicationSnapshotDto {
  readonly id: EntityId<"submitted-snapshot">;
  readonly appliedAt: Instant;
  readonly channel: string;
  readonly statusId: EntityId<"status_definition">;
  readonly statusEventId: EntityId<"status-event">;
  readonly items: readonly SubmittedApplicationItemDto[];
}

export interface ApplicationSubmissionReviewDto {
  readonly applicationId: EntityId<"application">;
  readonly jobId: EntityId<"job">;
  readonly applicationRowVersion: number;
  readonly currentStatusId: EntityId<"status_definition">;
  readonly currentStatusName: string;
  readonly documents: readonly ApplicationSubmissionDocumentDto[];
  readonly appliedStatuses: readonly AppliedStatusOptionDto[];
  readonly snapshot: SubmittedApplicationSnapshotDto | null;
}

export interface LoadApplicationSubmissionReviewInput {
  readonly applicationId: string;
}

export interface RecordApplicationExportInput {
  readonly applicationId: string;
  readonly expectedApplicationRowVersion: number;
  readonly documentVersionId: string;
  readonly format: ApplicationExportFormat;
  readonly logicalName: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface RecordApplicationExportPortInput {
  readonly applicationId: EntityId<"application">;
  readonly expectedApplicationRowVersion: number;
  readonly documentVersionId: EntityId<"document-version">;
  readonly format: ApplicationExportFormat;
  readonly contentId: string;
  readonly attachmentPurpose: string;
  readonly logicalName: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
  readonly recordedAt: Instant;
}

export interface MarkAppliedItemInput {
  readonly role: ApplicationSubmissionRole;
  readonly documentVersionId: string;
  readonly submissionFormat: ApplicationSubmissionFormat;
  readonly contentId?: string | null;
  readonly attachmentPurpose?: string | null;
}

export interface MarkApplicationAppliedInput {
  readonly applicationId: string;
  readonly expectedApplicationRowVersion: number;
  readonly appliedStatusId: string;
  readonly channel: string;
  readonly confirmed: boolean;
  readonly items: readonly MarkAppliedItemInput[];
}

export interface MarkApplicationAppliedPortItem {
  readonly id: EntityId<"submitted-snapshot-item">;
  readonly role: ApplicationSubmissionRole;
  readonly documentVersionId: EntityId<"document-version">;
  readonly submissionFormat: ApplicationSubmissionFormat;
  readonly contentId: string | null;
  readonly attachmentPurpose: string | null;
  readonly sortOrder: number;
}

export interface MarkApplicationAppliedPortInput {
  readonly applicationId: EntityId<"application">;
  readonly expectedApplicationRowVersion: number;
  readonly appliedStatusId: EntityId<"status_definition">;
  readonly channel: string;
  readonly statusEventId: EntityId<"status-event">;
  readonly snapshotId: EntityId<"submitted-snapshot">;
  readonly appliedAt: Instant;
  readonly items: readonly MarkApplicationAppliedPortItem[];
}

export type ApplicationSubmissionErrorCode =
  "conflict" | "immutable" | "invalid_state" | "not_found" | "unavailable";

export class ApplicationSubmissionError extends Error {
  public override readonly name = "ApplicationSubmissionError";

  public constructor(public readonly code: ApplicationSubmissionErrorCode) {
    super(code);
  }
}

export interface ApplicationSubmissionPort {
  load(applicationId: EntityId<"application">): Promise<unknown>;
  recordExport(input: RecordApplicationExportPortInput): Promise<unknown>;
  markApplied(input: MarkApplicationAppliedPortInput): Promise<unknown>;
}

export interface ApplicationSubmissionOperations {
  readonly loadReviewQuery: ApplicationQuery<
    LoadApplicationSubmissionReviewInput,
    ApplicationSubmissionReviewDto
  >;
  readonly recordExportCommand: ApplicationCommand<
    RecordApplicationExportInput,
    ApplicationSubmissionReviewDto
  >;
  readonly markAppliedCommand: ApplicationCommand<
    MarkApplicationAppliedInput,
    ApplicationSubmissionReviewDto
  >;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PURPOSE_PATTERN = /^export\.(?:docx|pdf|txt)(?:\.[a-f0-9-]{36})?$/u;
const MAX_DOCUMENTS = 130;
const MAX_EXPORT_BYTES = 16 * 1024 * 1024;

const FORMAT_DETAILS: Readonly<
  Record<ApplicationExportFormat, { readonly extension: string; readonly mediaType: string }>
> = Object.freeze({
  docx: Object.freeze({
    extension: ".docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }),
  pdf: Object.freeze({ extension: ".pdf", mediaType: "application/pdf" }),
  "plain-text": Object.freeze({ extension: ".txt", mediaType: "text/plain;charset=utf-8" }),
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.includes("\u0000")
  ) {
    throw new TypeError("Application submission text is invalid.");
  }
  return value;
};

const integer = (value: unknown, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError("Application submission integer is invalid.");
  }
  return value as number;
};

const id = <Kind extends string>(kind: Kind, value: unknown): EntityId<Kind> => {
  if (typeof value !== "string") throw new TypeError("Application submission ID is invalid.");
  return entityId(kind, value);
};

const role = (value: unknown): ApplicationSubmissionRole => {
  if (value !== "resume" && value !== "cover_letter" && value !== "answer") {
    throw new TypeError("Application submission role is invalid.");
  }
  return value;
};

const submissionFormat = (value: unknown): ApplicationSubmissionFormat => {
  if (value !== "file" && value !== "plain_text") {
    throw new TypeError("Application submission format is invalid.");
  }
  return value;
};

const exportFormat = (value: unknown): ApplicationExportFormat => {
  if (!APPLICATION_EXPORT_FORMATS.includes(value as ApplicationExportFormat)) {
    throw new TypeError("Application export format is invalid.");
  }
  return value as ApplicationExportFormat;
};

const sha256 = (value: unknown): string => {
  const parsed = text(value, 64).toLowerCase();
  if (!SHA256_PATTERN.test(parsed)) throw new TypeError("Application export hash is invalid.");
  return parsed;
};

const nullableText = (value: unknown, maximum: number): string | null =>
  value === null ? null : text(value, maximum);

const artifact = (value: unknown): ApplicationExportArtifactDto => {
  if (!isRecord(value)) throw new TypeError("Application export artifact is invalid.");
  const format = exportFormat(value["format"]);
  const details = FORMAT_DETAILS[format];
  const logicalName = text(value["logicalName"], 512);
  const purpose = text(value["attachmentPurpose"], 128);
  if (
    !PURPOSE_PATTERN.test(purpose) ||
    !logicalName.toLowerCase().endsWith(details.extension) ||
    value["mediaType"] !== details.mediaType
  ) {
    throw new TypeError("Application export artifact metadata is inconsistent.");
  }
  return Object.freeze({
    contentId: sha256(value["contentId"]),
    attachmentPurpose: purpose,
    format,
    mediaType: details.mediaType,
    byteLength: integer(value["byteLength"], 1),
    logicalName,
    recordedAt: instant(text(value["recordedAt"], 24)),
  });
};

const document = (value: unknown): ApplicationSubmissionDocumentDto => {
  if (!isRecord(value) || !Array.isArray(value["artifacts"])) {
    throw new TypeError("Application submission document is invalid.");
  }
  const artifacts = value["artifacts"].map(artifact);
  if (
    artifacts.length > 128 ||
    new Set(artifacts.map(({ attachmentPurpose }) => attachmentPurpose)).size !== artifacts.length
  ) {
    throw new TypeError("Application export artifact list is invalid.");
  }
  return Object.freeze({
    role: role(value["role"]),
    documentId: id("document", value["documentId"]),
    documentVersionId: id("document-version", value["documentVersionId"]),
    title: text(value["title"], 512),
    versionNumber: integer(value["versionNumber"], 1),
    sortOrder: integer(value["sortOrder"]),
    artifacts: Object.freeze(artifacts),
  });
};

const submittedItem = (value: unknown): SubmittedApplicationItemDto => {
  if (!isRecord(value)) throw new TypeError("Submitted application item is invalid.");
  const format = submissionFormat(value["submissionFormat"]);
  const contentId = value["contentId"] === null ? null : sha256(value["contentId"]);
  const attachmentPurpose = nullableText(value["attachmentPurpose"], 128);
  const logicalName = nullableText(value["logicalName"], 512);
  const mediaType = nullableText(value["mediaType"], 128);
  if (
    (format === "plain_text" &&
      (contentId !== null ||
        attachmentPurpose !== null ||
        logicalName !== null ||
        mediaType !== null)) ||
    (format === "file" &&
      (contentId === null ||
        attachmentPurpose === null ||
        logicalName === null ||
        mediaType === null))
  ) {
    throw new TypeError("Submitted application item identity is incomplete.");
  }
  return Object.freeze({
    id: id("submitted-snapshot-item", value["id"]),
    role: role(value["role"]),
    documentVersionId: id("document-version", value["documentVersionId"]),
    submissionFormat: format,
    contentId,
    attachmentPurpose,
    logicalName,
    mediaType,
    sortOrder: integer(value["sortOrder"]),
  });
};

export const validateApplicationSubmissionReview = (
  value: unknown,
): ApplicationSubmissionReviewDto => {
  if (
    !isRecord(value) ||
    !Array.isArray(value["documents"]) ||
    !Array.isArray(value["appliedStatuses"])
  ) {
    throw new TypeError("Application submission review is invalid.");
  }
  const documents = value["documents"].map(document);
  if (
    documents.length > MAX_DOCUMENTS ||
    new Set(documents.map(({ documentVersionId }) => documentVersionId)).size !==
      documents.length ||
    documents.filter(({ role: itemRole }) => itemRole === "resume").length > 1 ||
    documents.filter(({ role: itemRole }) => itemRole === "cover_letter").length > 1
  ) {
    throw new TypeError("Application submission document set is invalid.");
  }
  const appliedStatuses = value["appliedStatuses"].map((option) => {
    if (!isRecord(option)) throw new TypeError("Applied status option is invalid.");
    return Object.freeze({
      id: id("status_definition", option["id"]),
      name: text(option["name"], 256),
    });
  });
  if (
    appliedStatuses.length > 128 ||
    new Set(appliedStatuses.map(({ id: statusId }) => statusId)).size !== appliedStatuses.length
  ) {
    throw new TypeError("Applied status options are invalid.");
  }
  let snapshot: SubmittedApplicationSnapshotDto | null = null;
  if (value["snapshot"] !== null) {
    if (!isRecord(value["snapshot"]) || !Array.isArray(value["snapshot"]["items"])) {
      throw new TypeError("Submitted application snapshot is invalid.");
    }
    const items = value["snapshot"]["items"].map(submittedItem);
    snapshot = Object.freeze({
      id: id("submitted-snapshot", value["snapshot"]["id"]),
      appliedAt: instant(text(value["snapshot"]["appliedAt"], 24)),
      channel: text(value["snapshot"]["channel"], 128),
      statusId: id("status_definition", value["snapshot"]["statusId"]),
      statusEventId: id("status-event", value["snapshot"]["statusEventId"]),
      items: Object.freeze(items),
    });
  }
  return Object.freeze({
    applicationId: id("application", value["applicationId"]),
    jobId: id("job", value["jobId"]),
    applicationRowVersion: integer(value["applicationRowVersion"], 1),
    currentStatusId: id("status_definition", value["currentStatusId"]),
    currentStatusName: text(value["currentStatusName"], 256),
    documents: Object.freeze(documents),
    appliedStatuses: Object.freeze(appliedStatuses),
    snapshot,
  });
};

const PORT_ERRORS: Readonly<Record<ApplicationSubmissionErrorCode, ApplicationError>> =
  Object.freeze({
    conflict: Object.freeze({
      code: "conflict",
      message:
        "The application changed before confirmation. Reload and review the exact set again.",
      retryable: true,
    }),
    immutable: Object.freeze({
      code: "conflict",
      message: "This application already has an immutable submitted snapshot.",
      retryable: false,
    }),
    invalid_state: Object.freeze({
      code: "validation",
      message:
        "Review the exact documents, artifacts, Applied status, and channel before confirming.",
      retryable: false,
    }),
    not_found: Object.freeze({
      code: "not_found",
      message: "This local application could not be found.",
      retryable: false,
    }),
    unavailable: Object.freeze({
      code: "unavailable",
      message: "The local application submission record is temporarily unavailable.",
      retryable: true,
    }),
  });

const failureFrom = <Value>(error: unknown) =>
  applicationFailure<Value>(
    error instanceof ApplicationSubmissionError
      ? PORT_ERRORS[error.code]
      : Object.freeze({
          code: "internal" as const,
          message: "The local application submission operation failed safely.",
          retryable: false,
        }),
  );

const checkedLoadId = (input: LoadApplicationSubmissionReviewInput): EntityId<"application"> =>
  entityId("application", input.applicationId);

const checkedRecordInput = async (
  input: RecordApplicationExportInput,
  context: { readonly initiatedAt: Instant },
  dependencies: {
    readonly createId: (kind: "document-export-artifact") => string;
    readonly hashBytes: (bytes: Uint8Array) => Promise<string>;
  },
): Promise<RecordApplicationExportPortInput> => {
  const format = exportFormat(input.format);
  const details = FORMAT_DETAILS[format];
  const logicalName = text(input.logicalName, 512);
  if (
    !logicalName.toLowerCase().endsWith(details.extension) ||
    input.mediaType !== details.mediaType ||
    !(input.bytes instanceof Uint8Array) ||
    input.bytes.byteLength < 1 ||
    input.bytes.byteLength > MAX_EXPORT_BYTES ||
    !Number.isSafeInteger(input.expectedApplicationRowVersion) ||
    input.expectedApplicationRowVersion < 1
  ) {
    throw new TypeError("Application export input is invalid.");
  }
  const bytes = input.bytes.slice();
  const contentId = sha256(await dependencies.hashBytes(bytes));
  const exportId = entityId(
    "document-export-artifact",
    dependencies.createId("document-export-artifact"),
  );
  const purposeFormat = format === "plain-text" ? "txt" : format;
  return Object.freeze({
    applicationId: entityId("application", input.applicationId),
    expectedApplicationRowVersion: input.expectedApplicationRowVersion,
    documentVersionId: entityId("document-version", input.documentVersionId),
    format,
    contentId,
    attachmentPurpose: `export.${purposeFormat}.${exportId}`,
    logicalName,
    mediaType: details.mediaType,
    byteLength: bytes.byteLength,
    bytes,
    recordedAt: instant(context.initiatedAt),
  });
};

const checkedMarkInput = (
  input: MarkApplicationAppliedInput,
  initiatedAt: Instant,
  createId: (kind: "status-event" | "submitted-snapshot" | "submitted-snapshot-item") => string,
): MarkApplicationAppliedPortInput => {
  const rawItems: unknown = input.items;
  if (
    typeof input.confirmed !== "boolean" ||
    !input.confirmed ||
    !Number.isSafeInteger(input.expectedApplicationRowVersion) ||
    input.expectedApplicationRowVersion < 1 ||
    !Array.isArray(rawItems) ||
    rawItems.length < 1 ||
    rawItems.length > MAX_DOCUMENTS
  ) {
    throw new TypeError("Mark Applied confirmation is invalid.");
  }
  const channel = text(input.channel, 128).trim();
  const seenVersions = new Set<string>();
  const itemValues: readonly unknown[] = rawItems;
  const items = itemValues.map((item, sortOrder): MarkApplicationAppliedPortItem => {
    if (!isRecord(item)) throw new TypeError("Mark Applied item is invalid.");
    const itemRole = role(item["role"]);
    const format = submissionFormat(item["submissionFormat"]);
    const documentVersionId = entityId("document-version", text(item["documentVersionId"], 64));
    if (seenVersions.has(documentVersionId)) {
      throw new TypeError("Mark Applied contains a duplicate document version.");
    }
    seenVersions.add(documentVersionId);
    const contentValue = item["contentId"];
    const contentId =
      contentValue === null || contentValue === undefined ? null : sha256(contentValue);
    const attachmentValue = item["attachmentPurpose"];
    const attachmentPurpose =
      attachmentValue === null || attachmentValue === undefined ? null : text(attachmentValue, 128);
    if (
      (format === "plain_text" && (contentId !== null || attachmentPurpose !== null)) ||
      (format === "file" && (contentId === null || !attachmentPurpose?.startsWith("export.")))
    ) {
      throw new TypeError("Mark Applied artifact identity is invalid.");
    }
    return Object.freeze({
      id: entityId("submitted-snapshot-item", createId("submitted-snapshot-item")),
      role: itemRole,
      documentVersionId,
      submissionFormat: format,
      contentId,
      attachmentPurpose,
      sortOrder,
    });
  });
  if (
    items.filter(({ role: itemRole }) => itemRole === "resume").length !== 1 ||
    items.filter(({ role: itemRole }) => itemRole === "cover_letter").length > 1
  ) {
    throw new TypeError("Mark Applied requires one exact resume and at most one cover letter.");
  }
  return Object.freeze({
    applicationId: entityId("application", input.applicationId),
    expectedApplicationRowVersion: input.expectedApplicationRowVersion,
    appliedStatusId: entityId("status_definition", input.appliedStatusId),
    channel,
    statusEventId: entityId("status-event", createId("status-event")),
    snapshotId: entityId("submitted-snapshot", createId("submitted-snapshot")),
    appliedAt: instant(initiatedAt),
    items: Object.freeze(items),
  });
};

export const createApplicationSubmissionOperations = (dependencies: {
  readonly submission: ApplicationSubmissionPort;
  readonly createId: (
    kind:
      | "document-export-artifact"
      | "status-event"
      | "submitted-snapshot"
      | "submitted-snapshot-item",
  ) => string;
  readonly hashBytes: (bytes: Uint8Array) => Promise<string>;
}): ApplicationSubmissionOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.submission) ||
    typeof dependencies.submission.load !== "function" ||
    typeof dependencies.submission.recordExport !== "function" ||
    typeof dependencies.submission.markApplied !== "function" ||
    typeof dependencies.createId !== "function" ||
    typeof dependencies.hashBytes !== "function"
  ) {
    throw new TypeError("Application submission operations require a complete local port.");
  }
  return Object.freeze({
    loadReviewQuery: defineQuery<
      LoadApplicationSubmissionReviewInput,
      ApplicationSubmissionReviewDto
    >("LoadApplicationSubmissionReviewQuery", async (input) => {
      try {
        return applicationSuccess(
          validateApplicationSubmissionReview(
            await dependencies.submission.load(checkedLoadId(input)),
          ),
        );
      } catch (error) {
        if (error instanceof TypeError) {
          return applicationFailure({
            code: "validation",
            message: "The application submission request is invalid.",
            retryable: false,
          });
        }
        return failureFrom(error);
      }
    }),
    recordExportCommand: defineCommand<
      RecordApplicationExportInput,
      ApplicationSubmissionReviewDto
    >("RecordApplicationExportCommand", async (input, context) => {
      try {
        const checked = await checkedRecordInput(input, context, dependencies);
        return applicationSuccess(
          validateApplicationSubmissionReview(await dependencies.submission.recordExport(checked)),
        );
      } catch (error) {
        if (error instanceof TypeError) {
          return applicationFailure({
            code: "validation",
            message: "The generated local export could not be retained safely.",
            retryable: false,
          });
        }
        return failureFrom(error);
      }
    }),
    markAppliedCommand: defineCommand<MarkApplicationAppliedInput, ApplicationSubmissionReviewDto>(
      "MarkApplicationAppliedCommand",
      async (input, context) => {
        try {
          const checked = checkedMarkInput(input, context.initiatedAt, dependencies.createId);
          return applicationSuccess(
            validateApplicationSubmissionReview(await dependencies.submission.markApplied(checked)),
          );
        } catch (error) {
          if (error instanceof TypeError) {
            return applicationFailure({
              code: "validation",
              message: "Review and confirm the exact submitted application set.",
              retryable: false,
            });
          }
          return failureFrom(error);
        }
      },
    ),
  });
};
