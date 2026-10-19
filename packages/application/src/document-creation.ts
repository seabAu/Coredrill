import { jsonValueSchema, type JsonValue } from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import {
  DocumentEditorError,
  type DocumentEditorOperationDependencies,
} from "./document-editor.js";
import { defineCommand } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface CreateReusableDocumentInput {
  readonly title: string;
  readonly kind: "resume" | "cover_letter";
  readonly initialText: string;
}

export interface CreatedReusableDocumentDto {
  readonly documentId: EntityId<"document">;
  readonly versionId: EntityId<"document-version">;
}

export interface CreateReusableDocumentPortInput extends CreatedReusableDocumentDto {
  readonly title: string;
  readonly kind: "resume" | "cover_letter";
  readonly content: JsonValue;
  readonly plainText: string;
  readonly contentHash: string;
  readonly createdAt: Instant;
}

export interface DocumentCreationPort {
  /** Atomically creates the document, reusable-base lineage, and first immutable version. */
  create(input: CreateReusableDocumentPortInput): Promise<void>;
}

export interface DocumentCreationDependencies {
  readonly documents: DocumentCreationPort;
  readonly createId: (kind: "document" | "document-version") => string;
  readonly hashText: DocumentEditorOperationDependencies["hashText"];
  readonly normalizeContent: DocumentEditorOperationDependencies["normalizeContent"];
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Manual text is content, not imported provenance or verified Career Profile evidence. */
export const createReusableDocumentCommand = (dependencies: DocumentCreationDependencies) =>
  defineCommand<CreateReusableDocumentInput, CreatedReusableDocumentDto>(
    "CreateReusableDocumentCommand",
    async (input, context) => {
      let record: CreateReusableDocumentPortInput;
      try {
        if (
          !isRecord(input) ||
          Object.keys(input).some((key) => !["title", "kind", "initialText"].includes(key)) ||
          typeof input.title !== "string" ||
          input.title.trim().length === 0 ||
          input.title.length > 512 ||
          input.title.includes("\u0000") ||
          !["resume", "cover_letter"].includes(input.kind) ||
          typeof input.initialText !== "string" ||
          input.initialText.length > 100_000 ||
          input.initialText.includes("\u0000")
        ) {
          throw new TypeError("Invalid manual document.");
        }
        const paragraphs = input.initialText.replace(/\r\n?/gu, "\n").split("\n\n");
        const normalized = dependencies.normalizeContent({
          specVersion: 1,
          document: {
            type: "doc",
            content: paragraphs.map((text) =>
              text === ""
                ? { type: "paragraph" }
                : { type: "paragraph", content: [{ type: "text", text }] },
            ),
          },
        });
        const content = jsonValueSchema.parse(normalized.content);
        if (typeof normalized.plainText !== "string" || normalized.plainText.length > 200_000) {
          throw new TypeError("Invalid normalized document.");
        }
        const contentHash = await dependencies.hashText(JSON.stringify(content));
        if (!/^[a-f0-9]{64}$/u.test(contentHash)) throw new TypeError("Invalid content hash.");
        record = Object.freeze({
          documentId: entityId("document", dependencies.createId("document")),
          versionId: entityId("document-version", dependencies.createId("document-version")),
          title: input.title.trim(),
          kind: input.kind,
          content,
          plainText: normalized.plainText,
          contentHash,
          createdAt: instant(context.initiatedAt),
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message:
            "Enter a title and up to 100,000 characters of manual resume or cover-letter text.",
          retryable: false,
        });
      }
      try {
        await dependencies.documents.create(record);
        return applicationSuccess(
          Object.freeze({
            documentId: record.documentId,
            versionId: record.versionId,
          }),
        );
      } catch (error) {
        return applicationFailure({
          code:
            error instanceof DocumentEditorError && error.code === "conflict"
              ? "conflict"
              : "unavailable",
          message: "The document could not be created locally. Your entered text has been kept.",
          retryable: true,
        });
      }
    },
  );
