import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { backup, DatabaseSync } from "node:sqlite";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { entityId, instant, timeZone } from "@coredrill/domain";
import { createMutationUndoOperations } from "@coredrill/application";

import {
  applySqlMigrations,
  createDatabaseJobActivityPort,
  createDatabaseViewedInteractionPort,
  createDatabaseJobNotePort,
  createDatabaseJobPipelinePort,
  createDatabaseMutationUndoPort,
  createDatabaseVaultLifecyclePort,
  createDatabaseVaultBootstrapPort,
  createPhase1RepositoryContractSuite,
  createPipelineRepositories,
  createTrackerRepositories,
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
    const directory = mkdtempSync(path.join(tmpdir(), "coredrill-repository-contract-"));
    const target = path.join(directory, "synthetic.sqlite");
    try {
      await backup(this.database, target);
      const bytes = new Uint8Array(readFileSync(target));
      return Object.freeze({
        schemaVersion: (await this.diagnostics()).schemaVersion,
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
      });
    } finally {
      if (existsSync(target)) unlinkSync(target);
      rmdirSync(directory);
    }
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

  it("preserves an acknowledged capture receipt from schema 2 through the current schema", async () => {
    const database = new NodeSqliteTestDatabase();
    try {
      await applySqlMigrations(database, migrations.slice(0, 2), APPLIED_AT);
      await database.execute(
        sqlStatement(
          `INSERT INTO capture_inbox(
             envelope_id,
             content_hash,
             envelope_checksum,
             sender_id,
             sender_sequence,
             sender_nonce,
             captured_at,
             expires_at,
             received_at,
             received_via,
             envelope_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "0198f000-0000-7000-8000-000000000001",
            "a".repeat(64),
            "b".repeat(64),
            "abcdefghijklmnopabcdefghijklmnop",
            0,
            "q2-upgrade-nonce-000001",
            "2026-09-27T12:00:00.000Z",
            "2026-09-28T12:00:00.000Z",
            "2026-09-27T12:00:01.000Z",
            "external_message",
            '{"specVersion":1,"proof":"Q2-002"}',
          ],
        ),
      );

      const selectReceipt = () =>
        database.query(
          sqlStatement(
            `SELECT
               envelope_id AS envelopeId,
               content_hash AS contentHash,
               envelope_checksum AS envelopeChecksum,
               sender_id AS senderId,
               sender_sequence AS senderSequence,
               sender_nonce AS senderNonce,
               captured_at AS capturedAt,
               expires_at AS expiresAt,
               received_at AS receivedAt,
               received_via AS receivedVia,
               envelope_json AS envelopeJson
             FROM capture_inbox`,
          ),
        );
      const receiptBeforeUpgrade = await selectReceipt();
      expect(receiptBeforeUpgrade).toHaveLength(1);

      await applySqlMigrations(database, migrations, "2026-09-27T12:01:00.000Z");

      await expect(database.diagnostics()).resolves.toMatchObject({
        schemaVersion: migrations.length,
      });
      await expect(selectReceipt()).resolves.toEqual(receiptBeforeUpgrade);
    } finally {
      database.close();
    }
  });

  it("passes the versioned Phase 1 repository contract manifest in fast SQLite", async () => {
    const suite = createPhase1RepositoryContractSuite({
      expectedFts5: true,
      migrate: async (database, throughVersion) => {
        await applySqlMigrations(database, migrations.slice(0, throughVersion), APPLIED_AT);
      },
    });

    await expect(runDatabaseContractSuite(adapter, suite)).resolves.toEqual({
      adapterName: "node-sqlite-unit-contract",
      suiteName: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.suiteName,
      completedCases: PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES,
    });
  });
});

describe("SQLite application port composition", () => {
  it("copies guarded input before a delayed transaction and rejects omitted scope before effects", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class HeldDatabase extends NodeSqliteTestDatabase {
      hold = false;
      calls = 0;
      override async transaction<Result>(
        work: (session: DatabaseTransaction) => Promise<Result>,
      ): Promise<Result> {
        this.calls++;
        if (this.hold) await gate;
        return super.transaction(work);
      }
    }
    const database = new HeldDatabase();
    const at = instant("2026-10-22T06:00:00.000Z");
    const vaultId = entityId("vault", "0199b365-0000-7000-8000-000000000021");
    const jobId = entityId("job", "0199b365-0000-7000-8000-000000000022");
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      await database.execute(
        sqlStatement("INSERT INTO vault VALUES (?, ?, 165, ?, ?)", [vaultId, "Synthetic", at, at]),
      );
      await database.execute(
        sqlStatement("INSERT INTO job(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", [
          jobId,
          "Synthetic role",
          at,
          at,
        ]),
      );
      const port = createDatabaseViewedInteractionPort(database);
      const original = {
        id: entityId("interaction", "0199b365-0000-7000-8000-000000000023"),
        jobId,
        contactId: null,
        type: "note",
        occurredAt: at,
        direction: "unknown" as const,
        summary: "original",
        nextActionAt: null,
        createdAt: at,
        updatedAt: at,
      };
      const calls = database.calls;
      await expect(port.recordInteraction(original)).rejects.toMatchObject({
        code: "invalid_state",
      });
      expect(database.calls).toBe(calls);
      database.hold = true;
      const expected = {
        specVersion: 1 as const,
        expectedVaultId: vaultId,
        jobRowVersion: 1,
        contactRowVersion: null,
      };
      const input = { ...original, expected };
      const pending = port.recordInteraction(input);
      input.summary = "mutated after dispatch";
      expected.jobRowVersion = 2;
      release();
      await expect(pending).resolves.toMatchObject({ summary: "original", jobId, contactId: null });
      expect(await database.query(sqlStatement("SELECT summary FROM interaction"))).toEqual([
        { summary: "original" },
      ]);
    } finally {
      release();
      database.close();
    }
  });
  it.each([
    "active",
    "no-contact",
    "wrong-vault",
    "multiple-vaults",
    "missing-vault",
    "stale-job",
    "archived-job",
    "missing-job",
    "stale-contact",
    "archived-contact",
    "missing-contact",
    "retry",
    "collision",
    "readback-failure",
  ] as const)("guards the original viewed interaction and exact retry (%s)", async (state) => {
    class ReadbackDatabase extends NodeSqliteTestDatabase {
      override async query<Row extends QueryRow = QueryRow>(
        statement: SqlStatement,
      ): Promise<readonly Row[]> {
        const rows = await super.query<Row>(statement);
        if (
          state === "readback-failure" &&
          statement.sql.includes("FROM interaction WHERE id =") &&
          rows.length > 0
        )
          return rows.map((row) => ({ ...row, summary: "wrong acknowledgement" })) as Row[];
        return rows;
      }
    }
    const database = new ReadbackDatabase();
    const at = instant("2026-10-22T06:00:00.000Z");
    const vaultId = entityId("vault", "0199b365-0000-7000-8000-000000000011");
    const jobId = entityId("job", "0199b365-0000-7000-8000-000000000012");
    const contactId = entityId("contact", "0199b365-0000-7000-8000-000000000013");
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      if (state !== "missing-vault")
        await database.execute(
          sqlStatement("INSERT INTO vault VALUES (?, ?, 165, ?, ?)", [
            vaultId,
            "Synthetic recording",
            at,
            at,
          ]),
        );
      if (state === "multiple-vaults")
        await database.execute(
          sqlStatement("INSERT INTO vault VALUES (?, ?, 165, ?, ?)", [
            jobId,
            "Second synthetic root",
            at,
            at,
          ]),
        );
      if (state !== "missing-job")
        await database.execute(
          sqlStatement(
            "INSERT INTO job(id, title, created_at, updated_at, row_version, archived_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
              jobId,
              "Synthetic role",
              at,
              at,
              state === "stale-job" ? 2 : 1,
              state === "archived-job" ? at : null,
            ],
          ),
        );
      if (state !== "missing-contact")
        await database.execute(
          sqlStatement(
            "INSERT INTO contact(id, name, created_at, updated_at, row_version, archived_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
              contactId,
              "Synthetic contact",
              at,
              at,
              state === "stale-contact" ? 2 : 1,
              state === "archived-contact" ? at : null,
            ],
          ),
        );
      const input = {
        id: entityId("interaction", "0199b365-0000-7000-8000-000000000014"),
        jobId,
        contactId: state === "no-contact" ? null : contactId,
        type: "email_logged",
        occurredAt: at,
        direction: "outbound" as const,
        summary: "  é中🙂 <script>inert()</script>\nExact original.  ",
        nextActionAt: null,
        createdAt: at,
        updatedAt: at,
        expected: {
          specVersion: 1 as const,
          expectedVaultId: state === "wrong-vault" ? jobId : vaultId,
          jobRowVersion: 1,
          contactRowVersion: state === "no-contact" ? null : 1,
        },
      };
      const beforeJobs = await database.query(sqlStatement("SELECT * FROM job"));
      const beforeContacts = await database.query(sqlStatement("SELECT * FROM contact"));
      const port = createDatabaseViewedInteractionPort(database);
      if (["active", "no-contact", "retry", "collision"].includes(state)) {
        const stored = await port.recordInteraction(input);
        expect(stored).toEqual({
          ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "expected")),
          rowVersion: 1,
        });
        if (state === "retry") {
          await database.execute(
            sqlStatement("UPDATE job SET row_version = 2, archived_at = ? WHERE id = ?", [
              at,
              jobId,
            ]),
          );
          await expect(port.recordInteraction(input)).resolves.toEqual(stored);
        }
        if (state === "collision")
          await expect(
            port.recordInteraction({ ...input, summary: "different" }),
          ).rejects.toMatchObject({ code: "linkage_conflict" });
        expect(await database.query(sqlStatement("SELECT summary FROM interaction"))).toEqual([
          { summary: input.summary },
        ]);
      } else {
        await expect(port.recordInteraction(input)).rejects.toBeDefined();
        expect(await database.query(sqlStatement("SELECT * FROM interaction"))).toEqual([]);
      }
      if (state !== "retry")
        expect(await database.query(sqlStatement("SELECT * FROM job"))).toEqual(beforeJobs);
      expect(await database.query(sqlStatement("SELECT * FROM contact"))).toEqual(beforeContacts);
    } finally {
      database.close();
    }
  });
  it.each(["active", "archived", "missing", "wrong-kind"] as const)(
    "records an interactive note only for its active job (%s)",
    async (state) => {
      const database = new NodeSqliteTestDatabase();
      const at = instant("2026-10-20T05:00:00.000Z");
      const jobId = entityId("job", "0199b365-0000-7000-8000-000000000001");
      const id = entityId("interaction", "0199b365-0000-7000-8000-000000000002");
      try {
        await applySqlMigrations(database, migrations, APPLIED_AT);
        if (state !== "missing")
          await createTrackerRepositories(database).jobs.create({
            id: jobId,
            companyId: null,
            title: "Synthetic note job",
            normalizedTitle: null,
            descriptionText: "",
            employmentType: null,
            workplaceType: null,
            seniority: null,
            locationId: null,
            remoteRegion: null,
            datePosted: null,
            validThrough: null,
            currentStatusId: null,
            nextActionAt: null,
            archivedAt: state === "archived" ? at : null,
            createdAt: at,
            updatedAt: at,
          });
        const before = await database.query(sqlStatement("SELECT * FROM job ORDER BY id"));
        const input = {
          id,
          jobId,
          contactId: null,
          type: state === "wrong-kind" ? "email" : "note",
          occurredAt: at,
          direction: "unknown" as const,
          summary: "  é中🙂 <script>neverExecute()</script>\nExact note.  ",
          nextActionAt: null,
          createdAt: at,
          updatedAt: at,
        };
        const write = () => createDatabaseJobNotePort(database).recordInteraction(input);
        if (state === "active") {
          await expect(write()).resolves.toMatchObject({ ...input, rowVersion: 1 });
          await expect(
            database.execute(
              sqlStatement("UPDATE interaction SET summary = ? WHERE id = ?", ["changed", id]),
            ),
          ).rejects.toThrow();
        } else
          await expect(write()).rejects.toMatchObject({
            code: state === "wrong-kind" ? "invalid_state" : "not_found",
          });
        expect(await database.query(sqlStatement("SELECT * FROM job ORDER BY id"))).toEqual(before);
        expect(await database.query(sqlStatement("SELECT summary FROM interaction"))).toEqual(
          state === "active" ? [{ summary: input.summary }] : [],
        );
      } finally {
        database.close();
      }
    },
  );
  it("inspects read-only storage without beginning a transaction or making a write", async () => {
    class ReadOnlyDatabase extends NodeSqliteTestDatabase {
      restricted = false;
      override async diagnostics(): Promise<StorageDiagnostics> {
        return Object.freeze({ ...(await super.diagnostics()), readOnly: this.restricted });
      }
      override async transaction<Result>(
        work: (session: DatabaseTransaction) => Promise<Result>,
      ): Promise<Result> {
        if (this.restricted) throw new Error("No transaction is permitted by this read-only proof");
        return super.transaction(work);
      }
      override async execute(statement: SqlStatement): Promise<ExecuteResult> {
        if (this.restricted) throw new Error("No write is permitted by this read-only proof");
        return super.execute(statement);
      }
    }
    const database = new ReadOnlyDatabase();
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      database.restricted = true;
      const port = createDatabaseVaultBootstrapPort(database);
      expect(await port.inspect()).toMatchObject({ vault: null, diagnostics: { readOnly: true } });
      const vaultId = entityId("vault", "0199a200-0000-7000-8000-000000000001");
      await expect(
        port.create({ vaultId, name: "No write", createdAt: instant(APPLIED_AT) }),
      ).rejects.toMatchObject({ code: "read_only" });
      await expect(port.open({ vaultId, openedAt: instant(APPLIED_AT) })).rejects.toMatchObject({
        code: "read_only",
      });
    } finally {
      database.close();
    }
  });

  it("inspects a nameless store read-only and preserves prior records on explicit initialization", async () => {
    const database = new NodeSqliteTestDatabase();
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      await database.execute(
        sqlStatement(
          "INSERT INTO company(id, canonical_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [
            "0199a200-0000-7000-8000-000000000003",
            "Synthetic existing company",
            APPLIED_AT,
            APPLIED_AT,
          ],
        ),
      );
      const before = await database.query(sqlStatement("SELECT * FROM company"));
      const port = createDatabaseVaultBootstrapPort(database);
      expect((await port.inspect()).vault).toBeNull();
      expect(await database.query(sqlStatement("SELECT * FROM vault"))).toEqual([]);
      const vaultId = entityId("vault", "0199a200-0000-7000-8000-000000000001");
      const created = await port.create({
        vaultId,
        name: "Explicit local name",
        createdAt: instant(APPLIED_AT),
      });
      expect(created.vault.schemaVersion).toBe(165);
      expect((await port.inspect()).vault).toEqual(created.vault);
      await expect(
        port.create({
          vaultId: entityId("vault", "0199a200-0000-7000-8000-000000000002"),
          name: "Do not replace",
          createdAt: instant(APPLIED_AT),
        }),
      ).rejects.toMatchObject({ code: "already_exists" });
      expect(await database.query(sqlStatement("SELECT * FROM company"))).toEqual(before);
      expect((await port.inspect()).vault).toEqual(created.vault);
    } finally {
      database.close();
    }
  });

  it("refreshes only old root operational metadata on open and rejects future/ambiguous roots", async () => {
    const database = new NodeSqliteTestDatabase();
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      const id = entityId("vault", "0199a200-0000-7000-8000-000000000001");
      await database.execute(
        sqlStatement("INSERT INTO vault VALUES (?, ?, 1, ?, ?)", [
          id,
          "Keep my name",
          APPLIED_AT,
          APPLIED_AT,
        ]),
      );
      const port = createDatabaseVaultBootstrapPort(database);
      expect((await port.inspect()).vault?.schemaVersion).toBe(1);
      const openedAt = instant("2026-10-19T12:00:00.000Z");
      const opened = await port.open({ vaultId: id, openedAt });
      expect(opened.vault).toMatchObject({
        id,
        name: "Keep my name",
        createdAt: APPLIED_AT,
        lastOpenedAt: openedAt,
        schemaVersion: 165,
      });
      await expect(port.open({ vaultId: id, openedAt: instant(APPLIED_AT) })).rejects.toMatchObject(
        { code: "invalid_state" },
      );
      await database.execute(
        sqlStatement("UPDATE vault SET schema_version = 166 WHERE id = ?", [id]),
      );
      const before = await database.query(sqlStatement("SELECT * FROM vault"));
      await expect(port.open({ vaultId: id, openedAt })).rejects.toMatchObject({
        code: "invalid_state",
      });
      expect(await database.query(sqlStatement("SELECT * FROM vault"))).toEqual(before);
      await database.execute(
        sqlStatement("INSERT INTO vault VALUES (?, ?, 160, ?, ?)", [
          "0199a200-0000-7000-8000-000000000002",
          "Ambiguous",
          APPLIED_AT,
          APPLIED_AT,
        ]),
      );
      const ambiguous = await database.query(sqlStatement("SELECT * FROM vault ORDER BY id"));
      await expect(port.inspect()).rejects.toMatchObject({ code: "invalid_state" });
      await expect(port.open({ vaultId: id, openedAt })).rejects.toMatchObject({
        code: "invalid_state",
      });
      expect(await database.query(sqlStatement("SELECT * FROM vault ORDER BY id"))).toEqual(
        ambiguous,
      );
    } finally {
      database.close();
    }
  });

  it("rolls initialization back if the transaction fails after inserting its identity", async () => {
    class FailingDatabase extends NodeSqliteTestDatabase {
      fail = false;
      override transaction<Result>(
        work: (session: DatabaseTransaction) => Promise<Result>,
      ): Promise<Result> {
        return super.transaction(async (session) => {
          const result = await work(session);
          if (this.fail) throw new Error("synthetic transaction failure");
          return result;
        });
      }
    }
    const database = new FailingDatabase();
    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);
      database.fail = true;
      const port = createDatabaseVaultBootstrapPort(database);
      await expect(
        port.create({
          vaultId: entityId("vault", "0199a200-0000-7000-8000-000000000001"),
          name: "Not committed",
          createdAt: instant(APPLIED_AT),
        }),
      ).rejects.toThrow("synthetic transaction failure");
      expect(await database.query(sqlStatement("SELECT * FROM vault"))).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("persists the adapter-neutral vault, pipeline, and activity operations", async () => {
    const database = new NodeSqliteTestDatabase();
    const ids = {
      vault: entityId("vault", "0199a200-0000-7000-8000-000000000001"),
      job: entityId("job", "0199a200-0000-7000-8000-000000000002"),
      saved: entityId("status_definition", "0199a200-0000-7000-8000-000000000003"),
      applied: entityId("status_definition", "0199a200-0000-7000-8000-000000000004"),
      statusEvent: entityId("status-event", "0199a200-0000-7000-8000-000000000005"),
      statusUndo: entityId("mutation-undo-token", "0199a200-0000-7000-8000-000000000006"),
      application: entityId("application", "0199a200-0000-7000-8000-000000000007"),
      interaction: entityId("interaction", "0199a200-0000-7000-8000-000000000008"),
      nextAction: entityId("next-action", "0199a200-0000-7000-8000-000000000009"),
      nextActionUndo: entityId("mutation-undo-token", "0199a200-0000-7000-8000-00000000000a"),
      interview: entityId("interview", "0199a200-0000-7000-8000-00000000000b"),
      reminder: entityId("reminder", "0199a200-0000-7000-8000-00000000000c"),
    } as const;
    const createdAt = instant("2026-08-30T13:00:00.000Z");
    const changedAt = instant("2026-08-30T13:01:00.000Z");
    const openedAt = instant("2026-08-30T13:02:00.000Z");
    const dueAt = instant("2026-09-02T13:00:00.000Z");
    const reminderAt = instant("2026-09-02T12:00:00.000Z");
    const zone = timeZone("America/New_York");

    try {
      await applySqlMigrations(database, migrations, APPLIED_AT);

      const lifecycle = createDatabaseVaultLifecyclePort(database);
      const createdVault = await lifecycle.create({
        vaultId: ids.vault,
        name: "Composition proof",
        createdAt,
      });
      const openedVault = await lifecycle.open({ vaultId: ids.vault, openedAt });
      expect(createdVault.vault.name).toBe("Composition proof");
      expect(openedVault.vault.lastOpenedAt).toBe(openedAt);
      await expect(lifecycle.diagnostics()).resolves.toMatchObject({
        health: "ready",
        persistence: "memory",
        issueCodes: ["persistence-memory-only"],
      });

      const pipelineRepositories = createPipelineRepositories(database);
      await pipelineRepositories.statusDefinitions.create({
        id: ids.saved,
        name: "Saved",
        category: "saved",
        color: "blue",
        isSystem: true,
        sortOrder: 10,
        terminal: false,
        archivedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
      await pipelineRepositories.statusDefinitions.create({
        id: ids.applied,
        name: "Applied",
        category: "applied",
        color: "indigo",
        isSystem: true,
        sortOrder: 20,
        terminal: false,
        archivedAt: null,
        createdAt,
        updatedAt: createdAt,
      });

      const pipeline = createDatabaseJobPipelinePort(database);
      const job = await pipeline.createManualJob({
        id: ids.job,
        companyId: null,
        title: "Research operations lead",
        normalizedTitle: null,
        descriptionText: "Local composition proof.",
        employmentType: "full_time",
        workplaceType: "remote",
        seniority: null,
        locationId: null,
        remoteRegion: null,
        datePosted: null,
        validThrough: null,
        currentStatusId: null,
        nextActionAt: null,
        archivedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
      const changed = await pipeline.changeStatus({
        eventId: ids.statusEvent,
        undoTokenId: ids.statusUndo,
        jobId: ids.job,
        applicationId: null,
        toStatusId: ids.saved,
        occurredAt: changedAt,
        note: "Saved locally.",
        allowReopen: false,
      });
      expect(job.title).toBe("Research operations lead");
      expect(changed.statusEvent.toStatusId).toBe(ids.saved);

      await pipelineRepositories.applications.create({
        id: ids.application,
        jobId: ids.job,
        appliedAt: changedAt,
        channel: "manual",
        currentStatusId: ids.saved,
        selectedResumeVersionId: null,
        selectedCoverLetterVersionId: null,
        notes: "User-controlled submission.",
        archivedAt: null,
        createdAt: changedAt,
        updatedAt: changedAt,
      });

      const activity = createDatabaseJobActivityPort(database);
      const interaction = await activity.recordInteraction({
        id: ids.interaction,
        jobId: ids.job,
        contactId: null,
        type: "note",
        occurredAt: changedAt,
        direction: "outbound",
        summary: "Prepared locally; no outreach sent.",
        nextActionAt: null,
        createdAt: changedAt,
        updatedAt: changedAt,
      });
      const nextAction = await activity.setNextAction({
        id: ids.nextAction,
        undoTokenId: ids.nextActionUndo,
        jobId: ids.job,
        applicationId: ids.application,
        interactionId: ids.interaction,
        title: "Send interview follow-up",
        dueAt,
        timeZone: zone,
        state: "pending",
        completedAt: null,
        createdAt: changedAt,
        updatedAt: changedAt,
      });
      const interview = await activity.scheduleInterview({
        id: ids.interview,
        applicationId: ids.application,
        stageName: "Hiring manager interview",
        startsAt: dueAt,
        timeZone: zone,
        durationMinutes: 45,
        locationOrUrl: "Stored locally",
        contactIds: [],
        preparationNotes: "Review evidence.",
        outcome: null,
        createdAt: changedAt,
        updatedAt: changedAt,
      });
      const reminder = await activity.scheduleReminder({
        id: ids.reminder,
        jobId: ids.job,
        nextActionId: ids.nextAction,
        interviewId: ids.interview,
        remindAt: reminderAt,
        timeZone: zone,
        state: "pending",
        note: "Prepare only; do not send.",
        firedAt: null,
        createdAt: changedAt,
        updatedAt: changedAt,
      });

      expect(interaction.id).toBe(ids.interaction);
      expect(nextAction.nextAction.id).toBe(ids.nextAction);
      expect(interview.id).toBe(ids.interview);
      expect(reminder.id).toBe(ids.reminder);
      const undo = createMutationUndoOperations({ undo: createDatabaseMutationUndoPort(database) });
      const undoContext = {
        operationId: entityId("application-operation", "0199a200-0000-7000-8000-0000000000ff"),
        initiatedAt: openedAt,
      };
      await expect(
        undo.consumeUndoTokenCommand.execute({ tokenId: ids.nextActionUndo }, undoContext),
      ).resolves.toMatchObject({
        ok: true,
        value: { id: ids.nextActionUndo, consumedAt: openedAt, rowVersion: 2 },
      });
      await expect(
        undo.consumeUndoTokenCommand.execute({ tokenId: ids.nextActionUndo }, undoContext),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "conflict", retryable: false, message: "That edit was already undone." },
      });
      await expect(
        undo.consumeUndoTokenCommand.execute({ tokenId: ids.statusUndo }, undoContext),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          code: "conflict",
          retryable: false,
          message: "The edited item changed again, so this undo is no longer safe.",
        },
      });
      await expect(
        undo.consumeUndoTokenCommand.execute(
          { tokenId: "0199a200-0000-7000-8000-0000000000fe" },
          undoContext,
        ),
      ).resolves.toMatchObject({ ok: false, error: { code: "not_found" } });
    } finally {
      database.close();
    }
  });
});
