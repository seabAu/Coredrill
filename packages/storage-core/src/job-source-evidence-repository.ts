import {
  JobSourceEvidenceError,
  type JobSourceEvidenceDto,
  type JobSourceEvidenceKind,
  type JobSourceEvidencePort,
  type SourceValuePreviewDto,
} from "@coredrill/application";
import { confidence, entityId, instant, jobRequirementCategory } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type QueryRow, type SqlValue } from "./database-port.js";

const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new JobSourceEvidenceError("invalid_state");
  return value;
};
const nullableText = (value: SqlValue | undefined): string | null =>
  value === null ? null : text(value);
const integer = (value: SqlValue | undefined, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new JobSourceEvidenceError("invalid_state");
  return value;
};
const flag = (value: SqlValue | undefined): boolean => {
  if (value !== 0 && value !== 1) throw new JobSourceEvidenceError("invalid_state");
  return value === 1;
};
const isEvidenceKind = (value: unknown): value is JobSourceEvidenceKind =>
  value === "field-value" || value === "requirement";
const preview = (
  row: QueryRow,
  prefix: "normalized" | "raw",
  format: "json" | "text",
): SourceValuePreviewDto => {
  const literal = text(row[`${prefix}_preview`]);
  const byteLength = integer(row[`${prefix}_bytes`]);
  return {
    text: literal,
    byteLength,
    format,
    complete: new TextEncoder().encode(literal).byteLength === byteLength,
  };
};
const fromRow = (row: QueryRow): JobSourceEvidenceDto => {
  const kind = row["kind"];
  if (kind !== "field-value" && kind !== "requirement")
    throw new JobSourceEvidenceError("invalid_state");
  const jobId = entityId("job", text(row["job_id"]));
  const snapshotId = entityId("source-snapshot", text(row["source_snapshot_id"]));
  const format = kind === "field-value" ? "json" : "text";
  const method = row["extraction_method"];
  if (
    method !== "api" &&
    method !== "heuristic" &&
    method !== "jsonld" &&
    method !== "llm" &&
    method !== "readability" &&
    method !== "selector" &&
    method !== "user"
  )
    throw new JobSourceEvidenceError("invalid_state");
  const base: Pick<
    JobSourceEvidenceDto,
    "jobId" | "snapshotId" | "createdAt" | "normalized" | "raw" | "provenance"
  > = {
    jobId,
    snapshotId,
    createdAt: instant(text(row["created_at"])),
    normalized: preview(row, "normalized", format),
    raw: row["raw_preview"] === null ? null : preview(row, "raw", format),
    provenance: {
      id: entityId("provenance", text(row["provenance_id"])),
      snapshotId,
      method,
      pointer: text(row["source_pointer"]),
      excerpt: nullableText(row["source_excerpt"]),
      confidence: confidence(row["confidence"] as number),
      capturedAt: instant(text(row["captured_at"])),
      licenseNote: nullableText(row["license_note"]),
    },
  };
  const stamp = {
    updatedAt: instant(text(row["updated_at"])),
    rowVersion: integer(row["row_version"], 1),
  };
  if (kind === "requirement") {
    if (
      row["requirement_confidence"] !== row["confidence"] ||
      base.raw === null ||
      base.raw.byteLength === 0 ||
      base.normalized.byteLength === 0
    )
      throw new JobSourceEvidenceError("invalid_state");
    return {
      ...base,
      kind,
      id: entityId("job-requirement", text(row["id"])),
      raw: base.raw,
      sourceCategory: jobRequirementCategory(text(row["source_category"])),
      currentReview: {
        ...stamp,
        category: jobRequirementCategory(text(row["category"])),
        userConfirmed: flag(row["is_user_confirmed"]),
      },
    };
  }
  const confirmed = flag(row["is_user_confirmed"]);
  if (
    !confirmed &&
    (row["user_confirmation_id"] !== null ||
      row["confirmed_at"] !== null ||
      row["confirmed_value_hash"] !== null)
  )
    throw new JobSourceEvidenceError("invalid_state");
  const fieldName = text(row["field_name"]);
  const supersededById = row["superseded_by_id"];
  if (
    supersededById !== null &&
    (row["next_entity_type"] !== "job" ||
      row["next_entity_id"] !== jobId ||
      row["next_field_name"] !== fieldName ||
      row["next_source_job_id"] !== jobId)
  )
    throw new JobSourceEvidenceError("invalid_state");
  return {
    ...base,
    kind,
    id: entityId("field-value", text(row["id"])),
    fieldName,
    currentReview: {
      ...stamp,
      confirmation: confirmed
        ? {
            id: entityId("field-confirmation", text(row["user_confirmation_id"])),
            confirmedAt: instant(text(row["confirmed_at"])),
            confirmedValueHash: text(row["confirmed_value_hash"]),
          }
        : null,
      supersededBy:
        supersededById === null
          ? null
          : {
              id: entityId("field-value", text(supersededById)),
              jobId,
              snapshotId: entityId("source-snapshot", text(row["next_snapshot_id"])),
              fieldName,
            },
    },
  };
};
const evidence = `WITH source_provenance AS (
  SELECT * FROM provenance WHERE source_snapshot_id = ? AND created_at <= ?
), evidence AS (
  SELECT f.id, 'field-value' AS kind, f.entity_id AS job_id, f.field_name, f.created_at, f.updated_at, f.row_version,
    substr(f.normalized_json, 1, 256) AS normalized_preview, length(CAST(f.normalized_json AS BLOB)) AS normalized_bytes,
    substr(f.raw_json, 1, 256) AS raw_preview, length(CAST(f.raw_json AS BLOB)) AS raw_bytes,
    p.id AS provenance_id, p.source_snapshot_id, p.extraction_method, p.source_pointer, p.source_excerpt, p.confidence, p.captured_at, p.license_note,
    f.is_user_confirmed, f.user_confirmation_id, f.confirmed_at, f.confirmed_value_hash, f.superseded_by_id,
    n.entity_type AS next_entity_type, n.entity_id AS next_entity_id, n.field_name AS next_field_name, np.source_snapshot_id AS next_snapshot_id, nj.job_id AS next_source_job_id,
    NULL AS category, NULL AS source_category, NULL AS requirement_confidence
  FROM field_value f JOIN source_provenance p ON p.id = f.provenance_id
    LEFT JOIN field_value n ON n.id = f.superseded_by_id
    LEFT JOIN provenance np ON np.id = n.provenance_id LEFT JOIN source_snapshot ns ON ns.id = np.source_snapshot_id LEFT JOIN job_source nj ON nj.id = ns.job_source_id
  WHERE f.entity_type = 'job' AND f.entity_id = ? AND f.created_at <= ?
  UNION ALL
  SELECT r.id, 'requirement', r.job_id, NULL, r.created_at, r.updated_at, r.row_version,
    substr(r.normalized_text, 1, 256), length(CAST(r.normalized_text AS BLOB)), substr(r.raw_text, 1, 256), length(CAST(r.raw_text AS BLOB)),
    p.id, p.source_snapshot_id, p.extraction_method, p.source_pointer, p.source_excerpt, p.confidence, p.captured_at, p.license_note,
    r.user_confirmed, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, r.category, r.source_category, r.confidence
  FROM job_requirement r JOIN source_provenance p ON p.id = r.provenance_id WHERE r.job_id = ? AND r.created_at <= ?
)`;
export const createJobSourceEvidenceRepository = (
  database: DatabasePort,
): JobSourceEvidencePort => ({
  listPage: (input) =>
    database.transaction(async (session) => {
      const jobId = entityId("job", input.jobId);
      const snapshotId = entityId("source-snapshot", input.snapshotId);
      const asOf = instant(input.asOf);
      if (
        typeof input.includeArchived !== "boolean" ||
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 50
      )
        throw new JobSourceEvidenceError("invalid_state");
      const snapshots = await session.query(
        sqlStatement(
          `SELECT s.id FROM source_snapshot s JOIN job_source j ON j.id = s.job_source_id JOIN job p ON p.id = j.job_id WHERE s.id = ? AND j.job_id = ? AND s.created_at <= ?${input.includeArchived ? "" : " AND p.archived_at IS NULL"}`,
          [snapshotId, jobId, asOf],
        ),
      );
      if (snapshots.length === 0) return undefined;
      const parameters: SqlValue[] = [snapshotId, asOf, jobId, asOf, jobId, asOf];
      let predicate = "1 = 1";
      const after = input.after;
      if (after !== null) {
        if (
          after.jobId !== jobId ||
          after.snapshotId !== snapshotId ||
          after.asOf !== asOf ||
          after.includeArchived !== input.includeArchived ||
          !isEvidenceKind(after.kind) ||
          instant(after.createdAt) > asOf
        )
          throw new JobSourceEvidenceError("cursor_invalidated");
        entityId(after.kind === "field-value" ? "field-value" : "job-requirement", after.id);
        const anchor = await session.query(
          sqlStatement(
            `${evidence} SELECT id FROM evidence WHERE id = ? AND kind = ? AND created_at = ?`,
            [...parameters, after.id, after.kind, after.createdAt],
          ),
        );
        if (anchor.length !== 1) throw new JobSourceEvidenceError("cursor_invalidated");
        predicate = "(created_at < ? OR (created_at = ? AND (kind > ? OR (kind = ? AND id > ?))))";
        parameters.push(after.createdAt, after.createdAt, after.kind, after.kind, after.id);
      }
      const rows = await session.query(
        sqlStatement(
          `${evidence} SELECT * FROM evidence WHERE ${predicate} ORDER BY created_at DESC, kind ASC, id ASC LIMIT ?`,
          [...parameters, input.limit + 1],
        ),
      );
      const items = rows.slice(0, input.limit).map(fromRow);
      const hasMore = rows.length > input.limit;
      const last = items.at(-1);
      return {
        jobId,
        snapshotId,
        asOf,
        includeArchived: input.includeArchived,
        items,
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? {
                jobId,
                snapshotId,
                asOf,
                includeArchived: input.includeArchived,
                createdAt: last.createdAt,
                kind: last.kind,
                id: last.id,
              }
            : null,
      };
    }),
});
