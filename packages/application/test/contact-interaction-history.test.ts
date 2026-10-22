import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  ContactInteractionHistoryError,
  createContactInteractionHistoryQuery,
  parseContactInteractionsPageV1,
  parseContactInteractionsRequestV1,
  type ListContactInteractionsInputV1,
  type ListContactInteractionsPortInputV1,
} from "../src/contact-interaction-history.js";

const vaultId = entityId("vault", "0198e104-0000-7000-8000-000000000001");
const contactId = entityId("contact", "0198e104-0000-7000-8000-000000000002");
const jobId = entityId("job", "0198e104-0000-7000-8000-000000000003");
const interactionId = entityId("interaction", "0198e104-0000-7000-8000-000000000004");
const otherContact = entityId("contact", "0198e104-0000-7000-8000-000000000005");
const at = instant("2026-10-22T04:00:00.000Z");
const context = {
  operationId: entityId("application-operation", "0198e104-0000-7000-8000-000000000006"),
  initiatedAt: at,
};
const input = { specVersion: 1, expectedVaultId: vaultId, contactId } as const;
const literal = "\uFEFFSynthetic\0<script>literal</script>\n😀";
const entry = () => ({
  id: interactionId,
  contactId,
  currentJob: { id: jobId, title: "Synthetic <role>", archivedAt: null, rowVersion: 2 },
  type: "meeting",
  direction: "mutual",
  occurredAt: at,
  createdAt: at,
  rowVersion: 1,
  summaryPreview: literal,
  summaryByteLength: new TextEncoder().encode(literal).byteLength,
  summaryTruncated: false,
});
const page = () => ({
  specVersion: 1,
  vaultId,
  contactId,
  contactRowVersion: 3,
  includeArchived: false,
  items: [entry()],
  hasMore: false,
  nextCursor: null,
});
const anchor = () => ({
  specVersion: 1,
  vaultId,
  contactId,
  contactRowVersion: 3,
  includeArchived: false,
  occurredAt: at,
  id: interactionId,
  rowVersion: 1,
  jobId,
  jobRowVersion: 2,
});
const execute = async (response: unknown, request: unknown = input) => {
  const listPage = vi.fn(async () => response);
  return {
    result: await createContactInteractionHistoryQuery({ listPage }).execute(
      request as ListContactInteractionsInputV1,
      context,
    ),
    listPage,
  };
};

describe("owned contact interaction history boundary", () => {
  it("copies/freezes literal minimized results and declares a read-only query", async () => {
    const source = page();
    const { result, listPage } = await execute(source);
    expect(createContactInteractionHistoryQuery({ listPage }).readOnly).toBe(true);
    expect(listPage).toHaveBeenCalledWith({
      ...input,
      limit: 25,
      includeArchived: false,
      after: null,
    });
    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok) throw new Error("Expected history");
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0]?.currentJob)).toBe(true);
    source.items[0]!.currentJob.title = "Changed later";
    expect(result.value.items[0]?.currentJob.title).toBe("Synthetic <role>");
    expect(result.value.items[0]?.summaryPreview).toBe(literal);
    expect(Object.keys(result.value)).not.toContain("total");
  });

  it.each([
    null,
    {},
    { ...input, specVersion: 2 },
    { ...input, expectedVaultId: "bad" },
    { ...input, contactId: "bad" },
    { ...input, companyId: jobId },
    { ...input, limit: 0 },
    { ...input, limit: 101 },
    { ...input, limit: 1.5 },
    { ...input, includeArchived: "false" },
    { ...input, after: { ...anchor(), contactId: otherContact } },
    { ...input, after: { ...anchor(), vaultId: jobId } },
    { ...input, after: { ...anchor(), includeArchived: true } },
    { ...input, after: { ...anchor(), extra: true } },
  ])("rejects malformed or rebound requests before storage: %j", async (request) => {
    const { result, listPage } = await execute(page(), request);
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(listPage).not.toHaveBeenCalled();
  });

  it("copies the request before the first awaited adapter boundary", async () => {
    const mutable = { ...input, contactId: String(contactId) };
    let captured: ListContactInteractionsPortInputV1 | undefined;
    let release: ((value: unknown) => void) | undefined;
    const query = createContactInteractionHistoryQuery({
      listPage: (scope) => {
        captured = scope;
        return new Promise<unknown>((resolve) => {
          release = resolve;
        });
      },
    });
    const pending = query.execute(mutable, context);
    mutable.contactId = otherContact;
    expect(captured?.contactId).toBe(contactId);
    expect(Object.isFrozen(captured)).toBe(true);
    if (release === undefined) throw new Error("Expected pending adapter");
    release(page());
    expect(await pending).toMatchObject({ ok: true });
  });

  it.each([
    { ...page(), contactId: otherContact },
    { ...page(), vaultId: jobId },
    { ...page(), includeArchived: true },
    { ...page(), total: 1 },
    { ...page(), contactRowVersion: 0 },
    { ...page(), items: [entry(), entry()] },
    { ...page(), items: [{ ...entry(), contactId: otherContact }] },
    { ...page(), items: [{ ...entry(), email: "synthetic@example.test" }] },
    { ...page(), items: [{ ...entry(), direction: "sent" }] },
    { ...page(), items: [{ ...entry(), type: "not a type" }] },
    { ...page(), items: [{ ...entry(), currentJob: { ...entry().currentJob, archivedAt: at } }] },
    { ...page(), items: [{ ...entry(), summaryTruncated: true }] },
    { ...page(), items: [{ ...entry(), summaryByteLength: 800_001 }] },
    { ...page(), items: [{ ...entry(), summaryPreview: "\ud800", summaryByteLength: 3 }] },
    {
      ...page(),
      items: [{ ...entry(), summaryPreview: "😀".repeat(257), summaryByteLength: 1_028 }],
    },
    { ...page(), hasMore: true },
    { ...page(), nextCursor: anchor() },
  ])("rejects forged or over-bounded stored results: %j", async (response) => {
    expect((await execute(response)).result).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });

  it("binds continuation to the exact last interaction, owner and current job versions", () => {
    const response = { ...page(), hasMore: true, nextCursor: anchor() };
    const scope = { ...input, limit: 1 };
    expect(parseContactInteractionsPageV1(response, scope).hasMore).toBe(true);
    for (const patch of [
      { contactRowVersion: 4 },
      { rowVersion: 2 },
      { jobRowVersion: 3 },
      { jobId: vaultId },
      { occurredAt: instant("2026-10-21T04:00:00.000Z") },
    ]) {
      expect(() =>
        parseContactInteractionsPageV1(
          { ...response, nextCursor: { ...anchor(), ...patch } },
          scope,
        ),
      ).toThrow();
    }
    expect(() =>
      parseContactInteractionsPageV1(
        { ...page(), items: [] },
        {
          ...scope,
          after: { ...anchor(), contactRowVersion: 4, specVersion: 1 },
        },
      ),
    ).toThrow();
  });

  it("does not invent a wall-clock ceiling or discard valid future-dated imported history", async () => {
    const future = instant("2027-01-01T00:00:00.000Z");
    const response = { ...page(), items: [{ ...entry(), occurredAt: future, createdAt: future }] };
    expect((await execute(response)).result).toMatchObject({ ok: true });
  });

  it("checks equal-time order and consistency of repeated current-job metadata", () => {
    const later = {
      ...entry(),
      id: entityId("interaction", "0198e104-0000-7000-8000-000000000007"),
    };
    expect(
      parseContactInteractionsPageV1({ ...page(), items: [entry(), later] }, input).items,
    ).toHaveLength(2);
    expect(() =>
      parseContactInteractionsPageV1({ ...page(), items: [later, entry()] }, input),
    ).toThrow();
    expect(() =>
      parseContactInteractionsPageV1(
        {
          ...page(),
          items: [
            entry(),
            {
              ...later,
              currentJob: { ...later.currentJob, title: "Inconsistent current title" },
            },
          ],
        },
        input,
      ),
    ).toThrow();
    expect(
      parseContactInteractionsPageV1(
        { ...page(), items: [later] },
        {
          ...input,
          after: { ...anchor(), specVersion: 1 },
        },
      ).items,
    ).toHaveLength(1);
  });

  it("accepts scalar-safe byte-bounded truncation, but not an arbitrarily short preview", () => {
    const preview = "a".repeat(1_021);
    const response = {
      ...page(),
      items: [
        { ...entry(), summaryPreview: preview, summaryByteLength: 2_000, summaryTruncated: true },
      ],
    };
    expect(parseContactInteractionsPageV1(response, input).items[0]?.summaryTruncated).toBe(true);
    expect(() =>
      parseContactInteractionsPageV1(
        { ...response, items: [{ ...response.items[0], summaryPreview: "a".repeat(1_020) }] },
        input,
      ),
    ).toThrow();
  });

  it.each([
    [new ContactInteractionHistoryError("cursor_invalidated"), "conflict"],
    [new ContactInteractionHistoryError("invalid_state"), "internal"],
    [new Error("synthetic private path/contact data"), "unavailable"],
  ] as const)("returns content-free adapter failures", async (error, code) => {
    const query = createContactInteractionHistoryQuery({ listPage: () => Promise.reject(error) });
    const result = await query.execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain("synthetic private path/contact data");
  });

  it("keeps unavailable owners distinct from a valid empty history", async () => {
    expect((await execute(undefined)).result).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect((await execute({ ...page(), items: [] })).result).toMatchObject({ ok: true });
    expect(parseContactInteractionsRequestV1({ ...input, limit: 100 }).limit).toBe(100);
  });
});
