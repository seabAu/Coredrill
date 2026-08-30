import { createHash } from "node:crypto";

import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  PortableArchiveRestoreError,
  commitPortableArchiveRestoreV1,
  createPortableArchiveContentHashV1,
  createPortableArchiveRestorePreviewV1,
  createPortableRestoreTargetFingerprintV1,
  inspectPortableArchiveV1,
  writePortableArchiveV1,
  type PortableArchiveDatabaseInspectionV1,
  type PortableArchiveRestoreCommitPayloadV1,
  type PortableArchiveRestorePortV1,
  type PortableArchiveRestoreTargetSnapshotV1,
} from "../src/index.js";

const GENERATED_AT = "2026-08-29T23:30:00.000Z";
const VAULT_ID = "0198e102-0000-7000-8000-000000000101";
const OTHER_VAULT_ID = "0198e102-0000-7000-8000-000000000102";
const ARCHIVE_ID = "0198e102-0000-7000-8000-000000000103";
const SCHEMA_VERSION = 92;

const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const emptyTarget = (): PortableArchiveRestoreTargetSnapshotV1 => ({
  state: "empty",
  fingerprint: "empty",
  attachmentContentIds: [],
});

const presentTarget = (
  vaultId: string,
  databaseSha256: string,
  attachmentContentIds: readonly string[] = [],
): PortableArchiveRestoreTargetSnapshotV1 => ({
  state: "present",
  fingerprint: digest(
    new TextEncoder().encode(
      `${vaultId}\n${SCHEMA_VERSION}\n${databaseSha256}\n${[...attachmentContentIds].sort().join("\n")}`,
    ),
  ),
  vaultId,
  schemaVersion: SCHEMA_VERSION,
  databaseSha256,
  attachmentContentIds,
});

const createArchive = async () => {
  const databaseBytes = new TextEncoder().encode("SQLite format 3\u0000restore fixture\n");
  const databaseSha256 = digest(databaseBytes);
  const attachmentBytes = new TextEncoder().encode("synthetic attachment\n");
  const attachmentSha256 = digest(attachmentBytes);
  const dataBytes = new TextEncoder().encode('{"dataset":"job","rows":[]}\n');
  const archive = await writePortableArchiveV1({
    archiveId: ARCHIVE_ID,
    createdAt: GENERATED_AT,
    createdByVersion: "0.0.0",
    vault: {
      id: VAULT_ID,
      schemaVersion: SCHEMA_VERSION,
      migrationHistory: [
        {
          version: SCHEMA_VERSION,
          name: "restore-fixture",
          appliedAt: GENERATED_AT,
          sha256: "a".repeat(64),
        },
      ],
    },
    database: {
      schemaVersion: SCHEMA_VERSION,
      byteLength: databaseBytes.byteLength,
      sha256: databaseSha256,
      bytes: databaseBytes,
    },
    dataFiles: [
      {
        path: "data/job.json",
        mediaType: "application/json",
        format: "json",
        logicalName: "job",
        bytes: dataBytes,
      },
    ],
    attachments: [
      {
        contentId: attachmentSha256,
        sha256: attachmentSha256,
        mediaType: "text/plain",
        byteLength: attachmentBytes.byteLength,
        logicalName: "evidence.txt",
      },
    ],
    readAttachment: async (contentId) =>
      contentId === attachmentSha256 ? attachmentBytes : undefined,
  });
  return { archive, attachmentSha256, databaseSha256 };
};

class FixtureRestorePort implements PortableArchiveRestorePortV1 {
  public commits: PortableArchiveRestoreCommitPayloadV1[] = [];
  public commitFails = false;
  public databaseInspection: PortableArchiveDatabaseInspectionV1 = {
    integrity: "ok",
    schemaVersion: SCHEMA_VERSION,
    vaultId: VAULT_ID,
  };

  public constructor(public target: PortableArchiveRestoreTargetSnapshotV1) {}

  public inspectTarget(): Promise<PortableArchiveRestoreTargetSnapshotV1> {
    return Promise.resolve(this.target);
  }

  public inspectDatabase(): Promise<PortableArchiveDatabaseInspectionV1> {
    return Promise.resolve(this.databaseInspection);
  }

  public commit(payload: PortableArchiveRestoreCommitPayloadV1): Promise<void> {
    if (payload.expectedTargetFingerprint !== this.target.fingerprint) {
      return Promise.reject(new Error("stale fixture target"));
    }
    if (this.commitFails) return Promise.reject(new Error("injected commit failure"));
    this.commits.push(payload);
    this.target = presentTarget(
      payload.vaultId,
      payload.database.sha256,
      payload.attachments.map((entry) => entry.contentId),
    );
    return Promise.resolve();
  }
}

const expectCode = async (
  promise: Promise<unknown>,
  code: PortableArchiveRestoreError["code"],
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    name: "PortableArchiveRestoreError",
    code,
  });
};

const repack = (
  bytes: Uint8Array,
  mutate: (entries: Record<string, Uint8Array>) => void,
): Uint8Array => {
  const entries = unzipSync(bytes) as Record<string, Uint8Array>;
  mutate(entries);
  return zipSync(entries, {
    level: 0,
    mtime: new Date(1980, 0, 1, 0, 0, 0, 0),
    os: 0,
  });
};

describe("portable archive restore", () => {
  it("derives a stable adapter-neutral content hash and sorted target fingerprint", async () => {
    const { archive, attachmentSha256 } = await createArchive();
    const inspected = await inspectPortableArchiveV1({
      bytes: archive.bytes,
      expectedSchemaVersion: SCHEMA_VERSION,
    });
    await expect(createPortableArchiveContentHashV1(inspected)).resolves.toMatchObject({
      specVersion: 1,
      vaultId: VAULT_ID,
      schemaVersion: SCHEMA_VERSION,
      jsonDataFileCount: 1,
      attachmentCount: 1,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    const first = await createPortableRestoreTargetFingerprintV1("a".repeat(64), [
      "c".repeat(64),
      attachmentSha256,
    ]);
    await expect(
      createPortableRestoreTargetFingerprintV1("a".repeat(64), [attachmentSha256, "c".repeat(64)]),
    ).resolves.toBe(first);
    await expect(
      createPortableRestoreTargetFingerprintV1("a".repeat(64), [
        attachmentSha256,
        attachmentSha256,
      ]),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("inspects every entry, previews an empty target, and commits only after confirmation", async () => {
    const { archive, attachmentSha256, databaseSha256 } = await createArchive();
    const inspected = await inspectPortableArchiveV1({
      bytes: archive.bytes,
      expectedSchemaVersion: SCHEMA_VERSION,
      expectedArchiveSha256: archive.sha256,
    });
    expect(inspected).toMatchObject({
      specVersion: 1,
      archiveSha256: archive.sha256,
      byteLength: archive.byteLength,
      database: { schemaVersion: SCHEMA_VERSION, sha256: databaseSha256 },
    });
    expect(inspected.dataFiles.map((entry) => entry.path)).toEqual(["data/job.json"]);
    expect(inspected.attachments.map((entry) => entry.contentId)).toEqual([attachmentSha256]);

    const port = new FixtureRestorePort(emptyTarget());
    const callerArchiveBytes = archive.bytes.slice();
    const preview = await createPortableArchiveRestorePreviewV1({
      archiveBytes: callerArchiveBytes,
      expectedSchemaVersion: SCHEMA_VERSION,
      expectedArchiveSha256: archive.sha256,
      port,
    });
    expect(preview).toMatchObject({
      archive: {
        vaultId: VAULT_ID,
        schemaVersion: SCHEMA_VERSION,
        dataFileCount: 1,
        attachmentCount: 1,
      },
      target: { state: "empty", attachmentCount: 0 },
      conflict: "none",
      requiredConfirmation: "commit",
      changes: {
        database: "create",
        attachmentsAdded: 1,
        attachmentsReused: 0,
        attachmentsRemoved: 0,
      },
    });
    expect(port.commits).toHaveLength(0);
    callerArchiveBytes.fill(0);

    const result = await commitPortableArchiveRestoreV1({ preview, confirmation: "commit" });
    expect(result).toMatchObject({
      committed: true,
      vaultId: VAULT_ID,
      schemaVersion: SCHEMA_VERSION,
      databaseSha256,
      attachmentCount: 1,
    });
    expect(port.commits).toHaveLength(1);
    await expectCode(
      commitPortableArchiveRestoreV1({ preview, confirmation: "commit" }),
      "invalid_input",
    );
  });

  it("distinguishes identical, same-vault, and different-vault overwrite conflicts", async () => {
    const { archive, attachmentSha256, databaseSha256 } = await createArchive();
    const identical = await createPortableArchiveRestorePreviewV1({
      archiveBytes: archive.bytes,
      expectedSchemaVersion: SCHEMA_VERSION,
      port: new FixtureRestorePort(presentTarget(VAULT_ID, databaseSha256, [attachmentSha256])),
    });
    expect(identical).toMatchObject({
      conflict: "identical",
      requiredConfirmation: "commit",
      changes: {
        database: "unchanged",
        attachmentsAdded: 0,
        attachmentsReused: 1,
        attachmentsRemoved: 0,
      },
    });

    const samePort = new FixtureRestorePort(
      presentTarget(VAULT_ID, "b".repeat(64), ["c".repeat(64)]),
    );
    const same = await createPortableArchiveRestorePreviewV1({
      archiveBytes: archive.bytes,
      expectedSchemaVersion: SCHEMA_VERSION,
      port: samePort,
    });
    expect(same).toMatchObject({
      conflict: "same_vault_replace",
      requiredConfirmation: "replace_same_vault",
      changes: {
        database: "replace",
        attachmentsAdded: 1,
        attachmentsReused: 0,
        attachmentsRemoved: 1,
      },
    });
    await expectCode(
      commitPortableArchiveRestoreV1({ preview: same, confirmation: "commit" }),
      "invalid_input",
    );

    const different = await createPortableArchiveRestorePreviewV1({
      archiveBytes: archive.bytes,
      expectedSchemaVersion: SCHEMA_VERSION,
      port: new FixtureRestorePort(presentTarget(OTHER_VAULT_ID, "d".repeat(64))),
    });
    expect(different).toMatchObject({
      conflict: "different_vault_replace",
      requiredConfirmation: "replace_different_vault",
    });
  });

  it("rejects a target changed after preview before invoking commit", async () => {
    const { archive } = await createArchive();
    const port = new FixtureRestorePort(presentTarget(VAULT_ID, "b".repeat(64)));
    const preview = await createPortableArchiveRestorePreviewV1({
      archiveBytes: archive.bytes,
      expectedSchemaVersion: SCHEMA_VERSION,
      port,
    });
    port.target = presentTarget(VAULT_ID, "c".repeat(64));
    await expectCode(
      commitPortableArchiveRestoreV1({
        preview,
        confirmation: "replace_same_vault",
      }),
      "stale_target",
    );
    expect(port.commits).toHaveLength(0);
  });

  it("surfaces atomic commit failure without consuming the validated preview", async () => {
    const { archive } = await createArchive();
    const original = presentTarget(VAULT_ID, "b".repeat(64));
    const port = new FixtureRestorePort(original);
    port.commitFails = true;
    const preview = await createPortableArchiveRestorePreviewV1({
      archiveBytes: archive.bytes,
      expectedSchemaVersion: SCHEMA_VERSION,
      port,
    });
    await expectCode(
      commitPortableArchiveRestoreV1({
        preview,
        confirmation: "replace_same_vault",
      }),
      "commit_failed",
    );
    expect(port.target).toEqual(original);
    expect(port.commits).toHaveLength(0);

    port.commitFails = false;
    await expect(
      commitPortableArchiveRestoreV1({
        preview,
        confirmation: "replace_same_vault",
      }),
    ).resolves.toMatchObject({ committed: true });
  });

  it("rejects corrupt, checksum-mismatched, unexpected, and unsupported archives", async () => {
    const { archive } = await createArchive();
    const wrongArchiveSha = `${archive.sha256.startsWith("0") ? "1" : "0"}${archive.sha256.slice(1)}`;
    await expectCode(
      inspectPortableArchiveV1({
        bytes: archive.bytes,
        expectedSchemaVersion: SCHEMA_VERSION,
        expectedArchiveSha256: wrongArchiveSha,
      }),
      "checksum_mismatch",
    );

    const corrupt = archive.bytes.slice(0, 40);
    await expectCode(
      inspectPortableArchiveV1({ bytes: corrupt, expectedSchemaVersion: SCHEMA_VERSION }),
      "archive_corrupt",
    );

    const checksumMismatch = repack(archive.bytes, (entries) => {
      const database = entries["database.sqlite3"];
      if (database === undefined) throw new Error("Missing fixture database.");
      database[database.byteLength - 1] = (database[database.byteLength - 1] ?? 0) ^ 1;
    });
    await expectCode(
      inspectPortableArchiveV1({
        bytes: checksumMismatch,
        expectedSchemaVersion: SCHEMA_VERSION,
      }),
      "checksum_mismatch",
    );

    const unexpected = repack(archive.bytes, (entries) => {
      entries["unexpected.txt"] = new TextEncoder().encode("not in manifest");
    });
    await expectCode(
      inspectPortableArchiveV1({ bytes: unexpected, expectedSchemaVersion: SCHEMA_VERSION }),
      "unsafe_archive",
    );

    const unsupported = repack(archive.bytes, (entries) => {
      const manifest = entries["manifest.json"];
      if (manifest === undefined) throw new Error("Missing fixture manifest.");
      const value = JSON.parse(new TextDecoder().decode(manifest)) as Record<string, unknown>;
      value["specVersion"] = 2;
      entries["manifest.json"] = new TextEncoder().encode(`${JSON.stringify(value)}\n`);
    });
    await expectCode(
      inspectPortableArchiveV1({ bytes: unsupported, expectedSchemaVersion: SCHEMA_VERSION }),
      "version_unsupported",
    );
  });

  it("rejects unsupported schema and a database that disagrees with its manifest", async () => {
    const { archive } = await createArchive();
    await expectCode(
      inspectPortableArchiveV1({ bytes: archive.bytes, expectedSchemaVersion: 93 }),
      "schema_mismatch",
    );

    const port = new FixtureRestorePort(emptyTarget());
    port.databaseInspection = {
      integrity: "ok",
      schemaVersion: SCHEMA_VERSION,
      vaultId: OTHER_VAULT_ID,
    };
    await expectCode(
      createPortableArchiveRestorePreviewV1({
        archiveBytes: archive.bytes,
        expectedSchemaVersion: SCHEMA_VERSION,
        port,
      }),
      "database_invalid",
    );
  });

  it("rejects malformed adapter inspection results at the restore trust boundary", async () => {
    const { archive } = await createArchive();
    const invalidDatabasePort = new FixtureRestorePort(emptyTarget());
    invalidDatabasePort.databaseInspection =
      undefined as unknown as PortableArchiveDatabaseInspectionV1;
    await expectCode(
      createPortableArchiveRestorePreviewV1({
        archiveBytes: archive.bytes,
        expectedSchemaVersion: SCHEMA_VERSION,
        port: invalidDatabasePort,
      }),
      "database_invalid",
    );

    const invalidTargetPort = new FixtureRestorePort({
      state: "present",
      fingerprint: "not-a-checksum",
      vaultId: VAULT_ID,
      schemaVersion: SCHEMA_VERSION,
      databaseSha256: "b".repeat(64),
      attachmentContentIds: [],
    } as unknown as PortableArchiveRestoreTargetSnapshotV1);
    await expectCode(
      createPortableArchiveRestorePreviewV1({
        archiveBytes: archive.bytes,
        expectedSchemaVersion: SCHEMA_VERSION,
        port: invalidTargetPort,
      }),
      "invalid_input",
    );
  });
});
