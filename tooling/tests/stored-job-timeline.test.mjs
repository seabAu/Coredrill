import { describe, expect, it, vi } from "vitest";
import { createStoredTimelineReader } from "../../apps/web/src/stored-job-timeline-reader.ts";

const jobId = "0198e204-0000-7000-8000-000000000001";
const asOf = "2026-10-19T12:00:00.000Z";
const cursor = {
  jobId,
  asOf,
  includeArchived: false,
  kind: "status",
  occurredAt: asOf,
  id: "0198e204-0000-7000-8000-000000000002",
};
const item = {
  ...cursor,
  createdAt: asOf,
  applicationId: null,
  fromStatus: null,
  toStatus: { id: jobId, name: "Synthetic" },
  note: null,
  undoneAt: null,
};
const page = (items = [item], nextCursor = null) => ({
  ok: true,
  value: {
    jobId,
    asOf,
    includeArchived: false,
    items,
    nextCursor,
    hasMore: nextCursor !== null,
  },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe("normal stored Timeline read coordination", () => {
  it("retains prior history and snapshot after a failed explicit refresh", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page([item], cursor))
      .mockRejectedValueOnce(new Error("private path"));
    const reader = createStoredTimelineReader(jobId, read, vi.fn());
    await reader.refresh();
    await reader.refresh();
    expect(reader.current()).toMatchObject({
      loaded: true,
      items: [item],
      asOf,
      nextCursor: cursor,
      failed: "refresh",
    });
    expect(await reader.more()).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    page([item]),
    { ok: true, value: { ...page([]).value, jobId: "wrong-job" } },
    { ok: true, value: { ...page([]).value, asOf: "2026-10-19T13:00:00.000Z" } },
  ])(
    "rejects discontinuous or duplicate older results without losing prior items",
    async (next) => {
      const read = vi
        .fn()
        .mockResolvedValueOnce(page([item], cursor))
        .mockResolvedValueOnce(next);
      const reader = createStoredTimelineReader(jobId, read, vi.fn());
      await reader.refresh();
      await reader.more();
      expect(reader.current()).toMatchObject({ items: [item], nextCursor: cursor, failed: "more" });
      expect(reader.current().error).not.toBeNull();
    },
  );

  it("never starts work after disposal", async () => {
    const read = vi.fn();
    const reader = createStoredTimelineReader(jobId, read, vi.fn());
    reader.dispose();
    expect(await reader.refresh()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
  it("loads only on request and preserves prior items and cursor after a failed older page", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page([item], cursor))
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "unavailable", message: "Safe retry message", retryable: true },
      })
      .mockResolvedValueOnce(page([]));
    const changed = vi.fn();
    const reader = createStoredTimelineReader(jobId, read, changed);
    expect(read).not.toHaveBeenCalled();
    await reader.refresh();
    await reader.more();
    expect(reader.current()).toMatchObject({
      items: [item],
      nextCursor: cursor,
      error: "Safe retry message",
      busy: false,
    });
    await reader.more();
    expect(read.mock.calls[2][0]).toEqual({ jobId, after: cursor });
    expect(reader.current()).toMatchObject({ items: [item], nextCursor: null, error: null });
  });

  it("prevents overlapping reads and discards a disposed job's late result", async () => {
    const held = deferred();
    const read = vi.fn(() => held.promise);
    const changed = vi.fn();
    const reader = createStoredTimelineReader(jobId, read, changed);
    const pending = reader.refresh();
    expect(await reader.refresh()).toBe(false);
    expect(await reader.more()).toBe(false);
    expect(read).toHaveBeenCalledOnce();
    reader.dispose();
    const count = changed.mock.calls.length;
    held.release(page());
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(count);
  });

  it("resets paging on explicit refresh and redacts unexpected errors", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("private adapter path"))
      .mockResolvedValueOnce(page([item], cursor))
      .mockResolvedValueOnce(page([]));
    const reader = createStoredTimelineReader(jobId, read, vi.fn());
    await reader.refresh();
    expect(reader.current().error).not.toContain("private");
    await reader.refresh();
    await reader.refresh();
    expect(read.mock.calls[2][0]).toEqual({ jobId });
    expect(reader.current()).toMatchObject({ items: [], loaded: true, nextCursor: null });
  });
});
