import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import {
  companyOutcomeCursorV1,
  parseCompanyOutcomesRequestV1,
} from "../../packages/application/dist/index.js";
import { createStoredCompanyOutcomesApi } from "../../apps/web/src/stored-company-outcomes.ts";
import { createStoredCompanyOutcomesReader } from "../../apps/web/src/stored-company-outcomes-reader.ts";
const id = (n) => `0198e155-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-25T12:00:00.000Z",
  input = {
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
const owner = parseCompanyOutcomesRequestV1(input);
const entry = (n = 10) => ({
  id: id(n),
  occurredAt: at,
  createdAt: at,
  rowVersion: 1,
  currentJob: {
    id: id(5),
    companyId: id(2),
    title: "Literal <job> 😀",
    archivedAt: null,
    rowVersion: 1,
  },
  application: null,
  fromStatus: null,
  toStatus: {
    id: id(40),
    name: "Synthetic saved",
    category: "saved",
    terminal: false,
    archivedAt: null,
    rowVersion: 1,
  },
  undo: null,
});
const page = (request = owner, items = [entry()], hasMore = false) => ({
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
    nextCursor: hasMore ? companyOutcomeCursorV1(request, items.at(-1)) : null,
  },
});
const failure = (code = "unavailable", retryable = true) => ({
  ok: false,
  error: { code, retryable, message: "PRIVATE path and event notes" },
});
const held = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
describe("selected-runtime company recorded outcomes and owned reader", () => {
  it.each([
    {},
    { ...input, companyId: "bad" },
    { ...input, expectedCompanyRowVersion: 0 },
    { ...input, includeArchivedJobs: null },
    { ...input, limit: 26 },
    { ...input, notes: "PRIVATE" },
  ])("rejects %j before opening selected storage", async (value) => {
    const open = vi.fn();
    expect(await createStoredCompanyOutcomesApi(open, context).page(value)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
  });
  it("copies original owner before a held open and rejects a different physical vault", async () => {
    const wait = held(),
      mutable = { ...input },
      query = vi.fn(async () => [{ id: id(3) }]);
    const pending = createStoredCompanyOutcomesApi(async () => {
      await wait.promise;
      return { query, transaction: (work) => work({ query }) };
    }, context).page(mutable);
    mutable.expectedVaultId = id(3);
    wait.release();
    expect(await pending).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("redacts open failure without switching adapters", async () => {
    const open = vi.fn(async () => {
      throw Error("PRIVATE local database path");
    });
    const result = await createStoredCompanyOutcomesApi(open, context).page(input);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("keeps unread distinct from confirmed empty and issues no construction-time read", async () => {
    const read = vi.fn(async (request) => page(request, [])),
      reader = createStoredCompanyOutcomesReader(input, read, vi.fn());
    expect(reader.current().page).toBeNull();
    expect(read).not.toHaveBeenCalled();
    await reader.first();
    expect(reader.current().page.items).toEqual([]);
  });
  it("serializes held reads, retains stale page and retries the exact failed continuation", async () => {
    const wait = held(),
      read = vi
        .fn()
        .mockImplementationOnce(async (request) => page(request, [entry()], true))
        .mockImplementationOnce(async () => {
          await wait.promise;
          return failure();
        })
        .mockImplementationOnce(async (request) => page(request, [entry(11)]));
    const reader = createStoredCompanyOutcomesReader(input, read, vi.fn());
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
  it("ignores late retired results and cannot restart an invalidated owner", async () => {
    const wait = held(),
      changed = vi.fn(),
      reader = createStoredCompanyOutcomesReader(
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
    for (const result of [
      failure("conflict", false),
      { ...page(), value: { ...page().value, companyId: id(3) } },
    ]) {
      const read = vi.fn(async () => result),
        next = createStoredCompanyOutcomesReader(input, read, vi.fn());
      await next.first();
      expect(next.current().refreshRequired).toBe(true);
      expect(await next.first()).toBe(false);
      expect(await next.retry()).toBe(false);
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects repeated identities from a continuation and preserves the prior page", async () => {
    const reader = createStoredCompanyOutcomesReader(
      input,
      async (request) => page(request, [entry()], true),
      vi.fn(),
    );
    await reader.first();
    expect(await reader.next()).toBe(false);
    expect(reader.current().refreshRequired).toBe(true);
    expect(reader.current().page.items[0].id).toBe(id(10));
  });
});
