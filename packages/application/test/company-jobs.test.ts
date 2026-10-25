import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  CompanyJobsError,
  companyJobsCursorV1,
  createCompanyJobsQuery,
  parseCompanyJobsRequestV1,
  type CompanyJobSummaryV1,
  type ListCompanyJobsRequestV1,
} from "../src/company-jobs.js";

const id = (n: number) => `0198e130-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-25T12:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: at };
const input = () => ({
  specVersion: 1 as const,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 3,
});
const job = (n: number): CompanyJobSummaryV1 => ({
  id: entityId("job", id(n)),
  companyId: entityId("company", id(2)),
  title: "\uFEFFLiteral <script>inert</script>\0😀",
  status: {
    id: entityId("status_definition", id(80)),
    name: "  Literal saved  ",
    category: "saved",
    terminal: false,
    rowVersion: 2,
  },
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
});
const page = (request: ListCompanyJobsRequestV1, items = [job(3)], hasMore = false) => ({
  specVersion: request.specVersion,
  expectedVaultId: request.expectedVaultId,
  companyId: request.companyId,
  expectedCompanyRowVersion: request.expectedCompanyRowVersion,
  includeArchivedCompany: request.includeArchivedCompany,
  includeArchivedJobs: request.includeArchivedJobs,
  items,
  hasMore,
  nextCursor: hasMore ? companyJobsCursorV1(request, items.at(-1)!) : null,
});
const execute = (response: unknown) =>
  createCompanyJobsQuery({ listPage: vi.fn(async () => response) }).execute(input(), context);

describe("company-linked saved-job query", () => {
  it("copies a bounded literal current-status page with independent archive scopes and no totals", async () => {
    const request = parseCompanyJobsRequestV1(input()),
      raw = page(request);
    const result = await execute(raw);
    expect(result).toEqual({ ok: true, value: raw });
    if (!result.ok) throw Error();
    expect(Object.isFrozen(result.value.items[0]?.status)).toBe(true);
    raw.items[0] = job(4);
    expect(result.value.items[0]?.id).toBe(id(3));
    expect(result.value.items[0]?.title).toBe(job(3).title);
    expect(result.value.items[0]?.status?.name).toBe("  Literal saved  ");
    expect(parseCompanyJobsRequestV1({ ...input(), includeArchivedCompany: true })).toMatchObject({
      includeArchivedCompany: true,
      includeArchivedJobs: false,
      limit: 10,
      after: null,
    });
  });
  it.each([
    { specVersion: 2 },
    { expectedVaultId: "not-a-vault" },
    { companyId: "bad" },
    { expectedCompanyRowVersion: 0 },
    { expectedCompanyRowVersion: 1.5 },
    { includeArchivedCompany: null },
    { includeArchivedJobs: "false" },
    { includeArchivedJobs: null },
    { limit: 0 },
    { limit: 26 },
    { limit: 1.5 },
    { extra: "private" },
  ])("rejects invalid request %j before the port", async (change) => {
    const listPage = vi.fn();
    expect(
      await createCompanyJobsQuery({ listPage }).execute(
        { ...input(), ...change } as never,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(listPage).not.toHaveBeenCalled();
  });
  it("rejects hidden, symbol and accessor input without evaluating an accessor", () => {
    const getter = vi.fn(() => id(1));
    expect(() =>
      parseCompanyJobsRequestV1(Object.defineProperty(input(), "expectedVaultId", { get: getter })),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      parseCompanyJobsRequestV1(Object.defineProperty(input(), "secret", { value: "hidden" })),
    ).toThrow();
    expect(() => parseCompanyJobsRequestV1({ ...input(), [Symbol("extra")]: true })).toThrow();
  });
  it("copies the owner and nested continuation before an await", async () => {
    const original = parseCompanyJobsRequestV1({ ...input(), limit: 1 }),
      after = { ...companyJobsCursorV1(original, job(3)) };
    const mutable = { ...input(), limit: 1, after };
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const listPage = vi.fn(async (request: ListCompanyJobsRequestV1) => {
      await held;
      return page(request, [job(4)]);
    });
    const result = createCompanyJobsQuery({ listPage }).execute(mutable, context);
    mutable.companyId = id(9);
    after.jobId = entityId("job", id(8));
    release();
    expect(await result).toMatchObject({
      ok: true,
      value: { companyId: id(2), items: [{ id: id(4) }] },
    });
    expect(listPage.mock.calls[0]?.[0].after?.jobId).toBe(id(3));
  });
  it.each([
    "expectedVaultId",
    "companyId",
    "expectedCompanyRowVersion",
    "includeArchivedCompany",
    "includeArchivedJobs",
  ] as const)("rejects a continuation with different %s", (field) => {
    const request = parseCompanyJobsRequestV1(input()),
      after = companyJobsCursorV1(request, job(3));
    const wrong = {
      ...after,
      [field]:
        typeof after[field] === "boolean" ? true : typeof after[field] === "number" ? 7 : id(8),
    };
    expect(() => parseCompanyJobsRequestV1({ ...input(), after: wrong })).toThrow();
  });
  it.each([
    (p: ReturnType<typeof page>) => ({ ...p, companyId: id(8) }),
    (p: ReturnType<typeof page>) => ({ ...p, expectedCompanyRowVersion: 4 }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [job(4), job(3)] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [job(3), job(3)] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...job(3), companyId: id(8) }] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...job(3), descriptionText: "private" }] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...job(3), title: "\uD800" }] }),
    (p: ReturnType<typeof page>) => ({ ...p, items: [{ ...job(3), archivedAt: at }] }),
    (p: ReturnType<typeof page>) => ({
      ...p,
      items: [{ ...job(3), status: { ...job(3).status, category: "hired_probability" } }],
    }),
    (p: ReturnType<typeof page>) => ({ ...p, hasMore: true }),
    (p: ReturnType<typeof page>) => ({ ...p, total: 1 }),
  ])("rejects malformed, foreign or overclaiming response %#", async (change) => {
    expect(await execute(change(page(parseCompanyJobsRequestV1(input()))))).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });
  it("requires a full bounded page and an exact final-row continuation", async () => {
    const request = parseCompanyJobsRequestV1({ ...input(), limit: 1 });
    const query = (raw: unknown) =>
      createCompanyJobsQuery({ listPage: async () => raw }).execute(request, context);
    const raw = page(request, [job(3)], true);
    expect(await query(raw)).toMatchObject({ ok: true });
    expect(await query({ ...raw, nextCursor: companyJobsCursorV1(request, job(4)) })).toMatchObject(
      { ok: false },
    );
    expect(await query(page(request, [job(3), job(4)]))).toMatchObject({ ok: false });
  });
  it.each([
    new CompanyJobsError("stale"),
    new CompanyJobsError("invalid_state"),
    new CompanyJobsError("unavailable"),
    new Error("PRIVATE path/secret"),
  ])("redacts private failures %#", async (error) => {
    const result = await createCompanyJobsQuery({
      listPage: async () => {
        throw error;
      },
    }).execute(input(), context);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    if (error instanceof CompanyJobsError)
      expect(result).toMatchObject({
        error: {
          code:
            error.code === "stale"
              ? "conflict"
              : error.code === "invalid_state"
                ? "internal"
                : "unavailable",
        },
      });
  });
  it("distinguishes missing owner from an honest empty page and never calls the port for invalid context", async () => {
    expect(await execute(undefined)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await execute(page(parseCompanyJobsRequestV1(input()), []))).toMatchObject({
      ok: true,
      value: { items: [], hasMore: false },
    });
    const listPage = vi.fn();
    expect(
      await createCompanyJobsQuery({ listPage }).execute(input(), {
        ...context,
        operationId: "bad",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(listPage).not.toHaveBeenCalled();
  });
});
