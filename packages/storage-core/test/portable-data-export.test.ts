import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PORTABLE_DATA_EXPORT_DATASETS,
  PORTABLE_DATA_EXPORT_EXCLUDED_TABLES,
  PortableDataExportWriterError,
  applySqlMigrations,
  createPortableDataExportV1,
  defineSqlMigrations,
  sqlStatement,
  writePortableArchiveV1,
  type DatabasePort,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlStatement,
  type StorageDiagnostics,
} from "../src/index.js";

const GENERATED_AT = "2026-08-29T22:30:00.000Z";
const VAULT_ID = "0198e102-0000-7000-8000-000000000001";
const JOB_ID = "0198e102-0000-7000-8000-000000000002";
const SOURCE_ID = "0198e102-0000-7000-8000-000000000003";
const SNAPSHOT_ID = "0198e102-0000-7000-8000-000000000004";
const PROVENANCE_ID = "0198e102-0000-7000-8000-000000000005";
const FIELD_VALUE_ID = "0198e102-0000-7000-8000-000000000006";
const REQUIREMENT_ID = "0198e102-0000-7000-8000-000000000007";
const DOCUMENT_ID = "0198e102-0000-7000-8000-000000000008";
const APPLICATION_ID = "0198e102-0000-7000-8000-000000000009";
const SUBMITTED_SNAPSHOT_ID = "0198e102-0000-7000-8000-00000000000a";
const SUBMITTED_ITEM_ID = "0198e102-0000-7000-8000-00000000000b";
const DOCUMENT_VERSION_ID = "0198e102-0000-7000-8000-00000000000c";
const HASH = "a".repeat(64);
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

const fixtureRows = (): Map<string, readonly QueryRow[]> =>
  new Map([
    [
      "vault",
      [
        {
          id: VAULT_ID,
          name: "Coredrill portable fixture",
          schema_version: 1,
          created_at: "2026-08-01T12:00:00.000Z",
          last_opened_at: GENERATED_AT,
        },
      ],
    ],
    [
      "job",
      [
        {
          id: JOB_ID,
          company_id: null,
          title: '=Platform, "Engineer"\nRemote',
          normalized_title: "platform engineer",
          description_text: "Résumé systems,\nwith care",
          employment_type: "full_time",
          workplace_type: "remote",
          seniority: null,
          location_id: null,
          remote_region_json: '{"remote":true,"regions":["Québec","New York"]}',
          date_posted: "2026-08-20",
          valid_through: null,
          current_status_id: null,
          next_action_at: null,
          archived_at: null,
          created_at: "2026-08-20T10:00:00.000Z",
          updated_at: "2026-08-21T10:00:00.000Z",
          row_version: 3,
        },
      ],
    ],
    [
      "job_source",
      [
        {
          id: SOURCE_ID,
          job_id: JOB_ID,
          connector_id: "manual",
          external_id: null,
          canonical_url: "https://example.test/jobs/1",
          apply_url: null,
          first_seen_at: "2026-08-20T10:00:00.000Z",
          last_seen_at: "2026-08-20T10:00:00.000Z",
          content_hash: HASH,
          is_primary: 1,
          created_at: "2026-08-20T10:00:00.000Z",
          updated_at: "2026-08-20T10:00:00.000Z",
          row_version: 1,
        },
      ],
    ],
    [
      "source_snapshot",
      [
        {
          id: SNAPSHOT_ID,
          job_source_id: SOURCE_ID,
          captured_at: "2026-08-20T10:00:00.000Z",
          extractor_id: "manual-entry",
          extractor_version: "1.0.0",
          raw_text: "Original résumé role text",
          sanitized_html: null,
          structured_json: '{"title":"Platform Engineer","salary":null}',
          content_hash: HASH,
          retention_class: "user_owned",
          created_at: "2026-08-20T10:00:00.000Z",
          row_version: 1,
        },
      ],
    ],
    [
      "provenance",
      [
        {
          id: PROVENANCE_ID,
          source_snapshot_id: SNAPSHOT_ID,
          extraction_method: "user",
          source_pointer: "manual:title",
          source_excerpt: "Platform Engineer",
          confidence: 1,
          captured_at: "2026-08-20T10:00:00.000Z",
          license_note: null,
          created_at: "2026-08-20T10:00:00.000Z",
          row_version: 1,
        },
      ],
    ],
    [
      "field_value",
      [
        {
          id: FIELD_VALUE_ID,
          entity_type: "job",
          entity_id: JOB_ID,
          field_name: "title",
          normalized_json: '"Platform Engineer"',
          raw_json: '"=Platform Engineer"',
          provenance_id: PROVENANCE_ID,
          is_user_confirmed: 0,
          user_confirmation_id: null,
          confirmed_at: null,
          confirmed_value_hash: null,
          superseded_by_id: null,
          created_at: "2026-08-20T10:00:00.000Z",
          updated_at: "2026-08-20T10:00:00.000Z",
          row_version: 1,
        },
      ],
    ],
    [
      "job_requirement_coverage_decision",
      [
        {
          requirement_id: REQUIREMENT_ID,
          coverage_state: "gap",
          requirement_row_version: 1,
          selection_basis: "",
          decided_at: GENERATED_AT,
          updated_at: GENERATED_AT,
          row_version: 1,
        },
      ],
    ],
    [
      "document_lineage",
      [
        {
          document_id: DOCUMENT_ID,
          role: "base",
          base_document_id: null,
          template_document_id: null,
          job_id: null,
          created_at: GENERATED_AT,
        },
      ],
    ],
    [
      "application_answer_selection",
      [
        {
          application_id: APPLICATION_ID,
          document_version_id: DOCUMENT_VERSION_ID,
          sort_order: 0,
          created_at: GENERATED_AT,
        },
      ],
    ],
    [
      "submitted_snapshot",
      [
        {
          id: SUBMITTED_SNAPSHOT_ID,
          application_id: APPLICATION_ID,
          submitted_at: GENERATED_AT,
          channel: "company_portal",
          created_at: GENERATED_AT,
        },
      ],
    ],
    [
      "submitted_snapshot_item",
      [
        {
          id: SUBMITTED_ITEM_ID,
          submitted_snapshot_id: SUBMITTED_SNAPSHOT_ID,
          role: "resume",
          document_version_id: DOCUMENT_VERSION_ID,
          submission_format: "file",
          content_id: HASH,
          attachment_purpose: "export.pdf",
          sort_order: 0,
          created_at: GENERATED_AT,
        },
      ],
    ],
  ]);

class FixtureDatabase implements DatabasePort {
  public readonly statements: string[] = [];
  public transactions = 0;
  public schemaVersion: number | bigint = 154;
  public failQuery = false;

  public constructor(public readonly rows = fixtureRows()) {}

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    this.statements.push(statement.sql);
    if (this.failQuery) throw new Error("fixture query failed");
    if (statement.sql === "PRAGMA user_version") {
      return [{ user_version: this.schemaVersion } as QueryRow] as unknown as readonly Row[];
    }
    const table = /FROM "([a-z_]+)"/u.exec(statement.sql)?.[1];
    if (table === undefined) throw new Error("Unexpected fixture SQL.");
    return (this.rows.get(table) ?? []) as unknown as readonly Row[];
  }

  public execute(_statement: SqlStatement): Promise<ExecuteResult> {
    return Promise.resolve({ rowsAffected: 0 });
  }

  public async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    this.transactions += 1;
    return work(this);
  }

  public exportPortable(): Promise<PortableDatabase> {
    return Promise.reject(new Error("Not used by this fixture."));
  }

  public diagnostics(): Promise<StorageDiagnostics> {
    return Promise.resolve({
      adapterName: "fixture",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: Number(this.schemaVersion),
      details: [],
    });
  }
}

class SchemaInventoryDatabase implements DatabasePort {
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
      const result = await work(this);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public exportPortable(): Promise<PortableDatabase> {
    return Promise.reject(new Error("Not used by this schema inventory test."));
  }

  public diagnostics(): Promise<StorageDiagnostics> {
    return Promise.resolve({
      adapterName: "schema-inventory",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 154,
      details: [],
    });
  }

  public close(): void {
    this.database.close();
  }
}

const textFile = (
  bundle: Awaited<ReturnType<typeof createPortableDataExportV1>>,
  path: string,
): string => {
  const file = bundle.dataFiles.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`Missing fixture file ${path}.`);
  return new TextDecoder().decode(file.bytes);
};

const fixtureText = (name: string): Promise<string> =>
  readFile(new URL(`./fixtures/portable-data-v1/${name}`, import.meta.url), "utf8");

const csvFixtureText = async (name: string): Promise<string> => {
  const text = await fixtureText(name);
  return text.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
};

const expectCode = async (
  promise: Promise<unknown>,
  code: PortableDataExportWriterError["code"],
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    name: "PortableDataExportWriterError",
    code,
  });
};

describe("portable human-readable data export", () => {
  it("accounts for every durable table as exported user data or a reviewed runtime exclusion", async () => {
    const database = new SchemaInventoryDatabase();
    try {
      await applySqlMigrations(database, migrations, GENERATED_AT);
      const tables = await database.query<{ readonly name: string } & QueryRow>(
        sqlStatement(
          `SELECT name FROM sqlite_schema
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
        ),
      );
      const accountedFor = new Set([
        ...PORTABLE_DATA_EXPORT_DATASETS.map((item) => item.table),
        ...PORTABLE_DATA_EXPORT_EXCLUDED_TABLES,
      ]);
      expect(tables.map((row) => row.name).filter((name) => !accountedFor.has(name))).toEqual([]);
      expect(
        PORTABLE_DATA_EXPORT_DATASETS.map((item) => item.table).filter(
          (name) => !tables.some((row) => row.name === name),
        ),
      ).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("writes every reviewed user dataset available at schema 154 as paired deterministic JSON and CSV", async () => {
    const database = new FixtureDatabase();
    const bundle = await createPortableDataExportV1({
      database,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });

    expect(bundle).toMatchObject({
      specVersion: 1,
      sourceSchemaVersion: 154,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
      datasetCount: PORTABLE_DATA_EXPORT_DATASETS.length,
      rowCount: 11,
    });
    expect(bundle.datasetCount).toBe(56);
    expect(bundle.dataFiles).toHaveLength(112);
    const excludedTables = new Set<string>(PORTABLE_DATA_EXPORT_EXCLUDED_TABLES);
    expect(PORTABLE_DATA_EXPORT_DATASETS.filter((item) => excludedTables.has(item.table))).toEqual(
      [],
    );
    expect(PORTABLE_DATA_EXPORT_EXCLUDED_TABLES).toEqual([
      "capture_review_discard_undo_token",
      "coredrill_schema_migration",
      "device",
      "diagnostic_event",
      "job_fts",
      "job_search_identity",
      "job_search_state",
      "mutation_undo_token",
    ]);
    expect(database.transactions).toBe(1);
    expect(database.statements).toHaveLength(57);
    expect(bundle.datasets.find((item) => item.dataset === "job_source")?.rows[0]).toMatchObject({
      is_primary: true,
    });
    expect(bundle.datasets.find((item) => item.dataset === "field_value")?.rows[0]).toMatchObject({
      is_user_confirmed: false,
      normalized_json: "Platform Engineer",
      raw_json: "=Platform Engineer",
    });
    expect(
      bundle.datasets.find((item) => item.dataset === "job_requirement_coverage_decision")?.rows[0],
    ).toMatchObject({ coverage_state: "gap", requirement_id: REQUIREMENT_ID, row_version: 1 });
    expect(bundle.datasets.find((item) => item.dataset === "document_lineage")?.rows[0]).toEqual(
      expect.objectContaining({ document_id: DOCUMENT_ID, role: "base" }),
    );
    expect(
      bundle.datasets.find((item) => item.dataset === "application_answer_selection")?.rows[0],
    ).toEqual(
      expect.objectContaining({
        application_id: APPLICATION_ID,
        document_version_id: DOCUMENT_VERSION_ID,
      }),
    );
    expect(
      bundle.datasets.find((item) => item.dataset === "submitted_snapshot_item")?.rows[0],
    ).toEqual(
      expect.objectContaining({
        content_id: HASH,
        document_version_id: DOCUMENT_VERSION_ID,
        submission_format: "file",
      }),
    );
    expect(bundle.datasets.find((item) => item.dataset === "document_editor_draft")).toBeDefined();

    expect(textFile(bundle, "data/job.json")).toBe(await fixtureText("job.json"));
    expect(textFile(bundle, "data/job.csv")).toBe(await csvFixtureText("job.csv"));
    expect(textFile(bundle, "data/field_value.json")).toBe(await fixtureText("field_value.json"));
    expect(textFile(bundle, "data/field_value.csv")).toBe(await csvFixtureText("field_value.csv"));
  });

  it("gates later evidence datasets when exporting supported historical schemas", async () => {
    const phase1 = new FixtureDatabase();
    phase1.schemaVersion = 101;
    const phase1Bundle = await createPortableDataExportV1({
      database: phase1,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(phase1Bundle.datasetCount).toBe(30);
    expect(phase1Bundle.dataFiles).toHaveLength(60);

    const careerProfile = new FixtureDatabase();
    careerProfile.schemaVersion = 111;
    const careerProfileBundle = await createPortableDataExportV1({
      database: careerProfile,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(careerProfileBundle.datasetCount).toBe(40);
    expect(careerProfileBundle.datasets.map((item) => item.dataset)).toContain("candidate_profile");
    expect(careerProfileBundle.datasets.map((item) => item.dataset)).not.toContain("import_run");
    expect(
      careerProfileBundle.datasets.find((item) => item.dataset === "anecdote")?.columns,
    ).not.toContain("privacy_tags_json");
    expect(
      careerProfileBundle.datasets.find((item) => item.dataset === "skill")?.columns,
    ).not.toContain("source_document_id");

    const privacyTags = new FixtureDatabase();
    privacyTags.schemaVersion = 112;
    const privacyTagsBundle = await createPortableDataExportV1({
      database: privacyTags,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(
      privacyTagsBundle.datasets.find((item) => item.dataset === "anecdote")?.columns,
    ).toContain("privacy_tags_json");

    const importQueue = new FixtureDatabase();
    importQueue.schemaVersion = 115;
    const importQueueBundle = await createPortableDataExportV1({
      database: importQueue,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(importQueueBundle.datasetCount).toBe(42);
    expect(importQueueBundle.datasets.map((item) => item.dataset)).toContain(
      "career_import_proposal",
    );
    expect(importQueueBundle.datasets.map((item) => item.dataset)).not.toContain(
      "career_import_resolution",
    );
    expect(
      importQueueBundle.datasets.find((item) => item.dataset === "skill")?.columns,
    ).not.toContain("verification_state");

    const evidenceComplete = new FixtureDatabase();
    evidenceComplete.schemaVersion = 126;
    const evidenceCompleteBundle = await createPortableDataExportV1({
      database: evidenceComplete,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(evidenceCompleteBundle.datasetCount).toBe(47);
    expect(evidenceCompleteBundle.datasets.map((item) => item.dataset)).not.toContain(
      "job_requirement",
    );

    const requirementsOnly = new FixtureDatabase();
    requirementsOnly.schemaVersion = 129;
    const requirementsOnlyBundle = await createPortableDataExportV1({
      database: requirementsOnly,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(requirementsOnlyBundle.datasetCount).toBe(48);
    expect(requirementsOnlyBundle.datasets.map((item) => item.dataset)).toContain(
      "job_requirement",
    );
    expect(requirementsOnlyBundle.datasets.map((item) => item.dataset)).not.toContain(
      "skill_evidence",
    );

    const evidenceSelections = new FixtureDatabase();
    evidenceSelections.schemaVersion = 132;
    const evidenceSelectionsBundle = await createPortableDataExportV1({
      database: evidenceSelections,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(evidenceSelectionsBundle.datasetCount).toBe(50);
    expect(evidenceSelectionsBundle.datasets.map((item) => item.dataset)).toContain(
      "job_requirement_evidence_selection",
    );
    expect(evidenceSelectionsBundle.datasets.map((item) => item.dataset)).not.toContain(
      "job_requirement_coverage_decision",
    );

    const coverageDecisions = new FixtureDatabase();
    coverageDecisions.schemaVersion = 133;
    const coverageDecisionsBundle = await createPortableDataExportV1({
      database: coverageDecisions,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(coverageDecisionsBundle.datasetCount).toBe(51);

    const submittedSnapshots = new FixtureDatabase();
    submittedSnapshots.schemaVersion = 145;
    const submittedSnapshotsBundle = await createPortableDataExportV1({
      database: submittedSnapshots,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(submittedSnapshotsBundle.datasetCount).toBe(54);
    expect(submittedSnapshotsBundle.datasets.map((item) => item.dataset)).not.toContain(
      "document_editor_draft",
    );
    expect(coverageDecisionsBundle.datasets.map((item) => item.dataset)).toContain(
      "job_requirement_coverage_decision",
    );
    expect(coverageDecisionsBundle.datasets.map((item) => item.dataset)).not.toContain(
      "document_lineage",
    );

    const current = new FixtureDatabase();
    const currentBundle = await createPortableDataExportV1({
      database: current,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    expect(currentBundle.datasets.find((item) => item.dataset === "skill")?.columns).toEqual(
      expect.arrayContaining(["source_document_id", "verification_state"]),
    );
    expect(currentBundle.datasets.map((item) => item.dataset)).toContain("job_requirement");
    expect(currentBundle.datasets.map((item) => item.dataset)).toEqual(
      expect.arrayContaining([
        "skill_evidence",
        "job_requirement_evidence_selection",
        "job_requirement_coverage_decision",
        "document_lineage",
        "submitted_snapshot",
        "submitted_snapshot_item",
        "document_editor_draft",
        "application_answer_selection",
      ]),
    );
  });

  it("feeds the complete production projection into the portable archive writer", async () => {
    const bundle = await createPortableDataExportV1({
      database: new FixtureDatabase(),
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });
    const bytes = new TextEncoder().encode("SQLite format 3\u0000portable data integration\n");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const archive = await writePortableArchiveV1({
      archiveId: "0198e102-0000-7000-8000-000000000007",
      createdAt: GENERATED_AT,
      createdByVersion: "0.0.0",
      vault: {
        id: VAULT_ID,
        schemaVersion: 101,
        migrationHistory: [
          {
            version: 101,
            name: "portable-data",
            appliedAt: GENERATED_AT,
            sha256,
          },
        ],
      },
      database: { schemaVersion: 101, byteLength: bytes.byteLength, sha256, bytes },
      dataFiles: bundle.dataFiles,
      attachments: [],
      readAttachment: () => Promise.resolve(undefined),
    });

    expect(archive.manifest.dataFiles).toHaveLength(112);
    expect(archive.manifest.dataFiles.map((entry) => entry.path)).toEqual(
      [...bundle.dataFiles].map((file) => file.path).sort(),
    );
  });

  it("fails closed on unsupported schema, vault drift, and adapter failures", async () => {
    const unsupported = new FixtureDatabase();
    unsupported.schemaVersion = 102;
    await expectCode(
      createPortableDataExportV1({
        database: unsupported,
        generatedAt: GENERATED_AT,
        vaultId: VAULT_ID,
      }),
      "schema_mismatch",
    );

    await expectCode(
      createPortableDataExportV1({
        database: new FixtureDatabase(),
        generatedAt: GENERATED_AT,
        vaultId: "0198e102-0000-7000-8000-000000000099",
      }),
      "schema_mismatch",
    );

    const failed = new FixtureDatabase();
    failed.failQuery = true;
    await expectCode(
      createPortableDataExportV1({
        database: failed,
        generatedAt: GENERATED_AT,
        vaultId: VAULT_ID,
      }),
      "query_failed",
    );
  });

  it("rejects invalid JSON, boolean, binary, and oversized cell values", async () => {
    const invalidJson = new FixtureDatabase();
    const job = invalidJson.rows.get("job")?.[0];
    if (job === undefined) throw new Error("Expected job fixture.");
    invalidJson.rows.set("job", [{ ...job, remote_region_json: "{" }]);
    await expectCode(
      createPortableDataExportV1({
        database: invalidJson,
        generatedAt: GENERATED_AT,
        vaultId: VAULT_ID,
      }),
      "invalid_database_value",
    );

    const invalidBoolean = new FixtureDatabase();
    const source = invalidBoolean.rows.get("job_source")?.[0];
    if (source === undefined) throw new Error("Expected source fixture.");
    invalidBoolean.rows.set("job_source", [{ ...source, is_primary: 2 }]);
    await expectCode(
      createPortableDataExportV1({
        database: invalidBoolean,
        generatedAt: GENERATED_AT,
        vaultId: VAULT_ID,
      }),
      "invalid_database_value",
    );

    const binary = new FixtureDatabase();
    binary.rows.set("job_source", [{ ...source, external_id: new Uint8Array([1]) }]);
    await expectCode(
      createPortableDataExportV1({
        database: binary,
        generatedAt: GENERATED_AT,
        vaultId: VAULT_ID,
      }),
      "invalid_database_value",
    );

    const oversized = new FixtureDatabase();
    oversized.rows.set("job_source", [
      { ...source, external_id: "x".repeat(16 * 1024 * 1024 + 1) },
    ]);
    await expectCode(
      createPortableDataExportV1({
        database: oversized,
        generatedAt: GENERATED_AT,
        vaultId: VAULT_ID,
      }),
      "payload_too_large",
    );
  });

  it("rejects invalid caller metadata before opening a transaction", async () => {
    const database = new FixtureDatabase();
    await expectCode(
      createPortableDataExportV1({
        database,
        generatedAt: "not-an-instant",
        vaultId: VAULT_ID,
      }),
      "invalid_input",
    );
    expect(database.transactions).toBe(0);
  });
});
