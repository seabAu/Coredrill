import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createContactFieldUseOperations,
  parseContactUseRecordRequestV1,
  parseContactUseControlRequestV1,
  createContactUseResearchQuery,
  hashViewedContactFieldV1,
  parseContactWorkspaceV1,
  type ContactUseResearchInputV1,
} from "@coredrill/application";
import { createContactFieldUseRepository } from "../src/contact-field-use-repository.js";
import { createContactDeletionRepository } from "../src/contact-deletion-repository.js";
import { createContactWorkspaceRepository } from "../src/contact-workspace-repository.js";
import { applySqlMigrations } from "../src/migrations.js";
import type {
  DatabasePort,
  DatabaseTransaction,
  QueryRow,
  SqlStatement,
} from "../src/database-port.js";

const root = path.resolve(import.meta.dirname, "../../..");
const id = (n: number) => `0198e121-0000-7000-8000-${String(n).padStart(12, "0")}`;
const captured = "2026-10-20T12:00:00.000Z",
  at = "2026-10-24T12:00:00.000Z",
  later = "2026-10-25T12:00:00.000Z",
  due = "2026-11-01T12:00:00.000Z";
const email = "person@synthetic.example",
  permission = "Synthetic permission for manually reviewing a job-search contact.";
const body = `\uFEFFEmployer\n${email}\n${permission}\0尾🧭`;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const span = (text: string) => {
  const a = Buffer.from(body).indexOf(Buffer.from(text));
  return [a, a + Buffer.byteLength(text)] as const;
};
const context = (n: number, time = at) => ({
  operationId: entityId("application-operation", id(n)),
  initiatedAt: instant(time),
});
const source = () => ({
  specVersion: 1,
  kind: "source",
  expectedVaultId: id(1),
  sourceSnapshotId: id(3),
  sourceClass: "official_employer_page",
  sourceUrl: "https://synthetic.example/team",
  capturedAt: captured,
  literalText: body,
});
const policy = () => ({
  specVersion: 1,
  kind: "policy",
  expectedVaultId: id(1),
  policyId: id(5),
  sourceSnapshotId: id(3),
  expectedSourceHash: sha(body),
  fieldName: "email",
  termsSnapshotId: id(3),
  expectedTermsHash: sha(body),
  termsStartByte: span(permission)[0],
  termsEndByte: span(permission)[1],
  termsExcerpt: permission,
  permissionKind: "explicit_public_job_search_contact",
  purpose: "job_search",
  reviewDueAt: due,
  acknowledgement: "I reviewed this source's permitted field use.",
});
const review = () => ({
  specVersion: 1,
  kind: "review",
  expectedVaultId: id(1),
  reviewId: id(4),
  contactId: id(2),
  expectedContactRowVersion: 1,
  expectedLatestReviewId: null,
  fieldName: "email",
  expectedValueHash: sha(email),
  sourceSnapshotId: id(3),
  expectedSourceHash: sha(body),
  sourceStartByte: span(email)[0],
  sourceEndByte: span(email)[1],
  sourceExcerpt: email,
  policyId: id(5),
  policyRevision: 1,
  purpose: "job_search",
  purposeNote: "\uFEFFManually review the advertised role.\0尾",
  reviewDueAt: due,
  expiresAt: due,
  acknowledgement: "I reviewed this exact contact field and purpose.",
});
const read = () => ({
  specVersion: 1,
  expectedVaultId: id(1),
  contactId: id(2),
  expectedContactRowVersion: 1,
  fieldName: "email",
});

class LocalDatabase implements DatabasePort {
  readonly connection = new DatabaseSync(":memory:");
  readonly writes: SqlStatement[] = [];
  readonly queries: SqlStatement[] = [];
  failAfterInsert: string | null = null;
  failAfterUpdate = false;
  corruptReadback: string | null = null;
  private lastInserted: string | null = null;
  constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  }
  async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    this.queries.push(statement);
    const values = this.connection.prepare(statement.sql).all(...statement.parameters);
    return values.map((row) =>
      this.corruptReadback !== null &&
      this.lastInserted === this.corruptReadback &&
      statement.sql.includes(`FROM ${this.corruptReadback} `)
        ? { ...row, operation_id: id(999) }
        : row,
    ) as Row[];
  }
  async execute(statement: SqlStatement) {
    this.writes.push(statement);
    const result = this.connection.prepare(statement.sql).run(...statement.parameters);
    const table = /^(?:INSERT INTO|UPDATE) ([a-z_]+)/u.exec(statement.sql)?.[1];
    if (table) this.lastInserted = table;
    if (table === this.failAfterInsert) throw new Error("Synthetic failure after actual insert.");
    if (this.failAfterUpdate && statement.sql.startsWith("UPDATE "))
      throw new Error("Synthetic failure after actual lifecycle update.");
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
    } finally {
      this.lastInserted = null;
    }
  }
  async exportPortable(): Promise<never> {
    throw new Error("Archive verification is separate.");
  }
  async diagnostics() {
    return {
      adapterName: "synthetic-contact-field-use",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: 182,
      details: [],
    };
  }
}

describe("actual contact field-use command and SQLite port", () => {
  let db: LocalDatabase;
  const digest = vi.fn(async (value: string) => sha(value));
  const port = () => createContactFieldUseRepository(db, digest);
  const ops = () => createContactFieldUseOperations(port(), async (value) => sha(value));
  const rows = (table: string) =>
    db.connection
      .prepare(`SELECT * FROM ${table} ORDER BY 1`)
      .all()
      .map((row) => ({ ...row }));
  const recordAll = async () => {
    const operations = ops();
    expect((await operations.record.execute(source(), context(30))).ok).toBe(true);
    expect((await operations.record.execute(policy(), context(31))).ok).toBe(true);
    expect((await operations.record.execute(review(), context(32))).ok).toBe(true);
    return operations;
  };
  beforeEach(async () => {
    db = new LocalDatabase();
    digest.mockClear();
    const migrations = readdirSync(path.join(root, "migrations"))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
      .sort()
      .map((name) => {
        const sql = readFileSync(path.join(root, "migrations", name), "utf8");
        return {
          version: Number(name.slice(0, 4)),
          name: name.slice(5, -4).replaceAll("_", "-"),
          sha256: sha(sql),
          sql,
        };
      });
    await applySqlMigrations(db, migrations, captured);
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,182,?,?)",
      )
      .run(id(1), "Synthetic review vault", captured, at);
    db.connection
      .prepare("INSERT INTO contact(id,name,email,notes,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(
        id(2),
        "Synthetic contact",
        email,
        "PRIVATE synthetic note sentinel",
        captured,
        captured,
      );
    db.connection
      .prepare("INSERT INTO contact(id,name,email,notes,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(
        id(12),
        "Other synthetic contact",
        "other@synthetic.example",
        "Other retained note",
        captured,
        captured,
      );
    db.writes.length = 0;
    db.queries.length = 0;
  });
  afterEach(() => db.connection.close());

  it("qualifies the exact stored profile URL that the selected workspace displays", async () => {
    const literal = "HTTPS://SYNTHETIC.EXAMPLE:443/Profile?q=%7e#Tail";
    const profileBody = `${literal}\n${permission}`;
    db.connection
      .prepare("UPDATE contact SET public_profile_url=?,row_version=2,updated_at=? WHERE id=?")
      .run(literal, at, id(2));
    const operations = ops();
    expect(
      (await operations.record.execute({ ...source(), literalText: profileBody }, context(30))).ok,
    ).toBe(true);
    expect(
      (
        await operations.record.execute(
          {
            ...policy(),
            fieldName: "public_profile_url",
            expectedSourceHash: sha(profileBody),
            expectedTermsHash: sha(profileBody),
            termsStartByte: Buffer.byteLength(literal + "\n"),
            termsEndByte: Buffer.byteLength(profileBody),
          },
          context(31),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await operations.record.execute(
          {
            ...review(),
            fieldName: "public_profile_url",
            expectedContactRowVersion: 2,
            expectedValueHash: sha(literal),
            expectedSourceHash: sha(profileBody),
            sourceStartByte: 0,
            sourceEndByte: Buffer.byteLength(literal),
            sourceExcerpt: literal,
          },
          context(32),
        )
      ).ok,
    ).toBe(true);
    const selectedRequest = {
      specVersion: 1 as const,
      expectedVaultId: entityId("vault", id(1)),
      contactId: entityId("contact", id(2)),
      includeArchived: false,
    };
    const workspace = parseContactWorkspaceV1(
      await createContactWorkspaceRepository(db, async (value) => sha(value)).read(selectedRequest),
      selectedRequest,
    );
    expect(workspace.contact.publicProfileUrl).toBe(literal);
    expect(
      await hashViewedContactFieldV1(workspace, "public_profile_url", async (value) => sha(value)),
    ).toBe(sha(literal));
    const basis = await operations.readField.execute(
      { ...read(), fieldName: "public_profile_url", expectedContactRowVersion: 2 },
      context(40),
    );
    expect(basis).toMatchObject({ ok: true, value: { assessment: { eligible: true } } });
  });

  it("reads honest missing-review metadata without preloading method values or writing", async () => {
    const result = await ops().readField.execute(read(), context(40));
    expect(result).toMatchObject({
      ok: true,
      value: { latestReview: null, policy: null, assessment: null },
    });
    expect(db.writes).toEqual([]);
    expect(digest).not.toHaveBeenCalled();
    expect(db.queries.some((query) => query.sql.includes("value_bytes"))).toBe(false);
  });

  it("records three explicit actions and reads the actual qualified basis without returning private text", async () => {
    const operations = await recordAll();
    const before = rows("contact");
    db.writes.length = 0;
    const result = await operations.readField.execute(read(), context(40));
    expect(result).toMatchObject({
      ok: true,
      value: {
        assessment: { eligible: true, rightsBasis: "public", validUntil: due },
        latestReview: { id: id(4), fieldRevision: 1 },
      },
    });
    const serialized = JSON.stringify(result);
    for (const secret of [
      email,
      permission,
      "PRIVATE",
      "purposeNote",
      "sourceExcerpt",
      "literalText",
      "termsExcerpt",
    ])
      expect(serialized).not.toContain(secret);
    expect(rows("contact")).toEqual(before);
    expect(rows("job")).toEqual([]);
    expect(db.writes).toEqual([]);
    expect(rows("contact_source_snapshot")[0]?.["raw_text"]).toBe(body);
    expect(rows("contact_field_use_review")[0]?.["purpose_note"]).toBe(review().purposeNote);
  });

  it("independently recomputes a source digest before any canonical effect", async () => {
    const request = parseContactUseRecordRequestV1({
      ...source(),
      sourceHash: "c".repeat(64),
      operationId: id(30),
      recordedAt: at,
    });
    await expect(port().record(request)).rejects.toMatchObject({ code: "invalid_state" });
    expect(rows("contact_source_snapshot")).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it.each([
    ["public_dataset", "compatible_public_reuse", "public"],
    ["licensed_material", "documented_license_grant", "licensed"],
  ])(
    "resolves a separately retained %s permission basis through the actual port",
    async (sourceClass, permissionKind, rightsBasis) => {
      const operations = ops();
      expect((await operations.record.execute({ ...source(), sourceClass }, context(30))).ok).toBe(
        true,
      );
      const termsText = `\uFEFF${permission}\0尾`,
        start = Buffer.byteLength("\uFEFF");
      expect(
        (
          await operations.record.execute(
            { ...source(), sourceSnapshotId: id(6), literalText: termsText },
            context(34),
          )
        ).ok,
      ).toBe(true);
      expect(
        (
          await operations.record.execute(
            {
              ...policy(),
              permissionKind,
              termsSnapshotId: id(6),
              expectedTermsHash: sha(termsText),
              termsStartByte: start,
              termsEndByte: start + Buffer.byteLength(permission),
            },
            context(31),
          )
        ).ok,
      ).toBe(true);
      expect((await operations.record.execute(review(), context(32))).ok).toBe(true);
      expect(await operations.readField.execute(read(), context(40))).toMatchObject({
        ok: true,
        value: { assessment: { eligible: true, rightsBasis } },
      });
    },
  );

  it.each(["contact", "vault"])(
    "rejects a late %s identity change before acknowledging a field review",
    async (mode) => {
      const operations = ops();
      await operations.record.execute(source(), context(30));
      await operations.record.execute(policy(), context(31));
      const before = rows("contact");
      const effect =
        mode === "contact"
          ? `UPDATE contact SET row_version=2,updated_at='${at}' WHERE id='${id(2)}';`
          : `INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES('${id(88)}','Synthetic late root',182,'${captured}','${at}');`;
      db.connection.exec(
        `CREATE TRIGGER synthetic_late_identity AFTER INSERT ON contact_field_use_review BEGIN ${effect} END;`,
      );
      expect(await operations.record.execute(review(), context(32))).toMatchObject({ ok: false });
      expect(rows("contact_field_use_review")).toEqual([]);
      expect(rows("contact")).toEqual(before);
      expect(rows("vault")).toHaveLength(1);
    },
  );

  it.each(["contact_source_snapshot", "contact_source_use_policy", "contact_field_use_review"])(
    "rolls back an actual late %s insertion failure",
    async (table) => {
      const operations = ops();
      if (table !== "contact_source_snapshot")
        expect((await operations.record.execute(source(), context(30))).ok).toBe(true);
      if (table === "contact_field_use_review")
        expect((await operations.record.execute(policy(), context(31))).ok).toBe(true);
      const original = rows("contact");
      db.failAfterInsert = table;
      const input =
        table === "contact_source_snapshot"
          ? source()
          : table === "contact_source_use_policy"
            ? policy()
            : review();
      expect(await operations.record.execute(input, context(80))).toMatchObject({ ok: false });
      expect(rows(table)).toEqual([]);
      expect(rows("contact")).toEqual(original);
    },
  );

  it.each(["contact_source_snapshot", "contact_source_use_policy", "contact_field_use_review"])(
    "rejects corrupted %s readback inside the same transaction",
    async (table) => {
      const operations = ops();
      if (table !== "contact_source_snapshot")
        expect((await operations.record.execute(source(), context(30))).ok).toBe(true);
      if (table === "contact_field_use_review")
        expect((await operations.record.execute(policy(), context(31))).ok).toBe(true);
      db.corruptReadback = table;
      const input =
        table === "contact_source_snapshot"
          ? source()
          : table === "contact_source_use_policy"
            ? policy()
            : review();
      expect(await operations.record.execute(input, context(80))).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
      expect(rows(table)).toEqual([]);
    },
  );

  it.each([
    { expectedContactRowVersion: 2 },
    { expectedLatestReviewId: id(99) },
    { expectedValueHash: "c".repeat(64) },
    { expectedSourceHash: "c".repeat(64) },
    { sourceStartByte: 0, sourceEndByte: Buffer.byteLength(email) },
    { sourceExcerpt: "x".repeat(Buffer.byteLength(email)) },
  ])(
    "rejects stale current field/source/latest-review intent without partial records (%#)",
    async (change) => {
      const operations = ops();
      await operations.record.execute(source(), context(30));
      await operations.record.execute(policy(), context(31));
      expect(
        await operations.record.execute({ ...review(), ...change }, context(32)),
      ).toMatchObject({ ok: false, error: { code: "conflict" } });
      expect(rows("contact_field_use_review")).toEqual([]);
    },
  );

  it("requires an explicit latest-review expectation instead of silently rebasing a fresh identity", async () => {
    const operations = await recordAll();
    const next = { ...review(), reviewId: id(7) };
    expect(await operations.record.execute(next, context(33))).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(
      await operations.record.execute({ ...next, expectedLatestReviewId: id(4) }, context(33)),
    ).toMatchObject({ ok: true, value: { fieldRevision: 2 } });
  });

  it("withholds expired or changed values without modifying the retained review", async () => {
    const operations = await recordAll(),
      before = rows("contact_field_use_review");
    expect(await operations.readField.execute(read(), context(40, due))).toMatchObject({
      ok: true,
      value: { assessment: { eligible: false, reason: "review_not_current" } },
    });
    db.connection
      .prepare("UPDATE contact SET email=?,updated_at=?,row_version=2 WHERE id=?")
      .run("changed@synthetic.example", later, id(2));
    expect(await operations.readField.execute(read(), context(41, later))).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(
      await operations.readField.execute(
        { ...read(), expectedContactRowVersion: 2 },
        context(42, later),
      ),
    ).toMatchObject({
      ok: true,
      value: { assessment: { eligible: false, reason: "value_changed_or_missing" } },
    });
    expect(rows("contact_field_use_review")).toEqual(before);
  });

  it.each(["disable_policy", "revoke_review"] as const)(
    "performs guarded one-way %s and observes uncertain completion without retry",
    async (kind) => {
      const operations = await recordAll();
      const input =
        kind === "disable_policy"
          ? {
              specVersion: 1,
              kind,
              expectedVaultId: id(1),
              recordId: id(5),
              expectedRowVersion: 1,
              sourceSnapshotId: id(3),
              expectedSourceHash: sha(body),
            }
          : {
              specVersion: 1,
              kind,
              expectedVaultId: id(1),
              recordId: id(4),
              expectedRowVersion: 1,
              contactId: id(2),
              expectedContactRowVersion: 1,
              fieldName: "email",
            };
      const original = parseContactUseControlRequestV1({
        ...input,
        operationId: id(41),
        recordedAt: later,
      });
      expect(await operations.control.execute(input, context(41, later))).toMatchObject({
        ok: true,
        value: { rowVersion: 2, recordedAt: later },
      });
      db.writes.length = 0;
      expect(await operations.inspect.execute(original, context(42, due))).toMatchObject({
        ok: true,
        value: { state: "matching", rowVersion: 2 },
      });
      expect(db.writes).toEqual([]);
      expect(await operations.control.execute(input, context(41, later))).toMatchObject({
        ok: false,
        error: { code: "conflict" },
      });
      expect(await operations.readField.execute(read(), context(43, later))).toMatchObject({
        ok: true,
        value: { assessment: { eligible: false } },
      });
    },
  );

  it("inspects only the original stored operation and never writes or rebases its clock", async () => {
    const operations = await recordAll();
    db.writes.length = 0;
    const original = parseContactUseRecordRequestV1({
      ...source(),
      operationId: id(30),
      recordedAt: at,
      sourceHash: sha(body),
    });
    expect(await operations.inspect.execute(original, context(99, due))).toMatchObject({
      ok: true,
      value: { state: "matching", originalOperationId: id(30), lifecycle: "retained" },
    });
    expect(
      await operations.inspect.execute({ ...original, sourceSnapshotId: id(77) }, context(99, due)),
    ).toMatchObject({ ok: true, value: { state: "absent", rowVersion: null } });
    expect(db.writes).toEqual([]);
  });

  it.each(["disable_policy", "revoke_review"] as const)(
    "rolls back late and corrupt-readback %s effects",
    async (kind) => {
      const operations = await recordAll();
      const table =
        kind === "disable_policy" ? "contact_source_use_policy" : "contact_field_use_review";
      const input =
        kind === "disable_policy"
          ? {
              specVersion: 1,
              kind,
              expectedVaultId: id(1),
              recordId: id(5),
              expectedRowVersion: 1,
              sourceSnapshotId: id(3),
              expectedSourceHash: sha(body),
            }
          : {
              specVersion: 1,
              kind,
              expectedVaultId: id(1),
              recordId: id(4),
              expectedRowVersion: 1,
              contactId: id(2),
              expectedContactRowVersion: 1,
              fieldName: "email",
            };
      const before = rows(table);
      db.failAfterUpdate = true;
      expect(await operations.control.execute(input, context(41, later))).toMatchObject({
        ok: false,
      });
      expect(rows(table)).toEqual(before);
      db.failAfterUpdate = false;
      db.corruptReadback = table;
      expect(await operations.control.execute(input, context(41, later))).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
      expect(rows(table)).toEqual(before);
    },
  );

  it("uses a real read-only snapshot capability without entering a write transaction", async () => {
    await recordAll();
    let leases = 0;
    const selected: DatabasePort = {
      query: (statement) => db.query(statement),
      execute: async () => {
        throw new Error("Unexpected write");
      },
      transaction: async () => {
        throw new Error("Unexpected write transaction");
      },
      exportPortable: () => db.exportPortable(),
      diagnostics: () => db.diagnostics(),
      withReadSnapshot: async (work) => {
        leases += 1;
        return work({
          query: (statement) => db.query(statement),
          exportPortable: () => db.exportPortable(),
        });
      },
    };
    const operations = createContactFieldUseOperations(
      createContactFieldUseRepository(selected, digest),
      async (value) => sha(value),
    );
    expect(await operations.readField.execute(read(), context(40))).toMatchObject({
      ok: true,
      value: { assessment: { eligible: true } },
    });
    expect(leases).toBe(1);
  });

  it("does not revive a prior eligible review after revoking the latest revision", async () => {
    const operations = await recordAll();
    expect(
      (
        await operations.record.execute(
          { ...review(), reviewId: id(7), expectedLatestReviewId: id(4) },
          context(33),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await operations.control.execute(
          {
            specVersion: 1,
            kind: "revoke_review",
            expectedVaultId: id(1),
            recordId: id(7),
            expectedRowVersion: 1,
            contactId: id(2),
            expectedContactRowVersion: 1,
            fieldName: "email",
          },
          context(41, later),
        )
      ).ok,
    ).toBe(true);
    expect(await operations.readField.execute(read(), context(42, later))).toMatchObject({
      ok: true,
      value: {
        latestReview: { id: id(7), fieldRevision: 2 },
        assessment: { eligible: false, reason: "revoked" },
      },
    });
    expect(
      rows("contact_field_use_review").find((row) => row["id"] === id(4))?.["revoked_at"],
    ).toBe(null);
  });

  it("withholds archived fields by default, permits deliberate metadata inspection and rejects new review writes", async () => {
    const operations = await recordAll();
    db.connection
      .prepare("UPDATE contact SET archived_at=?,updated_at=?,row_version=2 WHERE id=?")
      .run(later, later, id(2));
    const input = { ...read(), expectedContactRowVersion: 2 };
    expect(await operations.readField.execute(input, context(40, later))).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(
      await operations.readField.execute({ ...input, includeArchived: true }, context(40, later)),
    ).toMatchObject({ ok: true, value: { contactArchivedAt: later } });
    expect(
      await operations.record.execute(
        {
          ...review(),
          reviewId: id(7),
          expectedContactRowVersion: 2,
          expectedLatestReviewId: id(4),
        },
        context(41, later),
      ),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(rows("contact_field_use_review")).toHaveLength(1);
  });

  it("deletes only owned reviews through the normal deletion port and retains shared evidence", async () => {
    await recordAll();
    const sources = rows("contact_source_snapshot"),
      policies = rows("contact_source_use_policy");
    const target = {
      specVersion: 1 as const,
      expectedVaultId: entityId("vault", id(1)),
      contactId: entityId("contact", id(2)),
      expectedRowVersion: 1,
      expectedCreatedAt: instant(captured),
      expectedUpdatedAt: instant(captured),
      expectedArchivedAt: null,
      expectedCompanyId: null,
      expectedManualCreationOperationId: null,
    };
    const deletion = createContactDeletionRepository(db);
    expect(await deletion.remove(target)).toMatchObject({ state: "deleted" });
    expect(await deletion.inspect(target)).toMatchObject({ state: "absent_complete" });
    expect(rows("contact_field_use_review")).toEqual([]);
    expect(rows("contact_source_snapshot")).toEqual(sources);
    expect(rows("contact_source_use_policy")).toEqual(policies);
    expect(rows("contact")).toHaveLength(1);
  });

  it("reports unresolved absence if a damaged store retains an orphaned field review", async () => {
    await recordAll();
    db.connection.exec("PRAGMA foreign_keys=OFF");
    db.connection.prepare("DELETE FROM contact WHERE id=?").run(id(2));
    db.connection.exec("PRAGMA foreign_keys=ON");
    expect(rows("contact_field_use_review")).toHaveLength(1);
    const target = {
      specVersion: 1 as const,
      expectedVaultId: entityId("vault", id(1)),
      contactId: entityId("contact", id(2)),
      expectedRowVersion: 1,
      expectedCreatedAt: instant(captured),
      expectedUpdatedAt: instant(captured),
      expectedArchivedAt: null,
      expectedCompanyId: null,
      expectedManualCreationOperationId: null,
    };
    db.writes.length = 0;
    expect(await createContactDeletionRepository(db).inspect(target)).toMatchObject({
      state: "unresolved",
    });
    expect(db.writes).toEqual([]);
  });

  it("pages tied source timestamps exactly without reading literal evidence or writing", async () => {
    const operations = ops();
    for (let n = 10; n < 36; n++)
      expect(
        (
          await operations.record.execute(
            { ...source(), sourceSnapshotId: id(n) },
            context(100 + n),
          )
        ).ok,
      ).toBe(true);
    db.queries.length = 0;
    db.writes.length = 0;
    digest.mockClear();
    const query = createContactUseResearchQuery(port().research, async (text) => sha(text));
    const ids: string[] = [];
    let cursor: Extract<ContactUseResearchInputV1, { kind: "sources" }>["cursor"] = null;
    do {
      const result = await query.execute(
        { specVersion: 1, kind: "sources", expectedVaultId: id(1), pageSize: 5, cursor },
        context(90),
      );
      if (!result.ok || result.value.kind !== "sources") throw Error("Missing exact source page");
      expect(JSON.stringify(result)).not.toContain(body);
      ids.push(...result.value.items.map((item) => item.id));
      cursor = result.value.nextCursor;
    } while (cursor !== null);
    expect(ids).toEqual(Array.from({ length: 26 }, (_, n) => id(35 - n)));
    expect(db.queries.map((q) => q.sql).join("\n")).not.toMatch(
      /raw_text|terms_excerpt|purpose_note/u,
    );
    expect(db.writes).toEqual([]);
    expect(digest).not.toHaveBeenCalled();
  });

  it("resumes scoped permission pages including disabled history without loading bodies", async () => {
    const operations = await recordAll();
    for (let n = 10; n < 14; n++)
      expect(
        (await operations.record.execute({ ...policy(), policyId: id(n) }, context(100 + n))).ok,
      ).toBe(true);
    expect(
      (
        await operations.control.execute(
          {
            specVersion: 1,
            kind: "disable_policy",
            expectedVaultId: id(1),
            recordId: id(13),
            expectedRowVersion: 1,
            sourceSnapshotId: id(3),
            expectedSourceHash: sha(body),
          },
          context(150, later),
        )
      ).ok,
    ).toBe(true);
    const query = createContactUseResearchQuery(port().research, async (text) => sha(text));
    db.queries.length = 0;
    db.writes.length = 0;
    digest.mockClear();
    const request = {
      specVersion: 1,
      kind: "policies",
      expectedVaultId: id(1),
      sourceSnapshotId: id(3),
      expectedSourceHash: sha(body),
      fieldName: "email",
      pageSize: 2,
      cursor: null,
    };
    const first = await query.execute(request, context(151, later));
    expect(first).toMatchObject({
      ok: true,
      value: {
        items: [
          { id: id(13), rowVersion: 2, disabledAt: later },
          { id: id(12), rowVersion: 1 },
        ],
      },
    });
    if (!first.ok || first.value.kind !== "policies") throw Error("Missing permission page");
    const next = await query.execute(
      { ...request, cursor: first.value.nextCursor },
      context(152, later),
    );
    expect(next).toMatchObject({ ok: true, value: { items: [{ id: id(11) }, { id: id(10) }] } });
    const bad = await query.execute(
      { ...request, fieldName: "phone", cursor: first.value.nextCursor },
      context(153, later),
    );
    expect(bad).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(db.queries.map((q) => q.sql).join("\n")).not.toMatch(
      /raw_text|terms_excerpt|purpose_note/u,
    );
    expect(db.writes).toEqual([]);
    expect(digest).not.toHaveBeenCalled();
  });

  it("deliberately inspects exact canonical source, terms and current latest review without writes", async () => {
    await recordAll();
    db.writes.length = 0;
    const query = createContactUseResearchQuery(port().research, async (text) => sha(text));
    const evidence = await query.execute(
      {
        specVersion: 1,
        kind: "evidence",
        expectedVaultId: id(1),
        sourceSnapshotId: id(3),
        expectedSourceHash: sha(body),
        fieldName: "email",
        policyId: id(5),
        expectedPolicyRowVersion: 1,
      },
      context(90),
    );
    expect(evidence).toMatchObject({
      ok: true,
      value: {
        source: { literalText: body },
        terms: { literalText: body },
        policy: { termsExcerpt: permission },
        policyRowVersion: 1,
      },
    });
    const latest = await query.execute(
      {
        specVersion: 1,
        kind: "review",
        expectedVaultId: id(1),
        contactId: id(2),
        expectedContactRowVersion: 1,
        fieldName: "email",
        reviewId: id(4),
        expectedReviewRowVersion: 1,
      },
      context(91),
    );
    expect(latest).toMatchObject({
      ok: true,
      value: {
        fieldRevision: 1,
        review: { sourceExcerpt: email, purposeNote: review().purposeNote },
        evidence: { source: { literalText: body } },
      },
    });
    expect(db.writes).toEqual([]);
  });

  it("uses the read-snapshot capability without a writable transaction when available", async () => {
    await recordAll();
    const readOnly: DatabasePort = {
      query: db.query.bind(db),
      execute: async () => {
        throw Error("Write forbidden");
      },
      transaction: async () => {
        throw Error("Writable transaction forbidden");
      },
      exportPortable: db.exportPortable.bind(db),
      diagnostics: db.diagnostics.bind(db),
      withReadSnapshot: async (work) =>
        work({ query: db.query.bind(db), exportPortable: db.exportPortable.bind(db) }),
    };
    const result = await createContactUseResearchQuery(
      createContactFieldUseRepository(readOnly, async (text) => sha(text)).research,
      async (text) => sha(text),
    ).execute(
      { specVersion: 1, kind: "sources", expectedVaultId: id(1), pageSize: 5, cursor: null },
      context(90),
    );
    expect(result.ok).toBe(true);
  });

  it("withholds stale lifecycle and latest-review selections after revoke/renewal", async () => {
    const operations = await recordAll();
    const query = createContactUseResearchQuery(port().research, async (text) => sha(text));
    const request = {
      specVersion: 1,
      kind: "review",
      expectedVaultId: id(1),
      contactId: id(2),
      expectedContactRowVersion: 1,
      fieldName: "email",
      reviewId: id(4),
      expectedReviewRowVersion: 1,
    };
    expect(
      (
        await operations.control.execute(
          {
            specVersion: 1,
            kind: "revoke_review",
            expectedVaultId: id(1),
            recordId: id(4),
            expectedRowVersion: 1,
            contactId: id(2),
            expectedContactRowVersion: 1,
            fieldName: "email",
          },
          context(90, later),
        )
      ).ok,
    ).toBe(true);
    expect(await query.execute(request, context(91, later))).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(
      await query.execute({ ...request, expectedReviewRowVersion: 2 }, context(92, later)),
    ).toMatchObject({ ok: true, value: { revokedAt: later, rowVersion: 2 } });
    expect(
      (
        await operations.record.execute(
          { ...review(), reviewId: id(9), expectedLatestReviewId: id(4) },
          context(93, later),
        )
      ).ok,
    ).toBe(true);
    expect(
      await query.execute({ ...request, expectedReviewRowVersion: 2 }, context(94, later)),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it.each([
    { expectedVaultId: id(99) },
    { expectedContactRowVersion: 2 },
    { contactId: id(99) },
    { fieldName: "phone" },
    { reviewId: id(99) },
  ])("rejects foreign/stale latest review selection %j", async (patch) => {
    await recordAll();
    db.writes.length = 0;
    const result = await createContactUseResearchQuery(port().research, async (text) =>
      sha(text),
    ).execute(
      {
        specVersion: 1,
        kind: "review",
        expectedVaultId: id(1),
        contactId: id(2),
        expectedContactRowVersion: 1,
        fieldName: "email",
        reviewId: id(4),
        expectedReviewRowVersion: 1,
        ...patch,
      },
      context(90),
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(body);
    expect(db.writes).toEqual([]);
  });

  it.each([
    { expectedSourceHash: "f".repeat(64) },
    { fieldName: "phone" },
    { expectedPolicyRowVersion: 2 },
    { policyId: id(99) },
  ])("rejects stale canonical evidence selection %j", async (patch) => {
    await recordAll();
    db.writes.length = 0;
    const result = await createContactUseResearchQuery(port().research, async (text) =>
      sha(text),
    ).execute(
      {
        specVersion: 1,
        kind: "evidence",
        expectedVaultId: id(1),
        sourceSnapshotId: id(3),
        expectedSourceHash: sha(body),
        fieldName: "email",
        policyId: id(5),
        expectedPolicyRowVersion: 1,
        ...patch,
      },
      context(90),
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(body);
    expect(db.writes).toEqual([]);
  });

  it.each([false, true])(
    "rejects wrong/multiple vault identity (multiple=%s)",
    async (multiple) => {
      if (multiple)
        db.connection
          .prepare(
            "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,182,?,?)",
          )
          .run(id(88), "Other synthetic root", captured, at);
      const result = await ops().record.execute(
        { ...source(), expectedVaultId: multiple ? id(1) : id(88) },
        context(30),
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: multiple ? "internal" : "not_found" },
      });
      expect(rows("contact_source_snapshot")).toEqual([]);
    },
  );
});
