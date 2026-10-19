import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  ApplicationAttemptError,
  createStartApplicationAttemptCommand,
  type StartApplicationAttemptPortInput,
} from "../src/index.js";

const ids = {
  job: "0199b330-0000-7000-8000-000000000001",
  application: "0199b330-0000-7000-8000-000000000002",
  status_definition: "0199b330-0000-7000-8000-000000000003",
  "status-event": "0199b330-0000-7000-8000-000000000004",
};
const context = {
  operationId: entityId("application-operation", "0199b330-0000-7000-8000-000000000005"),
  initiatedAt: instant("2026-10-19T10:00:00.000Z"),
};
const input = {
  jobId: ids.job,
  expectedJobRowVersion: 1,
  preparationStageName: " Drafting   locally ",
};
const setup = () => {
  const start = vi.fn(async (request: StartApplicationAttemptPortInput): Promise<unknown> => ({
    applicationId: request.applicationId,
    jobId: request.jobId,
    statusId: request.newStageId,
    statusName: request.preparationStageName,
    jobRowVersion: request.expectedJobRowVersion + 1,
    createdAt: request.createdAt,
  }));
  return {
    start,
    command: createStartApplicationAttemptCommand({
      attempts: { start },
      createId: (kind) => ids[kind],
    }),
  };
};

describe("start local application preparation", () => {
  it("uses explicit normalized naming and operation-owned identities/time without submission or selection", async () => {
    const { command, start } = setup();
    expect(await command.execute(input, context)).toMatchObject({
      ok: true,
      value: { applicationId: ids.application, statusName: "Drafting locally", jobRowVersion: 2 },
    });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: context.initiatedAt,
        preparationStageName: "Drafting locally",
        expectedJobRowVersion: 1,
      }),
    );
    expect(start.mock.calls[0]?.[0]).not.toHaveProperty("appliedAt");
    expect(start.mock.calls[0]?.[0]).not.toHaveProperty("selectedResumeVersionId");
  });
  it.each([
    { ...input, jobId: "bad" },
    { ...input, expectedJobRowVersion: 0 },
    { ...input, expectedJobRowVersion: 1.5 },
    { ...input, expectedJobRowVersion: Number.MAX_SAFE_INTEGER },
    { ...input, preparationStageName: "" },
    { ...input, preparationStageName: "x".repeat(81) },
    { ...input, preparationStageName: "Draft\nnow" },
    { ...input, allowAdditionalAttempt: true },
    null,
  ])("rejects invalid input before a write", async (value) => {
    const { command, start } = setup();
    expect(await command.execute(value as never, context)).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(start).not.toHaveBeenCalled();
  });
  it("keeps conflict and arbitrary port failures content-free", async () => {
    const { command, start } = setup();
    start.mockRejectedValueOnce(new ApplicationAttemptError("conflict"));
    expect(await command.execute(input, context)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    start.mockRejectedValueOnce(new Error("private vault path and SQL"));
    const result = await command.execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private vault");
  });
  it("does not trust mismatched adapter identities or projections", async () => {
    const { command, start } = setup();
    start.mockResolvedValueOnce({ applicationId: ids.job, statusName: "private value" });
    const result = await command.execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private value");
  });
});
