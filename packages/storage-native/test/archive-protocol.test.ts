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
      protocolVersion: 1,
      requestId: "native-archive-1",
      data: { type: "exported", archive: metadata },
    });
    expect(JSON.stringify(response)).not.toContain("path");
  });

  it("routes export and restore through a picker-owned command without path parameters", async () => {
    const archiveRequests: NativeArchiveRequest[] = [];
    const transport = {
      invoke: async (request: NativeStorageRequest) => ({
        protocolVersion: 1,
        requestId: request.requestId,
        data: { type: "opened", sessionId: "native-session-1" },
      }),
      invokeArchive: async (request: NativeArchiveRequest) => {
        archiveRequests.push(request);
        return request.operation.type === "export"
          ? {
              protocolVersion: 1,
              requestId: request.requestId,
              data: { type: "exported", archive: metadata },
            }
          : {
              protocolVersion: 1,
              requestId: request.requestId,
              data: { type: "cancelled", operation: "restore" },
            };
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
    expect(archiveRequests.map(({ operation }) => operation)).toEqual([
      { type: "export", sessionId: "native-session-1" },
      { type: "restore", sessionId: "native-session-1" },
    ]);
    expect(JSON.stringify(archiveRequests)).not.toContain("path");
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
  ])("rejects $label responses", ({ requestId, data }) => {
    expect(() =>
      parseNativeArchiveResponse(
        { protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION, requestId, data },
        "native-archive-1",
      ),
    ).toThrow(NativeStorageProtocolError);
  });
});
