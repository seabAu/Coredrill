import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createContactFieldUseOperations,
  ContactFieldUseStorageError,
  type ContactUseRecordRequestV1,
  parseContactUseRecordRequestV1,
  parseContactUseControlRequestV1,
} from "../src/contact-field-use-operations.js";

const id = (n: number) => `0198e120-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-24T12:00:00.000Z";
const due = "2026-11-01T12:00:00.000Z";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const context = { operationId: entityId("application-operation", id(9)), initiatedAt: instant(at) };
const source = () => ({
  specVersion: 1,
  kind: "source",
  expectedVaultId: id(1),
  sourceSnapshotId: id(3),
  sourceClass: "official_employer_page",
  sourceUrl: "https://synthetic.example/team",
  capturedAt: at,
  literalText: "\uFEFFSynthetic source\0🧭",
});
const policy = () => ({
  specVersion: 1,
  kind: "policy",
  expectedVaultId: id(1),
  policyId: id(5),
  sourceSnapshotId: id(3),
  expectedSourceHash: "a".repeat(64),
  fieldName: "email",
  termsSnapshotId: id(6),
  expectedTermsHash: "b".repeat(64),
  termsStartByte: 0,
  termsEndByte: 4,
  termsExcerpt: "test",
  permissionKind: "explicit_public_job_search_contact",
  purpose: "job_search",
  reviewDueAt: due,
  acknowledgement: "I reviewed this source's permitted field use.",
});
const review = () => ({
  specVersion: 1,
  kind: "review",
  expectedVaultId: id(1),
  reviewId: id(4),
  contactId: id(2),
  expectedContactRowVersion: 3,
  expectedLatestReviewId: null,
  fieldName: "email",
  expectedValueHash: "c".repeat(64),
  sourceSnapshotId: id(3),
  expectedSourceHash: "a".repeat(64),
  sourceStartByte: 0,
  sourceEndByte: 4,
  sourceExcerpt: "test",
  policyId: id(5),
  policyRevision: 1,
  purpose: "job_search",
  purposeNote: "Manually review the advertised role.",
  reviewDueAt: due,
  expiresAt: due,
  acknowledgement: "I reviewed this exact contact field and purpose.",
});
const receipt = (r: ContactUseRecordRequestV1) => ({
  specVersion: 1,
  kind: r.kind,
  vaultId: r.expectedVaultId,
  recordId:
    r.kind === "source" ? r.sourceSnapshotId : r.kind === "policy" ? r.policyId : r.reviewId,
  operationId: r.operationId,
  recordedAt: r.recordedAt,
  sourceSnapshotId: r.sourceSnapshotId,
  sourceHash: r.kind === "source" ? r.sourceHash : r.expectedSourceHash,
  valueHash: r.kind === "review" ? r.expectedValueHash : null,
  policyId: r.kind === "source" ? null : r.policyId,
  rowVersion: 1,
  fieldRevision: r.kind === "review" ? 1 : null,
});
const setup = () => {
  const port = {
    record: vi.fn(async (r: ContactUseRecordRequestV1): Promise<unknown> => receipt(r)),
    control: vi.fn(),
    readField: vi.fn(),
    inspect: vi.fn(),
  };
  const hasher = vi.fn(async (value: string) => hash(value));
  return { port, hasher, ops: createContactFieldUseOperations(port, hasher) };
};

describe("contact field-use application operations", () => {
  const control = () => ({
    specVersion: 1,
    kind: "disable_policy",
    expectedVaultId: id(1),
    recordId: id(5),
    expectedRowVersion: 1,
    sourceSnapshotId: id(3),
    expectedSourceHash: "a".repeat(64),
  });
  const read = () => ({
    specVersion: 1,
    expectedVaultId: id(1),
    contactId: id(2),
    expectedContactRowVersion: 3,
    fieldName: "email",
  });
  const emptyState = () => ({
    specVersion: 1,
    vaultId: id(1),
    contactId: id(2),
    contactRowVersion: 3,
    fieldName: "email",
    includeArchived: false,
    contactArchivedAt: null,
    latestReview: null,
    policy: null,
    assessment: null,
  });
  it("binds a lifecycle acknowledgement to its original target and clock", async () => {
    const local = setup();
    local.port.control.mockResolvedValue({
      specVersion: 1,
      kind: "disable_policy",
      vaultId: id(1),
      recordId: id(5),
      recordedAt: at,
      rowVersion: 2,
    });
    expect((await local.ops.control.execute(control(), context)).ok).toBe(true);
    expect(local.port.control.mock.calls[0]?.[0]).toMatchObject({
      operationId: id(9),
      recordedAt: at,
    });
    local.port.control.mockResolvedValue({
      specVersion: 1,
      kind: "disable_policy",
      vaultId: id(1),
      recordId: id(99),
      recordedAt: at,
      rowVersion: 2,
    });
    expect(await local.ops.control.execute(control(), context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(local.port.control).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...control(), expectedRowVersion: 2 },
    { ...control(), sourceHash: "a".repeat(64) },
    { ...control(), operationId: id(99) },
  ])("rejects invalid lifecycle input before dispatch (%#)", async (input) => {
    const local = setup();
    expect(await local.ops.control.execute(input, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.port.control).not.toHaveBeenCalled();
  });
  it("reads a copied clock-owned metadata state without invoking writes or digest", async () => {
    const local = setup();
    local.port.readField.mockResolvedValue(emptyState());
    const result = await local.ops.readField.execute(read(), context);
    expect(result).toMatchObject({ ok: true, value: emptyState() });
    expect(local.port.readField.mock.calls[0]?.[0]).toMatchObject({
      observedAt: at,
      includeArchived: false,
    });
    expect(local.port.record).not.toHaveBeenCalled();
    expect(local.port.control).not.toHaveBeenCalled();
    expect(local.hasher).not.toHaveBeenCalled();
  });
  it.each([
    { ...read(), observedAt: due },
    { ...read(), includeArchived: "yes" },
    { ...read(), expectedContactRowVersion: 0 },
  ])("rejects query scope/clock injection (%#)", async (input) => {
    const local = setup();
    expect(await local.ops.readField.execute(input, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.port.readField).not.toHaveBeenCalled();
  });
  it.each([
    { contactId: id(99) },
    { contactRowVersion: 4 },
    { fieldName: "phone" },
    { rawText: "PRIVATE" },
    { assessment: { eligible: true } },
  ])("rejects foreign, raw or inconsistent metadata (%#)", async (change) => {
    const local = setup();
    local.port.readField.mockResolvedValue({ ...emptyState(), ...change });
    expect(await local.ops.readField.execute(read(), context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(local.port.readField).toHaveBeenCalledTimes(1);
  });
  it("inspects the copied original operation rather than assigning the inspection clock", async () => {
    const local = setup();
    const original = parseContactUseRecordRequestV1({
      ...source(),
      sourceHash: hash(source().literalText),
      operationId: id(8),
      recordedAt: at,
    });
    local.port.inspect.mockResolvedValue({
      specVersion: 1,
      kind: "source",
      vaultId: id(1),
      recordId: id(3),
      originalOperationId: id(8),
      state: "matching",
      rowVersion: 1,
      lifecycle: "retained",
    });
    expect(
      (await local.ops.inspect.execute(original, { ...context, initiatedAt: instant(due) })).ok,
    ).toBe(true);
    expect(local.port.inspect.mock.calls[0]?.[0]).toEqual(original);
    expect(Object.isFrozen(local.port.inspect.mock.calls[0]?.[0])).toBe(true);
    expect(local.port.record).not.toHaveBeenCalled();
    expect(local.port.control).not.toHaveBeenCalled();
  });
  it("does not accept a claimed matching lifecycle operation on an unchanged row", async () => {
    const local = setup();
    const original = parseContactUseControlRequestV1({
      ...control(),
      operationId: id(8),
      recordedAt: at,
    });
    local.port.inspect.mockResolvedValue({
      specVersion: 1,
      kind: "disable_policy",
      vaultId: id(1),
      recordId: id(5),
      originalOperationId: id(8),
      state: "matching",
      rowVersion: 1,
      lifecycle: "enabled",
    });
    expect(await local.ops.inspect.execute(original, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it.each(["control", "readField", "inspect"] as const)(
    "redacts unknown %s failures without retry or writes elsewhere",
    async (name) => {
      const local = setup();
      local.port[name].mockRejectedValue(new Error("PRIVATE sentinel"));
      const input =
        name === "control"
          ? control()
          : name === "readField"
            ? read()
            : parseContactUseRecordRequestV1({
                ...source(),
                sourceHash: hash(source().literalText),
                operationId: id(8),
                recordedAt: at,
              });
      const result = await local.ops[name].execute(input, context);
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      expect(local.port[name]).toHaveBeenCalledTimes(1);
      expect(local.port.record).not.toHaveBeenCalled();
    },
  );
  it.each([source, policy, review])(
    "records a strict explicitly separate action (%#)",
    async (fixture) => {
      const local = setup();
      const result = await local.ops.record.execute(fixture(), context);
      expect(result.ok).toBe(true);
      expect(local.port.record).toHaveBeenCalledTimes(1);
      const request = local.port.record.mock.calls[0]?.[0];
      expect(request).toMatchObject({ operationId: id(9), recordedAt: at });
      expect(Object.isFrozen(request)).toBe(true);
      if (fixture === source)
        expect(request).toMatchObject({ sourceHash: hash(source().literalText) });
    },
  );

  it.each([
    null,
    {},
    { ...source(), specVersion: 2 },
    { ...source(), rightsBasis: "public" },
    { ...source(), operationId: id(99) },
    { ...source(), recordedAt: at },
    { ...source(), sourceUrl: "javascript:bad" },
    { ...source(), literalText: "\ud800" },
    { ...source(), capturedAt: due },
    { ...source(), literalText: "x".repeat(4194305) },
    { ...policy(), acknowledgement: "yes" },
    { ...policy(), reviewDueAt: at },
    { ...policy(), termsEndByte: 3 },
    { ...policy(), policy: { allowed: true } },
    { ...review(), purpose: "outreach" },
    { ...review(), purposeNote: " " },
    { ...review(), expectedContactRowVersion: 0 },
    { ...review(), sourceStartByte: -1 },
    { ...review(), expectedValueHash: "C".repeat(64) },
    { ...review(), expiresAt: at },
  ])("rejects malformed or authority-bearing input before any port access (%#)", async (input) => {
    const local = setup();
    expect(await local.ops.record.execute(input, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.port.record).not.toHaveBeenCalled();
    expect(local.hasher).not.toHaveBeenCalled();
  });

  it("copies source input before the asynchronous digest and never silently rebases", async () => {
    const local = setup();
    let release: ((value: string) => void) | undefined;
    local.hasher.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const input = source();
    const pending = local.ops.record.execute(input, context);
    input.literalText = "mutated";
    input.expectedVaultId = id(88);
    if (!release) throw new Error("Missing synthetic digest");
    release(hash(source().literalText));
    expect((await pending).ok).toBe(true);
    expect(local.port.record.mock.calls[0]?.[0]).toMatchObject({
      expectedVaultId: id(1),
      literalText: source().literalText,
    });
  });

  it("captures operation context before an input accessor can mutate the caller's context", async () => {
    const local = setup();
    const originalContext = { ...context };
    const input = source();
    Object.defineProperty(input, "literalText", {
      enumerable: true,
      get: () => {
        originalContext.operationId = entityId("application-operation", id(99));
        originalContext.initiatedAt = instant(due);
        return source().literalText;
      },
    });
    expect((await local.ops.record.execute(input, originalContext)).ok).toBe(true);
    expect(local.port.record.mock.calls[0]?.[0]).toMatchObject({
      operationId: id(9),
      recordedAt: at,
    });
  });

  it.each(["recordId", "operationId", "vaultId", "sourceSnapshotId", "policyId"])(
    "rejects a foreign %s acknowledgement",
    async (key) => {
      const local = setup();
      local.port.record.mockImplementation(async (r) => ({ ...receipt(r), [key]: id(99) }));
      expect(await local.ops.record.execute(review(), context)).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
      expect(local.port.record).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["sourceHash", "valueHash", "recordedAt", "rowVersion", "fieldRevision", "extra"])(
    "rejects malformed receipt %s without another write",
    async (key) => {
      const local = setup();
      local.port.record.mockImplementation(async (r) => ({ ...receipt(r), [key]: "bad" }));
      expect(await local.ops.record.execute(review(), context)).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
      expect(local.port.record).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["stale", "not_found", "invalid_state", "unavailable"] as const)(
    "preserves safe typed %s failures",
    async (code) => {
      const local = setup();
      local.port.record.mockRejectedValue(new ContactFieldUseStorageError(code));
      const result = await local.ops.record.execute(review(), context);
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: code === "stale" ? "conflict" : code === "invalid_state" ? "internal" : code,
        },
      });
      expect(local.port.record).toHaveBeenCalledTimes(1);
    },
  );

  it("redacts unknown port/digest failures without claiming an unchanged vault or retrying", async () => {
    const local = setup();
    local.port.record.mockRejectedValue(new Error("private SQL sentinel"));
    const result = await local.ops.record.execute(review(), context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("sentinel");
    local.hasher.mockRejectedValue(new Error("private digest sentinel"));
    expect(await local.ops.record.execute(source(), context)).toMatchObject({
      ok: false,
      error: { code: "unavailable" },
    });
    expect(local.port.record).toHaveBeenCalledTimes(1);
  });
});
