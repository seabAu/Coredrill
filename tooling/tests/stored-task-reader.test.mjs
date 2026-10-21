import { describe, expect, it, vi } from "vitest";
import { createStoredTaskReader } from "../../apps/web/src/stored-task-reader.ts";

const task = (id, createdAt = "2026-10-21T00:00:00.000Z") => ({
  id,
  jobId: "job",
  createdAt,
  rowVersion: 1,
});
const page = (items, overrides = {}) => ({
  ok: true,
  value: {
    jobId: "job",
    includeArchived: false,
    jobRowVersion: 3,
    items,
    hasMore: false,
    nextCursor: null,
    ...overrides,
  },
});
describe("bounded owned task read coordination", () => {
  it("replaces older pages rather than accumulating task history", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page([task("b")], { hasMore: true, nextCursor: { id: "b" } }))
      .mockResolvedValueOnce(page([task("c", "2026-10-20T00:00:00.000Z")]));
    const reader = createStoredTaskReader("job", read, vi.fn());
    await reader.refresh();
    await reader.more();
    expect(reader.current().items.map(({ id }) => id)).toEqual(["c"]);
    expect(read.mock.calls).toEqual([
      [{ jobId: "job", limit: 25 }],
      [{ jobId: "job", limit: 25, after: { id: "b" } }],
    ]);
  });
  it.each([
    { jobId: "foreign" },
    { includeArchived: true },
    { items: Array.from({ length: 26 }, (_, id) => task(String(id))) },
  ])("rejects invalid page scope/bounds: %j", async (change) => {
    const reader = createStoredTaskReader(
      "job",
      vi.fn().mockResolvedValue(page([], change)),
      vi.fn(),
    );
    await reader.refresh();
    expect(reader.current()).toMatchObject({ loaded: false, items: [], error: expect.any(String) });
  });
  it("retains old facts as stale and blocks continuation after a changed job version", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page([task("b")], { hasMore: true, nextCursor: { id: "b" } }))
      .mockResolvedValueOnce(page([task("c")], { jobRowVersion: 4 }));
    const reader = createStoredTaskReader("job", read, vi.fn());
    await reader.refresh();
    await reader.more();
    expect(reader.current()).toMatchObject({
      jobRowVersion: 3,
      items: [task("b")],
      error: expect.any(String),
    });
    expect(await reader.more()).toBe(false);
  });
  it("suppresses duplicate reads and late publication from disposed owners", async () => {
    let release;
    const changed = vi.fn();
    const reader = createStoredTaskReader(
      "job",
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      changed,
    );
    const pending = reader.refresh();
    expect(await reader.refresh()).toBe(false);
    reader.dispose();
    const count = changed.mock.calls.length;
    release(page([task("b")]));
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(count);
  });
  it("redacts thrown errors, retains last facts, and recovers only through another read", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page([task("b")]))
      .mockRejectedValueOnce(new Error("PRIVATE_PATH"))
      .mockResolvedValueOnce(page([]));
    const reader = createStoredTaskReader("job", read, vi.fn());
    await reader.refresh();
    await reader.refresh();
    expect(reader.current().items).toEqual([task("b")]);
    expect(reader.current().error).not.toContain("PRIVATE");
    await reader.refresh();
    expect(reader.current()).toMatchObject({ items: [], loaded: true, error: null });
  });
});
