import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { dateOnly, entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createCareerRepositories,
  createCareerStoryRepository,
  createJobRequirementRepository,
  defineSqlMigrations,
  openRequirementEvidenceRepository,
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlStatement,
  type StorageDiagnostics,
} from "../src/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const migrations = defineSqlMigrations(
  readdirSync(path.join(repositoryRoot, "migrations"))
    .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
    .sort()
    .map((fileName, index) => {
      const sql = readFileSync(path.join(repositoryRoot, "migrations", fileName), "utf8");
      return {
        version: index + 1,
        name: fileName.slice(5, -4).replaceAll("_", "-"),
        sha256: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
);

class NodeEvidenceDatabase implements DatabasePort {
  private readonly database = new DatabaseSync(":memory:");
  public constructor() {
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }
  public async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    return this.database.prepare(statement.sql).all(...statement.parameters) as Row[];
  }
  public async execute(statement: SqlStatement): Promise<ExecuteResult> {
    const result = this.database.prepare(statement.sql).run(...statement.parameters);
    return Object.freeze({ rowsAffected: Number(result.changes) });
  }
  public async transaction<Result>(work: (transaction: DatabaseTransaction) => Promise<Result>) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const value = await work({
        query: (statement) => this.query(statement),
        execute: (statement) => this.execute(statement),
      });
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Portable export is outside this retrieval test.");
  }
  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-evidence",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 148,
    });
  }
  public close(): void {
    this.database.close();
  }
}

const IDS = Object.freeze({
  job: entityId("job", "0199a730-0000-7000-8000-000000000001"),
  source: entityId("job-source", "0199a730-0000-7000-8000-000000000002"),
  snapshot: entityId("source-snapshot", "0199a730-0000-7000-8000-000000000003"),
  provenance: entityId("provenance", "0199a730-0000-7000-8000-000000000004"),
  requirementTypeScript: entityId("job-requirement", "0199a730-0000-7000-8000-000000000005"),
  requirementRecovery: entityId("job-requirement", "0199a730-0000-7000-8000-000000000006"),
  requirementAws: entityId("job-requirement", "0199a730-0000-7000-8000-000000000007"),
  skill: entityId("skill", "0199a730-0000-7000-8000-000000000010"),
  employment: entityId("experience", "0199a730-0000-7000-8000-000000000011"),
  story: entityId("anecdote", "0199a730-0000-7000-8000-000000000012"),
  accomplishment: entityId("accomplishment", "0199a730-0000-7000-8000-000000000013"),
  certification: entityId("certification", "0199a730-0000-7000-8000-000000000014"),
  education: entityId("education", "0199a730-0000-7000-8000-000000000015"),
  skillEvidence: entityId("skill-evidence", "0199a730-0000-7000-8000-000000000016"),
});
const NOW = instant("2026-09-27T22:30:00.000Z");
const SELECTED_AT = instant("2026-09-27T22:35:00.000Z");

type Fixture = {
  readonly specVersion: number;
  readonly cases: readonly {
    readonly requirementKey: "aws" | "recovery" | "typescript";
    readonly normalizedText: string;
    readonly rawText: string;
    readonly expectedTopFive: readonly string[];
    readonly excluded: readonly string[];
  }[];
};
const fixture = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "fixtures", "career-evidence-retrieval.v1.json"),
    "utf8",
  ),
) as Fixture;

const keyAliases = new Map([
  [String(IDS.skill), "skill:typescript"],
  [String(IDS.employment), "employment:platform"],
  [String(IDS.story), "story:recovery"],
  [String(IDS.accomplishment), "accomplishment:migration"],
  [String(IDS.certification), "certification:aws"],
  [String(IDS.education), "education:biology"],
]);

describe("RequirementEvidenceRepository", () => {
  let database: NodeEvidenceDatabase;
  const requirementIds = {
    typescript: IDS.requirementTypeScript,
    recovery: IDS.requirementRecovery,
    aws: IDS.requirementAws,
  } as const;

  beforeEach(async () => {
    database = new NodeEvidenceDatabase();
    await applySqlMigrations(database, migrations, NOW);
    await database.execute(
      sqlStatement(
        "INSERT INTO job(id, title, created_at, updated_at) VALUES (?, 'Platform Lead', ?, ?)",
        [IDS.job, NOW, NOW],
      ),
    );
    await database.execute(
      sqlStatement(
        "INSERT INTO job_source(id, job_id, first_seen_at, last_seen_at, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
        [IDS.source, IDS.job, NOW, NOW, NOW, NOW],
      ),
    );
    await database.execute(
      sqlStatement(
        "INSERT INTO source_snapshot(id, job_source_id, captured_at, extractor_id, extractor_version, raw_text, content_hash, retention_class, created_at) VALUES (?, ?, ?, 'fixture', '1', 'Synthetic requirements', ?, 'standard', ?)",
        [IDS.snapshot, IDS.source, NOW, "a".repeat(64), NOW],
      ),
    );
    await database.execute(
      sqlStatement(
        "INSERT INTO provenance(id, source_snapshot_id, extraction_method, source_pointer, source_excerpt, confidence, captured_at, created_at) VALUES (?, ?, 'user', '/requirements', 'Synthetic requirements', 1, ?, ?)",
        [IDS.provenance, IDS.snapshot, NOW, NOW],
      ),
    );

    const requirementRepository = createJobRequirementRepository(database);
    for (const testCase of fixture.cases) {
      await requirementRepository.create({
        id: requirementIds[testCase.requirementKey],
        jobId: IDS.job,
        category: "required",
        sourceCategory: "required",
        normalizedText: testCase.normalizedText,
        rawText: testCase.rawText,
        provenanceId: IDS.provenance,
        sortOrder: 0,
        createdAt: NOW,
        userConfirmed: true,
      });
    }

    const career = createCareerRepositories(database);
    await career.employment.insert({
      id: IDS.employment,
      organization: "Coredrill Labs",
      role: "Platform Engineer",
      startDate: dateOnly("2022-01-01"),
      endDate: null,
      current: true,
      description: "Built reliable offline product delivery.",
      sourceDocumentId: null,
      verificationState: "user_confirmed",
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await career.skills.insert({
      id: IDS.skill,
      canonicalName: "TypeScript",
      category: "language",
      aliases: Object.freeze(["TS"]),
      sourceDocumentId: null,
      verificationState: "user_confirmed",
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await career.accomplishments.insert({
      id: IDS.accomplishment,
      parentType: "experience",
      parentId: IDS.employment,
      action: "Recovered a failed database migration",
      result: "Prevented data loss and restored service safely",
      metrics: Object.freeze({ incidents: 0 }),
      sourceDocumentId: null,
      verificationState: "source_backed",
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await career.certifications.insert({
      id: IDS.certification,
      name: "AWS Certified Solutions Architect",
      issuer: "Amazon Web Services",
      issuedDate: dateOnly("2025-01-01"),
      expiresDate: dateOnly("2028-01-01"),
      credentialUrl: null,
      sourceDocumentId: null,
      verificationState: "source_backed",
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await career.education.insert({
      id: IDS.education,
      institution: "Example University",
      credential: "Bachelor of Science",
      field: "Biology",
      startDate: dateOnly("2014-09-01"),
      endDate: dateOnly("2018-05-01"),
      details: "Laboratory research",
      sourceDocumentId: null,
      verificationState: "user_confirmed",
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await createCareerStoryRepository(database).create(
      {
        id: IDS.story,
        title: "Recovered a risky migration",
        situation: "A release migration failed validation.",
        action: "Diagnosed the failure and preserved the prior database.",
        result: "The retry completed without data loss.",
        tags: Object.freeze(["recovery", "delivery"]),
        privacyTags: Object.freeze([]),
        sourceDocumentId: null,
        verificationState: "user_confirmed",
        archivedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      [{ evidenceKind: "skill", evidenceId: IDS.skill }],
    );
    await database.execute(
      sqlStatement(
        `INSERT INTO skill_evidence(id, skill_id, evidence_kind, evidence_id, experience_id, narrative, verification_state, created_at) VALUES (?, ?, 'employment', ?, ?, 'Used TypeScript in this role.', 'user_confirmed', ?)`,
        [IDS.skillEvidence, IDS.skill, IDS.employment, IDS.employment, NOW],
      ),
    );
  });

  afterEach(() => database.close());

  it.each([false, true])(
    "meets the frozen retrieval evaluation with FTS disabled=%s",
    async (disableFts5) => {
      const repository = await openRequirementEvidenceRepository(database, { disableFts5 });
      let expected = 0;
      let retrieved = 0;
      let excludedRetrieved = 0;
      for (const testCase of fixture.cases) {
        const result = await repository.retrieve({
          requirementId: requirementIds[testCase.requirementKey],
          limit: 5,
        });
        const actual = result.candidates.map(
          ({ evidenceId, evidenceKind }) =>
            keyAliases.get(String(evidenceId)) ?? `${evidenceKind}:unknown`,
        );
        expected += testCase.expectedTopFive.length;
        retrieved += testCase.expectedTopFive.filter((key) => actual.includes(key)).length;
        excludedRetrieved += testCase.excluded.filter((key) => actual.includes(key)).length;
        expect(actual).toEqual(expect.arrayContaining([...testCase.expectedTopFive]));
        expect(actual).not.toEqual(expect.arrayContaining([...testCase.excluded]));
        expect(result.selectedEvidence).toEqual([]);
      }
      expect({ recallAtFive: retrieved / expected, excludedRetrieved }).toEqual({
        recallAtFive: 1,
        excludedRetrieved: 0,
      });
      console.info(
        `MAT003_RETRIEVAL_EVAL ${JSON.stringify({ specVersion: fixture.specVersion, mode: repositoryMode(disableFts5), cases: fixture.cases.length, expected, retrieved, recallAtFive: retrieved / expected, excludedRetrieved })}`,
      );
    },
  );

  it("keeps candidate retrieval read-only until explicit selection and supports deliberate removal", async () => {
    const repository = await openRequirementEvidenceRepository(database, { disableFts5: true });
    const before = await repository.retrieve({
      requirementId: IDS.requirementTypeScript,
      limit: 5,
    });
    expect(before.selectedEvidence).toEqual([]);
    expect(before.coverage).toMatchObject({
      source: "deterministic-rule",
      state: "unknown",
      stale: false,
    });
    await expect(
      database.query(sqlStatement("SELECT * FROM job_requirement_evidence_selection")),
    ).resolves.toEqual([]);

    const selected = await repository.select({
      requirementId: IDS.requirementTypeScript,
      evidenceKind: "skill",
      evidenceId: IDS.skill,
      selectedAt: SELECTED_AT,
    });
    expect(selected).toMatchObject({
      evidenceKind: "skill",
      evidenceId: IDS.skill,
      selectedAt: SELECTED_AT,
    });
    const after = await repository.retrieve({ requirementId: IDS.requirementTypeScript, limit: 5 });
    expect(after.selectedEvidence).toHaveLength(1);
    expect(after.selectedEvidence[0]?.reasons).toEqual(
      expect.arrayContaining(["exact-skill", "lexical"]),
    );
    expect(after.coverage).toMatchObject({
      source: "deterministic-rule",
      state: "strength",
      stale: false,
    });
    expect(after.candidates.some(({ evidenceId }) => evidenceId === IDS.skill)).toBe(false);

    await expect(
      repository.setCoverageDecision({
        requirementId: IDS.requirementTypeScript,
        state: "partial",
        expectedRowVersion: null,
        decidedAt: SELECTED_AT,
      }),
    ).resolves.toMatchObject({
      source: "user-confirmed",
      state: "partial",
      stale: false,
      rowVersion: 1,
    });
    await expect(
      repository.setCoverageDecision({
        requirementId: IDS.requirementTypeScript,
        state: "gap",
        expectedRowVersion: 1,
        decidedAt: SELECTED_AT,
      }),
    ).resolves.toMatchObject({ state: "gap", rowVersion: 2, stale: false });

    await expect(
      repository.remove({
        requirementId: IDS.requirementTypeScript,
        evidenceKind: "skill",
        evidenceId: IDS.skill,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.retrieve({ requirementId: IDS.requirementTypeScript, limit: 5 }),
    ).resolves.toMatchObject({
      coverage: { source: "user-confirmed", state: "gap", stale: true, rowVersion: 2 },
    });
    await expect(
      repository.resetCoverageDecision({
        requirementId: IDS.requirementTypeScript,
        expectedRowVersion: 2,
      }),
    ).resolves.toMatchObject({ source: "deterministic-rule", state: "unknown" });
    await expect(
      repository.remove({
        requirementId: IDS.requirementTypeScript,
        evidenceKind: "skill",
        evidenceId: IDS.skill,
      }),
    ).resolves.toBe(false);
  });

  it("enforces evidence prerequisites and optimistic coverage writes", async () => {
    const repository = await openRequirementEvidenceRepository(database, { disableFts5: true });
    await expect(
      repository.setCoverageDecision({
        requirementId: IDS.requirementTypeScript,
        state: "strength",
        expectedRowVersion: null,
        decidedAt: SELECTED_AT,
      }),
    ).rejects.toThrow("require selected evidence");
    await repository.setCoverageDecision({
      requirementId: IDS.requirementTypeScript,
      state: "unknown",
      expectedRowVersion: null,
      decidedAt: SELECTED_AT,
    });
    await expect(
      repository.setCoverageDecision({
        requirementId: IDS.requirementTypeScript,
        state: "gap",
        expectedRowVersion: null,
        decidedAt: SELECTED_AT,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      repository.resetCoverageDecision({
        requirementId: IDS.requirementTypeScript,
        expectedRowVersion: 99,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("marks a reviewed decision stale when selected evidence itself changes", async () => {
    const repository = await openRequirementEvidenceRepository(database, { disableFts5: true });
    await repository.select({
      requirementId: IDS.requirementTypeScript,
      evidenceKind: "skill",
      evidenceId: IDS.skill,
      selectedAt: SELECTED_AT,
    });
    await repository.setCoverageDecision({
      requirementId: IDS.requirementTypeScript,
      state: "strength",
      expectedRowVersion: null,
      decidedAt: SELECTED_AT,
    });
    await database.execute(
      sqlStatement(
        "UPDATE skill SET verification_state = 'stale', updated_at = ?, row_version = row_version + 1 WHERE id = ?",
        [SELECTED_AT, IDS.skill],
      ),
    );
    await expect(
      repository.retrieve({ requirementId: IDS.requirementTypeScript, limit: 5 }),
    ).resolves.toMatchObject({
      coverage: { source: "user-confirmed", state: "strength", stale: true },
    });
  });

  it("rejects cross-kind identifiers and inactive evidence at the database boundary", async () => {
    const repository = await openRequirementEvidenceRepository(database, { disableFts5: true });
    await expect(
      repository.select({
        requirementId: IDS.requirementTypeScript,
        evidenceKind: "skill",
        evidenceId: IDS.employment,
        selectedAt: SELECTED_AT,
      }),
    ).rejects.toThrow();
    await database.execute(
      sqlStatement(
        "UPDATE skill SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
        [SELECTED_AT, SELECTED_AT, IDS.skill],
      ),
    );
    await expect(
      repository.select({
        requirementId: IDS.requirementTypeScript,
        evidenceKind: "skill",
        evidenceId: IDS.skill,
        selectedAt: SELECTED_AT,
      }),
    ).rejects.toThrow("missing");
  });
});

const repositoryMode = (disabled: boolean): string =>
  disabled ? "normalized-token" : "fts5-or-fallback";
