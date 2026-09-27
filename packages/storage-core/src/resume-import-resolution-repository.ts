import type {
  ResumeEvidenceProposalDto,
  ResumeImportResolutionDto,
  ResumeImportResolutionPortInput,
  ResumeImportReviewPort,
  ResumeProposalTarget,
} from "@coredrill/application";
import { compareDateOnly, entityId, instant, type EntityId } from "@coredrill/domain";

import { createCareerRepositories } from "./career-repositories.js";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type QueryRow,
} from "./database-port.js";

interface ProposalRow extends QueryRow {
  readonly id: string;
  readonly import_run_id: string;
  readonly target_kind: string;
  readonly field_name: string;
  readonly group_key: string;
  readonly proposed_value: string;
  readonly source_pointer: string;
  readonly source_excerpt: string;
  readonly confidence: number;
}

interface SkillCandidateRow extends QueryRow {
  readonly canonical_name: string;
}

interface EmploymentCandidateRow extends QueryRow {
  readonly organization: string;
  readonly role: string;
}

const TARGETS = new Set<ResumeProposalTarget>([
  "accomplishment",
  "basics",
  "certification",
  "education",
  "employment",
  "project",
  "publication",
  "skill",
  "unclassified",
  "volunteer",
]);

const requiredText = (value: unknown, maximum: number, label: string): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.includes("\u0000")
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value.trim();
};

const normalizedWords = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim()
    .replaceAll(/\s+/gu, " ");

const SKILL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ".net": "dotnet",
  "c#": "csharp",
  js: "javascript",
  node: "nodejs",
  "node.js": "nodejs",
  postgres: "postgresql",
  ts: "typescript",
});

const normalizedSkill = (value: string): string => {
  const normalized = normalizedWords(value);
  return SKILL_ALIASES[normalized] ?? normalized;
};

const mapProposal = (row: ProposalRow): ResumeEvidenceProposalDto => {
  if (!TARGETS.has(row.target_kind as ResumeProposalTarget)) {
    throw new Error("Stored resume proposal target is invalid.");
  }
  return Object.freeze({
    confidence: row.confidence,
    evidenceStatus: "proposal",
    fieldName: requiredText(row.field_name, 64, "Proposal field"),
    groupKey: requiredText(row.group_key, 128, "Proposal group"),
    id: entityId("career-import-proposal", row.id),
    importRunId: entityId("import-run", row.import_run_id),
    proposedValue: requiredText(row.proposed_value, 20_000, "Proposal value"),
    reviewState: "pending",
    sourceExcerpt:
      typeof row.source_excerpt === "string" && row.source_excerpt.length <= 240
        ? row.source_excerpt
        : (() => {
            throw new Error("Stored proposal excerpt is invalid.");
          })(),
    sourcePointer: requiredText(row.source_pointer, 300, "Proposal pointer"),
    target: row.target_kind as ResumeProposalTarget,
  });
};

const proposalValue = (
  proposals: readonly ResumeEvidenceProposalDto[],
  field: string,
): string | null => proposals.find(({ fieldName }) => fieldName === field)?.proposedValue ?? null;

const loadUnresolvedGroup = async (
  transaction: DatabaseTransaction,
  importRunId: EntityId<"import-run">,
  groupKey: string,
): Promise<readonly ResumeEvidenceProposalDto[]> => {
  const rows = await transaction.query<ProposalRow>(
    sqlStatement(
      `SELECT p.id, p.import_run_id, p.target_kind, p.field_name, p.group_key,
              p.proposed_value, p.source_pointer, p.source_excerpt, p.confidence
       FROM career_import_proposal p
       LEFT JOIN career_import_resolution_proposal rp ON rp.proposal_id = p.id
       WHERE p.import_run_id = ? AND p.group_key = ? AND rp.proposal_id IS NULL
       ORDER BY p.created_at, p.id`,
      [importRunId, groupKey],
    ),
  );
  if (rows.length === 0) throw new Error("Resume proposal group is no longer pending.");
  return Object.freeze(rows.map(mapProposal));
};

const assertSingleTarget = (
  proposals: readonly ResumeEvidenceProposalDto[],
): ResumeProposalTarget => {
  const target = proposals[0]?.target;
  if (target === undefined || proposals.some((proposal) => proposal.target !== target)) {
    throw new Error("Resume proposal group target is invalid.");
  }
  return target;
};

const resolveSkill = async (
  transaction: DatabaseTransaction,
  input: ResumeImportResolutionPortInput,
  proposals: readonly ResumeEvidenceProposalDto[],
): Promise<EntityId<"skill">> => {
  const canonicalName = proposalValue(proposals, "canonicalName");
  if (canonicalName === null || proposals.length !== 1) {
    throw new Error("Skill proposal group is incomplete.");
  }
  if (input.decision === "accepted_new") {
    if (input.newTargetId === null) throw new Error("New skill identity is missing.");
    const stored = await createCareerRepositories(transaction).skills.insert({
      aliases: Object.freeze([]),
      archivedAt: null,
      canonicalName,
      category: null,
      createdAt: input.resolvedAt,
      id: entityId("skill", input.newTargetId),
      sourceDocumentId: null,
      updatedAt: input.resolvedAt,
      verificationState: "imported",
    });
    return stored.id;
  }
  if (input.decision !== "merged_existing" || input.targetId === null) {
    throw new Error("Skill merge target is missing.");
  }
  const id = entityId("skill", input.targetId);
  const rows = await transaction.query<SkillCandidateRow>(
    sqlStatement("SELECT canonical_name FROM skill WHERE id = ? AND archived_at IS NULL", [id]),
  );
  const candidate = rows[0];
  if (
    candidate === undefined ||
    normalizedSkill(candidate.canonical_name) !== normalizedSkill(canonicalName)
  ) {
    throw new Error("Skill merge target is not a reviewed conflict candidate.");
  }
  return id;
};

const resolveEmployment = async (
  transaction: DatabaseTransaction,
  input: ResumeImportResolutionPortInput,
  proposals: readonly ResumeEvidenceProposalDto[],
): Promise<EntityId<"experience">> => {
  const organization = proposalValue(proposals, "organization");
  const role = proposalValue(proposals, "role");
  if (organization === null || role === null) {
    throw new Error("Employment proposal group is incomplete.");
  }
  if (
    input.startDate !== null &&
    input.endDate !== null &&
    compareDateOnly(input.startDate, input.endDate) > 0
  ) {
    throw new TypeError("Employment resolution dates are inverted.");
  }
  if (input.current && input.endDate !== null) {
    throw new TypeError("Current employment resolution cannot have an end date.");
  }
  if (input.decision === "accepted_new") {
    if (input.newTargetId === null) throw new Error("New employment identity is missing.");
    const stored = await createCareerRepositories(transaction).employment.insert({
      archivedAt: null,
      createdAt: input.resolvedAt,
      current: input.current,
      description: "",
      endDate: input.endDate,
      id: entityId("experience", input.newTargetId),
      organization,
      role,
      sourceDocumentId: null,
      startDate: input.startDate,
      updatedAt: input.resolvedAt,
      verificationState: "imported",
    });
    return stored.id;
  }
  if (input.decision !== "merged_existing" || input.targetId === null) {
    throw new Error("Employment merge target is missing.");
  }
  const id = entityId("experience", input.targetId);
  const rows = await transaction.query<EmploymentCandidateRow>(
    sqlStatement("SELECT organization, role FROM experience WHERE id = ? AND archived_at IS NULL", [
      id,
    ]),
  );
  const candidate = rows[0];
  if (
    candidate === undefined ||
    normalizedWords(candidate.organization) !== normalizedWords(organization) ||
    normalizedWords(candidate.role) !== normalizedWords(role)
  ) {
    throw new Error("Employment merge target is not a reviewed duplicate.");
  }
  return id;
};

export class ResumeImportResolutionRepository implements ResumeImportReviewPort {
  public constructor(private readonly database: DatabasePort) {}

  public async resolve(input: ResumeImportResolutionPortInput): Promise<ResumeImportResolutionDto> {
    const importRunId = entityId("import-run", input.importRunId);
    const resolutionId = entityId("career-import-resolution", input.resolutionId);
    const groupKey = requiredText(input.groupKey, 128, "Resume proposal group");
    const resolvedAt = instant(input.resolvedAt);

    return this.database.transaction(async (transaction) => {
      const proposals = await loadUnresolvedGroup(transaction, importRunId, groupKey);
      const proposalTarget = assertSingleTarget(proposals);
      let targetId: EntityId | null = null;

      if (input.decision !== "rejected") {
        if (input.target !== "employment" && input.target !== "skill") {
          throw new Error("Resume proposal group is not actionable as the requested target.");
        }
        if (input.target !== proposalTarget) {
          throw new Error("Resume proposal group is not actionable as the requested target.");
        }
        targetId =
          input.target === "skill"
            ? await resolveSkill(transaction, input, proposals)
            : await resolveEmployment(transaction, input, proposals);
      }

      const values =
        input.target === "employment"
          ? JSON.stringify({
              current: input.current,
              endDate: input.endDate,
              startDate: input.startDate,
            })
          : input.target === "skill"
            ? JSON.stringify({ canonicalName: proposalValue(proposals, "canonicalName") })
            : "{}";
      const inserted = await transaction.execute(
        sqlStatement(
          `INSERT INTO career_import_resolution(
             id, import_run_id, group_key, target_kind, decision, target_id,
             resolved_values_json, resolved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            resolutionId,
            importRunId,
            groupKey,
            input.target,
            input.decision,
            targetId,
            values,
            resolvedAt,
          ],
        ),
      );
      if (inserted.rowsAffected !== 1) throw new Error("Resume resolution was not inserted.");

      for (const proposal of proposals) {
        const linked = await transaction.execute(
          sqlStatement(
            "INSERT INTO career_import_resolution_proposal(resolution_id, proposal_id, linked_at) VALUES (?, ?, ?)",
            [resolutionId, proposal.id, resolvedAt],
          ),
        );
        if (linked.rowsAffected !== 1) throw new Error("Resume proposal resolution link failed.");
      }

      return Object.freeze({
        decision: input.decision,
        groupKey,
        id: resolutionId,
        importRunId,
        resolvedAt,
        target: input.target,
        targetId,
      });
    });
  }
}

export const createResumeImportResolutionRepository = (
  database: DatabasePort,
): ResumeImportResolutionRepository => new ResumeImportResolutionRepository(database);
