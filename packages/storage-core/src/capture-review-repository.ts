import { entityId, instant, type EntityId } from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
} from "./database-port.js";

export type CaptureReviewState = "pending" | "snoozed" | "discarded" | "resolved";
export type CaptureReviewResolutionKind = "save_new" | "merge_existing";

export interface CaptureReviewItemRecord {
  readonly envelopeId: EntityId<"capture-envelope">;
  readonly state: CaptureReviewState;
  readonly snoozedUntil: string | null;
  readonly resolutionKind: CaptureReviewResolutionKind | null;
  readonly resolvedJobId: EntityId<"job"> | null;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CaptureReviewDiscardUndoRecord {
  readonly id: EntityId<"capture-review-discard-undo">;
  readonly envelopeId: EntityId<"capture-envelope">;
  readonly previousState: "pending" | "snoozed";
  readonly previousSnoozedUntil: string | null;
  readonly expectedReviewRowVersion: number;
  readonly createdAt: string;
  readonly consumedAt: string | null;
  readonly rowVersion: number;
}

export interface CaptureReviewPromotionCandidate {
  readonly fieldValueId: EntityId<"field-value">;
  readonly provenanceId: EntityId<"provenance">;
  readonly fieldName: string;
  readonly normalizedJson: string;
  readonly rawJson: string | null;
  readonly extractionMethod:
    "api" | "jsonld" | "selector" | "readability" | "heuristic" | "llm" | "user";
  readonly sourcePointer: string;
  readonly sourceExcerpt: string | null;
  readonly confidence: number;
  readonly capturedAt: string;
  readonly userConfirmation: {
    readonly id: EntityId<"field-confirmation">;
    readonly confirmedAt: string;
    readonly confirmedValueHash: string;
  } | null;
}

export interface CaptureReviewPromotionSource {
  readonly id: EntityId<"job-source">;
  readonly connectorId: string | null;
  readonly externalId: string | null;
  readonly canonicalUrl: string | null;
  readonly applyUrl: string | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface CaptureReviewPromotionSnapshot {
  readonly id: EntityId<"source-snapshot">;
  readonly capturedAt: string;
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly rawText: string | null;
  readonly sanitizedHtml: string | null;
  readonly structuredJson: string | null;
  readonly contentHash: string;
  readonly retentionClass: string;
  readonly createdAt: string;
}

export interface CaptureReviewNewJob {
  readonly id: EntityId<"job">;
  readonly company: {
    readonly id: EntityId<"company">;
    readonly canonicalName: string;
  } | null;
  readonly title: string;
  readonly normalizedTitle: string | null;
  readonly descriptionText: string;
  readonly employmentType: string | null;
  readonly workplaceType: string | null;
  readonly datePosted: string | null;
  readonly validThrough: string | null;
  readonly createdAt: string;
}

export interface CaptureReviewPromotionInput {
  readonly envelopeId: EntityId<"capture-envelope">;
  readonly expectedContentHash: string;
  readonly expectedReviewRowVersion: number;
  readonly resolution:
    | { readonly kind: "save_new"; readonly job: CaptureReviewNewJob }
    | { readonly kind: "merge_existing"; readonly jobId: EntityId<"job"> };
  readonly source: CaptureReviewPromotionSource;
  readonly snapshot: CaptureReviewPromotionSnapshot;
  readonly candidates: readonly CaptureReviewPromotionCandidate[];
  readonly resolvedAt: string;
}

export type CaptureReviewRepositoryErrorCode =
  | "invalid_input"
  | "not_found"
  | "stale_state"
  | "target_missing"
  | "token_consumed"
  | "storage_failed";

const ERROR_MESSAGES = Object.freeze({
  invalid_input: "Capture review rejected invalid input.",
  not_found: "Capture review item was not found.",
  stale_state: "Capture review state changed before this action completed.",
  target_missing: "Capture review merge target was not found.",
  token_consumed: "Capture review undo is no longer available.",
  storage_failed: "Capture review could not update local storage.",
} satisfies Readonly<Record<CaptureReviewRepositoryErrorCode, string>>);

export class CaptureReviewRepositoryError extends Error {
  public constructor(public readonly code: CaptureReviewRepositoryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "CaptureReviewRepositoryError";
  }
}

interface ReviewRow extends QueryRow {
  readonly envelope_id: string;
  readonly state: CaptureReviewState;
  readonly snoozed_until: string | null;
  readonly resolution_kind: CaptureReviewResolutionKind | null;
  readonly resolved_job_id: string | null;
  readonly updated_at: string;
  readonly row_version: number;
}

interface UndoRow extends QueryRow {
  readonly id: string;
  readonly envelope_id: string;
  readonly previous_state: "pending" | "snoozed";
  readonly previous_snoozed_until: string | null;
  readonly expected_review_row_version: number;
  readonly created_at: string;
  readonly consumed_at: string | null;
  readonly row_version: number;
}

interface ReceiptReviewRow extends ReviewRow {
  readonly content_hash: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function repositoryError(code: CaptureReviewRepositoryErrorCode): CaptureReviewRepositoryError {
  return new CaptureReviewRepositoryError(code);
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw repositoryError("invalid_input");
  return value;
}

function boundedText(value: string, maximum: number, allowEmpty = false): string {
  if ((!allowEmpty && value.trim().length === 0) || value.length > maximum) {
    throw repositoryError("invalid_input");
  }
  return value;
}

function nullableText(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  return boundedText(value, maximum);
}

function date(value: string | null): string | null {
  if (value === null) return null;
  if (!DATE_PATTERN.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw repositoryError("invalid_input");
  }
  return value;
}

function sha256(value: string): string {
  if (!SHA256_PATTERN.test(value)) throw repositoryError("invalid_input");
  return value;
}

function jsonText(value: string | null): string | null {
  if (value === null) return null;
  try {
    JSON.parse(value);
  } catch {
    throw repositoryError("invalid_input");
  }
  return value;
}

function reviewRecord(row: ReviewRow): CaptureReviewItemRecord {
  if (
    !["pending", "snoozed", "discarded", "resolved"].includes(row.state) ||
    !Number.isSafeInteger(row.row_version) ||
    row.row_version < 1
  ) {
    throw repositoryError("storage_failed");
  }
  const stateShapeValid =
    (row.state === "pending" &&
      row.snoozed_until === null &&
      row.resolution_kind === null &&
      row.resolved_job_id === null) ||
    (row.state === "snoozed" &&
      row.snoozed_until !== null &&
      row.resolution_kind === null &&
      row.resolved_job_id === null) ||
    (row.state === "discarded" &&
      row.snoozed_until === null &&
      row.resolution_kind === null &&
      row.resolved_job_id === null) ||
    (row.state === "resolved" &&
      row.snoozed_until === null &&
      row.resolution_kind !== null &&
      row.resolved_job_id !== null);
  if (!stateShapeValid) throw repositoryError("storage_failed");
  return Object.freeze({
    envelopeId: entityId("capture-envelope", row.envelope_id),
    state: row.state,
    snoozedUntil: row.snoozed_until === null ? null : instant(row.snoozed_until),
    resolutionKind: row.resolution_kind,
    resolvedJobId: row.resolved_job_id === null ? null : entityId("job", row.resolved_job_id),
    updatedAt: instant(row.updated_at),
    rowVersion: row.row_version,
  });
}

function undoRecord(row: UndoRow): CaptureReviewDiscardUndoRecord {
  if (!Number.isSafeInteger(row.row_version) || row.row_version < 1) {
    throw repositoryError("storage_failed");
  }
  return Object.freeze({
    id: entityId("capture-review-discard-undo", row.id),
    envelopeId: entityId("capture-envelope", row.envelope_id),
    previousState: row.previous_state,
    previousSnoozedUntil:
      row.previous_snoozed_until === null ? null : instant(row.previous_snoozed_until),
    expectedReviewRowVersion: positiveInteger(row.expected_review_row_version),
    createdAt: instant(row.created_at),
    consumedAt: row.consumed_at === null ? null : instant(row.consumed_at),
    rowVersion: row.row_version,
  });
}

const REVIEW_COLUMNS = `envelope_id, state, snoozed_until, resolution_kind,
                        resolved_job_id, updated_at, row_version`;
const UNDO_COLUMNS = `id, envelope_id, previous_state, previous_snoozed_until,
                      expected_review_row_version, created_at, consumed_at, row_version`;

async function readReview(
  session: DatabaseSession,
  envelopeId: EntityId<"capture-envelope">,
): Promise<CaptureReviewItemRecord> {
  const rows = await session.query<ReviewRow>(
    sqlStatement(`SELECT ${REVIEW_COLUMNS} FROM capture_review_item WHERE envelope_id = ?`, [
      envelopeId,
    ]),
  );
  if (rows.length !== 1 || rows[0] === undefined) throw repositoryError("not_found");
  return reviewRecord(rows[0]);
}

async function updateReview(
  session: DatabaseSession,
  input: {
    readonly envelopeId: EntityId<"capture-envelope">;
    readonly expectedRowVersion: number;
    readonly state: "pending" | "snoozed" | "discarded";
    readonly snoozedUntil: string | null;
    readonly updatedAt: string;
    readonly expectedState?: "pending" | "snoozed" | "discarded";
  },
): Promise<CaptureReviewItemRecord> {
  const expectedRowVersion = positiveInteger(input.expectedRowVersion);
  const updatedAt = instant(input.updatedAt);
  const snoozedUntil = input.snoozedUntil === null ? null : instant(input.snoozedUntil);
  if ((input.state === "snoozed") !== (snoozedUntil !== null)) {
    throw repositoryError("invalid_input");
  }
  const expectedStates =
    input.expectedState === undefined ? ["pending", "snoozed"] : [input.expectedState];
  const placeholders = expectedStates.map(() => "?").join(", ");
  const result = await session.execute(
    sqlStatement(
      `UPDATE capture_review_item
       SET state = ?, snoozed_until = ?, resolution_kind = NULL,
           resolved_job_id = NULL, updated_at = ?, row_version = row_version + 1
       WHERE envelope_id = ? AND row_version = ? AND state IN (${placeholders})`,
      [
        input.state,
        snoozedUntil,
        updatedAt,
        input.envelopeId,
        expectedRowVersion,
        ...expectedStates,
      ],
    ),
  );
  if (result.rowsAffected !== 1) throw repositoryError("stale_state");
  return readReview(session, input.envelopeId);
}

function validatePromotion(input: CaptureReviewPromotionInput): void {
  entityId("capture-envelope", input.envelopeId);
  sha256(input.expectedContentHash);
  positiveInteger(input.expectedReviewRowVersion);
  instant(input.resolvedAt);
  entityId("job-source", input.source.id);
  nullableText(input.source.connectorId, 128);
  nullableText(input.source.externalId, 1024);
  nullableText(input.source.canonicalUrl, 8192);
  nullableText(input.source.applyUrl, 8192);
  instant(input.source.firstSeenAt);
  instant(input.source.lastSeenAt);
  sha256(input.source.contentHash);
  instant(input.source.createdAt);
  entityId("source-snapshot", input.snapshot.id);
  instant(input.snapshot.capturedAt);
  boundedText(input.snapshot.extractorId, 128);
  boundedText(input.snapshot.extractorVersion, 64);
  if (input.snapshot.rawText !== null) boundedText(input.snapshot.rawText, 2_000_000, true);
  if (input.snapshot.sanitizedHtml !== null)
    boundedText(input.snapshot.sanitizedHtml, 2_000_000, true);
  jsonText(input.snapshot.structuredJson);
  sha256(input.snapshot.contentHash);
  boundedText(input.snapshot.retentionClass, 64);
  instant(input.snapshot.createdAt);
  if (
    input.source.contentHash !== input.expectedContentHash ||
    input.snapshot.contentHash !== input.expectedContentHash ||
    input.candidates.length > 512
  ) {
    throw repositoryError("invalid_input");
  }
  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    entityId("field-value", candidate.fieldValueId);
    entityId("provenance", candidate.provenanceId);
    boundedText(candidate.fieldName, 128);
    jsonText(candidate.normalizedJson);
    jsonText(candidate.rawJson);
    boundedText(candidate.sourcePointer, 2048);
    if (candidate.sourceExcerpt !== null) boundedText(candidate.sourceExcerpt, 4096, true);
    if (
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1
    ) {
      throw repositoryError("invalid_input");
    }
    instant(candidate.capturedAt);
    if (candidate.userConfirmation !== null) {
      entityId("field-confirmation", candidate.userConfirmation.id);
      instant(candidate.userConfirmation.confirmedAt);
      sha256(candidate.userConfirmation.confirmedValueHash);
    }
    for (const id of [
      candidate.fieldValueId,
      candidate.provenanceId,
      candidate.userConfirmation?.id,
    ]) {
      if (id === undefined) continue;
      if (ids.has(id)) throw repositoryError("invalid_input");
      ids.add(id);
    }
  }
  if (input.resolution.kind === "merge_existing") {
    entityId("job", input.resolution.jobId);
    return;
  }
  const job = input.resolution.job;
  entityId("job", job.id);
  boundedText(job.title, 1024);
  nullableText(job.normalizedTitle, 1024);
  boundedText(job.descriptionText, 2_000_000, true);
  nullableText(job.employmentType, 128);
  nullableText(job.workplaceType, 128);
  date(job.datePosted);
  date(job.validThrough);
  instant(job.createdAt);
  if (job.datePosted !== null && job.validThrough !== null && job.datePosted > job.validThrough) {
    throw repositoryError("invalid_input");
  }
  if (job.company !== null) {
    entityId("company", job.company.id);
    boundedText(job.company.canonicalName, 512);
  }
}

export class CaptureReviewRepository {
  public constructor(private readonly database: DatabasePort) {}

  public async list(): Promise<readonly CaptureReviewItemRecord[]> {
    try {
      const rows = await this.database.query<ReviewRow>(
        sqlStatement(`SELECT ${REVIEW_COLUMNS} FROM capture_review_item ORDER BY envelope_id`),
      );
      return Object.freeze(rows.map(reviewRecord));
    } catch (error) {
      if (error instanceof CaptureReviewRepositoryError) throw error;
      throw repositoryError("storage_failed");
    }
  }

  public async snooze(input: {
    readonly envelopeId: EntityId<"capture-envelope">;
    readonly expectedRowVersion: number;
    readonly snoozedUntil: string;
    readonly updatedAt: string;
  }): Promise<CaptureReviewItemRecord> {
    try {
      const snoozedUntil = instant(input.snoozedUntil);
      const updatedAt = instant(input.updatedAt);
      if (snoozedUntil <= updatedAt) throw repositoryError("invalid_input");
      return await this.database.transaction((transaction) =>
        updateReview(transaction, {
          envelopeId: entityId("capture-envelope", input.envelopeId),
          expectedRowVersion: input.expectedRowVersion,
          state: "snoozed",
          snoozedUntil,
          updatedAt,
        }),
      );
    } catch (error) {
      if (error instanceof CaptureReviewRepositoryError) throw error;
      throw repositoryError("storage_failed");
    }
  }

  public async wake(input: {
    readonly envelopeId: EntityId<"capture-envelope">;
    readonly expectedRowVersion: number;
    readonly updatedAt: string;
  }): Promise<CaptureReviewItemRecord> {
    try {
      return await this.database.transaction((transaction) =>
        updateReview(transaction, {
          envelopeId: entityId("capture-envelope", input.envelopeId),
          expectedRowVersion: input.expectedRowVersion,
          expectedState: "snoozed",
          state: "pending",
          snoozedUntil: null,
          updatedAt: input.updatedAt,
        }),
      );
    } catch (error) {
      if (error instanceof CaptureReviewRepositoryError) throw error;
      throw repositoryError("storage_failed");
    }
  }

  public async discard(input: {
    readonly envelopeId: EntityId<"capture-envelope">;
    readonly expectedRowVersion: number;
    readonly undoTokenId: EntityId<"capture-review-discard-undo">;
    readonly discardedAt: string;
  }): Promise<{
    readonly item: CaptureReviewItemRecord;
    readonly undo: CaptureReviewDiscardUndoRecord;
  }> {
    try {
      return await this.database.transaction(async (transaction) => {
        const envelopeId = entityId("capture-envelope", input.envelopeId);
        const before = await readReview(transaction, envelopeId);
        if (
          before.rowVersion !== positiveInteger(input.expectedRowVersion) ||
          (before.state !== "pending" && before.state !== "snoozed")
        ) {
          throw repositoryError("stale_state");
        }
        const discardedAt = instant(input.discardedAt);
        const item = await updateReview(transaction, {
          envelopeId,
          expectedRowVersion: before.rowVersion,
          expectedState: before.state,
          state: "discarded",
          snoozedUntil: null,
          updatedAt: discardedAt,
        });
        const undoTokenId = entityId("capture-review-discard-undo", input.undoTokenId);
        await transaction.execute(
          sqlStatement(
            `INSERT INTO capture_review_discard_undo_token(
               id, envelope_id, previous_state, previous_snoozed_until,
               expected_review_row_version, created_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              undoTokenId,
              envelopeId,
              before.state,
              before.snoozedUntil,
              item.rowVersion,
              discardedAt,
            ],
          ),
        );
        const rows = await transaction.query<UndoRow>(
          sqlStatement(
            `SELECT ${UNDO_COLUMNS} FROM capture_review_discard_undo_token WHERE id = ?`,
            [undoTokenId],
          ),
        );
        if (rows.length !== 1 || rows[0] === undefined) throw repositoryError("storage_failed");
        return Object.freeze({ item, undo: undoRecord(rows[0]) });
      });
    } catch (error) {
      if (error instanceof CaptureReviewRepositoryError) throw error;
      throw repositoryError("storage_failed");
    }
  }

  public async undoDiscard(input: {
    readonly undoTokenId: EntityId<"capture-review-discard-undo">;
    readonly restoredAt: string;
  }): Promise<{
    readonly item: CaptureReviewItemRecord;
    readonly undo: CaptureReviewDiscardUndoRecord;
  }> {
    try {
      return await this.database.transaction(async (transaction) => {
        const undoTokenId = entityId("capture-review-discard-undo", input.undoTokenId);
        const rows = await transaction.query<UndoRow>(
          sqlStatement(
            `SELECT ${UNDO_COLUMNS} FROM capture_review_discard_undo_token WHERE id = ?`,
            [undoTokenId],
          ),
        );
        const row = rows[0];
        if (rows.length !== 1 || row === undefined) throw repositoryError("not_found");
        const undo = undoRecord(row);
        if (undo.consumedAt !== null) throw repositoryError("token_consumed");
        const restoredAt = instant(input.restoredAt);
        const item = await updateReview(transaction, {
          envelopeId: undo.envelopeId,
          expectedRowVersion: undo.expectedReviewRowVersion,
          expectedState: "discarded",
          state: undo.previousState,
          snoozedUntil: undo.previousSnoozedUntil,
          updatedAt: restoredAt,
        });
        const consumed = await transaction.execute(
          sqlStatement(
            `UPDATE capture_review_discard_undo_token
             SET consumed_at = ?, row_version = row_version + 1
             WHERE id = ? AND consumed_at IS NULL AND row_version = ?`,
            [restoredAt, undo.id, undo.rowVersion],
          ),
        );
        if (consumed.rowsAffected !== 1) throw repositoryError("token_consumed");
        const consumedRows = await transaction.query<UndoRow>(
          sqlStatement(
            `SELECT ${UNDO_COLUMNS} FROM capture_review_discard_undo_token WHERE id = ?`,
            [undo.id],
          ),
        );
        if (consumedRows.length !== 1 || consumedRows[0] === undefined) {
          throw repositoryError("storage_failed");
        }
        return Object.freeze({ item, undo: undoRecord(consumedRows[0]) });
      });
    } catch (error) {
      if (error instanceof CaptureReviewRepositoryError) throw error;
      throw repositoryError("storage_failed");
    }
  }

  public async promote(input: CaptureReviewPromotionInput): Promise<CaptureReviewItemRecord> {
    validatePromotion(input);
    try {
      return await this.database.transaction(async (transaction) => {
        const rows = await transaction.query<ReceiptReviewRow>(
          sqlStatement(
            `SELECT review.envelope_id, review.state, review.snoozed_until,
                    review.resolution_kind, review.resolved_job_id, review.updated_at,
                    review.row_version, receipt.content_hash
             FROM capture_review_item AS review
             INNER JOIN capture_inbox AS receipt ON receipt.envelope_id = review.envelope_id
             WHERE review.envelope_id = ?`,
            [input.envelopeId],
          ),
        );
        const row = rows[0];
        if (rows.length !== 1 || row === undefined) throw repositoryError("not_found");
        const before = reviewRecord(row);
        if (
          before.state !== "pending" ||
          before.rowVersion !== input.expectedReviewRowVersion ||
          row.content_hash !== input.expectedContentHash
        ) {
          throw repositoryError("stale_state");
        }

        let jobId: EntityId<"job">;
        if (input.resolution.kind === "save_new") {
          const job = input.resolution.job;
          if (job.company !== null) {
            await transaction.execute(
              sqlStatement(
                `INSERT INTO company(
                   id, canonical_name, website_url, domain, location_id, notes,
                   archived_at, created_at, updated_at, row_version
                 ) VALUES (?, ?, NULL, NULL, NULL, '', NULL, ?, ?, 1)`,
                [job.company.id, job.company.canonicalName, job.createdAt, job.createdAt],
              ),
            );
          }
          await transaction.execute(
            sqlStatement(
              `INSERT INTO job(
                 id, company_id, title, normalized_title, description_text,
                 employment_type, workplace_type, seniority, location_id,
                 remote_region_json, date_posted, valid_through, archived_at,
                 created_at, updated_at, row_version
               ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 1)`,
              [
                job.id,
                job.company?.id ?? null,
                job.title,
                job.normalizedTitle,
                job.descriptionText,
                job.employmentType,
                job.workplaceType,
                job.datePosted,
                job.validThrough,
                job.createdAt,
                job.createdAt,
              ],
            ),
          );
          jobId = job.id;
        } else {
          const target = await transaction.query<{ readonly id: string }>(
            sqlStatement("SELECT id FROM job WHERE id = ? AND archived_at IS NULL", [
              input.resolution.jobId,
            ]),
          );
          if (target.length !== 1) throw repositoryError("target_missing");
          jobId = input.resolution.jobId;
        }

        await transaction.execute(
          sqlStatement(
            `INSERT INTO job_source(
               id, job_id, connector_id, external_id, canonical_url, apply_url,
               first_seen_at, last_seen_at, content_hash, is_primary,
               created_at, updated_at, row_version
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
            [
              input.source.id,
              jobId,
              input.source.connectorId,
              input.source.externalId,
              input.source.canonicalUrl,
              input.source.applyUrl,
              input.source.firstSeenAt,
              input.source.lastSeenAt,
              input.source.contentHash,
              input.source.createdAt,
              input.source.createdAt,
            ],
          ),
        );
        await transaction.execute(
          sqlStatement(
            `INSERT INTO source_snapshot(
               id, job_source_id, captured_at, extractor_id, extractor_version,
               raw_text, sanitized_html, structured_json, content_hash,
               retention_class, created_at, row_version
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              input.snapshot.id,
              input.source.id,
              input.snapshot.capturedAt,
              input.snapshot.extractorId,
              input.snapshot.extractorVersion,
              input.snapshot.rawText,
              input.snapshot.sanitizedHtml,
              input.snapshot.structuredJson,
              input.snapshot.contentHash,
              input.snapshot.retentionClass,
              input.snapshot.createdAt,
            ],
          ),
        );

        for (const candidate of input.candidates) {
          await transaction.execute(
            sqlStatement(
              `INSERT INTO provenance(
                 id, source_snapshot_id, extraction_method, source_pointer,
                 source_excerpt, confidence, captured_at, license_note,
                 created_at, row_version
               ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`,
              [
                candidate.provenanceId,
                input.snapshot.id,
                candidate.extractionMethod,
                candidate.sourcePointer,
                candidate.sourceExcerpt,
                candidate.confidence,
                candidate.capturedAt,
                input.resolvedAt,
              ],
            ),
          );
          const confirmation = candidate.userConfirmation;
          await transaction.execute(
            sqlStatement(
              `INSERT INTO field_value(
                 id, entity_type, entity_id, field_name, normalized_json, raw_json,
                 provenance_id, is_user_confirmed, user_confirmation_id,
                 confirmed_at, confirmed_value_hash, superseded_by_id,
                 created_at, updated_at, row_version
               ) VALUES (?, 'job', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)`,
              [
                candidate.fieldValueId,
                jobId,
                candidate.fieldName,
                candidate.normalizedJson,
                candidate.rawJson,
                candidate.provenanceId,
                confirmation === null ? 0 : 1,
                confirmation?.id ?? null,
                confirmation?.confirmedAt ?? null,
                confirmation?.confirmedValueHash ?? null,
                input.resolvedAt,
                input.resolvedAt,
              ],
            ),
          );
        }

        const resolved = await transaction.execute(
          sqlStatement(
            `UPDATE capture_review_item
             SET state = 'resolved', snoozed_until = NULL, resolution_kind = ?,
                 resolved_job_id = ?, updated_at = ?, row_version = row_version + 1
             WHERE envelope_id = ? AND state = 'pending' AND row_version = ?`,
            [
              input.resolution.kind,
              jobId,
              input.resolvedAt,
              input.envelopeId,
              input.expectedReviewRowVersion,
            ],
          ),
        );
        if (resolved.rowsAffected !== 1) throw repositoryError("stale_state");
        return readReview(transaction, input.envelopeId);
      });
    } catch (error) {
      if (error instanceof CaptureReviewRepositoryError) throw error;
      throw repositoryError("storage_failed");
    }
  }
}

export const createCaptureReviewRepository = (database: DatabasePort): CaptureReviewRepository =>
  new CaptureReviewRepository(database);
