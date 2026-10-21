import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createVaultExportSession } from "../../apps/web/src/vault-export-session.ts";
import { createBrowserVaultExportHandoff } from "../../apps/web/src/browser-vault-export-handoff.ts";

const ownerId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const bytes = new Uint8Array([1, 2, 3]);
const artifact = () => ({
  state: "prepared_not_saved",
  vaultId: ownerId,
  archiveId,
  createdAt: "2026-10-21T06:00:00.000Z",
  schemaVersion: 160,
  fileName: `coredrill-20261021-${archiveId}.coredrill.zip`,
  mediaType: "application/zip",
  encryptionMode: "none",
  byteLength: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  dataFileCount: 114,
  attachmentCount: 1,
  bytes: bytes.slice(),
});
const setup = (save = vi.fn(async () => ({ status: "download_handoff" }))) => {
  const prepare = vi.fn(async () => ({ ok: true, value: artifact() }));
  const onChange = vi.fn();
  const session = createVaultExportSession({ ownerId, prepare, save, onChange });
  return { session, prepare, save, onChange };
};
const prepared = async (save) => {
  const result = setup(save);
  result.session.setConsent(true);
  expect(await result.session.prepare()).toBe(true);
  return result;
};
describe("owned normal export session", () => {
  it("captures its owner and ports instead of rebasing mutable constructor options", async () => {
    const prepare = vi.fn(async () => ({ ok: true, value: artifact() }));
    const onChange = vi.fn();
    const replacement = vi.fn();
    const options = { ownerId, prepare, onChange };
    const session = createVaultExportSession(options);
    options.ownerId = archiveId;
    options.prepare = replacement;
    options.onChange = replacement;
    session.setConsent(true);
    expect(await session.prepare()).toBe(true);
    expect(prepare).toHaveBeenCalledExactlyOnceWith({
      vaultId: ownerId,
      acknowledgeUnencrypted: true,
    });
    expect(session.current().ownerId).toBe(ownerId);
    expect(onChange).toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  });
  it("requires consent and publishes only one metadata view, never archive bytes", async () => {
    const { session, prepare, onChange } = setup();
    expect(await session.prepare()).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    session.setConsent(true);
    expect(await session.prepare()).toBe(true);
    expect(prepare).toHaveBeenCalledExactlyOnceWith({
      vaultId: ownerId,
      acknowledgeUnencrypted: true,
    });
    expect(session.current()).toMatchObject({
      ownerId,
      phase: "prepared",
      busy: false,
      metadata: { archiveId, attachmentCount: 1 },
    });
    expect(session.current().metadata).not.toHaveProperty("bytes");
    for (const [state] of onChange.mock.calls)
      if (state.metadata !== null) expect(state.metadata).not.toHaveProperty("bytes");
    expect(await session.prepare()).toBe(false);
    expect(session.setConsent(false)).toBe(false);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("blocks duplicate preparation/save/deletion and ignores a disposed late result", async () => {
    const { session, prepare, save, onChange } = setup();
    let release;
    prepare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    session.setConsent(true);
    const pending = session.prepare();
    expect(await session.prepare()).toBe(false);
    expect(await session.save()).toBe(false);
    const deletion = vi.fn();
    expect(await session.runVaultMutation(ownerId, deletion)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(deletion).not.toHaveBeenCalled();
    expect(session.discard()).toBe(false);
    const count = onChange.mock.calls.length;
    session.dispose();
    release({ ok: true, value: artifact() });
    expect(await pending).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(count);
    expect(save).not.toHaveBeenCalled();
  });
  it.each(["download_handoff", "cancelled", "throw", "forged"])(
    "retains the exact artifact and never invents saved success after %s",
    async (kind) => {
      const save = vi.fn(async (input) => {
        input.bytes.fill(9);
        if (kind === "throw") throw new Error("PRIVATE_SAVE_PATH");
        if (kind === "forged")
          return {
            status: "saved_verified",
            vaultId: ownerId,
            archiveId,
            sha256: "0".repeat(64),
            byteLength: 3,
          };
        return { status: kind };
      });
      const { session } = await prepared(save);
      await session.save();
      expect(session.current().phase).toBe(
        kind === "download_handoff" ? "download_handoff" : "prepared",
      );
      expect(JSON.stringify(session.current())).not.toContain("PRIVATE_SAVE_PATH");
      expect(save).toHaveBeenCalledTimes(1);
      expect(await session.verify({ size: 3, arrayBuffer: async () => bytes.slice().buffer })).toBe(
        true,
      );
      expect(session.current().phase).toBe("saved_copy_verified");
    },
  );
  it("accepts only a fully correlated native save acknowledgement", async () => {
    const { session } = await prepared(
      vi.fn(async (input) => ({
        status: "saved_verified",
        vaultId: input.vaultId,
        archiveId: input.archiveId,
        byteLength: input.byteLength,
        sha256: input.sha256,
      })),
    );
    expect(await session.save()).toBe(true);
    expect(session.current().phase).toBe("saved_copy_verified");
    expect(session.current().message).toContain("not a restore test");
  });
  it("keeps save single-flight with verification, deletion and discard", async () => {
    let release;
    const save = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { session } = await prepared(save);
    const pending = session.save();
    expect(await session.save()).toBe(false);
    const read = vi.fn();
    expect(await session.verify({ size: 3, arrayBuffer: read })).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(session.discard()).toBe(false);
    const deletion = vi.fn();
    expect(await session.runVaultMutation(ownerId, deletion)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(deletion).not.toHaveBeenCalled();
    release({ status: "cancelled" });
    expect(await pending).toBe(false);
    expect(session.current()).toMatchObject({ phase: "prepared", busy: false });
    expect(session.discard()).toBe(true);
  });
  it("does not publish late selected-file verification after owner disposal", async () => {
    const { session, onChange } = await prepared();
    let release;
    const pending = session.verify({
      size: 3,
      arrayBuffer: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    expect(await session.prepare()).toBe(false);
    expect(await session.save()).toBe(false);
    const count = onChange.mock.calls.length;
    session.dispose();
    release(bytes.slice().buffer);
    expect(await pending).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(count);
  });
  it("rejects size before reading and clears a prior verification on mismatch", async () => {
    const { session } = await prepared();
    await session.verify({ size: 3, arrayBuffer: async () => bytes.slice().buffer });
    const read = vi.fn();
    expect(await session.verify({ size: 4, arrayBuffer: read })).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(session.current().phase).toBe("prepared");
    expect(
      await session.verify({ size: 3, arrayBuffer: async () => new Uint8Array([3, 2, 1]).buffer }),
    ).toBe(false);
    expect(session.current().phase).toBe("prepared");
  });
  it("keeps mutation acknowledgement but suppresses disposed publication", async () => {
    const { session, onChange } = setup();
    let release;
    const pending = session.runVaultMutation(
      ownerId,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    expect(session.setConsent(true)).toBe(false);
    const count = onChange.mock.calls.length;
    session.dispose();
    release({ ok: true, value: "acknowledged" });
    expect(await pending).toEqual({ ok: true, value: "acknowledged" });
    expect(onChange).toHaveBeenCalledTimes(count);
  });
  it("rejects foreign ownership, redacts read/preparation errors and never retries", async () => {
    const { session, prepare } = setup();
    session.setConsent(true);
    prepare.mockResolvedValueOnce({ ok: true, value: { ...artifact(), vaultId: archiveId } });
    expect(await session.prepare()).toBe(false);
    expect(session.current().metadata).toBeNull();
    prepare.mockRejectedValueOnce(new Error("PRIVATE_PATH"));
    expect(await session.prepare()).toBe(false);
    expect(JSON.stringify(session.current())).not.toContain("PRIVATE_PATH");
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(await session.runVaultMutation(archiveId, vi.fn())).toMatchObject({ ok: false });
  });
  it("has no native browser-download fallback", () => {
    expect(createBrowserVaultExportHandoff("native")).toBeUndefined();
    expect(typeof createBrowserVaultExportHandoff("browser")).toBe("function");
  });
});
