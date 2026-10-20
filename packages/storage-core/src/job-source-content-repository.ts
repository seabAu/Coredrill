import {
  JobSourceContentError,
  type JobSourceContentPort,
  type JobSourceContentKind,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type SqlValue } from "./database-port.js";

const columns: Readonly<Record<JobSourceContentKind, string>> = Object.freeze({
  text: "s.raw_text",
  markup: "s.sanitized_html",
  structured: "s.structured_json",
});
const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new JobSourceContentError("invalid_state");
  return value;
};
export const createJobSourceContentRepository = (database: DatabasePort): JobSourceContentPort => ({
  readChunk: (input) =>
    database.transaction(async (session) => {
      const jobId = entityId("job", input.jobId);
      const snapshotId = entityId("source-snapshot", input.snapshotId);
      const asOf = instant(input.asOf);
      if (
        !Object.hasOwn(columns, input.kind) ||
        typeof input.includeArchived !== "boolean" ||
        !Number.isSafeInteger(input.limitBytes) ||
        input.limitBytes < 4 ||
        input.limitBytes > 65_536
      )
        throw new JobSourceContentError("invalid_state");
      const after = input.after;
      const offset = after?.byteOffset ?? 0;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (after !== null &&
          (after.jobId !== jobId ||
            after.snapshotId !== snapshotId ||
            after.kind !== input.kind ||
            after.includeArchived !== input.includeArchived ||
            after.asOf !== asOf ||
            offset < 1 ||
            offset >= after.byteLength))
      )
        throw new JobSourceContentError("cursor_invalidated");
      // Only this reviewed enum chooses SQL text. IDs, offsets and lengths are bound values.
      const column = columns[input.kind];
      const rows = await session.query(
        sqlStatement(
          `SELECT s.id, s.job_source_id, j.job_id, s.content_hash,
      length(CAST(${column} AS BLOB)) AS byte_length,
      substr(CAST(${column} AS BLOB), ?, ?) AS content_chunk
      FROM source_snapshot s JOIN job_source j ON j.id = s.job_source_id JOIN job p ON p.id = j.job_id
      WHERE p.id = ? AND s.id = ? AND s.created_at <= ?${input.includeArchived ? "" : " AND p.archived_at IS NULL"}`,
          [offset + 1, input.limitBytes, jobId, snapshotId, asOf],
        ),
      );
      const row = rows[0];
      if (row === undefined) return undefined;
      const byteLength = row["byte_length"];
      // SQLite substr() returns NULL for an empty BLOB; its non-null length still
      // distinguishes retained zero bytes from an absent SQL NULL body.
      const bytes =
        byteLength === 0 && row["content_chunk"] === null ? new Uint8Array() : row["content_chunk"];
      const contentHash = text(row["content_hash"]);
      if (
        byteLength !== null &&
        (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0)
      )
        throw new JobSourceContentError("invalid_state");
      if (after !== null && (contentHash !== after.contentHash || byteLength !== after.byteLength))
        throw new JobSourceContentError("cursor_invalidated");
      if (bytes !== null && !(bytes instanceof Uint8Array))
        throw new JobSourceContentError("invalid_state");
      const firstByte = bytes?.[0];
      if (after !== null && firstByte !== undefined && (firstByte & 0xc0) === 0x80)
        throw new JobSourceContentError("cursor_invalidated");
      return {
        jobId: entityId("job", text(row["job_id"])),
        snapshotId: entityId("source-snapshot", text(row["id"])),
        jobSourceId: entityId("job-source", text(row["job_source_id"])),
        kind: input.kind,
        includeArchived: input.includeArchived,
        asOf,
        contentHash,
        byteOffset: offset,
        byteLength,
        bytes,
      };
    }),
});
