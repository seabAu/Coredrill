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
    loadApplicationSubmissionReview: vi.fn(async () => ({ ok: true, value: { snapshot: null } })),
  };
  return { api, controller: createStoredStatusController(() => api) };
};
describe("stored status controller", () => {
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
