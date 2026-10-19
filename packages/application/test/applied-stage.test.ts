import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";
import {
  AppliedStageError,
  createAppliedStageCommand,
  type AppliedStagePortInput,
} from "../src/index.js";

const id = "0199b330-0000-7000-8000-000000000003";
const existingId = "0199b330-0000-7000-8000-000000000006";
const context = {
  operationId: entityId("application-operation", "0199b330-0000-7000-8000-000000000005"),
  initiatedAt: instant("2026-10-19T10:00:00.000Z"),
};
const setup = () => {
  const create = vi.fn(async (input: AppliedStagePortInput): Promise<unknown> => ({
    id: input.id,
    name: input.name,
    created: true,
  }));
  return { create, command: createAppliedStageCommand({ stages: { create }, createId: () => id }) };
};

describe("explicit local Applied stage creation", () => {
  it("normalizes the explicit name and owns identity/time without application data", async () => {
    const { command, create } = setup();
    expect(await command.execute({ name: " My   submitted stage " }, context)).toEqual({
      ok: true,
      value: { id, name: "My submitted stage", created: true },
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({
      id,
      name: "My submitted stage",
      createdAt: context.initiatedAt,
    });
  });
  it("accepts a compatible existing stage identity", async () => {
    const { command, create } = setup();
    create.mockResolvedValueOnce({ id: existingId, name: "Submitted", created: false });
    expect(await command.execute({ name: "Submitted" }, context)).toEqual({
      ok: true,
      value: { id: existingId, name: "Submitted", created: false },
    });
  });
  it.each([
    null,
    {},
    { name: "" },
    { name: "x".repeat(81) },
    { name: "Sent\nnow" },
    { name: 42 },
    { name: "Sent", category: "applied" },
    { name: "Sent", applicationId: id },
  ])("rejects invalid or expanded input before storage", async (input) => {
    const { command, create } = setup();
    expect(await command.execute(input as never, context)).toMatchObject({
      ok: false,
      error: { code: "validation", retryable: false },
    });
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { id: existingId, name: "Sent", created: true },
    { id: "bad", name: "Sent", created: false },
    { id, name: "Private content", created: true },
    { id, name: "Sent", created: "yes" },
  ])("rejects malformed adapter output without disclosure", async (output) => {
    const { command, create } = setup();
    create.mockResolvedValueOnce(output);
    const result = await command.execute({ name: "Sent" }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("Private content");
  });
  it("preserves conflict semantics and hides arbitrary storage failures", async () => {
    const { command, create } = setup();
    create.mockRejectedValueOnce(new AppliedStageError("conflict"));
    expect(await command.execute({ name: "Sent" }, context)).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: false },
    });
    create.mockRejectedValueOnce(new Error("private vault SQL"));
    const result = await command.execute({ name: "Sent" }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("private vault");
  });
});
