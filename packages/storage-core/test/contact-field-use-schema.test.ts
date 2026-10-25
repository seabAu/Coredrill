import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assessContactFieldUseV1 } from "@coredrill/application";
import { applySqlMigrations, type SqlMigration } from "../src/migrations.js";
import { createPortableDataExportV1 } from "../src/portable-data-export.js";
import type {
  DatabasePort,
  DatabaseTransaction,
  QueryRow,
  SqlStatement,
} from "../src/database-port.js";

const root = path.resolve(import.meta.dirname, "../../..");
const id = (n: number) => `0198e119-0000-7000-8000-${String(n).padStart(12, "0")}`;
const captured = "2026-10-20T12:00:00.000Z";
const policyAt = "2026-10-21T12:00:00.000Z";
const at = "2026-10-24T12:00:00.000Z";
const later = "2026-10-25T12:00:00.000Z";
const due = "2026-11-01T12:00:00.000Z";
const expires = "2026-11-10T12:00:00.000Z";
const email = "person@synthetic.example";
const permission = "Synthetic employer publishes this contact for manual job-search enquiries.";
const body = `\uFEFFSynthetic employer\n${email}\n${permission}\0尾🧭`;
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const span = (value: string) => {
  const start = Buffer.from(body).indexOf(Buffer.from(value));
  return [start, start + Buffer.byteLength(value)] as const;
};
const migrations = (): readonly SqlMigration[] =>
  readdirSync(path.join(root, "migrations"))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file))
    .sort()
    .map((file) => {
      const sql = readFileSync(path.join(root, "migrations", file), "utf8");
      return {
        version: Number(file.slice(0, 4)),
        name: file.slice(5, -4).replaceAll("_", "-"),
        sha256: sha(sql),
        sql,
      };
    });

class SchemaDatabase implements DatabasePort {
  readonly connection = new DatabaseSync(":memory:");
  failAfterVersion: number | null = null;
  consumeTextBom = false;
  constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  }
  async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    const rows = this.connection.prepare(statement.sql).all(...statement.parameters);
    return (
      this.consumeTextBom
        ? rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                key,
                typeof value === "string" && value.startsWith("\uFEFF") ? value.slice(1) : value,
              ]),
            ),
          )
        : rows
    ) as Row[];
  }
  async execute(statement: SqlStatement) {
    const result = this.connection.prepare(statement.sql).run(...statement.parameters);
    if (
      statement.sql.startsWith("INSERT INTO coredrill_schema_migration") &&
      statement.parameters[0] === this.failAfterVersion
    )
      throw new Error("Synthetic failure after actual migration publication.");
    return { rowsAffected: Number(result.changes) };
  }
  async transaction<T>(work: (session: DatabaseTransaction) => Promise<T>) {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const result = await work(this);
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
  async exportPortable(): Promise<never> {
    throw new Error("Archive proof is separate.");
  }
  async diagnostics() {
    return {
      adapterName: "synthetic-contact-use",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: Number(this.connection.prepare("PRAGMA user_version").get()?.["user_version"]),
      details: [],
    };
  }
}

describe("durable independent contact field-use schema", () => {
  let db: SchemaDatabase;
  const rows = (table: string) =>
    db.connection
      .prepare(`SELECT * FROM ${table} ORDER BY 1`)
      .all()
      .map((row) => ({ ...row }));
  const insert = (
    table: string,
    value: Record<string, string | number | null>,
    replace = false,
  ) => {
    const keys = Object.keys(value);
    db.connection
      .prepare(
        `INSERT ${replace ? "OR REPLACE " : ""}INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
      )
      .run(...Object.values(value));
  };
  const source = () => ({
    id: id(3),
    vault_id: id(1),
    operation_id: id(30),
    acquisition: "user_supplied",
    source_class: "official_employer_page",
    source_url: "https://synthetic.example/team",
    captured_at: captured,
    raw_text: body,
    content_hash: sha(body),
    created_at: captured,
    row_version: 1,
  });
  const policy = () => ({
    id: id(5),
    vault_id: id(1),
    operation_id: id(31),
    revision: 1,
    status: "enabled",
    source_snapshot_id: id(3),
    source_snapshot_hash: sha(body),
    source_url: "https://synthetic.example/team",
    source_class: "official_employer_page",
    field_name: "email",
    rights_basis: "public",
    purpose: "job_search",
    usage: "display_and_manual_use",
    terms_snapshot_id: id(3),
    terms_snapshot_hash: sha(body),
    terms_start_byte: span(permission)[0],
    terms_end_byte: span(permission)[1],
    terms_excerpt: permission,
    permission_kind: "explicit_public_job_search_contact",
    acknowledgement: "I reviewed this source's permitted field use.",
    reviewed_at: policyAt,
    review_due_at: due,
    disabled_at: null,
    row_version: 1,
  });
  const review = () => ({
    id: id(4),
    vault_id: id(1),
    contact_id: id(2),
    operation_id: id(32),
    field_name: "email",
    field_revision: 1,
    contact_row_version: 1,
    value_hash: sha(email),
    source_snapshot_id: id(3),
    source_snapshot_hash: sha(body),
    source_start_byte: span(email)[0],
    source_end_byte: span(email)[1],
    source_excerpt: email,
    policy_id: id(5),
    policy_revision: 1,
    purpose: "job_search",
    purpose_note: "Manually review this employer's advertised role.",
    acknowledgement: "I reviewed this exact contact field and purpose.",
    reviewed_at: at,
    review_due_at: due,
    expires_at: expires,
    revoked_at: null,
    row_version: 1,
  });
  const populate = () => {
    insert("contact_source_snapshot", source());
    insert("contact_source_use_policy", policy());
    insert("contact_field_use_review", review());
  };
  // Explicit schema diagnostic, not a production query/normal UI witness.
  const assessment = (now = at) => {
    const s = rows("contact_source_snapshot")[0];
    const r = db.connection
      .prepare(
        "SELECT * FROM contact_field_use_review WHERE contact_id=? AND field_name='email' ORDER BY field_revision DESC LIMIT 1",
      )
      .get(id(2));
    const c = db.connection.prepare("SELECT email FROM contact WHERE id=?").get(id(2));
    if (!s || !r || !c || typeof c["email"] !== "string")
      throw new Error("Missing synthetic evidence");
    return assessContactFieldUseV1(
      {
        specVersion: 1,
        vaultId: id(1),
        contactId: id(2),
        fieldName: "email",
        currentValueHash: sha(c["email"]),
        now,
        source: {
          specVersion: 1,
          id: s["id"],
          vaultId: s["vault_id"],
          acquisition: s["acquisition"],
          sourceClass: s["source_class"],
          sourceUrl: s["source_url"],
          capturedAt: s["captured_at"],
          contentHash: s["content_hash"],
        },
        review: {
          specVersion: 1,
          id: r["id"],
          vaultId: r["vault_id"],
          contactId: r["contact_id"],
          fieldName: r["field_name"],
          valueHash: r["value_hash"],
          sourceSnapshotId: r["source_snapshot_id"],
          sourceSnapshotHash: r["source_snapshot_hash"],
          pointer: `utf8:${String(r["source_start_byte"])}:${String(r["source_end_byte"])}`,
          excerpt: r["source_excerpt"],
          policyId: r["policy_id"],
          policyRevision: r["policy_revision"],
          purpose: r["purpose"],
          purposeNote: r["purpose_note"],
          reviewedAt: r["reviewed_at"],
          reviewDueAt: r["review_due_at"],
          expiresAt: r["expires_at"],
          revokedAt: r["revoked_at"],
        },
      },
      (policyId) => {
        const p = db.connection
          .prepare("SELECT * FROM contact_source_use_policy WHERE id=?")
          .get(policyId);
        if (!p) return undefined;
        return {
          specVersion: 1,
          id: p["id"],
          vaultId: p["vault_id"],
          revision: p["revision"],
          status: p["status"],
          sourceSnapshotId: p["source_snapshot_id"],
          sourceSnapshotHash: p["source_snapshot_hash"],
          sourceUrl: p["source_url"],
          sourceClass: p["source_class"],
          fieldName: p["field_name"],
          rightsBasis: p["rights_basis"],
          purpose: p["purpose"],
          usage: p["usage"],
          reviewedAt: p["reviewed_at"],
          reviewDueAt: p["review_due_at"],
        };
      },
    );
  };

  beforeEach(async () => {
    db = new SchemaDatabase();
    await applySqlMigrations(db, migrations(), at);
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,167,?,?)",
      )
      .run(id(1), "Synthetic qualification vault", captured, at);
    db.connection
      .prepare("INSERT INTO contact(id,name,email,notes,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(id(2), "Synthetic person", email, "Unchanged private note", captured, captured);
  });
  afterEach(() => db.connection.close());

  it("retains exact independent source and permission evidence without inventing a job", () => {
    populate();
    expect(rows("contact_source_snapshot")[0]?.["raw_text"]).toBe(body);
    expect(rows("contact_source_use_policy")[0]?.["terms_excerpt"]).toBe(permission);
    expect(rows("job")).toEqual([]);
    expect(assessment()).toMatchObject({ eligible: true, rightsBasis: "public", validUntil: due });
    expect(assessment(due)).toMatchObject({ eligible: false, reason: "review_not_current" });
    expect(rows("contact")).toHaveLength(1);
  });

  it("exports all three nonempty qualification datasets including literal source and permission evidence", async () => {
    populate();
    const bundle = await createPortableDataExportV1({
      database: db,
      vaultId: id(1),
      generatedAt: at,
    });
    expect(bundle.sourceSchemaVersion).toBe(182);
    expect(bundle.datasetCount).toBe(61);
    expect(bundle.dataFiles).toHaveLength(122);
    for (const table of [
      "contact_source_snapshot",
      "contact_source_use_policy",
      "contact_field_use_review",
    ]) {
      const exported = bundle.datasets.find((dataset) => dataset.dataset === table);
      expect(exported?.rows).toEqual(rows(table));
      expect(bundle.dataFiles.some((file) => file.path === `data/${table}.csv`)).toBe(true);
    }
    const file = bundle.dataFiles.find(
      (entry) => entry.path === "data/contact_source_snapshot.json",
    );
    if (!file) throw new Error("Missing synthetic source export");
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
    );
    expect(parsed).toMatchObject({ rows: [{ raw_text: body, content_hash: sha(body) }] });
  });

  it("preserves canonical contact facts while a changed value withholds the previous basis", () => {
    populate();
    const evidence = rows("contact_field_use_review");
    db.connection
      .prepare("UPDATE contact SET email=?,updated_at=?,row_version=row_version+1 WHERE id=?")
      .run("changed@synthetic.example", later, id(2));
    expect(assessment(later)).toMatchObject({
      eligible: false,
      reason: "value_changed_or_missing",
    });
    expect(rows("contact_field_use_review")).toEqual(evidence);
    expect(rows("contact")[0]?.["notes"]).toBe("Unchanged private note");
  });

  it.each([
    ["contact_source_snapshot", 0],
    ["contact_source_use_policy", 0],
    ["contact_field_use_review", 0],
    ["contact_source_snapshot", 1],
    ["contact_source_use_policy", 1],
    ["contact_field_use_review", 1],
  ] as const)("rejects replacement through every key: %s / recursive=%i", (table, recursive) => {
    populate();
    db.connection.exec(`PRAGMA recursive_triggers=${recursive}`);
    const original =
      table === "contact_source_snapshot"
        ? source()
        : table === "contact_source_use_policy"
          ? policy()
          : review();
    const before = rows(table);
    expect(() => insert(table, { ...original, operation_id: id(90) }, true)).toThrow();
    expect(() => insert(table, { ...original, id: id(91) }, true)).toThrow();
    if (table === "contact_field_use_review")
      expect(() =>
        insert(table, { ...original, id: id(91), operation_id: id(90) }, true),
      ).toThrow();
    expect(() => db.connection.prepare(`SELECT rowid FROM ${table}`).all()).toThrow();
    expect(rows(table)).toEqual(before);
  });

  it.each([
    ["contact_source_snapshot", "raw_text", "rewritten"],
    ["contact_source_use_policy", "terms_excerpt", "rewritten"],
    ["contact_source_use_policy", "rights_basis", "licensed"],
    ["contact_field_use_review", "value_hash", "c".repeat(64)],
    ["contact_field_use_review", "purpose_note", "rewritten"],
  ])("rejects evidence rewrite: %s.%s", (table, column, value) => {
    populate();
    const before = rows(table);
    expect(() => db.connection.prepare(`UPDATE ${table} SET ${column}=?`).run(value)).toThrow();
    expect(rows(table)).toEqual(before);
  });

  it("permits one explicit revocation, never detached deletion or revival of an older review", () => {
    populate();
    insert("contact_field_use_review", {
      ...review(),
      id: id(7),
      operation_id: id(33),
      field_revision: 2,
      reviewed_at: later,
    });
    expect(() => db.connection.exec("DELETE FROM contact_field_use_review")).toThrow();
    db.connection
      .prepare("UPDATE contact_field_use_review SET revoked_at=?,row_version=2 WHERE id=?")
      .run(later, id(7));
    expect(assessment(later)).toMatchObject({
      eligible: false,
      reason: "revoked",
      reviewId: id(7),
    });
    expect(() =>
      db.connection
        .prepare("UPDATE contact_field_use_review SET revoked_at=NULL,row_version=3 WHERE id=?")
        .run(id(7)),
    ).toThrow();
    expect(rows("contact_field_use_review")).toHaveLength(2);
  });

  it("permits one explicit policy disable while retaining its permission evidence", () => {
    populate();
    db.connection
      .prepare(
        "UPDATE contact_source_use_policy SET status='disabled',disabled_at=?,row_version=2 WHERE id=?",
      )
      .run(later, id(5));
    expect(assessment(later)).toMatchObject({
      eligible: false,
      reason: "policy_not_current_or_applicable",
    });
    expect(rows("contact_source_use_policy")[0]?.["terms_excerpt"]).toBe(permission);
    expect(() =>
      db.connection
        .prepare(
          "UPDATE contact_source_use_policy SET status='enabled',disabled_at=NULL,row_version=3 WHERE id=?",
        )
        .run(id(5)),
    ).toThrow();
  });

  it.each([
    { source_snapshot_hash: "c".repeat(64) },
    { source_url: "https://other.synthetic.example/" },
    {
      source_class: "licensed_material",
      rights_basis: "licensed",
      permission_kind: "documented_license_grant",
    },
    { terms_snapshot_hash: "c".repeat(64) },
    { terms_start_byte: 0 },
    { terms_excerpt: "unretained permission assertion" },
    { acknowledgement: "yes" },
    { rights_basis: "licensed" },
    { purpose: "outreach" },
    { status: "disabled", disabled_at: at, row_version: 2 },
  ])("rejects malformed or unbound source permission evidence (%#)", (change) => {
    insert("contact_source_snapshot", source());
    expect(() => insert("contact_source_use_policy", { ...policy(), ...change })).toThrow();
    expect(rows("contact_source_use_policy")).toEqual([]);
  });

  it("rejects policy review before material was actually retained", () => {
    insert("contact_source_snapshot", { ...source(), created_at: at });
    expect(() => insert("contact_source_use_policy", policy())).toThrow();
    expect(rows("contact_source_use_policy")).toEqual([]);
  });

  it("does not renew a revoked field through a backdated review", () => {
    populate();
    db.connection
      .prepare("UPDATE contact_field_use_review SET revoked_at=?,row_version=2 WHERE id=?")
      .run(later, id(4));
    expect(() =>
      insert("contact_field_use_review", {
        ...review(),
        id: id(7),
        operation_id: id(33),
        field_revision: 2,
      }),
    ).toThrow();
    expect(assessment(later)).toMatchObject({
      eligible: false,
      reason: "revoked",
      reviewId: id(4),
    });
  });

  it("permits deliberate fresh review after revocation without modifying the old review", () => {
    populate();
    db.connection
      .prepare("UPDATE contact_field_use_review SET revoked_at=?,row_version=2 WHERE id=?")
      .run(later, id(4));
    const old = rows("contact_field_use_review")[0];
    insert("contact_field_use_review", {
      ...review(),
      id: id(7),
      operation_id: id(33),
      field_revision: 2,
      reviewed_at: later,
    });
    expect(assessment(later)).toMatchObject({ eligible: true, reviewId: id(7) });
    expect(rows("contact_field_use_review")[0]).toEqual(old);
    expect(rows("contact")[0]?.["user_confirmed"]).toBe(0);
  });

  it("uses field revision rather than timestamp or lexical ID to select the latest review", () => {
    populate();
    insert("contact_field_use_review", {
      ...review(),
      id: id(1),
      operation_id: id(33),
      field_revision: 2,
    });
    expect(assessment()).toMatchObject({ eligible: true, reviewId: id(1) });
    db.connection
      .prepare("UPDATE contact_field_use_review SET revoked_at=?,row_version=2 WHERE id=?")
      .run(at, id(1));
    expect(assessment()).toMatchObject({ eligible: false, reason: "revoked", reviewId: id(1) });
  });

  it.each([
    ["public_dataset", "public", "compatible_public_reuse"],
    ["licensed_material", "licensed", "documented_license_grant"],
  ] as const)(
    "retains explicit %s review without a production connector",
    (sourceClass, rightsBasis, permissionKind) => {
      insert("contact_source_snapshot", { ...source(), source_class: sourceClass });
      insert("contact_source_use_policy", {
        ...policy(),
        source_class: sourceClass,
        rights_basis: rightsBasis,
        permission_kind: permissionKind,
      });
      insert("contact_field_use_review", review());
      expect(assessment()).toMatchObject({ eligible: true, rightsBasis });
      expect(rows("job_source")).toEqual([]);
      expect(rows("job")).toEqual([]);
    },
  );

  it("deletes only the contact's owned reviews, preserving independent shared evidence", () => {
    populate();
    expect(() => db.connection.exec("DELETE FROM contact_source_snapshot")).toThrow();
    expect(() => db.connection.exec("DELETE FROM contact_source_use_policy")).toThrow();
    db.connection.prepare("DELETE FROM contact WHERE id=?").run(id(2));
    expect(rows("contact_field_use_review")).toEqual([]);
    expect(rows("contact_source_snapshot")).toHaveLength(1);
    expect(rows("contact_source_use_policy")).toHaveLength(1);
  });

  it.each([
    { source_snapshot_hash: "c".repeat(64) },
    { vault_id: id(88) },
    { policy_revision: 2 },
    { source_excerpt: "invented@synthetic.example" },
    { source_start_byte: 0 },
    { contact_row_version: 2 },
    { field_revision: 2 },
    { field_name: "phone" },
    { reviewed_at: expires },
    { acknowledgement: "yes" },
  ])("rejects mismatched or implicit qualification before insertion (%#)", (change) => {
    insert("contact_source_snapshot", source());
    insert("contact_source_use_policy", policy());
    expect(() => insert("contact_field_use_review", { ...review(), ...change })).toThrow();
    expect(rows("contact_field_use_review")).toEqual([]);
  });

  it("upgrades167 without changing existing canonical rows or ledger identities", async () => {
    db.connection.close();
    db = new SchemaDatabase();
    const all = migrations();
    await applySqlMigrations(
      db,
      all.filter((m) => m.version <= 167),
      captured,
    );
    const before = rows("coredrill_schema_migration");
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,167,?,?)",
      )
      .run(id(1), "Synthetic preserved vault", captured, at);
    db.connection
      .prepare("INSERT INTO contact(id,name,email,notes,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(id(2), "Synthetic legacy person", email, "Retained original note", captured, captured);
    const oldExport = await createPortableDataExportV1({
      database: db,
      vaultId: id(1),
      generatedAt: at,
    });
    expect(oldExport.datasetCount).toBe(58);
    expect(all.at(-1)?.version).toBe(182);
    const result = await applySqlMigrations(db, all, at);
    expect(result.appliedVersions).toEqual(Array.from({ length: 15 }, (_, n) => n + 168));
    expect(rows("coredrill_schema_migration").slice(0, 167)).toEqual(before);
    expect(rows("contact_source_snapshot")).toEqual([]);
    const newExport = await createPortableDataExportV1({
      database: db,
      vaultId: id(1),
      generatedAt: at,
    });
    expect(newExport.datasetCount).toBe(61);
    expect(
      newExport.datasets.filter(
        (dataset) =>
          ![
            "contact_source_snapshot",
            "contact_source_use_policy",
            "contact_field_use_review",
          ].includes(dataset.dataset),
      ),
    ).toEqual(oldExport.datasets.map((dataset) => ({ ...dataset, sourceSchemaVersion: 182 })));
  });

  it.each(Array.from({ length: 15 }, (_, n) => n + 168))(
    "rolls the complete new model and ledger back after migration %i fails",
    async (version) => {
      db.connection.close();
      db = new SchemaDatabase();
      const all = migrations();
      await applySqlMigrations(
        db,
        all.filter((m) => m.version <= 167),
        captured,
      );
      const before = rows("coredrill_schema_migration");
      db.failAfterVersion = version;
      await expect(applySqlMigrations(db, all, at)).rejects.toThrow("Synthetic failure");
      expect((await db.diagnostics()).schemaVersion).toBe(167);
      expect(rows("coredrill_schema_migration")).toEqual(before);
      expect(
        db.connection
          .prepare(
            "SELECT name FROM sqlite_schema WHERE name LIKE 'contact_source_%' OR name='contact_field_use_review'",
          )
          .all(),
      ).toEqual([]);
    },
  );

  it.each([168, 171, 175, 181])("refuses incomplete export milestone %i", async (version) => {
    db.connection.close();
    db = new SchemaDatabase();
    await applySqlMigrations(
      db,
      migrations().filter((m) => m.version <= version),
      captured,
    );
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,167,?,?)",
      )
      .run(id(1), "Synthetic intermediate vault", captured, at);
    await expect(
      createPortableDataExportV1({ database: db, vaultId: id(1), generatedAt: at }),
    ).rejects.toMatchObject({ code: "schema_mismatch" });
    expect((await db.diagnostics()).schemaVersion).toBe(version);
  });

  it("exports literal source BOM/NUL/Unicode through bytes even when a TEXT bridge consumes BOM", async () => {
    populate();
    db.consumeTextBom = true;
    const exported = await createPortableDataExportV1({
      database: db,
      vaultId: id(1),
      generatedAt: at,
    });
    const source = exported.datasets.find(
      (dataset) => dataset.dataset === "contact_source_snapshot",
    );
    expect(source?.rows[0]?.["raw_text"]).toBe(body);
    const file = exported.dataFiles.find(
      (file) => file.path === "data/contact_source_snapshot.json",
    );
    expect(JSON.parse(new TextDecoder().decode(file?.bytes)).rows[0].raw_text).toBe(body);
  });

  it("rejects malformed UTF-8 literal source bytes instead of exporting a replacement character", async () => {
    db.connection
      .prepare(
        "INSERT INTO contact_source_snapshot(id,vault_id,operation_id,acquisition,source_class,source_url,captured_at,raw_text,content_hash,created_at,row_version) VALUES(?,?,?,'user_supplied','official_employer_page','https://synthetic.example',?,CAST(x'ff' AS TEXT),?,?,1)",
      )
      .run(id(3), id(1), id(30), captured, "a".repeat(64), at);
    await expect(
      createPortableDataExportV1({ database: db, vaultId: id(1), generatedAt: at }),
    ).rejects.toMatchObject({ code: "invalid_database_value" });
  });

  it("rejects an older client's migration inventory without downgrading or rewriting the new model", async () => {
    populate();
    const before = rows("coredrill_schema_migration");
    const retained = rows("contact_source_snapshot");
    await expect(
      applySqlMigrations(
        db,
        migrations().filter((m) => m.version <= 167),
        later,
      ),
    ).rejects.toThrow("does not match reviewed source");
    expect((await db.diagnostics()).schemaVersion).toBe(182);
    expect(rows("coredrill_schema_migration")).toEqual(before);
    expect(rows("contact_source_snapshot")).toEqual(retained);
  });
});
