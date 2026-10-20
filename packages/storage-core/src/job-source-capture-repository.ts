import { JobSourceCaptureError, type JobSourceCapturePort } from "@coredrill/application";
import { CAPTURE_ENVELOPE_LIMITS } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";
import { sqlStatement, type DatabasePort, type SqlValue } from "./database-port.js";

const text = (value: SqlValue | undefined): string => {
  if (typeof value !== "string") throw new JobSourceCaptureError("invalid_state");
  return value;
};
/** Resolve original capture evidence, never mutable field_value/job_requirement projections. */
export const createJobSourceCaptureRepository = (database: DatabasePort): JobSourceCapturePort => ({
  readCapture: async (input) => {
    const jobId = entityId("job", input.jobId);
    const snapshotId = entityId("source-snapshot", input.snapshotId);
    const asOf = instant(input.asOf);
    if (typeof input.includeArchived !== "boolean")
      throw new JobSourceCaptureError("invalid_state");
    const rows = await database.query(
      sqlStatement(
        `SELECT s.captured_at, s.content_hash,
              r.envelope_id, c.envelope_checksum,
              CASE WHEN r.envelope_id IS NOT NULL
                        AND length(CAST(c.envelope_json AS BLOB)) <= ?
                   THEN c.envelope_json ELSE NULL END AS envelope_json
       FROM source_snapshot s
       JOIN job_source j ON j.id = s.job_source_id
       JOIN job p ON p.id = j.job_id
       LEFT JOIN capture_inbox c ON c.content_hash = s.content_hash
         AND c.captured_at = s.captured_at AND c.received_at <= s.created_at
         AND s.extractor_id = 'coredrill.capture-envelope'
         AND s.extractor_version = '1.0.0' AND s.retention_class = 'capture_review'
       LEFT JOIN capture_review_item r ON r.envelope_id = c.envelope_id
         AND r.state = 'resolved' AND r.resolved_job_id = p.id
         AND r.updated_at = s.created_at
       WHERE p.id = ? AND s.id = ? AND s.created_at <= ?
         AND (? = 1 OR p.archived_at IS NULL)`,
        [CAPTURE_ENVELOPE_LIMITS.maxBytes, jobId, snapshotId, asOf, input.includeArchived ? 1 : 0],
      ),
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    if (rows.length !== 1) throw new JobSourceCaptureError("invalid_state");
    return {
      ...input,
      capturedAt: instant(text(row["captured_at"])),
      contentHash: text(row["content_hash"]),
      receipt:
        row["envelope_id"] === null
          ? null
          : {
              envelopeId: text(row["envelope_id"]),
              checksum: text(row["envelope_checksum"]),
              envelopeJson: text(row["envelope_json"]),
            },
    };
  },
});
