import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createJobNextActionsQuery,
  JobNextActionsError,
  type ListJobNextActionsInput,
  type JobNextActionsCursor,
} from "../src/index.js";

const jobId = entityId("job", "0198e103-0000-7000-8000-000000000004");
const taskId = entityId("next-action", "0198e103-0000-7000-8000-00000000000b");
const at = instant("2026-08-25T14:05:00.000Z");
const context = { operationId: entityId("application-operation", taskId), initiatedAt: at };
const task = () => ({
  id: taskId,
  jobId,
  applicationId: null,
  interactionId: null,
  title: "Literal é中🙂 <task>",
  dueAt: null,
  timeZone: null,
  state: "pending",
  completedAt: null,
  createdAt: at,
  updatedAt: at,
  rowVersion: 1,
});
const page = () => ({
  jobId,
  jobRowVersion: 4,
  includeArchived: false,
  items: [task()],
  hasMore: false,
  nextCursor: null,
});
const cursor = (): JobNextActionsCursor => ({
  jobId,
  jobRowVersion: 4,
  includeArchived: false,
  createdAt: at,
  id: taskId,
  rowVersion: 1,
});

describe("bounded job task query", () => {
  it("freezes copied requests and returned records without exposing extra fields", async () => {
    const raw = page();
    const listPage = vi.fn(async (request) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(request.limit).toBe(50);
      return { ...raw, privateDiagnostic: "PRIVATE_TASK_PATH" };
    });
    const result = await createJobNextActionsQuery({ listPage }).execute({ jobId }, context);
    expect(result).toEqual({ ok: true, value: raw });
    expect(result.ok && Object.isFrozen(result.value.items[0])).toBe(true);
    raw.items[0]!.title = "caller changed";
    expect(result.ok && result.value.items[0]?.title).toBe("Literal é中🙂 <task>");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TASK_PATH");
  });
  it.each([
    null,
    {},
    { jobId: "bad" },
    { jobId, limit: 0 },
    { jobId, limit: 101 },
    { jobId, limit: 1.5 },
    { jobId, includeArchived: "yes" },
    { jobId, hidden: true },
    { jobId, after: { ...cursor(), includeArchived: true } },
    { jobId, after: { ...cursor(), jobRowVersion: 0 } },
    { jobId, after: { ...cursor(), rowVersion: 0 } },
    { jobId, after: { ...cursor(), jobId: entityId("job", taskId) } },
  ])("rejects invalid scope/bounds/cursor before reading: %j", async (input) => {
    const listPage = vi.fn();
    const result = await createJobNextActionsQuery({ listPage }).execute(
      input as ListJobNextActionsInput,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(listPage).not.toHaveBeenCalled();
  });
  it.each(["completed", "dismissed"])(
    "retains %s history rather than filtering it out",
    async (state) => {
      const result = await createJobNextActionsQuery({
        listPage: async () => ({
          ...page(),
          items: [{ ...task(), state, completedAt: state === "completed" ? at : null }],
        }),
      }).execute({ jobId }, context);
      expect(result.ok && result.value.items[0]?.state).toBe(state);
    },
  );
  it.each([
    { items: [{ ...task(), jobId: taskId }] },
    { items: [task(), task()] },
    { items: [{ ...task(), dueAt: at }] },
    { items: [{ ...task(), state: "completed" }] },
    { items: [{ ...task(), completedAt: at }] },
    { items: [{ ...task(), title: "x\n" }] },
    { items: [{ ...task(), title: "x".repeat(513) }] },
    { items: [{ ...task(), rowVersion: 0 }] },
    { hasMore: true },
    { nextCursor: cursor() },
    { jobRowVersion: 0 },
    { items: [{ ...task(), createdAt: instant("2026-08-26T14:05:00.000Z") }] },
  ])("rejects malformed stored pages: %j", async (patch) => {
    const result = await createJobNextActionsQuery({
      listPage: async () => ({ ...page(), ...patch }),
    }).execute({ jobId }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
  });
  it("validates the last-record cursor including both viewed versions", async () => {
    const result = await createJobNextActionsQuery({
      listPage: async () => ({ ...page(), hasMore: true, nextCursor: cursor() }),
    }).execute({ jobId, limit: 1 }, context);
    expect(result.ok && result.value.nextCursor).toEqual(cursor());
    const forged = await createJobNextActionsQuery({
      listPage: async () => ({
        ...page(),
        hasMore: true,
        nextCursor: { ...cursor(), rowVersion: 2 },
      }),
    }).execute({ jobId, limit: 1 }, context);
    expect(forged).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("handles empty/missing separately and redacts private failures", async () => {
    const empty = await createJobNextActionsQuery({
      listPage: async () => ({ ...page(), items: [] }),
    }).execute({ jobId }, context);
    expect(empty).toMatchObject({ ok: true, value: { items: [], hasMore: false } });
    const missing = await createJobNextActionsQuery({ listPage: async () => undefined }).execute(
      { jobId },
      context,
    );
    expect(missing).toMatchObject({ ok: false, error: { code: "not_found" } });
    const failed = await createJobNextActionsQuery({
      listPage: async () => {
        throw new Error("PRIVATE_SQL_TASK_PATH");
      },
    }).execute({ jobId }, context);
    expect(failed).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(failed)).not.toContain("PRIVATE_SQL_TASK_PATH");
  });
  it("maps invalidated pages to explicit refresh conflict", async () => {
    const result = await createJobNextActionsQuery({
      listPage: async () => {
        throw new JobNextActionsError("cursor_invalidated");
      },
    }).execute({ jobId, after: cursor() }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "conflict", retryable: true } });
  });
  it("copies the caller's cursor and accepts a strictly later tie without rebasing", async () => {
    const after = { ...cursor() };
    const nextId = entityId("next-action", "0198e103-0000-7000-8000-00000000000c");
    const result = await createJobNextActionsQuery({
      listPage: async (request) => {
        expect(Object.isFrozen(request.after)).toBe(true);
        after.jobRowVersion = 99;
        return { ...page(), items: [{ ...task(), id: nextId }] };
      },
    }).execute({ jobId, after }, context);
    expect(result.ok && result.value.jobRowVersion).toBe(4);
    expect(result.ok && result.value.items[0]?.id).toBe(nextId);
  });
  it("rejects reversed ties and pages from a different viewed job revision", async () => {
    const nextId = entityId("next-action", "0198e103-0000-7000-8000-00000000000c");
    const reversed = await createJobNextActionsQuery({
      listPage: async () => ({ ...page(), items: [{ ...task(), id: nextId }, task()] }),
    }).execute({ jobId, limit: 2 }, context);
    expect(reversed).toMatchObject({ ok: false, error: { code: "internal" } });
    const changed = await createJobNextActionsQuery({
      listPage: async () => ({ ...page(), jobRowVersion: 5, items: [{ ...task(), id: nextId }] }),
    }).execute({ jobId, after: cursor() }, context);
    expect(changed).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("retains a scheduled UTC instant and stored IANA zone without converting a clock", async () => {
    const result = await createJobNextActionsQuery({
      listPage: async () => ({
        ...page(),
        items: [{ ...task(), dueAt: "2026-11-01T05:30:00.000Z", timeZone: "America/New_York" }],
      }),
    }).execute({ jobId }, context);
    expect(result).toMatchObject({
      ok: true,
      value: { items: [{ dueAt: "2026-11-01T05:30:00.000Z", timeZone: "America/New_York" }] },
    });
  });
});
