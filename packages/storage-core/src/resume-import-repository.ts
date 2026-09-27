import {
  RESUME_IMPORT_FORMATS,
  RESUME_IMPORT_LIMITS,
  RESUME_PROPOSAL_TARGETS,
  type ResumeEvidenceProposalDto,
  type ResumeImportBlockInput,
  type ResumeImportPortInput,
  type ResumeImportQueueItemDto,
  type ResumeProposalTarget,
} from "@coredrill/application";
import { entityId, instant, type EntityId } from "@coredrill/domain";

import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";

interface ImportRunRow extends QueryRow {
  readonly completed_at: string;
  readonly id: string;
  readonly source_byte_length: number;
  readonly source_format: string;
  readonly source_hash: string;
  readonly source_media_type: string;
  readonly source_name: string;
  readonly status: string;
  readonly summary_json: string;
}

interface ProposalRow extends QueryRow {
  readonly confidence: number;
  readonly evidence_status: string;
  readonly field_name: string;
  readonly group_key: string;
  readonly id: string;
  readonly import_run_id: string;
  readonly proposed_value: string;
  readonly review_state: string;
  readonly source_excerpt: string;
  readonly source_pointer: string;
  readonly target_kind: string;
}

interface StoredSummary {
  readonly pageCount: number | null;
  readonly proposalCount: number;
  readonly warnings: readonly string[];
}

const SHA256_PATTERN = /^[a-f\d]{64}$/u;
const FIELD_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/u;

const text = (value: unknown, maximum: number, label: string, allowEmpty = false): string => {
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) {
    throw new TypeError(`${label} is invalid.`);
  }
  const cleaned = value.trim().replaceAll(/\s+/gu, " ");
  if (!allowEmpty && cleaned.length === 0) throw new TypeError(`${label} is required.`);
  return cleaned;
};

const integer = (value: unknown, minimum: number, maximum: number, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value as number;
};

const checkedConfidence = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("Resume proposal confidence is invalid.");
  }
  return value;
};

const checkedTarget = (value: unknown): ResumeProposalTarget => {
  if (!RESUME_PROPOSAL_TARGETS.includes(value as ResumeProposalTarget)) {
    throw new TypeError("Resume proposal target is invalid.");
  }
  return value as ResumeProposalTarget;
};

const checkedBlocks = (
  value: readonly ResumeImportBlockInput[],
): readonly ResumeImportBlockInput[] => {
  if (value.length > RESUME_IMPORT_LIMITS.maxBlocks) {
    throw new TypeError("Resume import source mapping is invalid.");
  }
  return Object.freeze(
    value.map((block: ResumeImportBlockInput) =>
      Object.freeze({
        sourceExcerpt: text(
          block.sourceExcerpt,
          RESUME_IMPORT_LIMITS.maxSourceExcerptCharacters,
          "Resume source excerpt",
          true,
        ),
        sourcePointer: text(
          block.sourcePointer,
          RESUME_IMPORT_LIMITS.maxSourcePointerCharacters,
          "Resume source pointer",
        ),
        text: text(block.text, RESUME_IMPORT_LIMITS.maxBlockCharacters, "Resume source block"),
      }),
    ),
  );
};

const checkedProposal = (
  value: ResumeEvidenceProposalDto,
  importRunId: EntityId<"import-run">,
): ResumeEvidenceProposalDto => {
  const evidenceStatus: unknown = value.evidenceStatus;
  const reviewState: unknown = value.reviewState;
  if (evidenceStatus !== "proposal" || reviewState !== "pending") {
    throw new TypeError("Resume proposal state is invalid.");
  }
  if (entityId("import-run", value.importRunId) !== importRunId) {
    throw new TypeError("Resume proposal belongs to a different import run.");
  }
  const fieldName = text(value.fieldName, 64, "Resume proposal field");
  if (!FIELD_PATTERN.test(fieldName)) throw new TypeError("Resume proposal field is invalid.");
  return Object.freeze({
    confidence: checkedConfidence(value.confidence),
    evidenceStatus: "proposal",
    fieldName,
    groupKey: text(value.groupKey, 128, "Resume proposal group"),
    id: entityId("career-import-proposal", value.id),
    importRunId,
    proposedValue: text(
      value.proposedValue,
      RESUME_IMPORT_LIMITS.maxBlockCharacters,
      "Resume proposed value",
    ),
    reviewState: "pending",
    sourceExcerpt: text(
      value.sourceExcerpt,
      RESUME_IMPORT_LIMITS.maxSourceExcerptCharacters,
      "Resume source excerpt",
      true,
    ),
    sourcePointer: text(
      value.sourcePointer,
      RESUME_IMPORT_LIMITS.maxSourcePointerCharacters,
      "Resume source pointer",
    ),
    target: checkedTarget(value.target),
  });
};

const parseSummary = (value: string): StoredSummary => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Stored resume import summary is invalid JSON.", { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored resume import summary is invalid.");
  }
  const summary = parsed as Readonly<Record<string, unknown>>;
  const rawWarnings = summary["warnings"];
  if (!Array.isArray(rawWarnings) || rawWarnings.length > RESUME_IMPORT_LIMITS.maxWarnings) {
    throw new Error("Stored resume import warnings are invalid.");
  }
  const pageCount = summary["pageCount"];
  return Object.freeze({
    pageCount: pageCount === null ? null : integer(pageCount, 0, 500, "Stored resume page count"),
    proposalCount: integer(
      summary["proposalCount"],
      0,
      RESUME_IMPORT_LIMITS.maxProposals,
      "Stored resume proposal count",
    ),
    warnings: Object.freeze(
      rawWarnings.map((warning) => text(warning, 500, "Stored resume import warning")),
    ),
  });
};

const mapProposal = (row: ProposalRow): ResumeEvidenceProposalDto => {
  if (row.evidence_status !== "proposal" || row.review_state !== "pending") {
    throw new Error("Stored resume proposal state is invalid.");
  }
  const fieldName = text(row.field_name, 64, "Stored resume proposal field");
  if (!FIELD_PATTERN.test(fieldName)) throw new Error("Stored resume proposal field is invalid.");
  return Object.freeze({
    confidence: checkedConfidence(row.confidence),
    evidenceStatus: "proposal",
    fieldName,
    groupKey: text(row.group_key, 128, "Stored resume proposal group"),
    id: entityId("career-import-proposal", row.id),
    importRunId: entityId("import-run", row.import_run_id),
    proposedValue: text(
      row.proposed_value,
      RESUME_IMPORT_LIMITS.maxBlockCharacters,
      "Stored resume proposed value",
    ),
    reviewState: "pending",
    sourceExcerpt: text(
      row.source_excerpt,
      RESUME_IMPORT_LIMITS.maxSourceExcerptCharacters,
      "Stored resume source excerpt",
      true,
    ),
    sourcePointer: text(
      row.source_pointer,
      RESUME_IMPORT_LIMITS.maxSourcePointerCharacters,
      "Stored resume source pointer",
    ),
    target: checkedTarget(row.target_kind),
  });
};

const PROPOSALS_FOR_RUN = `
  SELECT id, import_run_id, target_kind, field_name, group_key, proposed_value,
         source_pointer, source_excerpt, confidence, evidence_status, review_state
  FROM career_import_proposal
  WHERE import_run_id = ? AND review_state = 'pending'
  ORDER BY created_at, id
`;

export class ResumeImportRepository {
  public constructor(private readonly database: DatabasePort) {}

  public async enqueue(input: ResumeImportPortInput): Promise<ResumeImportQueueItemDto> {
    const importRunId = entityId("import-run", input.id);
    const startedAt = instant(input.startedAt);
    const completedAt = instant(input.completedAt);
    const blocks = checkedBlocks(input.blocks);
    if (!RESUME_IMPORT_FORMATS.includes(input.source.format)) {
      throw new TypeError("Resume import format is invalid.");
    }
    const sha256 = text(input.source.sha256, 64, "Resume import hash");
    if (!SHA256_PATTERN.test(sha256)) throw new TypeError("Resume import hash is invalid.");
    const proposals = Object.freeze(
      input.proposals.map((proposal) => checkedProposal(proposal, importRunId)),
    );
    const status: unknown = input.status;
    if (
      status !== "completed" ||
      input.proposalCount !== proposals.length ||
      proposals.length > RESUME_IMPORT_LIMITS.maxProposals
    ) {
      throw new TypeError("Resume import status or proposal count is invalid.");
    }
    const warnings = Object.freeze(
      input.warnings.map((warning) => text(warning, 500, "Resume import warning")),
    );
    if (warnings.length > RESUME_IMPORT_LIMITS.maxWarnings) {
      throw new TypeError("Resume import has too many warnings.");
    }
    const summary = JSON.stringify({
      pageCount: input.source.pageCount,
      proposalCount: proposals.length,
      warnings,
    });
    const mapping = JSON.stringify(blocks);

    await this.database.transaction(async (transaction) => {
      const inserted = await transaction.execute(
        sqlStatement(
          `INSERT INTO import_run(
             id, kind, source_name, source_format, source_media_type, source_byte_length,
             source_hash, source_mapping_json, started_at, completed_at, status, summary_json
           ) VALUES (?, 'resume', ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
          [
            importRunId,
            text(input.source.fileName, RESUME_IMPORT_LIMITS.maxFileNameCharacters, "Resume name"),
            input.source.format,
            text(
              input.source.mediaType,
              RESUME_IMPORT_LIMITS.maxMediaTypeCharacters,
              "Resume media type",
            ),
            integer(
              input.source.byteLength,
              1,
              RESUME_IMPORT_LIMITS.maxFileBytes,
              "Resume byte length",
            ),
            sha256,
            mapping,
            startedAt,
            completedAt,
            summary,
          ],
        ),
      );
      if (inserted.rowsAffected !== 1) throw new Error("Resume import run was not inserted.");

      for (const proposal of proposals) {
        const result = await transaction.execute(
          sqlStatement(
            `INSERT INTO career_import_proposal(
               id, import_run_id, target_kind, field_name, group_key, proposed_value,
               source_pointer, source_excerpt, confidence, evidence_status, review_state, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposal', 'pending', ?)`,
            [
              proposal.id,
              importRunId,
              proposal.target,
              proposal.fieldName,
              proposal.groupKey,
              proposal.proposedValue,
              proposal.sourcePointer,
              proposal.sourceExcerpt,
              proposal.confidence,
              completedAt,
            ],
          ),
        );
        if (result.rowsAffected !== 1) throw new Error("Resume proposal was not inserted.");
      }
    });

    const stored = await this.findById(importRunId);
    if (stored === undefined) throw new Error("Inserted resume import is missing.");
    return stored;
  }

  public async findById(id: EntityId<"import-run">): Promise<ResumeImportQueueItemDto | undefined> {
    const rows = await this.database.query<ImportRunRow>(
      sqlStatement(
        `SELECT id, source_name, source_format, source_media_type, source_byte_length,
                source_hash, completed_at, status, summary_json
         FROM import_run WHERE id = ? AND kind = 'resume'`,
        [entityId("import-run", id)],
      ),
    );
    return rows[0] === undefined ? undefined : this.mapRun(rows[0]);
  }

  public async listPending(): Promise<readonly ResumeImportQueueItemDto[]> {
    const rows = await this.database.query<ImportRunRow>(
      sqlStatement(
        `SELECT id, source_name, source_format, source_media_type, source_byte_length,
                source_hash, completed_at, status, summary_json
         FROM import_run
         WHERE kind = 'resume' AND status = 'completed'
         ORDER BY completed_at DESC, id`,
      ),
    );
    return Object.freeze(await Promise.all(rows.map((row) => this.mapRun(row))));
  }

  private async mapRun(row: ImportRunRow): Promise<ResumeImportQueueItemDto> {
    if (row.status !== "completed" || !RESUME_IMPORT_FORMATS.includes(row.source_format as never)) {
      throw new Error("Stored resume import state is invalid.");
    }
    const importRunId = entityId("import-run", row.id);
    const proposalRows = await this.database.query<ProposalRow>(
      sqlStatement(PROPOSALS_FOR_RUN, [importRunId]),
    );
    const proposals = Object.freeze(proposalRows.map(mapProposal));
    const summary = parseSummary(row.summary_json);
    if (summary.proposalCount !== proposals.length) {
      throw new Error("Stored resume import proposal count is invalid.");
    }
    const sha256 = text(row.source_hash, 64, "Stored resume import hash");
    if (!SHA256_PATTERN.test(sha256)) throw new Error("Stored resume import hash is invalid.");
    return Object.freeze({
      completedAt: instant(row.completed_at),
      id: importRunId,
      proposalCount: proposals.length,
      proposals,
      source: Object.freeze({
        byteLength: integer(
          row.source_byte_length,
          1,
          RESUME_IMPORT_LIMITS.maxFileBytes,
          "Stored resume byte length",
        ),
        fileName: text(
          row.source_name,
          RESUME_IMPORT_LIMITS.maxFileNameCharacters,
          "Stored resume name",
        ),
        format: row.source_format as ResumeImportQueueItemDto["source"]["format"],
        mediaType: text(
          row.source_media_type,
          RESUME_IMPORT_LIMITS.maxMediaTypeCharacters,
          "Stored resume media type",
        ),
        pageCount: summary.pageCount,
        sha256,
      }),
      status: "completed",
      warnings: summary.warnings,
    });
  }
}

export const createResumeImportRepository = (database: DatabasePort): ResumeImportRepository =>
  new ResumeImportRepository(database);
