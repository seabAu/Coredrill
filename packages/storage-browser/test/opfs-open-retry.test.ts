import { describe, expect, it, vi } from "vitest";

import { BrowserSqliteBusyError, BrowserVaultBusyError } from "../src/errors.js";
import { openAfterOpfsHandleRelease } from "../src/opfs-open-retry.js";

const handleBusy = () => {
  const error = new Error("private browser handle details");
  error.name = "NoModificationAllowedError";
  return error;
};

describe("bounded OPFS startup-handle handoff", () => {
  it("retries a fresh open after a terminating worker's specific handle conflict", async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(handleBusy())
      .mockResolvedValueOnce("opened");
    const wait = vi.fn(async (_milliseconds: number) => undefined);
    await expect(openAfterOpfsHandleRelease(open, wait)).resolves.toBe("opened");
    expect(open).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledExactlyOnceWith(25);
  });
  it("bounds startup retries and returns a content-free typed busy result on exhaustion", async () => {
    const open = vi.fn(async () => {
      throw handleBusy();
    });
    const wait = vi.fn(async (_milliseconds: number) => undefined);
    const result = await openAfterOpfsHandleRelease(open, wait).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(BrowserSqliteBusyError);
    expect(String(result)).not.toContain("private browser");
    expect(open).toHaveBeenCalledTimes(4);
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([25, 75, 150]);
  });
  it.each([
    new BrowserVaultBusyError(),
    new Error("corrupt database"),
    new DOMException("permission denied", "NotAllowedError"),
    new DOMException("quota", "QuotaExceededError"),
    new BrowserSqliteBusyError("SQLite transaction busy"),
  ])("does not retry a different failure or bypass another tab's lease", async (failure) => {
    const open = vi.fn(async () => {
      throw failure;
    });
    const wait = vi.fn(async (_milliseconds: number) => undefined);
    await expect(openAfterOpfsHandleRelease(open, wait)).rejects.toBe(failure);
    expect(open).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
  it("stops immediately if a different failure occurs on a later open", async () => {
    const failure = new BrowserVaultBusyError();
    const open = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(handleBusy())
      .mockRejectedValueOnce(failure);
    const wait = vi.fn(async (_milliseconds: number) => undefined);
    await expect(openAfterOpfsHandleRelease(open, wait)).rejects.toBe(failure);
    expect(open).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
