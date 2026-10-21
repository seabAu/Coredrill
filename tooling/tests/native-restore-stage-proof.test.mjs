import { describe, expect, it, vi } from "vitest";
import {
  createNativeRestoreOperationRecorder,
  observeNativeRestoreReview,
} from "../../e2e/native-restore-stage-proof.mjs";

describe("content-free native restore operation timing", () => {
  it("records nothing outside an explicitly opened observation window", () => {
    const recorder = createNativeRestoreOperationRecorder(() => 1);
    recorder.measure("query")();
    expect(recorder.end()).toEqual([]);
  });

  it("aggregates only reviewed operation names and nonnegative durations", () => {
    let clock = 10;
    const recorder = createNativeRestoreOperationRecorder(() => clock);
    recorder.begin();
    const first = recorder.measure("query");
    clock = 14;
    first();
    first();
    const second = recorder.measure("query");
    clock = 20;
    second();
    expect(recorder.end()).toEqual([{ operation: "query", count: 2, totalMs: 10, maxMs: 6 }]);
  });

  it("never retains unknown operation text, objects, paths, SQL or values", () => {
    const recorder = createNativeRestoreOperationRecorder(() => 1);
    recorder.begin();
    recorder.measure("Synthetic private SQL /path/token")();
    recorder.measure({ operation: "query", private: "Synthetic document sentinel" })();
    expect(recorder.end()).toEqual([{ operation: "other", count: 2, totalMs: 0, maxMs: 0 }]);
  });

  it("does not attribute a prior window's late result to a replacement observation", () => {
    let clock = 10;
    const recorder = createNativeRestoreOperationRecorder(() => clock);
    recorder.begin();
    const prior = recorder.measure("export");
    recorder.begin();
    const current = recorder.measure("portable_inspect");
    clock = 12;
    prior();
    current();
    expect(recorder.end()).toEqual([
      { operation: "portable_inspect", count: 1, totalMs: 2, maxMs: 2 },
    ]);
  });

  it("does not publish late completions after observation ends", () => {
    const recorder = createNativeRestoreOperationRecorder(() => 1);
    recorder.begin();
    const finish = recorder.measure("portable_read_chunk");
    const snapshot = recorder.end();
    finish();
    expect(snapshot).toEqual([]);
    expect(recorder.end()).toEqual([]);
  });

  it("returns copied frozen snapshots with deterministic operation ordering", () => {
    const recorder = createNativeRestoreOperationRecorder(() => 1);
    recorder.begin();
    recorder.measure("query")();
    recorder.measure("begin")();
    const snapshot = recorder.end();
    expect(snapshot.map(({ operation }) => operation)).toEqual(["begin", "query"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    recorder.begin();
    recorder.measure("query")();
    expect(snapshot).toHaveLength(2);
  });

  it.each([false, true])(
    "preserves the actual assertion error when diagnostic collection fails=%j",
    async (collectionFails) => {
      const original = new Error("Synthetic original assertion failure");
      const evaluate = vi.fn().mockResolvedValueOnce(undefined);
      if (collectionFails) evaluate.mockRejectedValueOnce(new Error("Synthetic retired page"));
      else evaluate.mockResolvedValueOnce([]);
      const attach = vi.fn(async () => undefined);
      const recorder = createNativeRestoreOperationRecorder(() => 1);
      await expect(
        observeNativeRestoreReview({ evaluate }, { attach }, recorder, "same_vault", async () => {
          throw original;
        }),
      ).rejects.toBe(original);
      if (!collectionFails) {
        const proof = JSON.parse(attach.mock.calls[0][1].body);
        expect(proof.assertionPassed).toBe(false);
        expect(JSON.stringify(proof)).not.toContain(original.message);
      }
      expect(recorder.end()).toEqual([]);
    },
  );

  it("does not silently accept missing diagnostics after a successful assertion", async () => {
    const diagnostic = new Error("Synthetic missing diagnostic");
    const evaluate = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(diagnostic);
    await expect(
      observeNativeRestoreReview(
        { evaluate },
        { attach: vi.fn() },
        createNativeRestoreOperationRecorder(),
        "empty_target",
        async () => true,
      ),
    ).rejects.toBe(diagnostic);
  });

  it("returns the original successful work result and attaches only the reviewed proof shape", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ phase: "review", elapsedMs: 1 }]);
    const attach = vi.fn(async () => undefined);
    expect(
      await observeNativeRestoreReview(
        { evaluate },
        { attach },
        createNativeRestoreOperationRecorder(),
        "empty_target",
        async () => 42,
      ),
    ).toBe(42);
    const proof = JSON.parse(attach.mock.calls[0][1].body);
    expect(proof).toMatchObject({
      specVersion: 1,
      label: "empty_target",
      assertionPassed: true,
      synthetic: true,
      nativeOperations: [],
    });
  });
});
