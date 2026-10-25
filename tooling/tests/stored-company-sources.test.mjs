import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import {
  companySourcesCursorV1,
  parseCompanySourcesRequestV1,
  storedSourceUrlV1,
} from "../../packages/application/dist/index.js";
import { createStoredCompanySourcesApi } from "../../apps/web/src/stored-company-sources.ts";
import { createStoredCompanySourcesReader } from "../../apps/web/src/stored-company-sources-reader.ts";
import {
  COMPANY_SOURCE_RETURN_KIND,
  readCompanySourceReturn,
} from "../../apps/web/src/company-source-navigation.ts";
import { NAVIGATION_ENTRY_KEY } from "../../apps/web/src/guarded-navigation.ts";

const id = (n) => `0198e153-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-25T12:00:00.000Z";
const input = {
  specVersion: 1,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 1,
  limit: 1,
};
const context = () => ({
  operationId: entityId("application-operation", id(90)),
  initiatedAt: instant(at),
});
const owner = parseCompanySourcesRequestV1(input);
const source = (n = 10) => ({
  id: id(n),
  currentJob: {
    id: id(5),
    companyId: id(2),
    title: "Literal <job> 😀",
    archivedAt: null,
    rowVersion: 1,
  },
  connectorId: null,
  externalId: null,
  canonicalUrl: storedSourceUrlV1("https://EXAMPLE.test:443/%7eRole"),
  applyUrl: null,
  firstSeenAt: at,
  lastSeenAt: at,
  contentHash: null,
  primary: false,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
  latestSnapshot: null,
});
const page = (request = owner, items = [source()], hasMore = false) => ({
  ok: true,
  value: {
    specVersion: request.specVersion,
    expectedVaultId: request.expectedVaultId,
    companyId: request.companyId,
    expectedCompanyRowVersion: request.expectedCompanyRowVersion,
    includeArchivedCompany: request.includeArchivedCompany,
    includeArchivedJobs: request.includeArchivedJobs,
    items,
    hasMore,
    nextCursor: hasMore ? companySourcesCursorV1(request, items.at(-1)) : null,
  },
});
const failure = (code = "unavailable", retryable = true) => ({
  ok: false,
  error: { code, retryable, message: "PRIVATE path and source body" },
});
const held = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const history = () => ({
  kind: COMPANY_SOURCE_RETURN_KIND,
  request: { ...owner, after: { ...companySourcesCursorV1(owner, source()) } },
  sourceId: id(11),
  jobId: id(5),
  scrollY: 125,
});

describe("selected-runtime company listing sources and owned page reader", () => {
  it.each([
    {},
    { ...input, companyId: "bad" },
    { ...input, expectedCompanyRowVersion: 0 },
    { ...input, includeArchivedJobs: null },
    { ...input, limit: 26 },
    { ...input, url: "PRIVATE" },
  ])("validates %j before opening selected storage", async (value) => {
    const open = vi.fn();
    expect(await createStoredCompanySourcesApi(open, context).page(value)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
  });
  it("retains original vault scope while database opening is held and rejects a foreign physical root", async () => {
    const wait = held(),
      mutable = { ...input },
      query = vi.fn(async () => [{ id: id(3) }]);
    const pending = createStoredCompanySourcesApi(async () => {
      await wait.promise;
      return { query, transaction: (work) => work({ query }) };
    }, context).page(mutable);
    mutable.expectedVaultId = id(3);
    wait.release();
    expect(await pending).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("redacts storage failure without switching adapters", async () => {
    const open = vi.fn(async () => {
      throw Error("PRIVATE local database path");
    });
    const result = await createStoredCompanySourcesApi(open, context).page(input);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("keeps unread distinct from confirmed empty and does not issue a construction-time read", async () => {
    const read = vi.fn(async (request) => page(request, [])),
      reader = createStoredCompanySourcesReader(input, read, vi.fn());
    expect(reader.current().page).toBeNull();
    expect(read).not.toHaveBeenCalled();
    await reader.first();
    expect(reader.current().page.items).toEqual([]);
  });
  it("serializes requests, retains stale pages and retries the exact failed continuation without auto retry", async () => {
    const wait = held(),
      read = vi
        .fn()
        .mockImplementationOnce(async (request) => page(request, [source()], true))
        .mockImplementationOnce(async () => {
          await wait.promise;
          return failure();
        })
        .mockImplementationOnce(async (request) => page(request, [source(11)]));
    const reader = createStoredCompanySourcesReader(input, read, vi.fn());
    await reader.first();
    const pending = reader.next();
    expect(await reader.first()).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    wait.release();
    expect(await pending).toBe(false);
    const failed = reader.current().failedRequest;
    expect(reader.current().page.items[0].id).toBe(id(10));
    expect(await reader.next()).toBe(false);
    expect(await reader.retry()).toBe(true);
    expect(read.mock.calls[2][0]).toBe(failed);
    expect(reader.current().page.items[0].id).toBe(id(11));
    expect(JSON.stringify(reader.current())).not.toContain("PRIVATE");
  });
  it("retires late results and requires a new owner after stale or malformed output", async () => {
    const wait = held(),
      changed = vi.fn(),
      reader = createStoredCompanySourcesReader(
        input,
        async (request) => {
          await wait.promise;
          return page(request);
        },
        changed,
      );
    const pending = reader.first(),
      count = changed.mock.calls.length;
    reader.dispose();
    wait.release();
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(count);
    for (const response of [
      failure("conflict", false),
      { ...page(), value: { ...page().value, companyId: id(3) } },
    ]) {
      const read = vi.fn(async () => response),
        next = createStoredCompanySourcesReader(input, read, vi.fn());
      await next.first();
      expect(next.current().refreshRequired).toBe(true);
      expect(await next.first()).toBe(false);
      expect(await next.retry()).toBe(false);
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
  it("restores only the exact company/archive/revision/limit scope and rejects repeated page identities", async () => {
    const request = history().request,
      read = vi.fn(async (query) => page(query, [source(11)])),
      reader = createStoredCompanySourcesReader(input, read, vi.fn());
    expect(await reader.restore(request)).toBe(true);
    expect(read.mock.calls[0][0]).toEqual(request);
    expect(() => reader.restore({ ...request, expectedCompanyRowVersion: 2 })).toThrow();
    expect(() => reader.restore({ ...request, includeArchivedJobs: true })).toThrow();
    expect(read).toHaveBeenCalledTimes(1);
    const duplicate = createStoredCompanySourcesReader(
      input,
      async (query) => page(query, [source()], true),
      vi.fn(),
    );
    await duplicate.first();
    expect(await duplicate.next()).toBe(false);
    expect(duplicate.current().refreshRequired).toBe(true);
  });
});
describe("content-free company source return history", () => {
  it("copies/freeze owns exact page metadata and strips the validated navigation coordinator stamp", () => {
    const raw = history(),
      result = readCompanySourceReturn({ ...raw, [NAVIGATION_ENTRY_KEY]: 7 });
    expect(result).toEqual(raw);
    expect(Object.isFrozen(result.request.after)).toBe(true);
    raw.request.after.sourceRowVersion = 2;
    expect(result.request.after.sourceRowVersion).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/EXAMPLE|Literal|href|title/u);
  });
  it.each([
    { kind: "other" },
    { sourceId: "bad" },
    { jobId: "bad" },
    { scrollY: -1 },
    { scrollY: Infinity },
    { url: "PRIVATE" },
    { [NAVIGATION_ENTRY_KEY]: "7" },
  ])("rejects malformed or content-bearing metadata %j", (change) => {
    expect(readCompanySourceReturn({ ...history(), ...change })).toBeNull();
  });
  it("rejects hidden/symbol/accessor fields without executing the getter", () => {
    const get = vi.fn(() => input);
    expect(
      readCompanySourceReturn(
        Object.defineProperty(history(), "request", { get, enumerable: true }),
      ),
    ).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(
      readCompanySourceReturn(Object.defineProperty(history(), "hidden", { value: true })),
    ).toBeNull();
    expect(readCompanySourceReturn({ ...history(), [Symbol("extra")]: true })).toBeNull();
  });
});
