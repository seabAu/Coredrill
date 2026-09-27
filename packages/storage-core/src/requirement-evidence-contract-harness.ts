import { entityId, instant } from "@coredrill/domain";
import {
  captureRequirementCoverageSnapshotV1,
  compareRequirementCoverageRunsV1,
} from "@coredrill/application";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import { sqlStatement, type DatabasePort } from "./database-port.js";
import { openRequirementEvidenceRepository } from "./requirement-evidence-repository.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";

export interface RequirementEvidenceContractSetup {
  readonly expectedFts5: boolean;
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const IDS = Object.freeze({
  job: entityId("job", "0199a740-0000-7000-8000-000000000001"),
  source: entityId("job-source", "0199a740-0000-7000-8000-000000000002"),
  snapshot: entityId("source-snapshot", "0199a740-0000-7000-8000-000000000003"),
  provenance: entityId("provenance", "0199a740-0000-7000-8000-000000000004"),
  requirement: entityId("job-requirement", "0199a740-0000-7000-8000-000000000005"),
  sensitiveRequirement: entityId("job-requirement", "0199a740-0000-7000-8000-000000000009"),
  skill: entityId("skill", "0199a740-0000-7000-8000-000000000006"),
  sensitiveSkill: entityId("skill", "0199a740-0000-7000-8000-000000000010"),
  employment: entityId("experience", "0199a740-0000-7000-8000-000000000007"),
  skillEvidence: entityId("skill-evidence", "0199a740-0000-7000-8000-000000000008"),
  sourceDocument: entityId("document", "0199a740-0000-7000-8000-000000000011"),
  sourceVersion1: entityId("document-version", "0199a740-0000-7000-8000-000000000012"),
  sourceVersion2: entityId("document-version", "0199a740-0000-7000-8000-000000000013"),
});
const CREATED_AT = instant("2026-09-27T23:00:00.000Z");
const UPDATED_AT = instant("2026-09-27T23:30:00.000Z");

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

const seed = async (database: DatabasePort): Promise<void> => {
  await database.execute(
    sqlStatement(
      "INSERT INTO job(id, title, created_at, updated_at) VALUES (?, 'Platform Lead', ?, ?)",
      [IDS.job, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO job_source(id, job_id, first_seen_at, last_seen_at, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      [IDS.source, IDS.job, CREATED_AT, CREATED_AT, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO source_snapshot(id, job_source_id, captured_at, extractor_id, extractor_version, raw_text, content_hash, retention_class, created_at) VALUES (?, ?, ?, 'fixture', '1', 'TypeScript required', ?, 'standard', ?)",
      [IDS.snapshot, IDS.source, CREATED_AT, "b".repeat(64), CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO provenance(id, source_snapshot_id, extraction_method, source_pointer, source_excerpt, confidence, captured_at, created_at) VALUES (?, ?, 'user', '/requirements/0', 'TypeScript required', 1, ?, ?)",
      [IDS.provenance, IDS.snapshot, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO job_requirement(id, job_id, category, source_category, normalized_text, raw_text, provenance_id, confidence, user_confirmed, sort_order, created_at, updated_at) VALUES (?, ?, 'required', 'required', 'TypeScript delivery', 'Advanced TypeScript experience required.', ?, 1, 1, 0, ?, ?)",
      [IDS.requirement, IDS.job, IDS.provenance, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO job_requirement(id, job_id, category, source_category, normalized_text, raw_text, provenance_id, confidence, user_confirmed, sort_order, created_at, updated_at) VALUES (?, ?, 'required', 'required', 'Legally authorized to work in the United States', 'Are you legally authorized to work in the United States?', ?, 1, 1, 1, ?, ?)",
      [IDS.sensitiveRequirement, IDS.job, IDS.provenance, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO skill(id, canonical_name, category, aliases_json, verification_state, created_at, updated_at) VALUES (?, 'TypeScript', 'language', '[\"TS\"]', 'user_confirmed', ?, ?)",
      [IDS.skill, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO skill(id, canonical_name, category, aliases_json, verification_state, created_at, updated_at) VALUES (?, 'United States work authorization', 'other', '[\"legally authorized to work\"]', 'user_confirmed', ?, ?)",
      [IDS.sensitiveSkill, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO document(id, kind, title, source, created_at, updated_at) VALUES (?, 'resume', 'Source resume', 'local_import', ?, ?)",
      [IDS.sourceDocument, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      `INSERT INTO document_version(
         id, document_id, version_number, content_ir_version, content_ir_json, content_plain,
         created_by, created_at, parent_version_id, content_hash
       ) VALUES (?, ?, 1, 1, ?, 'Initial TypeScript experience', 'user', ?, NULL, ?)`,
      [
        IDS.sourceVersion1,
        IDS.sourceDocument,
        JSON.stringify({ specVersion: 1, document: { type: "doc", content: [] } }),
        CREATED_AT,
        "c".repeat(64),
      ],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO experience(id, organization, role, description, source_document_id, verification_state, created_at, updated_at) VALUES (?, 'Coredrill Labs', 'Platform Engineer', 'Built offline product delivery.', ?, 'user_confirmed', ?, ?)",
      [IDS.employment, IDS.sourceDocument, CREATED_AT, CREATED_AT],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO skill_evidence(id, skill_id, evidence_kind, evidence_id, experience_id, narrative, verification_state, created_at) VALUES (?, ?, 'employment', ?, ?, 'Used TypeScript in this role.', 'user_confirmed', ?)",
      [IDS.skillEvidence, IDS.skill, IDS.employment, IDS.employment, CREATED_AT],
    ),
  );
};

const assertRerunDiffBehavior = async (database: DatabasePort): Promise<void> => {
  const repository = await openRequirementEvidenceRepository(database, { disableFts5: true });
  await repository.select({
    requirementId: IDS.requirement,
    evidenceKind: "employment",
    evidenceId: IDS.employment,
    selectedAt: CREATED_AT,
  });
  await repository.setCoverageDecision({
    requirementId: IDS.requirement,
    state: "gap",
    expectedRowVersion: null,
    decidedAt: CREATED_AT,
  });
  const baselineRetrieval = await repository.retrieve({ requirementId: IDS.requirement, limit: 5 });
  const baseline = captureRequirementCoverageSnapshotV1(baselineRetrieval);

  await database.execute(
    sqlStatement(
      "UPDATE experience SET description = 'Led offline TypeScript delivery.', verification_state = 'imported', updated_at = ?, row_version = row_version + 1 WHERE id = ?",
      [UPDATED_AT, IDS.employment],
    ),
  );
  await database.execute(
    sqlStatement(
      `INSERT INTO document_version(
         id, document_id, version_number, content_ir_version, content_ir_json, content_plain,
         created_by, created_at, parent_version_id, content_hash
       ) VALUES (?, ?, 2, 1, ?, 'Revised TypeScript experience', 'user', ?, ?, ?)`,
      [
        IDS.sourceVersion2,
        IDS.sourceDocument,
        JSON.stringify({ specVersion: 1, document: { type: "doc", content: [] } }),
        UPDATED_AT,
        IDS.sourceVersion1,
        "d".repeat(64),
      ],
    ),
  );

  const currentRetrieval = await repository.retrieve({ requirementId: IDS.requirement, limit: 5 });
  const diff = compareRequirementCoverageRunsV1(
    baseline,
    captureRequirementCoverageSnapshotV1(currentRetrieval),
  );
  assertContract(
    currentRetrieval.coverage.state === "gap" &&
      currentRetrieval.coverage.source === "user-confirmed" &&
      currentRetrieval.coverage.stale &&
      currentRetrieval.coverage.rowVersion === baselineRetrieval.coverage.rowVersion,
    "Coverage re-run overwrote the user-reviewed decision after evidence or document edits.",
  );
  assertContract(
    diff.userDecisionPreserved &&
      diff.changes.some(({ target, field }) => target === "evidence" && field === "summary") &&
      diff.changes.some(
        ({ target, field }) => target === "source-document" && field === "contentHash",
      ),
    "Coverage re-run did not expose a field-level evidence and source-document diff.",
  );
  const baselineSource = diff.baseline.selectedEvidence[0]?.sourceDocument;
  const currentSource = diff.current.selectedEvidence[0]?.sourceDocument;
  assertContract(
    baselineSource?.documentId === IDS.sourceDocument &&
      currentSource?.documentId === IDS.sourceDocument &&
      currentSource.latestVersion?.id === IDS.sourceVersion2,
    "Coverage re-run did not retain source-document provenance across the diff.",
  );
};

const assertBehavior = async (
  database: DatabasePort,
  disableFts5: boolean,
  expectedMode: "fts5" | "normalized-token",
): Promise<void> => {
  const repository = await openRequirementEvidenceRepository(database, { disableFts5 });
  const before = await repository.retrieve({ requirementId: IDS.requirement, limit: 5 });
  assertContract(
    before.capability.mode === expectedMode,
    "Evidence retrieval selected the wrong capability.",
  );
  assertContract(
    before.candidates.some(
      ({ evidenceId, reasons }) => evidenceId === IDS.skill && reasons.includes("exact-skill"),
    ),
    "Evidence retrieval did not produce the exact skill candidate.",
  );
  assertContract(
    before.candidates.some(
      ({ evidenceId, reasons }) =>
        evidenceId === IDS.employment && reasons.includes("skill-relation"),
    ),
    "Evidence retrieval did not expand the reviewed skill relation.",
  );
  assertContract(
    before.selectedEvidence.length === 0,
    "Retrieval mutated the evidence selection set.",
  );

  await repository.select({
    requirementId: IDS.requirement,
    evidenceKind: "skill",
    evidenceId: IDS.skill,
    selectedAt: CREATED_AT,
  });
  const selected = await repository.retrieve({ requirementId: IDS.requirement, limit: 5 });
  assertContract(
    selected.selectedEvidence.length === 1 &&
      selected.selectedEvidence[0]?.evidenceId === IDS.skill,
    "Explicit evidence selection did not persist.",
  );
  assertContract(
    await repository.remove({
      requirementId: IDS.requirement,
      evidenceKind: "skill",
      evidenceId: IDS.skill,
    }),
    "Explicit evidence removal did not persist.",
  );
};

const assertCoverageBehavior = async (database: DatabasePort): Promise<void> => {
  const repository = await openRequirementEvidenceRepository(database, { disableFts5: true });
  const unknown = await repository.retrieve({ requirementId: IDS.requirement, limit: 5 });
  assertContract(
    unknown.coverage.state === "unknown" && unknown.coverage.source === "deterministic-rule",
    "Missing evidence did not remain explicitly Unknown.",
  );
  await repository.select({
    requirementId: IDS.requirement,
    evidenceKind: "skill",
    evidenceId: IDS.skill,
    selectedAt: CREATED_AT,
  });
  const strength = await repository.retrieve({ requirementId: IDS.requirement, limit: 5 });
  assertContract(
    strength.coverage.state === "strength" && strength.coverage.explanation.length > 30,
    "Reliable structured evidence did not produce explainable Strength coverage.",
  );
  const gap = await repository.setCoverageDecision({
    requirementId: IDS.requirement,
    state: "gap",
    expectedRowVersion: null,
    decidedAt: CREATED_AT,
  });
  assertContract(
    gap.state === "gap" && gap.source === "user-confirmed" && gap.rowVersion === 1,
    "Explicit Gap coverage did not persist.",
  );
  await repository.remove({
    requirementId: IDS.requirement,
    evidenceKind: "skill",
    evidenceId: IDS.skill,
  });
  const stale = await repository.retrieve({ requirementId: IDS.requirement, limit: 5 });
  assertContract(
    stale.coverage.state === "gap" && stale.coverage.stale,
    "Changed evidence silently replaced the reviewed coverage decision.",
  );
  const reset = await repository.resetCoverageDecision({
    requirementId: IDS.requirement,
    expectedRowVersion: 1,
  });
  assertContract(
    reset.state === "unknown" && reset.source === "deterministic-rule",
    "Reset did not restore deterministic Unknown coverage.",
  );
};

const assertSensitiveAnswerBehavior = async (database: DatabasePort): Promise<void> => {
  const repository = await openRequirementEvidenceRepository(database, { disableFts5: true });
  const retrieval = await repository.retrieve({
    requirementId: IDS.sensitiveRequirement,
    limit: 5,
  });
  assertContract(
    retrieval.answerPolicy.handling === "direct-private-answer" &&
      retrieval.answerPolicy.kind === "work-authorization-legal",
    "Sensitive work authorization was not classified as a direct private answer.",
  );
  assertContract(
    retrieval.queryTerms.length === 0 &&
      retrieval.candidates.length === 0 &&
      retrieval.selectedEvidence.length === 0,
    "Sensitive work authorization leaked inferred evidence retrieval.",
  );
  assertContract(
    retrieval.coverage.state === "unknown" && retrieval.coverage.source === "deterministic-rule",
    "Sensitive work authorization did not remain explicitly unanswered.",
  );

  let selectionRejected = false;
  try {
    await repository.select({
      requirementId: IDS.sensitiveRequirement,
      evidenceKind: "skill",
      evidenceId: IDS.sensitiveSkill,
      selectedAt: CREATED_AT,
    });
  } catch (error) {
    selectionRejected = error instanceof TypeError;
  }
  assertContract(selectionRejected, "Sensitive work authorization accepted inferred evidence.");

  let coverageRejected = false;
  try {
    await repository.setCoverageDecision({
      requirementId: IDS.sensitiveRequirement,
      state: "strength",
      expectedRowVersion: null,
      decidedAt: CREATED_AT,
    });
  } catch (error) {
    coverageRejected = error instanceof TypeError;
  }
  assertContract(coverageRejected, "Sensitive work authorization accepted inferred coverage.");

  const selectionRows = await database.query<{ readonly count: number }>(
    sqlStatement(
      "SELECT COUNT(*) AS count FROM job_requirement_evidence_selection WHERE requirement_id = ?",
      [IDS.sensitiveRequirement],
    ),
  );
  const coverageRows = await database.query<{ readonly count: number }>(
    sqlStatement(
      "SELECT COUNT(*) AS count FROM job_requirement_coverage_decision WHERE requirement_id = ?",
      [IDS.sensitiveRequirement],
    ),
  );
  assertContract(
    selectionRows[0]?.count === 0 && coverageRows[0]?.count === 0,
    "Rejected sensitive inference produced a durable write.",
  );
};

export const createRequirementEvidenceContractSuite = (
  setup: RequirementEvidenceContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.requirementEvidence.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.requirementEvidence.cases
          .accelerateWithFts5,
        run: async (database) => {
          await setup.migrate(database);
          await seed(database);
          await assertBehavior(database, false, setup.expectedFts5 ? "fts5" : "normalized-token");
        },
      },
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.requirementEvidence.cases
          .preserveFallback,
        run: async (database) => {
          await setup.migrate(database);
          await seed(database);
          await assertBehavior(database, true, "normalized-token");
        },
      },
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.requirementEvidence.cases
          .preserveCoverageDecisions,
        run: async (database) => {
          await setup.migrate(database);
          await seed(database);
          await assertCoverageBehavior(database);
        },
      },
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.requirementEvidence.cases
          .blockSensitiveAnswerInference,
        run: async (database) => {
          await setup.migrate(database);
          await seed(database);
          await assertSensitiveAnswerBehavior(database);
        },
      },
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.requirementEvidence.cases
          .rerunCoverageAfterSourceEdits,
        run: async (database) => {
          await setup.migrate(database);
          await seed(database);
          await assertRerunDiffBehavior(database);
        },
      },
    ],
  );
