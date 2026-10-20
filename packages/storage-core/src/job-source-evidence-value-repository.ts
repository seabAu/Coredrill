import {
  JobSourceEvidenceValueError,
  type JobSourceEvidenceValuePort,
  type SourceEvidenceValuePart,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type SqlValue } from "./database-port.js";

const projections = Object.freeze({
  "field-value": Object.freeze({
    table: "field_value",
    job: "v.entity_id",
    guard: " AND v.entity_type = 'job'",
    normalized: "v.normalized_json",
    raw: "v.raw_json",
  }),
  requirement: Object.freeze({
    table: "job_requirement",
    job: "v.job_id",
    guard: "",
    normalized: "v.normalized_text",
    raw: "v.raw_text",
  }),
});
const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new JobSourceEvidenceValueError("invalid_state");
  return value;
};
const positive = (value: SqlValue | undefined): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new JobSourceEvidenceValueError("invalid_state");
  return value;
};
const isValuePart = (value: unknown): value is SourceEvidenceValuePart =>
  value === "normalized" || value === "raw";
export const createJobSourceEvidenceValueRepository = (
  database: DatabasePort,
): JobSourceEvidenceValuePort => ({
  readChunk: (input) =>
    database.transaction(async (session) => {
      const jobId = entityId("job", input.jobId);
      const snapshotId = entityId("source-snapshot", input.snapshotId);
      const asOf = instant(input.asOf);
      if (
        !Object.hasOwn(projections, input.evidenceKind) ||
        !isValuePart(input.part) ||
        typeof input.includeArchived !== "boolean" ||
        !Number.isSafeInteger(input.limitBytes) ||
        input.limitBytes < 4 ||
        input.limitBytes > 65_536
      )
        throw new JobSourceEvidenceValueError("invalid_state");
      const evidenceId = entityId(
        input.evidenceKind === "field-value" ? "field-value" : "job-requirement",
        input.evidenceId,
      );
      const after = input.after;
      const offset = after?.byteOffset ?? 0;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (after !== null &&
          (after.jobId !== jobId ||
            after.snapshotId !== snapshotId ||
            after.evidenceKind !== input.evidenceKind ||
            after.evidenceId !== evidenceId ||
            after.part !== input.part ||
            after.includeArchived !== input.includeArchived ||
            after.asOf !== asOf ||
            offset < 1 ||
            !Number.isSafeInteger(after.byteLength) ||
            offset >= after.byteLength ||
            !Number.isSafeInteger(after.rowVersion) ||
            after.rowVersion < 1))
      )
        throw new JobSourceEvidenceValueError("cursor_invalidated");
      // Only fixed, reviewed evidence-kind/part mappings choose SQL identifiers.
      const projection = projections[input.evidenceKind];
      const column = projection[input.part];
      const rows = await session.query(
        sqlStatement(
          `SELECT v.id AS evidence_id, j.id AS job_id, s.id AS snapshot_id, p.id AS provenance_id, v.row_version,
        length(CAST(${column} AS BLOB)) AS byte_length, substr(CAST(${column} AS BLOB), ?, ?) AS value_chunk
       FROM ${projection.table} v JOIN provenance p ON p.id = v.provenance_id
       JOIN source_snapshot s ON s.id = p.source_snapshot_id JOIN job_source js ON js.id = s.job_source_id
       JOIN job j ON j.id = js.job_id
       WHERE v.id = ? AND j.id = ? AND s.id = ? AND ${projection.job} = j.id
         AND v.created_at <= ? AND p.created_at <= ? AND s.created_at <= ?${projection.guard}${input.includeArchived ? "" : " AND j.archived_at IS NULL"}`,
          [offset + 1, input.limitBytes, evidenceId, jobId, snapshotId, asOf, asOf, asOf],
        ),
      );
      const row = rows[0];
      if (row === undefined) return undefined;
      const provenanceId = entityId("provenance", text(row["provenance_id"]));
      const rowVersion = positive(row["row_version"]);
      const byteLength = row["byte_length"] === null ? null : positive(row["byte_length"]);
      if (
        after !== null &&
        (after.provenanceId !== provenanceId ||
          after.rowVersion !== rowVersion ||
          after.byteLength !== byteLength)
      )
        throw new JobSourceEvidenceValueError("cursor_invalidated");
      const bytes = row["value_chunk"];
      if (
        byteLength === null &&
        (input.evidenceKind !== "field-value" || input.part !== "raw" || bytes !== null)
      )
        throw new JobSourceEvidenceValueError("invalid_state");
      if (bytes !== null && !(bytes instanceof Uint8Array))
        throw new JobSourceEvidenceValueError("invalid_state");
      const firstByte = bytes?.[0];
      if (after !== null && firstByte !== undefined && (firstByte & 0xc0) === 0x80)
        throw new JobSourceEvidenceValueError("cursor_invalidated");
      return {
        jobId: entityId("job", text(row["job_id"])),
        snapshotId: entityId("source-snapshot", text(row["snapshot_id"])),
        evidenceKind: input.evidenceKind,
        evidenceId: text(row["evidence_id"]),
        part: input.part,
        includeArchived: input.includeArchived,
        asOf,
        provenanceId,
        rowVersion,
        format: input.evidenceKind === "field-value" ? "json" : "text",
        byteOffset: offset,
        byteLength,
        bytes,
      };
    }),
});
