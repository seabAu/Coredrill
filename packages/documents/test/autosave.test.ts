import { afterEach, describe, expect, it, vi } from "vitest";

import { createDocumentAutosaveCoordinator } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("document autosave coordinator", () => {
  it("debounces rapid edits and durably saves only the latest value", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const statuses: string[] = [];
    const coordinator = createDocumentAutosaveCoordinator({
      delayMilliseconds: 250,
      save,
      onStatusChange: (status) => statuses.push(status),
    });

    coordinator.queue("first");
    coordinator.queue("second");
    await vi.advanceTimersByTimeAsync(249);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("second");
    expect(statuses).toEqual(["pending", "saving", "saved"]);
  });

  it("serializes an edit queued during an in-flight save without dropping it", async () => {
    vi.useFakeTimers();
    let resolveFirst: (() => void) | undefined;
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockImplementationOnce(
        async () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const coordinator = createDocumentAutosaveCoordinator({ delayMilliseconds: 100, save });

    coordinator.queue("first");
    await vi.advanceTimersByTimeAsync(100);
    coordinator.queue("second");
    resolveFirst?.();
    await vi.runAllTimersAsync();

    expect(save.mock.calls).toEqual([["first"], ["second"]]);
    expect(coordinator.status()).toBe("saved");
  });

  it("keeps failed content pending for an explicit retry", async () => {
    vi.useFakeTimers();
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("injected storage failure"))
      .mockResolvedValue(undefined);
    const coordinator = createDocumentAutosaveCoordinator({ delayMilliseconds: 100, save });

    coordinator.queue("preserve me");
    await vi.advanceTimersByTimeAsync(100);
    expect(coordinator.status()).toBe("failed");
    await coordinator.retry();

    expect(save.mock.calls).toEqual([["preserve me"], ["preserve me"]]);
    expect(coordinator.status()).toBe("saved");
  });

  it("flushes immediately before explicit version creation", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const coordinator = createDocumentAutosaveCoordinator({ delayMilliseconds: 5_000, save });
    coordinator.queue("application ready");

    await coordinator.flush();

    expect(save).toHaveBeenCalledWith("application ready");
    expect(coordinator.status()).toBe("saved");
  });
});
