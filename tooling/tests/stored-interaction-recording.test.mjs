import { beforeEach, describe, expect, it, vi } from "vitest";
import { entityId, instant } from "../../packages/domain/dist/index.js";
const ports = vi.hoisted(() => ({ recordInteraction: vi.fn(), check: vi.fn(), factory: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  createDatabaseViewedInteractionPort: (...args) => {
    ports.factory(...args);
    return ports;
  },
}));
import { createStoredInteractionRecordingApi } from "../../apps/web/src/stored-interaction-recording.ts";
const id = (suffix) => `0198e109-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
const at = instant("2026-10-22T07:00:00.000Z");
const scope = {
  specVersion: 1,
  expectedVaultId: id(1),
  jobId: id(2),
  jobRowVersion: 3,
  contactId: id(3),
  contactRowVersion: 4,
};
const fields = {
  type: "call",
  direction: "mutual",
  summary: "  exact 🧭 <script>literal</script>  ",
};
const context = () => ({ operationId: entityId("application-operation", id(4)), initiatedAt: at });
const setup = () => {
  const selected = { selectedOnly: true },
    open = vi.fn(async () => selected),
    clock = vi.fn(context),
    createId = vi.fn(() => id(5));
  return {
    selected,
    open,
    clock,
    createId,
    api: createStoredInteractionRecordingApi(open, clock, createId),
  };
};
const ack = (input) => {
  const record = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "expected"));
  return { ...record, rowVersion: 1 };
};
beforeEach(() => {
  vi.clearAllMocks();
  ports.recordInteraction.mockImplementation(async (input) => ack(input));
  ports.check.mockResolvedValue(undefined);
});
describe("fixed local interaction intent", () => {
  it("opens nothing and reads no clock on construction", () => {
    const local = setup();
    const draft = local.api.beginRecording(scope);
    expect(draft.phase()).toBe("editing");
    expect(local.createId).toHaveBeenCalledTimes(1);
    expect(local.open).not.toHaveBeenCalled();
    expect(local.clock).not.toHaveBeenCalled();
    expect(ports.factory).not.toHaveBeenCalled();
  });
  it.each([
    { ...scope, extra: true },
    { ...scope, specVersion: 2 },
    { ...scope, contactId: null },
    { ...scope, jobRowVersion: 0 },
  ])("rejects invalid owner before identity or storage: %j", (input) => {
    const local = setup();
    expect(() => local.api.beginRecording(input)).toThrow();
    expect(local.open).not.toHaveBeenCalled();
    expect(local.createId).not.toHaveBeenCalled();
  });
  it.each([
    { ...fields, summary: "x".repeat(200001) },
    { ...fields, type: "send_email" },
    { ...fields, summary: "bad\0text" },
    { ...fields, occurredAt: null },
    { ...fields, extra: true },
  ])(
    "rejects invalid fields before opening and does not pin failed validation: %j",
    async (input) => {
      const local = setup();
      const draft = local.api.beginRecording(scope);
      expect((await draft.save(input)).ok).toBe(false);
      expect(local.open).not.toHaveBeenCalled();
      expect(draft.phase()).toBe("editing");
      expect((await draft.save(fields)).ok).toBe(true);
    },
  );
  it("saves only the copied selected context and does not submit an acknowledged record again", async () => {
    const local = setup(),
      draft = local.api.beginRecording(scope);
    expect(await draft.check()).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(local.open).not.toHaveBeenCalled();
    expect((await draft.save(fields)).ok).toBe(true);
    expect(draft.phase()).toBe("recorded");
    expect((await draft.save(fields)).ok).toBe(false);
    expect((await draft.check()).ok).toBe(false);
    expect(ports.recordInteraction).toHaveBeenCalledTimes(1);
    expect(local.clock).toHaveBeenCalledTimes(1);
    expect(ports.factory).toHaveBeenCalledWith(local.selected);
    expect(ports.recordInteraction.mock.calls[0][0]).toMatchObject({
      id: id(5),
      jobId: scope.jobId,
      contactId: scope.contactId,
      expected: { expectedVaultId: scope.expectedVaultId, jobRowVersion: 3, contactRowVersion: 4 },
      createdAt: at,
      occurredAt: at,
      ...fields,
    });
  });
  it("requires a read-only check after lost acknowledgement and never resubmits an existing record", async () => {
    const local = setup(),
      draft = local.api.beginRecording(scope);
    let original;
    ports.recordInteraction.mockImplementationOnce(async (input) => {
      original = input;
      throw new Error("private /path");
    });
    expect((await draft.save(fields)).ok).toBe(false);
    expect(draft.phase()).toBe("uncertain");
    expect((await draft.save(fields)).ok).toBe(false);
    expect(ports.recordInteraction).toHaveBeenCalledTimes(1);
    ports.check.mockImplementationOnce(async () => ack(original));
    expect(await draft.check()).toMatchObject({ ok: true, value: { state: "recorded" } });
    expect((await draft.save(fields)).ok).toBe(false);
    expect(ports.recordInteraction).toHaveBeenCalledTimes(1);
    expect(ports.check.mock.calls[0][0]).toEqual(original);
    expect(draft.phase()).toBe("recorded");
  });
  it("permits only an explicit identical retry after confirmed absence, retaining ID and time", async () => {
    const local = setup(),
      draft = local.api.beginRecording(scope);
    ports.recordInteraction.mockRejectedValueOnce(new Error("private"));
    await draft.save(fields);
    const original = ports.recordInteraction.mock.calls[0][0];
    expect(await draft.check()).toMatchObject({ ok: true, value: { state: "not_recorded" } });
    expect((await draft.save({ ...fields, summary: "changed" })).ok).toBe(false);
    expect(ports.recordInteraction).toHaveBeenCalledTimes(1);
    expect((await draft.save(fields)).ok).toBe(true);
    expect(ports.recordInteraction.mock.calls[1][0]).toEqual(original);
    expect(local.clock).toHaveBeenCalledTimes(1);
    expect(local.createId).toHaveBeenCalledTimes(1);
  });
  it("copies fields and owner before awaited opening, serializes save/check, and retires before a late write", async () => {
    const local = setup();
    let release;
    local.open.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const owner = { ...scope },
      input = { ...fields },
      draft = local.api.beginRecording(owner);
    owner.jobRowVersion = 9;
    const pending = draft.save(input);
    input.summary = "changed";
    expect((await draft.save(fields)).ok).toBe(false);
    expect((await draft.check()).ok).toBe(false);
    draft.dispose();
    release(local.selected);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(ports.recordInteraction).not.toHaveBeenCalled();
    expect(draft.phase()).toBe("retired");
    expect((await draft.save(fields)).ok).toBe(false);
  });
  it("retains immutable fields and first context while opening is held", async () => {
    const local = setup();
    let release;
    local.open.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const input = { ...fields },
      current = context(),
      owner = { ...scope };
    local.clock.mockReturnValueOnce(current);
    const draft = local.api.beginRecording(owner);
    const pending = draft.save(input);
    input.summary = "changed";
    owner.contactId = id(99);
    current.initiatedAt = instant("2026-10-22T09:00:00.000Z");
    release(local.selected);
    expect((await pending).ok).toBe(true);
    expect(ports.recordInteraction.mock.calls[0][0]).toMatchObject({
      summary: fields.summary,
      createdAt: at,
      contactId: scope.contactId,
    });
  });
  it("keeps a failed acknowledgement read uncertain and private", async () => {
    const local = setup(),
      draft = local.api.beginRecording(scope);
    ports.recordInteraction.mockRejectedValueOnce(new Error("private"));
    await draft.save(fields);
    ports.check.mockRejectedValueOnce(new Error("private content /path"));
    const result = await draft.check();
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private content");
    expect(draft.phase()).toBe("uncertain");
    expect((await draft.save(fields)).ok).toBe(false);
  });
});
