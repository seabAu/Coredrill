import { describe, expect, it, vi } from "vitest";
import {
  networkInteractionReferenceV1,
  decodeLiteralUtf8Chunk,
} from "../../packages/application/dist/index.js";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import { createStoredNetworkInteractionsApi } from "../../apps/web/src/stored-network-interactions.ts";
import { createStoredNetworkInteractionsReader } from "../../apps/web/src/stored-network-interactions-reader.ts";

const id = (n) => `0198e143-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-25T12:00:00.000Z";
const scope = { specVersion: 1, expectedVaultId: id(1), includeArchivedJobs: false, limit: 1 };
const context = () => ({
  operationId: entityId("application-operation", id(90)),
  initiatedAt: instant(at),
});
const body = `\uFEFF<script>inert</script>\0尾😀${"x".repeat(18000)}`;
const bytes = new globalThis.TextEncoder().encode(body);
const item = (n = 11) => {
  const preview = decodeLiteralUtf8Chunk(bytes.slice(0, 1024), bytes.length, 0, 1024);
  return {
    id: id(n),
    contactId: null,
    currentJob: {
      id: id(5),
      title: "Literal <job>",
      archivedAt: null,
      rowVersion: 1,
      company: null,
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
    specVersion: 1,
    expectedVaultId: request.expectedVaultId,
    includeArchivedJobs: request.includeArchivedJobs,
    items,
    hasMore,
    nextCursor: hasMore ? networkInteractionReferenceV1(request, items.at(-1)) : null,
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
  error: { code, retryable, message: "PRIVATE body/database path" },
});
const held = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const readerWith = (api, changed = vi.fn()) =>
  createStoredNetworkInteractionsReader(scope, api, changed);

describe("Network history original owner, single-flight pages and bounded summary reader", () => {
  it("validates before opening selected storage and redacts adapter failures without fallback", async () => {
    const open = vi.fn(async () => {
      throw Error("PRIVATE path");
    });
    const api = createStoredNetworkInteractionsApi(open, context);
    expect(await api.page({ ...scope, expectedVaultId: "bad" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(
      await api.summary({ specVersion: 1, reference: {}, summaryByteLength: 2 }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
    const result = await api.page(scope);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("copies the viewed vault before awaited opening and rejects a foreign physical root", async () => {
    const wait = held(),
      mutable = { ...scope },
      query = vi.fn(async () => [{ id: id(2) }]);
    const api = createStoredNetworkInteractionsApi(async () => {
      await wait.promise;
      return { query, transaction: (work) => work({ query }) };
    }, context);
    const pending = api.page(mutable);
    mutable.expectedVaultId = id(2);
    wait.release();
    expect(await pending).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("keeps unread distinct from confirmed empty and never reads a body until a viewed item is selected", async () => {
    const api = { page: vi.fn(async (request) => page(request, [])), summary: vi.fn() };
    const reader = readerWith(api);
    expect(reader.current().page).toBeNull();
    expect(api.page).not.toHaveBeenCalled();
    expect(await reader.inspect(id(11))).toBe(false);
    expect(await reader.first()).toBe(true);
    expect(reader.current().page.items).toEqual([]);
    expect(await reader.inspect(id(11))).toBe(false);
    expect(api.summary).not.toHaveBeenCalled();
  });
  it("retains stale records after a held next-page failure and retries the exact original request once explicitly", async () => {
    const wait = held();
    const read = vi
      .fn()
      .mockImplementationOnce(async (request) => page(request, [item()], true))
      .mockImplementationOnce(async () => {
        await wait.promise;
        return failure();
      })
      .mockImplementationOnce(async (request) => page(request, [item(12)]));
    const api = { page: read, summary: vi.fn() },
      reader = readerWith(api);
    await reader.first();
    const pending = reader.next();
    expect(await reader.first()).toBe(false);
    expect(await reader.inspect(id(11))).toBe(false);
    wait.release();
    expect(await pending).toBe(false);
    const failed = reader.current().failedRequest;
    expect(reader.current().page.items[0].id).toBe(id(11));
    expect(await reader.next()).toBe(false);
    expect(await reader.inspect(id(11))).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(await reader.retry()).toBe(true);
    expect(read.mock.calls[2][0]).toBe(failed);
    expect(reader.current().page.items[0].id).toBe(id(12));
    expect(JSON.stringify(reader.current())).not.toContain("PRIVATE");
  });
  it.each(["foreign", "duplicate", "conflict"])(
    "locks a %s continuation until a new owner is constructed",
    async (fault) => {
      const read = vi
        .fn()
        .mockImplementationOnce(async (request) => page(request, [item()], true))
        .mockImplementationOnce(async (request) =>
          fault === "conflict"
            ? failure("conflict", false)
            : fault === "duplicate"
              ? page(request, [item()])
              : page({ ...request, expectedVaultId: id(9) }, [item(10)]),
        );
      const reader = readerWith({ page: read, summary: vi.fn() });
      await reader.first();
      expect(await reader.next()).toBe(false);
      expect(reader.current().refreshRequired).toBe(true);
      expect(reader.current().page.items[0].id).toBe(id(11));
      expect(await reader.retry()).toBe(false);
      expect(await reader.first()).toBe(false);
      expect(read).toHaveBeenCalledTimes(2);
    },
  );
  it("reads literal bounded parts only on demand, retains the prefix and retries the exact failed part", async () => {
    const read = vi
      .fn()
      .mockImplementationOnce(async (request) => part(request))
      .mockImplementationOnce(async () => failure())
      .mockImplementationOnce(async (request) => part(request));
    const reader = readerWith({ page: async (request) => page(request), summary: read });
    await reader.first();
    expect(read).not.toHaveBeenCalled();
    expect(await reader.inspect(id(12))).toBe(false);
    expect(await reader.inspect(id(11))).toBe(true);
    const prefix = reader.current().summary.text;
    expect(prefix.startsWith("\uFEFF<script>inert</script>\0尾😀")).toBe(true);
    expect(reader.current().summary.complete).toBe(false);
    expect(await reader.moreSummary()).toBe(false);
    const failed = reader.current().summary.failedRequest;
    expect(reader.current().summary.text).toBe(prefix);
    expect(await reader.moreSummary()).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(await reader.retrySummary()).toBe(true);
    expect(read.mock.calls[2][0]).toBe(failed);
    expect(reader.current().summary.text).toBe(body);
    expect(reader.current().summary.complete).toBe(true);
    expect(await reader.moreSummary()).toBe(false);
    expect(JSON.stringify(reader.current())).not.toContain("PRIVATE");
    expect(reader.closeSummary()).toBe(true);
    expect(reader.current().summary).toBeNull();
  });
  it("blocks page/body/close overlap and ignores late body publication after disposal", async () => {
    const wait = held(),
      changed = vi.fn(),
      read = vi.fn(async (request) => {
        await wait.promise;
        return part(request);
      });
    const reader = readerWith({ page: async (request) => page(request), summary: read }, changed);
    await reader.first();
    const pending = reader.inspect(id(11));
    expect(await reader.first()).toBe(false);
    expect(await reader.inspect(id(11))).toBe(false);
    expect(reader.closeSummary()).toBe(false);
    const count = changed.mock.calls.length;
    reader.dispose();
    wait.release();
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(count);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("ignores a disposed held page and a reentrant retirement before opening storage", async () => {
    const wait = held(),
      changed = vi.fn();
    const reader = readerWith(
      {
        page: async (request) => {
          await wait.promise;
          return page(request);
        },
        summary: vi.fn(),
      },
      changed,
    );
    const pending = reader.first(),
      count = changed.mock.calls.length;
    reader.dispose();
    wait.release();
    expect(await pending).toBe(false);
    expect(changed).toHaveBeenCalledTimes(count);
    const api = { page: vi.fn(), summary: vi.fn() };
    const next = readerWith(api, () => next.dispose());
    expect(await next.first()).toBe(false);
    expect(api.page).not.toHaveBeenCalled();
  });
  it("rejects foreign summary parts without rebasing the retained item and retires a body on page change", async () => {
    const reader = readerWith({
      page: async (request) => page(request),
      summary: async (request) => ({
        ...part(request),
        value: { ...part(request).value, reference: { ...request.reference, contactId: id(9) } },
      }),
    });
    await reader.first();
    expect(await reader.inspect(id(11))).toBe(false);
    expect(reader.current().refreshRequired).toBe(true);
    expect(await reader.retrySummary()).toBe(false);
    const next = readerWith({
      page: async (request) => page(request),
      summary: async (request) => part(request),
    });
    await next.first();
    await next.inspect(id(11));
    await next.first();
    expect(next.current().summary).toBeNull();
  });
});
