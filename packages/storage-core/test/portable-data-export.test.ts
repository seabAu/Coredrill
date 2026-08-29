import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  PORTABLE_DATA_EXPORT_DATASETS,
  PORTABLE_DATA_EXPORT_EXCLUDED_TABLES,
  PortableDataExportWriterError,
  createPortableDataExportV1,
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
const HASH = "a".repeat(64);

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
  ]);

class FixtureDatabase implements DatabasePort {
  public readonly statements: string[] = [];
  public transactions = 0;
  public schemaVersion: number | bigint = 92;
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
  it("writes every reviewed Phase 1 user dataset as paired deterministic JSON and CSV", async () => {
    const database = new FixtureDatabase();
    const bundle = await createPortableDataExportV1({
      database,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
    });

    expect(bundle).toMatchObject({
      specVersion: 1,
      sourceSchemaVersion: 92,
      generatedAt: GENERATED_AT,
      vaultId: VAULT_ID,
      datasetCount: PORTABLE_DATA_EXPORT_DATASETS.length,
      rowCount: 6,
    });
    expect(bundle.datasetCount).toBe(29);
    expect(bundle.dataFiles).toHaveLength(58);
    const excludedTables = new Set<string>(PORTABLE_DATA_EXPORT_EXCLUDED_TABLES);
    expect(PORTABLE_DATA_EXPORT_DATASETS.filter((item) => excludedTables.has(item.table))).toEqual(
      [],
    );
    expect(PORTABLE_DATA_EXPORT_EXCLUDED_TABLES).toEqual([
      "coredrill_schema_migration",
      "device",
      "diagnostic_event",
      "job_fts",
      "job_search_identity",
      "job_search_state",
      "mutation_undo_token",
    ]);
    expect(database.transactions).toBe(1);
    expect(database.statements).toHaveLength(30);
    expect(bundle.datasets.find((item) => item.dataset === "job_source")?.rows[0]).toMatchObject({
      is_primary: true,
    });
    expect(bundle.datasets.find((item) => item.dataset === "field_value")?.rows[0]).toMatchObject({
      is_user_confirmed: false,
      normalized_json: "Platform Engineer",
      raw_json: "=Platform Engineer",
    });

    expect(textFile(bundle, "data/job.json")).toBe(await fixtureText("job.json"));
    expect(textFile(bundle, "data/job.csv")).toBe(await csvFixtureText("job.csv"));
    expect(textFile(bundle, "data/field_value.json")).toBe(await fixtureText("field_value.json"));
    expect(textFile(bundle, "data/field_value.csv")).toBe(await csvFixtureText("field_value.csv"));
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
        schemaVersion: 92,
        migrationHistory: [
          {
            version: 92,
            name: "portable-data",
            appliedAt: GENERATED_AT,
            sha256,
          },
        ],
      },
      database: { schemaVersion: 92, byteLength: bytes.byteLength, sha256, bytes },
      dataFiles: bundle.dataFiles,
      attachments: [],
      readAttachment: () => Promise.resolve(undefined),
    });

    expect(archive.manifest.dataFiles).toHaveLength(58);
    expect(archive.manifest.dataFiles.map((entry) => entry.path)).toEqual(
      [...bundle.dataFiles].map((file) => file.path).sort(),
    );
  });

  it("fails closed on unsupported schema, vault drift, and adapter failures", async () => {
    const unsupported = new FixtureDatabase();
    unsupported.schemaVersion = 93;
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
