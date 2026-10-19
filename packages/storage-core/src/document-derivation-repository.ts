import {
  DocumentDerivationError,
  type DocumentDerivationBasisRequest,
  type DocumentDerivationPort,
} from "@coredrill/application";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";
import { createDocumentRepositories } from "./document-repositories.js";

interface BasisRow extends QueryRow {
  readonly job_id: string;
  readonly application_updated_at: string;
  readonly source_document_id: string;
  readonly kind: string;
  readonly content_ir_json: string;
  readonly content_plain: string;
  readonly content_hash: string;
  readonly source_created_at: string;
}

const readBasis = async (session: DatabaseSession, input: DocumentDerivationBasisRequest) => {
  const rows = await session.query<BasisRow>(
    sqlStatement(
      `SELECT app.job_id, app.updated_at AS application_updated_at,
       source.document_id AS source_document_id, doc.kind, source.content_ir_json,
       source.content_plain, source.content_hash, source.created_at AS source_created_at
     FROM application AS app
     JOIN job ON job.id = app.job_id
     JOIN document_version AS source ON source.id = ?
     JOIN document AS doc ON doc.id = source.document_id
     JOIN document_lineage AS lineage ON lineage.document_id = doc.id
     WHERE app.id = ? AND app.row_version = ? AND app.archived_at IS NULL
       AND app.applied_at IS NULL AND job.archived_at IS NULL
       AND doc.archived_at IS NULL AND doc.kind IN ('resume', 'cover_letter')
       AND lineage.role = 'base'
       AND NOT EXISTS (SELECT 1 FROM submitted_snapshot WHERE application_id = app.id)`,
      [input.sourceVersionId, input.applicationId, input.expectedApplicationRowVersion],
    ),
  );
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) throw new DocumentDerivationError("conflict");
  return row;
};

export const createDocumentDerivationRepository = (
  database: DatabasePort,
): DocumentDerivationPort => ({
  readBasis: async (input) => {
    const row = await readBasis(database, input);
    return Object.freeze({
      jobId: row.job_id,
      sourceVersionId: input.sourceVersionId,
      sourceDocumentId: row.source_document_id,
      kind: row.kind,
      content: JSON.parse(row.content_ir_json) as unknown,
      plainText: row.content_plain,
      contentHash: row.content_hash,
      sourceCreatedAt: row.source_created_at,
    });
  },
  create: (input) =>
    database.transaction(async (transaction) => {
      const basis = await readBasis(transaction, input);
      if (
        basis.job_id !== input.jobId ||
        basis.source_document_id !== input.sourceDocumentId ||
        basis.kind !== input.kind ||
        basis.content_ir_json !== JSON.stringify(input.content) ||
        basis.content_plain !== input.plainText ||
        basis.content_hash !== input.contentHash ||
        basis.source_created_at > input.createdAt ||
        basis.application_updated_at > input.createdAt
      )
        throw new DocumentDerivationError("conflict");
      const repositories = createDocumentRepositories(transaction);
      await repositories.documents.create({
        id: input.documentId,
        title: input.title,
        kind: input.kind,
        source: "user",
        archivedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
      await repositories.lineages.create({
        documentId: input.documentId,
        role: "job_derivative",
        baseDocumentId: input.sourceDocumentId,
        templateDocumentId: null,
        jobId: input.jobId,
        createdAt: input.createdAt,
      });
      await repositories.versions.create({
        id: input.versionId,
        documentId: input.documentId,
        versionNumber: 1,
        contentIrVersion: 1,
        contentIr: input.content,
        contentPlain: input.plainText,
        templateId: null,
        createdBy: "user",
        createdAt: input.createdAt,
        parentVersionId: null,
        contentHash: input.contentHash,
        label: "Exact reusable version copy",
      });
      await transaction.execute(
        sqlStatement(
          "INSERT INTO document_derivation_origin (document_id, first_version_id, source_version_id, created_at) VALUES (?, ?, ?, ?)",
          [input.documentId, input.versionId, input.sourceVersionId, input.createdAt],
        ),
      );
    }),
});
