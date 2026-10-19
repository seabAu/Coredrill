import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createJobTimelineQuery,
  JobTimelineError,
  type JobTimelinePageDto,
} from "../src/job-timeline.js";

const jobId = entityId("job", "0198e204-0000-7000-8000-000000000001");
const id = "0198e204-0000-7000-8000-000000000002";
const asOf = instant("2026-10-19T12:00:00.000Z");
const occurredAt = instant("2026-10-18T12:00:00.000Z");
const context = { operationId: entityId("application-operation", id), initiatedAt: asOf };
const page = (): JobTimelinePageDto => ({
  jobId,
  asOf,
  includeArchived: false,
  hasMore: false,
  nextCursor: null,
  items: [
    {
      kind: "interaction",
      id,
      jobId,
      occurredAt,
      createdAt: occurredAt,
      contactId: null,
      type: "note",
      direction: "unknown",
      summary: "Synthetic local note",
    },
  ],
});

describe("validated stored job timeline", () => {
  it("distinguishes an existing empty timeline from a missing job", async () => {
    const result = await createJobTimelineQuery({
      listPage: async () => ({ ...page(), items: [] }),
    }).execute({ jobId }, context);
    expect(result).toMatchObject({
      ok: true,
      value: { items: [], hasMore: false, nextCursor: null },
    });
  });

  it("rejects out-of-order and wrong-job items rather than sorting or hiding corruption", async () => {
    const source = page();
    const first = source.items[0]!;
    for (const items of [
      [first, { ...first, id: "0198e204-0000-7000-8000-000000000003", occurredAt: asOf }],
      [{ ...first, jobId: entityId("job", "0198e204-0000-7000-8000-000000000003") }],
    ]) {
      expect(
        await createJobTimelineQuery({ listPage: async () => ({ ...source, items }) }).execute(
          { jobId },
          context,
        ),
      ).toMatchObject({ ok: false, error: { code: "internal" } });
    }
  });
  it("keeps an unassigned-origin event and its recorded reversal distinct", async () => {
    const source: JobTimelinePageDto = {
      ...page(),
      items: [
        {
          kind: "status",
          id,
          jobId,
          occurredAt,
          createdAt: occurredAt,
          applicationId: null,
          fromStatus: null,
          toStatus: { id: entityId("status_definition", id), name: "User named stage" },
          note: null,
          undoneAt: asOf,
        },
      ],
    };
    const result = await createJobTimelineQuery({ listPage: async () => source }).execute(
      { jobId },
      context,
    );
    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok || result.value.items[0]?.kind !== "status") throw new Error("Expected status");
    expect(Object.isFrozen(result.value.items[0].toStatus)).toBe(true);
  });

  it("holds snapshot scope across pages and rejects forged cross-job cursors before storage", async () => {
    const cursor = {
      jobId,
      includeArchived: false,
      asOf,
      occurredAt: asOf,
      kind: "status" as const,
      id,
    };
    const listPage = vi.fn(async () => page());
    expect(
      (await createJobTimelineQuery({ listPage }).execute({ jobId, after: cursor }, context)).ok,
    ).toBe(true);
    expect(listPage).toHaveBeenCalledWith(expect.objectContaining({ after: cursor, asOf }));
    listPage.mockClear();
    for (const change of [
      { jobId: entityId("job", "0198e204-0000-7000-8000-000000000003") },
      { includeArchived: true },
      { asOf: instant("2099-01-01T00:00:00.000Z") },
      { occurredAt: instant("2099-01-01T00:00:00.000Z") },
    ]) {
      expect(
        await createJobTimelineQuery({ listPage }).execute(
          { jobId, after: { ...cursor, ...change } },
          context,
        ),
      ).toMatchObject({ ok: false, error: { code: "validation" } });
    }
    expect(listPage).not.toHaveBeenCalled();
  });

  it.each(["cursor_invalidated", "invalid_state", "unavailable"] as const)(
    "maps %s without exposing adapter contents",
    async (code) => {
      const result = await createJobTimelineQuery({
        listPage: async () => {
          throw new JobTimelineError(code);
        },
      }).execute({ jobId }, context);
      expect(result).toMatchObject({
        ok: false,
        error: {
          code:
            code === "cursor_invalidated"
              ? "conflict"
              : code === "invalid_state"
                ? "internal"
                : "unavailable",
        },
      });
    },
  );

  it("requires a full, final-item-bound continuation cursor when more history exists", async () => {
    const source = page();
    const item = source.items[0]!;
    const cursor = {
      jobId,
      includeArchived: false,
      asOf,
      occurredAt: item.occurredAt,
      kind: item.kind,
      id: item.id,
    };
    const listPage = vi.fn(async () => ({ ...source, hasMore: true, nextCursor: cursor }));
    expect(
      (await createJobTimelineQuery({ listPage }).execute({ jobId, limit: 1 }, context)).ok,
    ).toBe(true);
    listPage.mockImplementation(async () => ({
      ...source,
      hasMore: true,
      nextCursor: { ...cursor, kind: "status" },
    }));
    expect(
      await createJobTimelineQuery({ listPage }).execute({ jobId, limit: 1 }, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("copies and freezes real history without mutation capabilities", async () => {
    const source = page();
    const listPage = vi.fn(async () => source);
    const query = createJobTimelineQuery({ listPage });
    const result = await query.execute({ jobId }, context);
    expect(query).toMatchObject({ kind: "query", readOnly: true, name: "ListJobTimelineQuery" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected timeline");
    expect(result.value).toEqual(source);
    expect(result.value).not.toBe(source);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);
    expect(listPage).toHaveBeenCalledWith(expect.objectContaining({ jobId, asOf, limit: 50 }));
  });

  it.each([
    { jobId: "bad" },
    { jobId, limit: 0 },
    { jobId, limit: 101 },
    { jobId, includeArchived: "yes" },
    { jobId, after: {} },
  ])("rejects invalid input before storage: %j", async (input) => {
    const listPage = vi.fn(async () => page());
    const result = await createJobTimelineQuery({ listPage }).execute(input as never, context);
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(listPage).not.toHaveBeenCalled();
  });

  it.each([
    (value: JobTimelinePageDto) => ({
      ...value,
      jobId: entityId("job", "0198e204-0000-7000-8000-000000000003"),
    }),
    (value: JobTimelinePageDto) => ({ ...value, hasMore: true }),
    (value: JobTimelinePageDto) => ({ ...value, items: [...value.items, ...value.items] }),
    (value: JobTimelinePageDto) => ({
      ...value,
      items: [{ ...value.items[0], occurredAt: "2099-01-01T00:00:00.000Z" }],
    }),
    (value: JobTimelinePageDto) => ({
      ...value,
      items: [{ ...value.items[0], direction: "invented" }],
    }),
  ])("fails closed on invalid adapter history", async (change) => {
    const listPage = vi.fn(async () => change(page()) as JobTimelinePageDto);
    expect(await createJobTimelineQuery({ listPage }).execute({ jobId }, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });

  it("does not leak storage errors or treat missing jobs as empty history", async () => {
    expect(
      await createJobTimelineQuery({ listPage: async () => undefined }).execute({ jobId }, context),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    const failed = await createJobTimelineQuery({
      listPage: async () => {
        throw new Error("PRIVATE SQL/path");
      },
    }).execute({ jobId }, context);
    expect(failed).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(failed)).not.toContain("PRIVATE");
  });
});
