import {
  isJobRequirementHeading,
  parseJobRequirementProposals,
  type JobRequirementProposalDto,
  type JobRequirementParseResultDto,
  type JobRequirementSourceBlockInput,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { sqlStatement, type DatabaseSession } from "@coredrill/storage-core";

export type PendingStoredRequirementProposal = Omit<JobRequirementProposalDto, "provenanceId">;

export interface StoredRequirementSource {
  readonly snapshotId: string | null;
  readonly proposals: readonly PendingStoredRequirementProposal[];
  readonly notice: string | null;
}

/** A line coordinate in immutable retained text, never a URL to fetch. */
export const loadStoredRequirementSource = async (
  session: DatabaseSession,
  id: string,
  snapshotId?: string,
): Promise<StoredRequirementSource> => {
  const jobId = entityId("job", id);
  const rows = await session.query(
    sqlStatement(
      `SELECT source_snapshot.id, source_snapshot.raw_text
     FROM source_snapshot
     INNER JOIN job_source ON job_source.id = source_snapshot.job_source_id
     INNER JOIN job ON job.id = job_source.job_id
     WHERE job.id = ? AND job.archived_at IS NULL
       ${snapshotId === undefined ? "" : "AND source_snapshot.id = ?"}
     ORDER BY source_snapshot.captured_at DESC, source_snapshot.id DESC LIMIT 1`,
      snapshotId === undefined ? [jobId] : [jobId, entityId("source-snapshot", snapshotId)],
    ),
  );
  const source = rows[0];
  if (typeof source?.["id"] !== "string" || typeof source["raw_text"] !== "string") {
    return {
      snapshotId: null,
      proposals: [],
      notice: "No retained listing text is available to parse.",
    };
  }
  const sourceId = source["id"];
  const rawText = source["raw_text"];
  let parsed: JobRequirementParseResultDto;
  try {
    if (rawText.length > 524_288) throw new TypeError("Source exceeds the parser budget.");
    const lines = rawText.split(/\r\n|\n|\r/u);
    if (lines.length > 512) throw new TypeError("Source exceeds the parser budget.");
    parsed = parseJobRequirementProposals({
      jobId,
      blocks: lines
        .map<JobRequirementSourceBlockInput>((line, index) => ({
          kind: isJobRequirementHeading(line)
            ? "heading"
            : /^\s*(?:[-*•‣▪◦]|\d{1,3}[.)])\s/u.test(line)
              ? "item"
              : "paragraph",
          // Temporary parser identity only. Acceptance allocates the real provenance row.
          provenanceId: sourceId,
          sourcePointer: `/raw_text/lines/${String(index + 1)}`,
          sourceExcerpt: line,
          text: isJobRequirementHeading(line) ? line.replace(/^\s*#{1,3}\s+/u, "") : line,
        }))
        .filter(({ text }) => text.trim().length !== 0),
    });
  } catch {
    return {
      snapshotId: sourceId,
      proposals: [],
      notice:
        "Retained text could not be parsed within the local parser limits. The saved job and source are unchanged.",
    };
  }
  const accepted = await session.query(
    sqlStatement(
      `SELECT provenance.source_pointer FROM job_requirement
       INNER JOIN provenance ON provenance.id = job_requirement.provenance_id
       WHERE job_requirement.job_id = ? AND provenance.source_snapshot_id = ?`,
      [jobId, sourceId],
    ),
  );
  const pointers = new Set(accepted.map((row) => row["source_pointer"]));
  return Object.freeze({
    snapshotId: sourceId,
    proposals: Object.freeze(
      parsed.proposals
        .filter((proposal) => !pointers.has(proposal.sourcePointer))
        .map(({ provenanceId: _temporaryIdentity, ...proposal }) =>
          Object.freeze({ ...proposal, id: `${sourceId}/${proposal.id}` }),
        ),
    ),
    notice:
      "Proposals use the latest retained snapshot. Rejection lasts for this view only; reload reviews the unchanged source again.",
  });
};
