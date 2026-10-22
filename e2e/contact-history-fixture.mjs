import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createPortableDataExportV1,
  inspectPortableArchiveV1,
  writePortableArchiveV1,
} from "../packages/storage-core/dist/index.js";

/** Test-output-only synthetic archive; never mutates the preserved recovery fixture or app APIs. */
export const createContactHistoryFixture = async (testInfo) => {
  const original = await inspectPortableArchiveV1({
    bytes: new Uint8Array(
      await readFile(path.resolve("fixtures/recovery/phase-1-vault-schema-165-v1.coredrill.zip")),
    ),
    expectedSchemaVersion: 165,
  });
  const file = testInfo.outputPath("synthetic-contact-history.sqlite");
  await writeFile(file, original.database.bytes);
  const connection = new DatabaseSync(file);
  connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  const id = (n) => `0198e110-0000-7000-8000-${String(n).padStart(12, "0")}`;
  const at = "2026-10-22T04:00:00.000Z";
  const body =
    "\uFEFF" + "a".repeat(1_020) + "😀\0<script>literal</script>\n" + "尾\n".repeat(5_000);
  let closed = false;
  try {
    const contact = connection
      .prepare("SELECT id,name,company_id FROM contact ORDER BY id LIMIT 1")
      .get();
    const job = connection
      .prepare("SELECT id FROM job WHERE archived_at IS NULL ORDER BY id LIMIT 1")
      .get();
    if (contact === undefined || job === undefined)
      throw new Error("Synthetic recovery prerequisites missing.");
    connection
      .prepare("INSERT INTO contact(id,company_id,name,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run(id(6), contact.company_id, "Unrelated synthetic history contact", at, at);
    connection
      .prepare(
        "INSERT INTO job(id,company_id,title,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .run(id(8), contact.company_id, "Synthetic archived history job", at, at, at);
    const insert = connection.prepare(
      "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    );
    for (let n = 100; n < 127; n += 1)
      insert.run(
        id(n),
        job.id,
        contact.id,
        "meeting",
        at,
        "mutual",
        n === 100 ? body : n === 101 ? "" : `Synthetic interaction ${String(n)}`,
        at,
        at,
      );
    insert.run(id(127), job.id, id(6), "meeting", at, "mutual", "UNRELATED_CONTACT_ONLY", at, at);
    insert.run(id(128), job.id, null, "meeting", at, "mutual", "UNLINKED_CONTACT_ONLY", at, at);
    insert.run(id(129), id(8), contact.id, "meeting", at, "mutual", "ARCHIVED_JOB_ONLY", at, at);
    const future = "2027-01-01T00:00:00.000Z";
    insert.run(
      id(130),
      job.id,
      contact.id,
      "meeting",
      future,
      "mutual",
      "Future imported history record",
      future,
      future,
    );
    const session = {
      query: async (statement) => connection.prepare(statement.sql).all(...statement.parameters),
    };
    const data = await createPortableDataExportV1({
      database: {
        transaction: async (work) => {
          connection.exec("BEGIN IMMEDIATE");
          try {
            const value = await work(session);
            connection.exec("COMMIT");
            return value;
          } catch (error) {
            connection.exec("ROLLBACK");
            throw error;
          }
        },
      },
      vaultId: original.manifest.vault.id,
      generatedAt: at,
    });
    connection.close();
    closed = true;
    const bytes = new Uint8Array(await readFile(file));
    const archive = await writePortableArchiveV1({
      archiveId: id(50),
      createdAt: at,
      createdByVersion: "0.0.0",
      vault: original.manifest.vault,
      database: {
        bytes,
        byteLength: bytes.length,
        schemaVersion: 165,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
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
    return {
      bytes: archive.bytes,
      contactId: contact.id,
      contactName: contact.name,
      companyId: contact.company_id,
      otherContactId: id(6),
      longInteractionId: id(100),
      body,
      archiveSha256: archive.sha256,
    };
  } finally {
    if (!closed) connection.close();
  }
};
