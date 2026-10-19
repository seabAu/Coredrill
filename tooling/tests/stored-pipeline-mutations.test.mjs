import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import { createStoredPipelineMutationApi } from "../../apps/web/src/stored-pipeline-mutations.ts";

const jobId = "0199b361-0000-7000-8000-000000000001";
const statusId = "0199b361-0000-7000-8000-000000000002";
const tokenId = "0199b361-0000-7000-8000-000000000003";
const context = () => ({
  operationId: entityId("application-operation", "0199b361-0000-7000-8000-000000000004"),
  initiatedAt: instant("2026-10-19T16:00:00.000Z"),
});
const createId = () => "0199b361-0000-7000-8000-000000000005";
const input = () => ({
  jobId,
  applicationId: null,
  toStatusId: statusId,
  expected: { jobRowVersion: 1, currentStatusId: null, applicationRowVersion: null },
});

describe("interactive status runtime", () => {
  it("requires viewed context even if a caller tries to disable submission review", async () => {
    const open = vi.fn();
    const api = createStoredPipelineMutationApi(open, context, createId);
    expect(
      await api.changeStatus({ ...input(), expected: undefined, requireSubmissionSnapshot: false }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
  });
  it("validates edit and undo identities before opening storage", async () => {
    const open = vi.fn();
    const api = createStoredPipelineMutationApi(open, context, createId);
    expect(await api.changeStatus({ ...input(), jobId: "invalid" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(await api.undo({ tokenId: "invalid" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
  });
  it.each(["changeStatus", "undo"])(
    "makes %s open failures retryable without private details",
    async (operation) => {
      const open = vi.fn().mockRejectedValue(new Error("synthetic private SQL and path"));
      const api = createStoredPipelineMutationApi(open, context, createId);
      const result = await api[operation](operation === "undo" ? { tokenId } : input());
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
      expect(JSON.stringify(result)).not.toContain("synthetic private");
      expect(open).toHaveBeenCalledOnce();
    },
  );
});
