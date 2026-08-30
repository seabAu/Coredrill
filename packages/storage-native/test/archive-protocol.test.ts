import { describe, expect, it } from "vitest";

import {
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  NativeStorageProtocolError,
  openNativeSqliteDatabase,
  parseNativeArchiveResponse,
  type NativeArchiveRequest,
  type NativeStorageRequest,
} from "../src/index.js";

const metadata = Object.freeze({
  formatVersion: 1,
  schemaVersion: 1,
  databaseBytes: 32_768,
  sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
});

const backupMetadata = Object.freeze({
  createdAtUnixMs: 1_788_000_000_000,
  retentionCount: 7,
  knownGoodBackups: 7,
  prunedBackups: 1,
  cleanupPending: false,
  archive: metadata,
});

describe("native recovery archive protocol", () => {
  it("accepts only versioned, checksummed metadata without a filesystem path", () => {
    const response = parseNativeArchiveResponse(
      {
        protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
        requestId: "native-archive-1",
        data: { type: "exported", archive: metadata },
      },
      "native-archive-1",
    );

    expect(response).toEqual({
      protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
      requestId: "native-archive-1",
      data: { type: "exported", archive: metadata },
    });
    expect(JSON.stringify(response)).not.toContain("path");
  });

  it("routes picker recovery and pickerless backup without path parameters", async () => {
    const archiveRequests: NativeArchiveRequest[] = [];
    const transport = {
      invoke: async (request: NativeStorageRequest) => ({
        protocolVersion: 1,
        requestId: request.requestId,
        data: { type: "opened", sessionId: "native-session-1" },
      }),
      invokeArchive: async (request: NativeArchiveRequest) => {
        archiveRequests.push(request);
        switch (request.operation.type) {
          case "export":
            return {
              protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
              requestId: request.requestId,
              data: { type: "exported", archive: metadata },
            };
          case "restore":
            return {
              protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
              requestId: request.requestId,
              data: { type: "cancelled", operation: "restore" },
            };
          case "automatic_backup":
            return {
              protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
              requestId: request.requestId,
              data: { type: "backup_created", backup: backupMetadata },
            };
          default:
            throw new Error("Unexpected portable operation in the picker protocol test.");
        }
      },
    };
    const database = await openNativeSqliteDatabase({
      databaseName: "archive-test.sqlite3",
      transport,
    });

    await expect(database.exportRecoveryArchive()).resolves.toEqual({
      status: "completed",
      archive: metadata,
    });
    await expect(database.restoreRecoveryArchive()).resolves.toEqual({ status: "cancelled" });
    await expect(database.createAutomaticBackup(7)).resolves.toEqual(backupMetadata);
    expect(archiveRequests.map(({ operation }) => operation)).toEqual([
      { type: "export", sessionId: "native-session-1" },
      { type: "restore", sessionId: "native-session-1" },
      { type: "automatic_backup", sessionId: "native-session-1", retentionCount: 7 },
    ]);
    expect(JSON.stringify(archiveRequests)).not.toContain("path");
  });

  it("rejects unsafe automatic-backup retention before crossing the transport", async () => {
    let archiveCalls = 0;
    const transport = {
      invoke: async (request: NativeStorageRequest) => ({
        protocolVersion: 1,
        requestId: request.requestId,
        data: { type: "opened", sessionId: "native-session-1" },
      }),
      invokeArchive: async () => {
        archiveCalls += 1;
        return undefined;
      },
    };
    const database = await openNativeSqliteDatabase({
      databaseName: "archive-test.sqlite3",
      transport,
    });

    for (const retentionCount of [0, 1.5, 91, Number.NaN]) {
      await expect(database.createAutomaticBackup(retentionCount)).rejects.toMatchObject({
        code: "invalid_request",
      });
    }
    expect(archiveCalls).toBe(0);
  });

  it("accepts only bounded path-free automatic-backup metadata", () => {
    const response = parseNativeArchiveResponse(
      {
        protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
        requestId: "native-archive-1",
        data: { type: "backup_created", backup: backupMetadata },
      },
      "native-archive-1",
    );

    expect(response.data).toEqual({ type: "backup_created", backup: backupMetadata });
    expect(JSON.stringify(response)).not.toContain("path");
  });

  it("accepts bounded portable database, target, attachment, and commit responses", () => {
    const digest = "a".repeat(64);
    const portableResponses = [
      {
        type: "portable_database",
        database: { schemaVersion: 92, byteLength: 3, sha256: digest, bytes: [1, 2, 3] },
      },
      {
        type: "portable_inspection",
        integrity: "ok",
        schemaVersion: 92,
        vaultId: "0198d9d4-0000-7000-8000-0000000000ff",
      },
      {
        type: "portable_target",
        target: { state: "empty", fingerprint: digest, attachmentContentIds: [] },
      },
      {
        type: "attachment_data",
        contentId: digest,
        byteLength: 3,
        sha256: digest,
        bytes: [1, 2, 3],
      },
      { type: "attachment_missing", contentId: digest },
      { type: "portable_committed", databaseSha256: digest, attachmentCount: 1 },
    ];
    for (const data of portableResponses) {
      expect(
        parseNativeArchiveResponse(
          {
            protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
            requestId: "native-archive-1",
            data,
          },
          "native-archive-1",
        ).data,
      ).toEqual(data);
    }
  });

  it("closes the adapter after an unrecoverable native restore failure", async () => {
    let archiveCalls = 0;
    const transport = {
      invoke: async (request: NativeStorageRequest) => ({
        protocolVersion: 1,
        requestId: request.requestId,
        data: { type: "opened", sessionId: "native-session-1" },
      }),
      invokeArchive: async () => {
        archiveCalls += 1;
        throw {
          code: "archive_recovery_failed",
          message: "Native database recovery failed and the session was closed.",
          retryable: false,
        };
      },
    };
    const database = await openNativeSqliteDatabase({
      databaseName: "archive-test.sqlite3",
      transport,
    });

    await expect(database.restoreRecoveryArchive()).rejects.toMatchObject({
      code: "archive_recovery_failed",
    });
    await expect(database.exportRecoveryArchive()).rejects.toMatchObject({
      code: "session_closed",
    });
    expect(archiveCalls).toBe(1);
  });

  it.each([
    {
      label: "wrong request",
      requestId: "native-archive-other",
      data: { type: "exported", archive: metadata },
    },
    {
      label: "invalid digest",
      requestId: "native-archive-1",
      data: { type: "exported", archive: { ...metadata, sha256: "not-a-digest" } },
    },
    {
      label: "unknown format",
      requestId: "native-archive-1",
      data: { type: "exported", archive: { ...metadata, formatVersion: 2 } },
    },
    {
      label: "unsafe byte count",
      requestId: "native-archive-1",
      data: { type: "restored", archive: { ...metadata, databaseBytes: Number.MAX_VALUE } },
    },
    {
      label: "unknown operation",
      requestId: "native-archive-1",
      data: { type: "cancelled", operation: "delete" },
    },
    {
      label: "zero known-good backups",
      requestId: "native-archive-1",
      data: {
        type: "backup_created",
        backup: { ...backupMetadata, knownGoodBackups: 0 },
      },
    },
    {
      label: "unbounded backup retention",
      requestId: "native-archive-1",
      data: {
        type: "backup_created",
        backup: { ...backupMetadata, retentionCount: 91 },
      },
    },
    {
      label: "invalid cleanup state",
      requestId: "native-archive-1",
      data: {
        type: "backup_created",
        backup: { ...backupMetadata, cleanupPending: "no" },
      },
    },
  ])("rejects $label responses", ({ requestId, data }) => {
    expect(() =>
      parseNativeArchiveResponse(
        { protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION, requestId, data },
        "native-archive-1",
      ),
    ).toThrow(NativeStorageProtocolError);
  });
});
