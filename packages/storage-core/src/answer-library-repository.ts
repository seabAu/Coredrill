import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import { createDocumentRepositories } from "./document-repositories.js";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";

export const ANSWER_SENSITIVITIES = Object.freeze(["standard", "sensitive", "restricted"] as const);
export type AnswerSensitivity = (typeof ANSWER_SENSITIVITIES)[number];

export const ANSWER_SOURCE_KINDS = Object.freeze(["manual", "application"] as const);
export type AnswerSourceKind = (typeof ANSWER_SOURCE_KINDS)[number];

export interface AnswerLibraryVersionRecord {
  readonly id: EntityId<"document-version">;
  readonly versionNumber: number;
  readonly question: string;
  readonly answer: string;
  readonly sensitivity: AnswerSensitivity;
  readonly createdAt: Instant;
  readonly parentVersionId: EntityId<"document-version"> | null;
  readonly contentHash: string;
}

export interface AnswerLibraryEntryRecord {
  readonly id: EntityId<"document">;
  readonly sourceKind: AnswerSourceKind;
  readonly sourceJobId: EntityId<"job"> | null;
  readonly sourceContext: string | null;
  readonly lastUsedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
  readonly currentVersion: AnswerLibraryVersionRecord;
  readonly versions: readonly AnswerLibraryVersionRecord[];
}

interface AnswerContentInput {
  readonly question: string;
  readonly answer: string;
  readonly sensitivity: AnswerSensitivity;
  readonly contentIr: JsonValue;
  readonly contentHash: string;
}

export interface CreateAnswerLibraryEntryRecordInput extends AnswerContentInput {
  readonly id: EntityId<"document">;
  readonly versionId: EntityId<"document-version">;
  readonly sourceKind: AnswerSourceKind;
  readonly sourceJobId: EntityId<"job"> | null;
  readonly sourceContext: string | null;
  readonly createdAt: Instant;
}

export interface UpdateAnswerLibraryEntryRecordInput extends AnswerContentInput {
  readonly id: EntityId<"document">;
  readonly versionId: EntityId<"document-version">;
  readonly expectedRowVersion: number;
  readonly updatedAt: Instant;
}

interface AnswerRow extends QueryRow {
  readonly document_id: string;
  readonly source_kind: string;
  readonly source_job_id: string | null;
  readonly source_context: string | null;
  readonly last_used_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
  readonly document_version_id: string;
  readonly version_number: number;
  readonly question: string;
  readonly content_plain: string;
  readonly sensitivity: string;
  readonly version_created_at: string;
  readonly parent_version_id: string | null;
  readonly content_hash: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const requiredText = (value: unknown, label: string, maximum: number): string => {
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) {
    throw new TypeError(`${label} must be bounded text without NUL characters.`);
  }
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new TypeError(`${label} is required.`);
  return cleaned;
};

const optionalText = (value: unknown, label: string, maximum: number): string | null =>
  value === null ? null : requiredText(value, label, maximum);

const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value as number;
};

const sensitivity = (value: unknown): AnswerSensitivity => {
  if (!ANSWER_SENSITIVITIES.includes(value as AnswerSensitivity)) {
    throw new TypeError("Answer sensitivity must use a reviewed classification.");
  }
  return value as AnswerSensitivity;
};

const sourceKind = (value: unknown): AnswerSourceKind => {
  if (!ANSWER_SOURCE_KINDS.includes(value as AnswerSourceKind)) {
    throw new TypeError("Answer source must use a reviewed provenance kind.");
  }
  return value as AnswerSourceKind;
};

const contentHash = (value: unknown): string => {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new TypeError("Answer content hash must be a lowercase SHA-256.");
  }
  return value;
};

const validateSource = (
  kind: AnswerSourceKind,
  jobId: EntityId<"job"> | null,
): EntityId<"job"> | null => {
  if ((kind === "manual") !== (jobId === null)) {
    throw new TypeError(
      "Manual answers cannot name a source job; application answers require one.",
    );
  }
  return jobId === null ? null : entityId("job", jobId);
};

const versionFromRow = (row: AnswerRow): AnswerLibraryVersionRecord =>
  Object.freeze({
    id: entityId("document-version", row.document_version_id),
    versionNumber: positiveInteger(row.version_number, "Stored answer version number"),
    question: requiredText(row.question, "Stored answer question", 512),
    answer: requiredText(row.content_plain, "Stored answer", 200_000),
    sensitivity: sensitivity(row.sensitivity),
    createdAt: instant(row.version_created_at),
    parentVersionId:
      row.parent_version_id === null ? null : entityId("document-version", row.parent_version_id),
    contentHash: contentHash(row.content_hash),
  });

const combineRows = (rows: readonly AnswerRow[]): readonly AnswerLibraryEntryRecord[] => {
  const grouped = new Map<string, AnswerRow[]>();
  for (const row of rows) {
    const values = grouped.get(row.document_id) ?? [];
    values.push(row);
    grouped.set(row.document_id, values);
  }
  return Object.freeze(
    [...grouped.values()].map((values) => {
      const first = values[0];
      if (first === undefined) throw new Error("Stored answer group is empty.");
      const versions = Object.freeze(values.map(versionFromRow));
      const currentVersion = versions.at(-1);
      if (currentVersion === undefined) throw new Error("Stored answer has no version.");
      return Object.freeze({
        id: entityId("document", first.document_id),
        sourceKind: sourceKind(first.source_kind),
        sourceJobId: first.source_job_id === null ? null : entityId("job", first.source_job_id),
        sourceContext: optionalText(first.source_context, "Stored answer source context", 2_000),
        lastUsedAt: first.last_used_at === null ? null : instant(first.last_used_at),
        createdAt: instant(first.created_at),
        updatedAt: instant(first.updated_at),
        rowVersion: positiveInteger(first.row_version, "Stored answer row version"),
        currentVersion,
        versions,
      });
    }),
  );
};

const listRows = async (session: DatabaseSession, documentId?: EntityId<"document">) =>
  session.query<AnswerRow>(
    sqlStatement(
      `SELECT answer_library_entry.document_id, answer_library_entry.source_kind,
              answer_library_entry.source_job_id, answer_library_entry.source_context,
              answer_library_entry.last_used_at, answer_library_entry.created_at,
              document.updated_at, document.row_version,
              document_version.id AS document_version_id, document_version.version_number,
              answer_library_version.question, document_version.content_plain,
              answer_library_version.sensitivity,
              document_version.created_at AS version_created_at,
              document_version.parent_version_id, document_version.content_hash
       FROM answer_library_entry
       INNER JOIN document ON document.id = answer_library_entry.document_id
       INNER JOIN document_version ON document_version.document_id = document.id
       INNER JOIN answer_library_version
         ON answer_library_version.document_version_id = document_version.id
       WHERE document.archived_at IS NULL${documentId === undefined ? "" : " AND document.id = ?"}
       ORDER BY document.updated_at DESC, document.id, document_version.version_number`,
      documentId === undefined ? [] : [entityId("document", documentId)],
    ),
  );

const findOne = async (
  session: DatabaseSession,
  id: EntityId<"document">,
): Promise<AnswerLibraryEntryRecord | undefined> => combineRows(await listRows(session, id))[0];

const insertVersionMetadata = async (
  session: DatabaseSession,
  versionId: EntityId<"document-version">,
  question: string,
  answerSensitivity: AnswerSensitivity,
): Promise<void> => {
  const result = await session.execute(
    sqlStatement(
      "INSERT INTO answer_library_version(document_version_id, question, sensitivity) VALUES (?, ?, ?)",
      [
        entityId("document-version", versionId),
        requiredText(question, "Answer question", 512),
        sensitivity(answerSensitivity),
      ],
    ),
  );
  if (result.rowsAffected !== 1) throw new Error("Answer version metadata insert failed.");
};

export class AnswerLibraryRepository {
  public constructor(private readonly database: DatabasePort) {}

  public async create(
    input: CreateAnswerLibraryEntryRecordInput,
  ): Promise<AnswerLibraryEntryRecord> {
    const kind = sourceKind(input.sourceKind);
    const jobId = validateSource(kind, input.sourceJobId);
    const question = requiredText(input.question, "Answer question", 512);
    const answer = requiredText(input.answer, "Answer", 200_000);
    const createdAt = instant(input.createdAt);
    return this.database.transaction(async (transaction) => {
      const documents = createDocumentRepositories(transaction);
      await documents.documents.create({
        id: entityId("document", input.id),
        kind: "application_answer",
        title: question,
        source: "answer_library",
        archivedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
      const entry = await transaction.execute(
        sqlStatement(
          `INSERT INTO answer_library_entry(
             document_id, source_kind, source_job_id, source_context, last_used_at, created_at
           ) VALUES (?, ?, ?, ?, NULL, ?)`,
          [
            input.id,
            kind,
            jobId,
            optionalText(input.sourceContext, "Answer source context", 2_000),
            createdAt,
          ],
        ),
      );
      if (entry.rowsAffected !== 1) throw new Error("Answer library entry insert failed.");
      await documents.versions.create({
        id: entityId("document-version", input.versionId),
        documentId: input.id,
        versionNumber: 1,
        contentIrVersion: 1,
        contentIr: input.contentIr,
        contentPlain: answer,
        templateId: null,
        createdBy: "user",
        createdAt,
        parentVersionId: null,
        contentHash: contentHash(input.contentHash),
        label: "Initial answer",
      });
      await insertVersionMetadata(transaction, input.versionId, question, input.sensitivity);
      const stored = await findOne(transaction, input.id);
      if (stored === undefined) throw new Error("Created answer library entry is missing.");
      return stored;
    });
  }

  public async update(
    input: UpdateAnswerLibraryEntryRecordInput,
  ): Promise<AnswerLibraryEntryRecord> {
    const question = requiredText(input.question, "Answer question", 512);
    const answer = requiredText(input.answer, "Answer", 200_000);
    const expectedRowVersion = positiveInteger(input.expectedRowVersion, "Expected row version");
    const updatedAt = instant(input.updatedAt);
    return this.database.transaction(async (transaction) => {
      const existing = await findOne(transaction, input.id);
      if (existing === undefined) throw new Error("Answer library update target is missing.");
      if (existing.rowVersion !== expectedRowVersion) {
        throw new Error("Answer library update target is stale.");
      }
      await createDocumentRepositories(transaction).versions.create({
        id: entityId("document-version", input.versionId),
        documentId: existing.id,
        versionNumber: existing.currentVersion.versionNumber + 1,
        contentIrVersion: 1,
        contentIr: input.contentIr,
        contentPlain: answer,
        templateId: null,
        createdBy: "user",
        createdAt: updatedAt,
        parentVersionId: existing.currentVersion.id,
        contentHash: contentHash(input.contentHash),
        label: `Answer version ${String(existing.currentVersion.versionNumber + 1)}`,
      });
      await insertVersionMetadata(transaction, input.versionId, question, input.sensitivity);
      const result = await transaction.execute(
        sqlStatement(
          "UPDATE document SET title = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND archived_at IS NULL AND row_version = ?",
          [question, updatedAt, existing.id, expectedRowVersion],
        ),
      );
      if (result.rowsAffected !== 1) throw new Error("Answer library update target is stale.");
      const stored = await findOne(transaction, existing.id);
      if (stored === undefined) throw new Error("Updated answer library entry is missing.");
      return stored;
    });
  }

  public async markUsed(
    id: EntityId<"document">,
    expectedRowVersion: number,
    usedAt: Instant,
  ): Promise<AnswerLibraryEntryRecord> {
    const checkedVersion = positiveInteger(expectedRowVersion, "Expected row version");
    const checkedUsedAt = instant(usedAt);
    return this.database.transaction(async (transaction) => {
      const entry = await transaction.execute(
        sqlStatement("UPDATE answer_library_entry SET last_used_at = ? WHERE document_id = ?", [
          checkedUsedAt,
          entityId("document", id),
        ]),
      );
      if (entry.rowsAffected !== 1) throw new Error("Answer library use target is missing.");
      const document = await transaction.execute(
        sqlStatement(
          "UPDATE document SET updated_at = ?, row_version = row_version + 1 WHERE id = ? AND archived_at IS NULL AND row_version = ?",
          [checkedUsedAt, id, checkedVersion],
        ),
      );
      if (document.rowsAffected !== 1) throw new Error("Answer library use target is stale.");
      const stored = await findOne(transaction, id);
      if (stored === undefined) throw new Error("Used answer library entry is missing.");
      return stored;
    });
  }

  public async listActive(): Promise<readonly AnswerLibraryEntryRecord[]> {
    return combineRows(await listRows(this.database));
  }
}

export const createAnswerLibraryRepository = (database: DatabasePort): AnswerLibraryRepository =>
  new AnswerLibraryRepository(database);
