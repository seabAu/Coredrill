import {
  DocumentPreparationError,
  type ApplicationDocumentPreparationPort,
  type SaveApplicationDocumentPreparationPortInput,
} from "@coredrill/application";
import { entityId, instant, type EntityId } from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";

interface ApplicationPreparationRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly selected_resume_version_id: string | null;
  readonly selected_cover_letter_version_id: string | null;
  readonly row_version: number;
  readonly submitted: number;
}

interface CandidateRow extends QueryRow {
  readonly document_id: string;
  readonly document_version_id: string;
  readonly kind: string;
  readonly title: string;
  readonly version_number: number;
  readonly version_label: string | null;
  readonly lineage_role: string | null;
  readonly related_job_id: string | null;
  readonly latest_version: number;
  readonly has_draft: number;
}

interface AnswerSelectionRow extends QueryRow {
  readonly document_version_id: string;
}

const applicationStatement = (applicationId: EntityId<"application">) =>
  sqlStatement(
    `SELECT application.id, application.job_id,
            application.selected_resume_version_id,
            application.selected_cover_letter_version_id,
            application.row_version,
            EXISTS(
              SELECT 1 FROM submitted_snapshot
              WHERE submitted_snapshot.application_id = application.id
            ) AS submitted
     FROM application WHERE application.id = ? AND application.archived_at IS NULL`,
    [entityId("application", applicationId)],
  );

const candidateStatement = (jobId: string) =>
  sqlStatement(
    `WITH latest_version AS (
       SELECT document_id, max(version_number) AS version_number
       FROM document_version GROUP BY document_id
     )
     SELECT document.id AS document_id,
            document_version.id AS document_version_id,
            document.kind,
            document.title,
            document_version.version_number,
            document_version.label AS version_label,
            document_lineage.role AS lineage_role,
            document_lineage.job_id AS related_job_id,
            CASE WHEN latest_version.version_number = document_version.version_number
              THEN 1 ELSE 0 END AS latest_version,
            EXISTS(
              SELECT 1 FROM document_editor_draft
              WHERE document_editor_draft.document_id = document.id
            ) AS has_draft
     FROM document_version
     INNER JOIN document ON document.id = document_version.document_id
     INNER JOIN latest_version ON latest_version.document_id = document.id
     LEFT JOIN document_lineage ON document_lineage.document_id = document.id
     WHERE document.archived_at IS NULL
       AND document.kind IN ('resume', 'cover_letter', 'application_answer')
       AND coalesce(document_lineage.role, '') <> 'template'
       AND (
         coalesce(document_lineage.role, '') <> 'job_derivative'
         OR document_lineage.job_id = ?
       )
     ORDER BY document.kind, document.title, document_version.version_number DESC,
              document_version.id`,
    [jobId],
  );

const loadFrom = async (
  session: DatabaseSession,
  applicationId: EntityId<"application">,
): Promise<unknown> => {
  const applications = await session.query<ApplicationPreparationRow>(
    applicationStatement(applicationId),
  );
  const application = applications[0];
  if (application === undefined) throw new DocumentPreparationError("not_found");
  if (!Number.isSafeInteger(application.row_version) || application.row_version < 1) {
    throw new DocumentPreparationError("invalid_state");
  }
  const candidates = await session.query<CandidateRow>(candidateStatement(application.job_id));
  const answers = await session.query<AnswerSelectionRow>(
    sqlStatement(
      `SELECT document_version_id FROM application_answer_selection
       WHERE application_id = ? ORDER BY sort_order, document_version_id`,
      [application.id],
    ),
  );
  const mappedCandidates = candidates.map((row) =>
    Object.freeze({
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      kind: row.kind,
      title: row.title,
      versionNumber: row.version_number,
      versionLabel: row.version_label,
      lineageRole: row.lineage_role,
      relatedJobId: row.related_job_id,
      latestVersion: row.latest_version === 1,
      hasDraft: row.has_draft === 1,
    }),
  );
  return Object.freeze({
    applicationId: application.id,
    jobId: application.job_id,
    applicationRowVersion: application.row_version,
    submitted: application.submitted === 1,
    selected: Object.freeze({
      resumeVersionId: application.selected_resume_version_id,
      coverLetterVersionId: application.selected_cover_letter_version_id,
      answerVersionIds: Object.freeze(answers.map((row) => row.document_version_id)),
    }),
    candidates: Object.freeze({
      resumes: Object.freeze(mappedCandidates.filter(({ kind }) => kind === "resume")),
      coverLetters: Object.freeze(mappedCandidates.filter(({ kind }) => kind === "cover_letter")),
      answers: Object.freeze(mappedCandidates.filter(({ kind }) => kind === "application_answer")),
    }),
  });
};

const candidateMap = async (session: DatabaseSession, jobId: string) =>
  new Map(
    (await session.query<CandidateRow>(candidateStatement(jobId))).map((row) => [
      row.document_version_id,
      row,
    ]),
  );

const requireCandidate = (
  candidates: ReadonlyMap<string, CandidateRow>,
  versionId: EntityId<"document-version"> | null,
  expectedKind: "application_answer" | "cover_letter" | "resume",
): void => {
  if (versionId === null) return;
  const candidate = candidates.get(entityId("document-version", versionId));
  if (candidate?.kind !== expectedKind) throw new DocumentPreparationError("invalid_state");
};

export class ApplicationDocumentPreparationRepository implements ApplicationDocumentPreparationPort {
  public constructor(private readonly database: DatabasePort) {}

  public async load(applicationId: EntityId<"application">): Promise<unknown> {
    return loadFrom(this.database, entityId("application", applicationId));
  }

  public async save(input: SaveApplicationDocumentPreparationPortInput): Promise<unknown> {
    const applicationId = entityId("application", input.applicationId);
    const updatedAt = instant(input.updatedAt);
    await this.database.transaction(async (transaction) => {
      const applications = await transaction.query<ApplicationPreparationRow>(
        applicationStatement(applicationId),
      );
      const application = applications[0];
      if (application === undefined) throw new DocumentPreparationError("not_found");
      if (application.submitted === 1) throw new DocumentPreparationError("immutable");
      if (application.row_version !== input.expectedApplicationRowVersion) {
        throw new DocumentPreparationError("conflict");
      }
      const candidates = await candidateMap(transaction, application.job_id);
      requireCandidate(candidates, input.resumeVersionId, "resume");
      requireCandidate(candidates, input.coverLetterVersionId, "cover_letter");
      const answerDocumentIds = new Set<string>();
      for (const answerVersionId of input.answerVersionIds) {
        requireCandidate(candidates, answerVersionId, "application_answer");
        const documentId = candidates.get(answerVersionId)?.document_id;
        if (documentId === undefined || answerDocumentIds.has(documentId)) {
          throw new DocumentPreparationError("invalid_state");
        }
        answerDocumentIds.add(documentId);
      }

      const updated = await transaction.execute(
        sqlStatement(
          `UPDATE application
           SET selected_resume_version_id = ?, selected_cover_letter_version_id = ?,
               updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND row_version = ?`,
          [
            input.resumeVersionId,
            input.coverLetterVersionId,
            updatedAt,
            applicationId,
            input.expectedApplicationRowVersion,
          ],
        ),
      );
      if (updated.rowsAffected !== 1) throw new DocumentPreparationError("conflict");
      await transaction.execute(
        sqlStatement("DELETE FROM application_answer_selection WHERE application_id = ?", [
          applicationId,
        ]),
      );
      for (const [sortOrder, answerVersionId] of input.answerVersionIds.entries()) {
        const inserted = await transaction.execute(
          sqlStatement(
            `INSERT INTO application_answer_selection(
               application_id, document_version_id, sort_order, created_at
             ) VALUES (?, ?, ?, ?)`,
            [applicationId, answerVersionId, sortOrder, updatedAt],
          ),
        );
        if (inserted.rowsAffected !== 1) throw new DocumentPreparationError("conflict");
      }
    });
    return this.load(applicationId);
  }
}

export const createApplicationDocumentPreparationRepository = (
  database: DatabasePort,
): ApplicationDocumentPreparationRepository =>
  new ApplicationDocumentPreparationRepository(database);
