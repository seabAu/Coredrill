import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import { defineQuery, type ApplicationQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export const DOCUMENTS_WORKSPACE_VIEW_IDS = [
  "all",
  "resumes",
  "cover_letters",
  "answers",
  "templates",
  "submitted",
] as const;

export type DocumentsWorkspaceViewId = (typeof DOCUMENTS_WORKSPACE_VIEW_IDS)[number];
export type DocumentWorkspaceKind =
  "application_answer" | "cover_letter" | "follow_up" | "other" | "resume";
export type DocumentWorkspaceLineageRole = "base" | "job_derivative" | "template";
export type DocumentWorkspaceExportStatus = "exported" | "not_exported";
export type DocumentWorkspaceClaimStatus = "not_evaluated";

export interface DocumentWorkspaceVersionDto {
  readonly id: EntityId<"document-version">;
  readonly versionNumber: number;
  readonly label: string | null;
}

export interface DocumentWorkspaceJobDto {
  readonly id: EntityId<"job">;
  readonly title: string;
  readonly companyName: string | null;
}

export interface DocumentWorkspaceSubmissionDto {
  readonly applicationId: EntityId<"application">;
  readonly versionId: EntityId<"document-version">;
  readonly versionNumber: number;
  readonly submittedAt: Instant;
  readonly channel: string | null;
  readonly role: "answer" | "cover_letter" | "other" | "resume";
  readonly format: "file" | "plain_text";
}

export interface DocumentWorkspaceItemDto {
  readonly id: EntityId<"document">;
  readonly kind: DocumentWorkspaceKind;
  readonly title: string;
  readonly lineageRole: DocumentWorkspaceLineageRole | null;
  readonly baseDocumentId: EntityId<"document"> | null;
  readonly baseDocumentTitle: string | null;
  readonly templateDocumentId: EntityId<"document"> | null;
  readonly templateDocumentTitle: string | null;
  readonly relatedJob: DocumentWorkspaceJobDto | null;
  readonly lastEditedAt: Instant;
  readonly searchText: string;
  readonly latestVersion: DocumentWorkspaceVersionDto | null;
  readonly exportStatus: DocumentWorkspaceExportStatus;
  readonly claimStatus: DocumentWorkspaceClaimStatus;
  readonly submission: DocumentWorkspaceSubmissionDto | null;
}

export interface DocumentsWorkspacePort {
  listDocuments(): Promise<unknown>;
}

export interface DocumentsWorkspaceOperations {
  readonly listDocumentsQuery: ApplicationQuery<void, readonly DocumentWorkspaceItemDto[]>;
}

const MAX_DOCUMENTS = 5_000;
const MAX_TITLE_LENGTH = 1_024;
const MAX_LABEL_LENGTH = 512;
const MAX_SEARCH_TEXT_LENGTH = 2_200_001;

const hasForbiddenControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x08 || (codePoint >= 0x0b && codePoint <= 0x1f) || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
};

const requiredText = (value: unknown, label: string, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    hasForbiddenControlCharacter(value)
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
};

const optionalText = (value: unknown, label: string, maximum: number): string | null => {
  if (value === null) return null;
  return requiredText(value, label, maximum);
};

const boundedSearchText = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length > MAX_SEARCH_TEXT_LENGTH ||
    hasForbiddenControlCharacter(value)
  ) {
    throw new TypeError("Document search text is invalid.");
  }
  return value;
};

const record = (value: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const parsedEntityId = <Kind extends string>(kind: Kind, value: unknown): EntityId<Kind> => {
  if (typeof value !== "string") throw new TypeError(`${kind} ID is invalid.`);
  return entityId(kind, value);
};

const parsedInstant = (value: unknown): Instant => {
  if (typeof value !== "string") throw new TypeError("Timestamp is invalid.");
  return instant(value);
};

const nullableEntityId = <Kind extends string>(
  kind: Kind,
  value: unknown,
): EntityId<Kind> | null => (value === null ? null : parsedEntityId(kind, value));

const validateVersion = (value: unknown): DocumentWorkspaceVersionDto | null => {
  if (value === null) return null;
  const candidate = record(value, "Document version");
  const versionNumber = candidate["versionNumber"];
  if (!Number.isSafeInteger(versionNumber) || (versionNumber as number) < 1) {
    throw new TypeError("Document version number is invalid.");
  }
  return Object.freeze({
    id: parsedEntityId("document-version", candidate["id"]),
    versionNumber: versionNumber as number,
    label: optionalText(candidate["label"], "Document version label", MAX_LABEL_LENGTH),
  });
};

const validateJob = (value: unknown): DocumentWorkspaceJobDto | null => {
  if (value === null) return null;
  const candidate = record(value, "Related job");
  return Object.freeze({
    id: parsedEntityId("job", candidate["id"]),
    title: requiredText(candidate["title"], "Related job title", MAX_TITLE_LENGTH),
    companyName: optionalText(candidate["companyName"], "Related company name", MAX_LABEL_LENGTH),
  });
};

const validateSubmission = (value: unknown): DocumentWorkspaceSubmissionDto | null => {
  if (value === null) return null;
  const candidate = record(value, "Document submission");
  const role = candidate["role"];
  const format = candidate["format"];
  const versionNumber = candidate["versionNumber"];
  if (!["answer", "cover_letter", "other", "resume"].includes(role as string)) {
    throw new TypeError("Document submission role is invalid.");
  }
  if (format !== "file" && format !== "plain_text") {
    throw new TypeError("Document submission format is invalid.");
  }
  if (!Number.isSafeInteger(versionNumber) || (versionNumber as number) < 1) {
    throw new TypeError("Submitted document version number is invalid.");
  }
  return Object.freeze({
    applicationId: parsedEntityId("application", candidate["applicationId"]),
    versionId: parsedEntityId("document-version", candidate["versionId"]),
    versionNumber: versionNumber as number,
    submittedAt: parsedInstant(candidate["submittedAt"]),
    channel: optionalText(candidate["channel"], "Document submission channel", 128),
    role: role as DocumentWorkspaceSubmissionDto["role"],
    format,
  });
};

export const validateDocumentWorkspaceItems = (
  value: unknown,
): readonly DocumentWorkspaceItemDto[] => {
  if (!Array.isArray(value) || value.length > MAX_DOCUMENTS) {
    throw new TypeError("Documents workspace result is invalid or unbounded.");
  }
  return Object.freeze(
    value.map((item) => {
      const candidate = record(item, "Documents workspace item");
      const kind = candidate["kind"];
      const lineageRole = candidate["lineageRole"];
      const exportStatus = candidate["exportStatus"];
      const claimStatus = candidate["claimStatus"];
      if (
        !["application_answer", "cover_letter", "follow_up", "other", "resume"].includes(
          kind as string,
        )
      ) {
        throw new TypeError("Document kind is invalid.");
      }
      if (
        lineageRole !== null &&
        !["base", "job_derivative", "template"].includes(lineageRole as string)
      ) {
        throw new TypeError("Document lineage role is invalid.");
      }
      if (exportStatus !== "exported" && exportStatus !== "not_exported") {
        throw new TypeError("Document export status is invalid.");
      }
      if (claimStatus !== "not_evaluated") {
        throw new TypeError("Document claim status is invalid.");
      }
      return Object.freeze({
        id: parsedEntityId("document", candidate["id"]),
        kind: kind as DocumentWorkspaceKind,
        title: requiredText(candidate["title"], "Document title", MAX_LABEL_LENGTH),
        lineageRole: lineageRole as DocumentWorkspaceLineageRole | null,
        baseDocumentId: nullableEntityId("document", candidate["baseDocumentId"]),
        baseDocumentTitle: optionalText(
          candidate["baseDocumentTitle"],
          "Base document title",
          MAX_LABEL_LENGTH,
        ),
        templateDocumentId: nullableEntityId("document", candidate["templateDocumentId"]),
        templateDocumentTitle: optionalText(
          candidate["templateDocumentTitle"],
          "Template document title",
          MAX_LABEL_LENGTH,
        ),
        relatedJob: validateJob(candidate["relatedJob"]),
        lastEditedAt: parsedInstant(candidate["lastEditedAt"]),
        searchText: boundedSearchText(candidate["searchText"]),
        latestVersion: validateVersion(candidate["latestVersion"]),
        exportStatus,
        claimStatus,
        submission: validateSubmission(candidate["submission"]),
      });
    }),
  );
};

export const createDocumentsWorkspaceOperations = (dependencies: {
  readonly documents: DocumentsWorkspacePort;
}): DocumentsWorkspaceOperations =>
  Object.freeze({
    listDocumentsQuery: defineQuery("ListDocumentsWorkspaceQuery", async () => {
      try {
        return applicationSuccess(
          validateDocumentWorkspaceItems(await dependencies.documents.listDocuments()),
        );
      } catch (error) {
        return applicationFailure({
          code: error instanceof TypeError ? "internal" : "unavailable",
          message:
            error instanceof TypeError
              ? "Stored document metadata did not match the reviewed local contract."
              : "Local documents are temporarily unavailable.",
          retryable: !(error instanceof TypeError),
        });
      }
    }),
  });
