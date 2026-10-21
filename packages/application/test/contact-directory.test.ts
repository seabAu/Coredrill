import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  ContactDirectoryError,
  createContactDirectoryQuery,
  type ContactDirectoryPort,
  type ListContactDirectoryInputV1,
} from "../src/contact-directory.js";

const vaultId = entityId("vault", "0198e103-0000-7000-8000-000000000001");
const otherVault = entityId("vault", "0198e103-0000-7000-8000-000000000002");
const companyId = entityId("company", "0198e103-0000-7000-8000-000000000003");
const contactId = entityId("contact", "0198e103-0000-7000-8000-000000000004");
const otherContact = entityId("contact", "0198e103-0000-7000-8000-000000000005");
const at = instant("2026-10-21T12:00:00.000Z");
const context = {
  operationId: entityId("application-operation", "0198e103-0000-7000-8000-000000000006"),
  initiatedAt: at,
};
const input = { specVersion: 1, expectedVaultId: vaultId } as const;
const contact = () => ({
  id: contactId,
  name: "  Synthetic <person> & literal identity  ",
  role: null,
  companyId: null,
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
});
const page = () => ({
  specVersion: 1,
  vaultId,
  includeArchived: false,
  companyId: null,
  items: [contact()],
  hasMore: false,
  nextCursor: null,
});
const anchor = () => ({
  specVersion: 1 as const,
  vaultId,
  includeArchived: false,
  companyId: null,
  createdAt: at,
  id: contactId,
  rowVersion: 1,
});
const execute = async (response: unknown, request: unknown = input) => {
  const listPage = vi.fn(async () => response);
  return {
    result: await createContactDirectoryQuery({ listPage }).execute(
      request as ListContactDirectoryInputV1,
      context,
    ),
    listPage,
  };
};

describe("version-1 minimized contact directory", () => {
  it("is read-only, bounded and copied without inferring contact origin or methods", async () => {
    const source = page();
    const { result, listPage } = await execute(source);
    expect(createContactDirectoryQuery({ listPage }).readOnly).toBe(true);
    expect(listPage).toHaveBeenCalledWith({
      ...input,
      includeArchived: false,
      companyId: null,
      limit: 25,
      after: null,
    });
    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok) throw new Error("Expected valid contact page");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);
    source.items[0]!.name = "Changed later";
    expect(result.value.items[0]?.name).toBe("  Synthetic <person> & literal identity  ");
    expect(Object.keys(result.value.items[0]!)).toEqual([
      "id",
      "name",
      "role",
      "companyId",
      "archivedAt",
      "createdAt",
      "updatedAt",
      "rowVersion",
    ]);
  });

  it.each([
    null,
    {},
    { ...input, specVersion: 2 },
    { ...input, expectedVaultId: "bad" },
    { ...input, companyId: "bad" },
    { ...input, includeArchived: "false" },
    { ...input, limit: 0 },
    { ...input, limit: 101 },
    { ...input, limit: 1.5 },
    { ...input, limit: Number.NaN },
    { ...input, notes: "private" },
    { ...input, after: {} },
  ])("rejects invalid input before storage (%j)", async (request) => {
    const { result, listPage } = await execute(page(), request);
    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(listPage).not.toHaveBeenCalled();
  });

  it.each([null, { ...context, operationId: "bad" }, { ...context, initiatedAt: "bad" }])(
    "validates operation context before storage (%j)",
    async (invalid) => {
      const listPage = vi.fn(async () => page());
      expect(
        await createContactDirectoryQuery({ listPage }).execute(input, invalid as typeof context),
      ).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(listPage).not.toHaveBeenCalled();
    },
  );

  it("binds cursors to vault, archive and selected-company scope", async () => {
    for (const after of [
      { ...anchor(), vaultId: otherVault },
      { ...anchor(), includeArchived: true },
      { ...anchor(), companyId },
    ]) {
      const { result, listPage } = await execute(page(), { ...input, after });
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(listPage).not.toHaveBeenCalled();
    }
    const filtered = {
      ...page(),
      companyId,
      items: [{ ...contact(), companyId, role: "  Literal role  " }],
    };
    expect((await execute(filtered, { ...input, companyId })).result).toEqual({
      ok: true,
      value: filtered,
    });
    expect(
      (await execute({ ...filtered, items: [contact()] }, { ...input, companyId })).result,
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("copies the original request and cursor before held asynchronous work", async () => {
    const after = anchor();
    const request = { ...input, limit: 1, after };
    const port: ContactDirectoryPort = {
      listPage: async (received) => {
        request.expectedVaultId = otherVault;
        after.rowVersion = 99;
        expect(received.expectedVaultId).toBe(vaultId);
        expect(received.after?.rowVersion).toBe(1);
        expect(Object.isFrozen(received)).toBe(true);
        expect(Object.isFrozen(received.after)).toBe(true);
        return { ...page(), items: [] };
      },
    };
    expect((await createContactDirectoryQuery(port).execute(request, context)).ok).toBe(true);
  });

  it.each([
    "notes",
    "email",
    "phone",
    "publicProfileUrl",
    "confidence",
    "userConfirmed",
    "origin",
    "provenance",
    "total",
  ])("rejects overbroad private or inferred field %s", async (key) => {
    const source = { ...page(), items: [{ ...contact(), [key]: "Private sentinel" }] };
    const { result } = await execute(source);
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("sentinel");
  });

  it.each([
    { ...page(), specVersion: 2 },
    { ...page(), vaultId: otherVault },
    { ...page(), companyId },
    { ...page(), includeArchived: true },
    { ...page(), items: [contact(), contact()] },
    { ...page(), items: [{ ...contact(), id: "bad" }] },
    { ...page(), items: [{ ...contact(), name: "\u0000bad" }] },
    { ...page(), items: [{ ...contact(), name: " " }] },
    { ...page(), items: [{ ...contact(), name: "x".repeat(513) }] },
    { ...page(), items: [{ ...contact(), role: "x".repeat(513) }] },
    { ...page(), items: [{ ...contact(), role: "\u007fbad" }] },
    { ...page(), items: [{ ...contact(), companyId: undefined }] },
    { ...page(), items: [{ ...contact(), rowVersion: 0 }] },
    { ...page(), items: [{ ...contact(), archivedAt: at }] },
    { ...page(), items: [{ ...contact(), updatedAt: "2025-01-01T00:00:00.000Z" }] },
    { ...page(), items: [{ ...contact(), archivedAt: "2027-01-01T00:00:00.000Z" }] },
    { ...page(), hasMore: true },
    { ...page(), hasMore: "false" },
    { ...page(), nextCursor: anchor() },
    { ...page(), privatePath: "Private sentinel" },
  ])("rejects malformed or mismatched results (%j)", async (response) => {
    const { result } = await execute(response);
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(JSON.stringify(result)).not.toContain("Private");
  });

  it("preserves explicit archives and maximum literal identities without a wall-clock cutoff", async () => {
    const future = "2027-01-01T00:00:00.000Z";
    const source = {
      ...page(),
      includeArchived: true,
      items: [
        {
          ...contact(),
          name: "x".repeat(512),
          role: "y".repeat(512),
          createdAt: future,
          updatedAt: future,
          archivedAt: future,
        },
      ],
    };
    expect((await execute(source, { ...input, includeArchived: true })).result).toEqual({
      ok: true,
      value: source,
    });
  });

  it("validates exact continuation, ordered ties, consumed anchors and bounds", async () => {
    const nextCursor = anchor();
    const source = { ...page(), hasMore: true, nextCursor };
    expect((await execute(source, { ...input, limit: 1 })).result.ok).toBe(true);
    for (const response of [
      { ...source, nextCursor: { ...nextCursor, rowVersion: 2 } },
      { ...source, nextCursor: { ...nextCursor, vaultId: otherVault } },
      { ...source, nextCursor: { ...nextCursor, companyId } },
      { ...source, nextCursor: { ...nextCursor, includeArchived: true } },
      { ...source, nextCursor: { ...nextCursor, id: otherContact } },
      { ...source, items: [] },
    ])
      expect((await execute(response, { ...input, limit: 1 })).result).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
    expect((await execute(page(), { ...input, after: anchor() })).result).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    const ordered = { ...page(), items: [contact(), { ...contact(), id: otherContact }] };
    expect((await execute(ordered)).result.ok).toBe(true);
    expect((await execute(ordered, { ...input, limit: 1 })).result).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(
      (await execute({ ...ordered, items: [...ordered.items].reverse() })).result,
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it.each([
    ["cursor_invalidated", "conflict", true],
    ["invalid_state", "internal", false],
    ["unavailable", "unavailable", true],
  ] as const)("redacts %s", async (code, expected, retryable) => {
    const result = await createContactDirectoryQuery({
      listPage: async () => {
        throw new ContactDirectoryError(code);
      },
    }).execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: expected, retryable } });
  });

  it("does not present missing scope as an empty directory and redacts private errors", async () => {
    expect((await execute(undefined)).result).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    const result = await createContactDirectoryQuery({
      listPage: async () => {
        throw new Error("Private path/contact sentinel");
      },
    }).execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("Private");
  });
});
