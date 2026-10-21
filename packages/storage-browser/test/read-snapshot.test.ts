import { describe, expect, it, vi } from "vitest";
import { sqlStatement, type DatabaseReadSnapshot } from "@coredrill/storage-core";
import { BrowserSqliteDatabase } from "../src/browser-sqlite.js";
import { BROWSER_STORAGE_PROTOCOL_VERSION, type BrowserStorageRequest } from "../src/protocol.js";

/** Queue/lifetime unit transport; actual SQLite is separately exercised in browser E2E. */
class MockWorker extends EventTarget {
  readonly operations: string[] = [];
  value = "original";
  readonly terminate = vi.fn();
  postMessage(request: BrowserStorageRequest) {
    this.operations.push(request.operation);
    let result: unknown;
    if (request.operation === "open") result = { existedBeforeOpen: true };
    else if (request.operation === "query") result = [{ value: this.value }];
    else if (request.operation === "execute") {
      this.value = "updated";
      result = { rowsAffected: 1 };
    } else if (request.operation === "export")
      result = {
        bytes: new Uint8Array([1, 2, 3]),
        byteLength: 3,
        schemaVersion: 1,
        sha256: "a".repeat(64),
      };
    queueMicrotask(() =>
      this.dispatchEvent(
        new MessageEvent("message", {
          data: { version: BROWSER_STORAGE_PROTOCOL_VERSION, id: request.id, ok: true, result },
        }),
      ),
    );
  }
}
const setup = async () => {
  const worker = new MockWorker();
  const database = await BrowserSqliteDatabase.open({
    databaseName: "/snapshot-test.sqlite3",
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
describe("browser coordinator-owned read snapshot lease", () => {
  it("holds query/export/query together, queues writes and rejects escaped capabilities", async () => {
    const { database, worker } = await setup();
    try {
      const holder = new Map<string, DatabaseReadSnapshot>();
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const capture = database.withReadSnapshot(async (lease) => {
        holder.set("lease", lease);
        expect(Object.keys(lease).sort()).toEqual(["exportPortable", "query"]);
        expect(await lease.query(sqlStatement("SELECT value"))).toEqual([{ value: "original" }]);
        entered();
        await held;
        await lease.exportPortable();
        return lease.query(sqlStatement("SELECT value"));
      });
      await started;
      const write = database.execute(sqlStatement("UPDATE fixture SET value = ?", ["updated"]));
      await Promise.resolve();
      expect(worker.operations).not.toContain("execute");
      release();
      expect(await capture).toEqual([{ value: "original" }]);
      await write;
      expect(await database.query(sqlStatement("SELECT value"))).toEqual([{ value: "updated" }]);
      const escaped = holder.get("lease");
      if (escaped === undefined) throw new Error("Missing test lease.");
      const count = worker.operations.length;
      await expect(escaped.query(sqlStatement("SELECT value"))).rejects.toThrow("lease has ended");
      await expect(escaped.exportPortable()).rejects.toThrow("lease has ended");
      expect(worker.operations).toHaveLength(count);
      expect(worker.operations).toEqual(["open", "query", "export", "query", "execute", "query"]);
    } finally {
      await database.close();
    }
  });
  it("releases the queue after callback failure without a protocol transaction or retry", async () => {
    const { database, worker } = await setup();
    try {
      const capture = database.withReadSnapshot(async (lease) => {
        await lease.query(sqlStatement("SELECT value"));
        throw new Error("Synthetic snapshot failure");
      });
      const write = database.execute(sqlStatement("UPDATE fixture SET value = ?", ["updated"]));
      await expect(capture).rejects.toThrow("Synthetic snapshot failure");
      await write;
      expect(worker.operations).toEqual(["open", "query", "execute"]);
    } finally {
      await database.close();
    }
  });
});
