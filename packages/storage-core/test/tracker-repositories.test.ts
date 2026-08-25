import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createPhase1RepositoryContractSuite,
  defineSqlMigrations,
  normalizeJobSearchTokens,
  openJobSearchRepository,
  PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES,
  PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
  runDatabaseContractSuite,
  sqlStatement,
  type DatabaseContractAdapter,
  type DatabasePort,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlStatement,
  type StorageDiagnostics,
} from "../src/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const APPLIED_AT = "2026-08-25T12:00:00.000Z";
const legacyMigrationDefinitions = [
  ["0001_vault.sql", "vault"],
  ["0002_capture_inbox.sql", "capture-inbox"],
  ["0003_app_setting.sql", "app-setting"],
  ["0004_location.sql", "location"],
  ["0005_company.sql", "company"],
  ["0006_contact.sql", "contact"],
  ["0007_job.sql", "job"],
  ["0008_job_source.sql", "job-source"],
  ["0009_source_snapshot.sql", "source-snapshot"],
  ["0010_provenance.sql", "provenance"],
  ["0011_company_alias.sql", "company-alias"],
  ["0012_contact_point_provenance.sql", "contact-point-provenance"],
  ["0013_field_value.sql", "field-value"],
  ["0014_status_definition.sql", "status-definition"],
  ["0015_job_current_status.sql", "job-current-status"],
  ["0016_job_next_action.sql", "job-next-action"],
  ["0017_application.sql", "application"],
  ["0018_status_event.sql", "status-event"],
  ["0019_interaction.sql", "interaction"],
  ["0020_next_action.sql", "next-action"],
  ["0021_interview.sql", "interview"],
  ["0022_reminder.sql", "reminder"],
  ["0023_tag.sql", "tag"],
  ["0024_job_tag.sql", "job-tag"],
  ["0025_saved_view.sql", "saved-view"],
  ["0026_document.sql", "document"],
  ["0027_document_version.sql", "document-version"],
  ["0028_document_job_link.sql", "document-job-link"],
  ["0029_attachment_manifest.sql", "attachment-manifest"],
  ["0030_document_version_attachment.sql", "document-version-attachment"],
  ["0031_document_style_example.sql", "document-style-example"],
  ["0032_device.sql", "device"],
  ["0033_integrity_probe.sql", "integrity-probe"],
  ["0034_validate_existing_integrity.sql", "validate-existing-integrity"],
  ["0035_drop_integrity_probe.sql", "drop-integrity-probe"],
  ["0036_application_document_insert_guard.sql", "application-document-insert-guard"],
  ["0037_application_document_update_guard.sql", "application-document-update-guard"],
  ["0038_document_kind_update_guard.sql", "document-kind-update-guard"],
  ["0039_document_version_lineage_guard.sql", "document-version-lineage-guard"],
  ["0040_document_version_update_guard.sql", "document-version-update-guard"],
  ["0041_document_version_delete_guard.sql", "document-version-delete-guard"],
  ["0042_source_snapshot_update_guard.sql", "source-snapshot-update-guard"],
  ["0043_status_event_update_guard.sql", "status-event-update-guard"],
  ["0044_interaction_update_guard.sql", "interaction-update-guard"],
  ["0045_attachment_manifest_update_guard.sql", "attachment-manifest-update-guard"],
] as const;
const migrationDefinitions = [
  ...legacyMigrationDefinitions,
  ...readdirSync(path.join(repositoryRoot, "migrations"))
    .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
    .filter((fileName) => Number(fileName.slice(0, 4)) > 45)
    .sort()
    .map((fileName) => [fileName, fileName.slice(5, -4).replaceAll("_", "-")] as const),
];

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

class NodeSqliteTestDatabase implements DatabasePort {
  private readonly database = new DatabaseSync(":memory:");
  private closed = false;

  public constructor() {
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    const rows = this.database.prepare(statement.sql).all(...statement.parameters);
    return rows as Row[];
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

  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Portable export is outside this in-memory repository contract adapter.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    const row = this.database.prepare("PRAGMA user_version").get() as
      { readonly user_version: number } | undefined;
    return Object.freeze({
      adapterName: "node-sqlite-unit-contract",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: row?.user_version ?? 0,
      details: Object.freeze(["unit-contract-only"]),
    });
  }

  public close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}

const adapter: DatabaseContractAdapter = {
  name: "node-sqlite-unit-contract",
  createIsolatedDatabase: async () => new NodeSqliteTestDatabase(),
  disposeIsolatedDatabase: async (database) => {
    (database as NodeSqliteTestDatabase).close();
  },
};

describe("Phase 1 tracker repository contracts", () => {
  it("normalizes bounded lexical tokens without admitting FTS query syntax", () => {
    expect(normalizeJobSearchTokens("  Ｐｌａｔｆｏｒｍ platform OR notes:* --  ")).toEqual([
      "platform",
      "or",
      "notes",
    ]);
    expect(normalizeJobSearchTokens("!!!")).toEqual([]);
    expect(() =>
      normalizeJobSearchTokens(Array.from({ length: 17 }, (_, index) => `token${index}`).join(" ")),
    ).toThrow(TypeError);
    expect(() => normalizeJobSearchTokens("x".repeat(513))).toThrow(TypeError);
    expect(() => normalizeJobSearchTokens("x".repeat(65))).toThrow(TypeError);
    expect(() => normalizeJobSearchTokens("safe\u0000unsafe")).toThrow(TypeError);
  });

  it("uses the reviewed indexes for representative active, source, timeline, and document queries", async () => {
    const database = new NodeSqliteTestDatabase();
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      const plans = await Promise.all([
        database.query<{ readonly detail: string }>(
          sqlStatement(
            `EXPLAIN QUERY PLAN
             SELECT id FROM job
             WHERE archived_at IS NULL AND company_id = ?
             ORDER BY updated_at DESC, id`,
            ["0198e105-0000-7000-8000-000000000003"],
          ),
        ),
        database.query<{ readonly detail: string }>(
          sqlStatement("EXPLAIN QUERY PLAN SELECT job_id FROM job_source WHERE canonical_url = ?", [
            "https://example.invalid/jobs/1",
          ]),
        ),
        database.query<{ readonly detail: string }>(
          sqlStatement(
            `EXPLAIN QUERY PLAN
             SELECT id FROM status_event WHERE job_id = ? ORDER BY occurred_at, id`,
            ["0198e105-0000-7000-8000-000000000001"],
          ),
        ),
        database.query<{ readonly detail: string }>(
          sqlStatement(
            `EXPLAIN QUERY PLAN
             SELECT id FROM document
             WHERE archived_at IS NULL ORDER BY updated_at DESC, id`,
          ),
        ),
      ]);
      const details = plans.flat().map((row) => row.detail);
      for (const indexName of [
        "job_company_active_idx",
        "job_source_canonical_url_idx",
        "status_event_timeline_idx",
        "document_active_updated_idx",
      ]) {
        expect(details.some((detail) => detail.includes(indexName))).toBe(true);
      }
    } finally {
      database.close();
    }
  });

  it("detects a missing FTS5 module and searches through the functional fallback", async () => {
    const database = new NodeSqliteTestDatabase();
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      await database.execute(
        sqlStatement(
          `INSERT INTO job(
             id, title, normalized_title, description_text, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            "0198e105-0000-7000-8000-000000000099",
            "Fallback Systems Engineer",
            "fallback systems engineer",
            "Maintains offline lexical retrieval.",
            "2026-08-25T17:00:00.000Z",
            "2026-08-25T17:00:00.000Z",
          ],
        ),
      );
      const withoutFts: DatabasePort = {
        diagnostics: () => database.diagnostics(),
        execute: (statement) => {
          if (statement.sql.includes("coredrill_fts5_probe")) {
            throw new Error("no such module: fts5");
          }
          return database.execute(statement);
        },
        exportPortable: () => database.exportPortable(),
        query: (statement) => database.query(statement),
        transaction: (work) => database.transaction(work),
      };
      const search = await openJobSearchRepository(withoutFts);
      expect(search.capability).toEqual({
        mode: "normalized-token",
        runtimeProbe: "temporary-virtual-table",
        fallbackReason: "module-unavailable",
      });
      await expect(search.search({ query: "offline retrieval" })).resolves.toMatchObject({
        results: [{ jobId: "0198e105-0000-7000-8000-000000000099" }],
      });
    } finally {
      database.close();
    }
  });

  it("rolls back the DB-006 upgrade when historical audit data is invalid", async () => {
    const database = new NodeSqliteTestDatabase();
    try {
      await applySqlMigrations(database, migrations.slice(0, 31), APPLIED_AT);
      await database.execute(
        sqlStatement(
          `INSERT INTO location(id, label, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
          [
            "0198e102-0000-7000-8000-0000000000ff",
            "Historical invalid audit row",
            "2026-08-25T12:01:00.000Z",
            "2026-08-25T12:00:00.000Z",
          ],
        ),
      );

      await expect(applySqlMigrations(database, migrations, APPLIED_AT)).rejects.toThrow();
      await expect(database.diagnostics()).resolves.toMatchObject({ schemaVersion: 31 });
      await expect(
        database.query(
          sqlStatement(
            `SELECT name FROM sqlite_master
             WHERE name IN ('device', 'coredrill_integrity_probe')`,
          ),
        ),
      ).resolves.toEqual([]);
    } finally {
      database.close();
    }
  });

  it("passes the versioned Phase 1 repository contract manifest in fast SQLite", async () => {
    const suite = createPhase1RepositoryContractSuite({
      expectedFts5: true,
      migrate: async (database) => {
        await applySqlMigrations(database, migrations, APPLIED_AT);
      },
    });

    await expect(runDatabaseContractSuite(adapter, suite)).resolves.toEqual({
      adapterName: "node-sqlite-unit-contract",
      suiteName: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.suiteName,
      completedCases: PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES,
    });
  });
});
