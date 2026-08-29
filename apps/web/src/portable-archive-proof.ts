import { writePortableArchiveV1 } from "@coredrill/storage-core";

const encoder = new TextEncoder();
const DATABASE_BYTES = encoder.encode("SQLite format 3\u0000synthetic portable database\n");
const JOBS_JSON_BYTES = encoder.encode('[{"id":"job-1","title":"Platform Engineer"}]\n');
const JOBS_CSV_BYTES = encoder.encode('id,title\njob-1,"Platform Engineer"\n');
const RESUME_BYTES = encoder.encode("%PDF-1.7\nsynthetic resume attachment\n%%EOF\n");
const NOTES_BYTES = encoder.encode("Interview preparation notes\n");

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

export interface PortableArchiveBrowserProof {
  readonly byteLength: number;
  readonly fileName: string;
  readonly sha256: string;
  readonly entryPaths: readonly string[];
  readonly encryptionMode: "none";
}

/** Runs the same golden archive through the real browser bundle and Web Crypto. */
export const runPortableArchiveWriterProof = async (): Promise<PortableArchiveBrowserProof> => {
  const databaseHash = await sha256(DATABASE_BYTES);
  const resumeHash = await sha256(RESUME_BYTES);
  const notesHash = await sha256(NOTES_BYTES);
  const attachments = new Map([
    [resumeHash, RESUME_BYTES],
    [notesHash, NOTES_BYTES],
  ]);
  const archive = await writePortableArchiveV1({
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
      sha256: databaseHash,
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
        contentId: resumeHash,
        sha256: resumeHash,
        mediaType: "application/pdf",
        byteLength: RESUME_BYTES.byteLength,
        logicalName: "resume.pdf",
      },
      {
        contentId: notesHash,
        sha256: notesHash,
        mediaType: "text/plain",
        byteLength: NOTES_BYTES.byteLength,
        logicalName: "interview-notes.txt",
      },
    ],
    readAttachment: (contentId) => Promise.resolve(attachments.get(contentId)?.slice()),
  });
  return Object.freeze({
    byteLength: archive.byteLength,
    fileName: archive.fileName,
    sha256: archive.sha256,
    entryPaths: Object.freeze([
      "manifest.json",
      archive.manifest.database.path,
      ...archive.manifest.dataFiles.map((entry) => entry.path),
      ...archive.manifest.attachments.map((entry) => entry.path),
    ]),
    encryptionMode: archive.manifest.encryption.mode,
  });
};
