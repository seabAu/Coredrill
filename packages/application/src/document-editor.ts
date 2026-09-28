import { jsonValueSchema, type JsonValue } from "@coredrill/contracts";
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

export interface DocumentEditorVersionDto {
  readonly id: EntityId<"document-version">;
  readonly versionNumber: number;
  readonly content: JsonValue;
  readonly plainText: string;
  readonly label: string | null;
  readonly createdAt: Instant;
  readonly parentVersionId: EntityId<"document-version"> | null;
  readonly contentHash: string;
}

export interface DocumentEditorDraftDto {
  readonly baseVersionId: EntityId<"document-version">;
  readonly content: JsonValue;
  readonly plainText: string;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface DocumentEditorSessionDto {
  readonly documentId: EntityId<"document">;
  readonly title: string;
  readonly versions: readonly DocumentEditorVersionDto[];
  readonly currentVersion: DocumentEditorVersionDto;
  readonly draft: DocumentEditorDraftDto | null;
}

export interface OpenDocumentEditorInput {
  readonly documentId: string;
}

export interface SaveDocumentEditorDraftInput extends OpenDocumentEditorInput {
  readonly baseVersionId: string;
  readonly content: unknown;
  readonly expectedRowVersion: number | null;
}

export interface CreateDocumentEditorVersionInput extends OpenDocumentEditorInput {
  readonly baseVersionId: string;
  readonly content: unknown;
  readonly expectedDraftRowVersion: number;
  readonly label?: string | null;
}

export interface SaveDocumentEditorDraftPortInput {
  readonly documentId: EntityId<"document">;
  readonly baseVersionId: EntityId<"document-version">;
  readonly content: JsonValue;
  readonly plainText: string;
  readonly expectedRowVersion: number | null;
  readonly updatedAt: Instant;
}

export interface CreateDocumentEditorVersionPortInput {
  readonly documentId: EntityId<"document">;
  readonly baseVersionId: EntityId<"document-version">;
  readonly versionId: EntityId<"document-version">;
  readonly content: JsonValue;
  readonly plainText: string;
  readonly contentHash: string;
  readonly expectedDraftRowVersion: number;
  readonly label: string | null;
  readonly createdAt: Instant;
}

export interface DocumentEditorPort {
  load(documentId: EntityId<"document">): Promise<unknown>;
  saveDraft(input: SaveDocumentEditorDraftPortInput): Promise<unknown>;
  createVersion(input: CreateDocumentEditorVersionPortInput): Promise<unknown>;
}

export type DocumentEditorErrorCode =
  | "busy"
  | "conflict"
  | "invalid_state"
  | "not_found"
  | "permission_denied"
  | "read_only"
  | "unavailable";

export class DocumentEditorError extends Error {
  public override readonly name = "DocumentEditorError";
  public constructor(public readonly code: DocumentEditorErrorCode) {
    super("The local document editor port reported a failure.");
  }
}

export interface DocumentEditorOperationDependencies {
  readonly editor: DocumentEditorPort;
  readonly createId: (kind: "document-version") => string;
  readonly hashText: (value: string) => Promise<string>;
  readonly normalizeContent: (value: unknown) => {
    readonly content: unknown;
    readonly plainText: string;
  };
}

export interface DocumentEditorOperations {
  readonly openDocumentQuery: ApplicationQuery<OpenDocumentEditorInput, DocumentEditorSessionDto>;
  readonly saveDraftCommand: ApplicationCommand<
    SaveDocumentEditorDraftInput,
    DocumentEditorSessionDto
  >;
  readonly createVersionCommand: ApplicationCommand<
    CreateDocumentEditorVersionInput,
    DocumentEditorSessionDto
  >;
}

export interface DocumentEditorComparisonRow {
  readonly lineNumber: number;
  readonly before: string | null;
  readonly after: string | null;
  readonly changed: boolean;
}

export interface DocumentEditorComparison {
  readonly changedLineCount: number;
  readonly rows: readonly DocumentEditorComparisonRow[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_TITLE_LENGTH = 512;
const MAX_LABEL_LENGTH = 256;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value as number;
};

const requiredText = (value: unknown, label: string, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.includes("\u0000")
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
};

const optionalLabel = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, "Document version label", MAX_LABEL_LENGTH).trim();
};

const parseContent = (
  value: unknown,
  normalizeContent: DocumentEditorOperationDependencies["normalizeContent"],
): { readonly content: JsonValue; readonly plainText: string } => {
  try {
    const normalized = normalizeContent(value);
    if (!isRecord(normalized) || typeof normalized.plainText !== "string") {
      throw new TypeError("Document normalizer returned invalid content.");
    }
    return Object.freeze({
      content: jsonValueSchema.parse(normalized.content),
      plainText: normalized.plainText,
    });
  } catch {
    throw new TypeError("Document content is outside the restricted schema.");
  }
};

const parseVersion = (
  value: unknown,
  normalizeContent: DocumentEditorOperationDependencies["normalizeContent"],
): DocumentEditorVersionDto => {
  if (!isRecord(value)) throw new TypeError("Document editor version is invalid.");
  const content = parseContent(value["content"], normalizeContent);
  if (value["plainText"] !== content.plainText) {
    throw new TypeError("Document editor version plain text is invalid.");
  }
  const contentHash = value["contentHash"];
  if (typeof contentHash !== "string" || !SHA256_PATTERN.test(contentHash)) {
    throw new TypeError("Document editor version hash is invalid.");
  }
  return Object.freeze({
    id: entityId("document-version", value["id"] as string),
    versionNumber: positiveInteger(value["versionNumber"], "Document version number"),
    content: content.content,
    plainText: content.plainText,
    label: optionalLabel(value["label"]),
    createdAt: instant(value["createdAt"] as string),
    parentVersionId:
      value["parentVersionId"] === null
        ? null
        : entityId("document-version", value["parentVersionId"] as string),
    contentHash,
  });
};

export const validateDocumentEditorSession = (
  value: unknown,
  normalizeContent: DocumentEditorOperationDependencies["normalizeContent"],
): DocumentEditorSessionDto => {
  if (!isRecord(value) || !Array.isArray(value["versions"]) || value["versions"].length === 0) {
    throw new TypeError("Document editor session is invalid.");
  }
  const versions = Object.freeze(
    value["versions"].map((version) => parseVersion(version, normalizeContent)),
  );
  if (
    versions.some(
      (version, index) =>
        version.versionNumber !== index + 1 ||
        (index === 0) !== (version.parentVersionId === null) ||
        (index > 0 && version.parentVersionId !== versions[index - 1]?.id),
    )
  ) {
    throw new TypeError("Document editor version history is invalid.");
  }
  const currentVersion = versions.at(-1);
  if (currentVersion === undefined) throw new TypeError("Document editor has no current version.");
  const draftValue = value["draft"];
  let draft: DocumentEditorDraftDto | null = null;
  if (draftValue !== null) {
    if (!isRecord(draftValue)) throw new TypeError("Document editor draft is invalid.");
    const content = parseContent(draftValue["content"], normalizeContent);
    if (draftValue["plainText"] !== content.plainText) {
      throw new TypeError("Document editor draft plain text is invalid.");
    }
    const baseVersionId = entityId("document-version", draftValue["baseVersionId"] as string);
    if (baseVersionId !== currentVersion.id) {
      throw new TypeError("Document editor draft does not extend the current version.");
    }
    draft = Object.freeze({
      baseVersionId,
      content: content.content,
      plainText: content.plainText,
      updatedAt: instant(draftValue["updatedAt"] as string),
      rowVersion: positiveInteger(draftValue["rowVersion"], "Document draft row version"),
    });
  }
  return Object.freeze({
    documentId: entityId("document", value["documentId"] as string),
    title: requiredText(value["title"], "Document title", MAX_TITLE_LENGTH),
    versions,
    currentVersion,
    draft,
  });
};

const parseDocumentId = (input: OpenDocumentEditorInput): EntityId<"document"> =>
  entityId("document", input.documentId);

const normalizedContentInput = (
  input: SaveDocumentEditorDraftInput | CreateDocumentEditorVersionInput,
  normalizeContent: DocumentEditorOperationDependencies["normalizeContent"],
): {
  readonly documentId: EntityId<"document">;
  readonly baseVersionId: EntityId<"document-version">;
  readonly content: JsonValue;
  readonly plainText: string;
} => {
  const parsed = parseContent(input.content, normalizeContent);
  return Object.freeze({
    documentId: parseDocumentId(input),
    baseVersionId: entityId("document-version", input.baseVersionId),
    ...parsed,
  });
};

const VALIDATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the document content and version details before saving.",
  retryable: false,
});
const INTERNAL_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local document editor failed safely without replacing your work.",
  retryable: false,
});
const PORT_ERRORS: Readonly<Record<DocumentEditorErrorCode, ApplicationError>> = Object.freeze({
  busy: Object.freeze({
    code: "conflict",
    message: "The local document editor is busy. Retry shortly.",
    retryable: true,
  }),
  conflict: Object.freeze({
    code: "conflict",
    message: "This document changed elsewhere. Reload the latest local draft before saving.",
    retryable: true,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The stored document history is not usable.",
    retryable: false,
  }),
  not_found: Object.freeze({
    code: "not_found",
    message: "This local document is no longer available.",
    retryable: false,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access this local document.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "This local document is read-only.",
    retryable: false,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local document storage is unavailable.",
    retryable: true,
  }),
});

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof DocumentEditorError ? PORT_ERRORS[error.code] : INTERNAL_ERROR,
  );

export const compareDocumentEditorText = (
  before: string,
  after: string,
): DocumentEditorComparison => {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const length = Math.max(beforeLines.length, afterLines.length);
  const rows = Object.freeze(
    Array.from({ length }, (_, index) => {
      const beforeLine = beforeLines[index] ?? null;
      const afterLine = afterLines[index] ?? null;
      return Object.freeze({
        lineNumber: index + 1,
        before: beforeLine,
        after: afterLine,
        changed: beforeLine !== afterLine,
      });
    }),
  );
  return Object.freeze({
    changedLineCount: rows.filter(({ changed }) => changed).length,
    rows,
  });
};

export const createDocumentEditorOperations = (
  dependencies: DocumentEditorOperationDependencies,
): DocumentEditorOperations => {
  if (
    !isRecord(dependencies) ||
    !isRecord(dependencies.editor) ||
    typeof dependencies.editor.load !== "function" ||
    typeof dependencies.editor.saveDraft !== "function" ||
    typeof dependencies.editor.createVersion !== "function" ||
    typeof dependencies.createId !== "function" ||
    typeof dependencies.hashText !== "function" ||
    typeof dependencies.normalizeContent !== "function"
  ) {
    throw new TypeError("Document editor operations require a complete local persistence port.");
  }

  return Object.freeze({
    openDocumentQuery: defineQuery<OpenDocumentEditorInput, DocumentEditorSessionDto>(
      "OpenDocumentEditorQuery",
      async (input) => {
        try {
          return applicationSuccess(
            validateDocumentEditorSession(
              await dependencies.editor.load(parseDocumentId(input)),
              dependencies.normalizeContent,
            ),
          );
        } catch (error) {
          if (error instanceof TypeError) return applicationFailure(VALIDATION_ERROR);
          return failureFrom(error);
        }
      },
    ),
    saveDraftCommand: defineCommand<SaveDocumentEditorDraftInput, DocumentEditorSessionDto>(
      "SaveDocumentEditorDraftCommand",
      async (input, context) => {
        try {
          const content = normalizedContentInput(input, dependencies.normalizeContent);
          if (
            input.expectedRowVersion !== null &&
            (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 1)
          ) {
            return applicationFailure(VALIDATION_ERROR);
          }
          return applicationSuccess(
            validateDocumentEditorSession(
              await dependencies.editor.saveDraft({
                ...content,
                expectedRowVersion: input.expectedRowVersion,
                updatedAt: instant(context.initiatedAt),
              }),
              dependencies.normalizeContent,
            ),
          );
        } catch (error) {
          if (error instanceof TypeError) return applicationFailure(VALIDATION_ERROR);
          return failureFrom(error);
        }
      },
    ),
    createVersionCommand: defineCommand<CreateDocumentEditorVersionInput, DocumentEditorSessionDto>(
      "CreateDocumentEditorVersionCommand",
      async (input, context) => {
        try {
          const content = normalizedContentInput(input, dependencies.normalizeContent);
          const expectedDraftRowVersion = positiveInteger(
            input.expectedDraftRowVersion,
            "Expected document draft row version",
          );
          const contentHash = await dependencies.hashText(JSON.stringify(content.content));
          if (!SHA256_PATTERN.test(contentHash)) {
            throw new TypeError("Document hash dependency returned invalid output.");
          }
          return applicationSuccess(
            validateDocumentEditorSession(
              await dependencies.editor.createVersion({
                ...content,
                versionId: entityId("document-version", dependencies.createId("document-version")),
                contentHash,
                expectedDraftRowVersion,
                label: optionalLabel(input.label),
                createdAt: instant(context.initiatedAt),
              }),
              dependencies.normalizeContent,
            ),
          );
        } catch (error) {
          if (error instanceof TypeError) return applicationFailure(VALIDATION_ERROR);
          return failureFrom(error);
        }
      },
    ),
  });
};
