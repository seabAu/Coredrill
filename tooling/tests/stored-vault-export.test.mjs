import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PortableVaultArchiveError,
  writePortableArchiveV1,
} from "../../packages/storage-core/dist/index.js";
import { createStoredVaultExportApi } from "../../apps/web/src/stored-vault-export.ts";

const { prepare, verification } = vi.hoisted(() => ({
  prepare: vi.fn(),
  verification: { read: vi.fn(), record: vi.fn(), updateReminder: vi.fn() },
}));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  preparePortableVaultArchiveV1: prepare,
  createSqliteVaultExportVerificationPort: () => verification,
}));
const vaultId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const createdAt = "2026-10-21T06:00:00.000Z";
const input = () => ({ vaultId, acknowledgeUnencrypted: true });
const observation = (method = "selected_local_copy") => ({
  archiveId,
  archiveCreatedAt: "2026-10-21T04:00:00.000Z",
  verifiedAt: "2026-10-21T05:00:00.000Z",
  schemaVersion: 160,
  byteLength: 1024,
  sha256: "a".repeat(64),
  method,
});
const verificationView = (observations = []) => ({
  history: { version: 1, vaultId, observations },
  reminder: {
    version: 1,
    enabled: true,
    lastSuccessfulExportAtUnixMs: null,
    snoozedUntilUnixMs: null,
  },
});
const setup = (savePort) => {
  const database = {};
  const open = vi.fn(async () => database);
  const read = vi.fn();
  const store = vi.fn(async () => ({ read }));
  return {
    database,
    open,
    read,
    store,
    api: createStoredVaultExportApi(
      open,
      store,
      () => ({ operationId: archiveId, initiatedAt: createdAt }),
      "0.0.0",
      savePort,
    ),
  };
};
beforeEach(() => {
  prepare.mockReset();
  verification.read.mockReset().mockImplementation(async () => verificationView());
  verification.record
    .mockReset()
    .mockImplementation(async (input) => verificationView([input.observation]));
  verification.updateReminder.mockReset().mockImplementation(async () => verificationView());
  // Mock composition acknowledgement; actual SQLite/ZIP is independently exercised.
  prepare.mockImplementation(async (request) => {
    const bytes = new globalThis.TextEncoder().encode("synthetic database payload");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return writePortableArchiveV1({
      archiveId: request.archiveId,
      createdAt: request.createdAt,
      createdByVersion: request.createdByVersion,
      vault: {
        id: request.vaultId,
        schemaVersion: 1,
        migrationHistory: [
          { version: 1, name: "initial", appliedAt: createdAt, sha256: "a".repeat(64) },
        ],
      },
      database: { bytes, byteLength: bytes.length, schemaVersion: 1, sha256 },
      dataFiles: [
        {
          path: "data/vault.json",
          mediaType: "application/json",
          format: "json",
          logicalName: "vault",
          bytes: new Uint8Array([123, 125]),
        },
        {
          path: "data/vault.csv",
          mediaType: "text/csv",
          format: "csv",
          logicalName: "vault",
          bytes: new Uint8Array([105, 100, 13, 10]),
        },
      ],
      attachments: [],
      readAttachment: async () => undefined,
    });
  });
});
describe("lazy normal vault export preparation runtime", () => {
  it("exposes explicit preparation/save and binds preparation to the selected database, store and app version", async () => {
    const { api, database, open, store, read } = setup();
    expect(Object.keys(api)).toEqual([
      "prepare",
      "save",
      "readVerifications",
      "recordVerification",
      "updateReminder",
    ]);
    expect(await api.prepare(input())).toMatchObject({
      ok: true,
      value: { state: "prepared_not_saved", vaultId, archiveId, createdAt, encryptionMode: "none" },
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledTimes(1);
    const request = prepare.mock.calls[0][0];
    expect(request).toMatchObject({
      database,
      vaultId,
      archiveId,
      createdAt,
      createdByVersion: "0.0.0",
    });
    await request.readAttachment("a".repeat(64));
    expect(read).toHaveBeenCalledExactlyOnceWith("a".repeat(64));
    expect(verification.record).not.toHaveBeenCalled();
  });
  it("reads original-vault evidence and updates preferences lazily without opening attachment storage", async () => {
    const { api, open, store } = setup();
    expect(open).not.toHaveBeenCalled();
    expect(await api.readVerifications({ vaultId })).toMatchObject({
      ok: true,
      value: verificationView(),
    });
    expect(verification.read).toHaveBeenCalledExactlyOnceWith({ vaultId });
    expect(await api.updateReminder({ vaultId, action: "disable" })).toMatchObject({ ok: true });
    expect(verification.updateReminder).toHaveBeenCalledExactlyOnceWith({
      vaultId,
      action: "disable",
      updatedAt: createdAt,
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(store).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "records only the selected runtime's byte-verification method (native=%s)",
    async (native) => {
      const { api, open, store } = setup(native ? { save: vi.fn() } : undefined);
      const method = native ? "native_readback" : "selected_local_copy";
      expect(
        await api.recordVerification({
          vaultId,
          observation: observation(native ? "selected_local_copy" : "native_readback"),
        }),
      ).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(open).not.toHaveBeenCalled();
      expect(
        await api.recordVerification({ vaultId, observation: observation(method) }),
      ).toMatchObject({ ok: true });
      expect(verification.record).toHaveBeenCalledExactlyOnceWith({
        vaultId,
        observation: observation(method),
        recordedAt: createdAt,
      });
      expect(store).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed history requests before opening storage and redacts read failure", async () => {
    const { api, open, store } = setup();
    expect(await api.readVerifications({ vaultId: "invalid" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(
      await api.recordVerification({
        vaultId,
        observation: { ...observation(), path: "PRIVATE_PATH" },
      }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(await api.updateReminder({ vaultId, action: "record-success" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(open).not.toHaveBeenCalled();
    verification.read.mockRejectedValueOnce(new Error("PRIVATE_SQL_PATH"));
    const result = await api.readVerifications({ vaultId });
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SQL_PATH");
    expect(store).not.toHaveBeenCalled();
  });
  it.each([
    { vaultId },
    { ...input(), acknowledgeUnencrypted: false },
    { ...input(), vaultId: "invalid" },
    { ...input(), destination: "PRIVATE_PATH" },
  ])("rejects invalid intent before opening either runtime store: %j", async (request) => {
    const { api, open, store } = setup();
    expect(await api.prepare(request)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(open).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("revalidates the complete ZIP and manifest ownership before the native save port", async () => {
    const save = vi.fn(async (value) => ({
      status: "saved_verified",
      vaultId: value.vaultId,
      archiveId: value.archiveId,
      byteLength: value.byteLength,
      sha256: value.sha256,
    }));
    const { api } = setup({ save });
    const prepared = await api.prepare(input());
    expect(prepared.ok).toBe(true);
    const artifact = prepared.value;
    const intent = {
      vaultId,
      archiveId,
      schemaVersion: artifact.schemaVersion,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      acknowledgeUnencrypted: true,
    };
    expect(await api.save(intent)).toMatchObject({
      ok: true,
      value: { status: "saved_verified", archiveId },
    });
    expect(save).toHaveBeenCalledTimes(1);
    save.mockClear();
    expect(await api.save({ ...intent, vaultId: archiveId })).toMatchObject({ ok: false });
    const forged = new Uint8Array(40).fill(65);
    forged.set([80, 75, 3, 4]);
    expect(
      await api.save({
        ...intent,
        bytes: forged,
        byteLength: forged.length,
        sha256: createHash("sha256").update(forged).digest("hex"),
      }),
    ).toMatchObject({ ok: false });
    expect(save).not.toHaveBeenCalled();
  });
  it("has no native-save fallback in a runtime without the save port", async () => {
    const { api, open, store } = setup();
    const bytes = new Uint8Array(40).fill(65);
    expect(
      await api.save({
        vaultId,
        archiveId,
        schemaVersion: 160,
        byteLength: bytes.length,
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        acknowledgeUnencrypted: true,
      }),
    ).toMatchObject({ ok: false, error: { code: "unavailable", retryable: false } });
    expect(open).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
  it("copies original identity before a held database open", async () => {
    const { api, open, database } = setup();
    let release;
    open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = input();
    const pending = api.prepare(request);
    request.vaultId = archiveId;
    release(database);
    expect(await pending).toMatchObject({ ok: true, value: { vaultId } });
  });
  it("maps source drift to conflict without automatic retry", async () => {
    prepare.mockRejectedValue(new PortableVaultArchiveError("source_changed"));
    const { api } = setup();
    expect(await api.prepare(input())).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: false },
    });
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it.each(["database", "attachments", "assembly"])(
    "redacts %s failure without fallback or retry",
    async (stage) => {
      const { api, open, store } = setup();
      const error = new Error("PRIVATE_RUNTIME_PATH");
      if (stage === "database") open.mockRejectedValueOnce(error);
      else if (stage === "attachments") store.mockRejectedValueOnce(error);
      else prepare.mockRejectedValueOnce(error);
      const result = await api.prepare(input());
      expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_RUNTIME_PATH");
      expect(open).toHaveBeenCalledTimes(1);
      if (stage === "database") expect(store).not.toHaveBeenCalled();
      if (stage === "assembly") expect(prepare).toHaveBeenCalledTimes(1);
    },
  );
});
