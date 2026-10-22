import { TextEncoder } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";

const ports = vi.hoisted(() => ({ listPage: vi.fn(), readSummaryPart: vi.fn(), factory: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createContactInteractionHistoryRepository: (...args) => {
    ports.factory(...args);
    return ports;
  },
}));
import { createStoredContactHistoryApi } from "../../apps/web/src/stored-contact-history.ts";

const rawId = (suffix) => `0198e108-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
const vaultId = rawId(1);
const contactId = rawId(2);
const at = instant("2026-10-22T04:00:00.000Z");
const request = { specVersion: 1, expectedVaultId: vaultId, contactId };
const reference = {
  specVersion: 1,
  vaultId,
  contactId,
  includeArchived: false,
  contactRowVersion: 1,
  occurredAt: at,
  id: rawId(3),
  rowVersion: 1,
  jobId: rawId(4),
  jobRowVersion: 1,
};
const literal = "\uFEFF🧭\0<script>literal</script>\n尾";
const bytes = new TextEncoder().encode(literal);
const summary = { specVersion: 1, reference, summaryByteLength: bytes.length };
const page = () => ({
  specVersion: 1,
  vaultId,
  contactId,
  includeArchived: false,
  contactRowVersion: 1,
  items: [],
  hasMore: false,
  nextCursor: null,
});
const setup = () => {
  const selected = { syntheticSelectedDatabase: true };
  const open = vi.fn(async () => selected);
  const clock = vi.fn(() => ({
    operationId: entityId("application-operation", rawId(5)),
    initiatedAt: at,
  }));
  return { selected, open, clock, api: createStoredContactHistoryApi(open, clock) };
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.listPage.mockImplementation(async () => page());
  // The storage port returns only its exact raw-byte boundary, not the request limit.
  ports.readSummaryPart.mockImplementation(async (input) => ({
    specVersion: 1,
    reference: input.reference,
    summaryByteLength: input.summaryByteLength,
    byteOffset: input.byteOffset,
    bytes,
  }));
});
describe("selected-runtime contact history", () => {
  it("does not open storage, construct an adapter or read a clock on composition", () => {
    const local = setup();
    expect(Object.isFrozen(local.api)).toBe(true);
    for (const mock of [local.open, local.clock, ports.factory])
      expect(mock).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { ...request, contactId: "bad" },
    { ...request, limit: 101 },
    { ...request, notes: "injected" },
  ])("rejects malformed page input before opening (%j)", async (input) => {
    const local = setup();
    expect(await local.api.page(input)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect(ports.factory).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { ...summary, reference: { ...reference, jobId: "bad" } },
    { ...summary, byteOffset: bytes.length + 1 },
    { ...summary, limitBytes: 65_537 },
  ])("rejects malformed summary input before opening (%j)", async (input) => {
    const local = setup();
    expect(await local.api.summaryPart(input)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.open).not.toHaveBeenCalled();
    expect(ports.factory).not.toHaveBeenCalled();
  });
  it("uses only the selected database and returns complete literal summary bytes", async () => {
    const local = setup();
    expect(await local.api.page(request)).toEqual({ ok: true, value: page() });
    expect(await local.api.summaryPart(summary)).toMatchObject({
      ok: true,
      value: { text: literal, bytesRead: bytes.length, hasMore: false, nextByteOffset: null },
    });
    expect(ports.factory.mock.calls).toEqual([[local.selected], [local.selected]]);
    expect(ports.readSummaryPart.mock.calls[0][0].reference).toEqual(reference);
  });
  it.each(["page", "summaryPart"])("copies %s scope before awaiting storage", async (method) => {
    const local = setup();
    let release;
    local.open.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const input = method === "page" ? { ...request } : { ...summary, reference: { ...reference } };
    const pending = local.api[method](input);
    if (method === "page") input.contactId = rawId(99);
    else input.reference.contactId = rawId(99);
    release(local.selected);
    expect(await pending).toMatchObject({ ok: true });
    const called = (method === "page" ? ports.listPage : ports.readSummaryPart).mock.calls[0][0];
    expect(method === "page" ? called.contactId : called.reference.contactId).toBe(contactId);
    expect(Object.isFrozen(called)).toBe(true);
  });
  it.each(["page", "summaryPart"])("redacts %s open failure with no fallback", async (method) => {
    const local = setup();
    local.open.mockRejectedValue(new Error("PRIVATE_SYNTHETIC_PATH"));
    const result = await local.api[method](method === "page" ? request : summary);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(local.open).toHaveBeenCalledOnce();
    expect(ports.factory).not.toHaveBeenCalled();
  });
  it("rejects foreign page and summary result scope", async () => {
    const local = setup();
    ports.listPage.mockResolvedValue({ ...page(), vaultId: rawId(99) });
    ports.readSummaryPart.mockResolvedValue({
      specVersion: 1,
      reference: { ...reference, contactId: rawId(99) },
      summaryByteLength: bytes.length,
      byteOffset: 0,
      bytes,
    });
    expect(await local.api.page(request)).toMatchObject({ ok: false });
    expect(await local.api.summaryPart(summary)).toMatchObject({ ok: false });
  });
});
