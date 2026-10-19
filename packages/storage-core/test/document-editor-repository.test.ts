import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { DocumentEditorError } from "@coredrill/application";
import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createDocumentEditorRepository,
  createDocumentCreationRepository,
  createApplicationAttemptRepository,
  createPipelineRepositories,
  createTrackerRepositories,
  changePipelineStatus,
  sqlStatement,
  createDocumentRepositories,
  defineSqlMigrations,
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

class NodeDocumentEditorDatabase implements DatabasePort {
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
    throw new Error("Portable export is outside this repository test.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-document-editor",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 154,
    });
  }

  public close() {
    this.database.close();
  }
}

const DOCUMENT_ID = entityId("document", "0199b310-0000-7000-8000-000000000001");
const VERSION_1_ID = entityId("document-version", "0199b310-0000-7000-8000-000000000002");
const VERSION_2_ID = entityId("document-version", "0199b310-0000-7000-8000-000000000003");
const CREATED_AT = instant("2026-09-27T21:00:00.000Z");
const EDITED_AT = instant("2026-09-27T21:05:00.000Z");
const VERSIONED_AT = instant("2026-09-27T21:10:00.000Z");
const content = (text: string): JsonValue => ({
  specVersion: 1,
  document: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("DocumentEditorRepository", () => {
  let database: NodeDocumentEditorDatabase;

  beforeEach(async () => {
    database = new NodeDocumentEditorDatabase();
    await applySqlMigrations(database, migrations, CREATED_AT);
    const repositories = createDocumentRepositories(database);
    await repositories.documents.create({
      id: DOCUMENT_ID,
      kind: "resume",
      title: "Northstar resume",
      source: "user",
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await repositories.versions.create({
      id: VERSION_1_ID,
      documentId: DOCUMENT_ID,
      versionNumber: 1,
      contentIrVersion: 1,
      contentIr: content("Original evidence"),
      contentPlain: "Original evidence",
      templateId: null,
      createdBy: "user",
      createdAt: CREATED_AT,
      parentVersionId: null,
      contentHash: hash(content("Original evidence")),
      label: "Initial version",
    });
  });

  afterEach(() => database.close());

  const attemptJob = entityId("job", "0199b330-0000-7000-8000-000000000001");
  const attemptInput = () => ({
    jobId: attemptJob,
    applicationId: entityId("application", "0199b330-0000-7000-8000-000000000002"),
    newStageId: entityId("status_definition", "0199b330-0000-7000-8000-000000000003"),
    eventId: entityId("status-event", "0199b330-0000-7000-8000-000000000004"),
    expectedJobRowVersion: 1,
    preparationStageName: "Drafting locally",
    createdAt: VERSIONED_AT,
  });
  const seedAttemptJob = async (
    statusId: ReturnType<typeof entityId<"status_definition">> | null = null,
  ) => {
    await createTrackerRepositories(database).jobs.create({
      id: attemptJob,
      companyId: null,
      title: "Preparation job",
      normalizedTitle: null,
      descriptionText: "Synthetic role",
      employmentType: null,
      workplaceType: null,
      seniority: null,
      locationId: null,
      remoteRegion: null,
      datePosted: null,
      validThrough: null,
      currentStatusId: statusId,
      nextActionAt: null,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  };

  it("starts preparation atomically from an unassigned job without marking Applied or selecting documents", async () => {
    await seedAttemptJob();
    const input = attemptInput();
    const result = await createApplicationAttemptRepository(database).start(input);
    expect(result).toMatchObject({
      applicationId: input.applicationId,
      statusId: input.newStageId,
      jobRowVersion: 2,
    });
    await expect(
      createPipelineRepositories(database).applications.findById(input.applicationId),
    ).resolves.toMatchObject({
      appliedAt: null,
      channel: null,
      selectedResumeVersionId: null,
      selectedCoverLetterVersionId: null,
      currentStatusId: input.newStageId,
    });
    await expect(
      createPipelineRepositories(database).statusEvents.listForJob(attemptJob),
    ).resolves.toMatchObject([
      { applicationId: input.applicationId, fromStatusId: null, toStatusId: input.newStageId },
    ]);
    await expect(
      createTrackerRepositories(database).jobs.findById(attemptJob),
    ).resolves.toMatchObject({ rowVersion: 2, currentStatusId: input.newStageId });
    await expect(
      createApplicationAttemptRepository(database).start({ ...input, expectedJobRowVersion: 2 }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await database.query(sqlStatement("SELECT id FROM application"))).toHaveLength(1);
  });

  it("rejects stale jobs and terminal jobs before creating a preparation stage", async () => {
    await seedAttemptJob();
    await expect(
      createApplicationAttemptRepository(database).start({
        ...attemptInput(),
        expectedJobRowVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    const terminal = entityId("status_definition", "0199b330-0000-7000-8000-000000000006");
    await createPipelineRepositories(database).statusDefinitions.create({
      id: terminal,
      name: "Closed",
      category: "rejected",
      color: null,
      isSystem: false,
      sortOrder: 0,
      terminal: true,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await changePipelineStatus(database, {
      eventId: entityId("status-event", "0199b330-0000-7000-8000-000000000007"),
      undoTokenId: entityId("mutation-undo-token", "0199b330-0000-7000-8000-000000000008"),
      jobId: attemptJob,
      applicationId: null,
      toStatusId: terminal,
      occurredAt: EDITED_AT,
      note: null,
    });
    await expect(
      createApplicationAttemptRepository(database).start({
        ...attemptInput(),
        expectedJobRowVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await database.query(sqlStatement("SELECT id FROM application"))).toHaveLength(0);
    expect(await database.query(sqlStatement("SELECT id FROM status_definition"))).toHaveLength(1);
  });

  it("reuses an exact user-named Preparing stage and does not create a default stage", async () => {
    await seedAttemptJob();
    const stageId = entityId("status_definition", "0199b330-0000-7000-8000-000000000009");
    await createPipelineRepositories(database).statusDefinitions.create({
      id: stageId,
      name: "Drafting locally",
      category: "preparing",
      color: null,
      isSystem: false,
      sortOrder: 0,
      terminal: false,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await expect(
      createApplicationAttemptRepository(database).start(attemptInput()),
    ).resolves.toMatchObject({ statusId: stageId });
    expect(await database.query(sqlStatement("SELECT id FROM status_definition"))).toHaveLength(1);
  });

  it("rolls back the new stage, application, and job projection if the timeline insert fails", async () => {
    await seedAttemptJob();
    const savedStage = entityId("status_definition", "0199b330-0000-7000-8000-000000000010");
    await createPipelineRepositories(database).statusDefinitions.create({
      id: savedStage,
      name: "Saved",
      category: "saved",
      color: null,
      isSystem: false,
      sortOrder: 0,
      terminal: false,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    const input = attemptInput();
    await changePipelineStatus(database, {
      eventId: input.eventId,
      undoTokenId: entityId("mutation-undo-token", "0199b330-0000-7000-8000-000000000011"),
      jobId: attemptJob,
      applicationId: null,
      toStatusId: savedStage,
      occurredAt: EDITED_AT,
      note: null,
    });
    await expect(
      createApplicationAttemptRepository(database).start({ ...input, expectedJobRowVersion: 2 }),
    ).rejects.toThrow();
    expect(await database.query(sqlStatement("SELECT id FROM application"))).toHaveLength(0);
    expect(await database.query(sqlStatement("SELECT id FROM status_definition"))).toHaveLength(1);
    await expect(
      createTrackerRepositories(database).jobs.findById(attemptJob),
    ).resolves.toMatchObject({ rowVersion: 2, currentStatusId: savedStage });
    await expect(
      createPipelineRepositories(database).statusEvents.listForJob(attemptJob),
    ).resolves.toHaveLength(1);
  });

  it("creates a reusable manual document with durable lineage and immutable first version", async () => {
    const id = entityId("document", "0199b320-0000-7000-8000-000000000001");
    const versionId = entityId("document-version", "0199b320-0000-7000-8000-000000000002");
    const initial = content("Manually authored text");
    await createDocumentCreationRepository(database).create({
      documentId: id,
      versionId,
      title: "New reusable resume",
      kind: "resume",
      content: initial,
      plainText: "Manually authored text",
      contentHash: hash(initial),
      createdAt: CREATED_AT,
    });
    await expect(createDocumentEditorRepository(database).load(id)).resolves.toMatchObject({
      title: "New reusable resume",
      draft: null,
      versions: [
        {
          id: versionId,
          versionNumber: 1,
          parentVersionId: null,
          contentHash: hash(initial),
          plainText: "Manually authored text",
        },
      ],
    });
    await expect(
      createDocumentRepositories(database).lineages.findForDocument(id),
    ).resolves.toMatchObject({ role: "base", baseDocumentId: null, jobId: null });
  });

  it("rolls back document and lineage when the first immutable version cannot be written", async () => {
    const id = entityId("document", "0199b320-0000-7000-8000-000000000003");
    const initial = content("Rollback sentinel");
    await expect(
      createDocumentCreationRepository(database).create({
        documentId: id,
        versionId: VERSION_1_ID,
        title: "Must not survive",
        kind: "cover_letter",
        content: initial,
        plainText: "Rollback sentinel",
        contentHash: hash(initial),
        createdAt: CREATED_AT,
      }),
    ).rejects.toThrow();
    await expect(
      createDocumentRepositories(database).documents.findById(id),
    ).resolves.toBeUndefined();
    await expect(
      createDocumentRepositories(database).lineages.findForDocument(id),
    ).resolves.toBeUndefined();
    await expect(createDocumentEditorRepository(database).load(DOCUMENT_ID)).resolves.toMatchObject(
      { versions: [{ id: VERSION_1_ID }] },
    );
  });

  it("persists and recovers the latest optimistic draft across repository recreation", async () => {
    const repository = createDocumentEditorRepository(database);
    const first = (await repository.saveDraft({
      documentId: DOCUMENT_ID,
      baseVersionId: VERSION_1_ID,
      content: content("First edit") as never,
      plainText: "First edit",
      expectedRowVersion: null,
      updatedAt: EDITED_AT,
    })) as { readonly draft: { readonly rowVersion: number } };
    expect(first.draft.rowVersion).toBe(1);

    await repository.saveDraft({
      documentId: DOCUMENT_ID,
      baseVersionId: VERSION_1_ID,
      content: content("Recovered edit") as never,
      plainText: "Recovered edit",
      expectedRowVersion: 1,
      updatedAt: VERSIONED_AT,
    });

    await expect(createDocumentEditorRepository(database).load(DOCUMENT_ID)).resolves.toMatchObject(
      {
        draft: {
          baseVersionId: VERSION_1_ID,
          plainText: "Recovered edit",
          rowVersion: 2,
        },
      },
    );
  });

  it("rejects stale autosaves without replacing the newer recovered draft", async () => {
    const repository = createDocumentEditorRepository(database);
    await repository.saveDraft({
      documentId: DOCUMENT_ID,
      baseVersionId: VERSION_1_ID,
      content: content("First edit") as never,
      plainText: "First edit",
      expectedRowVersion: null,
      updatedAt: EDITED_AT,
    });
    await repository.saveDraft({
      documentId: DOCUMENT_ID,
      baseVersionId: VERSION_1_ID,
      content: content("Newer edit") as never,
      plainText: "Newer edit",
      expectedRowVersion: 1,
      updatedAt: VERSIONED_AT,
    });

    await expect(
      repository.saveDraft({
        documentId: DOCUMENT_ID,
        baseVersionId: VERSION_1_ID,
        content: content("Stale overwrite") as never,
        plainText: "Stale overwrite",
        expectedRowVersion: 1,
        updatedAt: VERSIONED_AT,
      }),
    ).rejects.toEqual(expect.objectContaining({ name: "DocumentEditorError", code: "conflict" }));
    await expect(repository.load(DOCUMENT_ID)).resolves.toMatchObject({
      draft: { plainText: "Newer edit", rowVersion: 2 },
    });
  });

  it("atomically creates one immutable child version and consumes its exact durable draft", async () => {
    const repository = createDocumentEditorRepository(database);
    const edited = content("Application-ready evidence");
    await repository.saveDraft({
      documentId: DOCUMENT_ID,
      baseVersionId: VERSION_1_ID,
      content: edited as never,
      plainText: "Application-ready evidence",
      expectedRowVersion: null,
      updatedAt: EDITED_AT,
    });

    const created = await repository.createVersion({
      documentId: DOCUMENT_ID,
      baseVersionId: VERSION_1_ID,
      versionId: VERSION_2_ID,
      content: edited as never,
      plainText: "Application-ready evidence",
      contentHash: hash(edited),
      expectedDraftRowVersion: 1,
      label: "Application ready",
      createdAt: VERSIONED_AT,
    });

    expect(created).toMatchObject({
      draft: null,
      versions: [
        { id: VERSION_1_ID, versionNumber: 1 },
        {
          id: VERSION_2_ID,
          versionNumber: 2,
          parentVersionId: VERSION_1_ID,
          plainText: "Application-ready evidence",
        },
      ],
    });
    await expect(
      repository.createVersion({
        documentId: DOCUMENT_ID,
        baseVersionId: VERSION_1_ID,
        versionId: entityId("document-version", "0199b310-0000-7000-8000-000000000004"),
        content: edited as never,
        plainText: "Application-ready evidence",
        contentHash: hash(edited),
        expectedDraftRowVersion: 1,
        label: null,
        createdAt: VERSIONED_AT,
      }),
    ).rejects.toBeInstanceOf(DocumentEditorError);
  });

  it("rolls back version creation when the in-memory content is not the exact saved draft", async () => {
    const repository = createDocumentEditorRepository(database);
    const saved = content("Saved draft");
    await repository.saveDraft({
      documentId: DOCUMENT_ID,
      baseVersionId: VERSION_1_ID,
      content: saved as never,
      plainText: "Saved draft",
      expectedRowVersion: null,
      updatedAt: EDITED_AT,
    });

    await expect(
      repository.createVersion({
        documentId: DOCUMENT_ID,
        baseVersionId: VERSION_1_ID,
        versionId: VERSION_2_ID,
        content: content("Unsaved replacement") as never,
        plainText: "Unsaved replacement",
        contentHash: hash(content("Unsaved replacement")),
        expectedDraftRowVersion: 1,
        label: null,
        createdAt: VERSIONED_AT,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "conflict" }));
    await expect(repository.load(DOCUMENT_ID)).resolves.toMatchObject({
      versions: [{ id: VERSION_1_ID }],
      draft: { plainText: "Saved draft", rowVersion: 1 },
    });
  });
});
