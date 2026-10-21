import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  CompanyDirectoryError,
  createCompanyDirectoryQuery,
  type CompanyDirectoryPort,
} from "../src/company-directory.js";

const vaultId = entityId("vault", "0198e102-0000-7000-8000-000000000001");
const otherVaultId = entityId("vault", "0198e102-0000-7000-8000-000000000002");
const companyId = entityId("company", "0198e102-0000-7000-8000-000000000003");
const at = instant("2026-10-21T12:00:00.000Z");
const context = {
  operationId: entityId("application-operation", "0198e102-0000-7000-8000-000000000004"),
  initiatedAt: at,
};
const input = { specVersion: 1, expectedVaultId: vaultId } as const;
const company = () => ({
  id: companyId,
  canonicalName: "  Synthetic <company> & literal name  ",
  websiteUrl: "http://synthetic.example/",
  domain: "synthetic.example",
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
});
const page = () => ({
  specVersion: 1,
  vaultId,
  includeArchived: false,
  items: [company()],
  hasMore: false,
  nextCursor: null,
});
const execute = async (response: unknown, request: unknown = input) => {
  const listPage = vi.fn(async () => response);
  const query = createCompanyDirectoryQuery({ listPage });
  return { result: await query.execute(request as typeof input, context), listPage };
};

describe("version-1 company directory query", () => {
  it.each([null, { ...context, operationId: "bad" }, { ...context, initiatedAt: "bad" }])(
    "rejects an invalid operation context before storage (%j)",
    async (invalidContext) => {
      const listPage = vi.fn(async () => page());
      const result = await createCompanyDirectoryQuery({ listPage }).execute(
        input,
        invalidContext as typeof context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
      expect(listPage).not.toHaveBeenCalled();
    },
  );

  it("accepts explicit archived scope and missing optional stored facts without manufacturing values", async () => {
    const source = {
      ...page(),
      includeArchived: true,
      items: [{ ...company(), websiteUrl: null, domain: null, archivedAt: at }],
    };
    expect((await execute(source, { ...input, includeArchived: true })).result).toEqual({
      ok: true,
      value: source,
    });
  });

  it("rejects an over-limit but otherwise ordered unique page", async () => {
    const source = {
      ...page(),
      items: [company(), { ...company(), id: "0198e102-0000-7000-8000-000000000005" }],
    };
    expect((await execute(source, { ...input, limit: 1 })).result).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });

  it("is read-only, scoped and bounded by default, retaining exact names and safe HTTP links", async () => {
    const source = page();
    const { result, listPage } = await execute(source);
    expect(listPage).toHaveBeenCalledWith({
      ...input,
      includeArchived: false,
      limit: 25,
      after: null,
    });
    expect(createCompanyDirectoryQuery({ listPage }).readOnly).toBe(true);
    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok) throw new Error("Expected valid directory page");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);
    expect(result.value.items[0]).not.toBe(source.items[0]);
    source.items[0]!.canonicalName = "Later mutation";
    expect(result.value.items[0]?.canonicalName).toBe("  Synthetic <company> & literal name  ");
  });

  it.each([
    null,
    {},
    { ...input, specVersion: 2 },
    { ...input, expectedVaultId: "bad" },
    { ...input, includeArchived: "false" },
    { ...input, limit: 0 },
    { ...input, limit: 101 },
    { ...input, limit: 1.5 },
    { ...input, notes: "Must not enter a read contract" },
    { ...input, after: { specVersion: 1 } },
  ])("rejects invalid requests before invoking storage (%j)", async (request) => {
    const { result, listPage } = await execute(page(), request);
    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(listPage).not.toHaveBeenCalled();
  });

  it("copies the original viewed request and cursor before asynchronous storage work", async () => {
    const anchor = {
      specVersion: 1 as const,
      vaultId,
      includeArchived: false,
      createdAt: at,
      id: companyId,
      rowVersion: 1,
    };
    const request = { ...input, limit: 1, after: anchor };
    let captured: unknown;
    const port: CompanyDirectoryPort = {
      listPage: async (received) => {
        captured = received;
        request.expectedVaultId = otherVaultId;
        anchor.rowVersion = 99;
        expect(Object.isFrozen(received)).toBe(true);
        expect(Object.isFrozen(received.after)).toBe(true);
        return { ...page(), items: [] };
      },
    };
    const result = await createCompanyDirectoryQuery(port).execute(request, context);
    expect(result.ok).toBe(true);
    expect(captured).toMatchObject({ expectedVaultId: vaultId, after: { rowVersion: 1 } });
  });

  it("rejects a cursor from another vault or archive scope before storage", async () => {
    for (const after of [
      {
        specVersion: 1,
        vaultId: otherVaultId,
        includeArchived: false,
        createdAt: at,
        id: companyId,
        rowVersion: 1,
      },
      {
        specVersion: 1,
        vaultId,
        includeArchived: true,
        createdAt: at,
        id: companyId,
        rowVersion: 1,
      },
    ]) {
      const { result, listPage } = await execute(page(), { ...input, after });
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(listPage).not.toHaveBeenCalled();
    }
  });

  it.each([
    { ...page(), specVersion: 2 },
    { ...page(), vaultId: otherVaultId },
    { ...page(), includeArchived: true },
    { ...page(), items: [company(), company()] },
    {
      ...page(),
      items: [{ ...company(), notes: "Private notes must not cross this summary boundary" }],
    },
    { ...page(), items: [{ ...company(), canonicalName: "\u0000invalid" }] },
    { ...page(), items: [{ ...company(), canonicalName: "x".repeat(513) }] },
    { ...page(), items: [{ ...company(), websiteUrl: "javascript:alert(1)" }] },
    { ...page(), items: [{ ...company(), archivedAt: at }] },
    { ...page(), items: [{ ...company(), rowVersion: 0 }] },
    { ...page(), items: [{ ...company(), updatedAt: "2025-01-01T00:00:00.000Z" }] },
    { ...page(), hasMore: true },
    { ...page(), nextCursor: { specVersion: 1 } },
    { ...page(), privatePath: "Private implementation detail" },
  ])("fails closed for malformed or overbroad port results (%j)", async (response) => {
    const { result } = await execute(response);
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("Private");
  });

  it("accepts 512-character names and future-dated stored records without a wall-clock cutoff", async () => {
    const source = {
      ...page(),
      items: [
        {
          ...company(),
          canonicalName: "x".repeat(512),
          createdAt: "2027-01-01T00:00:00.000Z",
          updatedAt: "2027-01-01T00:00:00.000Z",
        },
      ],
    };
    expect((await execute(source)).result).toEqual({ ok: true, value: source });
  });

  it("validates page ordering and correlates continuation to the exact final row", async () => {
    const cursor = {
      specVersion: 1 as const,
      vaultId,
      includeArchived: false,
      createdAt: at,
      id: companyId,
      rowVersion: 1,
    };
    const source = { ...page(), hasMore: true, nextCursor: cursor };
    const valid = await execute(source, { ...input, limit: 1 });
    expect(valid.result.ok).toBe(true);
    for (const response of [
      { ...source, nextCursor: { ...cursor, rowVersion: 2 } },
      { ...source, nextCursor: { ...cursor, vaultId: otherVaultId } },
      { ...source, nextCursor: { ...cursor, includeArchived: true } },
      { ...source, hasMore: false },
      {
        ...page(),
        items: [
          company(),
          {
            ...company(),
            id: "0198e102-0000-7000-8000-000000000005",
            createdAt: "2027-01-01T00:00:00.000Z",
            updatedAt: "2027-01-01T00:00:00.000Z",
          },
        ],
      },
    ])
      expect(
        (await execute(response, { ...input, limit: response.hasMore ? 1 : 25 })).result,
      ).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
  });

  it("rejects a response at or before its already-consumed cursor", async () => {
    const after = {
      specVersion: 1 as const,
      vaultId,
      includeArchived: false,
      createdAt: at,
      id: companyId,
      rowVersion: 1,
    };
    expect((await execute(page(), { ...input, after })).result).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });

  it.each([
    ["cursor_invalidated", "conflict", true],
    ["invalid_state", "internal", false],
    ["unavailable", "unavailable", true],
  ] as const)("maps %s without leaking private port details", async (code, expected, retryable) => {
    const port = {
      listPage: async () => {
        throw new CompanyDirectoryError(code);
      },
    };
    const result = await createCompanyDirectoryQuery(port).execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: expected, retryable } });
  });

  it("distinguishes a missing viewed vault and redacts unknown private exceptions", async () => {
    expect((await execute(undefined)).result).toMatchObject({
      ok: false,
      error: { code: "not_found", retryable: false },
    });
    const result = await createCompanyDirectoryQuery({
      listPage: async () => {
        throw new Error("Private database/path/contact details");
      },
    }).execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("Private");
  });
});
