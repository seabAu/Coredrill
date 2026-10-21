import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import { createStoredCompanyDirectoryApi } from "../../apps/web/src/stored-company-directory.ts";
import { createStoredCompanyDirectoryReader } from "../../apps/web/src/stored-company-directory-reader.ts";

const vaultId = "0199b360-0000-7000-8000-000000000001";
const otherVaultId = "0199b360-0000-7000-8000-000000000009";
const owner = { specVersion: 1, expectedVaultId: vaultId, limit: 1 };
const context = () => ({
  operationId: entityId("application-operation", "0199b360-0000-7000-8000-000000000008"),
  initiatedAt: instant("2026-10-21T10:00:00.000Z"),
});
const company = (suffix = "002", createdAt = "2026-10-20T00:00:00.000Z") => ({
  id: `0199b360-0000-7000-8000-000000000${suffix}`,
  canonicalName: "Synthetic local company",
  websiteUrl: null,
  domain: null,
  archivedAt: null,
  createdAt,
  updatedAt: createdAt,
  rowVersion: 1,
});
const page = (items = [company()], hasMore = false, changes = {}) => {
  const last = items.at(-1);
  return {
    ok: true,
    value: {
      specVersion: 1,
      vaultId,
      includeArchived: false,
      items,
      hasMore,
      nextCursor: hasMore
        ? {
            specVersion: 1,
            vaultId,
            includeArchived: false,
            id: last.id,
            createdAt: last.createdAt,
            rowVersion: last.rowVersion,
          }
        : null,
      ...changes,
    },
  };
};
const failure = (code = "unavailable") => ({
  ok: false,
  error: { code, message: "PRIVATE_ADAPTER_DETAIL", retryable: true },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe("stored company directory runtime boundary", () => {
  it.each([
    {},
    { ...owner, expectedVaultId: "bad" },
    { ...owner, limit: 101 },
    { ...owner, includeArchived: "yes" },
    { ...owner, notes: "private" },
    { ...owner, after: page([company()], true).value.nextCursor, expectedVaultId: otherVaultId },
  ])("rejects invalid scope before opening storage: %j", async (input) => {
    const open = vi.fn();
    expect(await createStoredCompanyDirectoryApi(open, context).page(input)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
  });

  it("redacts selected-runtime open failure without a fallback", async () => {
    const open = vi.fn().mockRejectedValue(new Error("PRIVATE_ADAPTER_DETAIL"));
    const result = await createStoredCompanyDirectoryApi(open, context).page(owner);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledOnce();
  });

  it("retains original request ownership across an awaited database open", async () => {
    const held = deferred();
    const input = { ...owner };
    const query = vi.fn().mockResolvedValue([{ id: vaultId }]);
    const rows = vi.fn().mockResolvedValue([]);
    const transaction = vi.fn(async (work) =>
      work({ query: vi.fn().mockImplementationOnce(query).mockImplementation(rows) }),
    );
    const api = createStoredCompanyDirectoryApi(() => held.promise, context);
    const pending = api.page(input);
    input.expectedVaultId = otherVaultId;
    held.release({ transaction });
    expect(await pending).toMatchObject({ ok: true, value: { vaultId, items: [] } });
    expect(transaction).toHaveBeenCalledOnce();
  });
});

describe("owned bounded company directory reads", () => {
  it("is lazy, freezes its owner and only acknowledges emptiness after a successful read", async () => {
    const read = vi.fn().mockResolvedValue(page([]));
    const input = { ...owner };
    const reader = createStoredCompanyDirectoryReader(input, read, vi.fn());
    input.expectedVaultId = otherVaultId;
    expect(reader.current()).toMatchObject({ page: null, busy: false, error: null });
    expect(read).not.toHaveBeenCalled();
    await reader.first();
    expect(read).toHaveBeenCalledWith({ ...owner, includeArchived: false, after: null });
    expect(reader.current().page.items).toEqual([]);
    expect(Object.isFrozen(reader.current())).toBe(true);
    expect(Object.isFrozen(reader.current().owner)).toBe(true);
  });

  it("replaces bounded pages, preserves literal names/nulls, and resets through first", async () => {
    const first = { ...company(), canonicalName: " <b>literal</b> " + "x".repeat(180) };
    const next = company("003", "2026-10-19T00:00:00.000Z");
    const read = vi
      .fn()
      .mockResolvedValueOnce(page([first], true))
      .mockResolvedValueOnce(page([next]))
      .mockResolvedValueOnce(page([]));
    const reader = createStoredCompanyDirectoryReader(owner, read, vi.fn());
    await reader.first();
    const after = reader.current().page.nextCursor;
    expect(reader.current().page.items[0]).toEqual(first);
    await reader.next();
    expect(read.mock.calls[1][0]).toEqual({ ...owner, includeArchived: false, after });
    expect(reader.current().page.items).toEqual([next]);
    expect(await reader.next()).toBe(false);
    await reader.first();
    expect(read.mock.calls[2][0].after).toBeNull();
    expect(reader.current().page.items).toEqual([]);
  });

  it.each(["first", "next"])(
    "retains stale facts and retries only the failed %s read",
    async (mode) => {
      const read = vi
        .fn()
        .mockResolvedValueOnce(page([company()], true))
        .mockResolvedValueOnce(failure())
        .mockResolvedValueOnce(
          mode === "next" ? page([company("003", "2026-10-19T00:00:00.000Z")]) : page([]),
        );
      const reader = createStoredCompanyDirectoryReader(owner, read, vi.fn());
      await reader.first();
      const prior = reader.current().page;
      await reader[mode]();
      expect(reader.current()).toMatchObject({ page: prior, failed: mode, busy: false });
      expect(reader.current().error).not.toContain("PRIVATE");
      expect(await reader.next()).toBe(false);
      await reader.retry();
      expect(read.mock.calls[2][0]).toEqual(read.mock.calls[1][0]);
      expect(reader.current().error).toBeNull();
    },
  );

  it("does not mistake an initial failed read for a confirmed empty vault", async () => {
    const reader = createStoredCompanyDirectoryReader(
      owner,
      vi.fn().mockResolvedValue(failure()),
      vi.fn(),
    );
    await reader.first();
    expect(reader.current()).toMatchObject({
      page: null,
      failed: "first",
      error: expect.any(String),
    });
  });

  it.each([
    page([company()], false),
    page([], false, { specVersion: 2 }),
    page([], false, { vaultId: otherVaultId }),
    page([], false, { includeArchived: true }),
    page([company("003", "2026-10-19T00:00:00.000Z")], true, {
      nextCursor: page([company()], true).value.nextCursor,
    }),
    page([], false, { hasMore: true, nextCursor: page([company()], true).value.nextCursor }),
    failure("conflict"),
  ])("requires a fresh first page after discontinuity or changed scope", async (result) => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page([company()], true))
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce(page([]));
    const reader = createStoredCompanyDirectoryReader(owner, read, vi.fn());
    await reader.first();
    const prior = reader.current().page;
    await reader.next();
    expect(reader.current()).toMatchObject({ page: prior, refreshRequired: true });
    expect(await reader.retry()).toBe(false);
    expect(await reader.next()).toBe(false);
    await reader.first();
    expect(read.mock.calls[2][0].after).toBeNull();
  });

  it.each([true, false])(
    "blocks overlap and discards retired-vault late success=%s",
    async (success) => {
      const held = deferred();
      const read = vi.fn(() => held.promise);
      const changed = vi.fn();
      const old = createStoredCompanyDirectoryReader(owner, read, changed);
      const pending = old.first();
      expect(await old.first()).toBe(false);
      expect(await old.next()).toBe(false);
      old.dispose();
      const notifications = changed.mock.calls.length;
      const current = createStoredCompanyDirectoryReader(
        { ...owner, expectedVaultId: otherVaultId },
        vi.fn().mockResolvedValue(page([], false, { vaultId: otherVaultId })),
        vi.fn(),
      );
      await current.first();
      held.release(success ? page() : failure());
      expect(await pending).toBe(false);
      expect(changed).toHaveBeenCalledTimes(notifications);
      expect(current.current().page.vaultId).toBe(otherVaultId);
      expect(await old.first()).toBe(false);
    },
  );

  it("does not call storage if publication synchronously retires the owner", async () => {
    const read = vi.fn();
    let reader;
    reader = createStoredCompanyDirectoryReader(owner, read, () => reader.dispose());
    expect(await reader.first()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("copies current rows and cursors instead of retaining a mutable callback result", async () => {
    const result = page([company()], true);
    const reader = createStoredCompanyDirectoryReader(
      owner,
      vi.fn().mockResolvedValue(result),
      vi.fn(),
    );
    await reader.first();
    result.value.items[0].canonicalName = "changed outside the reader";
    result.value.nextCursor.rowVersion = 99;
    expect(reader.current().page.items[0].canonicalName).toBe("Synthetic local company");
    expect(reader.current().page.nextCursor.rowVersion).toBe(1);
    expect(Object.isFrozen(reader.current().page.items[0])).toBe(true);
  });

  it.each([
    {},
    { ...owner, expectedVaultId: "bad" },
    { ...owner, after: page([company()], true).value.nextCursor },
    { ...owner, limit: 0 },
  ])("rejects an invalid fixed owner before any read: %j", (input) => {
    const read = vi.fn();
    expect(() => createStoredCompanyDirectoryReader(input, read, vi.fn())).toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it("redacts rejected adapter promises and permits a safe explicit read retry", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("PRIVATE_ADAPTER_DETAIL"))
      .mockResolvedValueOnce(page([]));
    const reader = createStoredCompanyDirectoryReader(owner, read, vi.fn());
    await reader.first();
    expect(reader.current().page).toBeNull();
    expect(reader.current().error).not.toContain("PRIVATE");
    await reader.retry();
    expect(reader.current()).toMatchObject({ page: { items: [] }, error: null });
  });
});
