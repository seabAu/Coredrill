import { describe, expect, it, vi } from "vitest";
import {
  companyInteractionReferenceV1,
  decodeLiteralUtf8Chunk,
} from "../../packages/application/dist/index.js";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import { createStoredCompanyInteractionsApi } from "../../apps/web/src/stored-company-interactions.ts";
import { createStoredCompanyInteractionsReader } from "../../apps/web/src/stored-company-interactions-reader.ts";

const id = (n) => `0198e143-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-25T12:00:00.000Z";
const scope = {
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
const body = `\uFEFF<script>inert</script>\0尾😀${"x".repeat(18000)}`;
const bytes = new globalThis.TextEncoder().encode(body);
const item = (n = 10) => {
  const preview = decodeLiteralUtf8Chunk(bytes.slice(0, 1024), bytes.length, 0, 1024);
  return {
    id: id(n),
    contactId: null,
    currentJob: {
      id: id(5),
      companyId: id(2),
      title: "Literal <job>",
      archivedAt: null,
      rowVersion: 1,
    },
    type: "note",
    direction: "unknown",
    occurredAt: at,
    createdAt: at,
    rowVersion: 1,
    summaryPreview: preview.text,
    summaryByteLength: bytes.length,
    summaryTruncated: preview.hasMore,
  };
};
const page = (request, items = [item()], hasMore = false) => ({
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
    nextCursor: hasMore ? companyInteractionReferenceV1(request, items.at(-1)) : null,
  },
});
const part = (request) => {
  const decoded = decodeLiteralUtf8Chunk(
    bytes.slice(request.byteOffset, request.byteOffset + request.limitBytes),
    bytes.length,
    request.byteOffset,
    request.limitBytes,
  );
  return {
    ok: true,
    value: {
      specVersion: 1,
      reference: request.reference,
      summaryByteLength: bytes.length,
      byteOffset: request.byteOffset,
      text: decoded.text,
      bytesRead: decoded.bytesRead,
      hasMore: decoded.hasMore,
      nextByteOffset: decoded.hasMore ? request.byteOffset + decoded.bytesRead : null,
    },
  };
};
const failure = (code = "unavailable", retryable = true) => ({
  ok: false,
  error: { code, retryable, message: "PRIVATE adapter path/body" },
});
const held = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe("selected company history runtime and owned reader", () => {
  it("validates page and summary input before selected storage opens", async () => {
    const open = vi.fn(),
      api = createStoredCompanyInteractionsApi(open, context);
    expect(await api.page({ ...scope, companyId: "bad" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(
      await api.summary({ specVersion: 1, reference: {}, summaryByteLength: 1 }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
  });
  it("copies the viewed vault before an awaited open and refuses a foreign physical root", async () => {
    const waiting = held(),
      mutable = { ...scope };
    const query = vi.fn(async () => [{ id: id(3) }]);
    const api = createStoredCompanyInteractionsApi(async () => {
      await waiting.promise;
      return { query, transaction: (work) => work({ query }) };
    }, context);
    const pending = api.page(mutable);
    mutable.expectedVaultId = id(3);
    waiting.release();
    expect(await pending).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("redacts selected-storage failures without trying another adapter", async () => {
    const open = vi.fn(async () => {
      throw Error("PRIVATE database path");
    });
    expect(await createStoredCompanyInteractionsApi(open, context).page(scope)).toMatchObject({
      ok: false,
      error: { code: "unavailable" },
    });
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("distinguishes unread from confirmed empty and does not open storage at construction", async () => {
    const api = { page: vi.fn(async (request) => page(request, [])), summary: vi.fn() };
    const reader = createStoredCompanyInteractionsReader(scope, api, vi.fn());
    expect(reader.current().page).toBeNull();
    expect(api.page).not.toHaveBeenCalled();
    expect(await reader.first()).toBe(true);
    expect(reader.current().page.items).toEqual([]);
    expect(await reader.openSummary(id(10))).toBe(false);
    expect(api.summary).not.toHaveBeenCalled();
  });
  it("keeps one page flight, stale records and exact failed-request retry without auto retry", async () => {
    const wait = held();
    const read = vi
      .fn()
      .mockImplementationOnce(async (request) => page(request, [item()], true))
      .mockImplementationOnce(async () => {
        await wait.promise;
        return failure();
      })
      .mockImplementationOnce(async (request) => page(request, [item(11)]));
    const reader = createStoredCompanyInteractionsReader(
      scope,
      { page: read, summary: vi.fn() },
      vi.fn(),
    );
    await reader.first();
    const pending = reader.next();
    expect(await reader.first()).toBe(false);
    wait.release();
    expect(await pending).toBe(false);
    const failed = reader.current().failedRequest;
    expect(reader.current().page.items[0].id).toBe(id(10));
    expect(read).toHaveBeenCalledTimes(2);
    expect(await reader.openSummary(id(10))).toBe(false);
    expect(await reader.next()).toBe(false);
    expect(await reader.retry()).toBe(true);
    expect(read.mock.calls[2][0]).toBe(failed);
    expect(reader.current().page.items[0].id).toBe(id(11));
    expect(JSON.stringify(reader.current())).not.toContain("PRIVATE");
  });
  it("suppresses publication after disposal for held pages and summary parts", async () => {
    const wait = held(),
      changed = vi.fn();
    const reader = createStoredCompanyInteractionsReader(
      scope,
      {
        page: async (request) => {
          await wait.promise;
          return page(request);
        },
        summary: vi.fn(),
      },
      changed,
    );
    const pending = reader.first();
    const before = changed.mock.calls.length;
    reader.dispose();
    wait.release();
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(before);
    const summaryWait = held(),
      changes = vi.fn();
    const next = createStoredCompanyInteractionsReader(
      scope,
      {
        page: async (request) => page(request),
        summary: async (request) => {
          await summaryWait.promise;
          return part(request);
        },
      },
      changes,
    );
    await next.first();
    const summaryPending = next.openSummary(id(10));
    const count = changes.mock.calls.length;
    next.dispose();
    summaryWait.release();
    expect(await summaryPending).toBe(false);
    expect(changes).toHaveBeenCalledTimes(count);
  });
  it.each(["conflict", "internal", "not_found"])(
    "requires a new confirmed reader after %s",
    async (code) => {
      const read = vi.fn(async () => failure(code, false));
      const reader = createStoredCompanyInteractionsReader(
        scope,
        { page: read, summary: vi.fn() },
        vi.fn(),
      );
      await reader.first();
      expect(reader.current().refreshRequired).toBe(true);
      expect(await reader.first()).toBe(false);
      expect(await reader.retry()).toBe(false);
      expect(read).toHaveBeenCalledTimes(1);
    },
  );
  it("reconstructs exact summary parts with one flight and exact retry without duplicating retained text", async () => {
    const waiting = held(),
      read = vi
        .fn()
        .mockImplementationOnce(async (request) => part(request))
        .mockImplementationOnce(async () => {
          await waiting.promise;
          return failure();
        })
        .mockImplementationOnce(async (request) => part(request));
    const reader = createStoredCompanyInteractionsReader(
      scope,
      { page: async (request) => page(request), summary: read },
      vi.fn(),
    );
    await reader.first();
    expect(await reader.openSummary(id(10))).toBe(true);
    const original = reader.current().summary.text;
    expect(original.length).toBeLessThan(body.length);
    const more = reader.moreSummary();
    expect(await reader.first()).toBe(false);
    expect(await reader.openSummary(id(10))).toBe(false);
    reader.closeSummary();
    expect(reader.current().summary).not.toBeNull();
    waiting.release();
    expect(await more).toBe(false);
    const failed = reader.current().summary.failedRequest;
    expect(reader.current().summary.text).toBe(original);
    expect(await reader.moreSummary()).toBe(false);
    expect(await reader.retrySummary()).toBe(true);
    expect(read.mock.calls[2][0]).toBe(failed);
    expect(reader.current().summary).toMatchObject({
      text: body,
      complete: true,
      nextByteOffset: null,
    });
    expect(await reader.moreSummary()).toBe(false);
    reader.closeSummary();
    expect(reader.current().summary).toBeNull();
  });
  it("invalidates malformed summary output and repeated page identities without publishing content", async () => {
    const read = vi.fn(async (request) => page(request, [item()], true));
    const summary = vi.fn(async (request) => ({
      ...part(request),
      value: { ...part(request).value, reference: { ...request.reference, contactId: id(8) } },
    }));
    const reader = createStoredCompanyInteractionsReader(scope, { page: read, summary }, vi.fn());
    await reader.first();
    expect(await reader.next()).toBe(false);
    expect(reader.current().refreshRequired).toBe(true);
    const next = createStoredCompanyInteractionsReader(scope, { page: read, summary }, vi.fn());
    await next.first();
    expect(await next.openSummary(id(10))).toBe(false);
    expect(next.current().refreshRequired).toBe(true);
    expect(next.current().summary.text).toBe("");
    expect(await next.retrySummary()).toBe(false);
  });
});
