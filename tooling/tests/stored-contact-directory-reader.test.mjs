import { describe, expect, it, vi } from "vitest";
import { parseContactDirectoryPageV1 } from "../../packages/application/dist/index.js";
import { createStoredContactDirectoryReader } from "../../apps/web/src/stored-contact-directory-reader.ts";

const vaultId = "0199b365-0000-7000-8000-000000000001";
const otherVaultId = "0199b365-0000-7000-8000-000000000002";
const companyId = "0199b365-0000-7000-8000-000000000003";
const owner = { specVersion: 1, expectedVaultId: vaultId, limit: 1, companyId: null };
const entry = (suffix = "005") => ({
  id: `0199b365-0000-7000-8000-000000000${suffix}`,
  name: "Synthetic <contact> 🧭",
  role: null,
  companyId: null,
  archivedAt: null,
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
  rowVersion: 1,
});
const page = (items = [entry()], more = false, changes = {}) => {
  const last = items.at(-1);
  return {
    ok: true,
    value: {
      specVersion: 1,
      vaultId,
      companyId: null,
      includeArchived: false,
      items,
      hasMore: more,
      nextCursor: more
        ? {
            specVersion: 1,
            vaultId,
            companyId: null,
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
const unavailable = (code = "unavailable") => ({
  ok: false,
  error: { code, message: "PRIVATE synthetic path", retryable: true },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const setup = (scope = owner) => {
  const read = vi.fn(async () => page());
  const changed = vi.fn();
  return { read, changed, reader: createStoredContactDirectoryReader(scope, read, changed) };
};

describe("strict contact page decoding and owned live reading", () => {
  it.each([
    {},
    { ...owner, expectedVaultId: "bad" },
    { ...owner, companyId: "bad" },
    { ...owner, limit: 0 },
    { ...owner, includeArchived: "yes" },
    { ...owner, limit: 101 },
    { ...owner, email: "injected@synthetic.example" },
    { ...owner, after: page([entry()], true).value.nextCursor },
  ])("rejects malformed or continued initial ownership without invoking read (%j)", (input) => {
    const read = vi.fn();
    expect(() => createStoredContactDirectoryReader(input, read, vi.fn())).toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it("uses the strict public decoder for scope as well as identity-only values", () => {
    expect(() =>
      parseContactDirectoryPageV1(page().value, { ...owner, expectedVaultId: "bad" }),
    ).toThrow();
    expect(() => parseContactDirectoryPageV1(page().value, { ...owner, specVersion: 2 })).toThrow();
    expect(() =>
      parseContactDirectoryPageV1(page([{ ...entry(), email: "PRIVATE" }]).value, owner),
    ).toThrow();
    expect(() =>
      parseContactDirectoryPageV1(page([{ ...entry(), manualCreation: null }]).value, owner),
    ).toThrow();
  });

  it("does not read until requested and retains a copied immutable page, not a total", async () => {
    const local = setup();
    const result = page();
    local.read.mockResolvedValueOnce(result);
    expect(local.read).not.toHaveBeenCalled();
    expect(local.reader.current()).toMatchObject({ page: null, busy: false });
    expect(await local.reader.first()).toBe(true);
    result.value.items[0].name = "changed after read";
    expect(local.reader.current().page.items[0].name).toBe("Synthetic <contact> 🧭");
    expect(Object.isFrozen(local.reader.current())).toBe(true);
    expect(Object.isFrozen(local.reader.current().page.items[0])).toBe(true);
    expect(local.reader.current().page).not.toHaveProperty("total");
    expect(await local.reader.next()).toBe(false);
  });

  it("copies the original vault/company/archive scope before awaited reads", async () => {
    const scope = { ...owner, companyId, includeArchived: true };
    const local = setup(scope);
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.first();
    scope.companyId = otherVaultId;
    scope.includeArchived = false;
    scope.expectedVaultId = otherVaultId;
    held.release(page([{ ...entry(), companyId }], false, { companyId, includeArchived: true }));
    expect(await pending).toBe(true);
    expect(local.reader.current().page.companyId).toBe(companyId);
    expect(local.read).toHaveBeenCalledExactlyOnceWith({
      ...owner,
      companyId,
      includeArchived: true,
      after: null,
    });
  });

  it("keeps one request in flight and reuses the exact failed continuation on explicit retry", async () => {
    const local = setup();
    const first = page([entry("005")], true);
    local.read.mockResolvedValueOnce(first);
    await local.reader.first();
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.next();
    expect(await local.reader.next()).toBe(false);
    expect(await local.reader.first()).toBe(false);
    expect(await local.reader.retry()).toBe(false);
    held.release(unavailable());
    await pending;
    expect(local.reader.current()).toMatchObject({
      failed: "next",
      busy: false,
      refreshRequired: false,
    });
    expect(local.reader.current().page.items[0].id).toBe(entry("005").id);
    expect(await local.reader.next()).toBe(false);
    local.read.mockResolvedValueOnce(page([entry("006")]));
    expect(await local.reader.retry()).toBe(true);
    expect(local.read.mock.calls[1][0]).toEqual(local.read.mock.calls[2][0]);
    expect(local.read.mock.calls[2][0].after).toEqual(first.value.nextCursor);
    expect(local.reader.current().page.items[0].id).toBe(entry("006").id);
  });

  it.each(["conflict", "not_found", "internal"])(
    "requires First after non-retryable scope/continuation failure %s",
    async (code) => {
      const local = setup();
      local.read.mockResolvedValueOnce(page([entry()], true));
      await local.reader.first();
      local.read.mockResolvedValueOnce(unavailable(code));
      await local.reader.next();
      expect(local.reader.current().refreshRequired).toBe(true);
      expect(await local.reader.retry()).toBe(false);
      expect(await local.reader.next()).toBe(false);
      expect(JSON.stringify(local.reader.current())).not.toContain("PRIVATE");
      local.read.mockResolvedValueOnce(page());
      expect(await local.reader.first()).toBe(true);
      expect(local.read.mock.calls.at(-1)[0].after).toBeNull();
    },
  );

  it.each([
    (value) => ({ ...value, vaultId: otherVaultId }),
    (value) => ({ ...value, companyId }),
    (value) => ({ ...value, includeArchived: true }),
    (value) => ({ ...value, total: 99 }),
    (value) => ({ ...value, items: [{ ...entry(), notes: "PRIVATE" }] }),
    (value) => ({ ...value, items: [{ ...entry(), email: "PRIVATE" }] }),
    (value) => ({ ...value, items: [entry(), entry("004")] }),
    (value) => ({ ...value, hasMore: true, nextCursor: null }),
  ])(
    "rejects misbound or private/preloaded result data before publication (%#)",
    async (mutate) => {
      const local = setup();
      local.read.mockResolvedValueOnce({ ok: true, value: mutate(page().value) });
      await local.reader.first();
      expect(local.reader.current()).toMatchObject({
        page: null,
        busy: false,
        refreshRequired: true,
      });
      expect(JSON.stringify(local.reader.current())).not.toContain("PRIVATE");
    },
  );

  it("ignores an abandoned read after disposal without publishing its private identities", async () => {
    const local = setup();
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.first();
    local.reader.dispose();
    const count = local.changed.mock.calls.length;
    held.release(page());
    expect(await pending).toBe(false);
    expect(local.changed).toHaveBeenCalledTimes(count);
    expect(local.reader.current().page).toBeNull();
    expect(await local.reader.first()).toBe(false);
  });

  it("supports disposal during the loading publication before a read is submitted", async () => {
    const read = vi.fn();
    let reader;
    reader = createStoredContactDirectoryReader(owner, read, () => reader.dispose());
    expect(await reader.first()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
