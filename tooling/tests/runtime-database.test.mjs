import { describe, expect, it } from "vitest";
import {
  createRuntimeDatabase,
  RuntimeCapabilityError,
} from "../../apps/web/src/runtime-database.ts";

describe("host-selected runtime database", () => {
  it("coalesces native opens and never falls back to browser after failure", async () => {
    let browserCalls = 0;
    let nativeCalls = 0;
    const database = { close: async () => undefined };
    const runtime = createRuntimeDatabase({
      kind: "native",
      openBrowser: async () => {
        browserCalls += 1;
        return database;
      },
      openNative: async () => {
        nativeCalls += 1;
        if (nativeCalls === 1) throw new Error("synthetic unavailable");
        return database;
      },
    });
    const first = await Promise.allSettled([runtime.database(), runtime.database()]);
    expect(first.map((value) => value.status)).toEqual(["rejected", "rejected"]);
    expect(nativeCalls).toBe(1);
    expect(browserCalls).toBe(0);
    await expect(runtime.browser()).rejects.toBeInstanceOf(RuntimeCapabilityError);
    expect(browserCalls).toBe(0);
    expect(await runtime.database()).toBe(database);
    expect(nativeCalls).toBe(2);
  });
  it("uses only browser storage on web and forwards existing-vault evidence", async () => {
    const requested = [];
    const database = { close: async () => undefined };
    const runtime = createRuntimeDatabase({
      kind: "browser",
      openBrowser: async (expected) => {
        requested.push(expected);
        return database;
      },
      openNative: async () => {
        throw new Error("must not open native");
      },
    });
    expect(await runtime.database(true)).toBe(database);
    expect(await runtime.browser()).toBe(database);
    expect(requested).toEqual([true]);
    await expect(runtime.native()).rejects.toBeInstanceOf(RuntimeCapabilityError);
  });
  it("reopens after explicit close and cannot forget a different new session", async () => {
    let closed = 0;
    const created = [];
    const runtime = createRuntimeDatabase({
      kind: "native",
      openBrowser: async () => {
        throw new Error("must not open browser");
      },
      openNative: async () => {
        const database = {
          close: async () => {
            closed += 1;
          },
        };
        created.push(database);
        return database;
      },
    });
    const first = await runtime.native();
    await runtime.close();
    const second = await runtime.native();
    expect(first).not.toBe(second);
    await runtime.forget(first);
    expect(await runtime.native()).toBe(second);
    await runtime.forget(second);
    expect(await runtime.native()).not.toBe(second);
    expect(closed).toBe(1);
    expect(created).toHaveLength(3);
  });
});
