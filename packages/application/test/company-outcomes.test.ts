import { describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  CompanyOutcomesError,
  companyOutcomeCursorV1,
  createCompanyOutcomesQueryV1,
  parseCompanyOutcomeEventV1,
  parseCompanyOutcomesPageV1,
  parseCompanyOutcomesRequestV1,
  type ListCompanyOutcomesInputV1,
} from "../src/company-outcomes.js";
const id = (n: number) => `0198e152-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-25T12:00:00.000Z"),
  context = { operationId: entityId("application-operation", id(90)), initiatedAt: at };
const input = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 1,
};
const owner = {
  ...input,
  expectedVaultId: entityId("vault", id(1)),
  companyId: entityId("company", id(2)),
  includeArchivedCompany: false,
  includeArchivedJobs: false,
};
const stage = (n = 40) => ({
  id: id(n),
  name: "Synthetic stage <script>inert</script> 😀",
  category: "saved",
  terminal: false,
  archivedAt: null,
  rowVersion: 1,
});
const event = (n = 100) => ({
  id: id(n),
  occurredAt: at,
  createdAt: at,
  rowVersion: 1,
  currentJob: {
    id: id(10),
    companyId: id(2),
    title: "\uFEFFJob\0尾😀",
    archivedAt: null,
    rowVersion: 1,
  },
  application: null,
  fromStatus: null,
  toStatus: stage(),
  undo: null,
});
const page = (items = [event()], hasMore = false) => ({
  ...owner,
  items,
  hasMore,
  nextCursor: hasMore
    ? companyOutcomeCursorV1(owner, parseCompanyOutcomeEventV1(items.at(-1), owner))
    : null,
});
const execute = (
  value: unknown,
  port = async (_request: unknown): Promise<unknown> => page(),
  ctx = context,
) =>
  createCompanyOutcomesQueryV1({ listPage: port }).execute(
    value as ListCompanyOutcomesInputV1,
    ctx,
  );

describe("company recorded stage/outcome query contracts", () => {
  it("copies and freezes exact literal metadata while keeping absent application/from/undo distinct", async () => {
    const raw = page(),
      result = await execute(input, async () => raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    raw.items[0]!.currentJob.title = "changed";
    expect(result.value.items[0]?.currentJob.title).toBe("\uFEFFJob\0尾😀");
    expect(result.value.items[0]).toMatchObject({
      application: null,
      fromStatus: null,
      undo: null,
    });
    expect(Object.isFrozen(result.value.items[0]?.toStatus)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
  });
  it("preserves current terminal definitions, archived applications and an actual recorded reversal without classifying employer outcomes", async () => {
    const raw = {
      ...event(),
      application: { id: id(30), archivedAt: at, rowVersion: 2 },
      fromStatus: stage(41),
      toStatus: {
        ...stage(42),
        name: "Synthetic closed",
        category: "rejected",
        terminal: true,
        archivedAt: at,
      },
      undo: { id: id(70), createdAt: at, consumedAt: at, rowVersion: 2 },
    };
    const result = await execute(input, async () => ({
      ...owner,
      items: [raw],
      hasMore: false,
      nextCursor: null,
    }));
    expect(result).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            application: { archivedAt: at },
            toStatus: { category: "rejected", terminal: true },
            undo: { consumedAt: at },
          },
        ],
      },
    });
  });
  it.each([
    { specVersion: 2 },
    { expectedVaultId: "bad" },
    { companyId: "bad" },
    { expectedCompanyRowVersion: 0 },
    { includeArchivedJobs: 1 },
    { includeArchivedCompany: null },
    { limit: 0 },
    { limit: 26 },
    { limit: 1.5 },
    { extra: true },
  ])("rejects malformed input before any port read %j", async (change) => {
    let calls = 0;
    const result = await execute({ ...input, ...change }, async () => {
      calls++;
      return page();
    });
    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(calls).toBe(0);
  });
  it("rejects accessors, symbols, hidden fields and invalid operation context without reading", async () => {
    let calls = 0,
      getter = 0;
    const accessor = Object.defineProperty({ ...input }, "limit", {
      enumerable: true,
      get() {
        getter++;
        return 10;
      },
    });
    for (const value of [
      accessor,
      { ...input, [Symbol("private")]: 1 },
      Object.defineProperty({ ...input }, "private", { value: true }),
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
  it("copies the entire continuation before awaiting its port", async () => {
    const first = parseCompanyOutcomeEventV1({ ...event(99), fromStatus: stage(41) }, owner);
    const cursor = {
      ...companyOutcomeCursorV1(owner, first),
      toStatus: { id: id(40), rowVersion: 1 },
    };
    const mutable = { ...input, limit: 1, after: cursor };
    let captured: unknown;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = execute(mutable, async (request) => {
      captured = request;
      await held;
      return page([event(100)]);
    });
    cursor.toStatus.rowVersion = 999;
    mutable.companyId = id(9);
    release();
    expect(await result).toMatchObject({ ok: true });
    expect(captured).toMatchObject({ companyId: id(2), after: { toStatus: { rowVersion: 1 } } });
  });
  it("validates complete exact cursor scope and every identity/version", () => {
    const item = parseCompanyOutcomeEventV1(event(), owner),
      cursor = companyOutcomeCursorV1(owner, item);
    expect(() =>
      parseCompanyOutcomesRequestV1({ ...input, after: { ...cursor, companyId: id(9) } }),
    ).toThrow();
    expect(() =>
      parseCompanyOutcomesRequestV1({
        ...input,
        after: { ...cursor, toStatus: { id: id(40), rowVersion: 0 } },
      }),
    ).toThrow();
    const request = parseCompanyOutcomesRequestV1({ ...input, limit: 1 });
    const valid = page([event()], true);
    expect(parseCompanyOutcomesPageV1(valid, request).nextCursor).toEqual(cursor);
    expect(() =>
      parseCompanyOutcomesPageV1(
        { ...valid, nextCursor: { ...cursor, jobRowVersion: 2 } },
        request,
      ),
    ).toThrow();
    expect(() => parseCompanyOutcomesPageV1({ ...valid, hasMore: false }, request)).toThrow();
  });
  it.each([
    "private-note",
    "foreign-job",
    "bad-stage",
    "same-stage",
    "bad-utf16",
    "bad-undo",
    "overflow",
    "duplicate",
    "duplicate-undo",
    "unsorted",
    "incoherent-stage",
  ])("fails closed for malformed adapter projection: %s", async (kind) => {
    let raw: unknown = page();
    const item = event();
    if (kind === "private-note") raw = page([{ ...item, note: "PRIVATE" } as typeof item]);
    if (kind === "foreign-job")
      raw = page([{ ...item, currentJob: { ...item.currentJob, companyId: id(3) } }]);
    if (kind === "bad-stage")
      raw = page([{ ...item, toStatus: { ...item.toStatus, category: "hired-probability" } }]);
    if (kind === "same-stage")
      raw = page([{ ...item, fromStatus: item.toStatus } as unknown as typeof item]);
    if (kind === "bad-utf16")
      raw = page([{ ...item, currentJob: { ...item.currentJob, title: "\ud800" } }]);
    if (kind === "bad-undo")
      raw = {
        ...owner,
        items: [
          {
            ...item,
            undo: {
              id: id(70),
              createdAt: at,
              consumedAt: "2020-01-01T00:00:00.000Z",
              rowVersion: 2,
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
      };
    if (kind === "overflow") raw = page(Array.from({ length: 11 }, (_, n) => event(100 + n)));
    if (kind === "duplicate") raw = page([item, item]);
    if (kind === "duplicate-undo")
      raw = {
        ...owner,
        items: [event(100), event(101)].map((entry) => ({
          ...entry,
          undo: { id: id(70), createdAt: at, consumedAt: null, rowVersion: 1 },
        })),
        hasMore: false,
        nextCursor: null,
      };
    if (kind === "unsorted") raw = page([event(101), event(100)]);
    if (kind === "incoherent-stage")
      raw = page([
        item,
        { ...event(101), toStatus: { ...item.toStatus, name: "Different same identity" } },
      ]);
    expect(await execute(input, async () => raw)).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });
  it("distinguishes confirmed empty from unavailable/missing and never leaks private errors", async () => {
    expect(await execute(input, async () => page([]))).toMatchObject({
      ok: true,
      value: { items: [] },
    });
    expect(await execute(input, async () => undefined)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    for (const [error, code, retryable] of [
      [new CompanyOutcomesError("stale"), "conflict", false],
      [new CompanyOutcomesError("invalid_state"), "internal", false],
      [Error("PRIVATE path/resume"), "unavailable", true],
    ] as const) {
      const result = await execute(input, async () => {
        throw error;
      });
      expect(result).toMatchObject({ ok: false, error: { code, retryable } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
    }
  });
});
