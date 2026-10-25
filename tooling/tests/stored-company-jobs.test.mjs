import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import {
  companyJobsCursorV1,
  parseCompanyJobsRequestV1,
} from "../../packages/application/dist/index.js";
import { createStoredCompanyJobsApi } from "../../apps/web/src/stored-company-jobs.ts";
import { createStoredCompanyJobsReader } from "../../apps/web/src/stored-company-jobs-reader.ts";
import {
  COMPANY_JOB_RETURN_KIND,
  readCompanyJobReturn,
} from "../../apps/web/src/company-job-navigation.ts";
import { NAVIGATION_ENTRY_KEY } from "../../apps/web/src/guarded-navigation.ts";

const id = (n) => `0198e133-0000-7000-8000-${String(n).padStart(12, "0")}`;
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
const job = (n = 3) => ({
  id: id(n),
  companyId: id(2),
  title: "\uFEFFLiteral <job>\0😀",
  status: null,
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
});
const scope = parseCompanyJobsRequestV1(input);
const page = (request = scope, items = [job()], hasMore = false) => {
  const { limit: ignoredLimit, after: ignoredAfter, ...owner } = request;
  void ignoredLimit;
  void ignoredAfter;
  return {
    ok: true,
    value: {
      ...owner,
      items,
      hasMore,
      nextCursor: hasMore ? companyJobsCursorV1(request, items.at(-1)) : null,
    },
  };
};
const failure = (code = "unavailable", retryable = true) => ({
  ok: false,
  error: { code, retryable, message: "PRIVATE adapter path" },
});
const held = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe("selected-runtime company-linked jobs", () => {
  it.each([
    {},
    { ...input, companyId: "bad" },
    { ...input, expectedCompanyRowVersion: 0 },
    { ...input, includeArchivedJobs: null },
    { ...input, limit: 26 },
    { ...input, title: "PRIVATE" },
  ])("validates %j before opening a database", async (value) => {
    const open = vi.fn();
    expect(await createStoredCompanyJobsApi(open, context).page(value)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
  });
  it("captures original scope before an awaited database open and checks the physical root", async () => {
    const waiting = held(),
      mutable = { ...input };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: id(1) }])
      .mockResolvedValueOnce([
        { id: id(2), row_version: 1, archived_at: null, created_at: at, updated_at: at },
      ])
      .mockResolvedValueOnce([]);
    const api = createStoredCompanyJobsApi(() => waiting.promise, context);
    const pending = api.page(mutable);
    mutable.expectedVaultId = id(8);
    mutable.companyId = id(9);
    waiting.release({ transaction: async (work) => work({ query }) });
    expect(await pending).toMatchObject({
      ok: true,
      value: { expectedVaultId: id(1), companyId: id(2), items: [] },
    });
    expect(query.mock.calls[1][0].parameters).toEqual([id(2)]);
  });
  it("does not fall back after selected native storage fails and redacts its private error", async () => {
    const open = vi.fn().mockRejectedValue(Error("PRIVATE native path"));
    const api = createStoredCompanyJobsApi(open, context);
    expect(open).not.toHaveBeenCalled();
    const result = await api.page(input);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("owned company-linked live pages", () => {
  it("is lazy, preserves literal fields and acknowledges emptiness only after a read", async () => {
    const read = vi.fn().mockResolvedValue(page(scope, [])),
      mutable = { ...input };
    const reader = createStoredCompanyJobsReader(mutable, read, vi.fn());
    mutable.companyId = id(8);
    expect(reader.current().page).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(await reader.first()).toBe(true);
    expect(reader.current()).toMatchObject({
      owner: { companyId: id(2) },
      page: { items: [] },
      error: null,
    });
    expect(Object.isFrozen(reader.current().request)).toBe(true);
  });
  it("retains the page and retries the exact failed continuation without automatic calls", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page(scope, [job()], true))
      .mockResolvedValueOnce(failure())
      .mockImplementationOnce(async (request) => page(request, [job(4)]));
    const reader = createStoredCompanyJobsReader(input, read, vi.fn());
    await reader.first();
    const originalPage = reader.current().page;
    await reader.next();
    expect(reader.current()).toMatchObject({ page: originalPage, refreshRequired: false });
    expect(reader.current().error).not.toContain("PRIVATE");
    expect(read).toHaveBeenCalledTimes(2);
    expect(await reader.next()).toBe(false);
    await reader.retry();
    expect(read.mock.calls[1][0]).toBe(read.mock.calls[2][0]);
    expect(reader.current().page.items[0].id).toBe(id(4));
    expect(await reader.retry()).toBe(false);
  });
  it("is single-flight and ignores a disposed late result", async () => {
    const waiting = held(),
      changed = vi.fn(),
      read = vi.fn(() => waiting.promise);
    const reader = createStoredCompanyJobsReader(input, read, changed);
    const pending = reader.first();
    expect(await reader.first()).toBe(false);
    expect(await reader.next()).toBe(false);
    reader.dispose();
    const count = changed.mock.calls.length;
    waiting.release(page());
    await pending;
    expect(changed).toHaveBeenCalledTimes(count);
    expect(read).toHaveBeenCalledOnce();
  });
  it.each([
    failure("conflict", false),
    { ...page(), value: { ...page().value, companyId: id(8) } },
  ])("requires a newly validated company after stale or foreign results %#", async (response) => {
    const read = vi.fn().mockResolvedValue(response),
      reader = createStoredCompanyJobsReader(input, read, vi.fn());
    await reader.first();
    expect(reader.current()).toMatchObject({ refreshRequired: true, page: null });
    expect(await reader.first()).toBe(false);
    expect(await reader.retry()).toBe(false);
    expect(read).toHaveBeenCalledOnce();
  });
  it("rejects a repeated identity from the prior live page even if its update time moved", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page(scope, [job()], true))
      .mockImplementationOnce(async (request) =>
        page(request, [
          {
            ...job(),
            updatedAt: "2026-10-24T12:00:00.000Z",
            createdAt: "2026-10-24T12:00:00.000Z",
          },
        ]),
      );
    const reader = createStoredCompanyJobsReader(input, read, vi.fn());
    await reader.first();
    await reader.next();
    expect(reader.current().refreshRequired).toBe(true);
    expect(reader.current().page.items[0].title).toBe(job().title);
  });
  it("restores an exact scoped return page but refuses to rebase another company or revision", async () => {
    const request = parseCompanyJobsRequestV1({
      ...scope,
      after: companyJobsCursorV1(scope, job()),
    });
    const read = vi.fn(async (original) => page(original, [job(4)])),
      reader = createStoredCompanyJobsReader(input, read, vi.fn());
    expect(() => reader.restore({ ...request, expectedCompanyRowVersion: 2 })).toThrow();
    expect(read).not.toHaveBeenCalled();
    await reader.restore(request);
    expect(reader.current().request).toEqual(request);
    expect(reader.current().page.items[0].id).toBe(id(4));
  });
});

describe("minimal company-job history return metadata", () => {
  const history = () => ({
    kind: COMPANY_JOB_RETURN_KIND,
    request: { ...input },
    jobId: id(3),
    scrollY: 125.5,
  });
  it("copies original cursor scope and stores no display content", () => {
    const raw = history(),
      copied = readCompanyJobReturn(raw);
    raw.request.companyId = id(8);
    expect(copied.request.companyId).toBe(id(2));
    expect(Object.isFrozen(copied.request)).toBe(true);
    expect(Object.keys(copied).sort()).toEqual(["jobId", "kind", "request", "scrollY"]);
    expect(JSON.stringify(copied)).not.toContain(job().title);
  });
  it.each([
    { kind: "old" },
    { jobId: "bad" },
    { scrollY: -1 },
    { scrollY: Infinity },
    { scrollY: "125" },
    { title: "PRIVATE" },
  ])("rejects malformed or content-bearing history %j", (change) => {
    expect(readCompanyJobReturn({ ...history(), ...change })).toBeNull();
  });
  it("does not evaluate a history accessor", () => {
    const getter = vi.fn(() => input);
    expect(
      readCompanyJobReturn(
        Object.defineProperty(history(), "request", { enumerable: true, get: getter }),
      ),
    ).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
  it("accepts the validated navigation coordinator stamp without retaining it as role authority", () => {
    expect(readCompanyJobReturn({ ...history(), [NAVIGATION_ENTRY_KEY]: 7 })).toEqual(
      readCompanyJobReturn(history()),
    );
    for (const value of [-1, "7", Infinity])
      expect(readCompanyJobReturn({ ...history(), [NAVIGATION_ENTRY_KEY]: value })).toBeNull();
  });
});
