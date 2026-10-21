import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createCompleteNextActionCommand,
  NextActionCompletionError,
  type CompleteNextActionInput,
  type CompleteNextActionPortInput,
} from "../src/index.js";

const jobId = "0198e103-0000-7000-8000-000000000004";
const nextActionId = "0198e103-0000-7000-8000-00000000000b";
const input = () => ({
  jobId,
  nextActionId,
  expected: { jobRowVersion: 3, nextActionRowVersion: 1 },
});
const context = {
  operationId: entityId("application-operation", "0198e103-0000-7000-8000-000000000011"),
  initiatedAt: instant("2026-08-25T14:15:00.000Z"),
};
const acknowledgement = (request: CompleteNextActionPortInput) => ({
  jobId: request.jobId,
  nextActionId: request.nextActionId,
  state: "completed",
  completedAt: request.completedAt,
  jobRowVersion: request.expected.jobRowVersion + 1,
  nextActionRowVersion: request.expected.nextActionRowVersion + 1,
});

describe("explicit viewed next-action completion", () => {
  it("copies frozen viewed intent and context time and returns a sanitized acknowledgement", async () => {
    const original = input();
    const complete = vi.fn(async (request: CompleteNextActionPortInput) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.expected)).toBe(true);
      original.expected.jobRowVersion = 99;
      return { ...acknowledgement(request), privateDiagnostic: "PRIVATE_COMPLETION" };
    });
    const result = await createCompleteNextActionCommand({ complete }).execute(original, context);
    expect(result).toEqual({
      ok: true,
      value: {
        jobId,
        nextActionId,
        state: "completed",
        completedAt: context.initiatedAt,
        jobRowVersion: 4,
        nextActionRowVersion: 2,
      },
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_COMPLETION");
  });
  it.each([
    null,
    {},
    { ...input(), expected: undefined },
    { ...input(), jobId: "invalid" },
    { ...input(), completedAt: "2026-08-25T15:00:00.000Z" },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN].map((jobRowVersion) => ({
      ...input(),
      expected: { jobRowVersion, nextActionRowVersion: 1 },
    })),
    { ...input(), expected: { jobRowVersion: 3, nextActionRowVersion: 0 } },
    { ...input(), expected: { ...input().expected, hidden: true } },
  ])("rejects invalid or caller-timed input without a write: %j", async (bad) => {
    const complete = vi.fn();
    const result = await createCompleteNextActionCommand({ complete }).execute(
      bad as CompleteNextActionInput,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(complete).not.toHaveBeenCalled();
  });
  it.each([
    "jobId",
    "nextActionId",
    "state",
    "completedAt",
    "jobRowVersion",
    "nextActionRowVersion",
  ])("rejects forged acknowledgement %s", async (field) => {
    const result = await createCompleteNextActionCommand({
      complete: async (request) => ({ ...acknowledgement(request), [field]: "forged" }),
    }).execute(input(), context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
  });
  it.each(["conflict", "not_found", "unavailable"] as const)(
    "preserves reviewed %s without private details",
    async (code) => {
      const result = await createCompleteNextActionCommand({
        complete: async () => {
          throw new NextActionCompletionError(code);
        },
      }).execute(input(), context);
      expect(result).toMatchObject({
        ok: false,
        error: { code, retryable: code === "unavailable" },
      });
    },
  );
  it("redacts unknown storage errors and never retries a command", async () => {
    const complete = vi.fn(async () => {
      throw new Error("PRIVATE_SQL_TASK_PATH");
    });
    const result = await createCompleteNextActionCommand({ complete }).execute(input(), context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SQL_TASK_PATH");
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
