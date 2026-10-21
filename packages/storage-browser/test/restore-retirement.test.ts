import { describe, expect, it, vi } from "vitest";
import { sqlStatement } from "@coredrill/storage-core";
import { BrowserSqliteDatabase } from "../src/browser-sqlite.js";
import { BROWSER_STORAGE_PROTOCOL_VERSION, type BrowserStorageRequest } from "../src/protocol.js";

class RestoreWorker extends EventTarget {
  readonly operations: string[] = [];
  readonly terminate = vi.fn();
  pendingRestore: BrowserStorageRequest | undefined;
  postMessage(request: BrowserStorageRequest) {
    this.operations.push(request.operation);
    if (request.operation === "restore") {
      this.pendingRestore = request;
      return;
    }
    this.respond(request, { existedBeforeOpen: true, rowsAffected: 1, lastInsertRowId: "1" });
  }
  respond(request: BrowserStorageRequest, result: unknown, failed = false) {
    queueMicrotask(() =>
      this.dispatchEvent(
        new MessageEvent("message", {
          data: failed
            ? {
                version: BROWSER_STORAGE_PROTOCOL_VERSION,
                id: request.id,
                ok: false,
                error: { name: "Error", message: "Synthetic uncertain restore" },
              }
            : { version: BROWSER_STORAGE_PROTOCOL_VERSION, id: request.id, ok: true, result },
        }),
      ),
    );
  }
  finish(failed = false, changes: Readonly<Record<string, unknown>> = {}) {
    if (!this.pendingRestore) throw new Error("Expected held restore");
    this.respond(
      this.pendingRestore,
      { byteLength: 3, schemaVersion: 1, sha256: "a".repeat(64), integrity: "ok", ...changes },
      failed,
    );
  }
}
const setup = async () => {
  const worker = new RestoreWorker();
  const database = await BrowserSqliteDatabase.open({
    databaseName: "/retire-test.sqlite3",
    coordinateTabs: false,
    storageManager: {
      getDirectory: async () => ({}),
      persisted: async () => true,
      estimate: async () => ({ quota: 1024 * 1024 * 1024, usage: 1 }),
    },
    workerFactory: () => worker as unknown as Worker,
  });
  return { database, worker };
};
const portable = {
  bytes: new Uint8Array([1, 2, 3]),
  byteLength: 3,
  schemaVersion: 1,
  sha256: "a".repeat(64),
};

describe("normal browser restore retirement inside the held queue slot", () => {
  it.each([false, true])(
    "rejects old queued work before it reaches the worker after failure=%s",
    async (failed) => {
      const { database, worker } = await setup();
      const options = { retireAfterRestore: true };
      const restoring = database.restorePortable(portable, options);
      options.retireAfterRestore = false;
      const restoreObserved = Promise.allSettled([restoring]);
      await vi.waitFor(() => expect(worker.pendingRestore).toBeDefined());
      const queued = Promise.allSettled([
        database.execute(sqlStatement("UPDATE fixture SET value = 1")),
        database.query(sqlStatement("SELECT value FROM fixture")),
      ]);
      worker.finish(failed);
      expect((await restoreObserved)[0]?.status).toBe(failed ? "rejected" : "fulfilled");
      expect((await queued).map(({ status }) => status)).toEqual(["rejected", "rejected"]);
      expect(worker.operations).toEqual(["open", "restore"]);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      await expect(database.execute(sqlStatement("UPDATE fixture SET value = 2"))).rejects.toThrow(
        "closed",
      );
    },
  );
  it.each([{ sha256: "b".repeat(64) }, { path: "/private" }, { integrity: "invalid" }])(
    "rejects a mismatched or expanded acknowledgement and retires the session: %s",
    async (changes) => {
      const { database, worker } = await setup();
      const observed = Promise.allSettled([
        database.restorePortable(portable, { retireAfterRestore: true }),
      ]);
      await vi.waitFor(() => expect(worker.pendingRestore).toBeDefined());
      worker.finish(false, changes);
      expect((await observed)[0]?.status).toBe("rejected");
      expect(worker.terminate).toHaveBeenCalledExactlyOnceWith();
    },
  );
  it("snapshots selected bytes and expected target before queue entry", async () => {
    const { database, worker } = await setup();
    const selected = { ...portable, bytes: portable.bytes.slice() };
    const options = { expectedTargetSha256: "b".repeat(64), expectedVaultId: "original" };
    const restoring = database.restorePortable(selected, options);
    selected.bytes.fill(9);
    selected.sha256 = "c".repeat(64);
    options.expectedTargetSha256 = "d".repeat(64);
    options.expectedVaultId = "changed";
    await vi.waitFor(() => expect(worker.pendingRestore).toBeDefined());
    expect(worker.pendingRestore).toMatchObject({
      portable: { bytes: new Uint8Array([1, 2, 3]), sha256: "a".repeat(64) },
      expectedTargetSha256: "b".repeat(64),
      expectedVaultId: "original",
    });
    worker.finish(false, { vaultId: "original" });
    await restoring;
    await database.close();
  });
  it.each([{}, { vaultId: "changed" }])(
    "requires the exact requested vault identity in the worker acknowledgement: %s",
    async (changes) => {
      const { database, worker } = await setup();
      const observed = Promise.allSettled([
        database.restorePortable(portable, {
          expectedVaultId: "original",
          retireAfterRestore: true,
        }),
      ]);
      await vi.waitFor(() => expect(worker.pendingRestore).toBeDefined());
      worker.finish(false, changes);
      expect((await observed)[0]?.status).toBe("rejected");
      expect(worker.terminate).toHaveBeenCalledExactlyOnceWith();
    },
  );
  it("preserves existing non-retiring adapter behavior when not opted in", async () => {
    const { database, worker } = await setup();
    const restoring = database.restorePortable(portable);
    await vi.waitFor(() => expect(worker.pendingRestore).toBeDefined());
    const writing = database.execute(sqlStatement("UPDATE fixture SET value = 1"));
    worker.finish();
    await restoring;
    await writing;
    expect(worker.operations).toEqual(["open", "restore", "execute"]);
    expect(worker.terminate).not.toHaveBeenCalled();
    await database.close();
  });
});
