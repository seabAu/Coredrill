import { TextEncoder } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  decodeLiteralUtf8Chunk,
  parseContactInteractionSummaryTextPartV1,
} from "../../packages/application/dist/index.js";
import {
  createStoredContactHistoryReader,
  createStoredContactSummaryReader,
} from "../../apps/web/src/stored-contact-history-reader.ts";

const id = (n) => `0198e109-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-22T04:00:00.000Z";
const owner = { specVersion: 1, expectedVaultId: id(1), contactId: id(2), limit: 1 };
const entry = (n = 10) => ({
  id: id(n),
  contactId: id(2),
  currentJob: { id: id(3), title: "Synthetic <job>", archivedAt: null, rowVersion: 1 },
  type: "meeting",
  direction: "mutual",
  occurredAt: at,
  createdAt: at,
  rowVersion: 1,
  summaryPreview: "literal",
  summaryByteLength: 7,
  summaryTruncated: false,
});
const reference = (item = entry()) => ({
  specVersion: 1,
  vaultId: id(1),
  contactId: id(2),
  includeArchived: false,
  contactRowVersion: 1,
  occurredAt: item.occurredAt,
  id: item.id,
  rowVersion: item.rowVersion,
  jobId: item.currentJob.id,
  jobRowVersion: item.currentJob.rowVersion,
});
const page = (items = [entry()], more = false, changes = {}) => ({
  ok: true,
  value: {
    specVersion: 1,
    vaultId: id(1),
    contactId: id(2),
    contactRowVersion: 1,
    includeArchived: false,
    items,
    hasMore: more,
    nextCursor: more ? reference(items.at(-1)) : null,
    ...changes,
  },
});
const failure = (code = "unavailable") => ({
  ok: false,
  error: { code, message: "PRIVATE_SYNTHETIC_PATH", retryable: true },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const pageSetup = (scope = owner, version = 1) => {
  const read = vi.fn(async () => page());
  const changed = vi.fn();
  return { read, changed, reader: createStoredContactHistoryReader(scope, read, changed, version) };
};
const body = "\uFEFFab😀\0<script>literal</script>\n尾";
const bytes = new TextEncoder().encode(body);
const summaryOwner = {
  specVersion: 1,
  reference: reference(),
  summaryByteLength: bytes.length,
  limitBytes: 4,
};
const part = (input, source = bytes) => {
  const decoded = decodeLiteralUtf8Chunk(
    source.slice(input.byteOffset ?? 0, (input.byteOffset ?? 0) + (input.limitBytes ?? 16_384)),
    source.length,
    input.byteOffset ?? 0,
    input.limitBytes ?? 16_384,
  );
  return {
    specVersion: 1,
    reference: input.reference,
    summaryByteLength: source.length,
    byteOffset: input.byteOffset ?? 0,
    ...decoded,
    nextByteOffset: decoded.hasMore ? (input.byteOffset ?? 0) + decoded.bytesRead : null,
  };
};
const summarySetup = (scope = summaryOwner) => {
  const read = vi.fn(async (input) => ({ ok: true, value: part(input) }));
  const changed = vi.fn();
  return { read, changed, reader: createStoredContactSummaryReader(scope, read, changed) };
};

describe("owned recorded contact history pages", () => {
  it.each([
    {},
    { ...owner, contactId: "bad" },
    { ...owner, limit: 101 },
    { ...owner, includeArchived: "yes" },
    { ...owner, email: "injected" },
    { ...owner, after: reference() },
  ])("rejects malformed initial ownership before reads (%j)", (scope) => {
    const read = vi.fn();
    expect(() => createStoredContactHistoryReader(scope, read, vi.fn(), 1)).toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, Number.NaN])(
    "rejects an invalid confirmed contact version (%s)",
    (version) => {
      expect(() => pageSetup(owner, version)).toThrow();
    },
  );
  it("keeps one immutable live page and exact tied continuation, not a growing total", async () => {
    const local = pageSetup();
    const first = page([entry()], true);
    local.read.mockResolvedValueOnce(first).mockResolvedValueOnce(page([entry(11)]));
    expect(local.read).not.toHaveBeenCalled();
    await local.reader.first();
    first.value.items[0].currentJob.title = "mutated";
    expect(local.reader.current().page.items[0].currentJob.title).toBe("Synthetic <job>");
    await local.reader.next();
    expect(local.reader.current().page.items.map((item) => item.id)).toEqual([id(11)]);
    expect(local.read.mock.calls[1][0].after.id).toBe(id(10));
    expect(local.reader.current().page).not.toHaveProperty("total");
    expect(await local.reader.next()).toBe(false);
  });
  it("copies scope before awaiting and prevents single-flight overlap", async () => {
    const scope = { ...owner };
    const local = pageSetup(scope);
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.first();
    scope.contactId = id(99);
    expect(await local.reader.first()).toBe(false);
    held.release(page());
    await pending;
    expect(local.read.mock.calls[0][0].contactId).toBe(id(2));
    expect(Object.isFrozen(local.reader.current().owner)).toBe(true);
  });
  it.each([
    { vaultId: id(99) },
    { contactId: id(99) },
    { includeArchived: true },
    { contactRowVersion: 2 },
    { extra: "private" },
  ])("rejects foreign/malformed/view-version results (%j)", async (changes) => {
    const local = pageSetup();
    local.read.mockResolvedValueOnce(page([entry()], false, changes));
    await local.reader.first();
    expect(local.reader.current()).toMatchObject({ page: null, refreshRequired: true });
    expect(await local.reader.retry()).toBe(false);
    expect(JSON.stringify(local.reader.current())).not.toContain("PRIVATE");
  });
  it("retries the original failed continuation and retains only visibly stale prior facts", async () => {
    const local = pageSetup();
    local.read
      .mockResolvedValueOnce(page([entry()], true))
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(page([entry(11)]));
    await local.reader.first();
    await local.reader.next();
    expect(local.reader.current()).toMatchObject({ failed: "next", refreshRequired: false });
    expect(local.reader.current().page.items[0].id).toBe(id(10));
    expect(await local.reader.next()).toBe(false);
    await local.reader.retry();
    expect(local.read.mock.calls[2][0]).toEqual(local.read.mock.calls[1][0]);
    expect(local.reader.current().page.items[0].id).toBe(id(11));
  });
  it("requires first-page refresh for a stale cursor, never an automatic retry", async () => {
    const local = pageSetup();
    local.read
      .mockResolvedValueOnce(page([entry()], true))
      .mockResolvedValueOnce(failure("conflict"));
    await local.reader.first();
    await local.reader.next();
    expect(local.reader.current().refreshRequired).toBe(true);
    expect(await local.reader.retry()).toBe(false);
    expect(await local.reader.next()).toBe(false);
    expect(local.read).toHaveBeenCalledTimes(2);
  });
  it("suppresses disposed late reads and reentrant disposal before any I/O", async () => {
    const local = pageSetup();
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.first();
    local.reader.dispose();
    const count = local.changed.mock.calls.length;
    held.release(page());
    expect(await pending).toBe(false);
    expect(local.changed).toHaveBeenCalledTimes(count);
    expect(local.reader.current().page).toBeNull();
    const read = vi.fn();
    const reader = createStoredContactHistoryReader(owner, read, () => reader.dispose(), 1);
    expect(await reader.first()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("decoded literal summary boundary and owned parts", () => {
  it.each([
    { specVersion: 2 },
    { reference: { ...reference(), vaultId: id(99) } },
    { summaryByteLength: bytes.length + 1 },
    { byteOffset: 1 },
    { text: "\uD800" },
    { text: "x".repeat(65_537) },
    { bytesRead: 0 },
    { bytesRead: 100 },
    { nextByteOffset: null },
    { hasMore: false },
    { extra: "injected" },
  ])("rejects malformed/rebound decoded DTOs (%j)", (changes) => {
    const input = { ...summaryOwner, byteOffset: 0 };
    expect(() =>
      parseContactInteractionSummaryTextPartV1({ ...part(input), ...changes }, input),
    ).toThrow();
  });
  it("reconstructs complete BOM/NUL/Unicode/markup-shaped literal text with scalar-safe progress", async () => {
    const local = summarySetup();
    expect(local.read).not.toHaveBeenCalled();
    for (let n = 0; n < 30 && !local.reader.current().complete; n += 1) await local.reader.more();
    expect(local.reader.current()).toMatchObject({
      text: body,
      bytesRead: bytes.length,
      loaded: true,
      complete: true,
    });
    expect(await local.reader.more()).toBe(false);
    expect(Object.isFrozen(local.reader.current())).toBe(true);
    expect(local.read.mock.calls[1][0].byteOffset).toBe(4);
  });
  it("copies the fixed reference before awaiting and blocks overlapping reads", async () => {
    const scope = { ...summaryOwner, reference: { ...reference() } };
    const local = summarySetup(scope);
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.more();
    scope.reference.contactId = id(99);
    expect(await local.reader.more()).toBe(false);
    held.release({ ok: true, value: part(local.read.mock.calls[0][0]) });
    await pending;
    expect(local.reader.current().owner.reference.contactId).toBe(id(2));
    expect(Object.isFrozen(local.reader.current().owner.reference)).toBe(true);
  });
  it("distinguishes retained empty summary from missing data", async () => {
    const local = summarySetup({ ...summaryOwner, summaryByteLength: 0 });
    local.read.mockImplementationOnce(async (input) => ({
      ok: true,
      value: part(input, new Uint8Array()),
    }));
    await local.reader.more();
    expect(local.reader.current()).toMatchObject({
      loaded: true,
      complete: true,
      text: "",
      bytesRead: 0,
    });
    const missing = summarySetup();
    missing.read.mockResolvedValueOnce(failure("not_found"));
    await missing.reader.more();
    expect(missing.reader.current()).toMatchObject({
      loaded: false,
      complete: false,
      refreshRequired: true,
    });
  });
  it("retries only the failed byte range and never appends a failed or foreign part", async () => {
    const local = summarySetup();
    await local.reader.more();
    const prefix = local.reader.current().text;
    local.read.mockResolvedValueOnce(failure());
    await local.reader.more();
    expect(local.reader.current().text).toBe(prefix);
    expect(await local.reader.more()).toBe(false);
    await local.reader.retry();
    expect(local.read.mock.calls[2][0]).toEqual(local.read.mock.calls[1][0]);
    local.read.mockImplementationOnce(async (input) => ({
      ok: true,
      value: { ...part(input), reference: { ...reference(), jobRowVersion: 2 } },
    }));
    const retained = local.reader.current().text;
    await local.reader.more();
    expect(local.reader.current()).toMatchObject({ text: retained, refreshRequired: true });
    expect(await local.reader.retry()).toBe(false);
    expect(JSON.stringify(local.reader.current())).not.toContain("PRIVATE");
  });
  it("does not publish a disposed late part or read after reentrant disposal", async () => {
    const local = summarySetup();
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.more();
    local.reader.dispose();
    const count = local.changed.mock.calls.length;
    held.release({ ok: true, value: part(local.read.mock.calls[0][0]) });
    expect(await pending).toBe(false);
    expect(local.changed).toHaveBeenCalledTimes(count);
    expect(local.reader.current().text).toBe("");
    const read = vi.fn();
    const reader = createStoredContactSummaryReader(summaryOwner, read, () => reader.dispose());
    expect(await reader.more()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
