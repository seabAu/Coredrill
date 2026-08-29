import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { portableArchiveManifestV1Schema } from "@coredrill/contracts";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  PORTABLE_ARCHIVE_MANIFEST_PATH,
  PortableArchiveWriterError,
  writePortableArchiveV1,
  type PortableArchiveWriterInputV1,
} from "../src/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DATABASE_BYTES = encoder.encode("SQLite format 3\u0000synthetic portable database\n");
const JOBS_JSON_BYTES = encoder.encode('[{"id":"job-1","title":"Platform Engineer"}]\n');
const JOBS_CSV_BYTES = encoder.encode('id,title\njob-1,"Platform Engineer"\n');
const RESUME_BYTES = encoder.encode("%PDF-1.7\nsynthetic resume attachment\n%%EOF\n");
const NOTES_BYTES = encoder.encode("Interview preparation notes\n");

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const RESUME_HASH = hash(RESUME_BYTES);
const NOTES_HASH = hash(NOTES_BYTES);
const GOLDEN_ARCHIVE_BASE64 = readFileSync(
  new URL("./fixtures/portable-archive-v1.coredrill.zip.base64", import.meta.url),
  "utf8",
).trim();

const createInput = (): PortableArchiveWriterInputV1 => ({
  archiveId: "019539af-8a01-7dd4-8b54-395d8f3fe501",
  createdAt: "2026-08-29T21:00:00.000Z",
  createdByVersion: "0.1.0",
  vault: {
    id: "019539af-8a02-7dd4-8b54-395d8f3fe502",
    schemaVersion: 2,
    migrationHistory: [
      {
        version: 1,
        name: "initialize_vault",
        appliedAt: "2026-08-20T12:00:00.000Z",
        sha256: "e".repeat(64),
      },
      {
        version: 2,
        name: "add_job_sources",
        appliedAt: "2026-08-22T12:00:00.000Z",
        sha256: "f".repeat(64),
      },
    ],
  },
  database: {
    schemaVersion: 2,
    byteLength: DATABASE_BYTES.byteLength,
    sha256: hash(DATABASE_BYTES),
    bytes: DATABASE_BYTES,
  },
  dataFiles: [
    {
      path: "data/jobs.json",
      mediaType: "application/json",
      format: "json",
      logicalName: "jobs",
      bytes: JOBS_JSON_BYTES,
    },
    {
      path: "data/jobs.csv",
      mediaType: "text/csv",
      format: "csv",
      logicalName: "jobs",
      bytes: JOBS_CSV_BYTES,
    },
  ],
  attachments: [
    {
      contentId: RESUME_HASH,
      sha256: RESUME_HASH,
      mediaType: "application/pdf",
      byteLength: RESUME_BYTES.byteLength,
      logicalName: "resume.pdf",
    },
    {
      contentId: NOTES_HASH,
      sha256: NOTES_HASH,
      mediaType: "text/plain",
      byteLength: NOTES_BYTES.byteLength,
      logicalName: "interview-notes.txt",
    },
  ],
  readAttachment: async (contentId) => {
    if (contentId === RESUME_HASH) return RESUME_BYTES;
    if (contentId === NOTES_HASH) return NOTES_BYTES;
    return undefined;
  },
});

const expectWriterCode = async (
  promise: Promise<unknown>,
  code: PortableArchiveWriterError["code"],
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    name: "PortableArchiveWriterError",
    code,
  });
};

describe("writePortableArchiveV1", () => {
  it("writes the complete deterministic golden ZIP and validated manifest", async () => {
    const archive = await writePortableArchiveV1(createInput());
    const files = unzipSync(archive.bytes);
    const manifestBytes = files[PORTABLE_ARCHIVE_MANIFEST_PATH];
    expect(manifestBytes).toBeDefined();
    const manifest = portableArchiveManifestV1Schema.parse(
      JSON.parse(decoder.decode(manifestBytes)),
    );

    expect(archive).toMatchObject({
      containerVersion: 1,
      mediaType: "application/zip",
      fileName: "coredrill-20260829-019539af-8a01-7dd4-8b54-395d8f3fe501.coredrill.zip",
      byteLength: 3533,
      sha256: "47b18f1854ae6a608cffb4753895afc0fead06f3399818326e61142579a5fcde",
    });
    expect(archive.byteLength).toBe(archive.bytes.byteLength);
    expect(Buffer.from(archive.bytes).toString("base64")).toBe(GOLDEN_ARCHIVE_BASE64);
    expect(archive.manifest).toEqual(manifest);
    expect(Object.keys(files)).toEqual([
      "manifest.json",
      "database.sqlite3",
      "data/jobs.csv",
      "data/jobs.json",
      `attachments/${RESUME_HASH.slice(0, 2)}/${RESUME_HASH}`,
      `attachments/${NOTES_HASH.slice(0, 2)}/${NOTES_HASH}`,
    ]);
    expect(files["database.sqlite3"]).toEqual(DATABASE_BYTES);
    expect(files["data/jobs.json"]).toEqual(JOBS_JSON_BYTES);
    expect(files["data/jobs.csv"]).toEqual(JOBS_CSV_BYTES);
    expect(manifest.database).toMatchObject({
      byteLength: DATABASE_BYTES.byteLength,
      sha256: hash(DATABASE_BYTES),
    });
    expect(manifest.attachments.map((entry) => entry.contentId)).toEqual(
      [NOTES_HASH, RESUME_HASH].sort(),
    );
    for (const entry of [manifest.database, ...manifest.dataFiles, ...manifest.attachments]) {
      const bytes = files[entry.path];
      expect(bytes).toBeDefined();
      expect(bytes?.byteLength).toBe(entry.byteLength);
      expect(hash(bytes ?? new Uint8Array())).toBe(entry.sha256);
    }
    expect(manifest.encryption).toEqual({ specVersion: 1, mode: "none" });
  });

  it("normalizes input order and never aliases caller-owned bytes", async () => {
    const firstInput = createInput();
    const first = await writePortableArchiveV1(firstInput);
    const frozenOutput = first.bytes.slice();

    DATABASE_BYTES.fill(0, 0, 1);
    JOBS_JSON_BYTES.fill(0, 0, 1);
    expect(first.bytes).toEqual(frozenOutput);
    DATABASE_BYTES.set(encoder.encode("S"), 0);
    JOBS_JSON_BYTES.set(encoder.encode("["), 0);

    const secondInput = createInput();
    const second = await writePortableArchiveV1({
      ...secondInput,
      dataFiles: [...secondInput.dataFiles].reverse(),
      attachments: [...secondInput.attachments].reverse(),
      readAttachment: async (contentId) => {
        const bytes = await secondInput.readAttachment(contentId);
        return bytes?.slice();
      },
    });
    expect(second.bytes).toEqual(first.bytes);
    expect(second.sha256).toBe(first.sha256);
  });

  it("fails closed when an expected attachment is missing or unreadable", async () => {
    const missing = createInput();
    await expectWriterCode(
      writePortableArchiveV1({ ...missing, readAttachment: async () => undefined }),
      "attachment_missing",
    );

    const unreadable = createInput();
    await expectWriterCode(
      writePortableArchiveV1({
        ...unreadable,
        readAttachment: () => Promise.reject(new Error("sensitive local path")),
      }),
      "attachment_read_failed",
    );
  });

  it("rejects corrupt database and attachment bytes before emitting an archive", async () => {
    const corruptDatabase = createInput();
    await expectWriterCode(
      writePortableArchiveV1({
        ...corruptDatabase,
        database: { ...corruptDatabase.database, sha256: "a".repeat(64) },
      }),
      "database_integrity_mismatch",
    );

    const corruptAttachment = createInput();
    await expectWriterCode(
      writePortableArchiveV1({
        ...corruptAttachment,
        readAttachment: async (contentId) =>
          contentId === NOTES_HASH ? encoder.encode("corrupt") : RESUME_BYTES,
      }),
      "attachment_integrity_mismatch",
    );
  });

  it("rejects unsafe layout, duplicate attachment IDs, and schema drift", async () => {
    const unsafeLayout = createInput();
    const firstData = unsafeLayout.dataFiles[0];
    if (firstData === undefined) throw new Error("Expected a data file fixture.");
    await expectWriterCode(
      writePortableArchiveV1({
        ...unsafeLayout,
        dataFiles: [{ ...firstData, path: "manifest.json" }],
      }),
      "invalid_input",
    );

    const duplicate = createInput();
    const firstAttachment = duplicate.attachments[0];
    if (firstAttachment === undefined) throw new Error("Expected an attachment fixture.");
    await expectWriterCode(
      writePortableArchiveV1({
        ...duplicate,
        attachments: [firstAttachment, firstAttachment],
      }),
      "invalid_input",
    );

    const schemaDrift = createInput();
    await expectWriterCode(
      writePortableArchiveV1({
        ...schemaDrift,
        vault: { ...schemaDrift.vault, schemaVersion: 3 },
      }),
      "database_integrity_mismatch",
    );
  });

  it("preflights aggregate payload limits before copying or hashing entries", async () => {
    const input = createInput();
    const sharedFiveMiB = new Uint8Array(5 * 1024 * 1024);
    await expectWriterCode(
      writePortableArchiveV1({
        ...input,
        dataFiles: Array.from({ length: 103 }, (_, index) => ({
          path: `data/part-${String(index).padStart(3, "0")}.json`,
          mediaType: "application/json",
          format: "json" as const,
          logicalName: `part_${String(index).padStart(3, "0")}`,
          bytes: sharedFiveMiB,
        })),
        attachments: [],
      }),
      "payload_too_large",
    );
  });
});
