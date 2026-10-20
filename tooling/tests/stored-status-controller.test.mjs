import { describe, expect, it, vi } from "vitest";
import { createStoredStatusController } from "../../apps/web/src/stored-status-controller.ts";

const move = () => ({
  jobId: "synthetic-job",
  rowVersion: 2,
  fromStatusId: "saved",
  toStatusId: "preparing",
  allowReopen: false,
});
const fixture = () => {
  const api = {
    pipeline: {
      workspace: vi.fn(async () => ({
        ok: true,
        value: {
          job: { id: "synthetic-job", rowVersion: 2, status: { id: "saved" }, archivedAt: null },
          application: { id: "synthetic-attempt", rowVersion: 3 },
        },
      })),
      groups: vi.fn(async () => ({
        ok: true,
        value: [
          { statusId: "preparing", category: "preparing" },
          { statusId: "applied", category: "applied" },
        ],
      })),
    },
    pipelineMutations: {
      changeStatus: vi.fn(async () => ({
        ok: true,
        value: { undoToken: { id: "synthetic-undo" } },
      })),
      undo: vi.fn(async () => ({
        ok: true,
        value: { id: "synthetic-undo", consumedAt: "synthetic-instant" },
      })),
    },
    nextActions: {
      setNextAction: vi.fn(async () => ({
        ok: true,
        value: {
          nextAction: { id: "synthetic-task" },
          undoToken: { id: "synthetic-task-undo" },
        },
      })),
    },
    loadApplicationSubmissionReview: vi.fn(async () => ({ ok: true, value: { snapshot: null } })),
  };
  return { api, controller: createStoredStatusController(() => api) };
};
describe("stored status controller", () => {
  const task = () => ({
    jobId: "synthetic-job",
    title: "Research the team",
    expected: { jobRowVersion: 2 },
    dueAt: null,
    timeZone: null,
  });
  it("forwards captured task intent without resolving or binding an application attempt", async () => {
    const { api, controller } = fixture();
    expect(await controller.addNextAction(task())).toMatchObject({
      kind: "saved",
      change: { nextAction: { id: "synthetic-task" }, undoToken: { id: "synthetic-task-undo" } },
    });
    expect(api.nextActions.setNextAction).toHaveBeenCalledExactlyOnceWith(task());
    expect(api.pipeline.groups).not.toHaveBeenCalled();
    expect(api.loadApplicationSubmissionReview).not.toHaveBeenCalled();
    expect(api.pipelineMutations.changeStatus).not.toHaveBeenCalled();
  });
  it.each([{ rowVersion: 3 }, { id: "other-job" }, { archivedAt: "archived" }])(
    "rejects stale/foreign/archived task context without a write: %j",
    async (change) => {
      const { api, controller } = fixture();
      const current = (await api.pipeline.workspace()).value;
      api.pipeline.workspace.mockResolvedValue({
        ok: true,
        value: { ...current, job: { ...current.job, ...change } },
      });
      expect(await controller.addNextAction(task())).toMatchObject({
        kind: "failed",
        retryable: false,
      });
      expect(api.nextActions.setNextAction).not.toHaveBeenCalled();
    },
  );
  it("copies task fields/version before awaiting preflight and serializes status, task and undo", async () => {
    const { api, controller } = fixture();
    let release;
    const current = await api.pipeline.workspace();
    api.pipeline.workspace.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const input = task();
    const pending = controller.addNextAction(input);
    input.expected.jobRowVersion = 99;
    input.title = "Changed after submission";
    expect(await controller.move(move())).toMatchObject({ kind: "failed" });
    expect(await controller.undo("synthetic-undo")).toMatchObject({ kind: "failed" });
    expect(await controller.addNextAction(task())).toMatchObject({ kind: "failed" });
    expect(api.pipelineMutations.changeStatus).not.toHaveBeenCalled();
    expect(api.pipelineMutations.undo).not.toHaveBeenCalled();
    release(current);
    expect(await pending).toMatchObject({ kind: "saved" });
    expect(api.nextActions.setNextAction).toHaveBeenCalledExactlyOnceWith(task());
    expect(Object.isFrozen(api.nextActions.setNextAction.mock.calls[0][0].expected)).toBe(true);
  });
  it("keeps the common lock until task acknowledgement and never repeats a held write", async () => {
    const { api, controller } = fixture();
    let release;
    api.nextActions.setNextAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = controller.addNextAction(task());
    await vi.waitFor(() => expect(api.nextActions.setNextAction).toHaveBeenCalledOnce());
    expect(await controller.undo("synthetic-task-undo", "next-action")).toMatchObject({
      kind: "failed",
    });
    expect(await controller.move(move())).toMatchObject({ kind: "failed" });
    expect(await controller.addNextAction(task())).toMatchObject({ kind: "failed" });
    release({ ok: true, value: { undoToken: { id: "synthetic-task-undo" } } });
    expect(await pending).toMatchObject({ kind: "saved" });
    expect(api.nextActions.setNextAction).toHaveBeenCalledOnce();
    expect(await controller.move(move())).toMatchObject({ kind: "saved" });
  });
  it("prevents task writes while a status request owns the same controller", async () => {
    const { api, controller } = fixture();
    let release;
    const current = await api.pipeline.workspace();
    api.pipeline.workspace.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = controller.move(move());
    expect(await controller.addNextAction(task())).toMatchObject({ kind: "failed" });
    expect(api.nextActions.setNextAction).not.toHaveBeenCalled();
    release(current);
    await pending;
  });
  it("rejects malformed task versions before reads and preserves typed preflight/write failures", async () => {
    const { api, controller } = fixture();
    expect(
      await controller.addNextAction({ ...task(), expected: { jobRowVersion: 0 } }),
    ).toMatchObject({ kind: "failed", retryable: false });
    expect(api.pipeline.workspace).not.toHaveBeenCalled();
    api.pipeline.workspace.mockResolvedValueOnce({
      ok: false,
      error: { message: "Job unavailable", retryable: false },
    });
    expect(await controller.addNextAction(task())).toEqual({
      kind: "failed",
      message: "Job unavailable",
      retryable: false,
    });
    expect(api.nextActions.setNextAction).not.toHaveBeenCalled();
    api.nextActions.setNextAction.mockResolvedValueOnce({
      ok: false,
      error: { message: "Schedule changed", retryable: true },
    });
    expect(await controller.addNextAction(task())).toEqual({
      kind: "failed",
      message: "Schedule changed",
      retryable: true,
    });
    expect(api.nextActions.setNextAction).toHaveBeenCalledOnce();
  });
  it("redacts unexpected task/undo failures with accurate mutation-kind wording", async () => {
    const { api, controller } = fixture();
    api.nextActions.setNextAction.mockRejectedValueOnce(new Error("PRIVATE_TASK_STORAGE"));
    const failure = await controller.addNextAction(task());
    expect(failure).toMatchObject({ kind: "failed", retryable: true });
    expect(failure.message).toContain("next-action");
    expect(failure.message).not.toContain("PRIVATE");
    api.pipelineMutations.undo.mockRejectedValueOnce(new Error("PRIVATE_UNDO_STORAGE"));
    const undo = await controller.undo("synthetic-task-undo", "next-action");
    expect(undo.message).toContain("next-action");
    expect(undo.message).not.toContain("PRIVATE");
  });
  it("binds the viewed job and freshly resolved active attempt to the atomic command", async () => {
    const { api, controller } = fixture();
    expect(await controller.move(move())).toMatchObject({ kind: "saved" });
    expect(api.pipelineMutations.changeStatus).toHaveBeenCalledExactlyOnceWith({
      jobId: "synthetic-job",
      applicationId: "synthetic-attempt",
      toStatusId: "preparing",
      allowReopen: false,
      expected: { jobRowVersion: 2, currentStatusId: "saved", applicationRowVersion: 3 },
    });
  });
  it.each([
    { rowVersion: 3 },
    { status: { id: "different" } },
    { archivedAt: "synthetic-instant" },
  ])("does not rebind an old gesture to refreshed job state: %j", async (change) => {
    const { api, controller } = fixture();
    const current = (await api.pipeline.workspace()).value;
    api.pipeline.workspace.mockResolvedValue({
      ok: true,
      value: { ...current, job: { ...current.job, ...change } },
    });
    expect(await controller.move(move())).toMatchObject({ kind: "failed", retryable: false });
    expect(api.pipelineMutations.changeStatus).not.toHaveBeenCalled();
  });
  it("routes a first Applied request to review without a status write", async () => {
    const { api, controller } = fixture();
    expect(await controller.move({ ...move(), toStatusId: "applied" })).toEqual({
      kind: "review-applied",
      jobId: "synthetic-job",
    });
    expect(api.pipelineMutations.changeStatus).not.toHaveBeenCalled();
    api.loadApplicationSubmissionReview.mockResolvedValue({
      ok: true,
      value: { snapshot: { id: "existing-submitted-set" } },
    });
    expect(await controller.move({ ...move(), toStatusId: "applied" })).toMatchObject({
      kind: "saved",
    });
  });
  it("retains typed failures and hides unexpected private exception details", async () => {
    const { api, controller } = fixture();
    api.pipelineMutations.changeStatus.mockRejectedValueOnce(
      new Error("synthetic private career content"),
    );
    const failed = await controller.move(move());
    expect(failed).toMatchObject({ kind: "failed", retryable: true });
    expect(JSON.stringify(failed)).not.toContain("synthetic private career content");
    api.pipelineMutations.undo.mockResolvedValueOnce({
      ok: false,
      error: { message: "That edit was already undone.", retryable: false },
    });
    expect(await controller.undo("synthetic-undo")).toEqual({
      kind: "failed",
      message: "That edit was already undone.",
      retryable: false,
    });
  });
  it("snapshots input and prevents overlapping moves or undo while an operation is held", async () => {
    const { api, controller } = fixture();
    let release;
    const current = await api.pipeline.workspace();
    api.pipeline.workspace.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = move();
    const pending = controller.move(request);
    request.toStatusId = "applied";
    expect(await controller.undo("synthetic-undo")).toMatchObject({ kind: "failed" });
    expect(api.pipelineMutations.undo).not.toHaveBeenCalled();
    release(current);
    expect(await pending).toMatchObject({ kind: "saved" });
    expect(api.pipelineMutations.changeStatus.mock.calls[0][0].toStatusId).toBe("preparing");
  });
});
