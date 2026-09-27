import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import type { ResumeEvidenceProposalDto, ResumeImportPortInput } from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createCareerRepositories,
  createResumeImportRepository,
  createResumeImportResolutionRepository,
  defineSqlMigrations,
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
const migrationDefinitions = readdirSync(path.join(repositoryRoot, "migrations"))
  .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
  .sort()
  .map((fileName) => [fileName, fileName.slice(5, -4).replaceAll("_", "-")] as const);
const migrations = defineSqlMigrations(
  migrationDefinitions.map(([fileName, name], index) => {
    const sql = readFileSync(path.join(repositoryRoot, "migrations", fileName), "utf8");
    return {
      version: index + 1,
      name,
      sha256: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  }),
);

class NodeResumeDatabase implements DatabasePort {
  private readonly database = new DatabaseSync(":memory:");

  public constructor() {
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    return this.database.prepare(statement.sql).all(...statement.parameters) as Row[];
  }

  public async execute(statement: SqlStatement): Promise<ExecuteResult> {
    const result = this.database.prepare(statement.sql).run(...statement.parameters);
    return Object.freeze({
      rowsAffected: Number(result.changes),
      lastInsertRowId: BigInt(result.lastInsertRowid),
    });
  }

  public async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await work({
        query: (statement) => this.query(statement),
        execute: (statement) => this.execute(statement),
      });
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Portable export is outside the resume-import repository test.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-sqlite-resume-import",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 120,
    });
  }

  public close(): void {
    this.database.close();
  }
}

const IMPORT_ID = entityId("import-run", "0199a210-0000-7000-8000-000000000001");
const PROPOSAL_ID = entityId("career-import-proposal", "0199a210-0000-7000-8000-000000000002");
const AT = instant("2026-09-27T15:00:00.000Z");

const proposal = (id = PROPOSAL_ID): ResumeEvidenceProposalDto =>
  Object.freeze({
    confidence: 0.82,
    evidenceStatus: "proposal",
    fieldName: "organization",
    groupKey: "block-8",
    id,
    importRunId: IMPORT_ID,
    proposedValue: "Coredrill Labs",
    reviewState: "pending",
    sourceExcerpt: "Coredrill Labs — Product Engineer — 2024–2026",
    sourcePointer: "/word/document.xml#paragraph=8",
    target: "employment",
  });

const input = (
  proposals: readonly ResumeEvidenceProposalDto[] = [proposal()],
): ResumeImportPortInput =>
  Object.freeze({
    blocks: Object.freeze([
      Object.freeze({
        sourceExcerpt: "Coredrill Labs — Product Engineer — 2024–2026",
        sourcePointer: "/word/document.xml#paragraph=8",
        text: "Coredrill Labs — Product Engineer — 2024–2026",
      }),
    ]),
    completedAt: AT,
    id: IMPORT_ID,
    proposalCount: proposals.length,
    proposals,
    source: Object.freeze({
      byteLength: 4_096,
      fileName: "synthetic-resume.docx",
      format: "docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pageCount: null,
      sha256: "a".repeat(64),
    }),
    startedAt: AT,
    status: "completed",
    warnings: Object.freeze([]),
  });

describe("resume import proposal repository", () => {
  let database: NodeResumeDatabase;

  beforeEach(async () => {
    database = new NodeResumeDatabase();
    await expect(
      applySqlMigrations(database, migrations, "2026-09-27T15:00:00.000Z"),
    ).resolves.toMatchObject({ schemaVersion: 120 });
  });

  afterEach(() => {
    database.close();
  });

  it("persists and reloads immutable pending proposals with field provenance", async () => {
    const repository = createResumeImportRepository(database);
    const stored = await repository.enqueue(input());

    expect(stored).toMatchObject({
      id: IMPORT_ID,
      proposalCount: 1,
      proposals: [
        {
          evidenceStatus: "proposal",
          proposedValue: "Coredrill Labs",
          reviewState: "pending",
          sourcePointer: "/word/document.xml#paragraph=8",
        },
      ],
    });
    await expect(repository.listPending()).resolves.toEqual([stored]);
    await expect(
      database.query(
        sqlStatement("SELECT source_mapping_json FROM import_run WHERE id = ?", [IMPORT_ID]),
      ),
    ).resolves.toEqual([
      {
        source_mapping_json: JSON.stringify(input().blocks),
      },
    ]);
  });

  it("does not create or overwrite Career Profile evidence", async () => {
    const repository = createResumeImportRepository(database);
    await repository.enqueue(input());

    for (const table of [
      "experience",
      "education",
      "project",
      "skill",
      "accomplishment",
      "certification",
      "publication",
      "volunteer_experience",
      "candidate_profile",
    ]) {
      const rows = await database.query(sqlStatement(`SELECT count(*) AS total FROM ${table}`));
      expect(rows, table).toEqual([{ total: 0 }]);
    }
  });

  it("rolls the complete import back when any proposal fails", async () => {
    const repository = createResumeImportRepository(database);
    await expect(repository.enqueue(input([proposal(), proposal()]))).rejects.toThrow();

    await expect(
      database.query(sqlStatement("SELECT count(*) AS total FROM import_run")),
    ).resolves.toEqual([{ total: 0 }]);
    await expect(
      database.query(sqlStatement("SELECT count(*) AS total FROM career_import_proposal")),
    ).resolves.toEqual([{ total: 0 }]);
  });

  it("retains a scanned-file warning even when no proposals are available", async () => {
    const repository = createResumeImportRepository(database);
    const empty: ResumeImportPortInput = {
      ...input([]),
      blocks: Object.freeze([]),
      source: Object.freeze({
        ...input([]).source,
        fileName: "synthetic-scanned.pdf",
        format: "pdf",
      }),
      warnings: Object.freeze(["No extractable text was found; explicit local OCR is optional."]),
    };

    await expect(repository.enqueue(empty)).resolves.toMatchObject({
      proposalCount: 0,
      warnings: ["No extractable text was found; explicit local OCR is optional."],
    });
  });

  it("accepts a complete skill group as imported evidence and removes it from the pending queue", async () => {
    const skillProposal: ResumeEvidenceProposalDto = Object.freeze({
      ...proposal(),
      fieldName: "canonicalName",
      groupKey: "skill-1",
      proposedValue: "TypeScript",
      target: "skill",
    });
    const imports = createResumeImportRepository(database);
    await imports.enqueue(input([skillProposal]));

    const resolution = await createResumeImportResolutionRepository(database).resolve({
      current: false,
      decision: "accepted_new",
      endDate: null,
      groupKey: "skill-1",
      importRunId: IMPORT_ID,
      newTargetId: entityId("skill", "0199a210-0000-7000-8000-000000000010"),
      resolutionId: entityId("career-import-resolution", "0199a210-0000-7000-8000-000000000011"),
      resolvedAt: AT,
      startDate: null,
      target: "skill",
      targetId: null,
    });

    expect(resolution).toMatchObject({ decision: "accepted_new", target: "skill" });
    await expect(createCareerRepositories(database).skills.listActive()).resolves.toEqual([
      expect.objectContaining({
        canonicalName: "TypeScript",
        sourceDocumentId: null,
        verificationState: "imported",
      }),
    ]);
    await expect(imports.listPending()).resolves.toEqual([]);
    await expect(
      database.query(
        sqlStatement(
          `SELECT p.source_excerpt, r.decision
           FROM career_import_proposal p
           JOIN career_import_resolution_proposal rp ON rp.proposal_id = p.id
           JOIN career_import_resolution r ON r.id = rp.resolution_id`,
        ),
      ),
    ).resolves.toEqual([{ decision: "accepted_new", source_excerpt: skillProposal.sourceExcerpt }]);
  });

  it("merges duplicate employment evidence without overwriting a user-confirmed record", async () => {
    const existingId = entityId("experience", "0199a210-0000-7000-8000-000000000020");
    const careers = createCareerRepositories(database);
    const existing = await careers.employment.insert({
      archivedAt: null,
      createdAt: AT,
      current: false,
      description: "User-authored canonical description.",
      endDate: null,
      id: existingId,
      organization: "Coredrill Labs",
      role: "Product Engineer",
      sourceDocumentId: null,
      startDate: null,
      updatedAt: AT,
      verificationState: "user_confirmed",
    });
    const fields = [
      ["organization", "Coredrill Labs"],
      ["role", "Product Engineer"],
      ["dateRange", "2024–2026"],
    ] as const;
    const proposals = fields.map(([fieldName, proposedValue], index): ResumeEvidenceProposalDto =>
      Object.freeze({
        ...proposal(
          entityId(
            "career-import-proposal",
            `0199a210-0000-7000-8000-${String(index + 30).padStart(12, "0")}`,
          ),
        ),
        fieldName,
        groupKey: "employment-1",
        proposedValue,
        target: "employment",
      }),
    );
    await createResumeImportRepository(database).enqueue(input(proposals));

    await createResumeImportResolutionRepository(database).resolve({
      current: false,
      decision: "merged_existing",
      endDate: null,
      groupKey: "employment-1",
      importRunId: IMPORT_ID,
      newTargetId: null,
      resolutionId: entityId("career-import-resolution", "0199a210-0000-7000-8000-000000000040"),
      resolvedAt: AT,
      startDate: null,
      target: "employment",
      targetId: existingId,
    });

    await expect(careers.employment.listActive()).resolves.toEqual([existing]);
    await expect(
      database.query(
        sqlStatement(
          "SELECT decision, target_id FROM career_import_resolution WHERE import_run_id = ?",
          [IMPORT_ID],
        ),
      ),
    ).resolves.toEqual([{ decision: "merged_existing", target_id: existingId }]);
  });

  it("rejects a group durably without creating Career Profile evidence or losing its excerpt", async () => {
    const skillProposal: ResumeEvidenceProposalDto = Object.freeze({
      ...proposal(),
      fieldName: "canonicalName",
      groupKey: "skill-1",
      proposedValue: "Unreviewed Tool",
      target: "skill",
    });
    const imports = createResumeImportRepository(database);
    await imports.enqueue(input([skillProposal]));

    await expect(
      createResumeImportResolutionRepository(database).resolve({
        current: false,
        decision: "rejected",
        endDate: null,
        groupKey: "skill-1",
        importRunId: IMPORT_ID,
        newTargetId: null,
        resolutionId: entityId("career-import-resolution", "0199a210-0000-7000-8000-000000000045"),
        resolvedAt: AT,
        startDate: null,
        target: null,
        targetId: null,
      }),
    ).resolves.toMatchObject({ decision: "rejected", target: null, targetId: null });

    await expect(createCareerRepositories(database).skills.listActive()).resolves.toEqual([]);
    await expect(imports.listPending()).resolves.toEqual([]);
    await expect(
      database.query(
        sqlStatement(
          `SELECT p.source_excerpt, r.decision
           FROM career_import_proposal p
           JOIN career_import_resolution_proposal rp ON rp.proposal_id = p.id
           JOIN career_import_resolution r ON r.id = rp.resolution_id`,
        ),
      ),
    ).resolves.toEqual([{ decision: "rejected", source_excerpt: skillProposal.sourceExcerpt }]);
  });

  it("rolls back an invalid merge and leaves every source-backed proposal pending", async () => {
    const skillProposal: ResumeEvidenceProposalDto = Object.freeze({
      ...proposal(),
      fieldName: "canonicalName",
      groupKey: "skill-1",
      proposedValue: "TypeScript",
      target: "skill",
    });
    const imports = createResumeImportRepository(database);
    await imports.enqueue(input([skillProposal]));

    await expect(
      createResumeImportResolutionRepository(database).resolve({
        current: false,
        decision: "merged_existing",
        endDate: null,
        groupKey: "skill-1",
        importRunId: IMPORT_ID,
        newTargetId: null,
        resolutionId: entityId("career-import-resolution", "0199a210-0000-7000-8000-000000000050"),
        resolvedAt: AT,
        startDate: null,
        target: "skill",
        targetId: entityId("skill", "0199a210-0000-7000-8000-000000000051"),
      }),
    ).rejects.toThrow("not a reviewed conflict candidate");

    await expect(imports.listPending()).resolves.toEqual([
      expect.objectContaining({ proposalCount: 1, proposals: [skillProposal] }),
    ]);
    await expect(
      database.query(sqlStatement("SELECT count(*) AS total FROM career_import_resolution")),
    ).resolves.toEqual([{ total: 0 }]);
  });
});
