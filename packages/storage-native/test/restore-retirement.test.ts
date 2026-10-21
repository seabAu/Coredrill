import { describe, expect, it, vi } from "vitest";
import { sqlStatement, type PortableArchiveRestoreCommitPayloadV1 } from "@coredrill/storage-core";
import {
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  openNativeSqliteDatabase,
  type NativeArchiveRequest,
  type NativeStorageRequest,
} from "../src/index.js";

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const payload: PortableArchiveRestoreCommitPayloadV1 = {
  specVersion: 1,
  archiveSha256: "a".repeat(64),
  expectedTargetFingerprint: "b".repeat(64),
  vaultId: "0198e102-0000-7000-8000-000000000001",
  database: {
    bytes: new Uint8Array([1, 2, 3]),
    byteLength: 3,
    schemaVersion: 1,
    sha256: "c".repeat(64),
  },
  attachments: [],
};
const setup = async (failed: boolean, closeFailed = false) => {
  const gate = deferred();
  const archive: NativeArchiveRequest[] = [];
  const requests: NativeStorageRequest[] = [];
  const database = await openNativeSqliteDatabase({
    databaseName: "restore-retire.sqlite3",
    transport: {
      invoke: async (request) => {
        requests.push(request);
        if (closeFailed && request.operation.type === "close")
          throw new Error("Synthetic close failure");
        return {
          protocolVersion: 1,
          requestId: request.requestId,
          data:
            request.operation.type === "open"
              ? { type: "opened", sessionId: "native-session-1" }
              : request.operation.type === "close"
                ? { type: "closed" }
                : { type: "executed", rowsAffected: 1, lastInsertRowId: "1" },
        };
      },
    },
    archiveTransport: {
      invokeArchive: async (request) => {
        archive.push(request);
        await gate.promise;
        if (failed) throw new Error("Synthetic uncertain archive acknowledgement");
        return {
          protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
          requestId: request.requestId,
          data: {
            type: "portable_committed",
            databaseSha256: payload.database.sha256,
            attachmentCount: 0,
          },
        };
      },
    },
  });
  return { database, gate, archive, requests };
};
describe("normal native restore retirement inside the held queue slot", () => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
  ])(
    "blocks queued old writes for archive failure=%s / close failure=%s",
    async (failed, closeFailed) => {
      const { database, gate, archive, requests } = await setup(failed, closeFailed);
      const options = { retireAfterRestore: true };
      const restoring = database.commitPortableRestore(payload, options);
      options.retireAfterRestore = false;
      const observed = Promise.allSettled([restoring]);
      await vi.waitFor(() => expect(archive).toHaveLength(1));
      const queued = Promise.allSettled([
        database.execute(sqlStatement("UPDATE fixture SET value = 1")),
        database.query(sqlStatement("SELECT value FROM fixture")),
      ]);
      gate.resolve();
      expect((await observed)[0]?.status).toBe(failed || closeFailed ? "rejected" : "fulfilled");
      expect((await queued).map(({ status }) => status)).toEqual(["rejected", "rejected"]);
      expect(requests.map(({ operation }) => operation.type)).toEqual(["open", "close"]);
      await expect(
        database.execute(sqlStatement("UPDATE fixture SET value = 2")),
      ).rejects.toMatchObject({ code: "session_closed" });
    },
  );
  it("keeps the original adapter contract usable when retirement was not requested", async () => {
    const { database, gate, archive, requests } = await setup(false);
    const restoring = database.commitPortableRestore(payload);
    await vi.waitFor(() => expect(archive).toHaveLength(1));
    const queued = database.execute(sqlStatement("UPDATE fixture SET value = 1"));
    gate.resolve();
    await restoring;
    await queued;
    expect(requests.map(({ operation }) => operation.type)).toEqual(["open", "execute"]);
    await database.close();
  });
});
