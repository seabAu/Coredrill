import { describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { decodeLiteralUtf8Chunk } from "../src/literal-utf8-chunk.js";
import {
  NetworkInteractionHistoryError,
  createNetworkInteractionsQuery,
  createNetworkInteractionSummaryQuery,
  networkInteractionReferenceV1,
  parseNetworkInteractionV1,
  parseNetworkInteractionsRequestV1,
  parseNetworkInteractionSummaryRequestV1,
  parseNetworkInteractionSummaryTextPartV1,
  type ListNetworkInteractionsInputV1,
  type ReadNetworkInteractionSummaryInputV1,
} from "../src/network-interaction-history.js";
const id = (n: number) => `0198e156-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-25T12:00:00.000Z"),
  future = instant("2027-01-01T00:00:00.000Z"),
  context = { operationId: entityId("application-operation", id(90)), initiatedAt: at };
const input = { specVersion: 1 as const, expectedVaultId: id(1), limit: 1 },
  owner = parseNetworkInteractionsRequestV1(input);
const literal = "\uFEFF" + "a".repeat(1020) + "😀\0尾" + "z".repeat(17000);
const entry = (n = 100, summary = literal) => {
  const bytes = new TextEncoder().encode(summary),
    preview = decodeLiteralUtf8Chunk(bytes.slice(0, 1024), bytes.length, 0, 1024);
  return {
    id: id(n),
    contactId: null,
    occurredAt: at,
    createdAt: at,
    rowVersion: 1,
    type: "note",
    direction: "unknown",
    currentJob: {
      id: id(10),
      title: "\uFEFFJob\0尾😀",
      archivedAt: null,
      rowVersion: 1,
      company: null,
    },
    summaryPreview: preview.text,
    summaryByteLength: bytes.length,
    summaryTruncated: preview.hasMore,
  };
};
const page = (items: unknown[] = [entry()], hasMore = false) => ({
  specVersion: owner.specVersion,
  expectedVaultId: owner.expectedVaultId,
  includeArchivedJobs: owner.includeArchivedJobs,
  items,
  hasMore,
  nextCursor: hasMore
    ? networkInteractionReferenceV1(owner, parseNetworkInteractionV1(items.at(-1), owner))
    : null,
});
const execute = (
  value: unknown,
  port = async (_request: unknown): Promise<unknown> => page(),
  ctx = context,
) =>
  createNetworkInteractionsQuery({ listPage: port }).execute(
    value as ListNetworkInteractionsInputV1,
    ctx,
  );
const reference = () =>
  networkInteractionReferenceV1(owner, parseNetworkInteractionV1(entry(), owner));
const summaryInput = () => ({
  specVersion: 1 as const,
  reference: reference(),
  summaryByteLength: new TextEncoder().encode(literal).length,
  limitBytes: 1024,
});
const executeSummary = (
  value: unknown,
  port: (request: ReturnType<typeof parseNetworkInteractionSummaryRequestV1>) => Promise<unknown>,
  ctx = context,
) =>
  createNetworkInteractionSummaryQuery({ readSummaryPart: port }).execute(
    value as ReadNetworkInteractionSummaryInputV1,
    ctx,
  );
const rawPart = (
  request: ReturnType<typeof parseNetworkInteractionSummaryRequestV1>,
  value = literal,
) => ({
  specVersion: 1,
  reference: request.reference,
  summaryByteLength: request.summaryByteLength,
  byteOffset: request.byteOffset,
  bytes: new TextEncoder()
    .encode(value)
    .slice(request.byteOffset, request.byteOffset + request.limitBytes),
});
describe("top-level Network interaction history contracts", () => {
  it("copies/freeze preserves literal bounded preview and job-only/unknown-company history", async () => {
    const raw = entry(),
      result = await execute(input, async () => page([raw]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    raw.currentJob.title = "changed";
    expect(result.value.items[0]?.currentJob.title).toBe("\uFEFFJob\0尾😀");
    expect(result.value.items[0]).toMatchObject({
      contactId: null,
      currentJob: { company: null },
      summaryTruncated: true,
    });
    expect(result.value.items[0]?.summaryPreview).not.toContain("😀");
    expect(Object.isFrozen(result.value.items[0]?.currentJob)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
  });
  it("retains nullable contact and current archived-company metadata without filtering active-job history", async () => {
    const raw = {
      ...entry(),
      contactId: id(30),
      currentJob: {
        ...entry().currentJob,
        company: { id: id(2), name: "\uFEFFCompany\0尾😀", archivedAt: at, rowVersion: 2 },
      },
    };
    const result = await execute(input, async () => page([raw]));
    expect(result).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            contactId: id(30),
            currentJob: { company: { name: "\uFEFFCompany\0尾😀", archivedAt: at } },
          },
        ],
      },
    });
  });
  it("does not hide a valid future-dated imported event behind the operation clock", async () => {
    expect(
      await execute(input, async () =>
        page([{ ...entry(), occurredAt: future, createdAt: future }]),
      ),
    ).toMatchObject({ ok: true });
  });
  it.each([
    { specVersion: 2 },
    { expectedVaultId: "bad" },
    { includeArchivedJobs: 1 },
    { limit: 0 },
    { limit: 26 },
    { limit: 1.5 },
    { privateBody: "bad" },
  ])("rejects malformed input before port calls %j", async (change) => {
    let calls = 0;
    expect(
      await execute({ ...input, ...change }, async () => {
        calls++;
        return page();
      }),
    ).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(calls).toBe(0);
  });
  it("rejects accessors/hidden/symbol fields and invalid operation context without invoking a getter or reading", async () => {
    let calls = 0,
      getter = 0;
    const accessor = Object.defineProperty({ ...input }, "after", {
      enumerable: true,
      get() {
        getter++;
        return null;
      },
    });
    for (const value of [
      accessor,
      { ...input, [Symbol("private")]: true },
      Object.defineProperty({ ...input }, "hidden", { value: true }),
    ])
      expect(
        await execute(value, async () => {
          calls++;
          return page();
        }),
      ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(
      await execute(
        input,
        async () => {
          calls++;
          return page();
        },
        { ...context, operationId: "bad" as typeof context.operationId },
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect([calls, getter]).toEqual([0, 0]);
  });
  it("copies the original continuation before awaiting its port", async () => {
    const cursor = { ...reference(), id: entityId("interaction", id(99)) },
      mutable = { ...input, after: cursor };
    let captured: unknown, release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = execute(mutable, async (request) => {
      captured = request;
      await held;
      return page();
    });
    cursor.jobRowVersion = 99;
    mutable.expectedVaultId = id(9);
    release();
    expect(await pending).toMatchObject({ ok: true });
    expect(captured).toMatchObject({ expectedVaultId: id(1), after: { jobRowVersion: 1 } });
  });
  it("validates exact owner/archive cursor and coherent optional company reference", async () => {
    const result = await execute(input);
    if (!result.ok || result.value.items[0] === undefined) throw Error("Missing valid page");
    expect(networkInteractionReferenceV1(result.value, result.value.items[0])).toEqual(reference());
    for (const after of [
      { ...reference(), expectedVaultId: id(9) },
      { ...reference(), includeArchivedJobs: true },
      { ...reference(), companyId: id(2), companyRowVersion: null },
    ])
      expect(await execute({ ...input, after })).toMatchObject({
        ok: false,
        error: { code: "validation" },
      });
    expect(
      await execute(input, async () => ({
        ...page([entry()], true),
        nextCursor: { ...reference(), jobRowVersion: 2 },
      })),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it.each([
    "private-body",
    "foreign-root",
    "archived-job",
    "bad-direction",
    "bad-unicode",
    "incomplete-preview",
    "wrong-truncation",
    "duplicate",
    "unsorted",
    "incoherent-job",
    "incoherent-company",
    "overflow",
  ])("rejects malformed adapter pages: %s", async (kind) => {
    const item = entry();
    let value: unknown = page();
    if (kind === "private-body") value = page([{ ...item, rawSummary: literal }]);
    if (kind === "foreign-root") value = { ...page(), expectedVaultId: id(9) };
    if (kind === "archived-job")
      value = page([{ ...item, currentJob: { ...item.currentJob, archivedAt: at } }]);
    if (kind === "bad-direction")
      value = page([
        {
          ...item,
          direction: {
            toString() {
              throw Error("getter should not run");
            },
          },
        },
      ]);
    if (kind === "bad-unicode") value = page([{ ...item, summaryPreview: "\ud800" }]);
    if (kind === "incomplete-preview") value = page([{ ...item, summaryPreview: "tiny" }]);
    if (kind === "wrong-truncation") value = page([{ ...item, summaryTruncated: false }]);
    if (kind === "duplicate") value = page([item, item]);
    if (kind === "unsorted") value = page([entry(101), entry(100)]);
    if (kind === "incoherent-job")
      value = page([
        item,
        { ...entry(101), currentJob: { ...item.currentJob, title: "different same job" } },
      ]);
    if (kind === "incoherent-company")
      value = page(
        [item, entry(101)].map((e, i) => ({
          ...e,
          currentJob: {
            ...e.currentJob,
            id: id(10 + i),
            company: {
              id: id(2),
              name: i === 0 ? "Company one" : "Company two",
              archivedAt: null,
              rowVersion: 1,
            },
          },
        })),
      );
    if (kind === "overflow") value = page([entry(), entry(101)]);
    expect(
      await execute(kind === "overflow" ? input : { ...input, limit: 2 }, async () => value),
    ).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
  });
  it("distinguishes confirmed empty/missing and safe retryable/unrecoverable port errors", async () => {
    expect(await execute(input, async () => page([]))).toMatchObject({
      ok: true,
      value: { items: [] },
    });
    expect(await execute(input, async () => undefined)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    for (const [error, code, retryable] of [
      [new NetworkInteractionHistoryError("stale"), "conflict", false],
      [new NetworkInteractionHistoryError("invalid_state"), "internal", false],
      [Error("PRIVATE path/contact methods"), "unavailable", true],
    ] as const) {
      const result = await execute(input, async () => {
        throw error;
      });
      expect(result).toMatchObject({ ok: false, error: { code, retryable } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
    }
  });
});
describe("Network deliberate complete literal summary contracts", () => {
  it("reconstructs BOM/NUL/scalar text through exact bounded byte continuations", async () => {
    let offset = 0,
      reconstructed = "",
      count = 0;
    while (count++ < 30) {
      const result = await executeSummary(
        { ...summaryInput(), byteOffset: offset },
        async (request) => rawPart(request),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.byteOffset).toBe(offset);
      expect(Object.isFrozen(result.value.reference)).toBe(true);
      reconstructed += result.value.text;
      const validated = parseNetworkInteractionSummaryTextPartV1(
        result.value,
        parseNetworkInteractionSummaryRequestV1({ ...summaryInput(), byteOffset: offset }),
      );
      if (!validated.hasMore) break;
      expect(validated.nextByteOffset).toBeGreaterThan(offset);
      offset = validated.nextByteOffset!;
    }
    expect(reconstructed).toBe(literal);
    expect(count).toBeLessThan(30);
  });
  it.each([
    { specVersion: 2 },
    { summaryByteLength: 800001 },
    { byteOffset: -1 },
    { limitBytes: 3 },
    { limitBytes: 65537 },
    { extra: "private" },
  ])("rejects malformed summary request before reads %j", async (change) => {
    let calls = 0;
    expect(
      await executeSummary({ ...summaryInput(), ...change }, async (request) => {
        calls++;
        return rawPart(request);
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(calls).toBe(0);
  });
  it("copies original references across a held summary read and rejects mismatched or malformed bytes", async () => {
    const mutable = { ...summaryInput(), reference: { ...reference() } };
    let captured: unknown, release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = executeSummary(mutable, async (request) => {
      captured = request;
      await wait;
      return rawPart(request);
    });
    mutable.reference.jobRowVersion = 99;
    release();
    expect(await pending).toMatchObject({ ok: true });
    expect(captured).toMatchObject({ reference: { jobRowVersion: 1 } });
    for (const transform of [
      (raw: ReturnType<typeof rawPart>) => ({ ...raw, byteOffset: 1 }),
      (raw: ReturnType<typeof rawPart>) => ({
        ...raw,
        reference: { ...raw.reference, contactId: id(30) },
      }),
      (raw: ReturnType<typeof rawPart>) => ({ ...raw, bytes: new Uint8Array([0xff]) }),
    ])
      expect(
        await executeSummary(summaryInput(), async (request) => transform(rawPart(request))),
      ).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
  });
  it("preserves an empty retained summary and handles typed missing/error results safely", async () => {
    const empty = { ...summaryInput(), summaryByteLength: 0 };
    expect(await executeSummary(empty, async (request) => rawPart(request, ""))).toMatchObject({
      ok: true,
      value: { text: "", bytesRead: 0, hasMore: false, nextByteOffset: null },
    });
    expect(await executeSummary(summaryInput(), async () => undefined)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    const failed = await executeSummary(summaryInput(), async () => {
      throw new NetworkInteractionHistoryError("stale");
    });
    expect(failed).toMatchObject({ ok: false, error: { code: "conflict", retryable: false } });
    expect(JSON.stringify(failed)).not.toContain("PRIVATE");
  });
});
