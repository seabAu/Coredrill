import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobActivityError } from "../../packages/application/dist/index.js";
import { createStoredNextActionApi } from "../../apps/web/src/stored-next-actions.ts";

const { write } = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createDatabaseJobActivityPort: () => ({ setNextAction: write }),
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
  it("requires viewed context, creates only job-scoped tasks and owns audit/identities", async () => {
    const { api, createId, open } = setup();
    expect(Object.keys(api)).toEqual(["setNextAction"]);
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
