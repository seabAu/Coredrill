import {
  confidence,
  entityId,
  instant,
  jobRequirementCategory,
  type Confidence,
  type EntityId,
  type Instant,
  type JobRequirementCategory,
} from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";

export interface JobRequirementRecord {
  readonly id: EntityId<"job-requirement">;
  readonly jobId: EntityId<"job">;
  readonly category: JobRequirementCategory;
  readonly sourceCategory: JobRequirementCategory;
  readonly normalizedText: string;
  readonly rawText: string;
  readonly provenanceId: EntityId<"provenance">;
  readonly sourcePointer: string;
  readonly sourceExcerpt: string;
  readonly extractionMethod: string;
  readonly confidence: Confidence;
  readonly userConfirmed: boolean;
  readonly sortOrder: number;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface CreateJobRequirementRecordInput {
  readonly id: EntityId<"job-requirement">;
  readonly jobId: EntityId<"job">;
  readonly category: JobRequirementCategory;
  readonly sourceCategory: JobRequirementCategory;
  readonly normalizedText: string;
  readonly rawText: string;
  readonly provenanceId: EntityId<"provenance">;
  readonly sortOrder: number;
  readonly createdAt: Instant;
  readonly userConfirmed: boolean;
}

export interface CorrectJobRequirementRecordInput {
  readonly id: EntityId<"job-requirement">;
  readonly category: JobRequirementCategory;
  readonly expectedRowVersion: number;
  readonly updatedAt: Instant;
}

interface RequirementRow extends QueryRow {
  readonly id: string;
  readonly job_id: string;
  readonly category: string;
  readonly source_category: string;
  readonly normalized_text: string;
  readonly raw_text: string;
  readonly provenance_id: string;
  readonly source_pointer: string;
  readonly source_excerpt: string | null;
  readonly extraction_method: string;
  readonly confidence: number;
  readonly user_confirmed: number;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

const checkedText = (value: unknown, label: string, maximum: number): string => {
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) {
    throw new TypeError(`${label} must be bounded text without NUL characters.`);
  }
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new TypeError(`${label} is required.`);
  return cleaned;
};

const exactText = (value: unknown, label: string, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.includes("\u0000") ||
    value.length > maximum ||
    value.trim().length === 0
  ) {
    throw new TypeError(`${label} must be bounded text without NUL characters.`);
  }
  return value;
};

const nonnegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  return value as number;
};

const positiveInteger = (value: unknown, label: string): number => {
  const checked = nonnegativeInteger(value, label);
  if (checked < 1) throw new TypeError(`${label} must be positive.`);
  return checked;
};

const fromRow = (row: RequirementRow): JobRequirementRecord => {
  if (row.source_excerpt === null || ![0, 1].includes(row.user_confirmed)) {
    throw new TypeError("Stored job requirement provenance is incomplete.");
  }
  return Object.freeze({
    id: entityId("job-requirement", row.id),
    jobId: entityId("job", row.job_id),
    category: jobRequirementCategory(row.category),
    sourceCategory: jobRequirementCategory(row.source_category),
    normalizedText: checkedText(row.normalized_text, "Stored normalized requirement", 4_096),
    rawText: checkedText(row.raw_text, "Stored raw requirement", 16_384),
    provenanceId: entityId("provenance", row.provenance_id),
    sourcePointer: exactText(row.source_pointer, "Stored requirement source pointer", 2_048),
    sourceExcerpt: exactText(row.source_excerpt, "Stored requirement source excerpt", 4_096),
    extractionMethod: checkedText(row.extraction_method, "Stored extraction method", 128),
    confidence: confidence(row.confidence),
    userConfirmed: row.user_confirmed === 1,
    sortOrder: nonnegativeInteger(row.sort_order, "Stored requirement sort order"),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    rowVersion: positiveInteger(row.row_version, "Stored requirement row version"),
  });
};

const selectRows = async (
  session: DatabaseSession,
  filter: { readonly id?: EntityId<"job-requirement">; readonly jobId?: EntityId<"job"> },
): Promise<readonly RequirementRow[]> => {
  const predicate =
    filter.id === undefined ? "job_requirement.job_id = ?" : "job_requirement.id = ?";
  const parameter = filter.id ?? filter.jobId;
  if (parameter === undefined) throw new TypeError("Requirement query requires an identity.");
  return session.query<RequirementRow>(
    sqlStatement(
      `SELECT job_requirement.id, job_requirement.job_id, job_requirement.category,
              job_requirement.source_category, job_requirement.normalized_text,
              job_requirement.raw_text, job_requirement.provenance_id,
              provenance.source_pointer, provenance.source_excerpt,
              provenance.extraction_method, job_requirement.confidence,
              job_requirement.user_confirmed, job_requirement.sort_order,
              job_requirement.created_at, job_requirement.updated_at,
              job_requirement.row_version
       FROM job_requirement
       INNER JOIN provenance ON provenance.id = job_requirement.provenance_id
       WHERE ${predicate}
       ORDER BY job_requirement.sort_order, job_requirement.id`,
      [parameter],
    ),
  );
};

const findOne = async (
  session: DatabaseSession,
  id: EntityId<"job-requirement">,
): Promise<JobRequirementRecord | undefined> => {
  const row = (await selectRows(session, { id }))[0];
  return row === undefined ? undefined : fromRow(row);
};

export class JobRequirementRepository {
  public constructor(private readonly database: DatabasePort) {}

  public async create(input: CreateJobRequirementRecordInput): Promise<JobRequirementRecord> {
    return this.database.transaction((session) => this.createInSession(session, input));
  }

  /** Source and requirement commit together; no orphan provenance on failed acceptance. */
  public async createFromRetainedLine(
    input: CreateJobRequirementRecordInput & {
      readonly snapshotId: string;
      readonly lineIndex: number;
      readonly parseConfidence: number;
    },
  ): Promise<JobRequirementRecord> {
    const snapshotId = entityId("source-snapshot", input.snapshotId);
    const lineIndex = nonnegativeInteger(input.lineIndex, "Source line index");
    const parseConfidence = confidence(input.parseConfidence);
    if (typeof input.userConfirmed !== "boolean" || !input.userConfirmed)
      throw new TypeError("Source acceptance requires explicit confirmation.");
    return this.database.transaction(async (session) => {
      const rows = await session.query(
        sqlStatement(
          `SELECT source_snapshot.raw_text, source_snapshot.captured_at
           FROM source_snapshot
           INNER JOIN job_source ON job_source.id = source_snapshot.job_source_id
           INNER JOIN job ON job.id = job_source.job_id
           WHERE source_snapshot.id = ? AND job.id = ? AND job.archived_at IS NULL`,
          [snapshotId, input.jobId],
        ),
      );
      const source = rows[0];
      const text = source?.["raw_text"];
      const capturedAt = source?.["captured_at"];
      const lines =
        typeof text === "string" && text.length <= 524_288 ? text.split(/\r\n|\n|\r/u) : [];
      const excerpt = lines[lineIndex];
      if (
        typeof text !== "string" ||
        text.length > 524_288 ||
        typeof capturedAt !== "string" ||
        lines.length > 512 ||
        typeof excerpt !== "string" ||
        excerpt.length > 4_096 ||
        excerpt.trim() !== input.rawText
      )
        throw new TypeError("Requirement source line is unavailable or mismatched.");
      const pointer = `/raw_text/lines/${String(lineIndex + 1)}`;
      const duplicate = await session.query(
        sqlStatement(
          `SELECT job_requirement.id FROM job_requirement
         INNER JOIN provenance ON provenance.id = job_requirement.provenance_id
         WHERE job_requirement.job_id = ? AND provenance.source_snapshot_id = ?
           AND provenance.source_pointer = ? LIMIT 1`,
          [input.jobId, snapshotId, pointer],
        ),
      );
      if (duplicate.length !== 0) throw new Error("Requirement source line was already accepted.");
      await session.execute(
        sqlStatement(
          `INSERT INTO provenance(id, source_snapshot_id, extraction_method, source_pointer,
           source_excerpt, confidence, captured_at, license_note, created_at, row_version)
         VALUES (?, ?, 'heuristic', ?, ?, ?, ?, NULL, ?, 1)`,
          [
            input.provenanceId,
            snapshotId,
            pointer,
            excerpt,
            parseConfidence,
            capturedAt,
            input.createdAt,
          ],
        ),
      );
      return this.createInSession(session, input);
    });
  }

  private async createInSession(
    transaction: DatabaseSession,
    input: CreateJobRequirementRecordInput,
  ): Promise<JobRequirementRecord> {
    const id = entityId("job-requirement", input.id);
    const jobId = entityId("job", input.jobId);
    const category = jobRequirementCategory(input.category);
    const sourceCategory = jobRequirementCategory(input.sourceCategory);
    const normalizedText = checkedText(input.normalizedText, "Normalized requirement", 4_096);
    const rawText = checkedText(input.rawText, "Raw requirement", 16_384);
    const provenanceId = entityId("provenance", input.provenanceId);
    const sortOrder = nonnegativeInteger(input.sortOrder, "Requirement sort order");
    const createdAt = instant(input.createdAt);
    if (typeof input.userConfirmed !== "boolean") {
      throw new TypeError("Requirement confirmation state must be explicit.");
    }
    const result = await transaction.execute(
      sqlStatement(
        `INSERT INTO job_requirement(
             id, job_id, category, source_category, normalized_text, raw_text,
             provenance_id, confidence, user_confirmed, sort_order,
             created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, ?, provenance.id, provenance.confidence, ?, ?, ?, ?
           FROM provenance
           INNER JOIN source_snapshot ON source_snapshot.id = provenance.source_snapshot_id
           INNER JOIN job_source ON job_source.id = source_snapshot.job_source_id
           WHERE provenance.id = ? AND provenance.source_excerpt IS NOT NULL
             AND job_source.job_id = ?`,
        [
          id,
          jobId,
          category,
          sourceCategory,
          normalizedText,
          rawText,
          input.userConfirmed ? 1 : 0,
          sortOrder,
          createdAt,
          createdAt,
          provenanceId,
          jobId,
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new Error(
        "Requirement provenance is missing, excerpt-free, or belongs to another job.",
      );
    }
    const stored = await findOne(transaction, id);
    if (stored === undefined) throw new Error("Created job requirement is missing.");
    return stored;
  }

  public async correct(input: CorrectJobRequirementRecordInput): Promise<JobRequirementRecord> {
    const id = entityId("job-requirement", input.id);
    const category = jobRequirementCategory(input.category);
    const expectedRowVersion = positiveInteger(input.expectedRowVersion, "Expected row version");
    const updatedAt = instant(input.updatedAt);
    return this.database.transaction(async (transaction) => {
      const result = await transaction.execute(
        sqlStatement(
          `UPDATE job_requirement
           SET category = ?, user_confirmed = 1, updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND row_version = ?`,
          [category, updatedAt, id, expectedRowVersion],
        ),
      );
      if (result.rowsAffected !== 1) throw new Error("Job requirement correction target is stale.");
      const stored = await findOne(transaction, id);
      if (stored === undefined) throw new Error("Corrected job requirement is missing.");
      return stored;
    });
  }

  public async listForJob(jobId: EntityId<"job">): Promise<readonly JobRequirementRecord[]> {
    return Object.freeze(
      (await selectRows(this.database, { jobId: entityId("job", jobId) })).map(fromRow),
    );
  }
}

export const createJobRequirementRepository = (database: DatabasePort): JobRequirementRepository =>
  new JobRequirementRepository(database);
