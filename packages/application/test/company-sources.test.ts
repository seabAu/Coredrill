import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  CompanySourcesError,
  companySourcesCursorV1,
  createCompanySourcesQuery,
  parseCompanySourcesRequestV1,
  storedSourceUrlV1,
  type CompanySourceV1,
  type ListCompanySourcesRequestV1,
} from "../src/company-sources.js";

const id = (n: number) => `0198e150-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-25T12:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: at };
const input = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 3,
};
const literalUrl = "https://EXAMPLE.test:443/%7eRole?q=%2f",
  literal = "\uFEFFLiteral <role>\0😀";
const source = (n = 10): CompanySourceV1 => ({
  id: entityId("job-source", id(n)),
  currentJob: {
    id: entityId("job", id(5)),
    companyId: entityId("company", id(2)),
    title: literal,
    archivedAt: null,
    rowVersion: 1,
  },
  connectorId: null,
  externalId: literal,
  canonicalUrl: storedSourceUrlV1(literalUrl),
  applyUrl: null,
  firstSeenAt: at,
  lastSeenAt: at,
  contentHash: null,
  primary: false,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
  latestSnapshot: {
    id: entityId("source-snapshot", id(n + 100)),
    jobSourceId: entityId("job-source", id(n)),
    capturedAt: at,
    createdAt: at,
    extractorId: "synthetic.extractor",
    extractorVersion: "1.0.0",
    contentHash: "a".repeat(64),
    retentionClass: "synthetic",
    rowVersion: 1,
  },
});
const owner = parseCompanySourcesRequestV1(input);
const page = (
  request: ListCompanySourcesRequestV1 = owner,
  items = [source()],
  hasMore = false,
) => ({
  specVersion: request.specVersion,
  expectedVaultId: request.expectedVaultId,
  companyId: request.companyId,
  expectedCompanyRowVersion: request.expectedCompanyRowVersion,
  includeArchivedCompany: request.includeArchivedCompany,
  includeArchivedJobs: request.includeArchivedJobs,
  items,
  hasMore,
  nextCursor:
    hasMore && items.at(-1) !== undefined ? companySourcesCursorV1(request, items.at(-1)!) : null,
});
const run = (response: unknown) =>
  createCompanySourcesQuery({ listPage: async () => response }).execute(input, context);
describe("company currently linked listing-source query", () => {
  it("preserves literal URL text, independently validates its destination and freezes nested metadata", async () => {
    const raw = page(),
      result = await run(raw);
    expect(result).toEqual({ ok: true, value: raw });
    if (!result.ok) throw Error();
    expect(result.value.items[0]?.canonicalUrl).toEqual({
      text: literalUrl,
      href: "https://example.test/%7eRole?q=%2f",
    });
    expect(Object.isFrozen(result.value.items[0]?.canonicalUrl)).toBe(true);
    expect(Object.isFrozen(result.value.items[0]?.latestSnapshot)).toBe(true);
    raw.items[0] = source(11);
    expect(result.value.items[0]?.id).toBe(id(10));
  });
  it("represents source-only records and nullable metadata without inventing captured evidence", async () => {
    expect(
      await run(
        page(owner, [{ ...source(), externalId: null, canonicalUrl: null, latestSnapshot: null }]),
      ),
    ).toMatchObject({ ok: true, value: { items: [{ canonicalUrl: null, latestSnapshot: null }] } });
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
    { includeArchivedCompany: null },
    { includeArchivedJobs: "false" },
    { limit: 0 },
    { limit: 26 },
    { after: {} },
    { extra: "private" },
  ])("rejects invalid input %j before the port", async (change) => {
    const listPage = vi.fn();
    expect(
      await createCompanySourcesQuery({ listPage }).execute(
        { ...input, ...change } as never,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(listPage).not.toHaveBeenCalled();
  });
  it("rejects hidden/symbol/accessor fields without invoking getters", () => {
    const get = vi.fn(() => id(1));
    expect(() =>
      parseCompanySourcesRequestV1(Object.defineProperty({ ...input }, "expectedVaultId", { get })),
    ).toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(() =>
      parseCompanySourcesRequestV1(Object.defineProperty({ ...input }, "hidden", { value: true })),
    ).toThrow();
    expect(() => parseCompanySourcesRequestV1({ ...input, [Symbol("extra")]: true })).toThrow();
  });
  it("copies the original owner and canonical source/job cursor before awaiting", async () => {
    const after = { ...companySourcesCursorV1(owner, source()) },
      mutable = { ...input, after };
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = createCompanySourcesQuery({
      listPage: async (request) => {
        await held;
        return page(request, [source(11)]);
      },
    }).execute(mutable, context);
    mutable.companyId = id(3);
    after.sourceId = entityId("job-source", id(7));
    release();
    expect(await pending).toMatchObject({ ok: true, value: { companyId: id(2) } });
  });
  it.each([
    { canonicalUrl: { text: literalUrl, href: "https://other.test/" } },
    { canonicalUrl: { text: "javascript:alert(1)", href: "javascript:alert(1)" } },
    { canonicalUrl: { text: "https://user:private@example.test/", href: "https://example.test/" } },
    { contentHash: "A".repeat(64) },
    { primary: 1 },
    { externalId: "\ud800" },
    { currentJob: { ...source().currentJob, companyId: id(3) } },
    { latestSnapshot: { ...source().latestSnapshot, jobSourceId: id(11) } },
    { latestSnapshot: { ...source().latestSnapshot, contentHash: "not-a-hash" } },
    { latestSnapshot: { ...source().latestSnapshot, rawText: "PRIVATE body" } },
    { rawText: "PRIVATE body" },
  ])("rejects invalid/cross-scope/overfetched source output", async (change) => {
    expect(await run(page(owner, [{ ...source(), ...change } as never]))).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });
  it("validates page order, duplicate identities, exact last cursor and independent archive scope", async () => {
    expect(await run(page(owner, [source(), source()]))).toMatchObject({ ok: false });
    expect(await run(page(owner, [source(11), source(10)]))).toMatchObject({ ok: false });
    const request = parseCompanySourcesRequestV1({ ...input, limit: 1 }),
      raw = page(request, [source()], true);
    expect(
      await createCompanySourcesQuery({ listPage: async () => raw }).execute(
        { ...input, limit: 1 },
        context,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await createCompanySourcesQuery({
        listPage: async () => ({ ...raw, nextCursor: { ...raw.nextCursor, jobRowVersion: 2 } }),
      }).execute({ ...input, limit: 1 }, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(() =>
      parseCompanySourcesRequestV1({
        ...input,
        after: { ...raw.nextCursor, includeArchivedJobs: true },
      }),
    ).toThrow();
    expect(() =>
      parseCompanySourcesRequestV1({
        ...input,
        after: { ...raw.nextCursor, includeArchivedCompany: undefined },
      }),
    ).toThrow();
  });
  it("distinguishes absent owners from confirmed empty pages", async () => {
    expect(await run(undefined)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await run(page(owner, []))).toMatchObject({
      ok: true,
      value: { items: [], hasMore: false, nextCursor: null },
    });
  });
  it.each([
    [new CompanySourcesError("stale"), "conflict", false],
    [new CompanySourcesError("invalid_state"), "internal", false],
    [Error("PRIVATE path/token/body"), "unavailable", true],
  ] as const)(
    "redacts port failures with truthful retry semantics",
    async (error, code, retryable) => {
      const result = await createCompanySourcesQuery({
        listPage: async () => {
          throw error;
        },
      }).execute(input, context);
      expect(result).toMatchObject({ ok: false, error: { code, retryable } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
    },
  );
});
