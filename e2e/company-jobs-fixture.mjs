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
export const createCompanyJobsFixture = async (testInfo) => {
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
    };
  } finally {
    if (!closed) db.close();
  }
};
