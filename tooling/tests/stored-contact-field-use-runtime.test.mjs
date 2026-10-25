import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { entityId, instant } from "../../packages/domain/dist/index.js";
const ports = vi.hoisted(() => ({
  record: vi.fn(),
  control: vi.fn(),
  readField: vi.fn(),
  inspect: vi.fn(),
  factory: vi.fn(),
}));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createContactFieldUseRepository: (...args) => {
    ports.factory(...args);
    return ports;
  },
}));
import { createStoredContactFieldUseApi } from "../../apps/web/src/stored-contact-field-use.ts";
const id = (n) => `0198e124-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-25T04:00:00.000Z"),
  later = instant("2026-10-26T04:00:00.000Z");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const source = () => ({
  specVersion: 1,
  kind: "source",
  expectedVaultId: id(1),
  sourceSnapshotId: id(2),
  sourceClass: "official_employer_page",
  sourceUrl: "https://synthetic.example",
  capturedAt: at,
  literalText: "\uFEFFSynthetic source\0尾",
});
const control = () => ({
  specVersion: 1,
  kind: "disable_policy",
  expectedVaultId: id(1),
  recordId: id(3),
  expectedRowVersion: 1,
  sourceSnapshotId: id(2),
  expectedSourceHash: "a".repeat(64),
});
const setup = () => {
  const selected = { syntheticSelected: true },
    open = vi.fn(async () => selected),
    clock = vi.fn(() => ({
      operationId: entityId("application-operation", id(8)),
      initiatedAt: at,
    })),
    createId = vi.fn(() => id(9)),
    hash = vi.fn(async (text) => sha(text));
  return {
    selected,
    open,
    clock,
    createId,
    hash,
    api: createStoredContactFieldUseApi(open, clock, createId, hash),
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.record.mockImplementation(async (r) => ({
    specVersion: 1,
    kind: r.kind,
    vaultId: r.expectedVaultId,
    recordId: r.sourceSnapshotId,
    operationId: r.operationId,
    recordedAt: r.recordedAt,
    sourceSnapshotId: r.sourceSnapshotId,
    sourceHash: r.sourceHash,
    valueHash: null,
    policyId: null,
    rowVersion: 1,
    fieldRevision: null,
  }));
  ports.control.mockImplementation(async (r) => ({
    specVersion: 1,
    kind: r.kind,
    vaultId: r.expectedVaultId,
    recordId: r.recordId,
    recordedAt: r.recordedAt,
    rowVersion: 2,
  }));
  ports.inspect.mockImplementation(async (r) => ({
    specVersion: 1,
    kind: r.kind,
    vaultId: r.expectedVaultId,
    recordId: r.kind === "source" ? r.sourceSnapshotId : r.recordId,
    originalOperationId: r.operationId,
    state: "absent",
    rowVersion: null,
    lifecycle: null,
  }));
});
describe("normal selected-runtime contact field use", () => {
  it("constructs and binds copied actions without opening, hashing, reading context or allocating IDs", () => {
    const local = setup(),
      input = source(),
      action = local.api.beginRecord(input);
    expect(Object.isFrozen(local.api)).toBe(true);
    expect(Object.isFrozen(action.input)).toBe(true);
    input.literalText = "mutated";
    expect(action.input.literalText).toBe(source().literalText);
    local.api.beginControl(control());
    for (const fn of [local.open, local.hash, local.clock, local.createId, ports.factory])
      expect(fn).not.toHaveBeenCalled();
    expect(action.attemptContext()).toBe(null);
    expect(action.originalRequest()).toBe(null);
    expect(action.wasDispatched()).toBe(false);
  });
  it.each([0, 1, 2, 3])("rejects missing capability %i", (n) => {
    const args = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    args[n] = null;
    expect(() => createStoredContactFieldUseApi(...args)).toThrow();
  });
  it.each([
    {},
    { ...source(), sourceHash: "a".repeat(64) },
    { ...source(), expectedVaultId: "bad" },
    { ...source(), literalText: "\ud800" },
  ])("rejects invalid bind before any IO", (input) => {
    const local = setup();
    expect(() => local.api.beginRecord(input)).toThrow();
    expect(local.open).not.toHaveBeenCalled();
    expect(local.clock).not.toHaveBeenCalled();
  });
  it("allocates record IDs only on explicit request and validates the owned identity", () => {
    const local = setup();
    expect(local.api.newRecordId()).toBe(id(9));
    expect(local.open).not.toHaveBeenCalled();
    local.createId.mockReturnValue("bad");
    expect(() => local.api.newRecordId()).toThrow();
  });
  it.each(["record", "control"])(
    "binds %s to its original request and first operation context",
    async (kind) => {
      const local = setup(),
        action =
          kind === "record" ? local.api.beginRecord(source()) : local.api.beginControl(control());
      expect((await action.submit()).ok).toBe(true);
      const original = action.originalRequest();
      expect(Object.isFrozen(original)).toBe(true);
      expect(original).toMatchObject({ operationId: id(8), recordedAt: at });
      expect(action.wasDispatched()).toBe(true);
      local.clock.mockReturnValue({
        operationId: entityId("application-operation", id(99)),
        initiatedAt: later,
      });
      expect((await action.submit()).ok).toBe(true);
      expect(action.originalRequest()).toEqual(original);
      expect(local.clock).toHaveBeenCalledTimes(1);
      expect(ports.factory.mock.calls[0]).toEqual([local.selected, local.hash]);
    },
  );
  it("copies the first context once before an asynchronous digest can mutate its caller", async () => {
    const local = setup(),
      original = { operationId: entityId("application-operation", id(8)), initiatedAt: at };
    local.clock.mockReturnValue(original);
    let release;
    local.hash.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const action = local.api.beginRecord(source()),
      pending = action.submit();
    original.operationId = entityId("application-operation", id(99));
    original.initiatedAt = later;
    release(sha(source().literalText));
    expect((await pending).ok).toBe(true);
    expect(action.originalRequest()).toMatchObject({ operationId: id(8), recordedAt: at });
  });
  it("reads context accessors only once", async () => {
    const local = setup();
    let reads = 0;
    local.clock.mockReturnValue({
      get operationId() {
        reads += 1;
        return entityId("application-operation", id(reads === 1 ? 8 : 99));
      },
      initiatedAt: at,
    });
    const action = local.api.beginRecord(source());
    expect((await action.submit()).ok).toBe(true);
    expect(reads).toBe(1);
    expect(action.originalRequest().operationId).toBe(id(8));
  });
  it("never replaces an original inspection request when a later digest disagrees", async () => {
    const local = setup(),
      action = local.api.beginRecord(source());
    await action.submit();
    const original = action.originalRequest();
    local.hash.mockResolvedValue("c".repeat(64));
    expect(await action.submit()).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(action.originalRequest()).toBe(original);
    expect(ports.record).toHaveBeenCalledTimes(1);
  });
  it.each(["record", "control"])(
    "retains uncertain %s identity and offers a read-only observation without replay",
    async (kind) => {
      const local = setup(),
        action =
          kind === "record" ? local.api.beginRecord(source()) : local.api.beginControl(control());
      ports[kind].mockRejectedValue(new Error("PRIVATE SQL sentinel"));
      const result = await action.submit();
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      const original = action.originalRequest();
      expect((await action.inspect()).ok).toBe(true);
      expect(ports.inspect).toHaveBeenCalledWith(original);
      expect(ports[kind]).toHaveBeenCalledTimes(1);
      expect(action.originalRequest()).toBe(original);
    },
  );
  it("does not invent an original operation to inspect before submission", async () => {
    const local = setup(),
      action = local.api.beginRecord(source());
    expect(await action.inspect()).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect(local.clock).not.toHaveBeenCalled();
  });
  it("keeps pre-dispatch database failure distinct from a dispatched write", async () => {
    const local = setup(),
      action = local.api.beginRecord(source());
    local.open.mockRejectedValue(new Error("PRIVATE database sentinel"));
    expect(await action.submit()).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(action.wasDispatched()).toBe(false);
    expect(action.originalRequest()).not.toBeNull();
    expect(ports.record).not.toHaveBeenCalled();
  });
  it("validates metadata-only query intent before opening storage", async () => {
    const local = setup();
    expect(
      await local.api.readField({
        specVersion: 1,
        expectedVaultId: id(1),
        contactId: id(2),
        expectedContactRowVersion: 0,
        fieldName: "email",
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect(local.hash).not.toHaveBeenCalled();
  });
  it("redacts a malformed runtime context before any open", async () => {
    const local = setup();
    local.clock.mockReturnValue({ operationId: "PRIVATE", initiatedAt: at });
    expect(await local.api.beginRecord(source()).submit()).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.open).not.toHaveBeenCalled();
  });
});
