import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createDismissNextActionCommand,
  NextActionDismissalError,
  type DismissNextActionInput,
  type DismissNextActionPortInput,
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
const acknowledgement = (request: DismissNextActionPortInput) => ({
  jobId: request.jobId,
  nextActionId: request.nextActionId,
  state: "dismissed",
  completedAt: null,
  dismissedAt: request.dismissedAt,
  jobRowVersion: request.expected.jobRowVersion + 1,
  nextActionRowVersion: request.expected.nextActionRowVersion + 1,
});

describe("explicit viewed next-action dismissal", () => {
  it("copies frozen viewed intent and context time and returns a sanitized acknowledgement", async () => {
    const original = input();
    const dismiss = vi.fn(async (request: DismissNextActionPortInput) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.expected)).toBe(true);
      original.expected.jobRowVersion = 99;
      return { ...acknowledgement(request), privateDiagnostic: "PRIVATE_COMPLETION" };
    });
    const result = await createDismissNextActionCommand({ dismiss }).execute(original, context);
    expect(result).toEqual({
      ok: true,
      value: {
        jobId,
        nextActionId,
        state: "dismissed",
        completedAt: null,
        dismissedAt: context.initiatedAt,
        jobRowVersion: 4,
        nextActionRowVersion: 2,
      },
    });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_COMPLETION");
  });
  it.each([
    null,
    {},
    { ...input(), expected: undefined },
    { ...input(), jobId: "invalid" },
    { ...input(), dismissedAt: "2026-08-25T15:00:00.000Z" },
    { ...input(), completedAt: context.initiatedAt },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN].map((jobRowVersion) => ({
      ...input(),
      expected: { jobRowVersion, nextActionRowVersion: 1 },
    })),
    { ...input(), expected: { jobRowVersion: 3, nextActionRowVersion: 0 } },
    { ...input(), expected: { ...input().expected, hidden: true } },
  ])("rejects invalid or caller-timed input without a write: %j", async (bad) => {
    const dismiss = vi.fn();
    const result = await createDismissNextActionCommand({ dismiss }).execute(
      bad as DismissNextActionInput,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(dismiss).not.toHaveBeenCalled();
  });
  it.each([
    "jobId",
    "nextActionId",
    "state",
    "dismissedAt",
    "completedAt",
    "jobRowVersion",
    "nextActionRowVersion",
  ])("rejects forged acknowledgement %s", async (field) => {
    const result = await createDismissNextActionCommand({
      dismiss: async (request) => ({ ...acknowledgement(request), [field]: "forged" }),
    }).execute(input(), context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
  });
  it.each(["conflict", "not_found", "unavailable"] as const)(
    "preserves reviewed %s without private details",
    async (code) => {
      const result = await createDismissNextActionCommand({
        dismiss: async () => {
          throw new NextActionDismissalError(code);
        },
      }).execute(input(), context);
      expect(result).toMatchObject({
        ok: false,
        error: { code, retryable: code === "unavailable" },
      });
    },
  );
  it("redacts unknown storage errors and never retries a command", async () => {
    const dismiss = vi.fn(async () => {
      throw new Error("PRIVATE_SQL_TASK_PATH");
    });
    const result = await createDismissNextActionCommand({ dismiss }).execute(input(), context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SQL_TASK_PATH");
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
