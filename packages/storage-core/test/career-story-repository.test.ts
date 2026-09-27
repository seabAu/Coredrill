import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createCareerRepositories,
  createCareerStoryRepository,
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

class NodeCareerStoryDatabase implements DatabasePort {
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
    throw new Error("Portable export is outside the career-story repository test.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-sqlite-career-story",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 132,
    });
  }

  public close(): void {
    this.database.close();
  }
}

const IDS = Object.freeze({
  story: entityId("anecdote", "0199a510-0000-7000-8000-000000000001"),
  storyDuplicate: entityId("anecdote", "0199a510-0000-7000-8000-000000000002"),
  employment: entityId("experience", "0199a510-0000-7000-8000-000000000003"),
  skill: entityId("skill", "0199a510-0000-7000-8000-000000000004"),
  missingSkill: entityId("skill", "0199a510-0000-7000-8000-000000000005"),
});
const CREATED_AT = instant("2026-09-27T15:00:00.000Z");
const UPDATED_AT = instant("2026-09-27T15:05:00.000Z");

const newStory = (id = IDS.story) =>
  Object.freeze({
    id,
    title: "Recovered a risky migration",
    situation: "A release migration failed validation.",
    action: "Preserved the source and repaired the boundary.",
    result: "The retry completed without data loss.",
    tags: Object.freeze(["ownership", "recovery"]),
    privacyTags: Object.freeze(["confidential-client"]),
    sourceDocumentId: null,
    verificationState: "user_confirmed" as const,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

describe("CareerStoryEvidenceRepository", () => {
  let database: NodeCareerStoryDatabase;

  beforeEach(async () => {
    database = new NodeCareerStoryDatabase();
    await applySqlMigrations(database, migrations, CREATED_AT);
    const repositories = createCareerRepositories(database);
    await repositories.employment.insert({
      id: IDS.employment,
      organization: "Coredrill Labs",
      role: "Product Engineer",
      startDate: null,
      endDate: null,
      current: false,
      description: "Built a local-first workflow.",
      sourceDocumentId: null,
      verificationState: "user_confirmed",
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await repositories.skills.insert({
      id: IDS.skill,
      canonicalName: "TypeScript",
      category: "language",
      aliases: Object.freeze(["TS"]),
      sourceDocumentId: null,
      verificationState: "imported",
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  });

  afterEach(() => {
    database.close();
  });

  it("creates and updates a STAR story with durable links to canonical evidence", async () => {
    const repository = createCareerStoryRepository(database);
    const created = await repository.create(newStory(), [
      { evidenceKind: "employment", evidenceId: IDS.employment },
    ]);
    expect(created).toMatchObject({
      id: IDS.story,
      verificationState: "user_confirmed",
      rowVersion: 1,
      linkedEvidence: [{ evidenceKind: "employment", evidenceId: IDS.employment }],
    });

    const updated = await repository.update(
      {
        id: IDS.story,
        title: created.title,
        situation: created.situation,
        action: created.action,
        result: "The retry completed safely and the rollback path remained available.",
        tags: created.tags,
        privacyTags: created.privacyTags,
        expectedRowVersion: created.rowVersion,
        updatedAt: UPDATED_AT,
      },
      [
        { evidenceKind: "employment", evidenceId: IDS.employment },
        { evidenceKind: "skill", evidenceId: IDS.skill },
      ],
    );

    expect(updated).toMatchObject({
      result: "The retry completed safely and the rollback path remained available.",
      verificationState: "user_confirmed",
      sourceDocumentId: null,
      rowVersion: 2,
      linkedEvidence: [
        { evidenceKind: "employment", evidenceId: IDS.employment },
        { evidenceKind: "skill", evidenceId: IDS.skill },
      ],
    });
    await expect(repository.listActive()).resolves.toEqual([updated]);
  });

  it("rolls back content and relationship replacement when a link target is missing", async () => {
    const repository = createCareerStoryRepository(database);
    const created = await repository.create(newStory(), [
      { evidenceKind: "employment", evidenceId: IDS.employment },
    ]);

    await expect(
      repository.update(
        {
          id: IDS.story,
          title: created.title,
          situation: created.situation,
          action: created.action,
          result: "This change must roll back.",
          tags: created.tags,
          privacyTags: created.privacyTags,
          expectedRowVersion: 1,
          updatedAt: UPDATED_AT,
        },
        [{ evidenceKind: "skill", evidenceId: IDS.missingSkill }],
      ),
    ).rejects.toThrow("existing active evidence");

    await expect(repository.listActive()).resolves.toEqual([created]);
  });

  it("rejects duplicate links and leaves no partial story row", async () => {
    const repository = createCareerStoryRepository(database);
    await expect(
      repository.create(newStory(IDS.storyDuplicate), [
        { evidenceKind: "employment", evidenceId: IDS.employment },
        { evidenceKind: "employment", evidenceId: IDS.employment },
      ]),
    ).rejects.toThrow("cannot contain duplicates");

    const rows = await database.query(
      sqlStatement("SELECT id FROM anecdote WHERE id = ?", [IDS.storyDuplicate]),
    );
    expect(rows).toHaveLength(0);
  });

  it("cascades only the affected evidence relationships during explicit deletion", async () => {
    const repository = createCareerStoryRepository(database);
    const created = await repository.create(newStory(), [
      { evidenceKind: "employment", evidenceId: IDS.employment },
      { evidenceKind: "skill", evidenceId: IDS.skill },
    ]);

    await database.execute(sqlStatement("DELETE FROM skill WHERE id = ?", [IDS.skill]));
    await expect(repository.listActive()).resolves.toMatchObject([
      {
        id: created.id,
        linkedEvidence: [{ evidenceKind: "employment", evidenceId: IDS.employment }],
      },
    ]);

    await database.execute(sqlStatement("DELETE FROM anecdote WHERE id = ?", [IDS.story]));
    await expect(
      database.query(sqlStatement("SELECT anecdote_id FROM anecdote_evidence_link")),
    ).resolves.toEqual([]);
    await expect(
      database.query(sqlStatement("SELECT id FROM experience WHERE id = ?", [IDS.employment])),
    ).resolves.toHaveLength(1);
  });
});
