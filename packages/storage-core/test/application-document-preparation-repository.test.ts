import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import {
  createApplicationDocumentPreparationOperations,
  type ApplicationOperationContext,
} from "@coredrill/application";
import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createApplicationDocumentPreparationRepository,
  createDocumentEditorRepository,
  createDocumentRepositories,
  createPipelineRepositories,
  createSubmittedSnapshotRepository,
  createTrackerRepositories,
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

class NodePreparationDatabase implements DatabasePort {
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
      const value = await work(this);
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Portable export is outside this repository test.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-document-preparation",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 154,
    });
  }

  public close(): void {
    this.database.close();
  }
}

const IDS = Object.freeze({
  job: entityId("job", "0199c300-0000-7000-8000-000000000001"),
  status: entityId("status_definition", "0199c300-0000-7000-8000-000000000002"),
  application: entityId("application", "0199c300-0000-7000-8000-000000000003"),
  resume: entityId("document", "0199c300-0000-7000-8000-000000000004"),
  resumeV1: entityId("document-version", "0199c300-0000-7000-8000-000000000005"),
  resumeV2: entityId("document-version", "0199c300-0000-7000-8000-000000000006"),
  answer: entityId("document", "0199c300-0000-7000-8000-000000000007"),
  answerV1: entityId("document-version", "0199c300-0000-7000-8000-000000000008"),
  snapshot: entityId("submitted-snapshot", "0199c300-0000-7000-8000-000000000009"),
  snapshotResume: entityId("submitted-snapshot-item", "0199c300-0000-7000-8000-00000000000a"),
  snapshotAnswer: entityId("submitted-snapshot-item", "0199c300-0000-7000-8000-00000000000b"),
});
const TIMES = Object.freeze({
  created: instant("2026-09-27T20:00:00.000Z"),
  preparedOld: instant("2026-09-27T20:05:00.000Z"),
  preparedLatest: instant("2026-09-27T20:10:00.000Z"),
  drafted: instant("2026-09-27T20:15:00.000Z"),
});
const IR: JsonValue = {
  specVersion: 1,
  document: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Exact content" }] }],
  },
};
const contextAt = (initiatedAt: (typeof TIMES)[keyof typeof TIMES]): ApplicationOperationContext =>
  Object.freeze({
    operationId: entityId("application-operation", "0199c300-0000-7000-8000-00000000000c"),
    initiatedAt,
  });

describe("ApplicationDocumentPreparationRepository", () => {
  let database: NodePreparationDatabase;

  beforeEach(async () => {
    database = new NodePreparationDatabase();
    await applySqlMigrations(database, migrations, TIMES.created);
    await createTrackerRepositories(database).jobs.create({
      id: IDS.job,
      companyId: null,
      title: "Product Operations Lead",
      normalizedTitle: "product operations lead",
      descriptionText: "Local preparation fixture.",
      employmentType: "full_time",
      workplaceType: "remote",
      seniority: "lead",
      locationId: null,
      remoteRegion: null,
      datePosted: null,
      validThrough: null,
      currentStatusId: null,
      nextActionAt: null,
      archivedAt: null,
      createdAt: TIMES.created,
      updatedAt: TIMES.created,
    });
    const documents = createDocumentRepositories(database);
    await documents.documents.create({
      id: IDS.resume,
      kind: "resume",
      title: "Northstar resume",
      source: "user",
      archivedAt: null,
      createdAt: TIMES.created,
      updatedAt: TIMES.created,
    });
    await documents.lineages.create({
      documentId: IDS.resume,
      role: "base",
      baseDocumentId: null,
      templateDocumentId: null,
      jobId: null,
      createdAt: TIMES.created,
    });
    await documents.documents.create({
      id: IDS.answer,
      kind: "application_answer",
      title: "Why Northstar?",
      source: "user",
      archivedAt: null,
      createdAt: TIMES.created,
      updatedAt: TIMES.created,
    });
    for (const version of [
      { id: IDS.resumeV1, documentId: IDS.resume, versionNumber: 1, parentVersionId: null },
      {
        id: IDS.resumeV2,
        documentId: IDS.resume,
        versionNumber: 2,
        parentVersionId: IDS.resumeV1,
      },
      { id: IDS.answerV1, documentId: IDS.answer, versionNumber: 1, parentVersionId: null },
    ] as const) {
      await documents.versions.create({
        ...version,
        contentIrVersion: 1,
        contentIr: IR,
        contentPlain: "Exact content",
        templateId: null,
        createdBy: "user",
        createdAt: TIMES.created,
        contentHash: createHash("sha256").update(version.id).digest("hex"),
        label: null,
      });
    }
    const pipeline = createPipelineRepositories(database);
    await pipeline.statusDefinitions.create({
      id: IDS.status,
      name: "Applied",
      category: "applied",
      color: "blue",
      isSystem: false,
      sortOrder: 1,
      terminal: false,
      archivedAt: null,
      createdAt: TIMES.created,
      updatedAt: TIMES.created,
    });
    await pipeline.applications.create({
      id: IDS.application,
      jobId: IDS.job,
      appliedAt: TIMES.created,
      channel: "company_portal",
      currentStatusId: IDS.status,
      selectedResumeVersionId: null,
      selectedCoverLetterVersionId: null,
      notes: "",
      archivedAt: null,
      createdAt: TIMES.created,
      updatedAt: TIMES.created,
    });
  });

  afterEach(() => {
    database.close();
  });

  it("persists exact versions atomically and derives all preparation transitions", async () => {
    const operations = createApplicationDocumentPreparationOperations({
      preparation: createApplicationDocumentPreparationRepository(database),
    });
    await expect(
      operations.loadPreparationQuery.execute(
        { applicationId: IDS.application },
        contextAt(TIMES.created),
      ),
    ).resolves.toMatchObject({ ok: true, value: { status: "missing" } });

    const older = await operations.savePreparationCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 1,
        resumeVersionId: IDS.resumeV1,
        coverLetterVersionId: null,
        answerVersionIds: [IDS.answerV1],
      },
      contextAt(TIMES.preparedOld),
    );
    expect(older).toMatchObject({
      ok: true,
      value: {
        applicationRowVersion: 2,
        status: "review_needed",
        selected: {
          resume: { documentVersionId: IDS.resumeV1 },
          answers: [{ documentVersionId: IDS.answerV1 }],
        },
      },
    });

    const stale = await operations.savePreparationCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 1,
        resumeVersionId: IDS.resumeV2,
        coverLetterVersionId: null,
        answerVersionIds: [IDS.answerV1],
      },
      contextAt(TIMES.preparedLatest),
    );
    expect(stale).toMatchObject({ ok: false, error: { code: "conflict" } });

    const ready = await operations.savePreparationCommand.execute(
      {
        applicationId: IDS.application,
        expectedApplicationRowVersion: 2,
        resumeVersionId: IDS.resumeV2,
        coverLetterVersionId: null,
        answerVersionIds: [IDS.answerV1],
      },
      contextAt(TIMES.preparedLatest),
    );
    expect(ready).toMatchObject({ ok: true, value: { status: "ready" } });

    await createDocumentEditorRepository(database).saveDraft({
      documentId: IDS.resume,
      baseVersionId: IDS.resumeV2,
      content: IR,
      plainText: "Exact content",
      expectedRowVersion: null,
      updatedAt: TIMES.drafted,
    });
    await expect(
      operations.loadPreparationQuery.execute(
        { applicationId: IDS.application },
        contextAt(TIMES.drafted),
      ),
    ).resolves.toMatchObject({ ok: true, value: { status: "draft" } });
  });

  it("freezes prepared identities after the exact submitted snapshot exists", async () => {
    const repository = createApplicationDocumentPreparationRepository(database);
    await repository.save({
      applicationId: IDS.application,
      expectedApplicationRowVersion: 1,
      resumeVersionId: IDS.resumeV2,
      coverLetterVersionId: null,
      answerVersionIds: [IDS.answerV1],
      updatedAt: TIMES.preparedLatest,
    });
    await createSubmittedSnapshotRepository(database).create({
      id: IDS.snapshot,
      applicationId: IDS.application,
      submittedAt: TIMES.created,
      channel: "company_portal",
      createdAt: TIMES.preparedLatest,
      items: [
        {
          id: IDS.snapshotResume,
          role: "resume",
          documentVersionId: IDS.resumeV2,
          submissionFormat: "plain_text",
          contentId: null,
          attachmentPurpose: null,
          sortOrder: 0,
          createdAt: TIMES.preparedLatest,
        },
        {
          id: IDS.snapshotAnswer,
          role: "answer",
          documentVersionId: IDS.answerV1,
          submissionFormat: "plain_text",
          contentId: null,
          attachmentPurpose: null,
          sortOrder: 1,
          createdAt: TIMES.preparedLatest,
        },
      ],
    });
    await expect(
      repository.save({
        applicationId: IDS.application,
        expectedApplicationRowVersion: 2,
        resumeVersionId: IDS.resumeV2,
        coverLetterVersionId: null,
        answerVersionIds: [],
        updatedAt: TIMES.drafted,
      }),
    ).rejects.toMatchObject({ code: "immutable" });
    await expect(
      database.execute(
        sqlStatement("DELETE FROM application_answer_selection WHERE application_id = ?", [
          IDS.application,
        ]),
      ),
    ).rejects.toThrow(/submitted application answer selection is immutable/u);
  });
});
