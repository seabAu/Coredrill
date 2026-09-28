import {
  ApplicationSubmissionError,
  type ApplicationExportFormat,
  type MarkApplicationAppliedPortInput,
  type RecordApplicationExportPortInput,
} from "@coredrill/application";
import { entityId, instant, type EntityId } from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";
import { createDocumentRepositories } from "./document-repositories.js";

interface ApplicationRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly applied_at: string | null;
  readonly channel: string | null;
  readonly current_status_id: string;
  readonly current_status_name: string;
  readonly current_status_category: string;
  readonly selected_resume_version_id: string | null;
  readonly selected_cover_letter_version_id: string | null;
  readonly row_version: number;
  readonly job_status_id: string | null;
  readonly job_row_version: number;
  readonly submitted: number;
}

interface SelectedDocumentRow extends QueryRow {
  readonly role: string;
  readonly document_id: string;
  readonly document_version_id: string;
  readonly title: string;
  readonly version_number: number;
  readonly sort_order: number;
}

interface ExportArtifactRow extends QueryRow {
  readonly document_version_id: string;
  readonly content_id: string;
  readonly purpose: string;
  readonly logical_name: string;
  readonly media_type: string;
  readonly byte_length: number;
  readonly recorded_at: string;
}

interface AppliedStatusRow extends QueryRow {
  readonly id: string;
  readonly name: string;
}

interface SnapshotRow extends QueryRow {
  readonly id: string;
  readonly submitted_at: string;
  readonly channel: string | null;
  readonly status_id: string;
  readonly status_event_id: string;
}

interface SnapshotItemRow extends QueryRow {
  readonly id: string;
  readonly role: string;
  readonly document_version_id: string;
  readonly submission_format: string;
  readonly content_id: string | null;
  readonly attachment_purpose: string | null;
  readonly logical_name: string | null;
  readonly media_type: string | null;
  readonly sort_order: number;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const EXPORT_PURPOSE_PATTERN = /^export\.(?:docx|pdf|txt)(?:\.[a-f0-9-]{36})?$/u;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const FORMAT_BY_MEDIA_TYPE: Readonly<Record<string, ApplicationExportFormat>> = Object.freeze({
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain;charset=utf-8": "plain-text",
});

const applicationStatement = (applicationId: EntityId<"application">) =>
  sqlStatement(
    `SELECT application.id, application.job_id, application.applied_at, application.channel,
            application.current_status_id, status_definition.name AS current_status_name,
            status_definition.category AS current_status_category,
            application.selected_resume_version_id,
            application.selected_cover_letter_version_id, application.row_version,
            job.current_status_id AS job_status_id, job.row_version AS job_row_version,
            EXISTS(
              SELECT 1 FROM submitted_snapshot
              WHERE submitted_snapshot.application_id = application.id
            ) AS submitted
     FROM application
     INNER JOIN job ON job.id = application.job_id
     INNER JOIN status_definition ON status_definition.id = application.current_status_id
     WHERE application.id = ? AND application.archived_at IS NULL AND job.archived_at IS NULL`,
    [entityId("application", applicationId)],
  );

const selectedDocumentsStatement = (applicationId: EntityId<"application">) =>
  sqlStatement(
    `WITH selected AS (
       SELECT 'resume' AS role, application.selected_resume_version_id AS document_version_id,
              0 AS role_order
       FROM application WHERE application.id = ?
       UNION ALL
       SELECT 'cover_letter' AS role, application.selected_cover_letter_version_id,
              1 AS role_order
       FROM application WHERE application.id = ?
       UNION ALL
       SELECT 'answer' AS role, application_answer_selection.document_version_id,
              application_answer_selection.sort_order + 2 AS role_order
       FROM application_answer_selection
       WHERE application_answer_selection.application_id = ?
     )
     SELECT selected.role, document.id AS document_id,
            document_version.id AS document_version_id,
            document.title, document_version.version_number,
            row_number() OVER (ORDER BY selected.role_order, document_version.id) - 1 AS sort_order
     FROM selected
     INNER JOIN document_version ON document_version.id = selected.document_version_id
     INNER JOIN document ON document.id = document_version.document_id
     ORDER BY selected.role_order, document_version.id`,
    [applicationId, applicationId, applicationId],
  );

const applicationFrom = async (
  session: DatabaseSession,
  applicationId: EntityId<"application">,
): Promise<ApplicationRow> => {
  const rows = await session.query<ApplicationRow>(applicationStatement(applicationId));
  const row = rows[0];
  if (row === undefined) throw new ApplicationSubmissionError("not_found");
  if (
    !Number.isSafeInteger(row.row_version) ||
    row.row_version < 1 ||
    !Number.isSafeInteger(row.job_row_version) ||
    row.job_row_version < 1 ||
    (row.submitted !== 0 && row.submitted !== 1)
  ) {
    throw new ApplicationSubmissionError("invalid_state");
  }
  return row;
};

const selectedDocumentsFrom = async (
  session: DatabaseSession,
  applicationId: EntityId<"application">,
): Promise<readonly SelectedDocumentRow[]> =>
  session.query<SelectedDocumentRow>(selectedDocumentsStatement(applicationId));

const formatForArtifact = (row: ExportArtifactRow): ApplicationExportFormat => {
  const format = FORMAT_BY_MEDIA_TYPE[row.media_type];
  if (format === undefined || !EXPORT_PURPOSE_PATTERN.test(row.purpose)) {
    throw new ApplicationSubmissionError("invalid_state");
  }
  const purposeFormat = row.purpose.split(".")[1];
  if (
    (format === "plain-text" && purposeFormat !== "txt") ||
    (format !== "plain-text" && purposeFormat !== format)
  ) {
    throw new ApplicationSubmissionError("invalid_state");
  }
  return format;
};

const loadFrom = async (
  session: DatabaseSession,
  applicationId: EntityId<"application">,
): Promise<unknown> => {
  const application = await applicationFrom(session, applicationId);
  const documents = await selectedDocumentsFrom(session, applicationId);
  const artifacts = await session.query<ExportArtifactRow>(
    sqlStatement(
      `SELECT document_version_attachment.document_version_id,
              document_version_attachment.content_id,
              document_version_attachment.purpose,
              document_version_attachment.logical_name,
              attachment_manifest.media_type, attachment_manifest.byte_length,
              document_version_attachment.created_at AS recorded_at
       FROM document_version_attachment
       INNER JOIN attachment_manifest
         ON attachment_manifest.content_id = document_version_attachment.content_id
       WHERE document_version_attachment.document_version_id IN (
         SELECT application.selected_resume_version_id
         FROM application
         WHERE application.id = ? AND application.selected_resume_version_id IS NOT NULL
         UNION
         SELECT application.selected_cover_letter_version_id
         FROM application
         WHERE application.id = ? AND application.selected_cover_letter_version_id IS NOT NULL
         UNION
         SELECT application_answer_selection.document_version_id
         FROM application_answer_selection
         WHERE application_answer_selection.application_id = ?
       )
         AND document_version_attachment.purpose GLOB 'export.*'
       ORDER BY document_version_attachment.created_at DESC,
                document_version_attachment.logical_name,
                document_version_attachment.content_id`,
      [applicationId, applicationId, applicationId],
    ),
  );
  const appliedStatuses = await session.query<AppliedStatusRow>(
    sqlStatement(
      `SELECT id, name FROM status_definition
       WHERE category = 'applied' AND archived_at IS NULL
       ORDER BY sort_order, name, id`,
    ),
  );
  const snapshotRows = await session.query<SnapshotRow>(
    sqlStatement(
      `SELECT submitted_snapshot.id, submitted_snapshot.submitted_at,
              submitted_snapshot.channel, status_event.to_status_id AS status_id,
              status_event.id AS status_event_id
       FROM submitted_snapshot
       INNER JOIN status_event
         ON status_event.application_id = submitted_snapshot.application_id
        AND status_event.occurred_at = submitted_snapshot.submitted_at
       INNER JOIN status_definition ON status_definition.id = status_event.to_status_id
       WHERE submitted_snapshot.application_id = ?
         AND status_definition.category = 'applied'
       ORDER BY status_event.id
       LIMIT 1`,
      [applicationId],
    ),
  );
  const snapshot = snapshotRows[0];
  let mappedSnapshot: unknown = null;
  if (application.submitted === 1) {
    if (snapshot?.channel === undefined || snapshot.channel === null) {
      throw new ApplicationSubmissionError("invalid_state");
    }
    const items = await session.query<SnapshotItemRow>(
      sqlStatement(
        `SELECT submitted_snapshot_item.id, submitted_snapshot_item.role,
                submitted_snapshot_item.document_version_id,
                submitted_snapshot_item.submission_format,
                submitted_snapshot_item.content_id,
                submitted_snapshot_item.attachment_purpose,
                document_version_attachment.logical_name,
                attachment_manifest.media_type,
                submitted_snapshot_item.sort_order
         FROM submitted_snapshot_item
         LEFT JOIN document_version_attachment
           ON document_version_attachment.document_version_id = submitted_snapshot_item.document_version_id
          AND document_version_attachment.content_id = submitted_snapshot_item.content_id
          AND document_version_attachment.purpose = submitted_snapshot_item.attachment_purpose
         LEFT JOIN attachment_manifest
           ON attachment_manifest.content_id = submitted_snapshot_item.content_id
         WHERE submitted_snapshot_item.submitted_snapshot_id = ?
         ORDER BY submitted_snapshot_item.sort_order, submitted_snapshot_item.id`,
        [snapshot.id],
      ),
    );
    mappedSnapshot = Object.freeze({
      id: snapshot.id,
      appliedAt: snapshot.submitted_at,
      channel: snapshot.channel,
      statusId: snapshot.status_id,
      statusEventId: snapshot.status_event_id,
      items: Object.freeze(
        items.map((item) =>
          Object.freeze({
            id: item.id,
            role: item.role,
            documentVersionId: item.document_version_id,
            submissionFormat: item.submission_format,
            contentId: item.content_id,
            attachmentPurpose: item.attachment_purpose,
            logicalName: item.logical_name,
            mediaType: item.media_type,
            sortOrder: item.sort_order,
          }),
        ),
      ),
    });
  } else if (snapshot !== undefined) {
    throw new ApplicationSubmissionError("invalid_state");
  }
  return Object.freeze({
    applicationId: application.id,
    jobId: application.job_id,
    applicationRowVersion: application.row_version,
    currentStatusId: application.current_status_id,
    currentStatusName: application.current_status_name,
    documents: Object.freeze(
      documents.map((selected) =>
        Object.freeze({
          role: selected.role,
          documentId: selected.document_id,
          documentVersionId: selected.document_version_id,
          title: selected.title,
          versionNumber: selected.version_number,
          sortOrder: selected.sort_order,
          artifacts: Object.freeze(
            artifacts
              .filter(
                ({ document_version_id }) => document_version_id === selected.document_version_id,
              )
              .map((artifact) =>
                Object.freeze({
                  contentId: artifact.content_id,
                  attachmentPurpose: artifact.purpose,
                  format: formatForArtifact(artifact),
                  mediaType: artifact.media_type,
                  byteLength: artifact.byte_length,
                  logicalName: artifact.logical_name,
                  recordedAt: artifact.recorded_at,
                }),
              ),
          ),
        }),
      ),
    ),
    appliedStatuses: Object.freeze(appliedStatuses.map((status) => Object.freeze({ ...status }))),
    snapshot: mappedSnapshot,
  });
};

const assertExportMetadata = (input: RecordApplicationExportPortInput): void => {
  const expectedMediaType = Object.entries(FORMAT_BY_MEDIA_TYPE).find(
    ([, format]) => format === input.format,
  )?.[0];
  if (
    !SHA256_PATTERN.test(input.contentId) ||
    !EXPORT_PURPOSE_PATTERN.test(input.attachmentPurpose) ||
    input.mediaType !== expectedMediaType ||
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.bytes.byteLength !== input.byteLength ||
    input.logicalName.trim().length < 1 ||
    input.logicalName.length > 512 ||
    !IDENTIFIER_PATTERN.test(input.attachmentPurpose)
  ) {
    throw new ApplicationSubmissionError("invalid_state");
  }
};

const assertOne = (rowsAffected: number): void => {
  if (rowsAffected !== 1) throw new ApplicationSubmissionError("conflict");
};

export class ApplicationSubmissionRepository {
  public constructor(private readonly database: DatabasePort) {}

  public async load(applicationId: EntityId<"application">): Promise<unknown> {
    return loadFrom(this.database, entityId("application", applicationId));
  }

  public async recordExport(input: RecordApplicationExportPortInput): Promise<unknown> {
    assertExportMetadata(input);
    const applicationId = entityId("application", input.applicationId);
    await this.database.transaction(async (transaction) => {
      const application = await applicationFrom(transaction, applicationId);
      if (application.submitted === 1) throw new ApplicationSubmissionError("immutable");
      if (application.row_version !== input.expectedApplicationRowVersion) {
        throw new ApplicationSubmissionError("conflict");
      }
      const selected = await selectedDocumentsFrom(transaction, applicationId);
      if (
        !selected.some(({ document_version_id }) => document_version_id === input.documentVersionId)
      ) {
        throw new ApplicationSubmissionError("invalid_state");
      }
      const attachments = createDocumentRepositories(transaction).attachments;
      await attachments.register({
        contentId: input.contentId,
        sha256: input.contentId,
        mediaType: input.mediaType,
        byteLength: input.byteLength,
        createdAt: input.recordedAt,
      });
      await attachments.linkToVersion({
        documentVersionId: input.documentVersionId,
        contentId: input.contentId,
        purpose: input.attachmentPurpose,
        logicalName: input.logicalName,
        sortOrder: 0,
        linkedAt: input.recordedAt,
      });
    });
    return this.load(applicationId);
  }

  public async markApplied(input: MarkApplicationAppliedPortInput): Promise<unknown> {
    const applicationId = entityId("application", input.applicationId);
    await this.database.transaction(async (transaction) => {
      const application = await applicationFrom(transaction, applicationId);
      if (application.submitted === 1) throw new ApplicationSubmissionError("immutable");
      if (application.row_version !== input.expectedApplicationRowVersion) {
        throw new ApplicationSubmissionError("conflict");
      }
      if (
        application.applied_at !== null ||
        application.channel !== null ||
        application.current_status_category === "applied" ||
        application.job_status_id !== application.current_status_id
      ) {
        throw new ApplicationSubmissionError("invalid_state");
      }
      const statuses = await transaction.query<{ readonly id: string } & QueryRow>(
        sqlStatement(
          `SELECT id FROM status_definition
           WHERE id = ? AND category = 'applied' AND archived_at IS NULL`,
          [entityId("status_definition", input.appliedStatusId)],
        ),
      );
      if (statuses.length !== 1) throw new ApplicationSubmissionError("invalid_state");
      const selected = await selectedDocumentsFrom(transaction, applicationId);
      if (
        selected.length !== input.items.length ||
        selected.length < 1 ||
        selected[0]?.role !== "resume"
      ) {
        throw new ApplicationSubmissionError("invalid_state");
      }
      for (const [index, expected] of selected.entries()) {
        const provided = input.items[index];
        if (
          provided?.sortOrder !== expected.sort_order ||
          provided.role !== expected.role ||
          provided.documentVersionId !== expected.document_version_id
        ) {
          throw new ApplicationSubmissionError("invalid_state");
        }
        if (provided.submissionFormat === "file") {
          const artifact = await transaction.query<{ readonly present: number } & QueryRow>(
            sqlStatement(
              `SELECT 1 AS present
               FROM document_version_attachment
               WHERE document_version_id = ? AND content_id = ? AND purpose = ?
                 AND purpose GLOB 'export.*'`,
              [provided.documentVersionId, provided.contentId, provided.attachmentPurpose],
            ),
          );
          if (artifact.length !== 1) throw new ApplicationSubmissionError("invalid_state");
        } else if (provided.contentId !== null || provided.attachmentPurpose !== null) {
          throw new ApplicationSubmissionError("invalid_state");
        }
      }

      const appliedAt = instant(input.appliedAt);
      assertOne(
        (
          await transaction.execute(
            sqlStatement(
              `UPDATE job
               SET current_status_id = ?, updated_at = ?, row_version = row_version + 1
               WHERE id = ? AND current_status_id IS ? AND row_version = ?`,
              [
                input.appliedStatusId,
                appliedAt,
                application.job_id,
                application.current_status_id,
                application.job_row_version,
              ],
            ),
          )
        ).rowsAffected,
      );
      assertOne(
        (
          await transaction.execute(
            sqlStatement(
              `UPDATE application
               SET applied_at = ?, channel = ?, current_status_id = ?, updated_at = ?,
                   row_version = row_version + 1
               WHERE id = ? AND row_version = ?`,
              [
                appliedAt,
                input.channel,
                input.appliedStatusId,
                appliedAt,
                applicationId,
                input.expectedApplicationRowVersion,
              ],
            ),
          )
        ).rowsAffected,
      );
      assertOne(
        (
          await transaction.execute(
            sqlStatement(
              `INSERT INTO status_event(
                 id, job_id, application_id, from_status_id, to_status_id,
                 occurred_at, note, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
              [
                input.statusEventId,
                application.job_id,
                applicationId,
                application.current_status_id,
                input.appliedStatusId,
                appliedAt,
                appliedAt,
              ],
            ),
          )
        ).rowsAffected,
      );
      assertOne(
        (
          await transaction.execute(
            sqlStatement(
              `INSERT INTO submitted_snapshot(id, application_id, submitted_at, channel, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [input.snapshotId, applicationId, appliedAt, input.channel, appliedAt],
            ),
          )
        ).rowsAffected,
      );
      for (const item of input.items) {
        assertOne(
          (
            await transaction.execute(
              sqlStatement(
                `INSERT INTO submitted_snapshot_item(
                   id, submitted_snapshot_id, role, document_version_id, submission_format,
                   content_id, attachment_purpose, sort_order, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  item.id,
                  input.snapshotId,
                  item.role,
                  item.documentVersionId,
                  item.submissionFormat,
                  item.contentId,
                  item.attachmentPurpose,
                  item.sortOrder,
                  appliedAt,
                ],
              ),
            )
          ).rowsAffected,
        );
      }
    });
    return this.load(applicationId);
  }
}

export const createApplicationSubmissionRepository = (
  database: DatabasePort,
): ApplicationSubmissionRepository => new ApplicationSubmissionRepository(database);
