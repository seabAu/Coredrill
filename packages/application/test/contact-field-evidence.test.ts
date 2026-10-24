import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createContactFieldEvidenceQuery,
  ContactFieldEvidenceError,
  parseContactFieldEvidenceRequestV1,
  parseContactFieldEvidenceCursorV1,
} from "../src/contact-field-evidence.js";

const id = (n: number) => `0198e109-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-24T12:00:00.000Z";
const context = { operationId: entityId("application-operation", id(9)), initiatedAt: instant(at) };
const request = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  contactId: id(2),
  expectedContactRowVersion: 3,
  fieldName: "email" as const,
  limit: 1,
};
const item = (n = 10) => ({
  id: id(n),
  contactId: id(2),
  fieldName: "email",
  valueHash: "a".repeat(64),
  createdAt: at,
  rowVersion: 1,
  provenanceId: id(20),
  provenanceRowVersion: 1,
  snapshotId: id(21),
  snapshotRowVersion: 1,
  jobSourceId: id(22),
  sourceRowVersion: 1,
  jobId: id(23),
  method: "selector",
  pointer: "/synthetic/email",
  excerpt: "\uFEFF <b>literal</b> 🧭\u0000tail",
  confidence: 1,
  capturedAt: at,
  licenseNote: "UNTRUSTED public/licensed assertion",
  extractorId: "synthetic-audit",
  extractorVersion: "1",
  snapshotHash: "b".repeat(64),
  sourceUrl: "https://synthetic.example/team",
  connectorId: null,
  matchesCurrentValue: true,
});
const page = () => ({
  specVersion: 1,
  vaultId: id(1),
  contactId: id(2),
  contactRowVersion: 3,
  fieldName: "email",
  includeArchived: false,
  currentValueHash: "a".repeat(64),
  publicOrLicensedEligibility: "not_established",
  items: [item()],
  hasMore: false,
  nextCursor: null,
});
const setup = (value: unknown = page()) => {
  const listPage = vi.fn(async (_input: unknown) => value);
  return { listPage, query: createContactFieldEvidenceQuery({ listPage }) };
};

describe("selected contact field evidence", () => {
  it.each(["name", "role", "email", "phone", "public_profile_url"] as const)(
    "retains supported field %s without inferring eligibility",
    async (fieldName) => {
      const source = { ...page(), fieldName, items: [{ ...item(), fieldName }] };
      expect(await setup(source).query.execute({ ...request, fieldName }, context)).toEqual({
        ok: true,
        value: source,
      });
    },
  );
  it.each(["api", "jsonld", "selector", "readability", "heuristic", "llm", "user"])(
    "retains source method %s, not permission",
    async (method) => {
      const source = { ...page(), items: [{ ...item(), method }] };
      expect(await setup(source).query.execute(request, context)).toEqual({
        ok: true,
        value: source,
      });
    },
  );
  it("returns literal copied evidence without inventing public/license eligibility", async () => {
    const source = page();
    const local = setup(source);
    const result = await local.query.execute(request, context);
    expect(result).toEqual({ ok: true, value: source });
    expect(local.query.readOnly).toBe(true);
    if (!result.ok) throw new Error("Expected evidence");
    const first = source.items[0];
    if (first === undefined) throw new Error("Missing synthetic evidence");
    first.excerpt = "mutated";
    expect(result.value.items[0]?.excerpt).toBe(item().excerpt);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
  });
  it.each([
    null,
    {},
    { ...request, specVersion: 2 },
    { ...request, fieldName: "notes" },
    { ...request, expectedContactRowVersion: 0 },
    { ...request, expectedVaultId: "bad" },
    { ...request, limit: 51 },
    { ...request, includeArchived: "false" },
    { ...request, public: true },
  ])("rejects malformed input before storage (%j)", async (input) => {
    const local = setup();
    expect(await local.query.execute(input as typeof request, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(local.listPage).not.toHaveBeenCalled();
  });
  it.each([
    { publicOrLicensedEligibility: "public" },
    { vaultId: id(30) },
    { contactRowVersion: 4 },
    { fieldName: "phone" },
    { total: 1 },
    { items: [{ ...item(), matchesCurrentValue: false }] },
    { items: [{ ...item(), contactId: id(30) }] },
    { items: [{ ...item(), fieldName: "phone" }] },
    { items: [{ ...item(), sourceUrl: "javascript:alert(1)" }] },
    { items: [{ ...item(), confidence: 2 }] },
    { items: [{ ...item(), excerpt: "x".repeat(16385) }] },
    { hasMore: true },
  ])("rejects substituted or unbounded evidence (%j)", async (patch) => {
    expect(await setup({ ...page(), ...patch }).query.execute(request, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it("distinguishes null current values and historical mismatches without dropping evidence", async () => {
    for (const currentValueHash of [null, "c".repeat(64)]) {
      const source = {
        ...page(),
        currentValueHash,
        items: [{ ...item(), matchesCurrentValue: false }],
      };
      expect(await setup(source).query.execute(request, context)).toEqual({
        ok: true,
        value: source,
      });
    }
  });
  it("copies scope before awaiting storage and rejects invalid context before reading", async () => {
    const source = { ...request };
    const local = setup();
    const result = local.query.execute(source, context);
    source.contactId = id(30);
    expect(await result).toMatchObject({ ok: true });
    expect(local.listPage.mock.calls[0]?.[0]).toMatchObject({ contactId: id(2) });
    expect(
      await setup().query.execute(request, {
        ...context,
        operationId: "bad" as typeof context.operationId,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
  });
  it("validates live page ordering and exact continuation", async () => {
    const first = item();
    const cursor = {
      specVersion: 1,
      vaultId: id(1),
      contactId: id(2),
      contactRowVersion: 3,
      includeArchived: false,
      fieldName: "email",
      id: first.id,
      createdAt: at,
      rowVersion: 1,
      provenanceId: first.provenanceId,
      provenanceRowVersion: 1,
      snapshotId: first.snapshotId,
      snapshotRowVersion: 1,
      jobSourceId: first.jobSourceId,
      sourceRowVersion: 1,
      jobId: first.jobId,
    };
    expect(
      await setup({ ...page(), hasMore: true, nextCursor: cursor }).query.execute(request, context),
    ).toMatchObject({ ok: true });
    const next = { ...request, after: parseContactFieldEvidenceCursorV1(cursor) };
    expect(
      await setup({ ...page(), items: [item(11)] }).query.execute(next, context),
    ).toMatchObject({ ok: true });
    expect(await setup().query.execute(next, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(() => parseContactFieldEvidenceRequestV1({ ...next, contactId: id(31) })).toThrow();
  });
  it("distinguishes missing from unavailable storage without leaking private errors", async () => {
    const missing = setup(null);
    missing.listPage.mockResolvedValue(undefined);
    expect(await missing.query.execute(request, context)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    missing.listPage.mockRejectedValue(new Error("synthetic private diagnostic"));
    const result = await missing.query.execute(request, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("synthetic private diagnostic");
  });
  it.each(["stale", "invalid_state", "unavailable"] as const)(
    "maps safe failure %s without raw content",
    async (code) => {
      const local = setup();
      local.listPage.mockRejectedValue(new ContactFieldEvidenceError(code));
      expect(await local.query.execute(request, context)).toMatchObject({
        ok: false,
        error: {
          code:
            code === "stale" ? "conflict" : code === "invalid_state" ? "internal" : "unavailable",
        },
      });
    },
  );
  it.each([null, {}, { listPage: true }])("rejects incomplete port %j", (port) => {
    expect(() =>
      createContactFieldEvidenceQuery(
        port as unknown as Parameters<typeof createContactFieldEvidenceQuery>[0],
      ),
    ).toThrow();
  });
  it("retains the original read capability and explicit absent/empty fields", async () => {
    const source = {
      ...page(),
      items: [{ ...item(), excerpt: "", licenseNote: null, sourceUrl: null }],
    };
    const original = vi.fn(async (_input: unknown): Promise<unknown> => source);
    const port = { listPage: original };
    const query = createContactFieldEvidenceQuery(port);
    port.listPage = vi.fn(async (_input: unknown): Promise<unknown> => {
      throw new Error("Unexpected replacement");
    });
    expect(await query.execute(request, context)).toEqual({ ok: true, value: source });
    expect(original).toHaveBeenCalledOnce();
    expect(() => new ContactFieldEvidenceError("unknown" as "stale")).toThrow();
  });
  it("rejects duplicate, reversed and oversized pages instead of inventing a total", async () => {
    for (const items of [
      [item(), item()],
      [item(11), item(10)],
    ]) {
      expect(
        await setup({ ...page(), items }).query.execute({ ...request, limit: 2 }, context),
      ).toMatchObject({ ok: false, error: { code: "internal" } });
    }
    expect(
      await setup({ ...page(), items: [item(), item(11)] }).query.execute(request, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(
      await setup({ ...page(), items: [], currentValueHash: null }).query.execute(request, context),
    ).toMatchObject({ ok: true, value: { currentValueHash: null, items: [] } });
    expect(parseContactFieldEvidenceRequestV1({ ...request, limit: undefined })).toMatchObject({
      limit: 20,
    });
    expect(() => parseContactFieldEvidenceRequestV1({ ...request, limit: 26 })).toThrow();
  });
});
