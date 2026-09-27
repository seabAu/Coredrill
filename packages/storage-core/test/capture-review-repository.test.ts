import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { entityId } from "@coredrill/domain";

import {
  CaptureReviewRepositoryError,
  applySqlMigrations,
  createCaptureReviewRepository,
  defineSqlMigrations,
  sqlStatement,
  type CaptureReviewPromotionInput,
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

class TestDatabase implements DatabasePort {
  private readonly database = new DatabaseSync(":memory:");
  public failSqlContains: string | null = null;

  public constructor() {
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    return this.database.prepare(statement.sql).all(...statement.parameters) as Row[];
  }

  public async execute(statement: SqlStatement): Promise<ExecuteResult> {
    if (this.failSqlContains !== null && statement.sql.includes(this.failSqlContains)) {
      throw new Error("intentional capture review storage failure");
    }
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
    const transaction: DatabaseTransaction = {
      query: (statement) => this.query(statement),
      execute: (statement) => this.execute(statement),
    };
    try {
      const result = await work(transaction);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public exportPortable(): Promise<PortableDatabase> {
    return Promise.reject(new Error("Not used by the capture review repository tests."));
  }

  public diagnostics(): Promise<StorageDiagnostics> {
    const row = this.database.prepare("PRAGMA user_version").get() as
      { readonly user_version: number } | undefined;
    return Promise.resolve({
      adapterName: "capture-review-test",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: row?.user_version ?? 0,
      details: [],
    });
  }

  public close(): void {
    this.database.close();
  }
}

const id = <TEntity extends string>(entity: TEntity, suffix: number) =>
  entityId(entity, `019c0000-0000-7000-8000-${suffix.toString(16).padStart(12, "0")}`);
const NOW = "2026-09-26T20:00:00.000Z";

const insertReceipt = async (
  database: DatabasePort,
  suffix: number,
): Promise<{ readonly envelopeId: string; readonly contentHash: string }> => {
  const envelopeId = id("capture-envelope", suffix);
  const contentHash = suffix.toString(16).padStart(64, "0");
  await database.execute(
    sqlStatement(
      `INSERT INTO capture_inbox(
         envelope_id, content_hash, envelope_checksum, sender_id, sender_sequence,
         sender_nonce, captured_at, expires_at, received_at, received_via, envelope_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_export', ?)`,
      [
        envelopeId,
        contentHash,
        "b".repeat(64),
        `capture-review-test-${String(suffix)}`,
        suffix,
        `nonce-${String(suffix).padStart(20, "0")}`,
        NOW,
        "2026-10-26T20:00:00.000Z",
        NOW,
        JSON.stringify({ id: envelopeId }),
      ],
    ),
  );
  return { envelopeId, contentHash };
};

const promotion = (input: {
  readonly envelopeId: string;
  readonly contentHash: string;
  readonly suffix: number;
  readonly resolution:
    { readonly kind: "merge_existing"; readonly jobId: string } | { readonly kind: "save_new" };
}): CaptureReviewPromotionInput => {
  const jobId =
    input.resolution.kind === "save_new"
      ? id("job", input.suffix + 1)
      : entityId("job", input.resolution.jobId);
  return {
    envelopeId: entityId("capture-envelope", input.envelopeId),
    expectedContentHash: input.contentHash,
    expectedReviewRowVersion: 1,
    resolution:
      input.resolution.kind === "merge_existing"
        ? { kind: "merge_existing", jobId }
        : {
            kind: "save_new",
            job: {
              id: jobId,
              company: {
                id: id("company", input.suffix + 2),
                canonicalName: "Review Fixture Company",
              },
              title: "Review Fixture Engineer",
              normalizedTitle: "review fixture engineer",
              descriptionText: "Stored from explicit local review.",
              employmentType: "full_time",
              workplaceType: "remote",
              datePosted: "2026-09-20",
              validThrough: "2026-10-20",
              createdAt: "2026-09-26T20:01:00.000Z",
            },
          },
    source: {
      id: id("job-source", input.suffix + 3),
      connectorId: "manual_entry",
      externalId: null,
      canonicalUrl: "https://jobs.example.test/review-fixture",
      applyUrl: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      contentHash: input.contentHash,
      createdAt: "2026-09-26T20:01:00.000Z",
    },
    snapshot: {
      id: id("source-snapshot", input.suffix + 4),
      capturedAt: NOW,
      extractorId: "coredrill.capture-envelope",
      extractorVersion: "1.0.0",
      rawText: "Review Fixture Engineer",
      sanitizedHtml: null,
      structuredJson: '{"title":"Review Fixture Engineer"}',
      contentHash: input.contentHash,
      retentionClass: "capture_review",
      createdAt: "2026-09-26T20:01:00.000Z",
    },
    candidates: [
      {
        fieldValueId: id("field-value", input.suffix + 5),
        provenanceId: id("provenance", input.suffix + 6),
        fieldName: "title",
        normalizedJson: '"Review Fixture Engineer"',
        rawJson: null,
        extractionMethod: "user",
        sourcePointer: "/fields/title",
        sourceExcerpt: "Review Fixture Engineer",
        confidence: 1,
        capturedAt: NOW,
        userConfirmation: {
          id: id("field-confirmation", input.suffix + 7),
          confirmedAt: "2026-09-26T20:01:00.000Z",
          confirmedValueHash: "c".repeat(64),
        },
      },
      {
        fieldValueId: id("field-value", input.suffix + 8),
        provenanceId: id("provenance", input.suffix + 9),
        fieldName: "description",
        normalizedJson: '"Stored from explicit local review."',
        rawJson: '"Raw description"',
        extractionMethod: "selector",
        sourcePointer: "/content/readableText",
        sourceExcerpt: "Stored from explicit local review.",
        confidence: 0.7,
        capturedAt: NOW,
        userConfirmation: null,
      },
    ],
    resolvedAt: "2026-09-26T20:01:00.000Z",
  };
};

const expectCode = async (
  promise: Promise<unknown>,
  code: CaptureReviewRepositoryError["code"],
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    name: "CaptureReviewRepositoryError",
    code,
  });
};

describe("capture review repository", () => {
  it("persists snooze, discard, single-use undo, and guarded state transitions", async () => {
    const database = new TestDatabase();
    try {
      await applySqlMigrations(database, migrations, NOW);
      await expect(database.diagnostics()).resolves.toMatchObject({ schemaVersion: 119 });
      const receipt = await insertReceipt(database, 1);
      const envelopeId = entityId("capture-envelope", receipt.envelopeId);
      const repository = createCaptureReviewRepository(database);

      await expect(repository.list()).resolves.toEqual([
        {
          envelopeId,
          state: "pending",
          snoozedUntil: null,
          resolutionKind: null,
          resolvedJobId: null,
          updatedAt: NOW,
          rowVersion: 1,
        },
      ]);
      const snoozed = await repository.snooze({
        envelopeId,
        expectedRowVersion: 1,
        snoozedUntil: "2026-10-03T20:00:00.000Z",
        updatedAt: "2026-09-26T20:01:00.000Z",
      });
      expect(snoozed).toMatchObject({ state: "snoozed", rowVersion: 2 });
      const awake = await repository.wake({
        envelopeId,
        expectedRowVersion: 2,
        updatedAt: "2026-09-26T20:02:00.000Z",
      });
      expect(awake).toMatchObject({ state: "pending", rowVersion: 3 });
      const discarded = await repository.discard({
        envelopeId,
        expectedRowVersion: 3,
        undoTokenId: id("capture-review-discard-undo", 20),
        discardedAt: "2026-09-26T20:03:00.000Z",
      });
      expect(discarded.item).toMatchObject({ state: "discarded", rowVersion: 4 });
      expect(discarded.undo).toMatchObject({
        previousState: "pending",
        expectedReviewRowVersion: 4,
        consumedAt: null,
      });
      const restored = await repository.undoDiscard({
        undoTokenId: discarded.undo.id,
        restoredAt: "2026-09-26T20:04:00.000Z",
      });
      expect(restored.item).toMatchObject({ state: "pending", rowVersion: 5 });
      expect(restored.undo).toMatchObject({
        consumedAt: "2026-09-26T20:04:00.000Z",
        rowVersion: 2,
      });

      await expectCode(
        repository.undoDiscard({
          undoTokenId: discarded.undo.id,
          restoredAt: "2026-09-26T20:05:00.000Z",
        }),
        "token_consumed",
      );
      await expectCode(
        repository.snooze({
          envelopeId,
          expectedRowVersion: 4,
          snoozedUntil: "2026-10-03T20:00:00.000Z",
          updatedAt: "2026-09-26T20:05:00.000Z",
        }),
        "stale_state",
      );
      await expect(
        database.execute(
          sqlStatement("DELETE FROM capture_review_item WHERE envelope_id = ?", [envelopeId]),
        ),
      ).rejects.toThrow();
    } finally {
      database.close();
    }
  });

  it("saves a new job, source snapshot, provenance, candidates, and resolution atomically", async () => {
    const database = new TestDatabase();
    try {
      await applySqlMigrations(database, migrations, NOW);
      const receipt = await insertReceipt(database, 100);
      const repository = createCaptureReviewRepository(database);
      const input = promotion({
        envelopeId: receipt.envelopeId,
        contentHash: receipt.contentHash,
        suffix: 1000,
        resolution: { kind: "save_new" },
      });

      const resolved = await repository.promote(input);
      expect(resolved).toMatchObject({
        state: "resolved",
        resolutionKind: "save_new",
        resolvedJobId: input.resolution.kind === "save_new" ? input.resolution.job.id : null,
        rowVersion: 2,
      });
      const jobs = await database.query(
        sqlStatement("SELECT id, title, company_id FROM job ORDER BY id"),
      );
      expect(jobs).toEqual([
        {
          id: input.resolution.kind === "save_new" ? input.resolution.job.id : "",
          title: "Review Fixture Engineer",
          company_id:
            input.resolution.kind === "save_new" ? input.resolution.job.company?.id : null,
        },
      ]);
      await expect(
        database.query(
          sqlStatement("SELECT id FROM job_source WHERE job_id = ?", [resolved.resolvedJobId]),
        ),
      ).resolves.toHaveLength(1);
      await expect(
        database.query(sqlStatement("SELECT id FROM source_snapshot")),
      ).resolves.toHaveLength(1);
      await expect(database.query(sqlStatement("SELECT id FROM provenance"))).resolves.toHaveLength(
        2,
      );
      const fields = await database.query<{
        readonly field_name: string;
        readonly is_user_confirmed: number;
      }>(sqlStatement("SELECT field_name, is_user_confirmed FROM field_value ORDER BY field_name"));
      expect(fields).toEqual([
        { field_name: "description", is_user_confirmed: 0 },
        { field_name: "title", is_user_confirmed: 1 },
      ]);
      await expectCode(repository.promote(input), "stale_state");
      await expect(
        database.execute(
          sqlStatement(
            `UPDATE capture_review_item
             SET state = 'pending', resolution_kind = NULL, resolved_job_id = NULL,
                 updated_at = ?, row_version = row_version + 1
             WHERE envelope_id = ?`,
            ["2026-09-26T20:02:00.000Z", receipt.envelopeId],
          ),
        ),
      ).rejects.toThrow();
    } finally {
      database.close();
    }
  });

  it("merges without overwriting the target and rolls every partial promotion back", async () => {
    const database = new TestDatabase();
    try {
      await applySqlMigrations(database, migrations, NOW);
      const targetJobId = id("job", 300);
      await database.execute(
        sqlStatement(
          `INSERT INTO job(id, title, description_text, created_at, updated_at)
           VALUES (?, 'Existing confirmed title', 'Existing description', ?, ?)`,
          [targetJobId, NOW, NOW],
        ),
      );
      const mergeReceipt = await insertReceipt(database, 301);
      const repository = createCaptureReviewRepository(database);
      const merged = await repository.promote(
        promotion({
          envelopeId: mergeReceipt.envelopeId,
          contentHash: mergeReceipt.contentHash,
          suffix: 3000,
          resolution: { kind: "merge_existing", jobId: targetJobId },
        }),
      );
      expect(merged).toMatchObject({
        state: "resolved",
        resolutionKind: "merge_existing",
        resolvedJobId: targetJobId,
      });
      await expect(
        database.query(
          sqlStatement("SELECT title, description_text FROM job WHERE id = ?", [targetJobId]),
        ),
      ).resolves.toEqual([
        { title: "Existing confirmed title", description_text: "Existing description" },
      ]);

      const failedReceipt = await insertReceipt(database, 302);
      const failed = promotion({
        envelopeId: failedReceipt.envelopeId,
        contentHash: failedReceipt.contentHash,
        suffix: 4000,
        resolution: { kind: "save_new" },
      });
      database.failSqlContains = "INSERT INTO field_value";
      await expectCode(repository.promote(failed), "storage_failed");
      database.failSqlContains = null;
      await expect(repository.list()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            envelopeId: failed.envelopeId,
            state: "pending",
            rowVersion: 1,
          }),
        ]),
      );
      await expect(
        database.query(
          sqlStatement("SELECT id FROM job WHERE id = ?", [
            failed.resolution.kind === "save_new" ? failed.resolution.job.id : "",
          ]),
        ),
      ).resolves.toEqual([]);

      const missingTargetReceipt = await insertReceipt(database, 303);
      await expectCode(
        repository.promote(
          promotion({
            envelopeId: missingTargetReceipt.envelopeId,
            contentHash: missingTargetReceipt.contentHash,
            suffix: 5000,
            resolution: { kind: "merge_existing", jobId: id("job", 9999) },
          }),
        ),
        "target_missing",
      );
      await expect(repository.list()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            envelopeId: entityId("capture-envelope", missingTargetReceipt.envelopeId),
            state: "pending",
            rowVersion: 1,
          }),
        ]),
      );
      console.info(
        `REV004_TRANSACTION_PROOF ${JSON.stringify({
          schemaVersion: 119,
          durableQueueTransitions: true,
          singleUseUndo: true,
          saveAtomic: true,
          mergePreservesCanonicalTarget: true,
          injectedFailureRolledBack: true,
          missingTargetRolledBack: true,
          provenanceRetained: true,
          explicitConfirmationsOnly: true,
        })}`,
      );
    } finally {
      database.close();
    }
  });
});
