import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PortableVaultArchiveError,
  writePortableArchiveV1,
} from "../../packages/storage-core/dist/index.js";
import { createStoredVaultExportApi } from "../../apps/web/src/stored-vault-export.ts";

const { prepare } = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("../../packages/storage-core/dist/index.js", async (original) => ({
  ...(await original()),
  preparePortableVaultArchiveV1: prepare,
}));
const vaultId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const createdAt = "2026-10-21T06:00:00.000Z";
const input = () => ({ vaultId, acknowledgeUnencrypted: true });
const setup = () => {
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
    ),
  };
};
beforeEach(() => {
  prepare.mockReset();
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
  it("exposes preparation only and binds the selected database, store and app version", async () => {
    const { api, database, open, store, read } = setup();
    expect(Object.keys(api)).toEqual(["prepare"]);
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
