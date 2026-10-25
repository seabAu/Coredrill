import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createPortableDataExportV1,
  inspectPortableArchiveV1,
  writePortableArchiveV1,
} from "../packages/storage-core/dist/index.js";

/** Disclosed synthetic archive prerequisite, restored through normal UI; originals stay unchanged. */
export const createCompanyJobsFixture = async (
  testInfo,
  {
    withInteractions = false,
    withSources = false,
    withOutcomes = false,
    withNetworkInteractions = false,
  } = {},
) => {
  const originalPath = path.resolve("fixtures/recovery/phase-1-vault-schema-165-v1.coredrill.zip");
  const originalBytes = await readFile(originalPath);
  const original = await inspectPortableArchiveV1({
    bytes: new Uint8Array(originalBytes),
    expectedSchemaVersion: 165,
  });
  const file = testInfo.outputPath("synthetic-company-linked-jobs.sqlite");
  await writeFile(file, original.database.bytes);
  const db = new DatabaseSync(file);
  const id = (n) => `0198e134-0000-7000-8000-${String(n).padStart(12, "0")}`;
  const at = "2026-10-25T12:00:00.000Z",
    hash = (value) => createHash("sha256").update(value).digest("hex");
  let closed = false;
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    const base = db
      .prepare(
        "SELECT c.id,c.canonical_name FROM company c JOIN job j ON j.company_id=c.id WHERE c.archived_at IS NULL AND j.archived_at IS NULL ORDER BY j.id LIMIT 1",
      )
      .get();
    if (base === undefined) throw Error("Missing synthetic company prerequisite");
    for (const [n, name, archived] of [
      [9000, "Synthetic empty linked-role company", null],
      [9001, "Synthetic other linked-role company", null],
      [9002, "Synthetic archived linked-role company", at],
    ])
      db.prepare(
        "INSERT INTO company(id,canonical_name,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      ).run(id(n), name, "PRIVATE synthetic company note", archived, at, at);
    db.prepare(
      "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,?,'saved',999,0,?,?)",
    ).run(id(8000), "Synthetic <i>saved</i>", at, at);
    const title = (n) =>
      n === 100
        ? `Synthetic linked role 00 <b>literal</b> ${"長".repeat(300)}😀`
        : `Synthetic linked role ${String(n - 100).padStart(2, "0")}`;
    for (const n of [...Array.from({ length: 27 }, (_, index) => index + 100), 200, 300])
      db.prepare(
        "INSERT INTO job(id,company_id,title,normalized_title,description_text,current_status_id,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        id(n),
        n === 200 ? id(9001) : n === 300 ? id(9002) : base.id,
        title(n),
        title(n).toLowerCase(),
        `PRIVATE synthetic role body ${n}`,
        n === 101 ? null : id(8000),
        n === 126 || n === 300 ? at : null,
        at,
        at,
      );
    const historySummary = `\uFEFF${"a".repeat(1020)}😀\0尾${"x".repeat(17000)}\uFEFF`;
    if (withNetworkInteractions) {
      const occurred = "2026-10-25T15:00:00.000Z";
      db.prepare(
        "INSERT INTO company(id,canonical_name,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      ).run(
        id(9008),
        "Synthetic Network history company",
        "PRIVATE Network company notes",
        at,
        at,
        at,
      );
      for (const n of [700, 701, 702])
        db.prepare(
          "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).run(
          id(n),
          n === 702 ? null : id(9008),
          `Synthetic Network history job ${n}`,
          "PRIVATE Network job body",
          n === 701 ? at : null,
          at,
          at,
        );
      db.prepare(
        "INSERT INTO contact(id,company_id,name,email,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)",
      ).run(
        id(9009),
        id(9001),
        "PRIVATE Network contact",
        "private@example.test",
        "PRIVATE contact notes",
        at,
        at,
      );
      for (const n of [...Array.from({ length: 27 }, (_, index) => 40000 + index), 41000, 42000])
        db.prepare(
          "INSERT INTO interaction(id,job_id,contact_id,type,direction,summary,occurred_at,created_at,updated_at) VALUES(?,?,?,'note','unknown',?,?,?,?)",
        ).run(
          id(n),
          n === 41000 ? id(701) : n === 42000 ? id(702) : id(700),
          n % 2 === 0 ? id(9009) : null,
          n === 40000
            ? historySummary
            : n === 40001
              ? ""
              : `Synthetic Network interaction ${n} <script>literal</script> 😀`,
          occurred,
          occurred,
          occurred,
        );
    }
    if (withInteractions) {
      db.prepare(
        "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
      ).run(
        id(9005),
        "Synthetic current-linked history company",
        "PRIVATE history company notes",
        at,
        at,
      );
      for (const n of [400, 401])
        db.prepare(
          "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).run(
          id(n),
          id(9005),
          `Synthetic history job ${n}`,
          "PRIVATE history job body",
          n === 401 ? at : null,
          at,
          at,
        );
      db.prepare(
        "INSERT INTO contact(id,company_id,name,email,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)",
      ).run(
        id(9003),
        id(9001),
        "PRIVATE cross-company history contact",
        "private@example.test",
        "PRIVATE contact notes",
        at,
        at,
      );
      for (const n of [...Array.from({ length: 27 }, (_, index) => 10000 + index), 11000, 12000])
        db.prepare(
          "INSERT INTO interaction(id,job_id,contact_id,type,direction,summary,occurred_at,created_at,updated_at) VALUES(?,?,?,'note','unknown',?,?,?,?)",
        ).run(
          id(n),
          n === 11000 ? id(401) : n === 12000 ? id(200) : id(400),
          n % 2 === 0 ? id(9003) : null,
          n === 10000
            ? historySummary
            : `Synthetic company history ${n} <script>literal</script> 😀`,
          at,
          at,
          at,
        );
    }
    const sourceUrl = "https://EXAMPLE.test:443/%7eRole?q=%2f";
    if (withSources) {
      db.prepare(
        "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
      ).run(
        id(9006),
        "Synthetic current-linked source company",
        "PRIVATE source company notes",
        at,
        at,
      );
      for (const n of [500, 501])
        db.prepare(
          "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).run(
          id(n),
          id(9006),
          `Synthetic source job ${n}`,
          "PRIVATE source job body",
          n === 501 ? at : null,
          at,
          at,
        );
      for (const n of [...Array.from({ length: 27 }, (_, index) => index + 20000), 21000, 22000])
        db.prepare(
          "INSERT INTO job_source(id,job_id,connector_id,external_id,canonical_url,first_seen_at,last_seen_at,content_hash,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id(n),
          n === 21000 ? id(501) : n === 22000 ? id(200) : id(500),
          "synthetic.source",
          `Synthetic listing source ${n} <script>literal</script> 😀`,
          n === 20000 ? sourceUrl : null,
          at,
          at,
          n === 20000 ? "a".repeat(64) : null,
          n === 20000 ? 1 : 0,
          at,
          at,
        );
      for (const [n, source, captured, hash] of [
        [25000, 20000, "2026-10-24T12:00:00.000Z", "a"],
        [25001, 20000, at, "b"],
        [25002, 20000, at, "c"],
        [25015, 20015, at, "d"],
        [26000, 21000, at, "e"],
      ])
        db.prepare(
          "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,raw_text,content_hash,retention_class,created_at) VALUES(?,?,?,'synthetic.extractor','1.0.0',?,?,'synthetic',?)",
        ).run(
          id(n),
          id(source),
          captured,
          `PRIVATE synthetic listing capture ${n} <script>inert()</script>`,
          hash.repeat(64),
          at,
        );
    }
    if (withOutcomes) {
      db.prepare(
        "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
      ).run(
        id(9007),
        "Synthetic current-linked outcome company",
        "PRIVATE outcome company notes",
        at,
        at,
      );
      for (const n of [600, 601])
        db.prepare(
          "INSERT INTO job(id,company_id,title,description_text,current_status_id,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          id(n),
          id(9007),
          `Synthetic outcome job ${n} <script>literal</script> 😀`,
          "PRIVATE outcome job body",
          id(8000),
          n === 601 ? at : null,
          at,
          at,
        );
      for (const [n, name, category, terminal] of [
        [51000, "Synthetic current active <script> 😀", "saved", 0],
        [51001, "Synthetic current rejection", "rejected", 1],
        [51002, "Synthetic current reopening", "preparing", 0],
      ])
        db.prepare(
          "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).run(id(n), name, category, n, terminal, at, at);
      db.prepare(
        "INSERT INTO application(id,job_id,current_status_id,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      ).run(id(52000), id(600), id(51001), "PRIVATE outcome application notes", at, at, at);
      for (const n of [...Array.from({ length: 27 }, (_, index) => 30000 + index), 31000, 32000])
        db.prepare(
          "INSERT INTO status_event(id,job_id,application_id,from_status_id,to_status_id,occurred_at,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          id(n),
          n === 31000 ? id(601) : n === 32000 ? id(200) : id(600),
          n === 30000 ? id(52000) : null,
          n === 30002 ? null : n === 30001 ? id(51001) : id(51000),
          n === 30001 ? id(51002) : id(51001),
          at,
          "PRIVATE outcome event notes",
          at,
        );
      db.prepare(
        "INSERT INTO mutation_undo_token(id,kind,job_id,status_event_id,previous_status_id,expected_status_id,expected_job_row_version,created_at,consumed_at,row_version) VALUES(?,'status_change',?,?,?,?,?,?,?,2)",
      ).run(id(53000), id(600), id(30003), id(51000), id(51001), 1, at, at);
    }
    const session = {
      query: async (statement) => db.prepare(statement.sql).all(...statement.parameters),
    };
    const data = await createPortableDataExportV1({
      database: {
        transaction: async (work) => {
          db.exec("BEGIN IMMEDIATE");
          try {
            const result = await work(session);
            db.exec("COMMIT");
            return result;
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        },
      },
      vaultId: original.manifest.vault.id,
      generatedAt: at,
    });
    db.close();
    closed = true;
    const bytes = new Uint8Array(await readFile(file));
    const archive = await writePortableArchiveV1({
      archiveId: id(9999),
      createdAt: at,
      createdByVersion: "0.0.0",
      vault: original.manifest.vault,
      database: { bytes, byteLength: bytes.length, schemaVersion: 165, sha256: hash(bytes) },
      dataFiles: data.dataFiles,
      attachments: original.attachments.map(
        ({ contentId, sha256, mediaType, byteLength, logicalName }) => ({
          contentId,
          sha256,
          mediaType,
          byteLength,
          logicalName,
        }),
      ),
      readAttachment: async (contentId) =>
        original.attachments.find((item) => item.contentId === contentId)?.bytes,
    });
    await inspectPortableArchiveV1({
      bytes: archive.bytes,
      expectedSchemaVersion: 165,
      expectedArchiveSha256: archive.sha256,
    });
    if (!originalBytes.equals(await readFile(originalPath)))
      throw Error("Preserved recovery fixture changed");
    return {
      bytes: archive.bytes,
      companyId: base.id,
      companyName: base.canonical_name,
      emptyCompanyId: id(9000),
      otherCompanyId: id(9001),
      archivedCompanyId: id(9002),
      selectedJobId: id(115),
      archivedJobId: id(126),
      literalTitle: title(100),
      firstIds: Array.from({ length: 10 }, (_, index) => id(index + 100)),
      secondIds: Array.from({ length: 10 }, (_, index) => id(index + 110)),
      originalRecoveryFixtureUnchanged: true,
      ...(withNetworkInteractions
        ? {
            networkFirstIds: Array.from({ length: 10 }, (_, n) => id(40000 + n)),
            networkSecondIds: Array.from({ length: 10 }, (_, n) => id(40010 + n)),
            networkArchivedId: id(41000),
            networkUnknownCompanyId: id(42000),
            networkSummary: historySummary,
          }
        : {}),
      ...(withOutcomes
        ? {
            outcomeCompanyId: id(9007),
            outcomeCompanyName: "Synthetic current-linked outcome company",
            outcomeFirstIds: Array.from({ length: 10 }, (_, n) => id(n + 30000)),
            outcomeSecondIds: Array.from({ length: 10 }, (_, n) => id(n + 30010)),
            outcomeArchivedId: id(31000),
            outcomeReversedId: id(30003),
            outcomeApplicationId: id(52000),
          }
        : {}),
      ...(withSources
        ? {
            sourceCompanyId: id(9006),
            sourceCompanyName: "Synthetic current-linked source company",
            sourceFirstIds: Array.from({ length: 10 }, (_, index) => id(index + 20000)),
            sourceSecondIds: Array.from({ length: 10 }, (_, index) => id(index + 20010)),
            selectedSourceId: id(20015),
            sourceArchivedId: id(21000),
            sourceOnlyId: id(20001),
            sourceUrl,
            sourceActiveJobId: id(500),
            sourceArchivedJobId: id(501),
            selectedCaptureId: id(25015),
            archivedCaptureId: id(26000),
          }
        : {}),
      ...(withInteractions
        ? {
            historyCompanyId: id(9005),
            historyCompanyName: "Synthetic current-linked history company",
            historyFirstIds: Array.from({ length: 10 }, (_, index) => id(index + 10000)),
            historySecondIds: Array.from({ length: 10 }, (_, index) => id(index + 10010)),
            historySummary,
            historyContactId: id(9003),
            historyArchivedId: id(11000),
          }
        : {}),
    };
  } finally {
    if (!closed) db.close();
  }
};
