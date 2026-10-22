import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createContactInteractionHistoryQuery,
  createContactInteractionSummaryQuery,
  parseContactInteractionsPageV1,
  parseContactInteractionsRequestV1,
  type ContactInteractionCursorV1,
  type ContactInteractionPageV1,
  type ListContactInteractionsInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { createContactInteractionHistoryRepository } from "../src/contact-interaction-history-repository.js";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type QueryRow,
  type SqlStatement,
} from "../src/database-port.js";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const files = readdirSync(path.join(root, "migrations"))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
  .sort();
const rawId = (suffix: number) => `0198e106-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
const vaultId = entityId("vault", rawId(1));
const contactId = entityId("contact", rawId(2));
const jobId = entityId("job", rawId(3));
const at = instant("2026-10-22T04:00:00.000Z");
const later = instant("2026-10-22T05:00:00.000Z");
const context = { operationId: entityId("application-operation", rawId(4)), initiatedAt: at };
const request = { specVersion: 1 as const, expectedVaultId: vaultId, contactId, limit: 2 };
const literal = "\uFEFFabc😀\0\n<script>literal</script>尾";

const referenceFor = (page: ContactInteractionPageV1): ContactInteractionCursorV1 => {
  const item = page.items[0];
  if (item === undefined) throw new Error("Missing synthetic interaction");
  return {
    specVersion: 1,
    vaultId: page.vaultId,
    contactId: page.contactId,
    includeArchived: page.includeArchived,
    contactRowVersion: page.contactRowVersion,
    occurredAt: item.occurredAt,
    id: item.id,
    rowVersion: item.rowVersion,
    jobId: item.currentJob.id,
    jobRowVersion: item.currentJob.rowVersion,
  };
};

class HistoryDatabase implements DatabasePort {
  public readonly connection = new DatabaseSync(":memory:");
  public readonly statements: SqlStatement[] = [];
  public transactions = 0;
  public constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    for (const name of files)
      this.connection.exec(readFileSync(path.join(root, "migrations", name), "utf8"));
  }
  public async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    this.statements.push(statement);
    return this.connection.prepare(statement.sql).all(...statement.parameters) as Row[];
  }
  public async execute(statement: SqlStatement) {
    return {
      rowsAffected: Number(
        this.connection.prepare(statement.sql).run(...statement.parameters).changes,
      ),
    };
  }
  public async transaction<Result>(work: (session: DatabaseTransaction) => Promise<Result>) {
    this.transactions += 1;
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const result = await work({
        query: (statement) => this.query(statement),
        execute: async () => {
          throw new Error("A contact history read attempted a write.");
        },
      });
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
  public async exportPortable(): Promise<never> {
    throw new Error("Not an archive test.");
  }
  public async diagnostics() {
    return {
      adapterName: "node-contact-history",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: files.length,
      details: [],
    };
  }
}

describe("actual SQLite contact interaction history", () => {
  let database: HistoryDatabase;
  const read = async (input: ListContactInteractionsInputV1 = request) => {
    const result = await createContactInteractionHistoryQuery(
      createContactInteractionHistoryRepository(database),
    ).execute(input, context);
    if (!result.ok) throw new Error(`Unexpected ${result.error.code}`);
    return result.value;
  };
  const insert = async (
    suffix: number,
    selectedContact: string | null = contactId,
    selectedJob: string = jobId,
    summary = literal,
    occurredAt = at,
  ) =>
    database.execute(
      sqlStatement(
        "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          rawId(suffix),
          selectedJob,
          selectedContact,
          "meeting",
          occurredAt,
          "mutual",
          summary,
          occurredAt,
          occurredAt,
        ],
      ),
    );
  beforeEach(async () => {
    database = new HistoryDatabase();
    await database.execute(
      sqlStatement(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
        [vaultId, "Synthetic history vault", files.length, at, at],
      ),
    );
    await database.execute(
      sqlStatement("INSERT INTO company(id,canonical_name,created_at,updated_at) VALUES(?,?,?,?)", [
        rawId(5),
        "Synthetic shared company",
        at,
        at,
      ]),
    );
    for (const id of [contactId, rawId(6)])
      await database.execute(
        sqlStatement(
          "INSERT INTO contact(id,company_id,name,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,?,?)",
          [id, rawId(5), "Synthetic identity", 1, at, at],
        ),
      );
    for (const id of [jobId, rawId(7)])
      await database.execute(
        sqlStatement(
          "INSERT INTO job(id,company_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
          [id, rawId(5), "Synthetic current <role>", at, at],
        ),
      );
  });
  afterEach(() => database.connection.close());

  it("reads real exact contact links, stable tied pages and future imported chronology without writes", async () => {
    await insert(12);
    await insert(10);
    await insert(11);
    await insert(13, rawId(6));
    await insert(14, null);
    await insert(
      15,
      contactId,
      rawId(7),
      "Future imported note",
      instant("2027-01-01T00:00:00.000Z"),
    );
    const before = database.connection.prepare("SELECT * FROM interaction ORDER BY id").all();
    database.statements.length = 0;
    const first = await read();
    expect(first.items.map((item) => item.id)).toEqual([rawId(15), rawId(10)]);
    expect(first.hasMore).toBe(true);
    const second = await read({ ...request, after: first.nextCursor });
    expect(second.items.map((item) => item.id)).toEqual([rawId(11), rawId(12)]);
    expect(second.hasMore).toBe(false);
    expect(second.items[0]?.summaryPreview).toBe(literal);
    expect(database.connection.prepare("SELECT * FROM interaction ORDER BY id").all()).toEqual(
      before,
    );
    expect(database.transactions).toBe(2);
    expect(
      database.statements.every((statement) => statement.sql.trimStart().startsWith("SELECT")),
    ).toBe(true);
    const pages = database.statements.filter((statement) =>
      statement.sql.includes("ORDER BY i.occurred_at"),
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]?.sql).not.toContain(contactId);
    expect(pages[0]?.sql).not.toMatch(/i\.summary\s*,/u);
    expect(pages[0]?.parameters).toEqual([1_024, contactId, 3]);
  });

  it("reconstructs a complete long literal body beyond NUL and multibyte preview boundaries", async () => {
    const body = "\uFEFF" + "a".repeat(1_020) + "😀\0" + "尾\n".repeat(20_000);
    await insert(10, contactId, jobId, body);
    const page = await read();
    const item = page.items[0];
    if (item === undefined) throw new Error("Missing synthetic interaction");
    expect(item.summaryTruncated).toBe(true);
    expect(item.summaryByteLength).toBe(new TextEncoder().encode(body).byteLength);
    expect(new TextEncoder().encode(item.summaryPreview).byteLength).toBe(1_023);
    const reference: ContactInteractionCursorV1 = {
      specVersion: 1,
      vaultId,
      contactId,
      includeArchived: false,
      contactRowVersion: page.contactRowVersion,
      occurredAt: item.occurredAt,
      id: item.id,
      rowVersion: item.rowVersion,
      jobId: item.currentJob.id,
      jobRowVersion: item.currentJob.rowVersion,
    };
    const query = createContactInteractionSummaryQuery(
      createContactInteractionHistoryRepository(database),
    );
    let offset = 0;
    let resultText = "";
    for (let partIndex = 0; partIndex < 100; partIndex += 1) {
      const result = await query.execute(
        {
          specVersion: 1,
          reference,
          summaryByteLength: item.summaryByteLength,
          byteOffset: offset,
          limitBytes: 4_097,
        },
        context,
      );
      if (!result.ok) throw new Error(`Unexpected ${result.error.code}`);
      resultText += result.value.text;
      if (result.value.nextByteOffset === null) break;
      offset = result.value.nextByteOffset;
    }
    expect(resultText).toBe(body);
    expect(
      database.connection.prepare("SELECT length(summary) AS n FROM interaction").get()?.["n"],
    ).toBeLessThan(item.summaryByteLength);
    const badOffset = await query.execute(
      {
        specVersion: 1,
        reference,
        summaryByteLength: item.summaryByteLength,
        byteOffset: 1,
        limitBytes: 4,
      },
      context,
    );
    expect(badOffset).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("distinguishes missing/wrong/multiple vaults and contacts from an honest empty page", async () => {
    expect((await read()).items).toEqual([]);
    const query = createContactInteractionHistoryQuery(
      createContactInteractionHistoryRepository(database),
    );
    expect(await query.execute({ ...request, expectedVaultId: rawId(99) }, context)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await query.execute({ ...request, contactId: rawId(99) }, context)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    await database.execute(
      sqlStatement(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
        [rawId(99), "Synthetic second root", files.length, at, at],
      ),
    );
    expect(await query.execute(request, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });

  it("keeps archived jobs and contacts excluded until explicit inclusion", async () => {
    await insert(10);
    await insert(11, contactId, rawId(7));
    await database.execute(
      sqlStatement(
        "UPDATE job SET archived_at=?,updated_at=?,row_version=row_version+1 WHERE id=?",
        [later, later, rawId(7)],
      ),
    );
    expect((await read()).items.map((item) => item.id)).toEqual([rawId(10)]);
    expect((await read({ ...request, includeArchived: true })).items).toHaveLength(2);
    await database.execute(
      sqlStatement(
        "UPDATE contact SET archived_at=?,updated_at=?,row_version=row_version+1 WHERE id=?",
        [later, later, contactId],
      ),
    );
    expect(
      await createContactInteractionHistoryQuery(
        createContactInteractionHistoryRepository(database),
      ).execute(request, context),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await read({ ...request, includeArchived: true })).items).toHaveLength(2);
  });

  it.each(["contact", "job", "deleted_anchor"] as const)(
    "invalidates a continuation after %s drift",
    async (kind) => {
      await insert(10);
      await insert(11);
      await insert(12);
      const first = await read();
      if (kind === "contact")
        await database.execute(
          sqlStatement(
            "UPDATE contact SET notes=?,updated_at=?,row_version=row_version+1 WHERE id=?",
            ["Changed notes", later, contactId],
          ),
        );
      else if (kind === "job")
        await database.execute(
          sqlStatement("UPDATE job SET title=?,updated_at=?,row_version=row_version+1 WHERE id=?", [
            "Changed current title",
            later,
            jobId,
          ]),
        );
      else
        await database.execute(
          sqlStatement("DELETE FROM interaction WHERE id=?", [first.nextCursor?.id ?? ""]),
        );
      expect(
        await createContactInteractionHistoryQuery(
          createContactInteractionHistoryRepository(database),
        ).execute({ ...request, after: first.nextCursor }, context),
      ).toMatchObject({ ok: false, error: { code: "conflict" } });
    },
  );

  it("reads a retained empty summary as empty rather than absent", async () => {
    await insert(10, contactId, jobId, "");
    const page = await read();
    const item = page.items[0];
    if (item === undefined) throw new Error("Missing synthetic empty interaction");
    const reference = {
      specVersion: 1 as const,
      vaultId,
      contactId,
      includeArchived: false,
      contactRowVersion: page.contactRowVersion,
      occurredAt: item.occurredAt,
      id: item.id,
      rowVersion: item.rowVersion,
      jobId,
      jobRowVersion: item.currentJob.rowVersion,
    };
    const result = await createContactInteractionSummaryQuery(
      createContactInteractionHistoryRepository(database),
    ).execute({ specVersion: 1, reference, summaryByteLength: 0 }, context);
    expect(result).toMatchObject({ ok: true, value: { text: "", bytesRead: 0, hasMore: false } });
  });

  it("copies a direct-port request before awaiting transactional owner reads", async () => {
    await insert(10);
    await insert(11, rawId(6));
    const mutable = { ...parseContactInteractionsRequestV1(request) };
    const pending = createContactInteractionHistoryRepository(database).listPage(mutable);
    mutable.contactId = entityId("contact", rawId(6));
    expect(
      parseContactInteractionsPageV1(await pending, request).items.map((item) => item.id),
    ).toEqual([rawId(10)]);
  });

  it("rejects malformed direct-port parameters without starting a transaction", async () => {
    await expect(
      createContactInteractionHistoryRepository(database).listPage({
        ...parseContactInteractionsRequestV1(request),
        limit: 101,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    expect(database.transactions).toBe(0);
  });

  it.each(["contact", "job", "byte_length"] as const)(
    "rejects changed %s during full-summary inspection",
    async (kind) => {
      await insert(10);
      const page = await read();
      const reference = referenceFor(page);
      if (kind === "contact")
        await database.execute(
          sqlStatement(
            "UPDATE contact SET notes=?,updated_at=?,row_version=row_version+1 WHERE id=?",
            ["Changed", later, contactId],
          ),
        );
      if (kind === "job")
        await database.execute(
          sqlStatement("UPDATE job SET title=?,updated_at=?,row_version=row_version+1 WHERE id=?", [
            "Changed",
            later,
            jobId,
          ]),
        );
      const result = await createContactInteractionSummaryQuery(
        createContactInteractionHistoryRepository(database),
      ).execute(
        {
          specVersion: 1,
          reference,
          summaryByteLength:
            (page.items[0]?.summaryByteLength ?? 0) + (kind === "byte_length" ? 1 : 0),
          limitBytes: 4,
        },
        context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    },
  );

  it("does not reveal a body through a different contact or vault", async () => {
    await insert(10);
    const page = await read();
    const reference = referenceFor(page);
    const query = createContactInteractionSummaryQuery(
      createContactInteractionHistoryRepository(database),
    );
    for (const patch of [
      { contactId: entityId("contact", rawId(6)) },
      { vaultId: entityId("vault", rawId(99)) },
    ]) {
      const result = await query.execute(
        {
          specVersion: 1,
          reference: { ...reference, ...patch },
          summaryByteLength: page.items[0]?.summaryByteLength ?? 0,
        },
        context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
      expect(JSON.stringify(result)).not.toContain(literal);
    }
  });

  it("fails visibly on an oversized NUL-bearing legacy summary, rather than truncating it", async () => {
    await insert(10, contactId, jobId, "\0" + "x".repeat(800_000));
    expect(
      database.connection.prepare("SELECT length(summary) AS n FROM interaction").get()?.["n"],
    ).toBe(0);
    expect(
      await createContactInteractionHistoryQuery(
        createContactInteractionHistoryRepository(database),
      ).execute(request, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("fails closed on invalid retained UTF-8 instead of replacing it with display text", async () => {
    await database.execute(
      sqlStatement(
        "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,?,?,?,CAST(? AS TEXT),?,?)",
        [rawId(10), jobId, contactId, "note", at, "unknown", Uint8Array.of(255), at, at],
      ),
    );
    expect(
      await createContactInteractionHistoryQuery(
        createContactInteractionHistoryRepository(database),
      ).execute(request, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("retains actual 20,000-row before/after plans for the additive history index", async () => {
    const insertFixture = database.connection.prepare(
      "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,'note',?,'unknown','Synthetic benchmark note',?,?)",
    );
    database.connection.exec("BEGIN");
    for (let suffix = 1_000; suffix < 21_000; suffix += 1)
      insertFixture.run(rawId(suffix), jobId, suffix < 11_000 ? contactId : rawId(6), at, at, at);
    database.connection.exec("COMMIT");
    const measure = async () => {
      const samples: number[] = [];
      for (let run = 0; run < 12; run += 1) {
        const start = performance.now();
        expect((await read()).items).toHaveLength(2);
        samples.push(performance.now() - start);
      }
      const statement = database.statements.find((item) =>
        item.sql.includes("ORDER BY i.occurred_at"),
      );
      if (statement === undefined) throw new Error("Missing measured SQL");
      const plan = database.connection
        .prepare("EXPLAIN QUERY PLAN " + statement.sql)
        .all(...statement.parameters)
        .map((row) => String(row["detail"]));
      samples.sort((left, right) => left - right);
      return { plan, p95Ms: Number((samples.at(-1) ?? 0).toFixed(3)), samples: samples.length };
    };
    // Only this isolated in-memory fixture loses its index for the comparison.
    database.connection.exec("DROP INDEX interaction_contact_history_idx");
    const withoutIndex = await measure();
    database.connection.exec(
      readFileSync(
        path.join(root, "migrations", "0165_interaction_contact_history_index.sql"),
        "utf8",
      ),
    );
    const withIndex = await measure();
    expect(
      withIndex.plan.some((detail) => detail.includes("interaction_contact_history_idx")),
    ).toBe(true);
    expect(withIndex.plan.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
    const diagnostic = {
      totalRows: 20_000,
      selectedContactRows: 10_000,
      schemaMigrationCount: files.length,
      withoutIndex,
      withIndex,
      referenceHardware: false,
    };
    // Generated synthetic diagnostic only; never canonical data or a release-performance claim.
    mkdirSync(path.join(root, "test-results"), { recursive: true });
    writeFileSync(
      path.join(root, "test-results", "contact-interaction-history-query-diagnostic.json"),
      JSON.stringify(diagnostic, null, 2) + "\n",
    );
  });

  it("does not relabel a dangling stored job as empty history", async () => {
    await insert(10);
    database.connection.exec("PRAGMA foreign_keys=OFF;");
    await database.execute(sqlStatement("DELETE FROM job WHERE id=?", [jobId]));
    expect(
      await createContactInteractionHistoryQuery(
        createContactInteractionHistoryRepository(database),
      ).execute(request, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
});
