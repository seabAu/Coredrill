import { PipelineQueryError } from "../../packages/application/dist/index.js";
import { entityId, instant } from "../../packages/domain/dist/index.js";
import { describe, expect, it, vi } from "vitest";
import { createStoredPipelineApi } from "../../apps/web/src/stored-pipeline.ts";

const jobId = "0199b360-0000-7000-8000-000000000002";
const context = () => ({
  operationId: entityId("application-operation", "0199b360-0000-7000-8000-000000000001"),
  initiatedAt: instant("2026-10-19T10:00:00.000Z"),
});

describe("stored Pipeline runtime boundary", () => {
  it.each(["counts", "groups", "page", "workspace", "timeline"])(
    "keeps %s storage-open failures retryable and content-free",
    async (operation) => {
      const open = vi.fn().mockRejectedValue(new Error("private vault path and SQL"));
      const result = await createStoredPipelineApi(open, context)[operation](
        operation === "workspace" || operation === "timeline" ? { jobId } : {},
      );
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
      expect(JSON.stringify(result)).not.toContain("private vault");
      expect(open).toHaveBeenCalledOnce();
    },
  );
  it("preserves typed conflict failures", async () => {
    const api = createStoredPipelineApi(
      vi.fn().mockRejectedValue(new PipelineQueryError("busy")),
      context,
    );
    expect(await api.page()).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: true },
    });
  });
  it("validates scope and cursor inputs before opening storage", async () => {
    const open = vi.fn();
    const api = createStoredPipelineApi(open, context);
    for (const result of [
      await api.page({ limit: 101 }),
      await api.page({ statusId: "bad" }),
      await api.counts({ includeArchived: "yes" }),
      await api.workspace({ jobId: "bad" }),
      await api.timeline({ jobId: "bad" }),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    }
    expect(open).not.toHaveBeenCalled();
  });
});
