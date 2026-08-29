import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { entityId, instant } from "@coredrill/domain";

import {
  MutationUndoError,
  createMutationUndoOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type MutationUndoPort,
  type MutationUndoTokenDto,
} from "../src/index.js";

const TOKEN_ID = entityId("mutation-undo-token", "0198e207-0000-7000-8000-000000000001");
const JOB_ID = entityId("job", "0198e207-0000-7000-8000-000000000002");
const CREATED_AT = instant("2026-08-29T14:00:00.000Z");
const CONSUMED_AT = instant("2026-08-29T14:05:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e207-0000-7000-8000-000000000003"),
  initiatedAt: CONSUMED_AT,
};

const consumedToken = (): MutationUndoTokenDto => ({
  id: TOKEN_ID,
  kind: "status_change",
  jobId: JOB_ID,
  createdAt: CREATED_AT,
  consumedAt: CONSUMED_AT,
  rowVersion: 2,
});

const undoPort = (): MutationUndoPort => ({
  consume: vi.fn(async () => consumedToken()),
});

describe("mutation undo application operation", () => {
  it("consumes one durable undo token at the operation clock", async () => {
    const undo = undoPort();
    const { consumeUndoTokenCommand } = createMutationUndoOperations({ undo });

    expect(consumeUndoTokenCommand).toMatchObject({
      kind: "command",
      name: "ConsumeUndoTokenCommand",
      transactional: true,
    });
    const result = await consumeUndoTokenCommand.execute({ tokenId: TOKEN_ID }, context);

    expect(result).toEqual({ ok: true, value: consumedToken() });
    expect(undo.consume).toHaveBeenCalledWith({ id: TOKEN_ID, consumedAt: CONSUMED_AT });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    expectTypeOf(consumeUndoTokenCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<MutationUndoTokenDto>>
    >();
  });

  it("rejects malformed token IDs before persistence", async () => {
    const undo = undoPort();
    const { consumeUndoTokenCommand } = createMutationUndoOperations({ undo });

    await expect(consumeUndoTokenCommand.execute({ tokenId: "bad" }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "Choose a valid local undo token.",
        retryable: false,
      },
    });
    expect(undo.consume).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "not_found", "The local undo token was not found.", false],
    ["already_consumed", "conflict", "That edit was already undone.", false],
    [
      "target_changed",
      "conflict",
      "The edited item changed again, so this undo is no longer safe.",
      false,
    ],
    ["busy", "conflict", "The local job store is busy. Retry shortly.", true],
    ["unavailable", "unavailable", "Local job storage is unavailable.", true],
    ["permission_denied", "permission_denied", "Coredrill cannot access local job storage.", true],
    ["read_only", "permission_denied", "The local job store is read-only.", false],
    ["invalid_state", "internal", "The local undo store is not in a usable state.", false],
  ] as const)(
    "maps the %s undo failure to a stable content-free error",
    async (portCode, applicationCode, message, retryable) => {
      const undo = undoPort();
      vi.mocked(undo.consume).mockRejectedValueOnce(new MutationUndoError(portCode));
      const { consumeUndoTokenCommand } = createMutationUndoOperations({ undo });

      await expect(
        consumeUndoTokenCommand.execute({ tokenId: TOKEN_ID }, context),
      ).resolves.toEqual({
        ok: false,
        error: { code: applicationCode, message, retryable },
      });
    },
  );

  it("fails closed when persistence returns a mismatched consumption", async () => {
    const undo = undoPort();
    vi.mocked(undo.consume).mockResolvedValueOnce({ ...consumedToken(), consumedAt: null });
    const { consumeUndoTokenCommand } = createMutationUndoOperations({ undo });

    await expect(consumeUndoTokenCommand.execute({ tokenId: TOKEN_ID }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local undo operation failed safely.",
        retryable: false,
      },
    });
  });
});
