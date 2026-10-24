import { describe, expect, it, vi } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { createRecordedInteractionQuery, type ApplicationOperationContext } from "../src/index.js";

const id = (suffix: number) => `0198e109-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
const at = instant("2026-10-22T07:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", id(1)),
  initiatedAt: at,
};
const intent = () => ({
  id: entityId("interaction", id(2)),
  jobId: entityId("job", id(3)),
  contactId: null,
  expected: {
    specVersion: 1 as const,
    expectedVaultId: id(4),
    jobRowVersion: 1,
    contactRowVersion: null,
  },
  type: "call",
  occurredAt: at,
  direction: "unknown" as const,
  summary: "  exact 🧭  ",
  nextActionAt: null,
  createdAt: at,
  updatedAt: at,
});
const stored = () => {
  const { expected: _expected, ...record } = intent();
  return { ...record, rowVersion: 1 };
};

describe("read-only recorded-interaction acknowledgement", () => {
  it("returns explicit absence without recording", async () => {
    const check = vi.fn(async () => undefined);
    const query = createRecordedInteractionQuery({ check });
    expect(query).toMatchObject({ kind: "query", readOnly: true });
    expect(await query.execute({ specVersion: 1, intent: intent() }, context)).toEqual({
      ok: true,
      value: { specVersion: 1, state: "not_recorded", interaction: null },
    });
    expect(check).toHaveBeenCalledTimes(1);
  });
  it("returns only an exact immutable acknowledgement", async () => {
    const record = stored();
    const query = createRecordedInteractionQuery({ check: vi.fn(async () => record) });
    const result = await query.execute({ specVersion: 1, intent: intent() }, context);
    expect(result).toEqual({
      ok: true,
      value: { specVersion: 1, state: "recorded", interaction: record },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.interaction)).toBe(true);
      expect(result.value.interaction).not.toBe(record);
    }
  });
  it.each([
    null,
    { specVersion: 1 },
    { specVersion: 2, intent: intent() },
    { specVersion: 1, intent: intent(), extra: true },
    { specVersion: 1, intent: { ...intent(), extra: true } },
    { specVersion: 1, intent: { ...intent(), expected: undefined } },
  ])("rejects malformed input before any read: %j", async (input) => {
    const check = vi.fn();
    const result = await createRecordedInteractionQuery({ check }).execute(input as never, context);
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(check).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...stored(), summary: "other private content" },
    { ...stored(), rowVersion: 2 },
    { ...stored(), id: id(9) },
    { ...stored(), updatedAt: "2026-10-22T08:00:00.000Z" },
  ])(
    "rejects corrupt or unrelated acknowledgement without exposing content: %j",
    async (record) => {
      const result = await createRecordedInteractionQuery({
        check: vi.fn(async () => record),
      }).execute({ specVersion: 1, intent: intent() }, context);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("private content");
    },
  );
  it("copies original intent before awaiting and redacts private failures", async () => {
    const input = { specVersion: 1 as const, intent: intent() };
    const check = vi.fn(async (copied) => {
      expect(Object.isFrozen(copied)).toBe(true);
      expect(Object.isFrozen(copied.expected)).toBe(true);
      input.intent.summary = "changed";
      input.intent.expected.jobRowVersion = 8;
      expect(copied.summary).toBe("  exact 🧭  ");
      expect(copied.expected.jobRowVersion).toBe(1);
      throw new Error("private content /some/path");
    });
    const result = await createRecordedInteractionQuery({ check }).execute(input, context);
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private content");
  });
});
