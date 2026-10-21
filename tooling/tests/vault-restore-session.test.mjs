import { describe, expect, it, vi } from "vitest";
import { createVaultRestoreSession } from "../../apps/web/src/vault-restore-session.ts";
import { createVaultExportSession } from "../../apps/web/src/vault-export-session.ts";

const ownerId = "0198e102-0000-7000-8000-000000000001";
const previewId = "0198e102-0000-7000-8000-000000000002";
const different = "0198e102-0000-7000-8000-000000000003";
const view = (owner = ownerId) => ({
  version: 1,
  previewId,
  viewedVaultId: owner,
  archive: {
    databaseSha256: "c".repeat(64),
    vaultId: different,
    sha256: "a".repeat(64),
    byteLength: 32,
    schemaVersion: 160,
    createdAt: "2026-10-21T08:00:00.000Z",
    createdByVersion: "0.0.0",
    dataFileCount: 0,
    attachmentCount: 0,
  },
  target: {
    state: owner === null ? "empty" : "present",
    fingerprint: owner === null ? "empty" : "b".repeat(64),
    vaultId: owner,
    schemaVersion: owner === null ? null : 160,
    attachmentCount: 0,
  },
  conflict: owner === null ? "none" : "different_vault_replace",
  requiredConfirmation: owner === null ? "commit" : "replace_different_vault",
  changes: {
    database: owner === null ? "create" : "replace",
    attachmentsAdded: 0,
    attachmentsRemoved: 0,
    attachmentsReused: 0,
  },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
const selected = () => ({ size: 32, arrayBuffer: vi.fn(async () => new ArrayBuffer(32)) });
const setup = ({ owner = ownerId, runtime = "browser", exclusive } = {}) => {
  const api = {
    preview: vi.fn(async () => ({ ok: true, value: view(owner) })),
    commit: vi.fn(async () => ({ ok: true, value: { committed: true } })),
    discard: vi.fn(async () => ({ ok: true, value: { discarded: true } })),
    selectNative: vi.fn(async () => ({
      ok: true,
      value: { status: "selected", bytes: new Uint8Array(32) },
    })),
  };
  const onChange = vi.fn();
  const session = createVaultRestoreSession({ ownerId: owner, runtime, api, onChange, exclusive });
  return { api, session, onChange };
};
describe("root-owned normal restore session", () => {
  it.each([null, ownerId])(
    "reviews owner %s without committing or exposing bytes and requires an exact confirmation",
    async (owner) => {
      const { session, api, onChange } = setup({ owner });
      expect(await session.commit()).toBe(false);
      expect(await session.select(selected())).toBe(true);
      expect(api.preview).toHaveBeenCalledWith({ viewedVaultId: owner, bytes: new Uint8Array(32) });
      expect(api.commit).not.toHaveBeenCalled();
      expect(await session.commit()).toBe(false);
      session.confirm(true);
      expect(await session.commit()).toBe(true);
      expect(api.commit).toHaveBeenCalledWith({
        preview: view(owner),
        confirmation: owner === null ? "commit" : "replace_different_vault",
      });
      expect(session.current()).toMatchObject({ phase: "reopen", preview: null, busy: false });
      expect(await session.commit()).toBe(false);
      expect(await session.select(selected())).toBe(false);
      for (const [state] of onChange.mock.calls) {
        expect(JSON.stringify(state)).not.toMatch(/bytes|arrayBuffer|private-path/);
        expect(Object.isFrozen(state)).toBe(true);
      }
    },
  );
  it("rejects invalid and changing file sizes before preview and redacts file read failures", async () => {
    const { session, api } = setup();
    for (const size of [0, 21, 544 * 1024 * 1024 + 1, NaN, 22.5]) {
      const file = { size, arrayBuffer: vi.fn() };
      expect(await session.select(file)).toBe(false);
      expect(file.arrayBuffer).not.toHaveBeenCalled();
      expect(session.current()).toMatchObject({
        phase: "idle",
        busy: false,
        message: "Archive review stopped. No restore was submitted.",
      });
    }
    expect(await session.select({ size: 32, arrayBuffer: async () => new ArrayBuffer(31) })).toBe(
      false,
    );
    expect(
      await session.select({
        size: 32,
        arrayBuffer: async () => {
          throw new Error("private-path");
        },
      }),
    ).toBe(false);
    expect(api.preview).not.toHaveBeenCalled();
    expect(session.current().error).not.toContain("private-path");
    expect(session.current().message).toBe("Archive review stopped. No restore was submitted.");
  });
  it("guards duplicate handlers synchronously and disposes late previews with their original owner", async () => {
    const { session, api, onChange } = setup();
    const gate = deferred();
    api.preview.mockReturnValueOnce(gate.promise);
    const pending = session.select(selected());
    await vi.waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));
    expect(await session.select(selected())).toBe(false);
    expect(await session.discard()).toBe(false);
    const count = onChange.mock.calls.length;
    session.dispose();
    gate.resolve({ ok: true, value: view() });
    expect(await pending).toBe(false);
    expect(api.discard).toHaveBeenCalledExactlyOnceWith({ previewId, viewedVaultId: ownerId });
    expect(onChange).toHaveBeenCalledTimes(count);
    expect(api.commit).not.toHaveBeenCalled();
  });
  it("never previews after disposal during file reading", async () => {
    const { session, api } = setup();
    const gate = deferred();
    const pending = session.select({ size: 32, arrayBuffer: () => gate.promise });
    session.dispose();
    gate.resolve(new ArrayBuffer(32));
    expect(await pending).toBe(false);
    expect(api.preview).not.toHaveBeenCalled();
  });
  it("retains a failed discard and resets confirmation only after acknowledged retirement", async () => {
    const { session, api } = setup();
    await session.select(selected());
    session.confirm(true);
    api.discard.mockResolvedValueOnce({ ok: false, error: { message: "private-path" } });
    expect(await session.discard()).toBe(false);
    expect(await session.select(selected())).toBe(false);
    expect(session.current().error).not.toContain("private-path");
    expect(await session.discard()).toBe(true);
    expect(session.current()).toMatchObject({ preview: null, confirmed: false, phase: "idle" });
    expect(await session.select(selected())).toBe(true);
    expect(await session.commit()).toBe(false);
  });
  it.each([false, true])(
    "requires local reopen, never automatic retry, after commit uncertainty throw=%s",
    async (throws) => {
      const { session, api } = setup();
      await session.select(selected());
      session.confirm(true);
      if (throws) api.commit.mockRejectedValueOnce(new Error("private-path"));
      else
        api.commit.mockResolvedValueOnce({
          ok: false,
          error: { code: "unavailable", message: "The vault may have changed." },
        });
      expect(await session.commit()).toBe(false);
      expect(session.current()).toMatchObject({ phase: "reopen", preview: null, confirmed: false });
      expect(session.current().message).toBe(
        "Restore was not confirmed. The vault may have changed. Reload local storage before a new review; no automatic retry will occur.",
      );
      expect(session.current().error).not.toContain("private-path");
      expect(await session.commit()).toBe(false);
      expect(await session.discard()).toBe(false);
      expect(api.commit).toHaveBeenCalledTimes(1);
    },
  );
  it("uses native selection without File fallback and treats cancellation as no restore", async () => {
    const { session, api } = setup({ runtime: "native" });
    expect(await session.select(selected())).toBe(false);
    api.selectNative.mockResolvedValueOnce({ ok: true, value: { status: "cancelled" } });
    expect(await session.select()).toBe(false);
    expect(api.preview).not.toHaveBeenCalled();
    expect(session.current().message).toContain("cancelled");
    expect(await session.select()).toBe(true);
    expect(api.preview).toHaveBeenCalledTimes(1);
  });
  it("shares the export/deletion mutex for the entire read and retains a review when commit cannot enter", async () => {
    const exported = createVaultExportSession({ ownerId, prepare: vi.fn(), onChange: vi.fn() });
    const { session, api } = setup({
      exclusive: (work) => exported.runVaultMutation(ownerId, work),
    });
    const gate = deferred();
    const reading = session.select({ size: 32, arrayBuffer: () => gate.promise });
    const deletion = vi.fn();
    expect((await exported.runVaultMutation(ownerId, deletion)).ok).toBe(false);
    expect(deletion).not.toHaveBeenCalled();
    gate.resolve(new ArrayBuffer(32));
    expect(await reading).toBe(true);
    session.confirm(true);
    const held = deferred();
    const mutating = exported.runVaultMutation(ownerId, () => held.promise);
    expect(await session.commit()).toBe(false);
    expect(session.current().phase).toBe("review");
    expect(session.current().message).toBe(
      "Restore was not submitted. Review these changes before trying again.",
    );
    expect(api.commit).not.toHaveBeenCalled();
    held.resolve({ ok: true, value: null });
    await mutating;
    expect(await session.commit()).toBe(true);
  });
  it("ends a thrown pre-submit mutex operation with a retained review and no commit", async () => {
    const exclusive = vi.fn(async (work) => work());
    const { session, api } = setup({ exclusive });
    await session.select(selected());
    session.confirm(true);
    exclusive.mockRejectedValueOnce(new Error("private-path"));
    expect(await session.commit()).toBe(false);
    expect(session.current()).toMatchObject({
      phase: "review",
      busy: false,
      confirmed: true,
      message: "Restore was not submitted. Review these changes before trying again.",
    });
    expect(session.current().preview).toEqual(view());
    expect(session.current().error).not.toContain("private-path");
    expect(api.commit).not.toHaveBeenCalled();
    expect(await session.commit()).toBe(true);
    expect(api.commit).toHaveBeenCalledTimes(1);
  });
  it("reports failed file reads through the real mutation mutex as stopped before submission, not an uncertain write", async () => {
    const exported = createVaultExportSession({ ownerId, prepare: vi.fn(), onChange: vi.fn() });
    const { session, api } = setup({
      exclusive: (work) => exported.runVaultMutation(ownerId, work),
    });
    expect(
      await session.select({
        size: 32,
        arrayBuffer: async () => {
          throw new Error("private-path");
        },
      }),
    ).toBe(false);
    expect(session.current()).toMatchObject({
      phase: "idle",
      busy: false,
      message: "Archive review stopped. No restore was submitted.",
      error: "The selected archive could not be reviewed. No restore was submitted.",
    });
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.commit).not.toHaveBeenCalled();
    expect(exported.current().busy).toBe(false);
    expect(await session.select(selected())).toBe(true);
  });
  it.each(["preview", "native-selection"])(
    "ends an unexpected %s failure without an ongoing status or implicit retry",
    async (failure) => {
      const { session, api } = setup({ runtime: failure === "preview" ? "browser" : "native" });
      if (failure === "preview") api.preview.mockRejectedValueOnce(new Error("private-path"));
      else api.selectNative.mockRejectedValueOnce(new Error("private-path"));
      expect(await session.select(failure === "preview" ? selected() : undefined)).toBe(false);
      expect(session.current()).toMatchObject({
        phase: "idle",
        busy: false,
        preview: null,
        confirmed: false,
        message: "Archive review stopped. No restore was submitted.",
      });
      expect(session.current().error).not.toContain("private-path");
      expect(api.commit).not.toHaveBeenCalled();
      expect(api.selectNative).toHaveBeenCalledTimes(failure === "preview" ? 0 : 1);
      expect(api.preview).toHaveBeenCalledTimes(failure === "preview" ? 1 : 0);
    },
  );
});
