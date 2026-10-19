import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { DocumentEditorError, createPipelineQueryOperations } from "@coredrill/application";
import type { JsonValue } from "@coredrill/contracts";
import { entityId, instant, timeZone } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createDocumentEditorRepository,
  createDocumentCreationRepository,
  createDocumentDerivationRepository,
  createApplicationAttemptRepository,
  createAppliedStageRepository,
  createPipelineQueryRepository,
  createPipelineRepositories,
  createTrackerRepositories,
  changePipelineStatus,
  setNextAction,
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
      schemaVersion: migrations.length,
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

  const appliedStageInput = () => ({
    id: entityId("status_definition", "0199b350-0000-7000-8000-000000000001"),
    name: "My submitted stage",
    createdAt: VERSIONED_AT,
  });
  const queryContext = {
    operationId: entityId("application-operation", "0199b360-0000-7000-8000-000000000001"),
    initiatedAt: instant("2026-10-19T10:00:00.000Z"),
  };
  const pipelineQueries = () =>
    createPipelineQueryOperations({ pipelineQueries: createPipelineQueryRepository(database) });
  it("reads an empty Pipeline without installing default stages or inventing a job", async () => {
    const queries = pipelineQueries();
    expect(await queries.getPipelineCountsQuery.execute({}, queryContext)).toEqual({
      ok: true,
      value: {
        asOf: queryContext.initiatedAt,
        includeArchived: false,
        all: 0,
        needsAction: 0,
        overdue: 0,
        upcomingInterviews: 0,
        waiting: 0,
        closed: 0,
      },
    });
    expect(await queries.getPipelineBoardGroupsQuery.execute({}, queryContext)).toMatchObject({
      ok: true,
      value: [{ statusId: null, name: "Unassigned", jobCount: 0 }],
    });
    expect(await queries.listPipelineJobsQuery.execute({}, queryContext)).toEqual({
      ok: true,
      value: { items: [], hasMore: false, nextCursor: null },
    });
    expect(
      await queries.getJobWorkspaceQuery.execute({ jobId: attemptJob }, queryContext),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await database.query(sqlStatement("SELECT id FROM status_definition"))).toEqual([]);
  });
  it("reads stable scoped keyset pages and rejects a changed or out-of-scope anchor", async () => {
    await seedAttemptJob();
    const jobs = createTrackerRepositories(database).jobs;
    const original = await jobs.findById(attemptJob);
    if (original === undefined) throw new Error("Synthetic job missing");
    const newerId = entityId("job", "0199b360-0000-7000-8000-000000000002");
    const tiedId = entityId("job", "0199b360-0000-7000-8000-000000000003");
    const archivedId = entityId("job", "0199b360-0000-7000-8000-000000000004");
    await jobs.create({ ...original, id: newerId, title: "Newer", updatedAt: EDITED_AT });
    await jobs.create({ ...original, id: tiedId, title: "Tied", updatedAt: EDITED_AT });
    await jobs.create({ ...original, id: archivedId, title: "Archived", archivedAt: VERSIONED_AT });
    const queries = pipelineQueries();
    const first = await queries.listPipelineJobsQuery.execute({ limit: 1 }, queryContext);
    expect(first).toMatchObject({
      ok: true,
      value: {
        items: [{ id: newerId }],
        hasMore: true,
        nextCursor: { jobId: newerId, updatedAt: EDITED_AT },
      },
    });
    if (!first.ok) throw new Error("First page failed");
    const second = await queries.listPipelineJobsQuery.execute(
      { after: first.value.nextCursor, limit: 1, statusId: null },
      queryContext,
    );
    expect(second).toMatchObject({ ok: true, value: { items: [{ id: tiedId }], hasMore: true } });
    const all = await queries.listPipelineJobsQuery.execute(
      { includeArchived: true },
      queryContext,
    );
    expect(all.ok && all.value.items.map(({ id }) => id)).toEqual([
      newerId,
      tiedId,
      attemptJob,
      archivedId,
    ]);
    expect(
      await queries.listPipelineJobsQuery.execute(
        { after: first.value.nextCursor, statusId: attemptInput().newStageId },
        queryContext,
      ),
    ).toMatchObject({ ok: false, error: { code: "conflict", retryable: true } });
    await database.execute(
      sqlStatement("UPDATE job SET updated_at = ?, row_version = row_version + 1 WHERE id = ?", [
        VERSIONED_AT,
        newerId,
      ]),
    );
    expect(
      await queries.listPipelineJobsQuery.execute({ after: first.value.nextCursor }, queryContext),
    ).toMatchObject({ ok: false, error: { code: "conflict", retryable: true } });
  });
  it("projects an actual attempt and pending action through the validated read port without writes", async () => {
    await seedAttemptJob();
    await createApplicationAttemptRepository(database).start(attemptInput());
    const actionId = entityId("next-action", "0199b360-0000-7000-8000-000000000005");
    await setNextAction(
      database,
      {
        id: actionId,
        jobId: attemptJob,
        applicationId: attemptInput().applicationId,
        interactionId: null,
        title: "Review requirements",
        dueAt: null,
        timeZone: null,
        state: "pending",
        completedAt: null,
        createdAt: VERSIONED_AT,
        updatedAt: VERSIONED_AT,
      },
      entityId("mutation-undo-token", "0199b360-0000-7000-8000-000000000006"),
    );
    const before = await stageState();
    const queries = pipelineQueries();
    expect(await queries.getPipelineCountsQuery.execute({}, queryContext)).toMatchObject({
      ok: true,
      value: { all: 1, needsAction: 1, overdue: 0, upcomingInterviews: 0, waiting: 0, closed: 0 },
    });
    expect(await queries.getPipelineBoardGroupsQuery.execute({}, queryContext)).toMatchObject({
      ok: true,
      value: [
        { statusId: null, jobCount: 0 },
        { statusId: attemptInput().newStageId, name: "Drafting locally", jobCount: 1 },
      ],
    });
    expect(
      await queries.listPipelineJobsQuery.execute(
        { statusId: attemptInput().newStageId },
        queryContext,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            id: attemptJob,
            status: { name: "Drafting locally" },
            nextAction: { id: actionId, title: "Review requirements" },
          },
        ],
      },
    });
    expect(
      await queries.getJobWorkspaceQuery.execute({ jobId: attemptJob }, queryContext),
    ).toMatchObject({
      ok: true,
      value: {
        job: { id: attemptJob },
        application: {
          id: attemptInput().applicationId,
          jobId: attemptJob,
          selectedResumeVersionId: null,
        },
        company: null,
        primarySource: null,
        attention: { nextAction: { id: actionId, jobId: attemptJob, timeZone: null } },
        timelineItemCount: 1,
      },
    });
    expect(await stageState()).toEqual(before);
  });
  const stageState = async () => ({
    jobs: await database.query(sqlStatement("SELECT * FROM job ORDER BY id")),
    applications: await database.query(sqlStatement("SELECT * FROM application ORDER BY id")),
    events: await database.query(sqlStatement("SELECT * FROM status_event ORDER BY id")),
    documents: await database.query(sqlStatement("SELECT * FROM document_version ORDER BY id")),
  });
  it("does not transport full descriptions in paginated summaries", async () => {
    await seedAttemptJob();
    const description = "Synthetic long description. ".repeat(10_000);
    await database.execute(
      sqlStatement("UPDATE job SET description_text = ? WHERE id = ?", [description, attemptJob]),
    );
    const projected: Array<readonly QueryRow[]> = [];
    const query = database.query.bind(database);
    database.query = async <Row extends QueryRow = QueryRow>(
      statement: SqlStatement,
    ): Promise<Row[]> => {
      const rows = await query<Row>(statement);
      if (statement.sql.includes("FROM job j LEFT JOIN")) projected.push(rows);
      return rows;
    };
    const queries = pipelineQueries();
    expect(await queries.listPipelineJobsQuery.execute({}, queryContext)).toMatchObject({
      ok: true,
      value: { items: [{ id: attemptJob }] },
    });
    expect(projected).toHaveLength(1);
    expect(Object.keys(projected[0]?.[0] ?? {})).not.toContain("description_text");
    expect(Object.keys(projected[0]?.[0] ?? {})).not.toContain("remote_region_json");
    expect(
      await queries.getJobWorkspaceQuery.execute({ jobId: attemptJob }, queryContext),
    ).toMatchObject({ ok: true, value: { descriptionText: description } });
  });
  it("projects real company/source/tag relationships and defined attention counts", async () => {
    const tracker = createTrackerRepositories(database);
    const companyId = entityId("company", "0199b370-0000-7000-8000-000000000001");
    const sourceId = entityId("job-source", "0199b370-0000-7000-8000-000000000002");
    const tagId = entityId("tag", "0199b370-0000-7000-8000-000000000003");
    await tracker.companies.create({
      id: companyId,
      canonicalName: "Synthetic query company",
      websiteUrl: null,
      domain: "synthetic.example",
      locationId: null,
      notes: "Local company context",
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await seedAttemptJob();
    await database.execute(
      sqlStatement("UPDATE job SET company_id = ? WHERE id = ?", [companyId, attemptJob]),
    );
    await tracker.jobSources.create({
      id: sourceId,
      jobId: attemptJob,
      connectorId: null,
      externalId: null,
      canonicalUrl: null,
      applyUrl: null,
      firstSeenAt: CREATED_AT,
      lastSeenAt: CREATED_AT,
      contentHash: null,
      primary: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await database.execute(
      sqlStatement(
        "INSERT INTO tag(id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",
        [tagId, "Review locally", CREATED_AT, CREATED_AT],
      ),
    );
    await database.execute(
      sqlStatement("INSERT INTO job_tag(job_id, tag_id, created_at) VALUES (?, ?, ?)", [
        attemptJob,
        tagId,
        CREATED_AT,
      ]),
    );
    await createApplicationAttemptRepository(database).start(attemptInput());
    await setNextAction(
      database,
      {
        id: entityId("next-action", "0199b370-0000-7000-8000-000000000004"),
        jobId: attemptJob,
        applicationId: attemptInput().applicationId,
        interactionId: null,
        title: "Due review",
        dueAt: EDITED_AT,
        timeZone: timeZone("America/New_York"),
        state: "pending",
        completedAt: null,
        createdAt: CREATED_AT,
        updatedAt: VERSIONED_AT,
      },
      entityId("mutation-undo-token", "0199b370-0000-7000-8000-000000000005"),
    );
    const pipeline = createPipelineRepositories(database);
    await pipeline.interviews.create({
      id: entityId("interview", "0199b370-0000-7000-8000-000000000006"),
      applicationId: attemptInput().applicationId,
      stageName: "Future conversation",
      startsAt: instant("2026-10-20T10:00:00.000Z"),
      timeZone: timeZone("America/New_York"),
      durationMinutes: 30,
      locationOrUrl: null,
      contactIds: [],
      preparationNotes: "",
      outcome: null,
      createdAt: VERSIONED_AT,
      updatedAt: VERSIONED_AT,
    });
    await pipeline.reminders.create({
      id: entityId("reminder", "0199b370-0000-7000-8000-000000000007"),
      jobId: attemptJob,
      nextActionId: null,
      interviewId: null,
      remindAt: instant("2026-10-20T09:00:00.000Z"),
      timeZone: timeZone("America/New_York"),
      state: "pending",
      note: "Local reminder",
      firedAt: null,
      createdAt: VERSIONED_AT,
      updatedAt: VERSIONED_AT,
    });
    await pipeline.interactions.append({
      id: entityId("interaction", "0199b370-0000-7000-8000-000000000008"),
      jobId: attemptJob,
      contactId: null,
      type: "note",
      occurredAt: VERSIONED_AT,
      direction: "unknown",
      summary: "Local query fixture",
      nextActionAt: null,
      createdAt: VERSIONED_AT,
      updatedAt: VERSIONED_AT,
    });
    const job = await tracker.jobs.findById(attemptJob);
    if (job === undefined) throw new Error("Synthetic job missing");
    const stage = (await createAppliedStageRepository(database).create(appliedStageInput())) as {
      id: ReturnType<typeof entityId<"status_definition">>;
    };
    await tracker.jobs.create({
      ...job,
      id: entityId("job", "0199b370-0000-7000-8000-000000000009"),
      currentStatusId: stage.id,
    });
    const queries = pipelineQueries();
    expect(await queries.getPipelineCountsQuery.execute({}, queryContext)).toMatchObject({
      ok: true,
      value: { all: 2, needsAction: 1, overdue: 1, upcomingInterviews: 1, waiting: 1, closed: 0 },
    });
    expect(
      await queries.getJobWorkspaceQuery.execute({ jobId: attemptJob }, queryContext),
    ).toMatchObject({
      ok: true,
      value: {
        job: {
          company: { id: companyId },
          tags: [{ id: tagId, name: "Review locally" }],
          lastInteractionAt: VERSIONED_AT,
        },
        company: {
          id: companyId,
          canonicalName: "Synthetic query company",
          otherActiveJobCount: 1,
          contactCount: 0,
        },
        primarySource: { id: sourceId, jobId: attemptJob },
        attention: {
          upcomingInterviewCount: 1,
          pendingReminderCount: 1,
          nextAction: { dueAt: EDITED_AT, timeZone: "America/New_York" },
        },
        timelineItemCount: 2,
      },
    });
    await database.execute(
      sqlStatement("UPDATE tag SET archived_at = ? WHERE id = ?", [VERSIONED_AT, tagId]),
    );
    const withoutTag = await queries.listPipelineJobsQuery.execute({}, queryContext);
    expect(withoutTag.ok && withoutTag.value.items.every((item) => item.tags.length === 0)).toBe(
      true,
    );
    const closedStatus = entityId("status_definition", "0199b370-0000-7000-8000-000000000010");
    await pipeline.statusDefinitions.create({
      id: closedStatus,
      name: "Archived closed stage",
      category: "rejected",
      terminal: true,
      isSystem: false,
      sortOrder: 20,
      color: null,
      archivedAt: VERSIONED_AT,
      createdAt: CREATED_AT,
      updatedAt: VERSIONED_AT,
    });
    await tracker.jobs.create({
      ...job,
      id: entityId("job", "0199b370-0000-7000-8000-000000000011"),
      currentStatusId: closedStatus,
      archivedAt: VERSIONED_AT,
    });
    expect(await queries.getPipelineCountsQuery.execute({}, queryContext)).toMatchObject({
      ok: true,
      value: { all: 2, closed: 0 },
    });
    expect(
      await queries.getPipelineCountsQuery.execute({ includeArchived: true }, queryContext),
    ).toMatchObject({ ok: true, value: { all: 3, closed: 1 } });
    const defaultGroups = await queries.getPipelineBoardGroupsQuery.execute({}, queryContext);
    expect(
      defaultGroups.ok && defaultGroups.value.some((group) => group.statusId === closedStatus),
    ).toBe(false);
    const archivedGroups = await queries.getPipelineBoardGroupsQuery.execute(
      { includeArchived: true },
      queryContext,
    );
    expect(
      archivedGroups.ok &&
        archivedGroups.value.find((group) => group.statusId === closedStatus)?.jobCount,
    ).toBe(1);
    await database.execute(
      sqlStatement("UPDATE job_source SET is_primary = 0 WHERE id = ?", [sourceId]),
    );
    expect(
      await queries.getJobWorkspaceQuery.execute({ jobId: attemptJob }, queryContext),
    ).toMatchObject({ ok: true, value: { primarySource: null } });
  });
  it("creates and reuses explicit Applied configuration without changing application state", async () => {
    await seedAttemptJob();
    await createApplicationAttemptRepository(database).start(attemptInput());
    const before = await stageState();
    const stages = createAppliedStageRepository(database);
    expect(await stages.create(appliedStageInput())).toEqual({
      id: appliedStageInput().id,
      name: "My submitted stage",
      created: true,
    });
    expect(
      await stages.create({
        ...appliedStageInput(),
        id: entityId("status_definition", "0199b350-0000-7000-8000-000000000002"),
      }),
    ).toEqual({ id: appliedStageInput().id, name: "My submitted stage", created: false });
    expect(
      await createPipelineRepositories(database).statusDefinitions.findById(appliedStageInput().id),
    ).toMatchObject({
      category: "applied",
      terminal: false,
      isSystem: false,
      archivedAt: null,
      sortOrder: 1,
      createdAt: VERSIONED_AT,
      updatedAt: VERSIONED_AT,
    });
    expect(await stageState()).toEqual(before);
    expect(await database.query(sqlStatement("SELECT id FROM status_definition"))).toHaveLength(2);
  });
  it.each(["category", "archived", "terminal", "case"])(
    "rejects %s name collisions without mutations",
    async (kind) => {
      const definitions = createPipelineRepositories(database).statusDefinitions;
      const existing = {
        id: appliedStageInput().id,
        name: kind === "case" ? "MY SUBMITTED STAGE" : appliedStageInput().name,
        category: kind === "category" ? ("preparing" as const) : ("applied" as const),
        color: null,
        terminal: kind === "terminal",
        isSystem: false,
        sortOrder: 0,
        archivedAt: kind === "archived" ? CREATED_AT : null,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      };
      await definitions.create(existing);
      const before = await database.query(
        sqlStatement("SELECT * FROM status_definition ORDER BY id"),
      );
      await expect(
        createAppliedStageRepository(database).create({
          ...appliedStageInput(),
          id: entityId("status_definition", "0199b350-0000-7000-8000-000000000002"),
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(
        await database.query(sqlStatement("SELECT * FROM status_definition ORDER BY id")),
      ).toEqual(before);
    },
  );
  it("rolls back a stage insert if the transaction fails after writing", async () => {
    const original = database.transaction.bind(database);
    database.transaction = (work) =>
      original(async (session) => {
        await work(session);
        throw new Error("Synthetic transaction failure after insert");
      });
    await expect(
      createAppliedStageRepository(database).create(appliedStageInput()),
    ).rejects.toThrow("Synthetic transaction failure");
    expect(await database.query(sqlStatement("SELECT * FROM status_definition"))).toEqual([]);
  });

  const derivativeId = entityId("document", "0199b340-0000-7000-8000-000000000001");
  const derivativeVersionId = entityId("document-version", "0199b340-0000-7000-8000-000000000002");
  const seedDerivative = async (
    options: { kind?: "resume" | "cover_letter"; text?: string } = {},
  ) => {
    await seedAttemptJob();
    const repositories = createDocumentRepositories(database);
    await repositories.lineages.create({
      documentId: DOCUMENT_ID,
      role: "base",
      baseDocumentId: null,
      templateDocumentId: null,
      jobId: null,
      createdAt: CREATED_AT,
    });
    await repositories.documents.create({
      id: derivativeId,
      kind: options.kind ?? "resume",
      title: "Job-specific copy",
      source: "user",
      archivedAt: null,
      createdAt: EDITED_AT,
      updatedAt: EDITED_AT,
    });
    await repositories.lineages.create({
      documentId: derivativeId,
      role: "job_derivative",
      baseDocumentId: DOCUMENT_ID,
      templateDocumentId: null,
      jobId: attemptJob,
      createdAt: EDITED_AT,
    });
    const text = options.text ?? "Original evidence";
    await repositories.versions.create({
      id: derivativeVersionId,
      documentId: derivativeId,
      versionNumber: 1,
      contentIrVersion: 1,
      contentIr: content(text),
      contentPlain: text,
      templateId: null,
      createdBy: "user",
      createdAt: EDITED_AT,
      parentVersionId: null,
      contentHash: hash(content(text)),
      label: "Exact reusable copy",
    });
  };
  const insertOrigin = (sourceVersionId: string = VERSION_1_ID, createdAt: string = EDITED_AT) =>
    database.execute(
      sqlStatement(
        "INSERT INTO document_derivation_origin (document_id, first_version_id, source_version_id, created_at) VALUES (?, ?, ?, ?)",
        [derivativeId, derivativeVersionId, sourceVersionId, createdAt],
      ),
    );

  it("retains the chosen older source version when the reusable document gains a newer version", async () => {
    await seedDerivative();
    await insertOrigin();
    await createDocumentRepositories(database).versions.create({
      id: VERSION_2_ID,
      documentId: DOCUMENT_ID,
      versionNumber: 2,
      contentIrVersion: 1,
      contentIr: content("Later reusable edit"),
      contentPlain: "Later reusable edit",
      templateId: null,
      createdBy: "user",
      createdAt: VERSIONED_AT,
      parentVersionId: VERSION_1_ID,
      contentHash: hash(content("Later reusable edit")),
      label: null,
    });
    expect(
      await database.query(
        sqlStatement(
          "SELECT origin.source_version_id, source.content_plain, first.content_hash = source.content_hash AS exact_hash FROM document_derivation_origin AS origin JOIN document_version AS source ON source.id = origin.source_version_id JOIN document_version AS first ON first.id = origin.first_version_id",
        ),
      ),
    ).toEqual([
      { source_version_id: VERSION_1_ID, content_plain: "Original evidence", exact_hash: 1 },
    ]);
  });

  it.each([
    { kind: "cover_letter" as const },
    { text: "Changed content must not claim an exact copy" },
  ])("rejects an origin whose first copy differs from its source: %j", async (options) => {
    await seedDerivative(options);
    await expect(insertOrigin()).rejects.toThrow("invalid exact document derivation origin");
  });

  it("rejects self-origin and fabricated derivation timestamps", async () => {
    await seedDerivative();
    await expect(insertOrigin(derivativeVersionId)).rejects.toThrow();
    await expect(insertOrigin(VERSION_1_ID, VERSIONED_AT)).rejects.toThrow();
    expect(await database.query(sqlStatement("SELECT * FROM document_derivation_origin"))).toEqual(
      [],
    );
  });

  it("does not permit rewriting or detaching an established version origin", async () => {
    await seedDerivative();
    await insertOrigin();
    await expect(
      database.execute(
        sqlStatement("UPDATE document_derivation_origin SET created_at = ? WHERE document_id = ?", [
          VERSIONED_AT,
          derivativeId,
        ]),
      ),
    ).rejects.toThrow("document derivation origin is immutable");
    await expect(
      database.execute(
        sqlStatement("DELETE FROM document_derivation_origin WHERE document_id = ?", [
          derivativeId,
        ]),
      ),
    ).rejects.toThrow("document derivation origin cannot be detached");
    await expect(
      database.execute(sqlStatement("DELETE FROM document_version WHERE id = ?", [VERSION_1_ID])),
    ).rejects.toThrow();
    await expect(
      database.execute(
        sqlStatement("DELETE FROM document_version WHERE id = ?", [derivativeVersionId]),
      ),
    ).rejects.toThrow();
    expect(
      await database.query(
        sqlStatement("SELECT COUNT(*) AS count FROM document_derivation_origin"),
      ),
    ).toEqual([{ count: 1 }]);
  });

  it("allows deleting the whole unsubmitted derivative without orphaning its origin or deleting its source", async () => {
    await seedDerivative();
    await insertOrigin();
    await database.execute(sqlStatement("DELETE FROM document WHERE id = ?", [derivativeId]));
    expect(await database.query(sqlStatement("SELECT * FROM document_derivation_origin"))).toEqual(
      [],
    );
    expect(
      await database.query(
        sqlStatement("SELECT id FROM document_version WHERE id = ?", [VERSION_1_ID]),
      ),
    ).toEqual([{ id: VERSION_1_ID }]);
  });

  const copyRequest = () => ({
    applicationId: attemptInput().applicationId,
    expectedApplicationRowVersion: 1,
    sourceVersionId: VERSION_1_ID,
    documentId: entityId("document", "0199b341-0000-7000-8000-000000000001"),
    versionId: entityId("document-version", "0199b341-0000-7000-8000-000000000002"),
    sourceDocumentId: DOCUMENT_ID,
    jobId: attemptJob,
    title: "Explicit application copy",
    kind: "resume" as const,
    content: content("Original evidence"),
    plainText: "Original evidence",
    contentHash: hash(content("Original evidence")),
    createdAt: VERSIONED_AT,
  });

  it("atomically creates a job derivative and origin without changing application selections", async () => {
    await seedDerivative();
    await createApplicationAttemptRepository(database).start(attemptInput());
    const repository = createDocumentDerivationRepository(database);
    expect(await repository.readBasis(copyRequest())).toMatchObject({
      sourceDocumentId: DOCUMENT_ID,
      sourceVersionId: VERSION_1_ID,
      kind: "resume",
    });
    await repository.create(copyRequest());
    expect(
      await database.query(
        sqlStatement(
          "SELECT source_version_id FROM document_derivation_origin WHERE document_id = ?",
          [copyRequest().documentId],
        ),
      ),
    ).toEqual([{ source_version_id: VERSION_1_ID }]);
    expect(
      await database.query(
        sqlStatement(
          "SELECT selected_resume_version_id, selected_cover_letter_version_id, applied_at, row_version FROM application",
        ),
      ),
    ).toEqual([
      {
        selected_resume_version_id: null,
        selected_cover_letter_version_id: null,
        applied_at: null,
        row_version: 1,
      },
    ]);
  });

  it("rejects a stale or applied target and an archived reusable source", async () => {
    await seedDerivative();
    await createApplicationAttemptRepository(database).start(attemptInput());
    const repository = createDocumentDerivationRepository(database);
    await expect(
      repository.create({ ...copyRequest(), expectedApplicationRowVersion: 2 }),
    ).rejects.toMatchObject({ code: "conflict" });
    await database.execute(
      sqlStatement(
        "UPDATE document SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
        [VERSIONED_AT, VERSIONED_AT, DOCUMENT_ID],
      ),
    );
    await expect(repository.create(copyRequest())).rejects.toMatchObject({ code: "conflict" });
    await database.execute(
      sqlStatement(
        "UPDATE document SET archived_at = NULL, row_version = row_version + 1 WHERE id = ?",
        [DOCUMENT_ID],
      ),
    );
    await database.execute(
      sqlStatement(
        "UPDATE application SET applied_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
        [VERSIONED_AT, VERSIONED_AT, attemptInput().applicationId],
      ),
    );
    await expect(
      repository.create({ ...copyRequest(), expectedApplicationRowVersion: 2 }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      await database.query(
        sqlStatement("SELECT id FROM document WHERE id = ?", [copyRequest().documentId]),
      ),
    ).toEqual([]);
  });

  it("rolls back metadata and lineage if immutable version creation fails after earlier writes", async () => {
    await seedDerivative();
    await createApplicationAttemptRepository(database).start(attemptInput());
    await expect(
      createDocumentDerivationRepository(database).create({
        ...copyRequest(),
        versionId: VERSION_1_ID,
      }),
    ).rejects.toThrow();
    expect(
      await database.query(
        sqlStatement("SELECT id FROM document WHERE id = ?", [copyRequest().documentId]),
      ),
    ).toEqual([]);
    expect(
      await database.query(
        sqlStatement("SELECT document_id FROM document_lineage WHERE document_id = ?", [
          copyRequest().documentId,
        ]),
      ),
    ).toEqual([]);
    expect(await database.query(sqlStatement("SELECT * FROM document_derivation_origin"))).toEqual(
      [],
    );
  });

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
