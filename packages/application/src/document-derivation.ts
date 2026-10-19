import { jsonValueSchema, type JsonValue } from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import type { DocumentEditorOperationDependencies } from "./document-editor.js";
import { defineCommand } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface DeriveJobDocumentInput {
  readonly applicationId: string;
  readonly expectedApplicationRowVersion: number;
  readonly sourceVersionId: string;
  readonly title: string;
}

export interface DocumentDerivationBasisRequest {
  readonly applicationId: EntityId<"application">;
  readonly expectedApplicationRowVersion: number;
  readonly sourceVersionId: EntityId<"document-version">;
}

export interface CreateDocumentDerivativePortInput extends DocumentDerivationBasisRequest {
  readonly documentId: EntityId<"document">;
  readonly versionId: EntityId<"document-version">;
  readonly sourceDocumentId: EntityId<"document">;
  readonly jobId: EntityId<"job">;
  readonly title: string;
  readonly kind: "resume" | "cover_letter";
  readonly content: JsonValue;
  readonly plainText: string;
  readonly contentHash: string;
  readonly createdAt: Instant;
}

export class DocumentDerivationError extends Error {
  public override readonly name = "DocumentDerivationError";
  public constructor(public readonly code: "conflict" | "not_found" | "unavailable") {
    super("The job-specific document could not be created locally.");
  }
}

export interface DocumentDerivationPort {
  readBasis(input: DocumentDerivationBasisRequest): Promise<unknown>;
  /** Rechecks the target and source, then atomically creates metadata, lineage, version and origin. */
  create(input: CreateDocumentDerivativePortInput): Promise<void>;
}

export interface DocumentDerivationDependencies {
  readonly documents: DocumentDerivationPort;
  readonly createId: (kind: "document" | "document-version") => string;
  readonly normalizeContent: DocumentEditorOperationDependencies["normalizeContent"];
  readonly hashText: DocumentEditorOperationDependencies["hashText"];
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** An explicit exact-version copy. It does not select, submit, generate or verify evidence. */
export const createDeriveJobDocumentCommand = (dependencies: DocumentDerivationDependencies) =>
  defineCommand<
    DeriveJobDocumentInput,
    {
      readonly documentId: EntityId<"document">;
      readonly versionId: EntityId<"document-version">;
    }
  >("DeriveJobDocumentCommand", async (input, context) => {
    let request: DocumentDerivationBasisRequest;
    let title: string;
    try {
      if (
        !isRecord(input) ||
        Object.keys(input).some(
          (key) =>
            ![
              "applicationId",
              "expectedApplicationRowVersion",
              "sourceVersionId",
              "title",
            ].includes(key),
        ) ||
        !Number.isSafeInteger(input.expectedApplicationRowVersion) ||
        input.expectedApplicationRowVersion < 1 ||
        input.expectedApplicationRowVersion >= Number.MAX_SAFE_INTEGER ||
        typeof input.title !== "string" ||
        input.title.trim().length === 0 ||
        input.title.length > 512 ||
        input.title.includes("\u0000")
      )
        throw new TypeError("Invalid document copy input.");
      request = Object.freeze({
        applicationId: entityId("application", input.applicationId),
        expectedApplicationRowVersion: input.expectedApplicationRowVersion,
        sourceVersionId: entityId("document-version", input.sourceVersionId),
      });
      title = input.title.trim();
    } catch {
      return applicationFailure({
        code: "validation",
        message: "Choose an exact reusable document version and enter a title of 1–512 characters.",
        retryable: false,
      });
    }
    try {
      const basis = await dependencies.documents.readBasis(request);
      if (
        !isRecord(basis) ||
        basis["sourceVersionId"] !== request.sourceVersionId ||
        !["resume", "cover_letter"].includes(basis["kind"] as string)
      )
        throw new DocumentDerivationError("unavailable");
      const rawContent = jsonValueSchema.parse(basis["content"]);
      const normalized = dependencies.normalizeContent(rawContent);
      const content = jsonValueSchema.parse(normalized.content);
      const contentHash = await dependencies.hashText(JSON.stringify(content));
      if (
        !/^[a-f0-9]{64}$/u.test(contentHash) ||
        contentHash !== basis["contentHash"] ||
        JSON.stringify(rawContent) !== JSON.stringify(content) ||
        normalized.plainText !== basis["plainText"] ||
        typeof normalized.plainText !== "string" ||
        normalized.plainText.length > 200_000
      )
        throw new DocumentDerivationError("unavailable");
      const createdAt = instant(context.initiatedAt);
      if (instant(basis["sourceCreatedAt"] as string) > createdAt)
        throw new DocumentDerivationError("conflict");
      const record: CreateDocumentDerivativePortInput = Object.freeze({
        ...request,
        documentId: entityId("document", dependencies.createId("document")),
        versionId: entityId("document-version", dependencies.createId("document-version")),
        sourceDocumentId: entityId("document", basis["sourceDocumentId"] as string),
        jobId: entityId("job", basis["jobId"] as string),
        title,
        kind: basis["kind"] as "resume" | "cover_letter",
        content,
        plainText: normalized.plainText,
        contentHash,
        createdAt,
      });
      await dependencies.documents.create(record);
      return applicationSuccess(
        Object.freeze({ documentId: record.documentId, versionId: record.versionId }),
      );
    } catch (error) {
      const code = error instanceof DocumentDerivationError ? error.code : "unavailable";
      return applicationFailure({
        code,
        message:
          code === "conflict"
            ? "The application or reusable document changed. Reload before making a job-specific copy."
            : "The job-specific copy could not be created locally. Nothing was selected or submitted.",
        retryable: true,
      });
    }
  });
