import {
  JobSourceSnapshotError,
  type JobSourceSnapshotPort,
  type JobSourceSnapshotMetadataDto,
} from "@coredrill/application";
import { entityId, instant, webUrl } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type QueryRow, type SqlValue } from "./database-port.js";

const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new JobSourceSnapshotError("invalid_state");
  return value;
};
const nullableText = (value: SqlValue | undefined): string | null =>
  value === null ? null : text(value);
const flag = (value: SqlValue | undefined): boolean => {
  if (value !== 0 && value !== 1) throw new JobSourceSnapshotError("invalid_state");
  return value === 1;
};
const fromRow = (row: QueryRow): JobSourceSnapshotMetadataDto => ({
  id: entityId("source-snapshot", text(row["id"])),
  jobId: entityId("job", text(row["job_id"])),
  capturedAt: instant(text(row["captured_at"])),
  createdAt: instant(text(row["created_at"])),
  extractorId: text(row["extractor_id"]),
  extractorVersion: text(row["extractor_version"]),
  contentHash: text(row["content_hash"]),
  retentionClass: text(row["retention_class"]),
  hasRawText: flag(row["has_raw_text"]),
  hasRetainedHtml: flag(row["has_html"]),
  hasStructuredData: flag(row["has_structured"]),
  currentSource: {
    id: entityId("job-source", text(row["source_id"])),
    jobId: entityId("job", text(row["job_id"])),
    connectorId: nullableText(row["connector_id"]),
    externalId: nullableText(row["external_id"]),
    canonicalUrl: row["canonical_url"] === null ? null : webUrl(text(row["canonical_url"])),
    applyUrl: row["apply_url"] === null ? null : webUrl(text(row["apply_url"])),
    firstSeenAt: instant(text(row["first_seen_at"])),
    lastSeenAt: instant(text(row["last_seen_at"])),
    primary: flag(row["is_primary"]),
  },
});
const scope = `FROM source_snapshot s JOIN job_source j ON j.id = s.job_source_id WHERE j.job_id = ? AND s.created_at <= ?`;
export const createJobSourceSnapshotRepository = (
  database: DatabasePort,
): JobSourceSnapshotPort => ({
  listPage: (input) =>
    database.transaction(async (session) => {
      const jobId = entityId("job", input.jobId);
      const asOf = instant(input.asOf);
      if (
        typeof input.includeArchived !== "boolean" ||
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 50
      )
        throw new JobSourceSnapshotError("invalid_state");
      const jobs = await session.query(
        sqlStatement("SELECT archived_at FROM job WHERE id = ?", [jobId]),
      );
      if (jobs.length === 0 || (!input.includeArchived && jobs[0]?.["archived_at"] !== null))
        return undefined;
      const after = input.after;
      const parameters: SqlValue[] = [jobId, asOf];
      let predicate = "";
      if (after !== null) {
        if (
          after.jobId !== jobId ||
          after.includeArchived !== input.includeArchived ||
          after.asOf !== asOf
        )
          throw new JobSourceSnapshotError("cursor_invalidated");
        const id = entityId("source-snapshot", after.id);
        const capturedAt = instant(after.capturedAt);
        const anchor = await session.query(
          sqlStatement(`SELECT s.id ${scope} AND s.id = ? AND s.captured_at = ?`, [
            jobId,
            asOf,
            id,
            capturedAt,
          ]),
        );
        if (anchor.length !== 1) throw new JobSourceSnapshotError("cursor_invalidated");
        predicate = " AND (s.captured_at < ? OR (s.captured_at = ? AND s.id > ?))";
        parameters.push(capturedAt, capturedAt, id);
      }
      const rows = await session.query(
        sqlStatement(
          `SELECT s.id, j.job_id, s.captured_at, s.created_at, s.extractor_id, s.extractor_version, s.content_hash, s.retention_class,
      s.raw_text IS NOT NULL AS has_raw_text, s.sanitized_html IS NOT NULL AS has_html, s.structured_json IS NOT NULL AS has_structured,
      j.id AS source_id, j.connector_id, j.external_id, j.canonical_url, j.apply_url, j.first_seen_at, j.last_seen_at, j.is_primary
      ${scope}${predicate} ORDER BY s.captured_at DESC, s.id ASC LIMIT ?`,
          [...parameters, input.limit + 1],
        ),
      );
      const items = rows.slice(0, input.limit).map(fromRow);
      const hasMore = rows.length > input.limit;
      const last = items.at(-1);
      return {
        jobId,
        includeArchived: input.includeArchived,
        asOf,
        items,
        hasMore,
        nextCursor:
          hasMore && last !== undefined
            ? {
                jobId,
                includeArchived: input.includeArchived,
                asOf,
                capturedAt: last.capturedAt,
                id: last.id,
              }
            : null,
      };
    }),
});
