import { describe, expect, it, vi } from "vitest";
import { createStoredJobDetailsReader } from "../../apps/web/src/stored-job-details-reader.ts";

const jobId = "0198e204-0000-7000-8000-000000000001";
const value = { job: { id: jobId, title: "Actual stored job" } };
const success = { ok: true, value };

describe("stored Overview/Company read coordination", () => {
  it("reads only on request and retains prior facts on failure without leaking adapter text", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(success)
      .mockRejectedValueOnce(new Error("private path"));
    const reader = createStoredJobDetailsReader(jobId, read, vi.fn());
    expect(read).not.toHaveBeenCalled();
    await reader.refresh();
    expect(read).toHaveBeenCalledWith({ jobId });
    await reader.refresh();
    expect(reader.current()).toMatchObject({ jobId, value, busy: false });
    expect(reader.current().error).not.toContain("private");
    expect(reader.current().error).toContain("Retry");
  });
  it.each([
    { ok: false, error: { message: "private data" } },
    { ok: true, value: { job: { id: "wrong" } } },
  ])("fails closed for failed or wrong-job results, then retries", async (bad) => {
    const read = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(success);
    const reader = createStoredJobDetailsReader(jobId, read, vi.fn());
    await reader.refresh();
    expect(reader.current()).toMatchObject({ value: null, busy: false });
    expect(reader.current().error).not.toContain("private");
    await reader.refresh();
    expect(reader.current()).toMatchObject({ value, error: null });
  });
  it.each(["resolve", "reject"])(
    "prevents overlapping reads and ignores disposed late %s",
    async (mode) => {
      let release;
      let fail;
      const read = vi.fn(
        () =>
          new Promise((resolve, reject) => {
            release = resolve;
            fail = reject;
          }),
      );
      const changed = vi.fn();
      const reader = createStoredJobDetailsReader(jobId, read, changed);
      const pending = reader.refresh();
      expect(await reader.refresh()).toBe(false);
      expect(read).toHaveBeenCalledOnce();
      reader.dispose();
      const calls = changed.mock.calls.length;
      if (mode === "resolve") release(success);
      else fail(new Error("private late failure"));
      expect(await pending).toBe(false);
      expect(changed).toHaveBeenCalledTimes(calls);
      expect(await reader.refresh()).toBe(false);
      expect(read).toHaveBeenCalledOnce();
    },
  );
});
