import { describe, expect, it } from "vitest";

import {
  BROWSER_STORAGE_PROTOCOL_VERSION,
  BrowserSqliteBusyError,
  deserializeBrowserStorageError,
  inspectBrowserStorageEnvironment,
  type BrowserStorageManager,
} from "../src/index.js";
import { isBrowserStorageRequest } from "../src/protocol.js";

const manager = (overrides: Partial<BrowserStorageManager> = {}): BrowserStorageManager => ({
  getDirectory: async () => ({}),
  estimate: async () => ({ quota: 1_000_000_000, usage: 100_000_000 }),
  persist: async () => true,
  persisted: async () => false,
  ...overrides,
});

describe("browser storage environment diagnostics", () => {
  it("observes persistence during passive inspection without requesting it", async () => {
    let requestCount = 0;
    const environment = await inspectBrowserStorageEnvironment({
      storageManager: manager({
        persist: async () => {
          requestCount += 1;
          return true;
        },
      }),
    });

    expect(requestCount).toBe(0);
    expect(environment.persistence).toBe("denied");
    expect(environment.warnings).toContain("persistence-not-granted");
  });

  it("requests persistence and reports a healthy quota without exposing content", async () => {
    const environment = await inspectBrowserStorageEnvironment({
      requestPersistence: true,
      storageManager: manager(),
    });

    expect(environment).toEqual({
      opfsAvailable: true,
      persistence: "granted",
      quota: "available",
      quotaBytes: 1_000_000_000,
      remainingBytes: 900_000_000,
      usageBytes: 100_000_000,
      warnings: [],
    });
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(environment.warnings)).toBe(true);
  });

  it("fails closed when persistence is denied and remaining quota is low", async () => {
    const environment = await inspectBrowserStorageEnvironment({
      lowQuotaBytes: 1,
      lowQuotaRatio: 0.1,
      requestPersistence: true,
      storageManager: manager({
        estimate: async () => ({ quota: 1_000, usage: 950 }),
        persist: async () => false,
      }),
    });

    expect(environment.persistence).toBe("denied");
    expect(environment.quota).toBe("low");
    expect(environment.remainingBytes).toBe(50);
    expect(environment.warnings).toEqual(["persistence-not-granted", "quota-low"]);
  });

  it("reports unsupported OPFS and unknown quota without inventing values", async () => {
    const environment = await inspectBrowserStorageEnvironment({ storageManager: {} });

    expect(environment).toEqual({
      opfsAvailable: false,
      persistence: "unsupported",
      quota: "unknown",
      warnings: ["opfs-unavailable", "persistence-not-granted", "quota-unknown"],
    });
  });

  it("distinguishes an observable persistence error from unsupported storage", async () => {
    const environment = await inspectBrowserStorageEnvironment({
      storageManager: manager({
        persisted: async () => {
          throw new Error("synthetic browser failure with private content");
        },
      }),
    });

    expect(environment.persistence).toBe("error");
    expect(environment.warnings).toEqual(["persistence-not-granted"]);
    expect(JSON.stringify(environment)).not.toContain("private content");
  });

  it("maps SQLite busy result codes and messages to a retryable typed error", () => {
    const byCode = deserializeBrowserStorageError({
      name: "SQLite3Error",
      message: "database cannot start the transaction",
      resultCode: 5,
    });
    const byMessage = deserializeBrowserStorageError({
      name: "Error",
      message: "database is locked",
    });

    expect(byCode).toBeInstanceOf(BrowserSqliteBusyError);
    expect(byCode).toMatchObject({ code: "sqlite_busy", retryable: true, resultCode: 5 });
    expect(byMessage).toBeInstanceOf(BrowserSqliteBusyError);
  });

  it("accepts the versioned non-mutating restore inspection operation", () => {
    expect(
      isBrowserStorageRequest({
        version: BROWSER_STORAGE_PROTOCOL_VERSION,
        id: "restore-preview-1",
        operation: "inspect_restore",
      }),
    ).toBe(true);
    expect(
      isBrowserStorageRequest({
        version: BROWSER_STORAGE_PROTOCOL_VERSION - 1,
        id: "restore-preview-1",
        operation: "inspect_restore",
      }),
    ).toBe(false);
  });
});
