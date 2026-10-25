import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createPortableDataExportV1,
  inspectPortableArchiveV1,
  writePortableArchiveV1,
} from "../packages/storage-core/dist/index.js";

/** Synthetic test-output archive only; no installer/API shortcut or acquisition/rights claim. */
export const createContactEvidenceFixture = async (testInfo, { profileUrl = null } = {}) => {
  const originalPath = path.resolve("fixtures/recovery/phase-1-vault-schema-165-v1.coredrill.zip");
  const originalBytes = await readFile(originalPath);
  const original = await inspectPortableArchiveV1({
    bytes: new Uint8Array(originalBytes),
    expectedSchemaVersion: 165,
  });
  const file = testInfo.outputPath("synthetic-contact-evidence.sqlite");
  await writeFile(file, original.database.bytes);
  const connection = new DatabaseSync(file);
  connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  const id = (n) => `0198e112-0000-7000-8000-${String(n).padStart(12, "0")}`;
  const at = "2026-10-24T04:00:00.000Z";
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  const email = "synthetic-evidence@synthetic.example";
  const excerpt =
    "\uFEFF🧭\0<script>globalThis.__contactEvidenceExecuted=1</script><img src=https://synthetic.example/pixel> retained literal";
  const longExcerpt = "\uFEFF" + "長".repeat(3_900) + "😀\0<script>inert</script>尾";
  let closed = false;
  try {
    const job = connection
      .prepare(
        "SELECT id,company_id FROM job WHERE archived_at IS NULL AND company_id IS NOT NULL ORDER BY id LIMIT 1",
      )
      .get();
    if (job === undefined) throw new Error("Synthetic source job prerequisite missing.");
    for (const [n, name, value] of [
      [2, "Synthetic evidence review contact", email],
      [3, "Other synthetic evidence contact", "other-evidence@synthetic.example"],
    ])
      connection
        .prepare(
          "INSERT INTO contact(id,company_id,name,email,public_profile_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(id(n), job.company_id, name, value, n === 2 ? profileUrl : null, at, at);
    connection
      .prepare(
        "INSERT INTO contact(id,company_id,name,email,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id(5),
        job.company_id,
        "Archived synthetic evidence contact",
        "archived-evidence@synthetic.example",
        at,
        at,
        at,
      );
    // An explicit synthetic archived job in the restored test archive, not a hidden product job.
    connection
      .prepare(
        "INSERT INTO job(id,company_id,title,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .run(id(4), job.company_id, "Synthetic archived evidence source role", at, at, at);
    for (const [source, snapshot, linkedJob, url] of [
      [10, 11, job.id, "https://synthetic.example/evidence/current-metadata"],
      [20, 21, id(4), null],
    ]) {
      connection
        .prepare(
          "INSERT INTO job_source(id,job_id,canonical_url,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(id(source), linkedJob, url, at, at, at, at);
      connection
        .prepare(
          "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,content_hash,retention_class,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          id(snapshot),
          id(source),
          at,
          "synthetic-evidence-fixture",
          "1",
          hash(`Synthetic retained source ${snapshot}`),
          "synthetic-test-only",
          at,
        );
    }
    const add = (n, contact, field, value, text, note, snapshot = 11) => {
      connection
        .prepare(
          "INSERT INTO provenance(id,source_snapshot_id,extraction_method,source_pointer,source_excerpt,confidence,captured_at,license_note,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id(n + 1000),
          id(snapshot),
          n === 101 ? "llm" : "selector",
          `/synthetic/${field}/${n}`,
          text,
          0.8,
          at,
          note,
          at,
        );
      connection
        .prepare(
          "INSERT INTO contact_point_provenance(id,contact_id,field_name,value_hash,provenance_id,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(id(n), id(contact), field, hash(value), id(n + 1000), at);
    };
    for (let n = 100; n < 107; n += 1)
      add(
        n,
        2,
        "email",
        n === 101 ? "past-evidence@synthetic.example" : email,
        n === 100
          ? excerpt
          : n === 103
            ? null
            : n === 104
              ? ""
              : n === 105
                ? longExcerpt
                : `ACTIVE_EVIDENCE_${n}`,
        n === 103
          ? null
          : n === 104
            ? ""
            : "UNTRUSTED public/licensed assertion — not a rights decision",
      );
    add(110, 2, "email", email, "ARCHIVED_SOURCE_EVIDENCE_ONLY", null, 21);
    add(120, 2, "role", "Past synthetic role", null, "");
    add(200, 3, "email", "other-evidence@synthetic.example", "OTHER_CONTACT_EVIDENCE_ONLY", null);
    add(
      210,
      5,
      "email",
      "archived-evidence@synthetic.example",
      "ARCHIVED_CONTACT_EVIDENCE_ONLY",
      null,
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
      throw new Error("Preserved synthetic recovery fixture changed.");
    return {
      originalRecoveryFixtureUnchanged: true,
      bytes: archive.bytes,
      contactId: id(2),
      contactName: "Synthetic evidence review contact",
      otherContactId: id(3),
      archivedContactId: id(5),
      companyId: job.company_id,
      firstEvidenceId: id(100),
      excerpt,
      longEvidenceId: id(105),
      longExcerpt,
      archiveSha256: archive.sha256,
    };
  } finally {
    if (!closed) connection.close();
  }
};
