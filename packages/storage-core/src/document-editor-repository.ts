import {
  DocumentEditorError,
  type CreateDocumentEditorVersionPortInput,
  type DocumentEditorPort,
  type SaveDocumentEditorDraftPortInput,
} from "@coredrill/application";
import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant, type EntityId } from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";
import { DocumentVersionRepository } from "./document-repositories.js";

interface EditorDocumentRow extends QueryRow {
  readonly id: string;
  readonly title: string;
}

interface EditorVersionRow extends QueryRow {
  readonly id: string;
  readonly version_number: number;
  readonly content_ir_json: string;
  readonly content_plain: string;
  readonly label: string | null;
  readonly created_at: string;
  readonly parent_version_id: string | null;
  readonly content_hash: string;
}

interface EditorDraftRow extends QueryRow {
  readonly base_version_id: string;
  readonly content_ir_json: string;
  readonly content_plain: string;
  readonly updated_at: string;
  readonly row_version: number;
}

const parseStoredJson = (value: string): JsonValue => {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    throw new DocumentEditorError("invalid_state");
  }
};

const serializedContent = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  if (serialized.length === 0 || serialized.length > 4_000_000) {
    throw new DocumentEditorError("invalid_state");
  }
  return serialized;
};

const loadSession = async (session: DatabaseSession, documentId: EntityId<"document">) => {
  const documents = await session.query<EditorDocumentRow>(
    sqlStatement("SELECT id, title FROM document WHERE id = ? AND archived_at IS NULL", [
      entityId("document", documentId),
    ]),
  );
  const document = documents[0];
  if (document === undefined) throw new DocumentEditorError("not_found");
  const versions = await session.query<EditorVersionRow>(
    sqlStatement(
      `SELECT id, version_number, content_ir_json, content_plain, label, created_at,
              parent_version_id, content_hash
       FROM document_version
       WHERE document_id = ?
       ORDER BY version_number, id`,
      [documentId],
    ),
  );
  if (versions.length === 0) throw new DocumentEditorError("invalid_state");
  const drafts = await session.query<EditorDraftRow>(
    sqlStatement(
      `SELECT base_version_id, content_ir_json, content_plain, updated_at, row_version
       FROM document_editor_draft WHERE document_id = ?`,
      [documentId],
    ),
  );
  const draft = drafts[0];
  return Object.freeze({
    documentId: entityId("document", document.id),
    title: document.title,
    versions: Object.freeze(
      versions.map((version) =>
        Object.freeze({
          id: entityId("document-version", version.id),
          versionNumber: version.version_number,
          content: parseStoredJson(version.content_ir_json),
          plainText: version.content_plain,
          label: version.label,
          createdAt: instant(version.created_at),
          parentVersionId:
            version.parent_version_id === null
              ? null
              : entityId("document-version", version.parent_version_id),
          contentHash: version.content_hash,
        }),
      ),
    ),
    draft:
      draft === undefined
        ? null
        : Object.freeze({
            baseVersionId: entityId("document-version", draft.base_version_id),
            content: parseStoredJson(draft.content_ir_json),
            plainText: draft.content_plain,
            updatedAt: instant(draft.updated_at),
            rowVersion: draft.row_version,
          }),
  });
};

export class DocumentEditorRepository implements DocumentEditorPort {
  public constructor(private readonly database: DatabasePort) {}

  public async load(documentId: EntityId<"document">): Promise<unknown> {
    return loadSession(this.database, documentId);
  }

  public async saveDraft(input: SaveDocumentEditorDraftPortInput): Promise<unknown> {
    const contentIrJson = serializedContent(input.content);
    return this.database.transaction(async (transaction) => {
      const result =
        input.expectedRowVersion === null
          ? await transaction.execute(
              sqlStatement(
                `INSERT INTO document_editor_draft(
                   document_id, base_version_id, content_ir_version, content_ir_json,
                   content_plain, updated_at, row_version
                 ) VALUES (?, ?, 1, ?, ?, ?, 1)
                 ON CONFLICT(document_id) DO NOTHING`,
                [
                  input.documentId,
                  input.baseVersionId,
                  contentIrJson,
                  input.plainText,
                  input.updatedAt,
                ],
              ),
            )
          : await transaction.execute(
              sqlStatement(
                `UPDATE document_editor_draft
                 SET content_ir_json = ?, content_plain = ?, updated_at = ?,
                     row_version = row_version + 1
                 WHERE document_id = ? AND base_version_id = ? AND row_version = ?`,
                [
                  contentIrJson,
                  input.plainText,
                  input.updatedAt,
                  input.documentId,
                  input.baseVersionId,
                  input.expectedRowVersion,
                ],
              ),
            );
      if (result.rowsAffected !== 1) throw new DocumentEditorError("conflict");
      return loadSession(transaction, input.documentId);
    });
  }

  public async createVersion(input: CreateDocumentEditorVersionPortInput): Promise<unknown> {
    const contentIrJson = serializedContent(input.content);
    return this.database.transaction(async (transaction) => {
      const drafts = await transaction.query<EditorDraftRow>(
        sqlStatement(
          `SELECT base_version_id, content_ir_json, content_plain, updated_at, row_version
           FROM document_editor_draft WHERE document_id = ?`,
          [input.documentId],
        ),
      );
      const draft = drafts[0];
      if (
        draft?.base_version_id !== input.baseVersionId ||
        draft.row_version !== input.expectedDraftRowVersion ||
        draft.content_ir_json !== contentIrJson ||
        draft.content_plain !== input.plainText
      ) {
        throw new DocumentEditorError("conflict");
      }
      const versions = await transaction.query<{ readonly version_number: number } & QueryRow>(
        sqlStatement(
          "SELECT version_number FROM document_version WHERE id = ? AND document_id = ?",
          [input.baseVersionId, input.documentId],
        ),
      );
      const baseVersionNumber = versions[0]?.version_number;
      if (baseVersionNumber === undefined) throw new DocumentEditorError("conflict");
      await new DocumentVersionRepository(transaction).create({
        id: input.versionId,
        documentId: input.documentId,
        versionNumber: baseVersionNumber + 1,
        contentIrVersion: 1,
        contentIr: parseStoredJson(contentIrJson),
        contentPlain: input.plainText,
        templateId: null,
        createdBy: "user",
        createdAt: input.createdAt,
        parentVersionId: input.baseVersionId,
        contentHash: input.contentHash,
        label: input.label,
      });
      const deleted = await transaction.execute(
        sqlStatement(
          "DELETE FROM document_editor_draft WHERE document_id = ? AND row_version = ?",
          [input.documentId, input.expectedDraftRowVersion],
        ),
      );
      if (deleted.rowsAffected !== 1) throw new DocumentEditorError("conflict");
      const updated = await transaction.execute(
        sqlStatement(
          `UPDATE document SET updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND archived_at IS NULL`,
          [input.createdAt, input.documentId],
        ),
      );
      if (updated.rowsAffected !== 1) throw new DocumentEditorError("not_found");
      return loadSession(transaction, input.documentId);
    });
  }
}

export const createDocumentEditorRepository = (database: DatabasePort): DocumentEditorRepository =>
  new DocumentEditorRepository(database);
