import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { ContactWorkspaceError } from "../src/contact-workspace.js";
import {
  createContactDeletionOperations,
  createContactDeletionTargetV1,
  parseContactDeletionTargetV1,
  type ContactDeletionTargetV1,
} from "../src/contact-deletion.js";

const id = (n: number) => `0198e113-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T19:00:00.000Z");
const target: ContactDeletionTargetV1 = {
  specVersion: 1,
  expectedVaultId: entityId("vault", id(1)),
  contactId: entityId("contact", id(2)),
  expectedRowVersion: 1,
  expectedCreatedAt: at,
  expectedUpdatedAt: at,
  expectedArchivedAt: null,
  expectedCompanyId: null,
  expectedManualCreationOperationId: null,
};
const context = { operationId: entityId("application-operation", id(3)), initiatedAt: at };
const response = (state: string) => ({
  specVersion: 1,
  vaultId: target.expectedVaultId,
  contactId: target.contactId,
  state,
});
const setup = () => {
  const remove = vi.fn(async (_input: ContactDeletionTargetV1): Promise<unknown> =>
    response("deleted"),
  );
  const inspect = vi.fn(async (_input: ContactDeletionTargetV1): Promise<unknown> =>
    response("original_present"),
  );
  return { remove, inspect, operations: createContactDeletionOperations({ remove, inspect }) };
};
describe("viewed contact deletion contract", () => {
  it("constructs an independent target from a validated selected workspace without retaining private fields", () => {
    const viewed = {
      specVersion: 1 as const,
      vaultId: target.expectedVaultId,
      contact: {
        id: target.contactId,
        companyId: null,
        name: "Synthetic private name",
        role: null,
        email: null,
        phone: null,
        publicProfileUrl: null,
        confidence: null,
        userConfirmed: true,
        notes: "Synthetic private notes",
        createdAt: at,
        updatedAt: at,
        rowVersion: 1,
        archivedAt: null,
      },
      manualCreation: null,
    };
    const copied = createContactDeletionTargetV1(viewed);
    viewed.contact.rowVersion = 2;
    expect(copied).toEqual(target);
    expect(JSON.stringify(copied)).not.toContain("private");
    expect(Object.isFrozen(copied)).toBe(true);
  });
  it("copies and freezes the original target without retaining mutable caller input", () => {
    const input = { ...target };
    const parsed = parseContactDeletionTargetV1(input);
    input.expectedRowVersion = 2;
    expect(parsed).toEqual(target);
    expect(Object.isFrozen(parsed)).toBe(true);
  });
  it.each([
    { specVersion: 2 },
    { expectedVaultId: id(99).toUpperCase() },
    { contactId: "invalid" },
    { expectedRowVersion: 0 },
    { expectedRowVersion: NaN },
    { expectedRowVersion: Number.MAX_SAFE_INTEGER },
    { expectedRowVersion: "1" },
    { expectedCreatedAt: "2026-10-25T19:00:00.000Z" },
    { expectedUpdatedAt: "invalid" },
    { expectedArchivedAt: "2026-10-23T19:00:00.000Z" },
    { expectedCompanyId: "invalid" },
    { expectedManualCreationOperationId: "invalid" },
    { automatic: true },
    { confirmation: "DELETE CONTACT" },
  ])("rejects malformed or expanded read targets before reaching storage: %j", async (change) => {
    const { inspect, operations } = setup();
    const result = await operations.inspect.execute(
      { ...target, ...change } as ContactDeletionTargetV1,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(inspect).not.toHaveBeenCalled();
  });
  it("requires exact explicit confirmation before a single port dispatch", async () => {
    const { remove, operations } = setup();
    for (const confirmation of [
      "",
      "DELETE",
      "delete contact",
      " DELETE CONTACT",
      "DELETE CONTACT ",
    ])
      expect(await operations.remove.execute({ ...target, confirmation }, context)).toMatchObject({
        ok: false,
        error: { code: "validation" },
      });
    expect(remove).not.toHaveBeenCalled();
    const result = await operations.remove.execute(
      { ...target, confirmation: "DELETE CONTACT" },
      context,
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(target);
    expect(result).toEqual({ ok: true, value: response("deleted") });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
  });
  it.each(["original_present", "changed", "absent_complete", "unresolved"])(
    "inspection is read-only and retains the exact %s observation without attribution",
    async (state) => {
      const { remove, inspect, operations } = setup();
      inspect.mockResolvedValue(response(state));
      expect(operations.inspect.readOnly).toBe(true);
      expect(await operations.inspect.execute(target, context)).toEqual({
        ok: true,
        value: response(state),
      });
      expect(inspect).toHaveBeenCalledWith(target);
      expect(remove).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...response("deleted"), vaultId: id(8) },
    { ...response("deleted"), contactId: id(8) },
    { ...response("deleted"), state: "absent_complete" },
    { ...response("deleted"), deletedAt: at },
    { ...response("deleted"), operationId: context.operationId },
  ])("rejects malformed or misattributed write acknowledgements: %j", async (ack) => {
    const { remove, operations } = setup();
    remove.mockResolvedValue(ack);
    expect(
      await operations.remove.execute({ ...target, confirmation: "DELETE CONTACT" }, context),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("cannot reinterpret a read observation as a confirmed write", async () => {
    const { inspect, operations } = setup();
    inspect.mockResolvedValue(response("deleted"));
    expect(await operations.inspect.execute(target, context)).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it("maps stale and unknown errors without exposing private detail or repeating an effect", async () => {
    const { remove, operations } = setup();
    remove.mockRejectedValueOnce(new ContactWorkspaceError("stale"));
    expect(
      await operations.remove.execute({ ...target, confirmation: "DELETE CONTACT" }, context),
    ).toMatchObject({ ok: false, error: { code: "conflict", retryable: false } });
    remove.mockRejectedValueOnce(new Error("PRIVATE CONTACT NOTES"));
    const result = await operations.remove.execute(
      { ...target, confirmation: "DELETE CONTACT" },
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "internal", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it("validates command context and unknown command keys before effects", async () => {
    const { remove, operations } = setup();
    expect(
      await operations.remove.execute(
        { ...target, confirmation: "DELETE CONTACT", unexpected: true } as never,
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(
      await operations.remove.execute({ ...target, confirmation: "DELETE CONTACT" }, {
        ...context,
        operationId: "invalid",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(remove).not.toHaveBeenCalled();
  });
});
