import { describe, expect, it, vi } from "vitest";
import { createContactDeletionTargetV1 } from "../../packages/application/dist/index.js";
import { createStoredContactDeletionController } from "../../apps/web/src/stored-contact-deletion-controller.ts";

const id = (n) => `0198e116-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-24T19:00:00.000Z";
const workspace = () => ({
  specVersion: 1,
  vaultId: id(1),
  manualCreation: null,
  contact: {
    id: id(2),
    companyId: null,
    name: "PRIVATE name",
    notes: "PRIVATE notes",
    role: null,
    email: null,
    phone: null,
    publicProfileUrl: null,
    confidence: null,
    userConfirmed: true,
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    rowVersion: 1,
  },
});
const result = (state) => ({
  ok: true,
  value: { specVersion: 1, vaultId: id(1), contactId: id(2), state },
});
const failed = () => ({
  ok: false,
  error: { code: "internal", message: "PRIVATE SQL/path", retryable: true },
});
const deferred = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const setup = () => {
  let allowed = true;
  const action = {
    target: createContactDeletionTargetV1(workspace()),
    remove: vi.fn(async () => result("deleted")),
    inspect: vi.fn(async () => result("original_present")),
  };
  const begin = vi.fn(() => action);
  const changed = vi.fn();
  const exclusive = vi.fn(async (vault, work) => work());
  const controller = createStoredContactDeletionController({
    api: () => ({ begin }),
    changed,
    exclusive,
    allowed: () => allowed,
  });
  const start = () => {
    expect(controller.start(workspace(), null)).toBe(true);
  };
  const consent = () => {
    start();
    expect(controller.edit("DELETE CONTACT")).toBe(true);
  };
  return {
    controller,
    action,
    begin,
    changed,
    exclusive,
    start,
    consent,
    permit: (value) => {
      allowed = value;
    },
  };
};

describe("owned contact deletion review", () => {
  it("retains metadata only and refuses replacement or wrong company scope", () => {
    const s = setup();
    expect(s.controller.start(workspace(), id(9))).toBe(false);
    s.start();
    expect(s.controller.start(workspace(), null)).toBe(false);
    expect(JSON.stringify(s.controller.current())).not.toContain("PRIVATE");
    expect(Object.isFrozen(s.controller.current())).toBe(true);
    expect(s.action.remove).not.toHaveBeenCalled();
  });
  it("requires exact consent and makes duplicate writes synchronously single-flight", async () => {
    const s = setup();
    s.start();
    s.controller.edit(" DELETE CONTACT");
    expect(await s.controller.remove()).toBe(false);
    s.controller.edit("DELETE CONTACT");
    const pending = deferred();
    s.action.remove.mockReturnValueOnce(pending.promise);
    const write = s.controller.remove();
    expect(s.controller.current().busy).toBe(true);
    expect(s.controller.edit("changed")).toBe(false);
    expect(s.controller.close()).toBe(false);
    expect(await s.controller.remove()).toBe(false);
    expect(await s.controller.inspect()).toBe(false);
    pending.release(result("deleted"));
    expect(await write).toBe(true);
    expect(s.action.remove).toHaveBeenCalledExactlyOnceWith("DELETE CONTACT");
    expect(s.controller.current().phase).toBe("deleted");
    expect(await s.controller.remove()).toBe(false);
  });
  it("locks uncertain intent, permits only explicit observation, then identical retry", async () => {
    const s = setup();
    s.consent();
    s.action.remove.mockResolvedValueOnce(failed());
    expect(await s.controller.remove()).toBe(false);
    expect(s.controller.current().phase).toBe("uncertain");
    expect(JSON.stringify(s.controller.current())).not.toContain("PRIVATE");
    expect(s.controller.edit("DELETE CONTACT")).toBe(false);
    expect(await s.controller.remove()).toBe(false);
    expect(s.action.inspect).not.toHaveBeenCalled();
    expect(await s.controller.inspect()).toBe(false);
    expect(s.controller.current().phase).toBe("original_present");
    expect(await s.controller.remove()).toBe(true);
    expect(s.begin).toHaveBeenCalledTimes(1);
    expect(s.action.remove.mock.calls).toEqual([["DELETE CONTACT"], ["DELETE CONTACT"]]);
  });
  it.each(["changed", "unresolved", "absent_complete"])(
    "never retries from %s or attributes observation to deletion",
    async (observation) => {
      const s = setup();
      s.consent();
      s.action.remove.mockResolvedValueOnce(failed());
      await s.controller.remove();
      s.action.inspect.mockResolvedValueOnce(result(observation));
      expect(await s.controller.inspect()).toBe(observation === "absent_complete");
      expect(s.controller.current().phase).toBe(observation);
      expect(await s.controller.remove()).toBe(false);
      expect(s.action.remove).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps pre-dispatch exclusion retryable without claiming a possible write", async () => {
    const s = setup();
    s.consent();
    s.exclusive.mockResolvedValueOnce(failed());
    expect(await s.controller.remove()).toBe(false);
    expect(s.controller.current()).toMatchObject({ phase: "review", busy: false });
    expect(s.action.remove).not.toHaveBeenCalled();
    expect(await s.controller.remove()).toBe(true);
  });
  it("does not dispatch after ownership is lost inside a delayed mutation boundary", async () => {
    const s = setup();
    s.consent();
    const gate = deferred();
    s.exclusive.mockImplementationOnce(async (vault, work) => {
      await gate.promise;
      return work();
    });
    const writing = s.controller.remove();
    s.permit(false);
    gate.release();
    expect(await writing).toBe(false);
    expect(s.action.remove).not.toHaveBeenCalled();
    expect(s.controller.current().phase).toBe("review");
  });
  it("hides actions during foreign context and preserves original intent on return", async () => {
    const s = setup();
    s.consent();
    const original = s.controller.current();
    s.permit(false);
    expect(s.controller.edit("x")).toBe(false);
    expect(await s.controller.remove()).toBe(false);
    expect(s.controller.current()).toBe(original);
    s.permit(true);
    expect(await s.controller.remove()).toBe(true);
  });
  it("ignores a completion after disposal without claiming cancellation", async () => {
    const s = setup();
    s.consent();
    const pending = deferred();
    s.action.remove.mockReturnValueOnce(pending.promise);
    const writing = s.controller.remove();
    s.controller.dispose();
    const calls = s.changed.mock.calls.length;
    pending.release(result("deleted"));
    expect(await writing).toBe(false);
    expect(s.changed).toHaveBeenCalledTimes(calls);
    expect(s.controller.current()).toBeNull();
    expect(s.controller.start(workspace(), null)).toBe(false);
  });
  it.each(["deleted", "foreign"])(
    "rejects malformed observational acknowledgement %s",
    async (kind) => {
      const s = setup();
      s.consent();
      s.action.remove.mockResolvedValueOnce(failed());
      await s.controller.remove();
      s.action.inspect.mockResolvedValueOnce(
        kind === "deleted"
          ? result("deleted")
          : { ok: true, value: { ...result("absent_complete").value, vaultId: id(9) } },
      );
      expect(await s.controller.inspect()).toBe(false);
      expect(s.controller.current().phase).toBe("uncertain");
      expect(await s.controller.remove()).toBe(false);
    },
  );
  it("bounds exact confirmation and safely closes uncertain review without another write", async () => {
    const s = setup();
    s.consent();
    expect(s.controller.edit("x".repeat(65))).toBe(false);
    s.action.remove.mockRejectedValueOnce(new Error("PRIVATE"));
    await s.controller.remove();
    expect(s.controller.close()).toBe(true);
    expect(s.controller.current()).toBeNull();
    expect(s.action.remove).toHaveBeenCalledTimes(1);
    expect(s.action.inspect).not.toHaveBeenCalled();
  });
});
