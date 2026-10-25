import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createStoredContactUseController } from "../../apps/web/src/stored-contact-use-controller.ts";

const id = (n) => `0198e125-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-25T12:00:00.000Z";
const workspace = () => ({
  specVersion: 1,
  vaultId: id(1),
  contact: {
    id: id(2),
    companyId: null,
    name: "Synthetic contact",
    role: null,
    email: "synthetic@synthetic.example",
    phone: null,
    publicProfileUrl: null,
    confidence: null,
    userConfirmed: false,
    notes: "",
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    rowVersion: 1,
  },
  manualCreation: null,
});
const source = () => ({
  specVersion: 1,
  kind: "source",
  expectedVaultId: id(1),
  sourceSnapshotId: id(3),
  sourceClass: "official_employer_page",
  sourceUrl: "https://synthetic.example/team",
  capturedAt: at,
  literalText: "\uFEFFSynthetic source\0尾",
});
const control = () => ({
  specVersion: 1,
  kind: "disable_policy",
  expectedVaultId: id(1),
  recordId: id(4),
  expectedRowVersion: 1,
  sourceSnapshotId: id(3),
  expectedSourceHash: "a".repeat(64),
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const setup = (mode = "record") => {
  let allowed = true,
    first = null,
    request = null,
    dispatched = false;
  const context = vi.fn(() => ({ operationId: id(90), initiatedAt: at }));
  const receipt = () =>
    mode === "record"
      ? {
          specVersion: 1,
          kind: "source",
          vaultId: id(1),
          recordId: id(3),
          operationId: id(90),
          recordedAt: at,
          sourceSnapshotId: id(3),
          sourceHash: request.sourceHash,
          valueHash: null,
          policyId: null,
          rowVersion: 1,
          fieldRevision: null,
        }
      : {
          specVersion: 1,
          kind: "disable_policy",
          vaultId: id(1),
          recordId: id(4),
          recordedAt: at,
          rowVersion: 2,
        };
  const submitted = vi.fn(async () => ({ ok: true, value: receipt() }));
  const bound = {
    input: null,
    attemptContext: () => first,
    originalRequest: () => request,
    wasDispatched: () => dispatched,
    submit: vi.fn(async () => {
      first ??= context();
      request ??= Object.freeze({
        ...bound.input,
        operationId: first.operationId,
        recordedAt: first.initiatedAt,
        ...(mode === "record"
          ? { sourceHash: createHash("sha256").update(bound.input.literalText).digest("hex") }
          : {}),
      });
      dispatched = true;
      return submitted();
    }),
    inspect: vi.fn(async () => ({
      ok: true,
      value: {
        specVersion: 1,
        kind: bound.input.kind,
        vaultId: id(1),
        recordId: mode === "record" ? id(3) : id(4),
        originalOperationId: id(90),
        state: "matching",
        rowVersion: mode === "record" ? 1 : 2,
        lifecycle: mode === "record" ? "retained" : "disabled",
      },
    })),
  };
  const begin = vi.fn((input) => {
    bound.input = Object.freeze({ ...input });
    return bound;
  });
  const api = { beginRecord: begin, beginControl: begin };
  const changed = vi.fn(),
    exclusive = vi.fn(async (_vault, work) => work());
  const controller = createStoredContactUseController({
    api: () => api,
    changed,
    allowed: () => allowed,
    exclusive,
  });
  return {
    controller,
    bound,
    begin,
    changed,
    exclusive,
    context,
    submitted,
    receipt,
    allow: (value) => {
      allowed = value;
    },
    start: (input = mode === "record" ? source() : control()) =>
      controller.begin(workspace(), null, "email", mode, input),
  };
};

describe("owned normal contact-use action review", () => {
  it.each(["record", "control"])("keeps one immutable original %s while pending", async (mode) => {
    const local = setup(mode),
      held = deferred(),
      input = mode === "record" ? source() : control();
    expect(local.start(input)).toBe(true);
    expect(local.bound.submit).not.toHaveBeenCalled();
    const copied = local.controller.current().input;
    input.expectedVaultId = id(99);
    expect(copied.expectedVaultId).toBe(id(1));
    expect(Object.isFrozen(copied)).toBe(true);
    local.submitted.mockImplementation(() => held.promise);
    const pending = local.controller.submit();
    expect(local.controller.current().busy).toBe(true);
    expect(await local.controller.submit()).toBe(false);
    expect(local.start()).toBe(false);
    expect(local.controller.close(true)).toBe(false);
    held.resolve({ ok: true, value: local.receipt() });
    expect(await pending).toBe(true);
    expect(local.controller.current()).toMatchObject({
      phase: "acknowledged",
      busy: false,
      owner: { vaultId: id(1), contactId: id(2), fieldName: "email" },
    });
    expect(local.bound.submit).toHaveBeenCalledTimes(1);
    expect(local.context).toHaveBeenCalledTimes(1);
    expect(await local.controller.submit()).toBe(false);
  });
  it.each(["record", "control"])(
    "inspects a lost %s acknowledgement without repeating the write",
    async (mode) => {
      const local = setup(mode);
      local.start();
      local.submitted.mockResolvedValue({ ok: false, error: { code: "unavailable" } });
      expect(await local.controller.submit()).toBe(false);
      expect(local.controller.current().phase).toBe("uncertain");
      expect(await local.controller.submit()).toBe(false);
      expect(local.controller.close()).toBe(false);
      expect(await local.controller.inspect()).toBe(true);
      expect(local.controller.current().phase).toBe("matching");
      expect(local.bound.submit).toHaveBeenCalledTimes(1);
      expect(local.bound.inspect).toHaveBeenCalledTimes(1);
      expect(await local.controller.submit()).toBe(false);
      expect(local.controller.close()).toBe(true);
    },
  );
  it.each(["record", "control"])(
    "retries %s only after explicit original-state observation with unchanged IDs/context",
    async (mode) => {
      const local = setup(mode);
      local.start();
      local.submitted.mockResolvedValueOnce({ ok: false, error: { code: "unavailable" } });
      await local.controller.submit();
      const original = local.bound.originalRequest();
      local.bound.inspect.mockResolvedValue({
        ok: true,
        value: {
          specVersion: 1,
          kind: mode === "record" ? "source" : "disable_policy",
          vaultId: id(1),
          recordId: mode === "record" ? id(3) : id(4),
          originalOperationId: id(90),
          state: mode === "record" ? "absent" : "original_present",
          rowVersion: mode === "record" ? null : 1,
          lifecycle: mode === "record" ? null : "enabled",
        },
      });
      expect(await local.controller.inspect()).toBe(false);
      expect(await local.controller.submit()).toBe(true);
      expect(local.bound.originalRequest()).toBe(original);
      expect(local.context).toHaveBeenCalledTimes(1);
      expect(local.begin).toHaveBeenCalledTimes(1);
    },
  );
  it("rechecks ownership after waiting for the vault mutation boundary", async () => {
    const local = setup(),
      held = deferred();
    local.start();
    local.exclusive.mockImplementation(async (_vault, work) => {
      await held.promise;
      return work();
    });
    const pending = local.controller.submit();
    local.allow(false);
    held.resolve();
    expect(await pending).toBe(false);
    expect(local.bound.submit).not.toHaveBeenCalled();
    expect(local.controller.current().phase).toBe("review");
  });
  it("retains an in-flight result under its original owner after navigation", async () => {
    const local = setup(),
      held = deferred();
    local.start();
    local.submitted.mockImplementation(() => held.promise);
    const pending = local.controller.submit();
    local.allow(false);
    held.resolve({ ok: true, value: local.receipt() });
    expect(await pending).toBe(true);
    expect(local.controller.current().owner.contactId).toBe(id(2));
    expect(local.controller.current().owner.vaultId).toBe(id(1));
  });
  it("retires late publication on session/API disposal without pretending to cancel storage", async () => {
    const local = setup(),
      held = deferred();
    local.start();
    local.submitted.mockImplementation(() => held.promise);
    const pending = local.controller.submit();
    const changed = local.changed.mock.calls.length;
    local.controller.dispose();
    held.resolve({ ok: true, value: local.receipt() });
    expect(await pending).toBe(false);
    expect(local.changed).toHaveBeenCalledTimes(changed);
    expect(local.bound.submit).toHaveBeenCalledTimes(1);
    expect(local.controller.current()).toBeNull();
  });
  it("rejects foreign vault, field, contact version and company scope before binding", () => {
    const local = setup();
    expect(local.start({ ...source(), expectedVaultId: id(99) })).toBe(false);
    expect(local.controller.begin(workspace(), id(99), "email", "record", source())).toBe(false);
    expect(
      local.controller.begin(workspace(), null, "phone", "control", {
        specVersion: 1,
        kind: "revoke_review",
        expectedVaultId: id(1),
        recordId: id(4),
        expectedRowVersion: 1,
        contactId: id(2),
        expectedContactRowVersion: 1,
        fieldName: "email",
      }),
    ).toBe(false);
    expect(
      local.controller.begin(workspace(), null, "email", "control", {
        specVersion: 1,
        kind: "revoke_review",
        expectedVaultId: id(1),
        recordId: id(4),
        expectedRowVersion: 1,
        contactId: id(2),
        expectedContactRowVersion: 2,
        fieldName: "email",
      }),
    ).toBe(false);
    expect(local.begin).not.toHaveBeenCalled();
  });
  it("keeps a forged acknowledgement uncertain and redacts private failures", async () => {
    const local = setup();
    local.start();
    local.submitted.mockImplementation(async () => ({
      ok: true,
      value: { ...local.receipt(), vaultId: id(99) },
    }));
    expect(await local.controller.submit()).toBe(false);
    expect(local.controller.current().phase).toBe("uncertain");
    local.bound.inspect.mockRejectedValue(new Error("PRIVATE SQL/source body"));
    expect(await local.controller.inspect()).toBe(false);
    expect(JSON.stringify(local.controller.current().error)).not.toContain("PRIVATE");
  });
  it("requires explicit discard for unresolved state and never rebinds the action", async () => {
    const local = setup();
    local.start();
    local.submitted.mockRejectedValue(new Error("PRIVATE"));
    await local.controller.submit();
    expect(local.controller.close()).toBe(false);
    expect(local.controller.close(true)).toBe(true);
    expect(local.controller.current()).toBeNull();
    expect(local.begin).toHaveBeenCalledTimes(1);
  });
});
