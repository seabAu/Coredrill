import { beforeEach, describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import { ContactFieldEvidenceError } from "../../packages/application/dist/index.js";

const ports = vi.hoisted(() => ({ listPage: vi.fn(), factory: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createContactFieldEvidenceRepository: (...args) => {
    ports.factory(...args);
    return ports;
  },
}));
import { createStoredContactFieldEvidenceApi } from "../../apps/web/src/stored-contact-field-evidence.ts";

const id = (n) => `0198e110-0000-7000-8000-${String(n).padStart(12, "0")}`;
const request = {
  specVersion: 1,
  expectedVaultId: id(1),
  contactId: id(2),
  expectedContactRowVersion: 2,
  fieldName: "email",
};
const page = (input = request) => ({
  specVersion: 1,
  vaultId: input.expectedVaultId,
  contactId: input.contactId,
  contactRowVersion: input.expectedContactRowVersion,
  fieldName: input.fieldName,
  includeArchived: input.includeArchived ?? false,
  currentValueHash: "a".repeat(64),
  publicOrLicensedEligibility: "not_established",
  items: [],
  hasMore: false,
  nextCursor: null,
});
const setup = () => {
  const selected = { syntheticSelectedDatabase: true };
  const open = vi.fn(async () => selected);
  const context = vi.fn(() => ({
    operationId: entityId("application-operation", id(3)),
    initiatedAt: instant("2026-10-24T04:00:00.000Z"),
  }));
  const hash = vi.fn(async () => "a".repeat(64));
  return {
    selected,
    open,
    context,
    hash,
    api: createStoredContactFieldEvidenceApi(open, context, hash),
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.listPage.mockImplementation(async (input) => page(input));
});
describe("selected-runtime contact field evidence", () => {
  it("composes without opening storage, reading context, hashing or constructing a repository", () => {
    const local = setup();
    expect(Object.isFrozen(local.api)).toBe(true);
    for (const mock of [local.open, local.context, local.hash, ports.factory])
      expect(mock).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])("rejects a missing runtime capability (%s)", (index) => {
    const args = [vi.fn(), vi.fn(), vi.fn()];
    args[index] = null;
    expect(() => createStoredContactFieldEvidenceApi(...args)).toThrow();
  });
  it.each([
    {},
    { ...request, expectedVaultId: "bad" },
    { ...request, contactId: "bad" },
    { ...request, expectedContactRowVersion: 0 },
    { ...request, fieldName: "notes" },
    { ...request, limit: 26 },
    { ...request, includeArchived: "yes" },
    { ...request, after: {} },
    { ...request, publicOrLicensedEligibility: "public" },
  ])("rejects malformed input before opening (%j)", async (input) => {
    const local = setup();
    expect(await local.api.page(input)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect(ports.factory).not.toHaveBeenCalled();
    expect(local.hash).not.toHaveBeenCalled();
  });
  it.each(["name", "role", "email", "phone", "public_profile_url"])(
    "uses only the selected database and original local hasher (%s)",
    async (fieldName) => {
      const local = setup();
      const input = { ...request, fieldName, includeArchived: true };
      expect(await local.api.page(input)).toEqual({ ok: true, value: page(input) });
      expect(ports.factory.mock.calls).toEqual([[local.selected, local.hash]]);
      expect(local.open).toHaveBeenCalledOnce();
      expect(local.hash).not.toHaveBeenCalled(); // Only the actual repository hashes canonical values.
    },
  );
  it("copies the complete field scope before awaiting selected storage", async () => {
    const local = setup();
    let release;
    local.open.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const input = { ...request };
    const pending = local.api.page(input);
    input.contactId = id(99);
    input.expectedContactRowVersion = 999;
    input.fieldName = "phone";
    release(local.selected);
    expect(await pending).toEqual({ ok: true, value: page() });
    expect(ports.listPage.mock.calls[0][0]).toMatchObject(request);
    expect(Object.isFrozen(ports.listPage.mock.calls[0][0])).toBe(true);
  });
  it.each(["open", "context"])("redacts %s failure without a fallback", async (capability) => {
    const local = setup();
    local[capability].mockImplementation(() => {
      throw new Error("PRIVATE_SYNTHETIC_PATH");
    });
    const result = await local.api.page(request);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(ports.factory).not.toHaveBeenCalled();
    expect(local.open).toHaveBeenCalledTimes(capability === "open" ? 1 : 0);
  });
  it("validates malformed context before opening", async () => {
    const local = setup();
    local.context.mockReturnValue({ operationId: "bad", initiatedAt: "bad" });
    expect(await local.api.page(request)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.open).not.toHaveBeenCalled();
  });
  it.each([
    ["stale", "conflict", true],
    ["invalid_state", "internal", false],
    ["unavailable", "unavailable", true],
  ])("preserves typed repository failure %s", async (stored, code, retryable) => {
    ports.listPage.mockRejectedValueOnce(new ContactFieldEvidenceError(stored));
    expect(await setup().api.page(request)).toMatchObject({
      ok: false,
      error: { code, retryable },
    });
  });
  it("does not turn missing data into an empty page", async () => {
    ports.listPage.mockResolvedValueOnce(undefined);
    expect(await setup().api.page(request)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
  it.each([
    { vaultId: id(99) },
    { contactId: id(99) },
    { contactRowVersion: 3 },
    { fieldName: "phone" },
    { includeArchived: true },
    { publicOrLicensedEligibility: "public" },
    { extra: "PRIVATE_SYNTHETIC_PATH" },
  ])("rejects foreign or malformed result scope (%j)", async (changes) => {
    ports.listPage.mockResolvedValueOnce({ ...page(), ...changes });
    const result = await setup().api.page(request);
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
