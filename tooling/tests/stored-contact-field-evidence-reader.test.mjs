import { describe, expect, it, vi } from "vitest";
import {
  contactFieldEvidenceCursorV1,
  parseContactFieldEvidenceRequestV1,
} from "../../packages/application/dist/index.js";
import { createStoredContactFieldEvidenceReader } from "../../apps/web/src/stored-contact-field-evidence-reader.ts";

const id = (n) => `0198e111-0000-7000-8000-${String(n).padStart(12, "0")}`;
const owner = {
  specVersion: 1,
  expectedVaultId: id(1),
  contactId: id(2),
  expectedContactRowVersion: 2,
  fieldName: "email",
  limit: 1,
};
const item = (n = 10) => ({
  id: id(n),
  createdAt: "2026-10-24T04:00:00.000Z",
  rowVersion: 1,
  provenanceId: id(n + 100),
  provenanceRowVersion: 1,
  snapshotId: id(n + 200),
  snapshotRowVersion: 1,
  jobSourceId: id(n + 300),
  sourceRowVersion: 1,
  jobId: id(3),
  contactId: id(2),
  fieldName: "email",
  valueHash: "a".repeat(64),
  matchesCurrentValue: true,
  method: "user",
  pointer: "synthetic/email",
  excerpt: "\uFEFF🧭\0<script>literal</script>尾",
  confidence: 0.8,
  capturedAt: "2026-10-24T03:00:00.000Z",
  licenseNote: "Not permission",
  extractorId: "synthetic",
  extractorVersion: "1",
  snapshotHash: "b".repeat(64),
  sourceUrl: "https://synthetic.example/job",
  connectorId: null,
});
const page = (items = [item()], more = false, changes = {}) => ({
  ok: true,
  value: {
    specVersion: 1,
    vaultId: id(1),
    contactId: id(2),
    contactRowVersion: 2,
    fieldName: "email",
    includeArchived: false,
    currentValueHash: "a".repeat(64),
    publicOrLicensedEligibility: "not_established",
    items,
    hasMore: more,
    nextCursor: more
      ? contactFieldEvidenceCursorV1(parseContactFieldEvidenceRequestV1(owner), items.at(-1))
      : null,
    ...changes,
  },
});
const failure = (code = "unavailable", retryable = true) => ({
  ok: false,
  error: { code, retryable, message: "PRIVATE_SYNTHETIC_PATH" },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const setup = (scope = owner) => {
  const read = vi.fn(async () => page());
  const changed = vi.fn();
  return { read, changed, reader: createStoredContactFieldEvidenceReader(scope, read, changed) };
};
describe("owned contact field evidence pages", () => {
  it.each([
    {},
    { ...owner, fieldName: "notes" },
    { ...owner, expectedContactRowVersion: 0 },
    { ...owner, expectedVaultId: "bad" },
    { ...owner, includeArchived: "yes" },
    { ...owner, limit: 26 },
    { ...owner, notes: "injected" },
    {
      ...owner,
      after: contactFieldEvidenceCursorV1(parseContactFieldEvidenceRequestV1(owner), item()),
    },
  ])("rejects invalid or continuation-first ownership (%j)", (scope) => {
    const read = vi.fn();
    expect(() => createStoredContactFieldEvidenceReader(scope, read, vi.fn())).toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps one copied immutable live page with literal evidence and exact continuation", async () => {
    const local = setup();
    const first = page([item()], true);
    local.read.mockResolvedValueOnce(first).mockResolvedValueOnce(page([item(11)]));
    expect(local.read).not.toHaveBeenCalled();
    expect(await local.reader.next()).toBe(false);
    expect(await local.reader.retry()).toBe(false);
    await local.reader.first();
    first.value.items[0].excerpt = "mutated";
    expect(local.reader.current().page.items[0].excerpt).toBe(item().excerpt);
    expect(Object.isFrozen(local.reader.current().page.items[0])).toBe(true);
    await local.reader.next();
    expect(local.reader.current().page.items.map(({ id }) => id)).toEqual([id(11)]);
    expect(local.read.mock.calls[1][0].after.id).toBe(id(10));
    expect(local.reader.current().page).not.toHaveProperty("total");
    expect(local.reader.current().page.publicOrLicensedEligibility).toBe("not_established");
    expect(await local.reader.next()).toBe(false);
  });
  it("copies owner before a held read and blocks all overlapping requests", async () => {
    const scope = { ...owner };
    const local = setup(scope);
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.first();
    scope.contactId = id(99);
    scope.fieldName = "phone";
    scope.expectedContactRowVersion = 99;
    expect(await local.reader.first()).toBe(false);
    expect(await local.reader.next()).toBe(false);
    held.release(page());
    await pending;
    expect(local.read.mock.calls[0][0]).toMatchObject(owner);
    expect(Object.isFrozen(local.reader.current().owner)).toBe(true);
  });
  it.each([
    { vaultId: id(99) },
    { contactId: id(99) },
    { contactRowVersion: 3 },
    { fieldName: "phone" },
    { includeArchived: true },
    { publicOrLicensedEligibility: "public" },
    { currentValueHash: "invalid" },
    { items: [{ ...item(), matchesCurrentValue: false }] },
    { extra: "private" },
  ])("rejects rebound, unvalidated or falsely qualified evidence (%j)", async (changes) => {
    const local = setup();
    local.read.mockResolvedValueOnce(page([item()], false, changes));
    await local.reader.first();
    expect(local.reader.current()).toMatchObject({
      page: null,
      refreshRequired: true,
      failed: "first",
    });
    expect(await local.reader.retry()).toBe(false);
    expect(JSON.stringify(local.reader.current())).not.toContain("PRIVATE");
  });
  it("distinguishes a null current field and empty evidence from a missing record", async () => {
    const local = setup();
    local.read.mockResolvedValueOnce(page([], false, { currentValueHash: null }));
    await local.reader.first();
    expect(local.reader.current()).toMatchObject({
      page: { currentValueHash: null, items: [] },
      error: null,
    });
    local.read.mockResolvedValueOnce(failure("not_found", false));
    await local.reader.first();
    expect(local.reader.current()).toMatchObject({
      page: { currentValueHash: null },
      refreshRequired: true,
    });
  });
  it("retains visibly stale prior evidence and retries the exact failed cursor", async () => {
    const local = setup();
    local.read
      .mockResolvedValueOnce(page([item()], true))
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(page([item(11)]));
    await local.reader.first();
    await local.reader.next();
    expect(local.reader.current()).toMatchObject({
      failed: "next",
      busy: false,
      refreshRequired: false,
    });
    expect(local.reader.current().error).toContain("stale");
    expect(local.reader.current().page.items[0].id).toBe(id(10));
    expect(await local.reader.next()).toBe(false);
    await local.reader.retry();
    expect(local.read.mock.calls[2][0]).toEqual(local.read.mock.calls[1][0]);
    expect(local.reader.current().page.items[0].id).toBe(id(11));
  });
  it.each(["conflict", "internal", "not_found", "validation", "permission_denied"])(
    "requires refresh instead of cursor retry for %s",
    async (code) => {
      const local = setup();
      local.read.mockResolvedValueOnce(page([item()], true)).mockResolvedValueOnce(failure(code));
      await local.reader.first();
      await local.reader.next();
      expect(local.reader.current().refreshRequired).toBe(true);
      expect(await local.reader.retry()).toBe(false);
      expect(await local.reader.next()).toBe(false);
      expect(local.read).toHaveBeenCalledTimes(2);
    },
  );
  it("rejects a changed current value hash during continuation even for an empty page", async () => {
    const local = setup();
    local.read
      .mockResolvedValueOnce(page([item()], true))
      .mockResolvedValueOnce(page([], false, { currentValueHash: null }));
    await local.reader.first();
    await local.reader.next();
    expect(local.reader.current()).toMatchObject({
      refreshRequired: true,
      page: { currentValueHash: "a".repeat(64) },
    });
  });
  it("retains the first page after a thrown read and permits only explicit retry", async () => {
    const local = setup();
    local.read.mockRejectedValueOnce(new Error("PRIVATE_SYNTHETIC_PATH"));
    await local.reader.first();
    expect(local.reader.current()).toMatchObject({
      page: null,
      failed: "first",
      refreshRequired: false,
    });
    expect(JSON.stringify(local.reader.current())).not.toContain("PRIVATE");
    await local.reader.retry();
    expect(local.reader.current().error).toBeNull();
  });
  it("suppresses disposed late publication and disposal during the busy callback before I/O", async () => {
    const local = setup();
    const held = deferred();
    local.read.mockReturnValueOnce(held.promise);
    const pending = local.reader.first();
    local.reader.dispose();
    const count = local.changed.mock.calls.length;
    held.release(page());
    expect(await pending).toBe(false);
    expect(local.changed).toHaveBeenCalledTimes(count);
    expect(local.reader.current().page).toBeNull();
    expect(await local.reader.first()).toBe(false);
    const read = vi.fn();
    const reader = createStoredContactFieldEvidenceReader(owner, read, () => reader.dispose());
    expect(await reader.first()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
