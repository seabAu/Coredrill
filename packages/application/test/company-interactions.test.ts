import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  CompanyInteractionsError,
  companyInteractionReferenceV1,
  createCompanyInteractionsQuery,
  createCompanyInteractionSummaryQuery,
  parseCompanyInteractionsRequestV1,
  parseCompanyInteractionSummaryRequestV1,
  type CompanyInteractionV1,
  type ListCompanyInteractionsRequestV1,
} from "../src/company-interactions.js";

const id = (n: number) => `0198e140-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-25T12:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: at };
const input = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 3,
};
const literal = "\uFEFF<script>literal</script>\0尾😀";
const item = (n = 10): CompanyInteractionV1 => ({
  id: entityId("interaction", id(n)),
  contactId: null,
  currentJob: {
    id: entityId("job", id(5)),
    companyId: entityId("company", id(2)),
    title: literal,
    archivedAt: null,
    rowVersion: 2,
  },
  type: "email_logged",
  direction: "unknown",
  occurredAt: at,
  createdAt: at,
  rowVersion: 1,
  summaryPreview: literal,
  summaryByteLength: new TextEncoder().encode(literal).byteLength,
  summaryTruncated: false,
});
const page = (request: ListCompanyInteractionsRequestV1, items = [item()], hasMore = false) => ({
  specVersion: request.specVersion,
  expectedVaultId: request.expectedVaultId,
  companyId: request.companyId,
  expectedCompanyRowVersion: request.expectedCompanyRowVersion,
  includeArchivedCompany: request.includeArchivedCompany,
  includeArchivedJobs: request.includeArchivedJobs,
  items,
  hasMore,
  nextCursor:
    hasMore && items.at(-1) !== undefined
      ? companyInteractionReferenceV1(request, items.at(-1)!)
      : null,
});
const owner = parseCompanyInteractionsRequestV1(input);
const summaryInput = () => ({
  specVersion: 1 as const,
  reference: companyInteractionReferenceV1(owner, item()),
  summaryByteLength: item().summaryByteLength,
});

describe("company current-linked-job interaction queries", () => {
  it("returns copied frozen literal history without manufacturing a contact or employer-time evidence", async () => {
    const raw = page(owner),
      result = await createCompanyInteractionsQuery({ listPage: async () => raw }).execute(
        input,
        context,
      );
    expect(result).toEqual({ ok: true, value: raw });
    if (!result.ok) throw Error();
    expect(result.value.items[0]?.summaryPreview).toBe(literal);
    expect(result.value.items[0]?.contactId).toBeNull();
    expect(Object.isFrozen(result.value.items[0]?.currentJob)).toBe(true);
    raw.items[0] = item(11);
    expect(result.value.items[0]?.id).toBe(id(10));
    expect(owner).toMatchObject({
      limit: 10,
      after: null,
      includeArchivedCompany: false,
      includeArchivedJobs: false,
    });
  });
  it.each([
    { specVersion: 2 },
    { expectedVaultId: "bad" },
    { companyId: "bad" },
    { expectedCompanyRowVersion: 0 },
    { includeArchivedJobs: null },
    { includeArchivedCompany: "false" },
    { limit: 0 },
    { limit: 26 },
    { limit: 1.5 },
    { after: {} },
    { extra: "private" },
  ])("rejects request %j before port invocation", async (change) => {
    const listPage = vi.fn();
    expect(
      await createCompanyInteractionsQuery({ listPage }).execute(
        { ...input, ...change } as never,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(listPage).not.toHaveBeenCalled();
  });
  it("rejects accessors, hidden and symbol properties without executing them", () => {
    const get = vi.fn(() => id(1));
    expect(() =>
      parseCompanyInteractionsRequestV1(
        Object.defineProperty({ ...input }, "expectedVaultId", { get }),
      ),
    ).toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(() =>
      parseCompanyInteractionsRequestV1(
        Object.defineProperty({ ...input }, "hidden", { value: true }),
      ),
    ).toThrow();
    expect(() =>
      parseCompanyInteractionsRequestV1({ ...input, [Symbol("extra")]: true }),
    ).toThrow();
  });
  it("copies the original owner and contact-aware continuation before awaiting the port", async () => {
    const after = { ...companyInteractionReferenceV1(owner, item()) },
      mutable = { ...input, after };
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = createCompanyInteractionsQuery({
      listPage: async (request) => {
        await held;
        return page(request, [item(11)]);
      },
    }).execute(mutable, context);
    mutable.companyId = id(3);
    after.contactId = entityId("contact", id(8));
    release();
    const result = await pending;
    expect(result).toMatchObject({ ok: true, value: { companyId: id(2) } });
  });
  it.each([
    (p: ReturnType<typeof page>) => ({ ...p, expectedCompanyRowVersion: 4 }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [item(), item()] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [item(11), item(10)] }),
    (p: ReturnType<typeof page>) => ({
      ...p,
      items: [{ ...item(), currentJob: { ...item().currentJob, companyId: id(3) } }],
    }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...item(), summaryByteLength: 1 }] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...item(), summaryTruncated: true }] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...item(), summaryPreview: "\ud800" }] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...item(), privateBody: "extra" }] }),
    (p: ReturnType<typeof page>) => ({
      ...p,
      nextCursor: companyInteractionReferenceV1(owner, item()),
    }),
  ])("rejects corrupt or cross-scope page output", async (change) => {
    expect(
      await createCompanyInteractionsQuery({ listPage: async () => change(page(owner)) }).execute(
        input,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
  });
  it("requires an exact last-item cursor including nullable contact and job versions", async () => {
    const request = parseCompanyInteractionsRequestV1({ ...input, limit: 1 }),
      raw = page(request, [item()], true);
    const run = (value: unknown) =>
      createCompanyInteractionsQuery({ listPage: async () => value }).execute(
        { ...input, limit: 1 },
        context,
      );
    expect(await run(raw)).toMatchObject({ ok: true });
    expect(
      await run({ ...raw, nextCursor: { ...raw.nextCursor, contactId: id(8) } }),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(() =>
      parseCompanyInteractionsRequestV1({
        ...input,
        after: { ...raw.nextCursor, includeArchivedJobs: true },
      }),
    ).toThrow();
    expect(() =>
      parseCompanyInteractionsRequestV1({
        ...input,
        after: { ...raw.nextCursor, includeArchivedJobs: undefined },
      }),
    ).toThrow();
  });
  it.each([
    [new CompanyInteractionsError("stale"), "conflict", false],
    [new CompanyInteractionsError("invalid_state"), "internal", false],
    [Error("PRIVATE path/token/summary"), "unavailable", true],
  ] as const)("redacts port failures with safe retry meaning", async (error, code, retryable) => {
    const result = await createCompanyInteractionsQuery({
      listPage: async () => {
        throw error;
      },
    }).execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code, retryable } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("distinguishes absent owner from confirmed empty history", async () => {
    expect(
      await createCompanyInteractionsQuery({ listPage: async () => undefined }).execute(
        input,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(
      await createCompanyInteractionsQuery({ listPage: async () => page(owner, []) }).execute(
        input,
        context,
      ),
    ).toMatchObject({ ok: true, value: { items: [], hasMore: false } });
  });
  it("returns exact bounded summary bytes, including BOM and NUL", async () => {
    const result = await createCompanyInteractionSummaryQuery({
      readSummaryPart: async (request) => ({
        ...request,
        limitBytes: undefined,
        bytes: new TextEncoder().encode(literal),
      }),
    }).execute(summaryInput(), context);
    // A port cannot include a request-only field, even undefined.
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    const valid = await createCompanyInteractionSummaryQuery({
      readSummaryPart: async (request) => ({
        specVersion: 1,
        reference: request.reference,
        summaryByteLength: request.summaryByteLength,
        byteOffset: request.byteOffset,
        bytes: new TextEncoder().encode(literal),
      }),
    }).execute(summaryInput(), context);
    expect(valid).toMatchObject({
      ok: true,
      value: { text: literal, hasMore: false, nextByteOffset: null },
    });
  });
  it.each([
    { byteOffset: -1 },
    { byteOffset: 800001 },
    { limitBytes: 3 },
    { limitBytes: 65537 },
    { summaryByteLength: 800001 },
    { extra: true },
  ])("rejects invalid summary request %j before port invocation", async (change) => {
    const readSummaryPart = vi.fn();
    expect(
      await createCompanyInteractionSummaryQuery({ readSummaryPart }).execute(
        { ...summaryInput(), ...change } as never,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(readSummaryPart).not.toHaveBeenCalled();
  });
  it("bounds UTF-8 slices and rejects stale references or invalid scalars", async () => {
    const request = parseCompanyInteractionSummaryRequestV1({
      ...summaryInput(),
      summaryByteLength: 8,
      limitBytes: 4,
    });
    const run = (bytes: Uint8Array, reference = request.reference) =>
      createCompanyInteractionSummaryQuery({
        readSummaryPart: async () => ({
          specVersion: 1,
          reference,
          summaryByteLength: 8,
          byteOffset: 0,
          bytes,
        }),
      }).execute(request, context);
    expect(await run(new Uint8Array([65, 0xf0, 0x9f, 0x98]))).toMatchObject({
      ok: true,
      value: { text: "A", bytesRead: 1, nextByteOffset: 1, hasMore: true },
    });
    expect(await run(new Uint8Array([0x80, 65, 65, 65]))).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(
      await run(new Uint8Array([65, 65, 65, 65]), { ...request.reference, jobRowVersion: 3 }),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
});
