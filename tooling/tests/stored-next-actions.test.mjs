import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  JobActivityError,
  NextActionCompletionError,
  NextActionDismissalError,
  JobNextActionsError,
} from "../../packages/application/dist/index.js";
import { createStoredNextActionApi } from "../../apps/web/src/stored-next-actions.ts";

const { write, list, complete, dismiss } = vi.hoisted(() => ({
  write: vi.fn(),
  list: vi.fn(),
  complete: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createDatabaseJobActivityPort: () => ({ setNextAction: write }),
  createJobNextActionsRepository: () => ({ listPage: list }),
  createDatabaseNextActionCompletionPort: () => ({ complete }),
  createDatabaseNextActionDismissalPort: () => ({ dismiss }),
}));
const jobId = "0199b366-0000-7000-8000-000000000001";
const actionId = "0199b366-0000-7000-8000-000000000002";
const tokenId = "0199b366-0000-7000-8000-000000000003";
const at = "2026-10-20T06:00:00.000Z";
const context = () => ({ operationId: "0199b366-0000-7000-8000-000000000004", initiatedAt: at });
const input = { jobId, title: "Research the team", expected: { jobRowVersion: 3 } };
const setup = () => {
  const open = vi.fn().mockResolvedValue({});
  const createId = vi.fn((kind) => (kind === "next-action" ? actionId : tokenId));
  return { open, createId, api: createStoredNextActionApi(open, context, createId) };
};
beforeEach(() => {
  write.mockReset();
  list.mockReset();
  complete.mockReset();
  dismiss.mockReset();
  dismiss.mockImplementation(async (request) => ({
    jobId: request.jobId,
    nextActionId: request.nextActionId,
    state: "dismissed",
    completedAt: null,
    dismissedAt: request.dismissedAt,
    jobRowVersion: request.expected.jobRowVersion + 1,
    nextActionRowVersion: request.expected.nextActionRowVersion + 1,
  }));
  list.mockResolvedValue({
    jobId,
    jobRowVersion: 3,
    includeArchived: false,
    items: [],
    hasMore: false,
    nextCursor: null,
  });
  complete.mockImplementation(async (request) => ({
    jobId: request.jobId,
    nextActionId: request.nextActionId,
    state: "completed",
    completedAt: request.completedAt,
    jobRowVersion: request.expected.jobRowVersion + 1,
    nextActionRowVersion: request.expected.nextActionRowVersion + 1,
  }));
  write.mockImplementation(async ({ undoTokenId, expected: _expected, ...action }) => ({
    nextAction: { ...action, rowVersion: 1 },
    undoToken: {
      id: undoTokenId,
      kind: "next_action_set",
      jobId: action.jobId,
      createdAt: action.createdAt,
      consumedAt: null,
      rowVersion: 1,
    },
  }));
});
describe("normal next-action runtime boundary", () => {
  const completion = () => ({
    jobId,
    nextActionId: actionId,
    expected: { jobRowVersion: 3, nextActionRowVersion: 2 },
  });
  it("reads the bounded validated page without task writes or generated identities", async () => {
    const { api, open, createId } = setup();
    expect(await api.listPage({ jobId })).toMatchObject({
      ok: true,
      value: { jobId, items: [], jobRowVersion: 3 },
    });
    expect(list).toHaveBeenCalledExactlyOnceWith({
      jobId,
      includeArchived: false,
      limit: 50,
      after: null,
    });
    expect(open).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(createId).not.toHaveBeenCalled();
  });
  it("copies dismissal context before storage opens and returns a distinct non-completed acknowledgement", async () => {
    const { api, open, createId } = setup();
    let release;
    open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = completion();
    const pending = api.dismiss(request);
    request.jobId = tokenId;
    request.expected.jobRowVersion = 99;
    release({});
    expect(await pending).toMatchObject({
      ok: true,
      value: {
        jobId,
        nextActionId: actionId,
        state: "dismissed",
        completedAt: null,
        dismissedAt: at,
        jobRowVersion: 4,
        nextActionRowVersion: 3,
      },
    });
    expect(dismiss).toHaveBeenCalledExactlyOnceWith({
      jobId,
      nextActionId: actionId,
      expected: { jobRowVersion: 3, nextActionRowVersion: 2 },
      dismissedAt: at,
    });
    expect(Object.isFrozen(dismiss.mock.calls[0][0].expected)).toBe(true);
    expect(createId).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...completion(), expected: undefined },
    { ...completion(), dismissedAt: at },
    { ...completion(), completedAt: at },
    { ...completion(), expected: { jobRowVersion: 3, nextActionRowVersion: 0 } },
  ])("rejects invalid/forged dismissal before database access: %j", async (bad) => {
    const { api, open } = setup();
    expect(await api.dismiss(bad)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });
  it("redacts dismissal opening failures and does not retry", async () => {
    const { api, open } = setup();
    open.mockRejectedValue(new Error("PRIVATE_DISMISSAL_PATH"));
    const result = await api.dismiss(completion());
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledOnce();
  });
  it("preserves a dismissal conflict without substituting completion or retrying", async () => {
    const { api } = setup();
    dismiss.mockRejectedValue(new NextActionDismissalError("conflict"));
    expect(await api.dismiss(completion())).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });
  it.each([{ jobId, limit: 101 }, { jobId: "invalid" }, { jobId, includeArchived: "yes" }])(
    "rejects invalid page intent before opening: %j",
    async (bad) => {
      const { api, open } = setup();
      expect(await api.listPage(bad)).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(open).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    },
  );
  it("copies completion context before awaiting storage and owns completion time", async () => {
    const { api, open, createId } = setup();
    let release;
    open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = completion();
    const pending = api.complete(request);
    request.jobId = tokenId;
    request.expected.jobRowVersion = 99;
    release({});
    expect(await pending).toMatchObject({
      ok: true,
      value: {
        jobId,
        nextActionId: actionId,
        state: "completed",
        completedAt: at,
        jobRowVersion: 4,
        nextActionRowVersion: 3,
      },
    });
    expect(complete).toHaveBeenCalledExactlyOnceWith({
      jobId,
      nextActionId: actionId,
      expected: { jobRowVersion: 3, nextActionRowVersion: 2 },
      completedAt: at,
    });
    expect(Object.isFrozen(complete.mock.calls[0][0].expected)).toBe(true);
    expect(createId).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { jobId, nextActionId: actionId },
    { ...completion(), expected: { jobRowVersion: 0, nextActionRowVersion: 2 } },
    { ...completion(), completedAt: at },
  ])("rejects invalid/forged completion before opening: %j", async (bad) => {
    const { api, open } = setup();
    expect(await api.complete(bad)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
  it.each(["listPage", "complete"])(
    "redacts %s database failures without retry",
    async (method) => {
      const { api, open } = setup();
      open.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_PATH"));
      const result = await api[method](method === "complete" ? completion() : { jobId });
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      expect(open).toHaveBeenCalledOnce();
    },
  );
  it("preserves task-read and completion conflicts without retry or private data", async () => {
    const { api } = setup();
    list.mockRejectedValue(new JobNextActionsError("cursor_invalidated"));
    complete.mockRejectedValue(new NextActionCompletionError("conflict"));
    expect(await api.listPage({ jobId })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await api.complete(completion())).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(list).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });
  it("rejects forged read and completion acknowledgements", async () => {
    const { api } = setup();
    list.mockResolvedValue({ jobId: tokenId });
    complete.mockResolvedValue({ ...completion(), state: "completed" });
    expect(await api.listPage({ jobId })).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(await api.complete(completion())).toMatchObject({
      ok: false,
      error: { code: "unavailable" },
    });
    expect(complete).toHaveBeenCalledOnce();
  });
  it("requires viewed context, creates only job-scoped tasks and owns audit/identities", async () => {
    const { api, createId, open } = setup();
    expect(Object.keys(api)).toEqual(["listPage", "complete", "dismiss", "setNextAction"]);
    const result = await api.setNextAction({
      ...input,
      applicationId: tokenId,
      interactionId: actionId,
      createdAt: "2099-01-01T00:00:00.000Z",
      state: "completed",
      completedAt: at,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        nextAction: {
          id: actionId,
          jobId,
          applicationId: null,
          interactionId: null,
          dueAt: null,
          timeZone: null,
          state: "pending",
          completedAt: null,
          createdAt: at,
          updatedAt: at,
        },
        undoToken: { id: tokenId },
      },
    });
    expect(write.mock.calls[0][0].expected).toEqual(input.expected);
    expect(Object.isFrozen(write.mock.calls[0][0].expected)).toBe(true);
    expect(createId.mock.calls).toEqual([["next-action"], ["mutation-undo-token"]]);
    expect(open).toHaveBeenCalledOnce();
  });
  it("retains explicit UTC instant and canonical IANA zone", async () => {
    const { api } = setup();
    const schedule = { dueAt: "2026-11-01T06:30:00.000Z", timeZone: "America/New_York" };
    expect(await api.setNextAction({ ...input, ...schedule })).toMatchObject({
      ok: true,
      value: { nextAction: schedule },
    });
  });
  it.each([
    null,
    [],
    {},
    { ...input, expected: undefined },
    { ...input, expected: null },
    { ...input, expected: {} },
    { ...input, expected: { jobRowVersion: 0 } },
    { ...input, dueAt: "2026-11-01T06:30:00.000Z" },
    { ...input, timeZone: "America/New_York" },
    { ...input, title: " " },
    { ...input, title: "x".repeat(513) },
    { ...input, jobId: "invalid" },
  ])("rejects invalid/missing viewed or schedule context before storage: %j", async (bad) => {
    const { api, open, createId } = setup();
    expect(await api.setNextAction(bad)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
    expect(createId).not.toHaveBeenCalled();
  });
  it("redacts an unavailable database and never retries a possibly committed write", async () => {
    const { api, open } = setup();
    open.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_PATH"));
    const result = await api.setNextAction(input);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(open).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });
  it("preserves guarded-write conflict without retrying or exposing storage content", async () => {
    const { api } = setup();
    write.mockRejectedValue(new JobActivityError("scheduling_conflict"));
    expect(await api.setNextAction(input)).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: true },
    });
    expect(write).toHaveBeenCalledOnce();
  });
  it("fails closed on mismatched stored identities", async () => {
    const { api } = setup();
    write.mockResolvedValue({ nextAction: { jobId: tokenId }, undoToken: {} });
    expect(await api.setNextAction(input)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(write).toHaveBeenCalledOnce();
  });
});
