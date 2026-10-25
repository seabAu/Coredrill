import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createNetworkRemindersQuery,
  NetworkRemindersError,
  networkReminderReferenceV1,
  parseNetworkReminderV1,
  parseNetworkRemindersRequestV1,
  type ListNetworkRemindersInputV1,
} from "../src/network-reminders.js";
const id = (n: number) => `0198e158-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-25T12:00:00.000Z"),
  future = instant("2027-01-01T00:00:00.000Z"),
  context = { operationId: entityId("application-operation", id(90)), initiatedAt: at };
const input = { specVersion: 1 as const, expectedVaultId: id(1), limit: 1 },
  owner = parseNetworkRemindersRequestV1(input);
const item = (n = 1000) => ({
  id: id(n),
  state: "pending",
  remindAt: future,
  timeZone: "America/New_York",
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
  currentJob: {
    id: id(100),
    title: "\uFEFFJob <script>inert()</script>\0尾😀",
    archivedAt: null,
    rowVersion: 1,
    company: { id: id(2), name: "\uFEFFCompany\0尾😀", archivedAt: at, rowVersion: 1 },
  },
  nextAction: {
    id: id(200),
    jobId: id(100),
    title: "Literal task\0尾😀",
    state: "pending",
    dueAt: future,
    timeZone: "America/New_York",
    rowVersion: 1,
  },
  interview: {
    id: id(300),
    stageName: "Literal interview\0尾😀",
    startsAt: future,
    timeZone: "America/New_York",
    durationMinutes: 60,
    rowVersion: 1,
    application: { id: id(400), jobId: id(100), archivedAt: null, rowVersion: 1 },
  },
});
const page = (items: unknown[] = [item()], hasMore = false) => ({
  ...owner,
  limit: undefined,
  after: undefined,
  items,
  hasMore,
  nextCursor: hasMore
    ? networkReminderReferenceV1(owner, parseNetworkReminderV1(items.at(-1), owner))
    : null,
});
// A response contains scope, not request-only fields.
const response = (items: unknown[] = [item()], hasMore = false) => {
  const { limit: _limit, after: _after, ...result } = page(items, hasMore);
  return result;
};
const execute = (
  value: unknown = input,
  read = async (_value: unknown): Promise<unknown> => response(),
) =>
  createNetworkRemindersQuery({ listPage: read }).execute(
    value as ListNetworkRemindersInputV1,
    context,
  );
describe("original viewed-vault pending-reminder page contract", () => {
  it.each([
    null,
    [],
    {},
    { ...input, specVersion: 2 },
    { ...input, expectedVaultId: "bad" },
    { ...input, includeArchivedJobs: 1 },
    { ...input, limit: 0 },
    { ...input, limit: 26 },
    { ...input, limit: 1.5 },
    { ...input, now: at },
    { ...input, after: {} },
  ])("rejects malformed input before the port %j", async (value) => {
    const read = vi.fn();
    expect(await execute(value, read)).toMatchObject({
      ok: false,
      error: { code: "validation", retryable: false },
    });
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects unknown/hidden/symbol/getter fields without invoking accessors", async () => {
    let calls = 0;
    for (const value of [
      Object.defineProperty({ ...input }, "expectedVaultId", {
        enumerable: true,
        get: () => {
          calls++;
          return id(1);
        },
      }),
      Object.defineProperty({ ...input }, "hidden", { value: true }),
      { ...input, [Symbol("hidden")]: true },
    ])
      expect(await execute(value)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(calls).toBe(0);
  });
  it("validates context before effects", async () => {
    const read = vi.fn();
    const query = createNetworkRemindersQuery({ listPage: read });
    expect(
      await query.execute(input, { ...context, initiatedAt: "bad" as typeof at }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(read).not.toHaveBeenCalled();
  });
  it("copies/fixes default original scope before awaited work and freezes all returned metadata", async () => {
    const mutable = { ...input };
    const original = item();
    const result = await execute(mutable, async (request) => {
      mutable.expectedVaultId = id(9);
      expect(request).toEqual(owner);
      expect(Object.isFrozen(request)).toBe(true);
      return response([original]);
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    original.currentJob.company.name = "Changed";
    expect(result.value.expectedVaultId).toBe(id(1));
    expect(result.value.items[0]?.currentJob.company?.name).toContain("Company\0尾😀");
    expect(Object.isFrozen(result.value.items[0]?.interview?.application)).toBe(true);
    expect(parseNetworkRemindersRequestV1({ specVersion: 1, expectedVaultId: id(1) })).toEqual({
      ...owner,
      limit: 10,
    });
  });
  it("retains nullable links, current archived company, future alerts and inert full-sized strings without a clock ceiling", async () => {
    const value = { ...item(), nextAction: null, interview: null };
    expect(await execute(input, async () => response([value]))).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            remindAt: future,
            nextAction: null,
            interview: null,
            currentJob: { company: { archivedAt: at } },
          },
        ],
      },
    });
    const large = {
      ...item(),
      currentJob: { ...item().currentJob, title: "😀".repeat(512), company: null },
    };
    expect(await execute(input, async () => response([large]))).toMatchObject({ ok: true });
  });
  it("preserves a terminal linked-task state honestly rather than inventing pending state or changing it", async () => {
    const value = { ...item(), nextAction: { ...item().nextAction, state: "completed" } };
    expect(await execute(input, async () => response([value]))).toMatchObject({
      ok: true,
      value: { items: [{ nextAction: { state: "completed" } }] },
    });
  });
  it.each([
    { ...item(), state: "fired" },
    { ...item(), state: "dismissed" },
    { ...item(), timeZone: "invalid/zone" },
    { ...item(), rowVersion: 0 },
    { ...item(), createdAt: future },
    { ...item(), note: "PRIVATE" },
    { ...item(), currentJob: { ...item().currentJob, title: "x".repeat(1025) } },
    {
      ...item(),
      currentJob: {
        ...item().currentJob,
        company: { ...item().currentJob.company, name: "x".repeat(513) },
      },
    },
    { ...item(), currentJob: { ...item().currentJob, archivedAt: at } },
    { ...item(), nextAction: { ...item().nextAction, dueAt: null } },
    { ...item(), nextAction: { ...item().nextAction, jobId: id(999) } },
    { ...item(), interview: { ...item().interview, durationMinutes: 1441 } },
    {
      ...item(),
      interview: {
        ...item().interview,
        application: { ...item().interview.application, jobId: id(999) },
      },
    },
    { ...item(), interview: { ...item().interview, preparationNotes: "PRIVATE" } },
  ])("rejects malformed/private/cross-job record output %j", async (value) =>
    expect(await execute(input, async () => response([value]))).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    }),
  );
  it("honors explicit archived-job scope and rejects a response from another scope", async () => {
    const archived = { ...item(), currentJob: { ...item().currentJob, archivedAt: at } };
    expect(
      await execute({ ...input, includeArchivedJobs: true }, async () => ({
        ...response([archived]),
        includeArchivedJobs: true,
      })),
    ).toMatchObject({ ok: true });
    expect(
      await execute(input, async () => ({ ...response(), expectedVaultId: id(9) })),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("validates exact last-item anchors and original vault/archive/parent pairs", async () => {
    const first = await execute(input, async () => response([item()], true));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const ref = first.value.nextCursor;
    expect(ref).toEqual(networkReminderReferenceV1(first.value, first.value.items[0]!));
    expect(
      await execute({ ...input, after: ref }, async () => response([item(1001)])),
    ).toMatchObject({ ok: true });
    for (const after of [
      { ...ref, expectedVaultId: id(9) },
      { ...ref, includeArchivedJobs: true },
      { ...ref, companyRowVersion: null },
      { ...ref, interviewId: null },
      { ...ref, interviewApplicationId: null },
    ]) {
      const read = vi.fn();
      expect(await execute({ ...input, after }, read)).toMatchObject({
        ok: false,
        error: { code: "validation" },
      });
      expect(read).not.toHaveBeenCalled();
    }
    expect(
      await execute(input, async () => ({
        ...response([item()], true),
        nextCursor: { ...ref, nextActionRowVersion: 2 },
      })),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("rejects duplicate/order/continuation/coherence failures and dishonest page bounds", async () => {
    const two = { ...input, limit: 2 };
    for (const values of [
      [item(1001), item()],
      [item(), item()],
      [
        item(),
        {
          ...item(1001),
          currentJob: { ...item().currentJob, title: "Other metadata for same job" },
        },
      ],
      [
        item(),
        { ...item(1001), nextAction: { ...item().nextAction, title: "Other same-task title" } },
      ],
    ])
      expect(await execute(two, async () => response(values))).toMatchObject({
        ok: false,
        error: { code: "internal" },
      });
    const ref = networkReminderReferenceV1(owner, parseNetworkReminderV1(item(), owner));
    expect(await execute({ ...input, after: ref }, async () => response())).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(await execute(input, async () => response([item(), item(1001)]))).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(
      await execute(input, async () => ({ ...response([], false), hasMore: true })),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(await execute(input, async () => ({ ...response(), nextCursor: ref }))).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it.each([
    ["stale", "conflict", false],
    ["invalid_state", "internal", false],
    ["unavailable", "unavailable", true],
  ] as const)("maps %s without leaking private storage errors", async (code, output, retryable) => {
    expect(
      await execute(input, async () => {
        throw new NetworkRemindersError(code);
      }),
    ).toMatchObject({ ok: false, error: { code: output, retryable } });
  });
  it("redacts unknown failures and distinguishes wrong-vault/missing-root from confirmed empty", async () => {
    const result = await execute(input, async () => {
      throw Error("PRIVATE path/note");
    });
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(await execute(input, async () => undefined)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await execute(input, async () => response([]))).toMatchObject({
      ok: true,
      value: { items: [] },
    });
  });
});
